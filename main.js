const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const createMenuTemplate = require('./menu-template');
const store = new Store();

// Configure logging
log.transports.file.level = 'debug';
autoUpdater.logger = log;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
          nodeIntegration: true,
          contextIsolation: false
      },
      autoHideMenuBar: false,
      frame: true
  });
  
  // Set the application menu
  const menu = Menu.buildFromTemplate(createMenuTemplate(mainWindow));
  Menu.setApplicationMenu(menu);
  
  mainWindow.loadFile('index.html');
  autoUpdater.checkForUpdatesAndNotify();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
      app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
  }
});

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
  mainWindow.webContents.send('update-message', 'Checking for updates...');
});

autoUpdater.on('update-available', (info) => {
  dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Available',
      message: `Version ${info.version} is available. Would you like to download it now?`,
      buttons: ['Yes', 'No']
  }).then((result) => {
      if (result.response === 0) {
          autoUpdater.downloadUpdate();
          mainWindow.webContents.send('update-message', 'Downloading update...');
      }
  });
});

autoUpdater.on('update-not-available', () => {
  mainWindow.webContents.send('update-message', 'You are using the latest version.');
});

autoUpdater.on('download-progress', (progressObj) => {
  mainWindow.webContents.send('update-progress', progressObj.percent);
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update Ready',
      message: 'Update downloaded. The application will restart to install the update.',
      buttons: ['Restart']
  }).then(() => {
      autoUpdater.quitAndInstall();
  });
});

autoUpdater.on('error', (err) => {
  mainWindow.webContents.send('update-error', err.message);
  log.error('Update error:', err);
});

ipcMain.handle('open-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
          { name: 'Media Files', extensions: ['mp4', 'mkv', 'avi', 'mp3', 'wav', 'webm'] }
      ]
  });
  return result.filePaths;
});

 ipcMain.handle('check-for-updates', () => {
  autoUpdater.checkForUpdatesAndNotify();
});

 ipcMain.on('toggle-menu-bar', (_, show) => {
  mainWindow.setMenuBarVisibility(show);
  mainWindow.setAutoHideMenuBar(!show);
});

let currentSubtitleTrack = -1;

// Add these IPC handlers in your main.js
ipcMain.handle('open-subtitle-file', async () => {
  return dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
          { name: 'Subtitle Files', extensions: ['srt', 'vtt', 'ass', 'ssa'] }
      ]
  });
});

ipcMain.handle('read-subtitle-file', async (_, filePath) => {
  try {
      return await fs.readFile(filePath, 'utf8');
  } catch (error) {
      console.error('Error reading subtitle file:', error);
      throw error;
  }
});

// Handle dynamic subtitle track menu updates
ipcMain.on('update-subtitle-tracks', (event, tracks) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  const menu = Menu.getApplicationMenu();
  const subtitlesMenu = menu.items.find(item => item.label === 'Subtitles');
  const trackSubmenu = subtitlesMenu.submenu.items.find(item => item.label === 'Select Subtitle Track');
  
  trackSubmenu.submenu = Menu.buildFromTemplate(
      tracks.map((track, index) => ({
          label: track.label,
          type: 'radio',
          checked: index === currentSubtitleTrack,
          click: () => {
              window.webContents.send('select-subtitle-track', index);
          }
      }))
  );
  
  Menu.setApplicationMenu(menu);
});
