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
                label: 'Load Subtitles',
                accelerator: 'CmdOrCtrl+Shift+S',
                click: async () => {
                    const result = await dialog.showOpenDialog(mainWindow, {
                        properties: ['openFile'],
                        filters: [
                            { name: 'Subtitle Files', extensions: ['vtt', 'srt', 'ass', 'ssa'] }
                        ]
                    });
                    if (!result.canceled) {
                        mainWindow.webContents.send('menu-load-subtitles', result.filePaths);
                    }
                }
            },
            {
                label: 'Toggle Subtitles',
                accelerator: 'CmdOrCtrl+Shift+V',
                click: () => mainWindow.webContents.send('menu-toggle-subtitles')
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
                        message: 'Space: Play/Pause\nF: Toggle Fullscreen\nCtrl+O: Open Files\nCtrl+Shift+S: Load Subtitles\nCtrl+Shift+V: Toggle Subtitles\nCtrl+Left: Previous\nCtrl+Right: Next',
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