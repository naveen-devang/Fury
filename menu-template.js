const { app, dialog } = require('electron');

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
                label: 'Load Subtitle',
                accelerator: 'CmdOrCtrl+Shift+S',
                click: () => mainWindow.webContents.send('menu-load-subtitle')
            },
            {
                label: 'Clear Playlist',
                accelerator: 'CmdOrCtrl+Shift+C',
                click: () => mainWindow.webContents.send('menu-clear-playlist')
            },
            { type: 'separator' },
            {
                label: 'Toggle Developer Tools',
                accelerator: 'F12',
                click: () => mainWindow.webContents.toggleDevTools()
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
        label: 'Subtitles',
        submenu: [
            {
                label: 'Toggle Subtitles',
                accelerator: 'CmdOrCtrl+Shift+V',
                click: () => mainWindow.webContents.send('menu-toggle-subtitles')
            },
            {
                label: 'Load Subtitle File',
                accelerator: 'CmdOrCtrl+Shift+S',
                click: () => mainWindow.webContents.send('menu-load-subtitle')
            },
            { type: 'separator' },
            {
                label: 'Increase Subtitle Delay',
                accelerator: 'H',
                click: () => mainWindow.webContents.send('menu-subtitle-delay', 0.5)
            },
            {
                label: 'Decrease Subtitle Delay',
                accelerator: 'G',
                click: () => mainWindow.webContents.send('menu-subtitle-delay', -0.5)
            },
            { type: 'separator' },
            {
                label: 'Increase Font Size',
                accelerator: 'CmdOrCtrl+Shift+Up',
                click: () => mainWindow.webContents.send('menu-subtitle-font-size', 1)
            },
            {
                label: 'Decrease Font Size',
                accelerator: 'CmdOrCtrl+Shift+Down',
                click: () => mainWindow.webContents.send('menu-subtitle-font-size', -1)
            },
            { type: 'separator' },
            {
                label: 'Select Subtitle Track',
                submenu: [] // This will be populated dynamically
            }
        ]
    },
    {
        label: 'Help',
        submenu: [
            {
                label: 'Keyboard Shortcuts',
                click: () => {
                    dialog.showMessageBox(mainWindow, {
                        title: 'Keyboard Shortcuts',
                        message: 'Space: Play/Pause\nF: Toggle Fullscreen\nCtrl+O: Open Files\nCtrl+Shift+S: Load Subtitles\nCtrl+Shift+V: Toggle Subtitles\nH: Increase Subtitle Delay\nG: Decrease Subtitle Delay\nCtrl+Shift+Up: Increase Subtitle Size\nCtrl+Shift+Down: Decrease Subtitle Size\nCtrl+Left: Previous\nCtrl+Right: Next',
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
            }
        ]
    }
];


module.exports = createMenuTemplate;