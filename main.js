const { app, BrowserWindow, ipcMain, dialog, Menu } = require("electron");
const fs = require("fs").promises;
const path = require("path");
const Store = require("electron-store");
const { autoUpdater } = require("electron-updater");
const log = require("electron-log");
const createMenuTemplate = require("./menu-template");
const store = new Store();
const isHardwareAccelerated = store.get("hardwareAcceleration", true);

const remoteMain = require("@electron/remote/main");
remoteMain.initialize();

if (isHardwareAccelerated) {
  app.commandLine.appendSwitch("force_high_performance_gpu");
  app.commandLine.appendSwitch("ignore-gpu-blacklist");
  app.commandLine.appendSwitch("enable-gpu-rasterization");
  app.commandLine.appendSwitch("enable-zero-copy");
  // Add these new switches
  app.commandLine.appendSwitch("enable-accelerated-video-decode");
  app.commandLine.appendSwitch("enable-native-gpu-memory-buffers");
  app.commandLine.appendSwitch("enable-hardware-overlays", "single-fullscreen");
  app.commandLine.appendSwitch("enable-features", "VaapiVideoDecoder");
  app.commandLine.appendSwitch("enable-features", "PlatformHEVCDecoderSupport");
}

// Configure logging
log.transports.file.level = "debug";
autoUpdater.logger = log;

let mainWindow;

let fileToOpen = null;

// Handle files opened through OS
function handleFileOpen(event, filePath) {
  event?.preventDefault();

  // Normalize the file path
  filePath = filePath.replace(/^"(.*)"$/, "$1"); // Remove quotes if present

  if (mainWindow) {
    // If window is already open, send the file path to renderer
    mainWindow.webContents.send("file-opened", filePath);
  } else {
    // Store the file path to be handled after window creation
    fileToOpen = filePath;
  }
}

// Register file open handlers
if (process.platform === "win32") {
  // For Windows - handle both protocol and file associations
  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    app.quit();
  } else {
    app.on("second-instance", (event, commandLine) => {
      // Someone tried to run a second instance, focus our window instead
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();

        // Find and handle media file path from second instance
        const filePath = commandLine.find((arg) => {
          return /\.(mp4|mkv|avi|webm|mov|flv|m4v|3gp|wmv|ts|mp3|wav|ogg|aac|m4a|flac|wma|opus)$/i.test(
            arg,
          );
        });

        if (filePath) {
          handleFileOpen(null, filePath);
        }
      }
    });

    // Handle file opened from Explorer
    const filePath = process.argv.slice(1).find((arg) => {
      return /\.(mp4|mkv|avi|webm|mov|flv|m4v|3gp|wmv|ts|mp3|wav|ogg|aac|m4a|flac|wma|opus)$/i.test(
        arg,
      );
    });

    if (filePath) {
      fileToOpen = filePath;
    }
  }
} else {
  // For macOS
  app.on("open-file", handleFileOpen);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemote: true,
      powerPreferences: "high-performance",
      contentSecurityPolicy: `
          default-src 'self';
          script-src 'self';
          style-src 'self' 'unsafe-inline';
          media-src 'self' file:;
          img-src 'self' data: file:;
          font-src 'self';
          connect-src 'self';
        `,
    },
    autoHideMenuBar: false,
    frame: true,
  });

  mainWindow.webContents.on("dom-ready", () => {
    mainWindow.webContents.executeJavaScript(`
      document.addEventListener('selectstart', (e) => e.preventDefault());
    `);
  });

  // Enable remote module for this window
  remoteMain.enable(mainWindow.webContents);

  // Set the application menu
  menuTemplate = createMenuTemplate(mainWindow);
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);

  mainWindow.loadFile("index.html");

  mainWindow.webContents.on("did-finish-load", () => {
    // Check for pending update notification
    const pendingUpdateVersion = store.get("pendingUpdateVersion");
    if (pendingUpdateVersion) {
      // Clear the pending update flag
      store.delete("pendingUpdateVersion");
      // Show the release notes
      showPostUpdateReleaseNotes(pendingUpdateVersion);
    }

    // Handle file opening (keep your existing code)
    if (fileToOpen) {
      setTimeout(() => {
        mainWindow.webContents.send("file-opened", fileToOpen);
        fileToOpen = null;
      }, 500);
    }
  });

  mainWindow.webContents.on("did-finish-load", () => {
    if (fileToOpen) {
      // Short delay to ensure renderer is fully ready
      setTimeout(() => {
        mainWindow.webContents.send("file-opened", fileToOpen);
        fileToOpen = null;
      }, 500);
    }
  });

  autoUpdater.checkForUpdatesAndNotify();
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Auto-updater events
autoUpdater.on("checking-for-update", () => {
  mainWindow.webContents.send("update-message", "Checking for updates...");
});

