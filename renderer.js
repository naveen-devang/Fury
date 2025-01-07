const { ipcRenderer } = require('electron');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const ffprobePath = require('@ffprobe-installer/ffprobe').path;  // Add this line
const path = require('path');
const Store = new require('electron-store');
const store = new Store();


const fs = require('fs').promises; // Add this import at the top with other imports

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath);

// Store for subtitle associations
const subtitleStore = new Store({
    name: 'subtitles'
});

// Track subtitle associations with media files
let mediaSubtitleMap = new Map();

let playlist = [];
let currentIndex = -1;
let isLooping = false;
let isShuffling = false;

let currentSubtitleTrack = null;
let subtitlesEnabled = true;

let activeSubtitleTrack = null;
let subtitleTracks = new Map(); // Store subtitle tracks with their sources

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

const subtitleMenu = createSubtitleMenu();
document.getElementById('subtitles').parentElement.appendChild(subtitleMenu);

// Initialize player state
let lastVolume = 0.5; // 50%
mediaPlayer.volume = 0.5;
volumeSlider.value = 50; // Set slider to 50%

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


function createSubtitleMenu() {
    const menu = document.createElement('div');
    menu.className = 'subtitle-menu';
    menu.style.cssText = `
        position: absolute;
        bottom: 100%;
        right: 0;
        background: var(--control-bg);
        border-radius: 4px;
        padding: 8px;
        display: none;
        z-index: 1001;
    `;

    // Add "Off" option
    const offTrack = document.createElement('div');
    offTrack.className = 'subtitle-track';
    offTrack.textContent = 'Off';
    offTrack.addEventListener('click', () => {
        disableAllSubtitles();
        menu.style.display = 'none';
    });
    menu.appendChild(offTrack);

    return menu;
}

// Load saved subtitle associations
function loadSavedSubtitleAssociations() {
    const savedAssociations = subtitleStore.get('associations') || {};
    mediaSubtitleMap = new Map(Object.entries(savedAssociations));
}

// Save subtitle associations
function saveSubtitleAssociations() {
    const associations = Object.fromEntries(mediaSubtitleMap);
    subtitleStore.set('associations', associations);
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
document.getElementById('subtitles').addEventListener('click', (e) => {
    e.stopPropagation();
    subtitleMenu.style.display = subtitleMenu.style.display === 'none' ? 'block' : 'none';
});

// Close menu when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.subtitle-menu') && !e.target.closest('#subtitles')) {
        subtitleMenu.style.display = 'none';
    }
});

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
    try {
        const filePaths = await ipcRenderer.invoke('open-files');
        if (!filePaths || filePaths.length === 0) return;

        for (const filePath of filePaths) {
            try {
                await addToPlaylist(filePath);
            } catch (error) {
                console.error(`Error adding file ${filePath}:`, error);
            }
        }

        if (currentIndex === -1) {
            currentIndex = 0;
            playFile(playlist[0].path);
        }

        // Save playlist after adding files
        store.set('playlist', playlist);
    } catch (error) {
        console.error('Error in openFiles:', error);
    }
}

