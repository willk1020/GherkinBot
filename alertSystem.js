const { getConfig } = require('./configManager');

let broadcastFunc = null;

function setBroadcastFunc(fn) {
    broadcastFunc = fn;
}

// GENERIC FUNCTION
function triggerAlert(type, eventData) {
    const config = getConfig();
    if (!config.alerts || !config.alerts[type]) return;

    const alertConfig = config.alerts[type];
    if (!alertConfig.enabled) return;

    const amount = eventData.amount || 0; 
    const variations = alertConfig.variations || [];
    const sortedVars = variations.sort((a, b) => b.minAmount - a.minAmount);
    const match = sortedVars.find(v => amount >= (v.minAmount || 0)) || sortedVars[0];

    if (match) {
        console.log(`>> Triggering Alert [${type}]: ${match.name}`);
        playPayload(match, eventData);
    }
}

// TEST FUNCTION
function testAlert(variation) {
    console.log(">> AlertSystem: Processing Test Alert...");
    const mockData = { username: "TestUser", amount: 100 };
    playPayload(variation, mockData);
}

// --- 🔥 ROBUST PATH SANITIZER ---
function sanitizePath(path) {
    if (!path) return "";
    
    // 1. If it's already a web URL (http/https), return as is
    if (path.startsWith('http')) return path;

    // 2. Remove "file://" prefix if it exists (we will replace it)
    let cleanPath = path.replace(/^file:\/\/\/?/, '');

    // 3. Normalize slashes (Windows \ becomes /)
    cleanPath = cleanPath.replace(/\\/g, '/');

    // 4. Construct the Asset Server URL
    // We use encodeURIComponent to handle spaces, special chars, etc.
    return `http://localhost:3001/file?path=${encodeURIComponent(cleanPath)}`;
}

function playPayload(variation, eventData) {
    if (!broadcastFunc) {
        console.log(">> Error: No Broadcast Function found!");
        return;
    }

    const payload = {
        type: 'ALERT',
        media: sanitizePath(variation.media),
        sound: sanitizePath(variation.sound),
        volume: variation.volume,
        text: (variation.message || "").replace('{username}', eventData.username).replace('{amount}', eventData.amount),
        layout: variation.layout,
        font: variation.font,
        size: variation.size,
        color: variation.color,
        animation: variation.animation,
        duration: variation.duration
    };
    
    console.log(">> Sending Payload to OBS:", payload.media); 
    broadcastFunc(payload);
}

function triggerFollowAlert(data) { triggerAlert('follow', { username: data.username, amount: 0 }); }
function triggerRaidAlert(data) { triggerAlert('raid', { username: data.username, amount: data.viewers }); }
function triggerSubAlert(data) { triggerAlert('sub', { username: data.username, amount: 1 }); }
function triggerCheerAlert(data) { triggerAlert('cheer', { username: data.username, amount: data.bits }); }
function triggerGiftAlert(data) {
    // We treat 'amount' as the number of subs gifted
    triggerAlert('gift', { username: data.username, amount: data.amount });
}

module.exports = { 
    setBroadcastFunc, 
    triggerFollowAlert, triggerRaidAlert, triggerSubAlert, triggerCheerAlert,
    triggerGiftAlert, // <--- Added this
    testAlert 
};