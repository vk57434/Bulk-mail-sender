const fs = require('fs');
const csv = require('csv-parser');
const Recipient = require('../models/Recipient');
const Suppression = require('../models/Suppression');
const Campaign = require('../models/Campaign');
const config = require('../config/env');
const { normalizeEmail, isValidEmail } = require('../utils/emailValidator');
const logger = require('../utils/logger');
const { recalculateCampaignCounters } = require('./campaign.service');
const { cleanDepartment, inspectDepartments, filterRowsByDepartments } = require('../utils/department-filter');

async function readCsvRows(filePath) {
  const rows = [];
  await new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .pipe(csv({ skipEmptyLines: true, trim: true }))
      .on('data', (row) => rows.push(row))
      .on('end', resolve)
      .on('error', reject);
  });
  return rows;
}

function validateRows(rows, existingEmails = new Set(), suppressedEmails = new Set(), campaign = null) {
  const stats = {
    totalRows: 0,
    valid: 0,
    duplicates: 0,
    invalid: 0,
    suppressed: 0,
    errors: [],
  };
  const createdEntries = [];
  const seenInCsv = new Set();
  for (const [rowIndex, row] of rows.entries()) {
    stats.totalRows += 1;
    const name = String(row.name || '').trim();
    const email = normalizeEmail(row.email || '');
    const department = cleanDepartment(row.department);
    const rowNumber = rowIndex + 2;

    if (!email || !isValidEmail(email)) {
      stats.invalid += 1;
      stats.errors.push({
        row: rowNumber,
        name,
        email: row.email || '',
        error: 'Invalid email address',
      });
      continue;
    }

    if (seenInCsv.has(email) || existingEmails.has(email)) {
      stats.duplicates += 1;
      stats.errors.push({
        row: rowNumber,
        name,
        email,
        error: 'Duplicate email address',
      });
      continue;
    }

    if (suppressedEmails.has(email)) {
      stats.suppressed += 1;
      stats.errors.push({
        row: rowNumber,
        name,
        email,
        error: 'Email is suppressed',
      });
      continue;
    }

    seenInCsv.add(email);
    createdEntries.push({
      campaignId: campaign?._id,
      userId: campaign?.userId || null,
      email,
      name,
      department,
      status: 'pending',
      queuedAt: new Date(),
    });
    stats.valid += 1;
  }

  return { ...stats, createdEntries };
}

function hasValidationErrors(stats) {
  return stats.invalid > 0 || stats.duplicates > 0 || stats.suppressed > 0;
}

async function getSuppressedEmails() {
  return new Set((await Suppression.find({}).select('email')).map((record) => record.email));
}

function summarizeDepartments(rows, selection = null) {
  const detected = inspectDepartments(rows);
  const departments = detected.departments.map((department) => ({
    name: department.name,
    key: department.key,
    count: department.count,
    samples: department.samples,
  }));
  if (detected.unassignedCount > 0 && detected.departments.length > 0) {
    departments.push({
      name: '',
      label: 'No department',
      key: '',
      count: detected.unassignedCount,
      samples: detected.unassignedSamples,
    });
  }
  return {
    departments,
    hasDepartments: detected.departments.length > 0,
    unassignedCount: detected.unassignedCount,
    selectedDepartments: selection?.selectedDepartments || [],
    selectedRecipientCount: selection?.selectedRows.length ?? 0,
    excludedRecipientCount: selection?.excludedCount ?? rows.length,
  };
}

async function validateRecipientsFromCsv(filePath, selectedDepartments) {
  const rows = await readCsvRows(filePath);
  const detected = inspectDepartments(rows);
  const hasDepartments = detected.departments.length > 0;
  const selection = hasDepartments
    ? filterRowsByDepartments(rows, selectedDepartments)
    : { selectedRows: rows, selectedDepartments: [], excludedCount: 0 };
  const validation = validateRows(selection.selectedRows, new Set(), await getSuppressedEmails());
  validation.totalRows = rows.length;
  logger.info({ totalRows: validation.totalRows }, '[CSV] Parsed rows');
  logger.info({ valid: validation.valid }, '[CSV] Valid recipients');
  logger.info({ invalid: validation.invalid }, '[CSV] Invalid recipients');
  const stats = { ...validation };
  delete stats.createdEntries;
  return { ...stats, ...summarizeDepartments(rows, selection), hasDepartments, selectionRequired: false };
}

