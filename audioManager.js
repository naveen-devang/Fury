const { ipcRenderer } = require('electron');
const { app } = require('@electron/remote');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const Store = new require('electron-store');
const store = new Store();

class AudioTrackManager {
    constructor(mediaPlayer) {
        this.mediaPlayer = mediaPlayer;
        this.debug = true;
        this.currentAudioTracks = [];
        this.activeTrack = null;
        this.store = new Store();
        
        // Initialize FFmpeg
        this.ffmpegAvailable = this.initializeFfmpeg();
        
        // Store preferences
        this.audioTrackHistory = this.store.get('audioTrackHistory', {});
        this.lastSelectedLanguage = this.store.get('lastSelectedAudioLanguage', null);

        this.languageCodes = {
            'eng': 'English',
            'en': 'English',
            'spa': 'Spanish',
            'es': 'Spanish',
            'fre': 'French',
            'fr': 'French',
            'ger': 'German',
            'de': 'German',
            'ita': 'Italian',
            'it': 'Italian',
            'jpn': 'Japanese',
            'ja': 'Japanese',
            // Add more language codes as needed
        };

        // Initialize audio menu when DOM is loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializeAudioMenu());
        } else {
            this.initializeAudioMenu();
        }

        // Clear tracks when media changes
        this.mediaPlayer.addEventListener('loadstart', () => {
            this.clearAudioTracks();
        });