autoUpdater.on("update-available", (info) => {
  const version = info.version;
  let releaseNotes = "No release notes available";

  if (info.releaseNotes) {
    if (typeof info.releaseNotes === "string") {
      // Clean HTML tags before storing or displaying
      releaseNotes = sanitizeHtml(info.releaseNotes);
    } else if (Array.isArray(info.releaseNotes)) {
      releaseNotes = info.releaseNotes
        .map((note) => `${note.version}\n${sanitizeHtml(note.note)}`)
        .join("\n\n");
    }
  }

  // Store the sanitized release notes for this version
  store.set(`releaseNotes.${version}`, releaseNotes);

  dialog
    .showMessageBox(mainWindow, {
      type: "info",
      title: "Update Available",
      message: `Version ${version} is available.`,
      detail: `Release Notes:\n${releaseNotes}\n\nWould you like to download it now?`,
      buttons: ["Yes", "No"],
      cancelId: 1,
      defaultId: 0,
    })
    .then((result) => {
      if (result.response === 0) {
        autoUpdater.downloadUpdate();
        mainWindow.webContents.send("update-message", "Downloading update...");
      }
    });
});

function sanitizeHtml(html) {
  if (!html) return "";

  // Create a temporary DOM element
  const tempDiv = new (require("jsdom").JSDOM)().window.document.createElement(
    "div",
  );
  tempDiv.innerHTML = html;

  // Extract the text content (this strips all HTML tags)
  let text = tempDiv.textContent || tempDiv.innerText || "";

  // Additional cleanup for common entities and markdown links
  text = text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Convert markdown links [text](url) to "text (url)"
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");

  return text;
}

autoUpdater.on("download-progress", (progressObj) => {
  mainWindow.webContents.send("update-progress", progressObj.percent);
});

function showPostUpdateReleaseNotes(version) {
  // Get the stored release notes from electron-store
  const releaseNotes = store.get(`releaseNotes.${version}`);

  if (releaseNotes) {
    // Make sure we sanitize here as well
    const cleanedNotes = sanitizeHtml(releaseNotes);

    dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "What's New",
      message: `Updates in version ${version}`,
      detail: cleanedNotes,
      buttons: ["OK"],
      defaultId: 0,
    });
  }
}

autoUpdater.on("update-downloaded", (info) => {
  dialog
    .showMessageBox(mainWindow, {
      type: "info",
      title: "Update Ready",
      message:
        "Update downloaded. Would you like to install it now? The application will restart.",
      detail:
        'If you choose "No", the update will be installed the next time you restart the application.',
      buttons: ["Yes", "No"],
      cancelId: 1,
      defaultId: 1,
    })
    .then((result) => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall(false, true);
      }
    });

  if (info.releaseNotes) {
    store.set(
      `githubReleaseNotes.${info.version}`,
      sanitizeHtml(info.releaseNotes),
    );
  }
});

autoUpdater.on("update-not-available", () => {
  mainWindow.webContents.send(
    "update-message",
    "You are using the latest version.",
  );
});

autoUpdater.on("error", (err) => {
  mainWindow.webContents.send("update-error", err.message);
  log.error("Update error:", err);
});

ipcMain.on("enforce-min-size", (_, dimensions) => {
  mainWindow.setMinimumSize(dimensions.width, dimensions.height);
});

ipcMain.handle("open-files", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Media Files",
        extensions: [
          // Video formats
          "mp4",
          "mkv",
          "avi",
          "webm",
          "mov",
          "flv",
          "m4v",
          "3gp",
          "wmv",
          "ts",
          // Audio formats
          "mp3",
          "wav",
          "ogg",
          "aac",
          "m4a",
          "flac",
          "wma",
          "opus",
        ],
      },
    ],
  });
  return result.filePaths;
});

ipcMain.handle("open-folder", async () => {
  return dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
});

ipcMain.handle("open-subtitle-file", async () => {
  return dialog.showOpenDialog(mainWindow, {
    properties: ["openFile", "multiSelections"],
    filters: [
      {
        name: "Subtitle Files",
        extensions: ["srt", "vtt", "ass", "ssa", "sub"],
      },
    ],
  });
});

ipcMain.handle("check-for-updates", () => {
  autoUpdater.checkForUpdatesAndNotify();
});

ipcMain.on("toggle-menu-bar", (_, show) => {
  mainWindow.setMenuBarVisibility(show);
  mainWindow.setAutoHideMenuBar(!show);
});
