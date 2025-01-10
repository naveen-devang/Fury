const { ipcRenderer } = require('electron');
const { parseFile } = require('music-metadata');
const path = require('path');
const Store = new require('electron-store');
const store = new Store();
const { applyTheme, getCurrentTheme } = require('./themes');

const SubtitlesManager = require('./subtitles');

let playlist = [];
let currentIndex = -1;
let isLooping = false;
let isShuffling = false;

let clickTimeout = null;
const doubleClickDelay = 300; // milliseconds

let controlsTimeout;
let isFullscreen = false;
const INACTIVITY_TIMEOUT = 3000; // 3 seconds
const LAST_POSITIONS_KEY = 'lastPositions';
const MAX_STORED_POSITIONS = 1000; // Limit number of stored positions to prevent excessive storage
const MINIMUM_DURATION = 60; // Only store position for media longer than 1 minute
const MINIMUM_POSITION = 30; // Only store position if user watched more than 30 seconds

const rememberPlayback = store.get('rememberPlayback', true); // Default to true for existing users

// Add minimum window size handling
const MIN_WINDOW_WIDTH = 780;
const MIN_WINDOW_HEIGHT = 580;

let isHardwareAccelerated = store.get('hardwareAcceleration', true); // Default to true


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
const playbackSpeedSelect = document.getElementById('playback-speed');
const playlistElement = document.getElementById('playlist');

// Initialize player state
let lastVolume = 0.5; // 50%
mediaPlayer.volume = 0.5;
volumeSlider.value = 50; // Set slider to 50%

const playerSection = document.querySelector('.player-section');
const playlistPanel = document.getElementById('playlist-panel');
const appContainer = document.querySelector('.app-container');


