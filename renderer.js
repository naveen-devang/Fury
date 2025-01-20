const { ipcRenderer } = require('electron');
const { parseFile } = require('music-metadata');
const path = require('path');
const Store = new require('electron-store');
const store = new Store();

const { applyTheme, getCurrentTheme } = require('./src/themes');
const { formatTime, debounce } = require('./src/utils');
const { INACTIVITY_TIMEOUT, LAST_POSITIONS_KEY, MAX_STORED_POSITIONS, MINIMUM_DURATION, MINIMUM_POSITION, SEEK_UPDATE_INTERVAL, MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT, DOUBLE_CLICK_DELAY, supportedFormats, mimeTypes } = require('./src/constants');
const { openFiles, openFolder } = require('./src/fileSystem')

const HardwareAcceleration = require('./src/hardwareAccelerations');
const SubtitlesManager = require('./subtitles');

let playlist = [];
let currentIndex = -1;
let isLooping = false;
let isLoopingCurrent = false; // For single media loop
let isShuffling = false;
let shuffledIndices = [];
let currentShuffleIndex = -1;
let clickTimeout = null;
let controlsTimeout;
let isFullscreen = false;
let seekTargetTime = null;
let isSeekingSmooth = false;
let lastSeekUpdate = 0;
let isDragging = false;
let animationFrame;
let lastVolume = store.get('lastVolume', 0.5); // 50%
let activeResumeTimer = null;
let activeDialog = null;

const rememberPlayback = store.get('rememberPlayback', true); // Default to true for existing users

document.addEventListener('DOMContentLoaded', () => {
    applyTheme(getCurrentTheme());
});

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
const playlistElement = document.getElementById('playlist');
const playerSection = document.querySelector('.player-section');
const playlistPanel = document.getElementById('playlist-panel');
const appContainer = document.querySelector('.app-container');
const controlsOverlay = document.getElementById('controls-overlay');
const playerContainer = document.getElementById('player-container');
const clearPlaylistBtn = document.getElementById('clear-playlist');
const togglePlaylistButton = document.getElementById('toggle-playlist');
document.addEventListener('DOMContentLoaded', () => {
    const speedToggle = document.getElementById('speed-toggle');
    const speedOptions = document.querySelector('.speed-options');
    const speedButton = document.querySelector('.speed-button');
    const video = document.getElementById('media-player');

    // Toggle dropdown
    speedToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        speedButton.classList.toggle('open');
        speedOptions.classList.toggle('open');
    });

    // Handle speed selection
    document.querySelectorAll('.speed-option').forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const speed = parseFloat(option.dataset.speed);
            
            // Update video speed
            if (video) video.playbackRate = speed;
            
            // Update button text
            speedToggle.textContent = `${speed}x`;
            
            // Update active state
            document.querySelectorAll('.speed-option').forEach(opt => 
                opt.classList.remove('active'));
            option.classList.add('active');
            
            // Close dropdown
            speedButton.classList.remove('open');
            speedOptions.classList.remove('open');
        });
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', () => {
        speedButton.classList.remove('open');
        speedOptions.classList.remove('open');
    });
});

mediaPlayer.volume = lastVolume;
volumeSlider.value = lastVolume * 100;

const timePreview = document.createElement('div');
timePreview.className = 'time-preview';
timeSlider.parentElement.appendChild(timePreview);

window.addEventListener('resize', () => {1
    const width = Math.max(window.innerWidth, MIN_WINDOW_WIDTH);
    const height = Math.max(window.innerHeight, MIN_WINDOW_HEIGHT);
    
    // Enforce minimum width through CSS
    appContainer.style.minWidth = `${MIN_WINDOW_WIDTH}px`;
    playerSection.style.minWidth = `${MIN_WINDOW_WIDTH - 320}px`; // 320px is playlist panel width
    
    if (width < MIN_WINDOW_WIDTH || height < MIN_WINDOW_HEIGHT) {
        ipcRenderer.send('enforce-min-size', {
            width: width,
            height: height
        });
    }
});

function adjustForScreenSize() {
    const width = Math.max(window.innerWidth, MIN_WINDOW_WIDTH);
    
    if (width < 900) {
        // Adjust playlist panel
        playlistPanel.style.width = '280px';
        playerSection.style.minWidth = `${MIN_WINDOW_WIDTH - 280}px`; // Account for smaller playlist panel
        
        // Ensure controls stay visible
        document.querySelectorAll('.control-button').forEach(button => {
            button.style.padding = '6px';
        });
        
        // Adjust volume slider
        const volumeControl = document.querySelector('.volume-control');
        if (volumeControl) {
            volumeControl.style.minWidth = '80px';
            volumeControl.style.width = '80px';
        }
    } else {
        // Reset styles for larger screens
        playlistPanel.style.width = '320px';
        playerSection.style.minWidth = `${MIN_WINDOW_WIDTH - 320}px`;
        
        document.querySelectorAll('.control-button').forEach(button => {
            button.style.padding = '8px';
        });
        
        const volumeControl = document.querySelector('.volume-control');
        if (volumeControl) {
            volumeControl.style.minWidth = '100px';
            volumeControl.style.width = '120px';
        }
    }
}

