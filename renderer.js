const { ipcRenderer } = require('electron');
const { parseFile } = require('music-metadata');
const path = require('path');
const Store = new require('electron-store');
const store = new Store();

const { remote } = require('electron');

let playlist = [];
let currentIndex = -1;
let isLooping = false;
let isShuffling = false;

const mediaPlayer = document.getElementById('media-player');
const playPauseBtn = document.getElementById('play-pause');
const timeSlider = document.getElementById('time-slider');
const volumeSlider = document.getElementById('volume-slider');
const timeDisplay = document.getElementById('time-display');


const SubtitleTrackManager = require('./track-manager');
const SubtitleControls = require('./subtitle-controls');
const { parseSubtitles } = require('./subtitle-parser');

const fs = require('fs').promises;

// Load saved playlist
const savedPlaylist = store.get('playlist', []);
if (savedPlaylist.length > 0) {
    playlist = savedPlaylist;
    updatePlaylistUI();
}

// Setup event listeners
document.getElementById('open-file').addEventListener('click', openFiles);
document.getElementById('play-pause').addEventListener('click', togglePlayPause);
document.getElementById('previous').addEventListener('click', playPrevious);
document.getElementById('next').addEventListener('click', playNext);
document.getElementById('mute').addEventListener('click', toggleMute);
document.getElementById('fullscreen').addEventListener('click', toggleFullscreen);
document.getElementById('toggle-loop').addEventListener('click', toggleLoop);
document.getElementById('toggle-shuffle').addEventListener('click', toggleShuffle);
document.getElementById('load-subtitle').addEventListener('click', loadSubtitles);
document.getElementById('playback-speed').addEventListener('change', changePlaybackSpeed);
volumeSlider.addEventListener('input', updateVolume);
timeSlider.addEventListener('input', seekMedia);

// Media player events
mediaPlayer.addEventListener('timeupdate', updateTimeDisplay);
mediaPlayer.addEventListener('ended', handleMediaEnd);
mediaPlayer.addEventListener('loadedmetadata', () => {
    timeSlider.max = mediaPlayer.duration;
    updateTimeDisplay();
});

const trackManager = new SubtitleTrackManager(mediaPlayer);
const subtitleControls = new SubtitleControls(trackManager, document.querySelector('.advanced-controls'));

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;

    switch (e.code) {
        case 'Space':
            togglePlayPause();
            break;
        case 'ArrowLeft':
            mediaPlayer.currentTime = Math.max(0, mediaPlayer.currentTime - 10);
            break;
        case 'ArrowRight':
            mediaPlayer.currentTime = Math.min(mediaPlayer.duration, mediaPlayer.currentTime + 10);
            break;
        case 'ArrowUp':
            mediaPlayer.volume = Math.min(1, mediaPlayer.volume + 0.1);
            volumeSlider.value = mediaPlayer.volume * 100;
            break;
        case 'ArrowDown':
            mediaPlayer.volume = Math.max(0, mediaPlayer.volume - 0.1);
            volumeSlider.value = mediaPlayer.volume * 100;
            break;
        case 'KeyM':
            toggleMute();
            break;
        case 'KeyF':
            toggleFullscreen();
            break;
        case 'KeyS': // Add shortcut for subtitles toggle
            toggleSubtitles();
            break;
    }
});

async function openFiles() {
    const filePaths = await ipcRenderer.invoke('open-files');
    if (filePaths && filePaths.length > 0) {
        for (const filePath of filePaths) {
            await addToPlaylist(filePath);
        }
        if (currentIndex === -1) {
            currentIndex = 0;
            playFile(playlist[0].path);
        }
        store.set('playlist', playlist);
    }
}

async function addToPlaylist(filePath) {
    try {
        const metadata = await parseFile(filePath);
        playlist.push({
            path: filePath,
            metadata: {
                title: metadata.common.title || path.basename(filePath),
                artist: metadata.common.artist || 'Unknown Artist',
                duration: metadata.format.duration || 0
            }
        });
        updatePlaylistUI();
    } catch (error) {
        console.error('Error adding file to playlist:', error);
    }
}

function updatePlaylistUI() {
    const playlistElement = document.getElementById('playlist');
    playlistElement.innerHTML = '';

    playlist.forEach((item, index) => {
        const element = document.createElement('div');
        element.className = `playlist-item ${index === currentIndex ? 'active' : ''}`;
        element.innerHTML = `
            <div class="playlist-item-content">
                <span class="title">${item.metadata.title}</span>
                <div class="playlist-item-controls">
                    <span class="duration">${formatTime(item.metadata.duration)}</span>
                    <button class="remove-button">X</button>
                </div>
            </div>
        `;
        
        // Add click handler for playing the item
        element.querySelector('.playlist-item-content').addEventListener('click', (e) => {
            if (!e.target.classList.contains('remove-button')) {
                currentIndex = index;
                playFile(item.path);
            }
        });
        
        // Add click handler for remove button
        element.querySelector('.remove-button').addEventListener('click', (e) => {
            e.stopPropagation();
            removeFromPlaylist(index);
        });
        
        playlistElement.appendChild(element);
    });
}

