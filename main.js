const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

// Fix GPU crashes - disable hardware acceleration completely
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 600,
    height: 400,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'src', 'js', 'preload.js')
    }
  });

  mainWindow.loadFile(path.join('src', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Handle save audio file
ipcMain.handle('save-audio', async (event, buffer) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    buttonLabel: 'Save Audio',
    defaultPath: `recording-${Date.now()}.webm`,
    filters: [
      { name: 'WebM Audio', extensions: ['webm'] },
      { name: 'OGG Audio', extensions: ['ogg'] },
      { name: 'MP4 Audio', extensions: ['mp4'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (filePath) {
    fs.writeFileSync(filePath, Buffer.from(buffer));
    return { success: true, path: filePath };
  }
  return { success: false };
});
