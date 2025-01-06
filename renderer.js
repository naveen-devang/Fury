const { ipcRenderer } = require('electron');
const { parseFile } = require('music-metadata');
const path = require('path');
const Store = new require('electron-store');
const store = new Store();

let playlist = [];
let currentIndex = -1;
let isLooping = false;
let isShuffling = false;

// Add these variables at the top with other global variables
let currentSubtitleTrack = -1;
let subtitleDelay = 0;
let subtitleSize = 1;
let subtitlesEnabled = true;

let clickTimeout = null;
const doubleClickDelay = 300; // milliseconds

let controlsTimeout;
let isFullscreen = false;
const INACTIVITY_TIMEOUT = 3000; // 3 seconds

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

// Add this event listener after other event listeners
mediaPlayer.addEventListener('click', (e) => {
    // Prevent text selection on double click
    if (e.detail > 1) {
        e.preventDefault();
    }

    // If this is the first click
    if (!clickTimeout) {
        clickTimeout = setTimeout(() => {
            // If the timeout completes without a second click, it's a single click
            if (clickTimeout) {
                togglePlayPause();
            }
            clickTimeout = null;
        }, doubleClickDelay);
    } else {
        // This is a double click
        clearTimeout(clickTimeout);
        clickTimeout = null;
        toggleFullscreen();
    }
});

// Clear the timeout if the user moves away or starts dragging
mediaPlayer.addEventListener('mouseleave', () => {
    if (clickTimeout) {
        clearTimeout(clickTimeout);
        clickTimeout = null;
    }
});

mediaPlayer.addEventListener('mousedown', (e) => {
    if (e.detail > 1) {
        e.preventDefault();
    }
});

// Load saved playlist
const savedPlaylist = store.get('playlist', []);
if (savedPlaylist.length > 0) {
    playlist = savedPlaylist;
    updatePlaylistUI();
}

function showControls() {
    const controlsOverlay = document.getElementById('controls-overlay');
    controlsOverlay.style.opacity = '1';
    
    // Reset the timer whenever controls are shown
    if (isFullscreen) {
        clearTimeout(controlsTimeout);
        controlsTimeout = setTimeout(hideControls, INACTIVITY_TIMEOUT);
    }
}

function hideControls() {
    if (isFullscreen) {
        const controlsOverlay = document.getElementById('controls-overlay');
        controlsOverlay.style.opacity = '0';
    }
}

// Add this function to handle subtitle file loading
async function loadSubtitleFile() {
    const result = await ipcRenderer.invoke('open-subtitle-file');
    if (result.filePaths && result.filePaths[0]) {
        const track = mediaPlayer.addTextTrack('subtitles', 'External Subtitles', 'en');
        loadSubtitleContent(result.filePaths[0], track);
    }
}

// Function to load and parse subtitle content
async function loadSubtitleContent(filePath, track) {
    try {
        const content = await ipcRenderer.invoke('read-subtitle-file', filePath);
        const subtitles = parseSubRip(content); // or other subtitle format parsers
        
        subtitles.forEach(sub => {
            const cue = new VTTCue(
                sub.startTime + subtitleDelay,
                sub.endTime + subtitleDelay,
                sub.text
            );
            track.addCue(cue);
        });
        
        track.mode = 'showing';
        currentSubtitleTrack = Array.from(mediaPlayer.textTracks).indexOf(track);
        updateSubtitleMenu();
    } catch (error) {
        console.error('Error loading subtitles:', error);
        alert('Error loading subtitle file');
    }
}

// Function to parse SRT format
function parseSubRip(content) {
    const subtitles = [];
    const blocks = content.split('\n\n');
    
    blocks.forEach(block => {
        const lines = block.trim().split('\n');
        if (lines.length >= 3) {
            const times = lines[1].split(' --> ');
            subtitles.push({
                startTime: timeToSeconds(times[0]),
                endTime: timeToSeconds(times[1]),
                text: lines.slice(2).join('\n')
            });
        }
    });
    
    return subtitles;
}

// Convert SRT time format to seconds
function timeToSeconds(timeString) {
    const [time, ms] = timeString.split(',');
    const [hours, minutes, seconds] = time.split(':');
    return parseInt(hours) * 3600 + 
           parseInt(minutes) * 60 + 
           parseInt(seconds) + 
           parseInt(ms) / 1000;
}

// Function to update subtitle delay
function updateSubtitleDelay(change) {
    subtitleDelay += change;
    const tracks = mediaPlayer.textTracks;
    
    for (let track of tracks) {
        if (track.cues) {
            for (let cue of track.cues) {
                cue.startTime += change;
                cue.endTime += change;
            }
        }
    }
}

// Function to update subtitle font size
function updateSubtitleFontSize(change) {
    subtitleSize = Math.max(0.5, Math.min(2.5, subtitleSize + change * 0.1));
    document.documentElement.style.setProperty('--subtitle-size', `${subtitleSize}em`);
}

// Function to toggle subtitles
function toggleSubtitles() {
    if (currentSubtitleTrack === -1) {
        // If subtitles are off, turn on the first available track
        const tracks = mediaPlayer.textTracks;
        if (tracks.length > 0) {
            selectSubtitleTrack(0);
        }
    } else {
        // If subtitles are on, turn them off
        selectSubtitleTrack(-1);
    }
}

