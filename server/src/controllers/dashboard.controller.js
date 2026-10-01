const Email = require('../models/Email');
const EmailAccount = require('../models/EmailAccount');
const Campaign = require('../models/Campaign');
const Recipient = require('../models/Recipient');

/**
 * Get dashboard statistics for the authenticated user
 * Returns: emails sent, emails today, connected accounts, failed count
 */
async function getDashboardStats(req, res, next) {
  try {
    const userId = req.user._id;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Get all statistics in parallel
    const [
      emailsSent,
      emailsToday,
      connectedAccounts,
      failedEmails,
    ] = await Promise.all([
      // Total emails sent (single + campaign recipients marked as sent)
      Email.countDocuments({
        userId,
        status: 'SENT',
      }),

      // Emails sent today
      Email.countDocuments({
        userId,
        status: 'SENT',
        sentAt: { $gte: startOfToday },
      }),

      // Connected email accounts
      EmailAccount.countDocuments({
        userId,
      }),

      // Failed emails
      Email.countDocuments({
        userId,
        status: 'FAILED',
      }),
    ]);

    // Also count campaign recipients for complete stats
    const campaigns = await Campaign.find({ userId }).select('_id');
    const campaignIds = campaigns.map((c) => c._id);

    let campaignSent = 0;
    let campaignFailed = 0;
    let campaignSentToday = 0;

    if (campaignIds.length > 0) {
      const [sent, failed, sentToday] = await Promise.all([
        Recipient.countDocuments({
          campaignId: { $in: campaignIds },
          status: 'sent',
        }),
        Recipient.countDocuments({
          campaignId: { $in: campaignIds },
          status: 'failed',
        }),
        Recipient.countDocuments({
          campaignId: { $in: campaignIds },
          status: 'sent',
          sentAt: { $gte: startOfToday },
        }),
      ]);
      campaignSent = sent;
      campaignFailed = failed;
      campaignSentToday = sentToday;
    }

    const totalSent = emailsSent + campaignSent;
    const totalFailed = failedEmails + campaignFailed;
    const totalToday = emailsToday + campaignSentToday;

    return res.status(200).json({
      success: true,
      data: {
        emailsSent: totalSent,
        emailsToday: totalToday,
        connectedAccounts,
        failed: totalFailed,
      },
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Get recent activity for the dashboard
 * Returns: recent emails and campaigns
 */
async function getRecentActivity(req, res, next) {
  try {
    const userId = req.user._id;

    // Get user's campaigns for recipient lookup
    const campaigns = await Campaign.find({ userId }).select('_id subject').lean();
    const campaignIds = campaigns.map(c => c._id);
    const campaignMap = new Map(campaigns.map(c => [String(c._id), c.subject]));

    // Get recent emails from both collections in parallel
    const [recentEmails, recentRecipients, recentCampaigns] = await Promise.all([
      Email.find({ userId })
        .sort({ sentAt: -1, createdAt: -1 })
        .limit(5)
        .select('to subject status sentAt createdAt')
        .lean(),
      campaignIds.length > 0
        ? Recipient.find({ campaignId: { $in: campaignIds }, status: { $in: ['sent', 'failed'] } })
            .sort({ sentAt: -1, createdAt: -1 })
            .limit(5)
            .select('email campaignId status sentAt createdAt')
            .lean()
        : [],
      Campaign.find({ userId })
        .sort({ createdAt: -1 })
        .limit(5)
        .select('name subject status sentCount totalRecipients createdAt')
        .lean(),
    ]);

    // Transform campaign recipients to email format
    const campaignEmails = recentRecipients.map(r => ({
      type: 'email',
      title: campaignMap.get(String(r.campaignId)) || '(Campaign Email)',
      subtitle: r.email,
      status: r.status.toUpperCase(),
      createdAt: r.sentAt || r.createdAt,
    }));

    // Transform single emails
    const singleEmailActivities = recentEmails.map((email) => ({
      type: 'email',
      title: email.subject || '(No subject)',
      subtitle: Array.isArray(email.to) ? email.to.join(', ') : email.to,
      status: email.status,
      createdAt: email.sentAt || email.createdAt,
    }));

    // Transform campaigns
    const campaignActivities = recentCampaigns.map((campaign) => ({
      type: 'campaign',
      title: campaign.name,
      subtitle: campaign.subject || '(No subject)',
      status: campaign.status,
      progress: campaign.totalRecipients
        ? Math.round((campaign.sentCount / campaign.totalRecipients) * 100)
        : 0,
      createdAt: campaign.createdAt,
    }));

    // Combine and sort by date
    const activities = [...singleEmailActivities, ...campaignEmails, ...campaignActivities]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 5);

    logger.info({ userId, emailCount: recentEmails.length, recipientCount: recentRecipients.length, total: activities.length }, '[DASHBOARD] Recent activity fetched');

    return res.status(200).json({
      success: true,
      data: activities,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDashboardStats,
  getRecentActivity,
};