async function addToPlaylist(filePath) {
    try {
        // First check if file exists and is readable
        const fileUrl = path.resolve(filePath);
        
        // Add file immediately with basic info
        const basicInfo = {
            path: fileUrl,
            metadata: {
                title: path.basename(filePath),
                artist: 'Loading...',
                duration: 0
            }
        };
        
        const index = playlist.length;
        playlist.push(basicInfo);
        updatePlaylistUI();

        // Start playing immediately if it's the first file
        if (playlist.length === 1) {
            currentIndex = 0;
            playFile(fileUrl);
        }

        // Load metadata asynchronously
        ffmpeg.ffprobe(fileUrl, (err, metadata) => {
            if (err) {
                console.error('Error checking media file:', err);
                alert('Error playing file. The file may be invalid or unsupported.');
                return;
            }
        
            // Clear existing subtitles
            clearSubtitles();
        
            // Check for embedded subtitles
            const subtitleStreams = metadata.streams.filter(stream => 
                stream.codec_type === 'subtitle'
            );
        
            if (subtitleStreams.length > 0) {
                // Create tracks for each embedded subtitle
                subtitleStreams.forEach(stream => {
                    const track = document.createElement('track');
                    track.kind = 'subtitles';
                    track.label = stream.tags?.title || `Subtitle Track ${stream.index}`;
                    track.srclang = stream.tags?.language || 'und';
                    track.src = `file://${fileUrl.replace(/\\/g, '/')}#${stream.index}`;
                    track.default = stream.disposition?.default === 1;
                    mediaPlayer.appendChild(track);
                });
            }
        

            // Extract relevant metadata
            const format = metadata.format;
            const streams = metadata.streams;
            const tags = format.tags || {};
            
            // Get the first audio/video stream
            const mediaStream = streams.find(s => s.codec_type === 'audio' || s.codec_type === 'video');
            
            // Update playlist item with full metadata
            playlist[index].metadata = {
                title: tags.title || tags.TITLE || path.basename(filePath),
                artist: tags.artist || tags.ARTIST || tags.album_artist || tags.ALBUM_ARTIST || 'Unknown Artist',
                duration: format.duration || 0,
                bitrate: format.bit_rate,
                codec: mediaStream ? mediaStream.codec_name : 'unknown',
                type: mediaStream ? mediaStream.codec_type : 'unknown'
            };
            
            updatePlaylistUI();
            // Save updated playlist
            store.set('playlist', playlist);
        });

    } catch (error) {
        console.error('Error in addToPlaylist:', error);
        throw error;
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

async function loadSubtitles() {
    try {
        if (currentIndex === -1 || !playlist[currentIndex]) {
            alert('Please select a media file first before adding subtitles.');
            return;
        }

        const filePaths = await ipcRenderer.invoke('open-subtitle');
        if (!filePaths || filePaths.length === 0) return;

        for (const subtitlePath of filePaths) {
            const currentMediaPath = path.resolve(playlist[currentIndex].path);
            
            try {
                const subtitleContent = await ipcRenderer.invoke('read-subtitle-file', subtitlePath);
                const label = path.basename(subtitlePath, path.extname(subtitlePath));
                
                // Try to detect language from filename
                const langMatch = label.match(/\.(eng|en|spa|es|fra|fr|ger|de|ita|it|por|pt|rus|ru|jpn|ja|kor|ko|chi|zh)$/i);
                const language = langMatch ? langMatch[1].substring(0, 2).toLowerCase() : 'en';
                
                await loadSubtitleContent(subtitleContent, subtitlePath, language, label);
                
                // Save the association (now as an array)
                const currentAssociations = mediaSubtitleMap.get(currentMediaPath) || [];
                if (!currentAssociations.includes(subtitlePath)) {
                    currentAssociations.push(subtitlePath);
                    mediaSubtitleMap.set(currentMediaPath, currentAssociations);
                    saveSubtitleAssociations();
                }
            } catch (error) {
                console.error(`Error loading subtitle file ${subtitlePath}:`, error);
                alert(`Error loading subtitle: ${error.message}\nPlease check if the subtitle file is valid and try again.`);
            }
        }
    } catch (error) {
        console.error('Subtitle loading error:', error);
        alert(`Error loading subtitles: ${error.message}`);
    }
}

async function loadSubtitleContent(content, subtitlePath, language = 'en', label = null) {
    try {
        // Convert SRT to VTT if necessary
        let subtitleContent = content;
        if (subtitlePath.toLowerCase().endsWith('.srt')) {
            subtitleContent = await convertSrtToVtt(content);
        }

        const blob = new Blob([subtitleContent], { type: 'text/vtt' });
        const blobUrl = URL.createObjectURL(blob);

        // Generate a descriptive label
        const fileName = path.basename(subtitlePath);
        const trackLabel = label || `${language.toUpperCase()} Subtitles`;

        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = trackLabel;
        track.srclang = language;
        track.src = blobUrl;
        track.default = false; // Set default to false initially

        // Create track info object
        const trackInfo = {
            track: track,
            blobUrl: blobUrl,
            path: subtitlePath,
            language: language,
            label: trackLabel
        };

        // Store track info before adding to player
        subtitleTracks.set(subtitlePath, trackInfo);

        // Add track to player
        mediaPlayer.appendChild(track);

        // Add to subtitle menu
        const menuItem = document.createElement('div');
        menuItem.className = 'subtitle-track';
        menuItem.textContent = trackLabel;
        menuItem.addEventListener('click', () => {
            console.log('Subtitle menu item clicked:', trackLabel);
            enableSubtitleTrack(trackInfo);
            subtitleMenu.style.display = 'none';
        });
        subtitleMenu.appendChild(menuItem);

        // Add track load event listener
        track.addEventListener('load', () => {
            console.log('Track loaded:', trackLabel);
        });

        track.addEventListener('error', (e) => {
            console.error('Track error:', e);
        });

        return track;
    } catch (error) {
        console.error('Error loading subtitle content:', error);
        throw error;
    }
}


function setActiveTrack(selectedTrack) {
    // First, disable all text tracks
    const tracks = mediaPlayer.textTracks;
    for (let i = 0; i < tracks.length; i++) {
        tracks[i].mode = 'disabled';  // Use 'disabled' instead of 'hidden'
    }
    
    // Then enable only the selected track
    if (selectedTrack) {
        selectedTrack.mode = 'showing';
    }
}

function enableSubtitleTrack(trackInfo) {
    if (!trackInfo || !trackInfo.track) {
        console.log('Invalid track info:', trackInfo);
        return;
    }

    console.log('Enabling track:', trackInfo.label);

    // Disable all tracks first
    const tracks = mediaPlayer.textTracks;
    Array.from(tracks).forEach(track => {
        console.log('Disabling track:', track.label);
        track.mode = 'disabled';
    });

    // Enable the selected track
    // Since trackInfo.track is the track element, we need to access its track object
    const selectedTrack = Array.from(mediaPlayer.textTracks).find(
        track => track.label === trackInfo.label
    );

    if (selectedTrack) {
        console.log('Setting track mode to showing:', selectedTrack.label);
        selectedTrack.mode = 'showing';
        activeSubtitleTrack = trackInfo;
        
        // Update UI
        document.getElementById('subtitles').classList.add('active');
        
        // Update menu items
        const menuItems = subtitleMenu.querySelectorAll('.subtitle-track');
        menuItems.forEach(item => {
            item.classList.toggle('active', item.textContent === trackInfo.label);
        });
    } else {
        console.error('Could not find matching text track:', trackInfo.label);
    }
}

// Modified disableAllSubtitles function
function disableAllSubtitles() {
    // Disable all text tracks
    Array.from(mediaPlayer.textTracks).forEach(track => {
        track.mode = 'disabled';
    });

    activeSubtitleTrack = null;
    document.getElementById('subtitles').classList.remove('active');

    // Update menu items
    const menuItems = subtitleMenu.querySelectorAll('.subtitle-track');
    menuItems.forEach(item => item.classList.remove('active'));
}


// Load saved subtitle associations when the app starts
loadSavedSubtitleAssociations();

// Add cleanup for blob URLs in clearSubtitles function:
function clearSubtitles() {
    // Clean up existing tracks
    const tracks = Array.from(mediaPlayer.getElementsByTagName('track'));
    tracks.forEach(track => {
        mediaPlayer.removeChild(track);
    });

    // Clean up stored tracks
    subtitleTracks.forEach(trackInfo => {
        URL.revokeObjectURL(trackInfo.blobUrl);
    });
    
    // Clear the menu
    while (subtitleMenu.children.length > 1) { // Keep the "Off" option
        subtitleMenu.removeChild(subtitleMenu.lastChild);
    }

    subtitleTracks.clear();
    activeSubtitleTrack = null;
    document.getElementById('subtitles').classList.remove('active');
}

function toggleSubtitles() {
    subtitlesEnabled = !subtitlesEnabled;
    
    // Handle all text tracks
    const textTracks = Array.from(mediaPlayer.textTracks);
    if (textTracks.length > 0) {
        textTracks.forEach(track => {
            try {
                track.mode = subtitlesEnabled ? 'showing' : 'hidden';
            } catch (error) {
                console.error('Error toggling subtitle track:', error);
            }
        });
    }
    
    // Update UI
    const subtitlesBtn = document.getElementById('subtitles');
    if (subtitlesBtn) {
        subtitlesBtn.classList.toggle('active', subtitlesEnabled);
    }
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
    try {
        const fileUrl = path.resolve(filePath);
        console.log('Playing file:', fileUrl);

        // Clear existing subtitles before loading new ones
        clearSubtitles();

        const mediaUrl = `file://${fileUrl.replace(/\\/g, '/')}`;
        
        // Check for matching subtitle files in the same directory
        const subtitleFiles = await findMatchingSubtitles(fileUrl);
        console.log('Found matching subtitles:', subtitleFiles);

        ffmpeg.ffprobe(fileUrl, async (err, metadata) => {
            if (err) {
                console.error('Error checking media file:', err);
                alert('Error playing file. The file may be invalid or unsupported.');
                return;
            }
        
            // Set the source and play
            mediaPlayer.src = mediaUrl;
            
            // First check for embedded subtitles
            const subtitleStreams = metadata.streams.filter(stream => 
                stream.codec_type === 'subtitle'
            );
        
            let englishTrackFound = false;
        
            if (subtitleStreams.length > 0) {
                // Sort streams to prioritize English subtitles
                const sortedStreams = [...subtitleStreams].sort((a, b) => {
                    const aIsEng = (a.tags?.language === 'eng' || a.tags?.language === 'en');
                    const bIsEng = (b.tags?.language === 'eng' || b.tags?.language === 'en');
                    return bIsEng - aIsEng;  // Put English tracks first
                });
        
                // Create tracks for each embedded subtitle
                sortedStreams.forEach((stream, index) => {
                    const track = document.createElement('track');
                    track.kind = 'subtitles';
                    track.label = stream.tags?.title || `Subtitle Track ${stream.index}`;
                    track.srclang = stream.tags?.language || 'und';
                    track.src = `file://${fileUrl.replace(/\\/g, '/')}#${stream.index}`;
                    
                    // Set mode to disabled initially
                    track.mode = 'disabled';
                    
                    // Check if this is an English track
                    const isEnglish = (stream.tags?.language === 'eng' || stream.tags?.language === 'en');
                    
                    if (isEnglish && !englishTrackFound) {
                        englishTrackFound = true;
                        // Use a setTimeout to ensure track is properly loaded before enabling
                        setTimeout(() => {
                            track.mode = 'showing';
                        }, 100);
                    }
                    
                    mediaPlayer.appendChild(track);
                });
            }
        
            // Load external subtitle files
            const subtitleFiles = await findMatchingSubtitles(fileUrl);
            
            // Only load external subtitles if no English embedded subtitle was found
            if (!englishTrackFound) {
                for (const subtitlePath of subtitleFiles) {
                    try {
                        const subtitleContent = await ipcRenderer.invoke('read-subtitle-file', subtitlePath);
                        // Detect language from file name
                        const fileName = path.basename(subtitlePath).toLowerCase();
                        let language = 'en'; // default
                        
                        if (fileName.includes('.kr') || fileName.includes('.kor')) {
                            language = 'ko';
                        } else if (fileName.includes('.en') || fileName.includes('.eng')) {
                            language = 'en';
                        }
                        
                        const track = await loadSubtitleContent(subtitleContent, subtitlePath, language);
                        
                        // Enable English track if found and no embedded English track exists
                        if (language === 'en' && !englishTrackFound) {
                            englishTrackFound = true;
                            setTimeout(() => {
                                track.mode = 'showing';
                            }, 100);
                        }
                    } catch (error) {
                        console.error('Error loading subtitle:', error);
                    }
                }
            }
        
            // Finally, try loading associated subtitles if none found automatically
            if (!englishTrackFound && mediaSubtitleMap.has(fileUrl)) {
                const savedSubtitlePaths = mediaSubtitleMap.get(fileUrl);
                if (Array.isArray(savedSubtitlePaths)) {
                    for (const savedSubtitlePath of savedSubtitlePaths) {
                        try {
                            const subtitleContent = await ipcRenderer.invoke('read-subtitle-file', savedSubtitlePath);
                            await loadSubtitleContent(subtitleContent, savedSubtitlePath);
                        } catch (error) {
                            console.error('Error loading saved subtitles:', error);
                        }
                    }
                }
            }
        
            // If no English track was found and enabled, try enabling the first available track
            setTimeout(() => {
                if (!englishTrackFound && mediaPlayer.textTracks.length > 0) {
                    const firstTrack = mediaPlayer.textTracks[0];
                    if (firstTrack) {
                        firstTrack.mode = 'showing';
                    }
                }
            }, 100);
        
            mediaPlayer.play()
                .then(() => {
                    updatePlayPauseIcon(false);
                    console.log('Playback started successfully');
                })
                .catch(error => {
                    console.error('Error playing file:', error);
                    alert('Error playing file. The file may be invalid or unsupported.');
                });
        
            updatePlaylistUI();
            updateWindowTitle();
        });
    } catch (error) {
        console.error('Error in playFile:', error);
        alert('Error playing file. The file may be invalid or unsupported.');
    }
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
    if (index >= 0 && index < playlist.length) {
        const mediaPath = path.resolve(playlist[index].path);
        mediaSubtitleMap.delete(mediaPath);
        saveSubtitleAssociations();
    }
    
    playlist.splice(index, 1);
    updatePlaylistUI();
    store.set('playlist', playlist);
}

function clearPlaylist() {
    mediaSubtitleMap.clear();
    saveSubtitleAssociations();
    playlist = [];
    currentIndex = -1;
    mediaPlayer.src = '';
    updatePlaylistUI();
    updateWindowTitle();
    store.set('playlist', playlist);
}

function isMatchingSubtitle(videoPath, subtitlePath) {
    const videoBaseName = path.basename(videoPath, path.extname(videoPath));
    const subtitleBaseName = path.basename(subtitlePath, path.extname(subtitlePath));
    
    // Check for exact match
    if (subtitleBaseName === videoBaseName) return true;
    
    // Common language codes
    const languageCodes = [
        'eng', 'en', 'english',
        'kor', 'ko', 'korean',
        'jpn', 'ja', 'japanese',
        'chi', 'zh', 'chinese',
        'spa', 'es', 'spanish',
        'fre', 'fr', 'french',
        'ger', 'de', 'german'
    ];
    
    // Generate patterns for all language codes
    const patterns = [];
    
    // Add base patterns
    patterns.push(videoBaseName); // Exact match
    
    // Add language code patterns
    languageCodes.forEach(lang => {
        patterns.push(
            `${videoBaseName}.${lang}`,
            `${videoBaseName}_${lang}`,
            `${videoBaseName} ${lang}`,
            `${videoBaseName}-${lang}`
        );
    });
    
    // Add special patterns
    patterns.push(
        `${videoBaseName}.forced`,
        `${videoBaseName}.default`,
        `${videoBaseName}.sub`
    );
    
    // Check if the subtitle filename matches any pattern
    return patterns.some(pattern => {
        const normalizedPattern = pattern.toLowerCase().replace(/[.'"\s-_]+/g, '');
        const normalizedSubtitle = subtitleBaseName.toLowerCase().replace(/[.'"\s-_]+/g, '');
        return normalizedSubtitle.includes(normalizedPattern) || normalizedPattern.includes(normalizedSubtitle);
    });
}

// Modified to use ipcRenderer for file operations since we're in the renderer process
async function findMatchingSubtitles(videoPath) {
    try {
        // Send request to main process to read directory
        const files = await ipcRenderer.invoke('read-directory', path.dirname(videoPath));
        const subtitleExtensions = ['.srt', '.vtt', '.ass', '.ssa', '.sub', '.ttml', '.dfxp'];
        
        // Filter for subtitle files that match the video name
        const matchingSubtitles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return subtitleExtensions.includes(ext) && 
                   isMatchingSubtitle(videoPath, file);
        });
        
        // Return full paths
        return matchingSubtitles.map(file => path.join(path.dirname(videoPath), file));
    } catch (error) {
        console.error('Error finding subtitles:', error);
        return [];
    }
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
ipcRenderer.on('menu-load-subtitles', loadSubtitles);
ipcRenderer.on('menu-toggle-subtitles', toggleSubtitles);

// Drag and drop support
document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
});

document.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    try {
        const supportedFormats = [
            '.mp4', '.mkv', '.avi', '.webm', '.mov', '.flv', '.m4v', '.3gp', '.wmv',
            '.mp3', '.wav', '.ogg', '.aac', '.m4a', '.flac', '.wma', '.opus'
        ];

        const files = Array.from(e.dataTransfer.files)
            .filter(file => {
                const ext = path.extname(file.path).toLowerCase();
                return supportedFormats.includes(ext);
            });

        for (const file of files) {
            try {
                await addToPlaylist(file.path);
            } catch (error) {
                console.error(`Error adding file ${file.path}:`, error);
            }
        }

        if (currentIndex === -1 && files.length > 0) {
            currentIndex = 0;
            playFile(files[0].path);
        }

        store.set('playlist', playlist);
    } catch (error) {
        console.error('Error in drop handler:', error);
    }
});

// Error handling
mediaPlayer.addEventListener('error', (e) => {
    console.error('Media Player Error:', e);
    console.error('Media Error Code:', mediaPlayer.error?.code);
    console.error('Media Error Message:', mediaPlayer.error?.message);
    
    if (currentIndex >= 0 && playlist[currentIndex]) {
        console.log('Current file path:', playlist[currentIndex].path);
    }
    
    alert(`Error playing media: ${mediaPlayer.error?.message || 'Unknown error'}`);
    playNext();
});


// Save playlist before window closes
window.addEventListener('beforeunload', () => {
    store.set('playlist', playlist);
});