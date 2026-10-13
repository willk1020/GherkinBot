const { app, BrowserWindow, ipcMain, shell, dialog, globalShortcut } = require('electron');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { StaticAuthProvider } = require('@twurple/auth');
const { ChatClient } = require('@twurple/chat');
const { ApiClient } = require('@twurple/api');
const { EventSubWsListener } = require('@twurple/eventsub-ws');
const https = require('https'); 

// --- GLOBAL VARIABLES ---
const chatHistory = new Map(); 
const recentFollows = []; 
const recentSubs = [];
let mainWindow;
let authServer;
let wss;
let chatClient;
let apiClient;
let eventListener;

const CLIENT_ID = '2hpmssbtknvdq1y1lj68neub2jpxqz';

// IMPORT THE BRAIN
const eventHandler = require('./eventHandler');
const chatBot = require('./chatBot');
const alertSystem = require('./alertSystem');
const configManager = require('./configManager');

// 🛑 KILL SWITCH CONFIG
const STATUS_URL = 'https://gist.githubusercontent.com/ThePanickedPickle/b1ae8fcbfc7369e43e5d761984c2d227/raw/gherkinbot_status.json'; 
const CURRENT_VERSION = '0.2.0'; 

// --- APP LIFECYCLE ---
function checkStatus() {
    return new Promise((resolve) => {
        https.get(STATUS_URL, (res) => {
            let data = ''; res.on('data', (chunk) => data += chunk); res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { resolve({ status: 'active' }); } });
        }).on('error', () => resolve({ status: 'active' }));
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200, height: 900, backgroundColor: '#121212',
        icon: path.join(__dirname, 'assets', 'icon.png'), 
        titleBarStyle: 'hidden', 
        titleBarOverlay: { color: '#1e1e1e', symbolColor: '#ffffff', height: 35 },
        webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    mainWindow.loadFile('index.html');
}

app.whenReady().then(async () => {
    const status = await checkStatus();
    if (status.status === 'disabled' || status.min_version > CURRENT_VERSION) {
        dialog.showMessageBoxSync({ type: 'error', title: 'Expired', message: status.message || "Update required." });
        shell.openExternal('https://discord.gg/G6vPT5NvaR'); app.quit(); return;
    }
    createWindow(); startBridge(); startAssetServer();
    registerGlobalShortcuts(configManager.getConfig());
    const config = configManager.getConfig();
    if (config.auth && config.auth.token) { console.log(">> Auto-logging in..."); startChatBot(config.auth.token).catch(err => { console.log(">> Token expired."); }); }
});

