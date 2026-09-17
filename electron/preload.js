const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktopOverlay', {
  listDisplays: () => ipcRenderer.invoke('desktop:list-displays'),
  start: (displayId) => ipcRenderer.invoke('desktop:start', displayId),
  stop: () => ipcRenderer.invoke('desktop:stop'),
  minimize: () => ipcRenderer.invoke('desktop:minimize'),
  quit: () => ipcRenderer.invoke('desktop:quit'),
  setToolsOpen: (open) => ipcRenderer.send('desktop:tools-open', Boolean(open)),
  setQrExpanded: (expanded) => ipcRenderer.send('desktop:qr-expanded', Boolean(expanded)),
  setQrEditing: (editing) => ipcRenderer.send('desktop:qr-editing', Boolean(editing)),
  setLotteryVisible: (visible) => ipcRenderer.send('desktop:lottery-visible', Boolean(visible)),
  setToolbarHeight: (height) => ipcRenderer.send('desktop:toolbar-height', Number(height)),
  onToolbarVisibility: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, visible) => callback(Boolean(visible));
    ipcRenderer.on('desktop:toolbar-visibility', listener);
    return () => ipcRenderer.removeListener('desktop:toolbar-visibility', listener);
  }
});
