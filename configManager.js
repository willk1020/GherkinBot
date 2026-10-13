const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// 1. SAFE SAVE LOCATION (Fixes "Read-Only" bug)
// This saves to C:\Users\Name\AppData\Roaming\GherkinBot\config.json
const userDataPath = app.getPath('userData');
const configPath = path.join(userDataPath, 'config.json');

// 2. INTERNAL DEFAULTS
// If the user has no config, we start with this
const defaultConfig = {
    streamSettings: { channelName: "" },
    raidLogic: { autoShoutout: false },
    alerts: {},
    commands: [],
    timers: [],
    protection: {},
    barSettings: {},
    sounds: []
};

let config = {};

// 3. DEEP MERGE HELPER (Fixes "Data Deletion" bug)
// This ensures we update "alerts.follow" without deleting "alerts.raid"
function deepMerge(target, source) {
    for (const key in source) {
        if (source[key] instanceof Object && key in target && !Array.isArray(source[key])) {
            Object.assign(source[key], deepMerge(target[key], source[key]));
        }
    }
    Object.assign(target || {}, source);
    return target;
}

function loadConfig() {
    try {
        // Check if the file exists in AppData
        if (!fs.existsSync(configPath)) {
            console.log(">> No config found in AppData. Creating new one.");
            config = defaultConfig;
            saveConfig(); // Create the file
        } else {
            const data = fs.readFileSync(configPath, 'utf-8');
            config = JSON.parse(data);
        }
    } catch (error) {
        console.error("!! Config Load Error. Using defaults.", error);
        config = defaultConfig;
    }
    return config;
}

// Initialize immediately
loadConfig();

function getConfig() {
    return config;
}

function updateConfig(newSettings) {
    // USE DEEP MERGE INSTEAD OF SPREAD
    config = deepMerge(config, newSettings);
    saveConfig();
}

function saveConfig() {
    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        // console.log(">> Config saved to:", configPath); 
    } catch (err) {
        console.error("!! Error saving config:", err);
    }
}

module.exports = { getConfig, updateConfig, saveConfig };