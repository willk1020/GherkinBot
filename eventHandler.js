const chatBot = require('./chatBot');
const alertSystem = require('./alertSystem');
const { getConfig } = require('./configManager');

function handleIncomingEvent(eventType, eventData) {
    const config = getConfig();
    
    switch (eventType) {
        case 'RAID':
            // 1. Visual Alert (Overlay)
            alertSystem.triggerRaidAlert(eventData);
            
            // 2. Auto Shoutout (Chat)
            // 🔥 UPDATED: Checks the new Dashboard Toggle
            const autoRaidEnabled = config.protection && config.protection.raid;
            
            if (autoRaidEnabled && eventData.viewers >= 2) { 
                const msg = `Cucumber Alert! 🥒 Big shoutout to ${eventData.username} who just raided with ${eventData.viewers} people! Check them out at twitch.tv/${eventData.username}`;
                chatBot.sendMessage(eventData.myChannelName, msg);
            }
            break;

        case 'CHAT_MESSAGE':
            chatBot.handleMessage(eventData);
            break;
    }
}

module.exports = { handleIncomingEvent };