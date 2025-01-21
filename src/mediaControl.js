const Store = new require('electron-store');
const store = new Store();

const volumeSlider = document.getElementById('volume-slider');
const previousBtn = document.getElementById('previous');
const nextBtn = document.getElementById('next');
const playPauseBtn = document.getElementById('play-pause');
const muteBtn = document.getElementById('mute');


playPauseBtn.addEventListener('click', togglePlayPause);
previousBtn.addEventListener('click', playPrevious);
nextBtn.addEventListener('click', playNext);
muteBtn.addEventListener('click', toggleMute);
volumeSlider.addEventListener('input', updateVolume);

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


module.exports = { volumeSlider, previousBtn, nextBtn, playPauseBtn, muteBtn, updateVolume, toggleMute, playPrevious, playNext, togglePlayPause }