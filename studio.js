// const OBSWebSocket = require('obs-websocket-js').default;

// // --- CONFIGURATION ---
// // If you have a password on your OBS WebSocket, enter it here.
// const OBS_CONFIG = {
//     address: 'ws://localhost:4455',
//     password: '' 
// };

// const obs = new OBSWebSocket();
// let isObsConnected = false;

// // --- INITIALIZATION ---
// document.addEventListener('DOMContentLoaded', () => {
//     console.log('Studio: Initializing OBS Controller...');
//     initStudioControls();
//     connectToObs();
// });

// function initStudioControls() {
//     // Stream Button
//     const btnStream = document.getElementById('btn-stream');
//     if (btnStream) {
//         btnStream.addEventListener('click', async () => {
//             if (!isObsConnected) return;
//             const state = await obs.call('GetStreamStatus');
//             if (state.outputActive) {
//                 await obs.call('StopStream');
//             } else {
//                 await obs.call('StartStream');
//             }
//             updateStreamButtons();
//         });
//     }

//     // Record Button
//     const btnRecord = document.getElementById('btn-record');
//     if (btnRecord) {
//         btnRecord.addEventListener('click', async () => {
//             if (!isObsConnected) return;
//             const state = await obs.call('GetRecordStatus');
//             if (state.outputActive) {
//                 await obs.call('StopRecord');
//             } else {
//                 await obs.call('StartRecord');
//             }
//             updateRecordButton();
//         });
//     }

//     // Volume Faders (Generic Logic)
//     document.querySelectorAll('.fader').forEach(fader => {
//         fader.addEventListener('input', (e) => {
//             // Note: To make this work fully, we'd need to map specific inputs 
//             // to specific OBS sources (Mic, Desktop, etc.)
//             console.log(`Volume changed: ${e.target.value}`);
//         });
//     });
// }

// // --- OBS CONNECTION ---
// async function connectToObs() {
//     const statusBadge = document.getElementById('obs-status');
    
//     try {
//         await obs.connect(OBS_CONFIG.address, OBS_CONFIG.password);
//         console.log('Studio: Connected to OBS');
//         isObsConnected = true;
        
//         // Update UI
//         if (statusBadge) {
//             statusBadge.innerHTML = '🟢 OBS Connected';
//             statusBadge.className = 'status-badge online'; // You can add .online css if needed
//             statusBadge.style.color = '#00ff41';
//         }

//         // Load Initial Data
//         loadScenes();
//         updateStreamButtons();
//         updateRecordButton();

//         // Listen for OBS Events
//         obs.on('StreamStateChanged', updateStreamButtons);
//         obs.on('RecordStateChanged', updateRecordButton);
//         obs.on('CurrentProgramSceneChanged', (data) => highlightActiveScene(data.sceneName));

//     } catch (error) {
//         console.error('Studio: Failed to connect to OBS', error);
//         isObsConnected = false;
//         if (statusBadge) {
//             statusBadge.innerHTML = '🔴 OBS Offline';
//             statusBadge.style.color = '#ff4444';
//         }
//         // Retry logic could go here
//     }
// }

// // --- SCENES UI ---
// async function loadScenes() {
//     const list = document.getElementById('scene-list');
//     if (!list) return;

//     try {
//         const data = await obs.call('GetSceneList');
//         const current = await obs.call('GetCurrentProgramScene');
        
//         list.innerHTML = ''; // Clear existing

//         data.scenes.forEach(scene => {
//             const name = scene.sceneName; // New OBS v5 property
//             const btn = document.createElement('div');
//             btn.className = 'scene-card'; // Add css for this if needed
//             btn.style.cssText = "background:#252525; padding:10px; margin-bottom:5px; cursor:pointer; border:1px solid #333; border-radius:4px; text-align:center;";
//             btn.innerText = name;
//             btn.dataset.sceneName = name; // Store name for reference

//             if (name === current.currentProgramSceneName) {
//                 btn.style.borderColor = 'var(--accent)';
//                 btn.style.color = 'var(--accent)';
//                 btn.style.fontWeight = 'bold';
//             }

//             btn.onclick = () => switchScene(name);
//             list.appendChild(btn);
//         });

//     } catch (e) {
//         console.error("Error loading scenes:", e);
//     }
// }

// async function switchScene(sceneName) {
//     if (!isObsConnected) return;
//     await obs.call('SetCurrentProgramScene', {TZsceneName: sceneName });
//     // Note: The UI update happens automatically via the 'CurrentProgramSceneChanged' event listener
// }

// function highlightActiveScene(activeName) {
//     const buttons = document.querySelectorAll('#scene-list div');
//     buttons.forEach(btn => {
//         if (btn.dataset.sceneName === activeName) {
//             btn.style.borderColor = 'var(--accent)';
//             btn.style.color = 'var(--accent)';
//             btn.style.fontWeight = 'bold';
//         } else {
//             btn.style.borderColor = '#333';
//             btn.style.color = '#ccc';
//             btn.style.fontWeight = 'normal';
//         }
//     });
// }

// // --- BUTTON STATES ---
// async function updateStreamButtons() {
//     if (!isObsConnected) return;
//     const btn = document.getElementById('btn-stream');
//     if (!btn) return;

//     try {
//         const status = await obs.call('GetStreamStatus');
//         if (status.outputActive) {
//             btn.innerText = "HT STOP STREAMING";
//             btn.style.background = "#ff4444";
//             btn.style.color = "white";
//         } else {
//             btn.innerText = "Start Streaming";
//             btn.style.background = "#252525";
//             btn.style.color = "white";
//         }
//     } catch(e) { console.error(e); }
// }

// async function updateRecordButton() {
//     if (!isObsConnected) return;
//     const btn = document.getElementById('btn-record');
//     if (!btn) return;

//     try {
//         const status = await obs.call('GetRecordStatus');
//         if (status.outputActive) {
//             btn.innerText = "HT STOP RECORDING";
//             btn.style.background = "#ff4444";
//             btn.style.color = "white";
//         } else {
//             btn.innerText = "Start Recording";
//             btn.style.background = "#252525";
//             btn.style.color = "white";
//         }
//     } catch(e) { console.error(e); }
// }