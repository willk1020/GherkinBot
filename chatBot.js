const { getConfig, saveConfig } = require('./configManager');

let globalChatClient = null; 
let globalApiClient = null;  

const activeCooldowns = new Set();
const userCooldowns = new Map();

function setChatClient(client) { globalChatClient = client; }
function setApiClient(client) { globalApiClient = client; }

// Helper to timeout users
function timeoutUser(channel, user, reason) {
    if(globalChatClient) {
        // Sends /timeout command (User must be Mod)
        globalChatClient.say(channel, `/timeout ${user} 10 [GherkinBot] ${reason}`).catch(e => console.log(e));
    }
}

async function handleMessage(data) {
    const config = getConfig();
    const { channel, user, message, msgObject } = data;

    // 1. TIMER LOGIC
    if (config.timers) {
        config.timers.forEach(t => t.linesSince = (t.linesSince || 0) + 1);
        saveConfig(); 
    }

    // 🛡️ PROTECTION SYSTEM (The New Logic)
    // We skip checks for Mods, VIPs, and You (The Broadcaster)
    const isImmune = msgObject.userInfo.isMod || msgObject.userInfo.isBroadcaster || msgObject.userInfo.isVip;
    
    if (!isImmune && config.protection) {
        
        // A. LINK BLOCKER
        if (config.protection.links) {
            // Regex matches www, http, .com, .net, etc.
            const linkRegex = /(www\.|http:|https:|\.com|\.net|\.tv|\.org)/i;
            // We allow clips.twitch.tv automatically
            if (linkRegex.test(message) && !message.includes('clips.twitch.tv')) {
                sendMessage(channel, `@${user} 🥒 No links allowed!`);
                timeoutUser(channel, user, "Link Protection");
                return; // Stop reading this message
            }
        }

        // B. CAPS FILTER
        if (config.protection.caps && message.length > 10) {
            const capsCount = (message.match(/[A-Z]/g) || []).length;
            if (capsCount / message.length > 0.7) { // 70% Caps Limit
                sendMessage(channel, `@${user} 🥒 Please stop shouting!`);
                timeoutUser(channel, user, "Caps Protection");
                return;
            }
        }

        // C. EMOTE SPAM / REPETITION
        if (config.protection.spam) {
            const words = message.split(' ');
            if (words.length > 10) {
                const uniqueWords = new Set(words.map(w => w.toLowerCase()));
                if (uniqueWords.size < 3) { // e.g. "Pog Pog Pog Pog..."
                    sendMessage(channel, `@${user} 🥒 No spamming!`);
                    timeoutUser(channel, user, "Spam Protection");
                    return;
                }
            }
        }
    }

    if (!message.startsWith('!')) return;

    // --- COMMAND HANDLING ---
    const args = message.split(' ');
    const trigger = args[0].toLowerCase();
    
    const commands = Array.isArray(config.commands) ? config.commands : [];
    const command = commands.find(c => 
        c.trigger === trigger || (c.aliases && c.aliases.includes(trigger))
    );

    if (!command || !command.enabled) return;

    if (!checkPermission(msgObject, command.permission)) return;
    if (isOnCooldown(command, user)) return;

    let response = command.response;

    if (command.type === 'counter') {
        command.count = (command.count || 0) + 1;
        saveConfig();
        const cmdIndex = commands.findIndex(c => c.trigger === command.trigger);
        if (cmdIndex !== -1) config.commands[cmdIndex].count = command.count;
    }

    response = await processVariables(response, data, command);
    sendMessage(channel, response);
    triggerCooldown(command, user);
}

// --- STANDARD FUNCTIONS ---

function sendMessage(channel, text) {
    if (globalChatClient) globalChatClient.say(channel, text).catch(e => console.error(e));
}

function sendTimerMessage(channel, message) {
    if (message.startsWith('!')) {
        handleMessage({ channel, user: 'GherkinBot', message: message, msgObject: { userInfo: { isBroadcaster: true } } });
    } else {
        sendMessage(channel, message);
    }
}

async function processVariables(text, data, command) {
    let final = text;
    final = final.replace(/{user}/g, data.user);
    final = final.replace(/{count}/g, command.count || 0);
    final = final.replace(/{bot}/g, "GherkinBot"); 
    
    const args = data.message.split(' ');
    const target = args[1] ? args[1].replace('@', '') : data.user;
    final = final.replace(/{touser}/g, target);

    final = final.replace(/{random\.(\d+)-(\d+)}/g, (match, min, max) => {
        return Math.floor(Math.random() * (parseInt(max) - parseInt(min) + 1)) + parseInt(min);
    });

    if (globalApiClient && (final.includes('{game}') || final.includes('{title}') || final.includes('{uptime}') || final.includes('{viewers}'))) {
        try {
            const user = await globalApiClient.users.getUserByName(data.channel);
            if (user) {
                const stream = await globalApiClient.streams.getStreamByUserId(user.id);
                if (stream) {
                    final = final.replace(/{game}/g, stream.gameName);
                    final = final.replace(/{title}/g, stream.title);
                    final = final.replace(/{viewers}/g, stream.viewers);
                    
                    const uptimeMs = Date.now() - stream.startDate.getTime();
                    const hours = Math.floor(uptimeMs / 3600000);
                    const mins = Math.floor((uptimeMs % 3600000) / 60000);
                    final = final.replace(/{uptime}/g, `${hours}h ${mins}m`);
                } else {
                    final = final.replace(/{game}|{title}|{viewers}/g, "(Stream Offline)");
                    final = final.replace(/{uptime}/g, "0h 0m");
                }
            }
        } catch (err) { console.error("API Error:", err); }
    }
    return final;
}

function checkPermission(msg, level) {
    if (!level || level === 'everyone') return true;
    if (!msg || !msg.userInfo) return true;
    const info = msg.userInfo;
    if (level === 'broadcaster' && info.isBroadcaster) return true;
    if (level === 'mod' && (info.isMod || info.isBroadcaster)) return true;
    if (level === 'vip' && (info.isVip || info.isMod || info.isBroadcaster)) return true;
    if (level === 'sub' && (info.isSubscriber || info.isMod || info.isBroadcaster)) return true;
    return false;
}

function isOnCooldown(cmd, user) {
    const now = Date.now();
    if (activeCooldowns.has(cmd.trigger)) {
        const expiration = activeCooldowns.get(cmd.trigger);
        if (now < expiration) return true;
    }
    const userKey = `${cmd.trigger}_${user}`;
    if (userCooldowns.has(userKey)) {
        const expiration = userCooldowns.get(userKey);
        if (now < expiration) return true;
    }
    return false;
}

function triggerCooldown(cmd, user) {
    const now = Date.now();
    if (cmd.globalCooldown) activeCooldowns.set(cmd.trigger, now + (cmd.globalCooldown * 1000));
    if (cmd.userCooldown) userCooldowns.set(`${cmd.trigger}_${user}`, now + (cmd.userCooldown * 1000));
}

module.exports = { handleMessage, setChatClient, setApiClient, sendMessage, sendTimerMessage };