function startAssetServer() {
    const assetServer = http.createServer((req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`);
        if (url.pathname === '/file') {
            const filePath = url.searchParams.get('path');
            if (!filePath) { res.writeHead(400); return res.end("No path"); }
            require('fs').readFile(filePath, (err, data) => {
                if (err) { res.writeHead(404); return res.end("File not found"); }
                const ext = path.extname(filePath).toLowerCase();
                let ct = 'application/octet-stream';
                if(ext === '.png') ct = 'image/png'; if(ext === '.jpg') ct = 'image/jpeg'; if(ext === '.webm') ct = 'video/webm'; if(ext === '.mp3') ct = 'audio/mpeg';
                res.writeHead(200, { 'Content-Type': ct, 'Access-Control-Allow-Origin': '*' }); res.end(data);
            });
        }
    });
    assetServer.listen(3001);
}

function startBridge() {
    wss = new WebSocket.Server({ port: 8080 });
    alertSystem.setBroadcastFunc(broadcast);
    wss.on('connection', (ws) => ws.send(JSON.stringify({ type: 'CONFIG_UPDATE', data: configManager.getConfig() })));
}
function broadcast(data) { if (!wss) return; wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(data)); }); }

ipcMain.on('login-twitch', () => { if (chatClient) { try { chatClient.quit(); } catch (e) {} chatClient = null; } startAuthServer(); const scopes = ['chat:read', 'chat:edit', 'channel:read:redemptions', 'moderator:manage:shoutouts', 'moderator:manage:chat_messages', 'moderator:read:followers', 'channel:read:subscriptions', 'bits:read', 'channel:read:hype_train', 'channel:edit:commercial', 'clips:edit', 'user:edit:broadcast', 'channel:manage:polls', 'channel:manage:raids']; const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=http://localhost:3000&response_type=token&scope=${scopes.join('+')}`; shell.openExternal(authUrl); });

function startAuthServer() {
    if (authServer) return; 
    authServer = http.createServer((req, res) => {
        if (req.url && req.url.startsWith('/token')) {
            const token = new URLSearchParams(req.url.split('?')[1]).get('key');
            if (token) { startChatBot(token); if (mainWindow) mainWindow.webContents.send('bot-status', 'Authenticating...'); res.end("Login successful!"); authServer.close(() => { authServer = null; }); return; }
            authServer.close(() => { authServer = null; }); return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(`<html><body style="background:#121212;color:#00ff41;text-align:center;padding-top:50px;"><h1>Login...</h1><script>const t=new URLSearchParams(window.location.hash.substring(1)).get('access_token');if(t)fetch('http://localhost:3000/token?key='+t).then(()=>window.close());</script></body></html>`);
    });
    authServer.listen(3000);
}

async function startChatBot(accessToken) {
    try {
        const authProvider = new StaticAuthProvider(CLIENT_ID, accessToken);
        apiClient = new ApiClient({ authProvider });
        const me = await apiClient.getTokenInfo();
        configManager.updateConfig({ auth: { token: accessToken } });
        const config = configManager.getConfig();
        if (!config.streamSettings) config.streamSettings = {};
        if (config.streamSettings.channelName !== me.userName) { config.streamSettings.channelName = me.userName; configManager.updateConfig(config); if (mainWindow) mainWindow.webContents.send('settings-data', config); }
        chatClient = new ChatClient({ authProvider, channels: [me.userName] });
        chatBot.setChatClient(chatClient); chatBot.setApiClient(apiClient);
        chatClient.onMessage(async (channel, user, text, msg) => {
            eventHandler.handleIncomingEvent('CHAT_MESSAGE', { channel, user, message: text, msgObject: msg });
            const config = configManager.getConfig();
            const deathConfig = config.widgets?.deathCounter;
            if (deathConfig && deathConfig.enabled && deathConfig.triggerType !== 'key') { 
                if (text.toLowerCase().startsWith(deathConfig.trigger.toLowerCase())) {
                    if (msg.userInfo.isMod || msg.userInfo.isBroadcaster) { const newCount = incrementDeathCount(); chatClient.say(channel, `💀 RIP! Death Count: ${newCount}`); }
                }
            }
            const lowerUser = user.toLowerCase(); if (!chatHistory.has(lowerUser)) chatHistory.set(lowerUser, []); const userHist = chatHistory.get(lowerUser); userHist.push(text); if (userHist.length > 5) userHist.shift(); 
            if (mainWindow) { mainWindow.webContents.send('incoming-chat', { user: msg.userInfo.displayName || user, message: text, color: msg.userInfo.color || '#00ff41', isMod: msg.userInfo.isMod || msg.userInfo.isBroadcaster, isVip: msg.userInfo.isVip, isSub: msg.userInfo.isSubscriber }); }
        });
        chatClient.onConnect(() => { if (mainWindow) mainWindow.webContents.send('bot-status', `Connected as ${me.userName}`); });
        await chatClient.connect(); startEventSub(apiClient, me.userId, me.userName);
    } catch (err) { console.error("!! Login Failed:", err); if (mainWindow) mainWindow.webContents.send('bot-status', 'Login Error'); chatClient = null; }
}

async function startEventSub(apiClient, userId, myChannelName) {
    if (eventListener) return;
    try {
        eventListener = new EventSubWsListener({ apiClient });
        await eventListener.start();
        eventListener.onChannelFollow(userId, userId, (e) => { alertSystem.triggerFollowAlert({ username: e.userDisplayName }); updateOmniBar('follow', 1); recentFollows.unshift({ user: e.userDisplayName, time: new Date() }); if (recentFollows.length > 50) recentFollows.pop(); if (mainWindow) mainWindow.webContents.send('update-audience-list', { type: 'follow', list: recentFollows }); });
        eventListener.onChannelSubscription(userId, (e) => { alertSystem.triggerSubAlert({ username: e.userDisplayName }); updateOmniBar('sub', 1); recentSubs.unshift({ user: e.userDisplayName, tier: e.tier, time: new Date() }); if (recentSubs.length > 50) recentSubs.pop(); if (mainWindow) mainWindow.webContents.send('update-audience-list', { type: 'sub', list: recentSubs }); });
        eventListener.onChannelSubscriptionGift(userId, (e) => { alertSystem.triggerGiftAlert({ username: e.gifterDisplayName, amount: e.amount }); updateOmniBar('sub', e.amount); });
        eventListener.onChannelCheer(userId, (e) => { alertSystem.triggerCheerAlert({ username: e.userDisplayName, bits: e.bits }); updateOmniBar('bits', e.bits); });
        eventListener.onChannelRaidTo(userId, (e) => { alertSystem.triggerRaidAlert({ username: e.raidingBroadcasterDisplayName, viewers: e.viewers }); eventHandler.handleIncomingEvent('RAID', { username: e.raidingBroadcasterDisplayName, viewers: e.viewers, gameName: "Unknown", myChannelName }); });
        eventListener.onChannelRedemptionAdd(userId, (e) => { updateOmniBar('points', 1); const config = configManager.getConfig(); if (config.pointSounds) { const match = config.pointSounds.find(s => s.redeemName && s.path && s.redeemName.toLowerCase() === e.rewardTitle.toLowerCase()); if (match) { if (mainWindow) mainWindow.webContents.send('play-sound', match); broadcast({ type: 'SOUND', path: match.path, volume: match.volume, text: match.redeemName }); } } });
    } catch (err) { console.error("EventSub Error:", err); }
}

ipcMain.on('get-audience-data', async (event) => {
    if (!apiClient) { event.reply('audience-data-reply', { follows: recentFollows, subs: recentSubs }); return; }
    try { const me = await apiClient.getTokenInfo(); let realFollows = [], realSubs = []; try { const data = await apiClient.channels.getChannelFollowers(me.userId, me.userId, { limit: 50 }); realFollows = data.data.map(f => ({ user: f.userDisplayName, time: f.followDate })); } catch (e) {} try { const data = await apiClient.subscriptions.getSubscriptions(me.userId, { limit: 50 }); realSubs = data.data.map(s => ({ user: s.userDisplayName, tier: s.tier, time: null })); } catch (e) {} if(realFollows.length > 0) { recentFollows.length = 0; recentFollows.push(...realFollows); } if(realSubs.length > 0) { recentSubs.length = 0; recentSubs.push(...realSubs); } event.reply('audience-data-reply', { follows: recentFollows, subs: recentSubs }); } catch (e) {}
});

ipcMain.on('get-settings', (event) => event.reply('settings-data', configManager.getConfig()));
ipcMain.on('save-settings', (event, newSettings) => { configManager.updateConfig(newSettings); registerGlobalShortcuts(newSettings); broadcast({ type: 'CONFIG_UPDATE', data: newSettings }); });
ipcMain.on('test-alert', (event, v) => alertSystem.testAlert(v));
ipcMain.on('update-stream-info', async (event, { title, game, tags }) => { if(!apiClient) return; try { const me = await apiClient.getTokenInfo(); let gameId; if(game) { const g = await apiClient.games.getGameByName(game); if(g) gameId = g.id; } await apiClient.channels.updateChannelInfo(me.userId, { title, gameId, tags: tags ? tags.split(',') : undefined }); } catch(e) {} });
ipcMain.on('start-raid', async (event, targetName) => { if(!apiClient) return; try { const me = await apiClient.getTokenInfo(); const target = await apiClient.users.getUserByName(targetName); if(target) await apiClient.raids.startRaid(me.userId, target.id); } catch(e) {} });
ipcMain.on('search-game', async (event, q) => { if(!apiClient || q.length < 2) return; try { const res = await apiClient.search.searchCategories(q, { limit: 5 }); event.reply('game-search-results', res.data.map(g => ({ id: g.id, name: g.name, boxArt: g.boxArtUrl.replace('{width}x{height}','52x72') }))); } catch(e) {} });
ipcMain.on('trigger-action', async (event, p) => {
    const type = p.type || p; const data = p.data || {};
    if(type === 'death-update') { broadcast({ type: 'DEATH_UPDATE', count: p.count, bg: p.bg, font: p.font, stroke: p.stroke, strokeColor: p.strokeColor }); return; }
    if(!apiClient) return; try { const me = await apiClient.getTokenInfo(); if(type === 'clip') await apiClient.clips.createClip({ channelId: me.userId }); if(type === 'marker') await apiClient.streams.createStreamMarker(me.userId, 'Marker'); if(type === 'ad') await apiClient.channels.startCommercial(me.userId, 60); if(type === 'poll') await apiClient.polls.createPoll(me.userId, { title: data.title, choices: data.choices, duration: data.duration||60 }); } catch(e) {}
});
ipcMain.handle('select-file', async (e, type) => { const filters = type === 'audio' ? [{ name: 'Audio', extensions: ['mp3','wav'] }] : [{ name: 'Visual', extensions: ['png','jpg','gif','webm'] }]; const res = await dialog.showOpenDialog({ properties: ['openFile'], filters }); return (!res.canceled && res.filePaths.length > 0) ? res.filePaths[0] : null; });
ipcMain.on('get-user-profile', async (event, username) => { const config = configManager.getConfig(); const data = config.userData && config.userData[username] ? config.userData[username] : {}; const lowerUser = username.toLowerCase(); const hist = chatHistory.get(username) || chatHistory.get(lowerUser) || []; let created, followed; if(apiClient) { try { const me = await apiClient.getTokenInfo(); const u = await apiClient.users.getUserByName(username); if(u) { created = u.creationDate; const followData = await apiClient.channels.getChannelFollowers(me.userId, u.id); if (followData.data && followData.data.length > 0) { followed = followData.data[0].followDate; } } } catch(e) {} } event.reply('user-profile-data', { username, note: data.note || "", history: hist, createdAt: created, followedAt: followed }); });
ipcMain.on('save-user-note', (event, { username, note }) => { const config = configManager.getConfig(); if(!config.userData) config.userData = {}; if(!config.userData[username]) config.userData[username] = {}; config.userData[username].note = note; configManager.updateConfig(config); });
ipcMain.on('test-sound', (event, sound) => { if (mainWindow) mainWindow.webContents.send('play-sound', sound); broadcast({ type: 'SOUND', path: sound.path, volume: sound.volume, text: sound.redeemName || "Sound Alert" }); });

function updateOmniBar(type, amount) { const config = configManager.getConfig(); if (!config.barSettings || !config.barSettings.sources) return; const src = config.barSettings.sources[type]; if (src && src.enabled) { const pts = (type === 'bits') ? (amount/100)*src.value : amount*src.value; config.barSettings.current = (config.barSettings.current||0) + pts; configManager.updateConfig(config); broadcast({ type: 'BAR_UPDATE', data: config.barSettings }); } }
function registerGlobalShortcuts(config) { globalShortcut.unregisterAll(); if (config.sounds) { config.sounds.forEach(s => { if (s.hotkey && s.path) { try { globalShortcut.register(s.hotkey, () => { if (mainWindow) mainWindow.webContents.send('play-sound', s); broadcast({ type: 'SOUND', path: s.path, volume: s.volume }); }); } catch(e) {} } }); } const death = config.widgets?.deathCounter; if (death && death.enabled && death.triggerType === 'key' && death.keybind) { try { globalShortcut.register(death.keybind, () => { incrementDeathCount(); }); } catch(e) {} } }

function incrementDeathCount() {
    const config = configManager.getConfig(); const death = config.widgets?.deathCounter; if(!death) return 0;
    death.count = (death.count || 0) + 1; configManager.updateConfig(config);
    broadcast({ type: 'DEATH_UPDATE', count: death.count, bg: death.bg, font: death.font, stroke: death.stroke, strokeColor: death.strokeColor });
    if(mainWindow) mainWindow.webContents.send('settings-data', config); 
    return death.count;
}

setInterval(async () => { if(!apiClient) return; try { const config = configManager.getConfig(); const chan = config.streamSettings?.channelName; if(!chan) return; const now = Date.now(); if(config.timers) { for(let t of config.timers) { if(!t.enabled) continue; if ((now - (t.lastSent||0)) >= (t.interval*60000) && (t.linesSince||0) >= t.minLines) { chatBot.sendTimerMessage(chan, t.message); t.lastSent = now; t.linesSince = 0; configManager.updateConfig(config); break; } } } const user = await apiClient.users.getUserByName(chan); if(user) { const s = await apiClient.streams.getStreamByUserId(user.id); if(s) { const ms = Date.now() - s.startDate.getTime(); const h = Math.floor(ms/3600000); const m = Math.floor((ms%3600000)/60000); broadcast({ type: 'STATS_UPDATE', isLive: true, viewers: s.viewers, uptime: `${h}h ${m}m` }); } else broadcast({ type: 'STATS_UPDATE', isLive: false, viewers: 0, uptime: "OFFLINE" }); } } catch(e) {} }, 10000);