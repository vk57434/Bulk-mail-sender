const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectDepartments, filterRowsByDepartments } = require('../src/utils/department-filter');

const recipients = [
  { name: 'A', email: 'a@gmail.com', department: ' IT ' },
  { name: 'B', email: 'b@example.com', department: 'it' },
  { name: 'C', email: 'c@example.com', department: 'Marketing' },
  { name: 'D', email: 'd@example.com', department: '   ' },
];

test('detects distinct departments case-insensitively and trims whitespace', () => {
  const result = inspectDepartments(recipients);
  assert.deepEqual(result.departments.map(({ name, count }) => [name, count]), [
    ['IT', 2],
    ['Marketing', 1],
  ]);
  assert.equal(result.unassignedCount, 1);
});

test('filters recipients case-insensitively without inferring email domains', () => {
  const result = filterRowsByDepartments(recipients, ['it']);
  assert.deepEqual(result.selectedRows.map((row) => row.email), ['a@gmail.com', 'b@example.com']);
  assert.equal(result.excludedCount, 2);
  assert.deepEqual(result.selectedDepartments, ['IT']);
});

test('treats an empty selection as no filter and rejects unknown departments', () => {
  const unfiltered = filterRowsByDepartments(recipients, []);
  const omitted = filterRowsByDepartments(recipients);
  assert.equal(unfiltered.selectedRows.length, recipients.length);
  assert.equal(unfiltered.excludedCount, 0);
  assert.equal(omitted.selectedRows.length, recipients.length);
  assert.equal(omitted.excludedCount, 0);
  assert.throws(() => filterRowsByDepartments(recipients, ['Finance']), { code: 'INVALID_DEPARTMENT_SELECTION' });
});

test('preserves legacy CSV rows when no non-empty department values exist', () => {
  const legacyRows = [{ email: 'one@example.com' }, { email: 'two@example.com', department: '' }];
  const result = filterRowsByDepartments(legacyRows, []);
  assert.equal(result.hasDepartments, false);
  assert.equal(result.selectedRows.length, 2);
});

test('allows explicitly selecting recipients with no department in mixed CSVs', () => {
  const result = filterRowsByDepartments(recipients, ['', 'MARKETING']);
  assert.deepEqual(result.selectedRows.map((row) => row.email), ['c@example.com', 'd@example.com']);
  assert.equal(result.excludedCount, 2);
});

test('acceptance case selects only three IT recipients from seven CSV rows', () => {
  const rows = [
    { email: 'it-1@example.com', department: 'IT' },
    { email: 'marketing-1@example.com', department: 'Marketing' },
    { email: 'production-1@example.com', department: 'Production' },
    { email: 'it-2@example.com', department: 'it' },
    { email: 'marketing-2@example.com', department: 'MARKETING' },
    { email: 'it-3@example.com', department: ' It ' },
    { email: 'production-2@example.com', department: 'production' },
  ];
  const result = filterRowsByDepartments(rows, ['IT']);
  assert.deepEqual(result.selectedRows.map((row) => row.email), [
    'it-1@example.com',
    'it-2@example.com',
    'it-3@example.com',
  ]);
  assert.equal(result.selectedRows.length, 3);
  assert.equal(result.excludedCount, 4);
});