        // Save state before window closes
        window.addEventListener('beforeunload', () => {
            this.saveAudioState();
        });
    }

    log(...args) {
        if (this.debug) {
            console.log('[AudioTrackManager]', ...args);
        }
    }

    initializeFfmpeg() {
        try {
            let ffmpegBinary, ffprobeBinary;

            if (!app.isPackaged) {
                // Development mode
                ffmpegBinary = require('ffmpeg-static');
                ffprobeBinary = require('ffprobe-static').path;
            } else {
                // Production mode
                const ffmpegBinaryDir = path.join(process.resourcesPath, 'ffmpeg-binaries');
                const isWin = process.platform === 'win32';
                const ffmpegExt = isWin ? '.exe' : '';
                const ffprobeExt = isWin ? '.exe' : '';
                
                ffmpegBinary = path.join(ffmpegBinaryDir, `ffmpeg${ffmpegExt}`);
                ffprobeBinary = path.join(ffmpegBinaryDir, `ffprobe${ffprobeExt}`);
            }

            ffmpeg.setFfmpegPath(ffmpegBinary);
            ffmpeg.setFfprobePath(ffprobeBinary);

            const fs = require('fs');
            if (!fs.existsSync(ffmpegBinary) || !fs.existsSync(ffprobeBinary)) {
                throw new Error('FFmpeg binaries not found');
            }

            return true;
        } catch (error) {
            console.error('FFmpeg initialization error:', error);
            return false;
        }
    }

    initializeAudioMenu() {
        // Remove existing menu if present
        const existingMenu = document.querySelector('.audio-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        // Create and append the audio menu to the controls overlay
        const controlsOverlay = document.getElementById('controls-overlay');
        if (!controlsOverlay) return;

        const advancedOptions = controlsOverlay.querySelector('.advanced-options');
        if (!advancedOptions) return;

        // Create audio track button
        const audioButton = document.createElement('button');
        audioButton.className = 'control-button';
        audioButton.id = 'audio-tracks-button';
        audioButton.title = 'Audio Tracks';
        audioButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 6L8 10H4V14H8L12 18V6Z"/>
                <path d="M15.54 8.46C16.4774 9.39764 17.0039 10.6692 17.0039 12C17.0039 13.3308 16.4774 14.6024 15.54 15.54"/>
                <path d="M18.07 5.93C19.9447 7.80528 20.9979 10.3478 20.9979 13C20.9979 15.6522 19.9447 18.1947 18.07 20.07"/>
            </svg>
        `;

        // Create audio menu
        const audioMenu = document.createElement('div');
        audioMenu.className = 'audio-menu';
        audioMenu.style.position = 'absolute';
        audioMenu.style.display = 'none';
        audioMenu.innerHTML = `
            <div class="audio-options">
                <div class="audio-track-list"></div>
            </div>
        `;

        // Insert elements
        advancedOptions.insertBefore(audioButton, advancedOptions.firstChild);
        controlsOverlay.appendChild(audioMenu);

        // Event listeners
        audioButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = audioMenu.style.display === 'block';
            audioMenu.style.display = isVisible ? 'none' : 'block';
            audioButton.classList.toggle('active', !isVisible);
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!audioMenu.contains(e.target) && e.target !== audioButton) {
                audioMenu.style.display = 'none';
                audioButton.classList.remove('active');
            }
        });

        // Prevent menu close when clicking inside
        audioMenu.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Add styles
        const style = document.createElement('style');
        style.textContent = `
            .audio-menu {
                background: rgba(28, 28, 28, 0.9);
                border-radius: 4px;
                padding: 8px;
                min-width: 200px;
                max-height: 300px;
                overflow-y: auto;
                z-index: 1000;
                bottom: 60px;
                right: 10px;
            }
            .audio-track-list {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .audio-item {
                padding: 8px;
                cursor: pointer;
                border-radius: 4px;
                color: #fff;
            }
            .audio-item:hover {
                background: rgba(255, 255, 255, 0.1);
            }
            .audio-item.active {
                background: rgba(255, 255, 255, 0.2);
            }
        `;
        document.head.appendChild(style);
    }

    async detectAudioTracks(videoPath) {
        if (!this.ffmpegAvailable || !videoPath) {
            return [];
        }

        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(videoPath, (err, metadata) => {
                if (err) {
                    console.error('Error detecting audio tracks:', err);
                    resolve([]);
                    return;
                }

                const audioStreams = metadata.streams
                    .filter(stream => stream.codec_type === 'audio')
                    .map(stream => ({
                        index: stream.index,
                        language: stream.tags?.language || 'und',
                        title: stream.tags?.title,
                        codec: stream.codec_name,
                        channels: stream.channels,
                        bitrate: stream.bit_rate
                    }));

                this.currentAudioTracks = audioStreams;
                this.updateAudioMenu();
                resolve(audioStreams);
            });
        });
    }

    getAudioTrackLabel(track) {
        const language = this.languageCodes[track.language] || track.language || 'Unknown';
        const channels = track.channels ? `${track.channels}ch` : '';
        const bitrate = track.bitrate ? `${Math.round(track.bitrate / 1000)}kbps` : '';
        const codec = track.codec ? track.codec.toUpperCase() : '';

        if (track.title) {
            return `${track.title} (${language}) ${channels} ${codec} ${bitrate}`.trim();
        }
        return `Audio Track ${track.index + 1} (${language}) ${channels} ${codec} ${bitrate}`.trim();
    }

    async switchAudioTrack(streamIndex) {
        if (!this.mediaPlayer.currentSrc) return;

        try {
            const currentTime = this.mediaPlayer.currentTime;
            const isPaused = this.mediaPlayer.paused;
            
            // Create a temporary file path for the new video with switched audio
            const tempOutputPath = path.join(os.tmpdir(), `temp_audio_${Date.now()}.mp4`);

            await new Promise((resolve, reject) => {
                ffmpeg(this.mediaPlayer.currentSrc)
                    .outputOptions([
                        '-map 0:v:0', // Copy video stream
                        `-map 0:a:${streamIndex}`, // Select specific audio stream
                        '-c:v copy', // Copy video codec (no re-encoding)
                        '-c:a copy' // Copy audio codec (no re-encoding)
                    ])
                    .output(tempOutputPath)
                    .on('end', resolve)
                    .on('error', reject)
                    .run();
            });

            // Update the video source
            const oldSrc = this.mediaPlayer.src;
            this.mediaPlayer.src = `file://${tempOutputPath}`;
            
            // Restore playback state
            this.mediaPlayer.currentTime = currentTime;
            if (!isPaused) {
                await this.mediaPlayer.play();
            }

            // Clean up old temporary file if it exists
            if (oldSrc.startsWith('file://')) {
                const oldPath = oldSrc.replace('file://', '');
                if (oldPath.includes('temp_audio_')) {
                    try {
                        fs.unlink(oldPath);
                    } catch (error) {
                        console.error('Error cleaning up old temp file:', error);
                    }
                }
            }

            // Save preferences
            if (this.currentAudioTracks[streamIndex]) {
                const videoPath = this.mediaPlayer.currentSrc.replace('file://', '');
                this.audioTrackHistory[videoPath] = streamIndex;
                this.lastSelectedLanguage = this.currentAudioTracks[streamIndex].language;
                this.saveAudioState();
            }

        } catch (error) {
            console.error('Error switching audio track:', error);
            // Implement error handling UI feedback here
        }
    }

    updateAudioMenu() {
        const trackList = document.querySelector('.audio-track-list');
        if (!trackList) return;

        trackList.innerHTML = this.currentAudioTracks.map((track, index) => `
            <div class="audio-item ${track.index === this.activeTrack ? 'active' : ''}"
                 data-stream-index="${track.index}">
                ${this.getAudioTrackLabel(track)}
            </div>
        `).join('');

        // Add click handlers
        trackList.querySelectorAll('.audio-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                e.stopPropagation();
                const streamIndex = parseInt(item.dataset.streamIndex);
                await this.switchAudioTrack(streamIndex);
            });
        });
    }

    clearAudioTracks() {
        this.currentAudioTracks = [];
        this.activeTrack = null;
        this.updateAudioMenu();
    }

    saveAudioState() {
        this.store.set('audioTrackHistory', this.audioTrackHistory);
        this.store.set('lastSelectedAudioLanguage', this.lastSelectedLanguage);
    }
}

module.exports = AudioTrackManager;