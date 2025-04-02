const { app, dialog, Notification } = require("electron");
const { getCurrentTheme } = require("./src/themes");
const { RELEASE_NOTES } = require("./release-notes");
const { autoUpdater } = require("electron-updater");
const Store = require("electron-store");
const store = new Store();
const { BrowserWindow } = require("electron");

const createMenuTemplate = (mainWindow) => [
  {
    label: "File",
    submenu: [
      {
        label: "Open Files",
        accelerator: "CmdOrCtrl+O",
        click: () => mainWindow.webContents.send("menu-open-files"),
      },
      {
        label: "Open Folder",
        accelerator: "CmdOrCtrl+Shift+O",
        click: () => mainWindow.webContents.send("menu-open-folder"),
      },
      {
        label: "Clear Playlist",
        accelerator: "CmdOrCtrl+Shift+C",
        click: () => mainWindow.webContents.send("menu-clear-playlist"),
      },
      { type: "separator" },
      {
        label: "Exit",
        accelerator: process.platform === "darwin" ? "Cmd+Q" : "Alt+F4",
        click: () => app.quit(),
      },
    ],
  },
  {
    label: "View",
    submenu: [
      {
        label: "Themes",
        submenu: [
          {
            label: "Default",
            type: "radio",
            checked: getCurrentTheme() === "default",
            click: () => mainWindow.webContents.send("change-theme", "default"),
          },
          {
            label: "Cosmos",
            type: "radio",
            checked: getCurrentTheme() === "cosmos",
            click: () => mainWindow.webContents.send("change-theme", "cosmos"),
          },
          {
            label: "Blood Moon",
            type: "radio",
            checked: getCurrentTheme() === "bloodMoon",
            click: () =>
              mainWindow.webContents.send("change-theme", "bloodMoon"),
          },
          {
            label: "Crystal Wave",
            type: "radio",
            checked: getCurrentTheme() === "crystalWave",
            click: () =>
              mainWindow.webContents.send("change-theme", "crystalWave"),
          },
          {
            label: "Solar Flare",
            type: "radio",
            checked: getCurrentTheme() === "solarFlare",
            click: () =>
              mainWindow.webContents.send("change-theme", "solarFlare"),
          },
          {
            label: "Aurora Breeze",
            type: "radio",
            checked: getCurrentTheme() === "auroraBreeze",
            click: () =>
              mainWindow.webContents.send("change-theme", "auroraBreeze"),
          },
          {
            label: "Neon Dreams",
            type: "radio",
            checked: getCurrentTheme() === "neonDreams",
            click: () =>
              mainWindow.webContents.send("change-theme", "neonDreams"),
          },
          {
            label: "Emerald Forest",
            type: "radio",
            checked: getCurrentTheme() === "emeraldForest",
            click: () =>
              mainWindow.webContents.send("change-theme", "emeraldForest"),
          },
          {
            label: "Crimson Night",
            type: "radio",
            checked: getCurrentTheme() === "crimsonNight",
            click: () =>
              mainWindow.webContents.send("change-theme", "crimsonNight"),
          },
        ],
      },
    ],
  },
  {
    label: "Playback",
    submenu: [
      {
        label: "Play/Pause",
        accelerator: "Space",
        click: () => mainWindow.webContents.send("menu-play-pause"),
      },
      {
        label: "Previous",
        accelerator: "CmdOrCtrl+Left",
        click: () => mainWindow.webContents.send("menu-previous"),
      },
      {
        label: "Next",
        accelerator: "CmdOrCtrl+Right",
        click: () => mainWindow.webContents.send("menu-next"),
      },
      { type: "separator" },
      {
        label: "Toggle Fullscreen",
        accelerator: "F",
        click: () => mainWindow.webContents.send("menu-fullscreen"),
      },
    ],
  },
  {
    label: "Help",
    submenu: [
      {
        label: "Remember Playback Position",
        type: "checkbox",
        checked: store.get("rememberPlayback", true), // Default to true for existing users
        click: (menuItem) => {
          store.set("rememberPlayback", menuItem.checked);
          mainWindow.webContents.send(
            "toggle-remember-playback",
            menuItem.checked,
          );
        },
      },
      {
        label: "Hardware Acceleration",
        type: "checkbox",
        checked: store.get("hardwareAcceleration", true),
        click: (menuItem) => {
          store.set("hardwareAcceleration", menuItem.checked);

          // Show dialog informing user about restart requirement
          dialog
            .showMessageBox({
              type: "info",
              title: "Restart Required",
              message:
                "Hardware acceleration changes will take effect after restarting the application.",
              buttons: ["Restart Now", "Later"],
              defaultId: 0,
              cancelId: 1,
            })
            .then((result) => {
              if (result.response === 0) {
                // Restart the app
                app.relaunch();
                app.exit();
              }
            });

          // Still send the event to update UI elements if needed
          BrowserWindow.getAllWindows().forEach((win) => {
            win.webContents.send(
              "toggle-hardware-acceleration",
              menuItem.checked,
            );
          });
        },
      },
      {
        label: "Release Notes",
        click: () => {
          const currentVersion = app.getVersion();
          let message = `Current Version: ${currentVersion}\n\nRelease Notes:\n`;

          // First try to get GitHub release notes for current version
          const githubNotes = store.get(`githubReleaseNotes.${currentVersion}`);

          if (githubNotes) {
            // Use GitHub release notes if available
            message += githubNotes;
          } else if (RELEASE_NOTES && RELEASE_NOTES[currentVersion]) {
            // Fall back to local release notes if GitHub notes not available
            message += "• " + RELEASE_NOTES[currentVersion].join("\n• ");
          } else {
            message += "No release notes available for current version.";
          }

          dialog.showMessageBox(mainWindow, {
            title: "Release Notes",
            message: message,
            buttons: ["OK"],
          });
        },
      },
      {
        label: "Keyboard Shortcuts",
        click: () => {
          dialog.showMessageBox(mainWindow, {
            title: "Keyboard Shortcuts",
            message:
              "Space: Play/Pause\nF: Toggle Fullscreen\nCtrl+O: Open Files\nCtrl+Shift+O: Open Folder\nCtrl+Left: Previous\nCtrl+Right: Next",
            buttons: ["OK"],
          });
        },
      },
      {
        label: "Check for Updates",
        click: async () => {
          try {
            // Check if notifications are supported
            if (Notification.isSupported()) {
              // Create a notification
              const notification = new Notification({
                title: "Checking for Updates",
                body: "Please wait while checking for updates...",
              });
              notification.show();
            } else {
              // Fallback for systems where notifications aren't supported
              mainWindow.webContents.send(
                "update-message",
                "Checking for updates...",
              );
            }

            try {
              // Start update check
              const updateCheckResult = await autoUpdater.checkForUpdates();

              // We don't need to close the notification as it will auto-dismiss

              if (updateCheckResult && updateCheckResult.updateInfo) {
                const newVersion = updateCheckResult.updateInfo.version;
                const currentVersion = app.getVersion();

                if (newVersion !== currentVersion) {
                  let message = `New Version Available: ${newVersion}\n\nRelease Notes:\n`;

                  if (RELEASE_NOTES && RELEASE_NOTES[newVersion]) {
                    message += "• " + RELEASE_NOTES[newVersion].join("\n• ");
                  } else if (updateCheckResult.updateInfo.releaseNotes) {
                    // Instead of using sanitizeHtml, just use simple text extraction
                    const plainTextNotes =
                      updateCheckResult.updateInfo.releaseNotes
                        .replace(/<[^>]*>/g, "") // Remove HTML tags
                        .replace(/&nbsp;/g, " ") // Replace common HTML entities
                        .replace(/&lt;/g, "<")
                        .replace(/&gt;/g, ">")
                        .replace(/&amp;/g, "&");

                    message += plainTextNotes;
                  } else {
                    message += "No release notes available for new version.";
                  }

                  const downloadChoice = await dialog.showMessageBox(
                    mainWindow,
                    {
                      title: "Update Available",
                      message: message,
                      buttons: ["Download Update", "Later"],
                      defaultId: 0,
                      cancelId: 1,
                      detail: "Would you like to download the new version?",
                    },
                  );

                  if (downloadChoice.response === 0) {
                    dialog.showMessageBox(mainWindow, {
                      title: "Downloading Update",
                      message:
                        "The update is being downloaded in the background. You'll be notified when it's ready to install.",
                      buttons: ["OK"],
                    });

                    mainWindow.webContents.send(
                      "update-message",
                      "Downloading update...",
                    );
                    autoUpdater.downloadUpdate();
                  }
                } else {
                  dialog.showMessageBox(mainWindow, {
                    title: "No Updates Available",
                    message: "You are using the latest version.",
                    buttons: ["OK"],
                  });
                }
              }
            } catch (error) {
              console.error("Error checking for updates:", error);
              dialog.showMessageBox(mainWindow, {
                title: "Update Error",
                message: "Failed to check for updates.",
                detail: error.message,
                buttons: ["OK"],
              });
            }
          } catch (error) {
            console.error("Error initiating update check:", error);
            dialog.showMessageBox(mainWindow, {
              title: "Update Error",
              message: "Failed to check for updates.",
              detail: error.message,
              buttons: ["OK"],
            });
          }
        },
      },
      {
        label: "About",
        click: () => {
          dialog.showMessageBox(mainWindow, {
            title: "About Fury",
            message: "Fury Media Player\nVersion " + app.getVersion(),
            buttons: ["OK"],
          });
        },
      },
      {
        label: "Toggle Developer Tools",
        accelerator:
          process.platform === "darwin" ? "Cmd+Alt+I" : "Ctrl+Shift+I",
        click: () => mainWindow.webContents.toggleDevTools(),
      },
    ],
  },
];

module.exports = createMenuTemplate;
