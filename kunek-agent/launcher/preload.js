const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kunek', {
    on: (channel, callback) => {
        ipcRenderer.on(channel, (event, ...args) => callback(...args));
    },
    send: (channel, payload) => {
        ipcRenderer.send(channel, payload);
    }
});