window.addEventListener('load', adjustForScreenSize);
window.addEventListener('resize', adjustForScreenSize);

togglePlaylistButton.addEventListener('click', () => {
    playlistPanel.classList.toggle('hidden');
    togglePlaylistButton.classList.toggle('active');
    appContainer.classList.toggle('playlist-hidden');
});

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
        }, DOUBLE_CLICK_DELAY);
    } else {
        // This is a double click
        clearTimeout(clickTimeout);
        clickTimeout = null;
        toggleFullscreen();
    }
});

const subtitlesManager = window.subtitlesManager = new SubtitlesManager(mediaPlayer);
const hardwareAcceleration = new HardwareAcceleration(mediaPlayer);

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

function toggleHardwareAcceleration(enabled) {
    hardwareAcceleration.toggle(enabled);
    
    // Reload current media to apply changes if something is playing
    if (currentIndex !== -1 && playlist[currentIndex]) {
        const currentTime = mediaPlayer.currentTime;
        const wasPlaying = !mediaPlayer.paused;
        const currentPath = playlist[currentIndex].path;
        
        mediaPlayer.removeAttribute('src');
        mediaPlayer.load();
        
        mediaPlayer.src = currentPath;
        mediaPlayer.currentTime = currentTime;
        if (wasPlaying) {
            mediaPlayer.play().catch(console.error);
        }
    }
}

// Load saved playlist
const savedPlaylist = store.get('playlist', []);
if (savedPlaylist.length > 0) {
    playlist = savedPlaylist;
    updatePlaylistUI();
}

function updateSliderProgress() {
    if (animationFrame) {
        cancelAnimationFrame(animationFrame);
    }
    
    animationFrame = requestAnimationFrame(() => {
        if (!mediaPlayer.duration) return;
        
        const progress = (mediaPlayer.currentTime / mediaPlayer.duration) * 100;
        timeSlider.style.setProperty('--progress-percent', progress);
        
        const thumb = timeSlider.querySelector('::-webkit-slider-thumb');
        if (thumb) {
            thumb.style.transform = `translateX(${progress}%)`;
        }
    });
}

function handleSliderInteraction(e) {
    const rect = timeSlider.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const targetTime = pos * mediaPlayer.duration;
    
    if (!isNaN(targetTime)) {
        timeDisplay.textContent = `${formatTime(targetTime)} / ${formatTime(mediaPlayer.duration)}`;
        timeSlider.style.setProperty('--progress-percent', pos * 100);
        
        seekTargetTime = targetTime;
        
        if (!isSeekingSmooth) {
            isSeekingSmooth = true;
            smoothSeek();
        }
    }
}

function smoothSeek() {
    if (!isSeekingSmooth || seekTargetTime === null) {
        isSeekingSmooth = false;
        return;
    }

    const now = performance.now();
    if (now - lastSeekUpdate >= SEEK_UPDATE_INTERVAL) {
        const currentTime = mediaPlayer.currentTime;
        const timeDiff = seekTargetTime - currentTime;
        
        if (Math.abs(timeDiff) < 0.1) {
            mediaPlayer.currentTime = seekTargetTime;
            isSeekingSmooth = false;
            seekTargetTime = null;
            return;
        }
        const step = Math.sign(timeDiff) * Math.min(Math.abs(timeDiff), 1);
        mediaPlayer.currentTime = currentTime + step;
        lastSeekUpdate = now;
    }

    requestAnimationFrame(smoothSeek);
}

function showControls() {
    controlsOverlay.style.opacity = '1';
    document.body.classList.remove('hide-cursor');
    
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(hideControls, INACTIVITY_TIMEOUT);
}

function hideControls() {
    controlsOverlay.style.opacity = '0';
    document.body.classList.add('hide-cursor');
}

// Event Listeners
playPauseBtn.addEventListener('click', togglePlayPause);
previousBtn.addEventListener('click', playPrevious);
nextBtn.addEventListener('click', playNext);
muteBtn.addEventListener('click', toggleMute);
shuffleBtn.addEventListener('click', toggleShuffle);
loopBtn.addEventListener('click', toggleLoop);
volumeSlider.addEventListener('input', updateVolume);
timeSlider.addEventListener('input', () => {
    const time = parseFloat(timeSlider.value);
    if (!isNaN(time)) {
        mediaPlayer.currentTime = time;
        updateSliderProgress();
    }
});

