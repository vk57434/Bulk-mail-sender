const { EventEmitter } = require('events');

const bus = new EventEmitter();
bus.setMaxListeners(0);

function send(type, payload) {
  try {
    bus.emit(type, payload);
    if (payload && payload.campaignId) {
      bus.emit(`campaign:${payload.campaignId}`, { type, ...payload });
    }
  } catch (error) {
    // Never let emitter errors crash the event bus.
  }
}
function publishRecipientStatus(payload) {
  send('recipient.status', payload);
}
function publishCampaignProgress(payload) {
  send('campaign.progress', payload);
}
function publishCampaignCompleted(payload) {
  send('campaign.completed', payload);
}
function subscribe(campaignId, handler) {
  if (!campaignId) {
    throw new Error('campaignId is required to subscribe');
  }
  const event = `campaign:${campaignId}`;
  bus.on(event, handler);
  return () => {
    bus.off(event, handler);
  };
}

module.exports = {
  bus,
  send,
  publishRecipientStatus,
  publishCampaignProgress,
  publishCampaignCompleted,
  subscribe,
};
