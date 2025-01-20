const { app, dialog } = require('electron');
const { getCurrentTheme } = require('./src/themes');
const { RELEASE_NOTES } = require('./release-notes');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store');
const store = new Store();
const { BrowserWindow } = require('electron');


const createMenuTemplate = (mainWindow) => [
    {
        label: 'File',
        submenu: [
            {
                label: 'Open Files',
                accelerator: 'CmdOrCtrl+O',
                click: () => mainWindow.webContents.send('menu-open-files')
            },
            {
                label: 'Open Folder',
                accelerator: 'CmdOrCtrl+Shift+O',
                click: () => mainWindow.webContents.send('menu-open-folder')
            },
            {
                label: 'Clear Playlist',
                accelerator: 'CmdOrCtrl+Shift+C',
                click: () => mainWindow.webContents.send('menu-clear-playlist')
            },
            { type: 'separator' },
            {
                label: 'Exit',
                accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
                click: () => app.quit()
            }
        ]
    },
    {
        label: 'View',
        submenu: [
            {
                label: 'Themes',
                submenu: [
                    {
                        label: 'Default',
                        type: 'radio',
                        checked: getCurrentTheme() === 'default',
                        click: () => mainWindow.webContents.send('change-theme', 'default')
                    },
                    {
                        label: 'Cosmos',
                        type: 'radio',
                        checked: getCurrentTheme() === 'cosmos',
                        click: () => mainWindow.webContents.send('change-theme', 'cosmos')
                    },
                    {
                        label: 'Blood Moon',
                        type: 'radio',
                        checked: getCurrentTheme() === 'bloodMoon',
                        click: () => mainWindow.webContents.send('change-theme', 'bloodMoon')
                    },
                    {
                        label: 'Crystal Wave',
                        type: 'radio',
                        checked: getCurrentTheme() === 'crystalWave',
                        click: () => mainWindow.webContents.send('change-theme', 'crystalWave')
                    },
                    {
                        label: 'Solar Flare',
                        type: 'radio',
                        checked: getCurrentTheme() === 'solarFlare',
                        click: () => mainWindow.webContents.send('change-theme', 'solarFlare')
                    },
                    {
                        label: 'Aurora Breeze',
                        type: 'radio',
                        checked: getCurrentTheme() === 'auroraBreeze',
                        click: () => mainWindow.webContents.send('change-theme', 'auroraBreeze')
                    },
                    {
                        label: 'Neon Dreams',
                        type: 'radio',
                        checked: getCurrentTheme() === 'neonDreams',
                        click: () => mainWindow.webContents.send('change-theme', 'neonDreams')
                    },
                    {
                        label: 'Emerald Forest',
                        type: 'radio',
                        checked: getCurrentTheme() === 'emeraldForest',
                        click: () => mainWindow.webContents.send('change-theme', 'emeraldForest')
                    },
                    {
                        label: 'Crimson Night',
                        type: 'radio',
                        checked: getCurrentTheme() === 'crimsonNight',
                        click: () => mainWindow.webContents.send('change-theme', 'crimsonNight')
                    }
                ]
            },
        ]
    },
    {
        label: 'Playback',
        submenu: [
            {
                label: 'Play/Pause',
                accelerator: 'Space',
                click: () => mainWindow.webContents.send('menu-play-pause')
            },
            {
                label: 'Previous',
                accelerator: 'CmdOrCtrl+Left',
                click: () => mainWindow.webContents.send('menu-previous')
            },
            {
                label: 'Next',
                accelerator: 'CmdOrCtrl+Right',
                click: () => mainWindow.webContents.send('menu-next')
            },
            { type: 'separator' },
            {
                label: 'Toggle Fullscreen',
                accelerator: 'F',
                click: () => mainWindow.webContents.send('menu-fullscreen')
            }
        ]
    },
    {
        label: 'Help',
        submenu: [
            {
                label: 'Remember Playback Position',
                type: 'checkbox',
                checked: store.get('rememberPlayback', true), // Default to true for existing users
                click: (menuItem) => {
                    store.set('rememberPlayback', menuItem.checked);
                    mainWindow.webContents.send('toggle-remember-playback', menuItem.checked);
                }
            },
            {
                label: 'Hardware Acceleration',
                type: 'checkbox',
                checked: store.get('hardwareAcceleration', true),
                click: (menuItem) => {
                    store.set('hardwareAcceleration', menuItem.checked);
                    
                    // Show dialog informing user about restart requirement
                    dialog.showMessageBox({
                        type: 'info',
                        title: 'Restart Required',
                        message: 'Hardware acceleration changes will take effect after restarting the application.',
                        buttons: ['Restart Now', 'Later'],
                        defaultId: 0,
                        cancelId: 1
                    }).then(result => {
                        if (result.response === 0) {
                            // Restart the app
                            app.relaunch();
                            app.exit();
                        }
                    });
            
                    // Still send the event to update UI elements if needed
                    BrowserWindow.getAllWindows().forEach(win => {
                        win.webContents.send('toggle-hardware-acceleration', menuItem.checked);
                    });
                }
            },
            {
                label: 'Keyboard Shortcuts',
                click: () => {
                    dialog.showMessageBox(mainWindow, {
                        title: 'Keyboard Shortcuts',
                        message: 'Space: Play/Pause\nF: Toggle Fullscreen\nCtrl+O: Open Files\nCtrl+Shift+O: Open Folder\nCtrl+Left: Previous\nCtrl+Right: Next',
                        buttons: ['OK']
                    });
                }
            },
            {
                label: 'Check for Updates',
                click: () => mainWindow.webContents.send('check-for-updates')
            },
            {
                label: 'About',
                click: () => {
                    dialog.showMessageBox(mainWindow, {
                        title: 'About Fury',
                        message: 'Fury Media Player\nVersion ' + app.getVersion(),
                        buttons: ['OK']
                    });
                }
            },
            {
                label: 'Toggle Developer Tools',
                accelerator: process.platform === 'darwin' ? 'Cmd+Alt+I' : 'Ctrl+Shift+I',
                click: () => mainWindow.webContents.toggleDevTools()
            }
        ]
    }
];

module.exports = createMenuTemplate;