loopBtn.style.opacity = isLooping ? '1' : '0.5';
shuffleBtn.style.opacity = isShuffling ? '1' : '0.5';

// Media player events
mediaPlayer.addEventListener('timeupdate', () => {
    if (!isDragging) {
        updateTimeDisplay();
    }
});
mediaPlayer.addEventListener('ended', handleMediaEnd);
mediaPlayer.addEventListener('loadedmetadata', () => {
    timeSlider.max = mediaPlayer.duration;
    updateTimeDisplay();

    if (mediaPlayer.fastSeek) {
        mediaPlayer.preload = 'auto';
    }
});
timeSlider.addEventListener('mousedown', (e) => {
    isDragging = true;
    handleSliderInteraction(e);
    document.body.style.cursor = 'grabbing';
});
document.addEventListener('mouseup', () => {
    if (isDragging) {
        isDragging = false;
        isSeekingSmooth = false;
        seekTargetTime = null;
        document.body.style.cursor = '';
    }
});
document.addEventListener('mousemove', (e) => {
    if (isDragging) {
        handleSliderInteraction(e);
    }
    // Update preview
    if (timeSlider.matches(':hover')) {
        const rect = timeSlider.getBoundingClientRect();
        const pos = (e.clientX - rect.left) / rect.width;
        const previewTime = pos * mediaPlayer.duration;
        
        if (!isNaN(previewTime)) {
            timePreview.textContent = formatTime(previewTime);
            timePreview.style.left = `${e.clientX}px`;
            timePreview.classList.add('visible');
        }
    }

    showControls();
});

// Preview time on hover
timeSlider.addEventListener('mousemove', (e) => {
    const rect = timeSlider.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const previewTime = pos * mediaPlayer.duration;
    
    if (!isNaN(previewTime)) {
        timePreview.textContent = formatTime(previewTime);
        timePreview.style.left = `${e.clientX}px`;
        timePreview.classList.add('visible');
    }
});

timeSlider.addEventListener('mouseleave', () => {
    timePreview.classList.remove('visible');
});

fullscreenBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!isFullscreenSupported()) {
        console.warn('Fullscreen is not supported in this environment');
        return;
    }
    
    toggleFullscreen();
});

mediaPlayer.addEventListener('dblclick', (e) => {
    e.preventDefault();
    e.stopPropagation(); 
    toggleFullscreen();
});

function generateShuffledPlaylist(currentVideoIndex) {
    // Create array of indices excluding the current video
    const indices = Array.from({ length: playlist.length }, (_, i) => i)
        .filter(i => i !== currentVideoIndex);
    
    // Fisher-Yates shuffle algorithm for remaining videos
    for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    
    // Put current video at the start if it exists
    if (currentVideoIndex !== -1) {
        indices.unshift(currentVideoIndex);
    }
    
    return indices;
}

function toggleShuffle() {
    isShuffling = !isShuffling;
    shuffleBtn.style.opacity = isShuffling ? '1' : '0.5';
    
    if (isShuffling) {
        // Generate new shuffled sequence starting with current video
        shuffledIndices = generateShuffledPlaylist(currentIndex);
        currentShuffleIndex = 0;
    } else {
        // Clear shuffle state when turning off
        shuffledIndices = [];
        currentShuffleIndex = -1;
    }
}


function toggleLoop() {
    // Cycle through states: No Loop -> Loop Playlist -> Loop Current
    if (!isLooping && !isLoopingCurrent) {
        // Enable playlist loop
        isLoopingCurrent = false;
        isLooping = true;
        mediaPlayer.loop = false;
        loopBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"></path><path d="M3 11v-1a4 4 0 014-4h14"></path><path d="M7 22l-4-4 4-4"></path><path d="M21 13v1a4 4 0 01-4 4H3"></path></svg>`;
        loopBtn.style.opacity = '1';
    } else if (isLooping) {
        // Enable single media loop
        isLoopingCurrent = true;
        isLooping = false;
        mediaPlayer.loop = true;
        loopBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-repeat-1"><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/><path d="M11 10h1v4"/></svg>`;
        loopBtn.style.opacity = '1';
    } else {
        // Disable all looping
        isLoopingCurrent = false;
        isLooping = false;
        mediaPlayer.loop = false;
        loopBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"></path><path d="M3 11v-1a4 4 0 014-4h14"></path><path d="M7 22l-4-4 4-4"></path><path d="M21 13v1a4 4 0 01-4 4H3"></path></svg>`;
        loopBtn.style.opacity = '0.5';
    }
}

function changePlaybackSpeed() {
    mediaPlayer.playbackRate = parseFloat(playbackSpeedSelect.value);
}

// Function to get stored positions
function getStoredPositions() {
    return store.get(LAST_POSITIONS_KEY, {});
}