window.addEventListener('resize', () => {
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

const subtitlesManager = window.subtitlesManager = new SubtitlesManager(mediaPlayer);

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
    isHardwareAccelerated = enabled;
    store.set('hardwareAcceleration', enabled);
    
    if (mediaPlayer) {
        if (enabled) {
            // Enable hardware acceleration
            mediaPlayer.style.transform = 'translateZ(0)';
            mediaPlayer.style.willChange = 'transform';
            mediaPlayer.classList.remove('no-hardware-acceleration');
            
            // Force video decoder hardware acceleration when available
            mediaPlayer.setAttribute('x-webkit-airplay', 'allow');
            mediaPlayer.setAttribute('webkit-playsinline', '');
            mediaPlayer.setAttribute('playsinline', '');
            
            // Add hardware accelerated video rendering
            mediaPlayer.style.backfaceVisibility = 'hidden';
            mediaPlayer.style.perspective = '1000px';
        } else {
            // Disable hardware acceleration
            mediaPlayer.style.transform = 'none';
            mediaPlayer.style.willChange = 'auto';
            mediaPlayer.classList.add('no-hardware-acceleration');
            mediaPlayer.removeAttribute('x-webkit-airplay');
            mediaPlayer.removeAttribute('webkit-playsinline');
            mediaPlayer.removeAttribute('playsinline');
            mediaPlayer.style.backfaceVisibility = 'visible';
            mediaPlayer.style.perspective = 'none';
        }
        
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
}



// Load saved playlist
const savedPlaylist = store.get('playlist', []);
if (savedPlaylist.length > 0) {
    playlist = savedPlaylist;
    updatePlaylistUI();
}

function showControls() {
    const controlsOverlay = document.getElementById('controls-overlay');
    controlsOverlay.style.opacity = '1';
    document.body.classList.remove('hide-cursor');
    
    if (isFullscreen) {
        clearTimeout(controlsTimeout);
        controlsTimeout = setTimeout(hideControls, INACTIVITY_TIMEOUT);
    }
}

function hideControls() {
    if (isFullscreen) {
        const controlsOverlay = document.getElementById('controls-overlay');
        controlsOverlay.style.opacity = '0';
        document.body.classList.add('hide-cursor');
    }
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
    if (!filePaths || filePaths.length === 0) return;

    // Add files with basic info first
    const promises = filePaths.map(addToPlaylist);

    if (currentIndex === -1) {
        currentIndex = 0;
        playFile(filePaths[0]);
    }

    // Save playlist after basic info is added
    store.set('playlist', playlist);

    // Wait for metadata in background
    await Promise.allSettled(promises);
    store.set('playlist', playlist); // Update with complete metadata
}

async function addToPlaylist(filePath) {
    // Get basic file info immediately
    const basicInfo = {
        path: filePath,
        metadata: {
            title: path.basename(filePath),
            artist: 'Unknown Artist',
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
        
        // Optional: Load full metadata in background
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
    
    // Add a container for playlist items
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

    // Add container-level drag events
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
    
    // Update UI and save
    updatePlaylistUI();
    store.set('playlist', playlist);
}

async function playFile(filePath) {
    if (!filePath) {
        console.warn('No file path provided to playFile');
        return;
    }

    mediaPlayer.removeAttribute('src');
    mediaPlayer.load();

    if (isHardwareAccelerated) {
        // Enable hardware acceleration hints
        mediaPlayer.style.transform = 'translateZ(0)';
        mediaPlayer.style.willChange = 'transform';
        
        // Enable hardware decoding
        mediaPlayer.setAttribute('x-webkit-airplay', 'allow');
        mediaPlayer.setAttribute('webkit-playsinline', '');
        mediaPlayer.setAttribute('playsinline', '');

        mediaPlayer.setAttribute('decode', 'async');
        
        // Add these hints for hardware-accelerated video rendering
        if (mediaPlayer.canPlayType('video/mp4; codecs="avc1.42E01E"')) {
            mediaPlayer.setAttribute('hardware', 'prefer-hardware');
        }
    }


    mediaPlayer.src = filePath;
    
    // Detect and load subtitles for the new file
    subtitlesManager.detectSubtitles(filePath).catch(err => {
        console.warn('Error loading subtitles:', err);
    });

    const shouldRememberPlayback = store.get('rememberPlayback', true);
    const lastPosition = shouldRememberPlayback ? getLastPosition(filePath) : null;

    if (lastPosition) {
        // Create resume dialog
        const shouldResume = await new Promise(resolve => {
            const dialog = document.createElement('div');
            dialog.className = 'resume-dialog';
            dialog.innerHTML = `
                <div class="resume-content">
                    <p>Resume from ${formatTime(lastPosition.position)}?</p>
                    <div class="resume-buttons">
                        <button class="resume-yes">Yes</button>
                        <button class="resume-no">No</button>
                    </div>
                </div>
            `;
            
            // Add dialog styles if not already in stylesheet
            const style = document.createElement('style');
            style.textContent = `
                .resume-dialog {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: rgba(0, 0, 0, 0.9);
                    padding: 20px;
                    border-radius: 8px;
                    z-index: 1000;
                }
                .resume-content {
                    color: white;
                    text-align: center;
                }
                .resume-buttons {
                    display: flex;
                    gap: 10px;
                    justify-content: center;
                    margin-top: 10px;
                }
                .resume-buttons button {
                    padding: 5px 15px;
                    border: 1px solid rgba(255, 255, 255, 0.05);
                    border-radius: 4px;
                    cursor: pointer;
                    background: rgba(255, 255, 255, 0.03);
                    color: white;
                }
                .resume-buttons button:hover {
                    background: rgba(255, 255, 255, 0.06);
                    border: 1px solid var(--primary-color);
                }
            `;
            document.head.appendChild(style);
            
            document.getElementById('player-container').appendChild(dialog);
            
            // Handle user choice
            dialog.querySelector('.resume-yes').onclick = () => {
                dialog.remove();
                resolve(true);
            };
            dialog.querySelector('.resume-no').onclick = () => {
                dialog.remove();
                resolve(false);
            };
            
            // Auto-hide dialog after 10 seconds and start from beginning
            setTimeout(() => {
                if (dialog.parentNode) {
                    dialog.remove();
                    resolve(false);
                }
            }, 10000);
        });
        
        if (shouldResume) {
            mediaPlayer.currentTime = lastPosition.position;
        } else {
            mediaPlayer.currentTime = 0;
        } 
    } else {
        mediaPlayer.currentTime = 0;
    }

    const playPromise = new Promise((resolve, reject) => {
        const onPlaying = () => {
            if (isHardwareAccelerated) {
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
        await playPromise;
        updatePlayPauseIcon(false);
    } catch (error) {
        console.error('Error playing file:', error);
        if (isHardwareAccelerated && (error.name === 'NotSupportedError' || error.name === 'AbortError')) {
            console.warn('Hardware decoding failed, falling back to software decoding');
            toggleHardwareAcceleration(false);
            return playFile(filePath); // Retry with hardware acceleration disabled
        }
        alert('Error playing file. The file may be invalid or unsupported.');
    }
    updatePlaylistUI();
    updateWindowTitle();
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
    
    const volumeChange = e.deltaY > 0 ? -0.10 : 0.10;
    const newVolume = Math.max(0, Math.min(1, mediaPlayer.volume + volumeChange));
    
    mediaPlayer.volume = newVolume;
    volumeSlider.value = newVolume * 100;
    lastVolume = newVolume;
    
    // Update volume icon
    if (newVolume === 0) {
        muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>`;
    } else {
        muteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path><path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path></svg>`;
    }
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
        ipcRenderer.send('toggle-menu-bar', true); // Add this line to show menu bar
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
    
    if (isLooping) {
        mediaPlayer.play();
    } else if (playlist.length > 0 && currentIndex < playlist.length - 1) {
        playNext();
    } else {
        // If we're at the end of the playlist, reset the player
        mediaPlayer.pause();
        updatePlayPauseIcon(true);
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

const clearPlaylistBtn = document.getElementById('clear-playlist');

clearPlaylistBtn.addEventListener('click', () => {
    if (playlist.length > 0) {
        clearPlaylist();
    }
});

function checkHardwareAccelerationSupport() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    
    if (!gl) {
        console.warn('WebGL not supported - hardware acceleration may be limited');
        return false;
    }

    // Check for video texture support
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        console.log('Graphics hardware:', renderer);
    }

    return true;
}

// IPC Events
ipcRenderer.on('change-theme', (_, themeName) => {
    applyTheme(themeName);
});
ipcRenderer.on('menu-open-files', openFiles);
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

// Initialize hardware acceleration state when player loads
document.addEventListener('DOMContentLoaded', async () => {
    // Check hardware support
    const hasHardwareSupport = checkHardwareAccelerationSupport();
    
    // If no hardware support, force disable regardless of stored setting
    if (!hasHardwareSupport) {
        isHardwareAccelerated = false;
        store.set('hardwareAcceleration', false);
    } else {
        // Load saved setting from store
        isHardwareAccelerated = store.get('hardwareAcceleration', true);
    }
    
    // Initialize hardware acceleration state
    toggleHardwareAcceleration(isHardwareAccelerated);
});

// Drag and drop support
document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
});

document.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const supportedFormats = [
        // Video
        '.mp4', '.mkv', '.avi', '.webm', '.mov', '.flv', '.m4v', '.3gp', '.wmv',
        // Audio
        '.mp3', '.wav', '.ogg', '.aac', '.m4a', '.flac', '.wma', '.opus'
      ];
    

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
    if (e.target.error && isHardwareAccelerated) {
        const errorCode = e.target.error.code;
        // Check for common hardware acceleration related errors
        if (errorCode === MediaError.MEDIA_ERR_DECODE || 
            errorCode === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
            console.warn('Possible hardware acceleration error, falling back to software decoding');
            toggleHardwareAcceleration(false);
            
            // Retry playback if we have a current file
            if (currentIndex !== -1 && playlist[currentIndex]) {
                playFile(playlist[currentIndex].path);
            }
        }
    }
});

// Save playlist before window closes
window.addEventListener('beforeunload', () => {
    store.set('playlist', playlist);
});