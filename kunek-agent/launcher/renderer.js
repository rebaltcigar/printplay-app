// This file handles the rendering logic for the Electron application, including managing the UI and responding to user interactions.

const { ipcRenderer } = require('electron');

// Function to update the session display
function updateSessionDisplay(session) {
    const sessionDisplay = document.getElementById('session-display');
    sessionDisplay.innerText = `Session ID: ${session.id}, Time Remaining: ${session.timeRemaining} minutes`;
}

// Function to handle IPC messages from the main process
ipcRenderer.on('SESSION_UPDATE', (event, session) => {
    updateSessionDisplay(session);
});

// Function to handle lock and unlock events
ipcRenderer.on('LOCK', () => {
    document.body.classList.add('locked');
});

ipcRenderer.on('UNLOCK', () => {
    document.body.classList.remove('locked');
});

// Function to initialize the UI
function initUI() {
    // Initial setup for the UI components
    const startButton = document.getElementById('start-session');
    startButton.addEventListener('click', () => {
        ipcRenderer.send('START_SESSION');
    });

    const endButton = document.getElementById('end-session');
    endButton.addEventListener('click', () => {
        ipcRenderer.send('END_SESSION');
    });
}

// Initialize the UI when the document is ready
document.addEventListener('DOMContentLoaded', initUI);