async function importRecipientsFromCsv(filePath, campaignId, { allowInvalid = false, selectedDepartments } = {}) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) {
    throw Object.assign(new Error('Campaign not found'), { statusCode: 404, code: 'CAMPAIGN_NOT_FOUND' });
  }

  const existingRecipients = await Recipient.find({ campaignId }).select('email');
  const existingEmails = new Set(existingRecipients.map((recipient) => recipient.email));
  const rows = await readCsvRows(filePath);
  const detected = inspectDepartments(rows);
  const selection = detected.departments.length > 0
    ? filterRowsByDepartments(rows, selectedDepartments)
    : { selectedRows: rows, selectedDepartments: [], excludedCount: 0 };
  const validation = validateRows(selection.selectedRows, existingEmails, await getSuppressedEmails(), campaign);
  validation.totalRows = rows.length;
  const { createdEntries } = validation;
  const stats = { ...validation };
  delete stats.createdEntries;

  logger.info({ campaignId, totalRows: stats.totalRows }, '[CSV] Parsed rows');
  logger.info({ campaignId, valid: stats.valid }, '[CSV] Valid recipients');
  logger.info({ campaignId, invalid: stats.invalid }, '[CSV] Invalid recipients');

  if (hasValidationErrors(stats) && !allowInvalid) {
    throw Object.assign(new Error('CSV contains rows that require review'), {
      statusCode: 422,
      code: 'CSV_VALIDATION_FAILED',
      details: stats,
    });
  }

  const maxAllowed = Number(config.maxRecipientsPerCampaign || 10000);
  const currentTotal = await Recipient.countDocuments({ campaignId });
  const remainingSlots = Math.max(0, maxAllowed - currentTotal);

  if (createdEntries.length > remainingSlots) {
    const trimmed = createdEntries.length - remainingSlots;
    createdEntries.splice(remainingSlots);
    stats.valid -= trimmed;
    stats.errors.push({ error: `Recipient limit exceeded; ${trimmed} valid rows were not imported` });
  }

  if (createdEntries.length > 0) {
    createdEntries.forEach((entry, index) => {
      entry.sequence = currentTotal + index;
    });
    await Recipient.insertMany(createdEntries, { ordered: false });
  }

  const campaignDepartments = [...new Set([
    ...(campaign.selectedDepartments || []),
    ...selection.selectedDepartments.map((department) => department || 'No department'),
  ])];
  campaign.csvRecipientCount = Number(campaign.csvRecipientCount || 0) + rows.length;
  campaign.selectedRecipientCount = Number(campaign.selectedRecipientCount || 0) + selection.selectedRows.length;
  campaign.excludedRecipientCount = Number(campaign.excludedRecipientCount || 0) + selection.excludedCount;
  campaign.selectedDepartments = campaignDepartments;
  await campaign.save();

  logger.info({ campaignId, imported: createdEntries.length }, 'Recipients imported');
  await recalculateCampaignCounters(campaignId);

  return {
    ...stats,
    ...summarizeDepartments(rows, selection),
    hasDepartments: detected.departments.length > 0,
    campaignId,
  };
}

async function getRecipientsByCampaign(campaignId, { status, page = 1, limit = 50 }) {
  const safeLimit = Math.min(Number(limit) || 50, 100);
  const safePage = Math.max(Number(page) || 1, 1);

  const filter = { campaignId };
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    Recipient.find(filter)
      .sort({ createdAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean(),
    Recipient.countDocuments(filter),
  ]);

  return {
    items,
    pagination: {
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit) || 1,
    },
  };
}

module.exports = {
  validateRecipientsFromCsv,
  importRecipientsFromCsv,
  getRecipientsByCampaign,
};
