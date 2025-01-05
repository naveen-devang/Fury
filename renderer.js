const { ipcRenderer } = require('electron');
const { parseFile } = require('music-metadata');
const path = require('path');
const Store = new require('electron-store');
const store = new Store();

let playlist = [];
let currentIndex = -1;
let isLooping = false;
let isShuffling = false;

// DOM Elements
const mediaPlayer = document.getElementById('media-player');
const playPauseBtn = document.getElementById('play-pause');
const timeSlider = document.getElementById('time-slider');
const volumeSlider = document.getElementById('volume-slider');
const timeDisplay = document.getElementById('time-display');
const previousBtn = document.getElementById('previous');
const nextBtn = document.getElementById('next');
const muteBtn = document.getElementById('mute');
const fullscreenBtn = document.getElementById('fullscreen');
const shuffleBtn = document.getElementById('shuffle');
const loopBtn = document.getElementById('loop');
const playbackSpeedSelect = document.getElementById('playback-speed');
const playlistElement = document.getElementById('playlist');


// Initialize player state
let lastVolume = 1;
mediaPlayer.volume = volumeSlider.value / 100;

// Load saved playlist
const savedPlaylist = store.get('playlist', []);
if (savedPlaylist.length > 0) {
    playlist = savedPlaylist;
    updatePlaylistUI();
}

// Event Listeners
playPauseBtn.addEventListener('click', togglePlayPause);
previousBtn.addEventListener('click', playPrevious);
nextBtn.addEventListener('click', playNext);
muteBtn.addEventListener('click', toggleMute);
fullscreenBtn.addEventListener('click', toggleFullscreen);
shuffleBtn.addEventListener('click', toggleShuffle);
loopBtn.addEventListener('click', toggleLoop);
playbackSpeedSelect.addEventListener('change', changePlaybackSpeed);
volumeSlider.addEventListener('input', updateVolume);
timeSlider.addEventListener('input', seekMedia);

// Set initial button states
loopBtn.style.opacity = isLooping ? '1' : '0.5';
shuffleBtn.style.opacity = isShuffling ? '1' : '0.5';

// Media player events
mediaPlayer.addEventListener('timeupdate', updateTimeDisplay);
mediaPlayer.addEventListener('ended', handleMediaEnd);
mediaPlayer.addEventListener('loadedmetadata', () => {
    timeSlider.max = mediaPlayer.duration;
    updateTimeDisplay();
});


function toggleShuffle() {
    isShuffling = !isShuffling;
    shuffleBtn.style.opacity = isShuffling ? '1' : '0.5';
}

function toggleLoop() {
    isLooping = !isLooping;
    loopBtn.style.opacity = isLooping ? '1' : '0.5';
    mediaPlayer.loop = isLooping;
}

function changePlaybackSpeed() {
    mediaPlayer.playbackRate = parseFloat(playbackSpeedSelect.value);
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;

    switch (e.code) {
        case 'Space':
            e.preventDefault();
            togglePlayPause();
            break;
        case 'ArrowLeft':
            if (e.ctrlKey) {
                playPrevious();
            } else {
                mediaPlayer.currentTime = Math.max(0, mediaPlayer.currentTime - 10);
            }
            break;
        case 'ArrowRight':
            if (e.ctrlKey) {
                playNext();
            } else {
                mediaPlayer.currentTime = Math.min(mediaPlayer.duration, mediaPlayer.currentTime + 10);
            }
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
        case 'KeyL':
            toggleLoop();
            break;
        case 'KeyS':
            toggleShuffle();
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
        
        element.querySelector('.playlist-item-content').addEventListener('click', (e) => {
            if (!e.target.classList.contains('remove-button')) {
                currentIndex = index;
                playFile(item.path);
            }
        });
        
        element.querySelector('.remove-button').addEventListener('click', (e) => {
            e.stopPropagation();
            removeFromPlaylist(index);
        });
        
        playlistElement.appendChild(element);
    });
}


