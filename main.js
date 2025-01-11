const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const createMenuTemplate = require('./menu-template');
const RELEASE_NOTES = require('./release-notes');
const store = new Store();
const isHardwareAccelerated = store.get('hardwareAcceleration', true);
const isDev = require('electron-is-dev');

if (isHardwareAccelerated) {
  app.commandLine.appendSwitch('force_high_performance_gpu');
  app.commandLine.appendSwitch('ignore-gpu-blacklist');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
}

if (!isDev) {
  process.env.FFMPEG_PATH = path.join(process.resourcesPath, 'bin', 'ffmpeg', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  process.env.FFPROBE_PATH = path.join(process.resourcesPath, 'bin', 'ffprobe', process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
}

// Configure logging
log.transports.file.level = 'debug';
autoUpdater.logger = log;

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      minWidth: 800, 
      minHeight: 600, 
      webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          powerPreferences: 'high-performance'
      },
      autoHideMenuBar: false,
      frame: true
  });
  
  // Set the application menu
  menuTemplate = createMenuTemplate(mainWindow);
  const menu = Menu.buildFromTemplate(menuTemplate);
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
  const version = info.version;
  let releaseNotes = 'No release notes available';

  if (RELEASE_NOTES[version]) {
    releaseNotes = '• ' + RELEASE_NOTES[version].join('\n• ');
  } else if (info.releaseNotes) {
    if (typeof info.releaseNotes === 'string') {
      releaseNotes = info.releaseNotes;
    } else if (Array.isArray(info.releaseNotes)) {
      releaseNotes = info.releaseNotes
        .map((note) => `${note.version}\n${note.note}`)
        .join('\n\n');
    }
  }

  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Available',
    message: `Version ${version} is available.`,
    detail: `Release Notes:\n${releaseNotes}\n\nWould you like to download it now?`,
    buttons: ['Yes', 'No'],
    cancelId: 1,
    defaultId: 0,
  }).then((result) => {
    if (result.response === 0) {
      autoUpdater.downloadUpdate();
      mainWindow.webContents.send('update-message', 'Downloading update...');
    }
  });
});

autoUpdater.on('download-progress', (progressObj) => {
  mainWindow.webContents.send('update-progress', progressObj.percent);
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Ready',
    message: 'Update downloaded. Would you like to install it now? The application will restart.',
    detail: 'If you choose "No", the update will be installed the next time you restart the application.',
    buttons: ['Yes', 'No'],
    cancelId: 1,
    defaultId: 1
  }).then((result) => {
    if (result.response === 0) {  // Only install if 'Yes' is clicked
      autoUpdater.quitAndInstall(false, true);
    }
  });
});

autoUpdater.on('update-not-available', () => {
  mainWindow.webContents.send('update-message', 'You are using the latest version.');
});

autoUpdater.on('error', (err) => {
  mainWindow.webContents.send('update-error', err.message);
  log.error('Update error:', err);
});

ipcMain.on('enforce-min-size', (_, dimensions) => {
  mainWindow.setMinimumSize(dimensions.width, dimensions.height);
});

ipcMain.handle('open-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
          { name: 'Media Files', 
            extensions: [
              // Video formats
              'mp4', 'mkv', 'avi', 'webm', 'mov', 'flv', 'm4v', '3gp', 'wmv',
              // Audio formats
              'mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'wma', 'opus'
            ] 
          }
      ]
  });
  return result.filePaths;
});

ipcMain.handle('open-subtitle-file', async () => {
  return dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
          { name: 'Subtitle Files', 
            extensions: ['srt', 'vtt', 'ass', 'ssa', 'sub'] 
          }
      ]
  });
});

 ipcMain.handle('check-for-updates', () => {
  autoUpdater.checkForUpdatesAndNotify();
});

 ipcMain.on('toggle-menu-bar', (_, show) => {
  mainWindow.setMenuBarVisibility(show);
  mainWindow.setAutoHideMenuBar(!show);
});