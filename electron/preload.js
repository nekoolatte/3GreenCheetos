const { contextBridge, ipcRenderer } = require('electron');

console.log('[Preload] Loading preload script');

contextBridge.exposeInMainWorld('electronAPI', {
  setDiscordPresence: (data) => {
    console.log('[Preload] setDiscordPresence called:', data);
    return ipcRenderer.invoke('discord:setPresence', data);
  },
  clearDiscordPresence: () => {
    console.log('[Preload] clearDiscordPresence called');
    return ipcRenderer.invoke('discord:clearPresence');
  },
  getDiscordStatus: () => ipcRenderer.invoke('discord:status'),
});