// Function to save last position
function saveLastPosition(filePath, position, duration) {
    if (!filePath || !duration || duration < MINIMUM_DURATION || position < MINIMUM_POSITION) return;
    
    const positions = getStoredPositions();
    
    // Add new position
    positions[filePath] = {
        position: position,
        timestamp: Date.now(),
        duration: duration
    };
    
    // Remove oldest entries if we exceed MAX_STORED_POSITIONS
    const paths = Object.keys(positions);
    if (paths.length > MAX_STORED_POSITIONS) {
        const sortedPaths = paths.sort((a, b) => positions[b].timestamp - positions[a].timestamp);
        const pathsToRemove = sortedPaths.slice(MAX_STORED_POSITIONS);
        pathsToRemove.forEach(path => delete positions[path]);
    }
    
    store.set(LAST_POSITIONS_KEY, positions);
}

// Function to get last position
function getLastPosition(filePath) {
    const positions = getStoredPositions();
    return positions[filePath] || null;
}

// Function to remove last position
function removeLastPosition(filePath) {
    const positions = getStoredPositions();
    delete positions[filePath];
    store.set(LAST_POSITIONS_KEY, positions);
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
            volumeSlider.style.setProperty('--volume-percent', volumeSlider.value);
            lastVolume = mediaPlayer.volume;
            store.set('lastVolume', lastVolume);
            if (mediaPlayer.volume === 0) {
                muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
            } else {
                muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;
            }
            break;
        case 'ArrowDown':
            mediaPlayer.volume = Math.max(0, mediaPlayer.volume - 0.1);
            volumeSlider.value = mediaPlayer.volume * 100;
            volumeSlider.style.setProperty('--volume-percent', volumeSlider.value);
            lastVolume = mediaPlayer.volume;
            store.set('lastVolume', lastVolume);
            if (mediaPlayer.volume === 0) {
                muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
            } else {
                muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;
            }
            break;
        case 'KeyM':
            toggleMute();
            break;
        case 'KeyF':
            e.preventDefault(); // Prevent default F key behavior
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


async function addToPlaylist(filePath) {
    // Get basic file info immediately
    const basicInfo = {
        path: filePath,
        metadata: {
            title: path.basename(filePath),
            duration: 0
        }
    };
    
    const index = playlist.length;
    playlist.push(basicInfo);
    updatePlaylistUI();

    // Create temporary video element for quick metadata
    const temp = document.createElement('video');
    temp.preload = 'metadata';
    
    try {
        const metadataLoaded = new Promise((resolve, reject) => {
            temp.onloadedmetadata = () => resolve(temp.duration);
            temp.onerror = reject;
            temp.src = filePath;
        });

        const duration = await metadataLoaded;
        playlist[index].metadata.duration = duration;
        updatePlaylistUI();
        temp.remove();
        
        // Load full metadata in background
        parseFile(filePath).then(metadata => {
            playlist[index].metadata.title = metadata.common.title || path.basename(filePath);
            playlist[index].metadata.artist = metadata.common.artist || 'Unknown Artist';
            updatePlaylistUI();
        }).catch(() => {});
        
    } catch (error) {
        console.error('Error loading metadata:', error);
        temp.remove();
    }
}

function updatePlaylistUI() {
    playlistElement.innerHTML = '';
    
    // Add container for playlist items
    const playlistContainer = document.createElement('div');
    playlistContainer.className = 'playlist-container';
    
    playlist.forEach((item, index) => {
        const element = document.createElement('div');
        element.className = `playlist-item ${index === currentIndex ? 'active' : ''}`;
        element.draggable = true;
        element.dataset.index = index;
        element.innerHTML = `
            <div class="playlist-item-content">
                <span class="title">${item.metadata.title}</span>
                <div class="playlist-item-controls">
                    <span class="duration">${formatTime(item.metadata.duration)}</span>
                    <button class="remove-button">X</button>
                </div>
            </div>
        `;
        
        element.addEventListener('dragstart', handleDragStart);
        element.addEventListener('dragend', handleDragEnd);
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
        
        playlistContainer.appendChild(element);
    });

    // Add bottom drop zone
    const bottomDropZone = document.createElement('div');
    bottomDropZone.className = 'bottom-drop-zone';
    bottomDropZone.style.height = '50px';
    playlistContainer.appendChild(bottomDropZone);

    playlistElement.appendChild(playlistContainer);

    // Container-level drag events
    playlistContainer.addEventListener('dragover', handleDragOver);
    playlistContainer.addEventListener('drop', handleDrop);
}

let draggedElement = null;

function handleDragStart(e) {
    draggedElement = e.target;
    draggedElement.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    draggedElement.classList.remove('dragging');
    draggedElement = null;
    
    // Remove all drag-over classes
    document.querySelectorAll('.drag-over').forEach(item => {
        item.classList.remove('drag-over');
    });
}

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedElement) return;
    
    const container = e.currentTarget;
    const items = [...container.querySelectorAll('.playlist-item:not(.dragging)')];
    
    // Get mouse position relative to container
    const mouseY = e.clientY;
    
    // Find the element we're hovering over
    let closestItem = null;
    let closestOffset = Number.NEGATIVE_INFINITY;
    
    items.forEach(item => {
        const box = item.getBoundingClientRect();
        const offset = mouseY - box.top - box.height / 2;
        
        if (offset < 0 && offset > closestOffset) {
            closestOffset = offset;
            closestItem = item;
        }
    });
    
    // Remove existing drag-over classes
    items.forEach(item => item.classList.remove('drag-over'));
    
    if (closestItem) {
        closestItem.classList.add('drag-over');
    } else if (mouseY > items[items.length - 1]?.getBoundingClientRect().bottom) {
        // If we're below the last item, highlight the bottom drop zone
        container.querySelector('.bottom-drop-zone').classList.add('drag-over');
    }
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedElement) return;
    
    const draggedIndex = parseInt(draggedElement.dataset.index);
    const container = e.currentTarget;
    const items = [...container.querySelectorAll('.playlist-item:not(.dragging)')];
    const mouseY = e.clientY;
    
    // Find drop position
    let dropIndex;
    const lastItem = items[items.length - 1];
    
    if (lastItem && mouseY > lastItem.getBoundingClientRect().bottom) {
        // If dropping below last item, set to end of playlist
        dropIndex = playlist.length;
    } else {
        // Find position between items
        for (let i = 0; i < items.length; i++) {
            const box = items[i].getBoundingClientRect();
            if (mouseY < box.top + box.height / 2) {
                dropIndex = parseInt(items[i].dataset.index);
                break;
            }
        }
        // If no position found above items, use last position
        if (dropIndex === undefined) {
            dropIndex = playlist.length;
        }
    }
    
    // Update playlist array
    const [movedItem] = playlist.splice(draggedIndex, 1);
    playlist.splice(dropIndex > draggedIndex ? dropIndex - 1 : dropIndex, 0, movedItem);
    
    // Update currentIndex
    if (currentIndex === draggedIndex) {
        currentIndex = dropIndex > draggedIndex ? dropIndex - 1 : dropIndex;
    } else if (draggedIndex < currentIndex && dropIndex > currentIndex) {
        currentIndex--;
    } else if (draggedIndex > currentIndex && dropIndex <= currentIndex) {
        currentIndex++;
    }
    
    updatePlaylistUI();
    store.set('playlist', playlist);
}

