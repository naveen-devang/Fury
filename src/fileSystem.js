const Store = require('electron-store');
const store = new Store();
const fs = require('fs').promises;
const path = require('path');
const { ipcRenderer } = require('electron');

async function getMediaFilesFromFolder(folderPath) {
    const mediaFiles = [];
    
    async function scan(dir) {
        const files = await fs.readdir(dir);
        
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = await fs.stat(filePath);
            
            if (stat.isDirectory()) {
                await scan(filePath);
            } else {
                const ext = path.extname(filePath).toLowerCase();
                if (supportedFormats.includes(ext)) {
                    mediaFiles.push(filePath);
                }
            }
        }
    }
    
    await scan(folderPath);
    return mediaFiles;
}

// Add new function to handle opening folder
async function openFolder() {
    const result = await ipcRenderer.invoke('open-folder');
    if (!result || !result.filePaths || result.filePaths.length === 0) return;
    
    const folderPath = result.filePaths[0];
    try {
        const mediaFiles = await getMediaFilesFromFolder(folderPath);
        
        if (mediaFiles.length === 0) {
            alert('No supported media files found in the selected folder.');
            return;
        }
        
        // Add files with basic info first
        const promises = mediaFiles.map(addToPlaylist);
        
        if (currentIndex === -1) {
            currentIndex = 0;
            playFile(mediaFiles[0]);
        }
        
        // Save playlist after basic info is added
        store.set('playlist', playlist);
        
        await Promise.allSettled(promises);
        store.set('playlist', playlist); // Update with complete metadata
        
    } catch (error) {
        console.error('Error scanning folder:', error);
        alert('Error scanning folder for media files.');
    }
}

async function openFiles() {
    const filePaths = await ipcRenderer.invoke('open-files');
    if (!filePaths || filePaths.length === 0) return;

    // Add files with basic info first
    const promises = filePaths.map(addToPlaylist);

    if (currentIndex === -1) {
        currentIndex = 0;
        playFile(filePaths[0]);
    }

    // Save playlist after basic info is added
    store.set('playlist', playlist);

    await Promise.allSettled(promises);
    store.set('playlist', playlist); // Update with complete metadata
}


module.exports = { getMediaFilesFromFolder, openFiles, openFolder };