async function playFile(filePath) {
    mediaPlayer.src = `file://${filePath}`;
    mediaPlayer.play();
    playPauseBtn.textContent = 'Pause';
    updatePlaylistUI();
    updateWindowTitle();
    
    // Clear existing subtitles before loading new ones
    trackManager.removeAllTracks();
    
    // Check for subtitles when playing a file
    await findSubtitlesInFolder(filePath);
}

function toggleSubtitles() {
    const tracks = trackManager.getTracksList();
    if (!tracks || tracks.length === 0) return; // No tracks available
    
    const currentTrack = tracks.find(track => track.isActive);
    
    if (currentTrack) {
        // Just hide the current track without removing it
        trackManager.setCurrentTrack(null);
    } else {
        // Show the first track
        trackManager.setCurrentTrack(tracks[0].path);
    }
}

function togglePlayPause() {
    if (mediaPlayer.paused) {
        mediaPlayer.play();
        playPauseBtn.textContent = 'Pause';
    } else {
        mediaPlayer.pause();
        playPauseBtn.textContent = 'Play';
    }
}

function playNext() {
    if (playlist.length === 0) return;

    if (isShuffling) {
        currentIndex = Math.floor(Math.random() * playlist.length);
    } else {
        currentIndex = (currentIndex + 1) % playlist.length;
    }

    playFile(playlist[currentIndex].path);
}

function playPrevious() {
    if (playlist.length === 0) return;

    if (isShuffling) {
        currentIndex = Math.floor(Math.random() * playlist.length);
    } else {
        currentIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    }

    playFile(playlist[currentIndex].path);
}

function updateTimeDisplay() {
    timeSlider.value = mediaPlayer.currentTime;
    timeDisplay.textContent = `${formatTime(mediaPlayer.currentTime)} / ${formatTime(mediaPlayer.duration)}`;
}

function seekMedia() {
    const time = parseFloat(timeSlider.value);
    mediaPlayer.currentTime = time;
}

function updateVolume() {
    mediaPlayer.volume = volumeSlider.value / 100;
}

function toggleMute() {
    mediaPlayer.muted = !mediaPlayer.muted;
    document.getElementById('mute').textContent = mediaPlayer.muted ? 'Unmute' : 'Mute';
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        const container = document.getElementById('player-container');
        container.requestFullscreen();
        
        // Hide menu bar in fullscreen
        if (process.platform !== 'darwin') { // Not needed for macOS
            ipcRenderer.send('toggle-menu-bar', false);
        }
        
        // Add fullscreen class for styling
        document.body.classList.add('fullscreen');
    } else {
        document.exitFullscreen();
        
        // Show menu bar when exiting fullscreen
        if (process.platform !== 'darwin') {
            ipcRenderer.send('toggle-menu-bar', true);
        }
        
        // Remove fullscreen class
        document.body.classList.remove('fullscreen');
    }
}

document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && process.platform !== 'darwin') {
        ipcRenderer.send('toggle-menu-bar', true);
        document.body.classList.remove('fullscreen');
    }
});

function toggleLoop() {
    isLooping = !isLooping;
    document.getElementById('toggle-loop').textContent = `Loop: ${isLooping ? 'On' : 'Off'}`;
    mediaPlayer.loop = isLooping;
}

function toggleShuffle() {
    isShuffling = !isShuffling;
    document.getElementById('toggle-shuffle').textContent = `Shuffle: ${isShuffling ? 'On' : 'Off'}`;
}

function changePlaybackSpeed(e) {
    mediaPlayer.playbackRate = parseFloat(e.target.value);
}