async function playFile(filePath) {
    if (!filePath) {
        console.warn('No file path provided to playFile');
        return;
    }

    const existingDialogs = document.querySelectorAll('.resume-dialog');
    existingDialogs.forEach(dialog => dialog.remove());

    mediaPlayer.removeAttribute('src');
    mediaPlayer.load();

    if (hardwareAcceleration.isEnabled()) {
        hardwareAcceleration.addCodecSupport(filePath);
    }

    updatePlaylistUI();
    updateWindowTitle();

    const extension = path.extname(filePath).toLowerCase();
    
    if (mimeTypes[extension]) {
        const source = document.createElement('source');
        source.src = filePath;
        source.type = mimeTypes[extension];
        mediaPlayer.appendChild(source);
    } else {
        mediaPlayer.src = filePath;
    }

    mediaPlayer.src = filePath;
    
    // Detect and load subtitles for the new file
    subtitlesManager.detectSubtitles(filePath).catch(err => {
        console.warn('Error loading subtitles:', err);
    });

    const shouldRememberPlayback = store.get('rememberPlayback', true);
    const lastPosition = shouldRememberPlayback ? getLastPosition(filePath) : null;

    if (lastPosition && lastPosition.position > MINIMUM_POSITION) {
        // Resume dialog
        const shouldResume = await showResumeDialog(filePath, lastPosition.position);
        
        if (shouldResume) {
            mediaPlayer.currentTime = lastPosition.position;
        } else {
            mediaPlayer.currentTime = 0;
            removeLastPosition(filePath);
        } 
    } else {
        mediaPlayer.currentTime = 0;
    }

    const playPromise = new Promise((resolve, reject) => {
        const onPlaying = () => {
            if (hardwareAcceleration) {
                // Check if video is actually playing with hardware acceleration
                if (mediaPlayer.videoTracks && mediaPlayer.videoTracks.length > 0) {
                    const videoTrack = mediaPlayer.videoTracks[0];
                    if (!videoTrack.selected) {
                        console.warn('Hardware decoding might not be active');
                    }
                }
            }
            mediaPlayer.removeEventListener('playing', onPlaying);
            resolve();
        };
        
        const onError = (error) => {
            mediaPlayer.removeEventListener('playing', onPlaying);
            reject(error);
        };
        
        mediaPlayer.addEventListener('playing', onPlaying, { once: true });
        mediaPlayer.addEventListener('error', onError, { once: true });
    });

    try {
        await mediaPlayer.play();
        updatePlayPauseIcon(false);
    } catch (error) {
        console.error('Error playing file:', error);
        if (error.name === 'NotSupportedError' || error.name === 'AbortError') {
            console.warn('Playback error, attempting fallback...');
            // Try alternative playback method
            mediaPlayer.innerHTML = ''; // Clear any existing sources
            mediaPlayer.src = filePath;
            await mediaPlayer.play();
        } else {
            alert('Error playing file. The file may be invalid or unsupported.');
        }
    }
}