function playFile(filePath) {
    mediaPlayer.src = filePath;
    mediaPlayer.play()
        .then(() => {
            playPauseBtn.textContent = '⏸';
        })
        .catch(error => {
            console.error('Error playing file:', error);
            alert('Error playing file. The file may be invalid or unsupported.');
        });
    updatePlaylistUI();
    updateWindowTitle();
}

function togglePlayPause() {
    if (mediaPlayer.paused) {
        mediaPlayer.play()
            .then(() => {
                playPauseBtn.textContent = '⏸';
            })
            .catch(error => {
                console.error('Error playing media:', error);
            });
    } else {
        mediaPlayer.pause();
        playPauseBtn.textContent = '⏵';
    }
}

function updateTimeDisplay() {
    if (!isNaN(mediaPlayer.duration)) {
        timeSlider.value = mediaPlayer.currentTime;
        timeDisplay.textContent = `${formatTime(mediaPlayer.currentTime)} / ${formatTime(mediaPlayer.duration)}`;
    }
}

function seekMedia() {
    const time = parseFloat(timeSlider.value);
    if (!isNaN(time)) {
        mediaPlayer.currentTime = time;
    }
}

function updateVolume() {
    const volume = volumeSlider.value / 100;
    mediaPlayer.volume = volume;
    lastVolume = volume;
    muteBtn.textContent = volume === 0 ? '🔇' : '🔊';
}

function toggleMute() {
    if (mediaPlayer.volume > 0) {
        lastVolume = mediaPlayer.volume;
        mediaPlayer.volume = 0;
        volumeSlider.value = 0;
        muteBtn.textContent = '🔇';
    } else {
        mediaPlayer.volume = lastVolume;
        volumeSlider.value = lastVolume * 100;
        muteBtn.textContent = '🔊';
    }
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.getElementById('player-container').requestFullscreen();
        ipcRenderer.send('toggle-menu-bar', false);
    } else {
        document.exitFullscreen();
        ipcRenderer.send('toggle-menu-bar', true);
    }
}

function playNext() {
    if (playlist.length === 0) return;

    if (isShuffling) {
        let newIndex;
        do {
            newIndex = Math.floor(Math.random() * playlist.length);
        } while (newIndex === currentIndex && playlist.length > 1);
        currentIndex = newIndex;
    } else {
        currentIndex = (currentIndex + 1) % playlist.length;
    }

    playFile(playlist[currentIndex].path);
}


function playPrevious() {
    if (playlist.length === 0) return;
    currentIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    playFile(playlist[currentIndex].path);
}

function removeFromPlaylist(index) {
    if (index === currentIndex) {
        if (playlist.length === 1) {
            clearPlaylist();
            return;
        }
        playNext();
        if (currentIndex > index) {
            currentIndex--;
        }
    } else if (index < currentIndex) {
        currentIndex--;
    }
    
    playlist.splice(index, 1);
    updatePlaylistUI();
    store.set('playlist', playlist);
}

function clearPlaylist() {
    playlist = [];
    currentIndex = -1;
    mediaPlayer.src = '';
    updatePlaylistUI();
    updateWindowTitle();
    store.set('playlist', playlist);
}

function handleMediaEnd() {
    if (isLooping) {
        mediaPlayer.play();
    } else if (currentIndex < playlist.length - 1) {
        playNext();
    }
}

function updateWindowTitle() {
    document.title = currentIndex === -1 ? 
        'Fury' : 
        `${playlist[currentIndex].metadata.title} - Fury`;
}

function formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// IPC Events
ipcRenderer.on('menu-open-files', openFiles);
ipcRenderer.on('menu-clear-playlist', clearPlaylist);
ipcRenderer.on('menu-play-pause', togglePlayPause);
ipcRenderer.on('menu-previous', playPrevious);
ipcRenderer.on('menu-next', playNext);
ipcRenderer.on('menu-fullscreen', toggleFullscreen);

// Drag and drop support
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

// Error handling
mediaPlayer.addEventListener('error', (e) => {
    console.error('Media Player Error:', e);
    alert(`Error playing media: ${mediaPlayer.error?.message || 'Unknown error'}`);
    playNext();
});

// Save playlist before window closes
window.addEventListener('beforeunload', () => {
    store.set('playlist', playlist);
});