// Add event listeners for subtitle control
document.getElementById('subtitles').addEventListener('click', toggleSubtitles);

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
    
    // Reset subtitle track state
    currentSubtitleTrack = -1;
    
    // Debug logging for subtitle tracks
    mediaPlayer.addEventListener('loadedmetadata', () => {
        const tracks = mediaPlayer.textTracks;
        console.log('Detected text tracks:', tracks.length);
        
        for (let i = 0; i < tracks.length; i++) {
            console.log(`Track ${i}:`, {
                kind: tracks[i].kind,
                label: tracks[i].label,
                language: tracks[i].language,
                mode: tracks[i].mode
            });
        }
        
        // Force enable all tracks initially to check if they're valid
        Array.from(tracks).forEach((track, index) => {
            track.mode = 'showing';
            // Check if track has cues
            console.log(`Track ${index} cues:`, track.cues ? track.cues.length : 'no cues');
        });
        
        if (tracks.length > 0) {
            updateSubtitleMenu();
        }
    });
    
    mediaPlayer.play()
        .then(() => {
            updatePlayPauseIcon(false);
        })
        .catch(error => {
            console.error('Error playing file:', error);
            alert('Error playing file. The file may be invalid or unsupported.');
        });
    updatePlaylistUI();
    updateWindowTitle();
}

// Function to select subtitle track
function selectSubtitleTrack(index) {
    currentSubtitleTrack = index;
    
    // Update all tracks
    const tracks = mediaPlayer.textTracks;
    Array.from(tracks).forEach((track, trackIndex) => {
        track.mode = trackIndex === index ? 'showing' : 'hidden';
    });
    
    // Update subtitle button state
    const subtitleBtn = document.getElementById('subtitles');
    subtitleBtn.classList.toggle('active', index !== -1);
    
    // Notify main process of track change
    ipcRenderer.send('subtitle-track-changed', index);
}

function updateSubtitleMenu() {
    const tracks = Array.from(mediaPlayer.textTracks).map((track, index) => ({
        label: track.label || `Subtitle Track ${index + 1}`,
        index: index,
        language: track.language
    }));
    
    ipcRenderer.send('update-subtitle-tracks', tracks);
}

// Add this event listener for subtitle track selection from menu
ipcRenderer.on('select-subtitle-track', (_, index) => {
    selectSubtitleTrack(index);
});

function updatePlayPauseIcon(isPaused) {
    playPauseBtn.innerHTML = isPaused 
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
}

function togglePlayPause() {
    if (mediaPlayer.paused) {
        mediaPlayer.play()
            .then(() => {
                updatePlayPauseIcon(false);
            })
            .catch(error => {
                console.error('Error playing media:', error);
            });
    } else {
        mediaPlayer.pause();
        updatePlayPauseIcon(true);
    }
}

// Add event listener for media player pause event
mediaPlayer.addEventListener('pause', () => {
    updatePlayPauseIcon(true);
});

// Add event listener for media player play event
mediaPlayer.addEventListener('play', () => {
    updatePlayPauseIcon(false);
});

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
    
    // Update volume icon based on level
    if (volume === 0) {
        muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
    } else {
        muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;
    }
}

function toggleMute() {
    if (mediaPlayer.volume > 0) {
        lastVolume = mediaPlayer.volume;
        mediaPlayer.volume = 0;
        volumeSlider.value = 0;
        muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
    } else {
        mediaPlayer.volume = lastVolume;
        volumeSlider.value = lastVolume * 100;
        muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;
    }
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.getElementById('player-container').requestFullscreen();
        ipcRenderer.send('toggle-menu-bar', false);
        isFullscreen = true;
        
        // Initial timer when entering fullscreen
        showControls();
        
    } else {
        document.exitFullscreen();
        ipcRenderer.send('toggle-menu-bar', true);
        isFullscreen = false;
        
        // Clear timer and show controls when exiting fullscreen
        clearTimeout(controlsTimeout);
        showControls();
    }
}

document.addEventListener('mousemove', () => {
    if (isFullscreen) {
        showControls();
    }
});

// Prevent controls from hiding while interacting with them
document.getElementById('controls-overlay').addEventListener('mouseenter', () => {
    if (isFullscreen) {
        clearTimeout(controlsTimeout);
        showControls();
    }
});

document.getElementById('controls-overlay').addEventListener('mouseleave', () => {
    if (isFullscreen) {
        controlsTimeout = setTimeout(hideControls, INACTIVITY_TIMEOUT);
    }
});

document.addEventListener('fullscreenchange', () => {
    isFullscreen = !!document.fullscreenElement;
    
    if (!isFullscreen) {
        clearTimeout(controlsTimeout);
        showControls();
    }
});

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
ipcRenderer.on('menu-load-subtitle', loadSubtitleFile);
ipcRenderer.on('menu-toggle-subtitles', toggleSubtitles);
ipcRenderer.on('menu-subtitle-delay', (_, change) => updateSubtitleDelay(change));
ipcRenderer.on('menu-subtitle-font-size', (_, change) => updateSubtitleFontSize(change));

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