// Helper function to show resume dialog
function showResumeDialog(filePath, position) {
    return new Promise(resolve => {
        // Clean up any existing dialog
        if (activeDialog) {
            activeDialog.remove();
            if (activeResumeTimer) {
                clearTimeout(activeResumeTimer);
            }
        }

        const template = document.getElementById('resume-dialog-template');
        const dialog = template.content.cloneNode(true).firstElementChild;
        dialog.dataset.filePath = filePath;
        activeDialog = dialog;

        const timeElement = dialog.querySelector('.resume-time');
        timeElement.textContent = formatTime(position);

        let timeLeft = 10;
        const countdownElement = dialog.querySelector('.countdown');
        countdownElement.textContent = `Auto-starting from beginning in ${timeLeft}s`;

        const countdownInterval = setInterval(() => {
            timeLeft--;
            countdownElement.textContent = `Auto-starting from beginning in ${timeLeft}s`;
        }, 1000);

        const cleanupDialog = () => {
            clearInterval(countdownInterval);
            if (activeResumeTimer) {
                clearTimeout(activeResumeTimer);
                activeResumeTimer = null;
            }
            dialog.remove();
            activeDialog = null;
        };

        document.getElementById('player-container').appendChild(dialog);

        // Handle user choice
        dialog.querySelector('.resume-yes').onclick = () => {
            cleanupDialog();
            resolve(true);
        };
        
        dialog.querySelector('.resume-no').onclick = () => {
            cleanupDialog();
            resolve(false);
        };

        // Auto-hide dialog after 10 seconds
        activeResumeTimer = setTimeout(() => {
            cleanupDialog();
            resolve(false);
        }, 10000);
    });
}

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

let savePositionInterval;
mediaPlayer.addEventListener('play', () => {
    // Save position every 5 seconds while playing
    savePositionInterval = setInterval(() => {
        if (currentIndex !== -1 && playlist[currentIndex]) {
            saveLastPosition(
                playlist[currentIndex].path,
                mediaPlayer.currentTime,
                mediaPlayer.duration
            );
        }
    }, 5000);
});

mediaPlayer.addEventListener('pause', () => {
    clearInterval(savePositionInterval);
    // Save position immediately when paused
    if (currentIndex !== -1 && playlist[currentIndex]) {
        saveLastPosition(
            playlist[currentIndex].path,
            mediaPlayer.currentTime,
            mediaPlayer.duration
        );
    }
});

// Save position before window closes
window.addEventListener('beforeunload', () => {
    if (currentIndex !== -1 && playlist[currentIndex]) {
        saveLastPosition(
            playlist[currentIndex].path,
            mediaPlayer.currentTime,
            mediaPlayer.duration
        );
    }
    store.set('playlist', playlist);
});

// Clear last position when media ends normally
mediaPlayer.addEventListener('ended', () => {
    if (currentIndex !== -1 && playlist[currentIndex]) {
        removeLastPosition(playlist[currentIndex].path);
    }
});

// Add event listener for media player pause event
mediaPlayer.addEventListener('pause', () => {
    updatePlayPauseIcon(true);
});

// Add event listener for media player play event
mediaPlayer.addEventListener('play', () => {
    updatePlayPauseIcon(false);
});

mediaPlayer.addEventListener('wheel', (e) => {
    e.preventDefault();
    
    const volumeChange = e.deltaY > 0 ? -0.05 : 0.05;
    const newVolume = Math.max(0, Math.min(1, mediaPlayer.volume + volumeChange));
    
    mediaPlayer.volume = newVolume;
    volumeSlider.value = newVolume * 100;
    volumeSlider.style.setProperty('--volume-percent', newVolume * 100);
    
    lastVolume = newVolume;
    // Save the new volume
    store.set('lastVolume', newVolume);
    
    // Update volume icon
    if (newVolume === 0) {
        muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
    } else {
        muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;
    }
});

function updateTimeDisplay() {
    if (!isNaN(mediaPlayer.duration)) {
        timeSlider.max = mediaPlayer.duration;
        timeSlider.value = mediaPlayer.currentTime;
        timeDisplay.textContent = `${formatTime(mediaPlayer.currentTime)} / ${formatTime(mediaPlayer.duration)}`;
        updateSliderProgress();
    }
}

