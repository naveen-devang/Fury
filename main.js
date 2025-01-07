const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const createMenuTemplate = require('./menu-template');
const store = new Store();
const { DOMParser } = require('xmldom');

const srt2vtt = require('srt-to-vtt');
const { Transform } = require('stream');
const { Readable } = require('stream');

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
  const releaseNotes = info.releaseNotes || 'No release notes available';
  const formattedNotes = typeof releaseNotes === 'string' ? 
    releaseNotes : 
    releaseNotes.reduce((acc, note) => acc + `${note.version}\n${note.note}\n\n`, '');

  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Update Available',
    message: `Version ${info.version} is available.`,
    detail: `Release Notes:\n${formattedNotes}\n\nWould you like to download it now?`,
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

ipcMain.handle('open-subtitle', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
          { name: 'Subtitle Files', 
            extensions: ['srt', 'vtt', 'ass', 'ssa', 'sub'] 
          }
      ]
  });
  return result.filePaths;
});

ipcMain.handle('read-subtitle-file', async (_, filePath) => {
  try {
      const content = await fs.readFile(filePath, 'utf8');
      const extension = path.extname(filePath).toLowerCase();
      
      // Convert content based on file type
      switch (extension) {
          case '.srt':
              // Convert SRT to VTT
              return new Promise((resolve, reject) => {
                  let vttContent = '';
                  const srtStream = Readable.from(content);
                  const converter = new srt2vtt();
                  
                  converter.on('data', chunk => {
                      vttContent += chunk.toString();
                  });
                  
                  converter.on('end', () => {
                      resolve(vttContent);
                  });
                  
                  converter.on('error', (err) => {
                      reject(new Error(`Error converting SRT: ${err.message}`));
                  });
                  
                  srtStream.pipe(converter);
              });
              
          case '.vtt':
              // VTT can be used as-is
              return content;
              
          case '.ass':
          case '.ssa':
              // Convert ASS/SSA to VTT format
              return convertAssToVtt(content);
              
          case '.ttml':
          case '.dfxp':  // DFXP is another name for TTML
              // Convert TTML to VTT format
              return convertTtmlToVtt(content);
              
          default:
              throw new Error(`Unsupported subtitle format: ${extension}`);
      }
  } catch (error) {
      throw new Error(`Error reading subtitle file: ${error.message}`);
  }
});

ipcMain.handle('read-directory', async (_, dirPath) => {
  try {
      return await fs.readdir(dirPath);
  } catch (error) {
      console.error('Error reading directory:', error);
      throw error;
  }
});

function convertAssToVtt(assContent) {
  const lines = assContent.split('\n');
  let vttContent = 'WEBVTT\n\n';
  let inEvents = false;
  let formatLine = '';
  
  for (const line of lines) {
      if (line.startsWith('[Events]')) {
          inEvents = true;
          continue;
      }
      
      if (inEvents) {
          if (line.startsWith('Format:')) {
              formatLine = line.substring(7).split(',').map(f => f.trim());
              continue;
          }
          
          if (line.startsWith('Dialogue:')) {
              const parts = line.substring(9).split(',');
              if (parts.length >= formatLine.length) {
                  // Extract start time, end time, and text
                  const startTime = convertAssTime(parts[1].trim());
                  const endTime = convertAssTime(parts[2].trim());
                  const textIndex = formatLine.indexOf('Text');
                  const text = parts.slice(textIndex).join(',').trim();
                  
                  // Clean up ASS tags
                  const cleanText = text.replace(/\{[^}]+\}/g, '');
                  
                  // Add to VTT content
                  vttContent += `${startTime} --> ${endTime}\n${cleanText}\n\n`;
              }
          }
      }
  }
  
  return vttContent;
}

function convertAssTime(assTime) {
  // Convert ASS time format (H:MM:SS.CC) to WebVTT format (HH:MM:SS.mmm)
  const [h, m, s] = assTime.split(':');
  const [sec, cs] = s.split('.');
  const ms = cs ? (parseInt(cs) * 10) : 0;
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:${sec.padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

function convertTtmlToVtt(ttmlContent) {
  // First check if content is valid XML
  let xmlDoc;
  try {
      const DOMParser = require('xmldom').DOMParser;
      xmlDoc = new DOMParser().parseFromString(ttmlContent, "text/xml");
  } catch (error) {
      throw new Error(`Invalid TTML format: ${error.message}`);
  }

  // Initialize VTT content
  let vttContent = 'WEBVTT\n\n';
  
  // Get all subtitle elements (p tags)
  const subtitles = xmlDoc.getElementsByTagName('p');
  
  for (let i = 0; i < subtitles.length; i++) {
      const subtitle = subtitles[i];
      const begin = convertTtmlTime(subtitle.getAttribute('begin'));
      const end = convertTtmlTime(subtitle.getAttribute('end'));
      
      if (begin && end) {
          // Get text content and clean it
          let text = subtitle.textContent.trim();
          
          // Handle line breaks in TTML
          text = text.replace(/<br\s*\/?>/gi, '\n');
          
          // Add cue to VTT
          vttContent += `${begin} --> ${end}\n${text}\n\n`;
      }
  }
  
  return vttContent;
}

function convertTtmlTime(timeStr) {
  if (!timeStr) return null;
  
  // Handle different TTML time formats
  const ticksMatch = timeStr.match(/(\d+)t/);
  if (ticksMatch) {
      // Convert TTML ticks (1 tick = 10ms)
      const ticks = parseInt(ticksMatch[1]);
      const seconds = ticks / 10000;
      return formatVttTime(seconds);
  }
  
  const timeMatch = timeStr.match(/(\d+):(\d+):(\d+)\.?(\d+)?/);
  if (timeMatch) {
      const [_, hours, minutes, seconds, milliseconds] = timeMatch;
      const totalSeconds = parseInt(hours) * 3600 + 
                         parseInt(minutes) * 60 + 
                         parseInt(seconds) +
                         (milliseconds ? parseInt(milliseconds) / 1000 : 0);
      return formatVttTime(totalSeconds);
  }
  
  return null;
}

function formatVttTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
}

 ipcMain.handle('check-for-updates', () => {
  autoUpdater.checkForUpdatesAndNotify();
});

 ipcMain.on('toggle-menu-bar', (_, show) => {
  mainWindow.setMenuBarVisibility(show);
  mainWindow.setAutoHideMenuBar(!show);
});