async function findSubtitlesInFolder(mediaPath) {
    try {
        const mediaDir = path.dirname(mediaPath);
        const mediaName = path.basename(mediaPath, path.extname(mediaPath));
        const subtitleExtensions = ['.srt', '.vtt', '.ass', '.ssa'];
        
        // Read directory contents
        const files = await fs.readdir(mediaDir);
        
        // Filter and process subtitle files
        const subtitleFiles = files.filter(file => {
            const fileBase = path.basename(file, path.extname(file));
            const fileExt = path.extname(file).toLowerCase();
            
            // Match files with same name or starting with media name
            return (fileBase === mediaName || 
                   fileBase.startsWith(mediaName + '.') ||
                   fileBase.startsWith(mediaName + '_')) && 
                   subtitleExtensions.includes(fileExt);
        });

        if (subtitleFiles.length > 0) {
            console.log('Found subtitle files:', subtitleFiles);
            
            // Process each subtitle file
            for (const subtitleFile of subtitleFiles) {
                const subtitlePath = path.join(mediaDir, subtitleFile);
                console.log('Processing subtitle file:', subtitlePath);
                
                try {
                    const vttPath = await parseSubtitles(subtitlePath);
                    console.log('Converted to VTT:', vttPath);
                    
                    const label = path.basename(subtitleFile, path.extname(subtitleFile));
                    const fileUrl = `file:///${vttPath.replace(/\\/g, '/')}`.replace(/\s/g, '%20');
                    
                    // Save subtitle path for future use
                    const savedSubtitles = store.get('savedSubtitles', {});
                    savedSubtitles[mediaPath] = subtitlePath;
                    store.set('savedSubtitles', savedSubtitles);
                    
                    // Add track and log success
                    trackManager.addTrack(fileUrl, 'en', label);
                    console.log('Successfully added subtitle track:', label);
                } catch (error) {
                    console.error('Error processing subtitle file:', subtitlePath, error);
                }
            }
        } else {
            console.log('No matching subtitle files found for:', mediaPath);
        }
    } catch (error) {
        console.error('Error reading directory for subtitles:', error);
    }
}

async function loadSubtitles() {
    try {
        const filePaths = await ipcRenderer.invoke('open-subtitles');
        if (!filePaths || filePaths.length === 0) return;

        for (const filePath of filePaths) {
            const vttPath = await parseSubtitles(filePath);
            const label = path.basename(filePath, path.extname(filePath));
            const fileUrl = `file:///${vttPath.replace(/\\/g, '/')}`.replace(/\s/g, '%20');
            trackManager.addTrack(fileUrl, 'en', label);
        }
    } catch (error) {
        console.error('Error loading subtitles:', error);
        alert('Error loading subtitles. Please check the file format and try again.');
    }
}

// Add cleanup handler
window.addEventListener('beforeunload', () => {
    // Clean up temporary subtitle files
    trackManager.getTracksList().forEach(track => {
        try {
            const localPath = track.path.replace('file:///', '');
            if (fs.existsSync(localPath)) {
                fs.unlinkSync(localPath);
            }
        } catch (err) {
            console.error('Error cleaning up subtitle file:', err);
        }
    });
});

function handleMediaEnd() {
    if (isLooping) {
        mediaPlayer.play();
    } else if (currentIndex < playlist.length - 1) {
        playNext();
    }
}

function updateWindowTitle() {
    if (currentIndex === -1) {
        document.title = 'Fury';
        return;
    }

    const item = playlist[currentIndex];
    document.title = `${item.metadata.title} - Fury`;
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Error handling
mediaPlayer.addEventListener('error', (e) => {
    console.error('Media Player Error:', e);
    alert(`Error playing media: ${mediaPlayer.error.message}`);
    playNext(); // Try playing next file on error
});

// Save playlist before window closes
window.addEventListener('beforeunload', () => {
    store.set('playlist', playlist);
});

// Initialize volume
mediaPlayer.volume = volumeSlider.value / 100;

// Handle drag and drop
document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
});

document.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);
    const mediaFiles = files.filter(file => {
        const ext = path.extname(file.path).toLowerCase();
        return ['.mp4', '.mkv', '.avi', '.mp3', '.wav', '.webm'].includes(ext);
    });

    for (const file of mediaFiles) {
        await addToPlaylist(file.path);
    }

    if (currentIndex === -1 && playlist.length > 0) {
        currentIndex = 0;
        playFile(playlist[0].path);
    }

    store.set('playlist', playlist);
});

function removeFromPlaylist(index) {
    // If removing currently playing item
    if (index === currentIndex) {
        if (playlist.length === 1) {
            // If it's the last item, clear everything
            clearPlaylist();
            return;
        }
        // If not the last item, play next item before removing
        playNext();
        // Adjust currentIndex since we're removing an item
        if (currentIndex > index) {
            currentIndex--;
        }
    } else if (index < currentIndex) {
        // If removing item before current, adjust currentIndex
        currentIndex--;
    }
    
    // Remove the item from playlist
    playlist.splice(index, 1);
    
    // Update UI and store
    updatePlaylistUI();
    store.set('playlist', playlist);
}

// Clear playlist function
function clearPlaylist() {
    playlist = [];
    currentIndex = -1;
    mediaPlayer.src = '';
    updatePlaylistUI();
    updateWindowTitle();
    store.set('playlist', playlist);
}

// Add clear playlist button
const clearButton = document.createElement('button');
clearButton.textContent = 'Clear Playlist';
clearButton.addEventListener('click', clearPlaylist);
document.querySelector('.advanced-controls').appendChild(clearButton);

// Export functions for potential preload script usage
module.exports = {
    openFiles,
    togglePlayPause,
    playNext,
    playPrevious,
    clearPlaylist
};