volumeSlider.style.setProperty('--volume-percent', volumeSlider.value);

function updateVolume() {
    const volume = volumeSlider.value / 100;
    mediaPlayer.volume = volume;
    lastVolume = volume;
    
    // Save volume to store
    store.set('lastVolume', volume);
   
    // Update the volume-percent CSS variable
    volumeSlider.style.setProperty('--volume-percent', volumeSlider.value);

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
        store.set('lastVolume', lastVolume); // Save volume when unmuting
        muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;
    }
}

function toggleFullscreen() {
    // Check if we're already in fullscreen
    const isCurrentlyFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement
    );

    try {
        if (!isCurrentlyFullscreen) {
            // Define all possible fullscreen request methods
            const requestFullscreen = playerContainer.requestFullscreen ||
                playerContainer.webkitRequestFullscreen;

            if (requestFullscreen) {
                Promise.resolve(requestFullscreen.call(playerContainer))
                    .then(() => {
                        isFullscreen = true;
                        ipcRenderer.send('toggle-menu-bar', false);
                        showControls();
                        fullscreenBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"></path><path d="M21 8h-3a2 2 0 0 1-2-2V3"></path><path d="M3 16h3a2 2 0 0 1 2 2v3"></path><path d="M16 21v-3a2 2 0 0 1 2-2h3"></path></svg>`;
                    })
                    .catch(err => {
                        console.warn('Fullscreen request failed:', err);
                        // Try alternative methods if the primary method fails
                        if (playerContainer.webkitRequestFullscreen) {
                            playerContainer.webkitRequestFullscreen();
                        }
                    });
            }
        } else {
            // Define all possible exit fullscreen methods
            const exitFullscreen = document.exitFullscreen ||
                document.webkitExitFullscreen;

            if (exitFullscreen) {
                Promise.resolve(exitFullscreen.call(document))
                    .then(() => {
                        isFullscreen = false;
                        ipcRenderer.send('toggle-menu-bar', true);
                        clearTimeout(controlsTimeout);
                        showControls();
                        fullscreenBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M21 8V5a2 2 0 0 0-2-2h-3"></path><path d="M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg>`;
                    })
                    .catch(err => {
                        console.warn('Exit fullscreen failed:', err);
                    });
            }
        }
    } catch (error) {
        console.error('Error toggling fullscreen:', error);
    }
}

document.addEventListener('mousemove', () => {
    if (isFullscreen) {
        showControls();
    }
});

// Prevent controls from hiding while interacting with them
document.getElementById('controls-overlay').addEventListener('mouseenter', () => {
    clearTimeout(controlsTimeout);
    showControls();
});

document.getElementById('controls-overlay').addEventListener('mouseleave', () => {
        controlsTimeout = setTimeout(hideControls, INACTIVITY_TIMEOUT);
});

document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);


function handleFullscreenChange() {
    isFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement
    );
    
    if (!isFullscreen) {
        ipcRenderer.send('toggle-menu-bar', true);
        clearTimeout(controlsTimeout);
        showControls();
    }
}

function isFullscreenSupported() {
    return !!(
        document.fullscreenEnabled ||
        document.webkitFullscreenEnabled
    );
}

function playNext() {
    if (playlist.length === 0) return;

    if (isShuffling) {
        // If we haven't created a shuffle sequence or have reached the end
        if (shuffledIndices.length === 0 || currentShuffleIndex >= shuffledIndices.length - 1) {
            // If this is the first shuffle or we've reached the end
            if (currentShuffleIndex === -1) {
                // Starting a new shuffle - include current video
                shuffledIndices = generateShuffledPlaylist(currentIndex);
                currentShuffleIndex = 0;
            } else {
                // We've finished the sequence - generate new one excluding current video
                shuffledIndices = generateShuffledPlaylist(-1);
                currentShuffleIndex = 0;
            }
        } else {
            // Move to next video in shuffled sequence
            currentShuffleIndex++;
        }
        
        currentIndex = shuffledIndices[currentShuffleIndex];
    } else {
        // Normal sequential playback
        currentIndex = (currentIndex + 1) % playlist.length;
        // Reset shuffle state when shuffle is off
        shuffledIndices = [];
        currentShuffleIndex = -1;
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
    // Stop any currently playing media
    mediaPlayer.pause();
    // Clear the source to prevent memory leaks
    mediaPlayer.removeAttribute('src');
    mediaPlayer.load();
    
    // Reset all player state
    playlist = [];
    currentIndex = -1;
    
    // Update UI elements
    updatePlaylistUI();
    updateWindowTitle();
    updatePlayPauseIcon(true);
    
    // Clear the time display and slider
    timeDisplay.textContent = '00:00 / 00:00';
    timeSlider.value = 0;
    
    // Save empty playlist to store
    store.set('playlist', playlist);
}

function handleMediaEnd() {
    // Remove last position when media ends normally
    if (currentIndex !== -1 && playlist[currentIndex]) {
        removeLastPosition(playlist[currentIndex].path);
    }
    
    if (isLoopingCurrent) {
        // Single media loop - just play the current file again
        mediaPlayer.play();
    } else if (isLooping) {
        // Playlist loop - continue with next file or return to start
        if (isShuffling) {
            playNext();
        } else {
            if (currentIndex < playlist.length - 1) {
                playNext();
            } else {
                // At end of playlist, return to start
                currentIndex = 0;
                playFile(playlist[currentIndex].path);
            }
        }
    } else if (playlist.length > 0) {
        // No loop - normal playlist behavior
        if (isShuffling) {
            playNext();
        } else {
            if (currentIndex < playlist.length - 1) {
                playNext();
            } else {
                // At the end of playlist and not looping - stop playback
                mediaPlayer.pause();
                updatePlayPauseIcon(true);
                mediaPlayer.currentTime = 0;
            }
        }
    } else {
        // If playlist is empty, reset the player
        mediaPlayer.pause();
        updatePlayPauseIcon(true);
    }
}

function updateWindowTitle() {
    document.title = currentIndex === -1 ? 
        'Fury' : 
        `${playlist[currentIndex].metadata.title} - Fury`;
}

clearPlaylistBtn.addEventListener('click', () => {
    if (playlist.length > 0) {
        clearPlaylist();
    }
});


// IPC Events
ipcRenderer.on('change-theme', (_, themeName) => {
    applyTheme(themeName);
});
ipcRenderer.on('menu-open-files', openFiles);
ipcRenderer.on('menu-open-folder', openFolder);
ipcRenderer.on('menu-play-pause', togglePlayPause);
ipcRenderer.on('menu-previous', playPrevious);
ipcRenderer.on('menu-next', playNext);
ipcRenderer.on('menu-fullscreen', toggleFullscreen);

ipcRenderer.on('toggle-remember-playback', (_, enabled) => {
    store.set('rememberPlayback', enabled);
});
ipcRenderer.on('toggle-hardware-acceleration', (_, enabled) => {
    toggleHardwareAcceleration(enabled);
    store.set('hardwareAcceleration', enabled);
});
ipcRenderer.on('file-opened', async (_, filePath) => {
    // Clear playlist if it's empty or if it's a fresh start
    if (playlist.length === 0 || currentIndex === -1) {
        playlist = [];
        currentIndex = 0;
        await addToPlaylist(filePath);
        playFile(filePath);
    } else {
        // Add to existing playlist
        await addToPlaylist(filePath);
        // If nothing is playing, start playing the new file
        if (mediaPlayer.paused) {
            currentIndex = playlist.length - 1;
            playFile(filePath);
        }
    }
});

// Initialize hardware acceleration state when player loads
document.addEventListener('DOMContentLoaded', async () => {
    // Check hardware support
    const hasHardwareSupport = hardwareAcceleration.checkSupport();
    
    // If no hardware support, force disable regardless of stored setting
    if (!hasHardwareSupport) {
        hardwareAcceleration.toggle(false);
    } else {
        // Initialize with current state
        hardwareAcceleration.toggle(hardwareAcceleration.isEnabled());
    }
});

// Drag and drop support
document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
});

document.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files)
      .filter(file => {
        const ext = path.extname(file.path).toLowerCase();
        return supportedFormats.includes(ext);
      });

    const promises = files.map(file => addToPlaylist(file.path));

    if (currentIndex === -1 && files.length > 0) {
        currentIndex = 0;
        playFile(files[0].path);
    }

    // Save playlist after basic info is added
    store.set('playlist', playlist);

    // Wait for metadata in background
    await Promise.allSettled(promises);
    store.set('playlist', playlist); // Update with complete metadata
}
);

// Error handling
mediaPlayer.addEventListener('error', (e) => {
    // Only show error if there's actually a source attribute
    if (mediaPlayer.hasAttribute('src')) {
        console.error('Media Player Error:', e);
        alert(`Error playing media: ${mediaPlayer.error?.message || 'Unknown error'}`);
        
        // Only try to play next if we have items in the playlist
        if (playlist.length > 0) {
            playNext();
        }
    }
});

mediaPlayer.addEventListener('error', (e) => {
    hardwareAcceleration.handleError(e.target.error, 
        currentIndex !== -1 ? playlist[currentIndex].path : null,
        (path) => playFile(path)
    );
});

// Save playlist before window closes
window.addEventListener('beforeunload', () => {
    store.set('playlist', playlist);
});