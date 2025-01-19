const { ipcRenderer } = require('electron');
const fs = require('fs').promises;
const Store = new require('electron-store');
const os = require('os');
const { promisify } = require('util');
const path = require('path');
const { app } = require('@electron/remote');
const ffmpeg = require('fluent-ffmpeg');

class AudioManager {
    constructor(mediaPlayer) {
        this.debug = true;
        this.mediaPlayer = mediaPlayer;
        this.currentAudioTracks = [];
        this.embeddedAudioTracks = [];
        this.activeTrack = null;
        this.audioCache = new Map();
        this.tempDir = path.join(os.tmpdir(), 'video-player-audio');

        this.store = new Store();
        this.autoLoadEnabled = this.store.get('autoLoadAudio', true);
        this.defaultLanguage = this.store.get('defaultAudioLanguage', 'eng');
        this.audioHistory = this.store.get('audioHistory', {});
        this.lastSelectedLanguage = this.store.get('lastSelectedAudioLanguage', null);

        this.extractedEmbeddedAudio = new Map();
        this.embeddedAudioHistory = this.store.get('embeddedAudioHistory', {});
        this.extractedAudioCache = this.store.get('extractedAudioCache', {});

        // Initialize the audio menu after DOM is loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializeAudioMenu());
        } else {
            this.initializeAudioMenu();
        }

        // Add cleanup on window close
        window.addEventListener('beforeunload', () => {
            this.saveAudioState();
            this.store.set('extractedAudioCache', Object.fromEntries(this.extractedEmbeddedAudio));
            this.cleanupTempFiles();
            this.store.set('embeddedAudioHistory', this.embeddedAudioHistory);
        });

        // Language codes (same as subtitle manager)
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
            'kor': 'Korean',
            'ko': 'Korean',
            'chi': 'Chinese',
            'zh': 'Chinese',
            'rus': 'Russian',
            'ru': 'Russian',
            'por': 'Portuguese',
            'pt': 'Portuguese',
            'ara': 'Arabic',
            'ar': 'Arabic',
            'hin': 'Hindi',
            'hi': 'Hindi',
            'ben': 'Bengali',
            'bn': 'Bengali',
            'vie': 'Vietnamese',
            'vi': 'Vietnamese',
            'tha': 'Thai',
            'th': 'Thai',
            'nld': 'Dutch',
            'nl': 'Dutch',
            'pol': 'Polish',
            'pl': 'Polish',
            'tur': 'Turkish',
            'tr': 'Turkish',
            'ukr': 'Ukrainian',
            'uk': 'Ukrainian',
            'swe': 'Swedish',
            'sv': 'Swedish',
            'dan': 'Danish',
            'da': 'Danish',
            'fin': 'Finnish',
            'fi': 'Finnish',
            'nor': 'Norwegian',
            'no': 'Norwegian',
            'heb': 'Hebrew',
            'he': 'Hebrew',
            'iw': 'Hebrew',
            'hun': 'Hungarian',
            'hu': 'Hungarian',
            'ces': 'Czech',
            'cs': 'Czech',
            'ell': 'Greek',
            'el': 'Greek',
            'ron': 'Romanian',
            'rum': 'Romanian',
            'ro': 'Romanian',
            'ind': 'Indonesian',
            'id': 'Indonesian',
            'may': 'Malay',
            'ms': 'Malay',
            'cat': 'Catalan',
            'ca': 'Catalan',
            'bul': 'Bulgarian',
            'bg': 'Bulgarian',
            'hrv': 'Croatian',
            'hr': 'Croatian',
            'srp': 'Serbian',
            'sr': 'Serbian',
            'slk': 'Slovak',
            'sk': 'Slovak',
            'slv': 'Slovenian',
            'sl': 'Slovenian'
        };
    }

    initializeAudioMenu() {
        // Remove existing menu if present
        const existingMenu = document.querySelector('.audio-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        const controlsOverlay = document.getElementById('controls-overlay');
        if (!controlsOverlay) return;

        const advancedOptions = controlsOverlay.querySelector('.advanced-options');
        if (!advancedOptions) return;

        // Create audio button
        const audioButton = document.createElement('button');
        audioButton.className = 'control-button';
        audioButton.id = 'audio-button';
        audioButton.title = 'Audio Tracks';
        audioButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                <line x1="12" y1="19" x2="12" y2="23"/>
                <line x1="8" y1="23" x2="16" y2="23"/>
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
                <div class="audio-controls">
                    <button id="load-audio">Load Audio File</button>
                    <label>
                        <input type="checkbox" id="auto-load-audio" ${this.autoLoadEnabled ? 'checked' : ''}>
                        Auto-load audio
                    </label>
                </div>
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

        document.getElementById('auto-load-audio')?.addEventListener('change', (e) => {
            this.autoLoadEnabled = e.target.checked;
            this.store.set('autoLoadAudio', this.autoLoadEnabled);
        });

        document.getElementById('load-audio')?.addEventListener('click', () => {
            this.loadAudioFile();
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

        this.updateAudioMenu();
    }

    async detectEmbeddedAudio(videoPath) {
        return new Promise((resolve, reject) => {
            ffmpeg.ffprobe(videoPath, (err, metadata) => {
                if (err) {
                    resolve([]);
                    return;
                }

                if (!metadata || !metadata.streams) {
                    resolve([]);
                    return;
                }

                const audioStreams = metadata.streams.filter(stream => 
                    stream.codec_type === 'audio'
                );

                const audioInfo = audioStreams.map(stream => ({
                    index: stream.index,
                    language: stream.tags?.language || 'und',
                    title: stream.tags?.title || `Audio Stream ${stream.index}`,
                    codec: stream.codec_name,
                    channels: stream.channels || 2
                }));

                resolve(audioInfo);
            });
        });
    }

    async extractEmbeddedAudio(videoPath, streamIndex) {
        const outputPath = path.join(this.tempDir, `audio_${streamIndex}_${Date.now()}.aac`);

        return new Promise((resolve, reject) => {
            ffmpeg(videoPath)
                .outputOptions([
                    `-map 0:${streamIndex}`,
                    '-c:a aac'
                ])
                .output(outputPath)
                .on('end', () => resolve(outputPath))
                .on('error', (err) => reject(err))
                .run();
        });
    }

    async loadAudioFile() {
        const result = await ipcRenderer.invoke('open-audio-file');
        if (result.filePaths.length > 0) {
            await this.addAudioTrack(result.filePaths[0]);
        }
    }

    async addAudioTrack(filePath, isEmbedded = false, embedInfo = null) {
        try {
            // Create a new audio element
            const audioTrack = document.createElement('audio');
            audioTrack.src = `file://${filePath}`;
            audioTrack.preload = 'auto';

            // Set custom attributes
            audioTrack.dataset.originalPath = filePath;
            audioTrack.dataset.isEmbedded = isEmbedded;
            if (isEmbedded) {
                audioTrack.dataset.streamIndex = embedInfo.index;
                audioTrack.dataset.language = embedInfo.language;
                audioTrack.dataset.title = embedInfo.title;
            }

            // Add to tracks list
            if (!this.currentAudioTracks.includes(filePath)) {
                this.currentAudioTracks.push(filePath);
            }

            this.updateAudioMenu();
            return audioTrack;
        } catch (error) {
            console.error('Error adding audio track:', error);
            throw error;
        }
    }

    async setActiveAudio(filePath) {
        // Disable current audio track if any
        if (this.activeTrack) {
            this.activeTrack.pause();
            this.activeTrack = null;
        }

        if (filePath) {
            const audioElements = Array.from(document.querySelectorAll('audio[data-original-path]'));
            const matchingTrack = audioElements.find(track => track.dataset.originalPath === filePath);

            if (matchingTrack) {
                // Sync with video
                matchingTrack.currentTime = this.mediaPlayer.currentTime;
                matchingTrack.play();
                this.activeTrack = matchingTrack;

                // Update history
                if (this.currentVideoPath) {
                    if (matchingTrack.dataset.isEmbedded === 'true') {
                        this.embeddedAudioHistory[this.currentVideoPath] = {
                            streamIndex: parseInt(matchingTrack.dataset.streamIndex),
                            language: matchingTrack.dataset.language
                        };
                    } else {
                        this.audioHistory[this.currentVideoPath] = filePath;
                    }
                }

                this.saveAudioState();
                this.updateAudioMenu();
            }
        }
    }

    updateAudioMenu() {
        const trackList = document.querySelector('.audio-track-list');
        if (!trackList) return;

        const activeTrackPath = this.activeTrack?.dataset.originalPath;

        trackList.innerHTML = `
            <div class="audio-item ${!activeTrackPath ? 'active' : ''}" data-path="">
                Original Audio
            </div>
            <div class="audio-section">
                ${Array.from(document.querySelectorAll('audio[data-original-path]'))
                    .filter(track => track.dataset.isEmbedded === 'true')
                    .map(track => `
                        <div class="audio-item ${track.dataset.originalPath === activeTrackPath ? 'active' : ''}"
                             data-path="${track.dataset.originalPath.replace(/"/g, '&quot;')}"
                             data-embedded="true"
                             data-stream-index="${track.dataset.streamIndex}">
                            ${this.getAudioLabel(track)}
                        </div>
                    `).join('')}
            </div>
            <div class="audio-section">
                ${Array.from(document.querySelectorAll('audio[data-original-path]'))
                    .filter(track => track.dataset.isEmbedded !== 'true')
                    .map(track => `
                        <div class="audio-item ${track.dataset.originalPath === activeTrackPath ? 'active' : ''}"
                             data-path="${track.dataset.originalPath.replace(/"/g, '&quot;')}">
                            ${this.getAudioLabel(track)}
                        </div>
                    `).join('')}
            </div>
        `;

        // Add click handlers
        trackList.querySelectorAll('.audio-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                e.stopPropagation();
                const path = item.dataset.path;
                await this.setActiveAudio(path || null);
            });
        });
    }

    getAudioLabel(audioElement) {
        if (audioElement.dataset.isEmbedded === 'true') {
            const language = this.languageCodes[audioElement.dataset.language] || audioElement.dataset.language || 'Unknown';
            return audioElement.dataset.title ? 
                `${audioElement.dataset.title} (${language}) [Embedded]` :
                `Audio Track ${audioElement.dataset.streamIndex} (${language}) [Embedded]`;
        } else {
            const fileName = path.basename(audioElement.dataset.originalPath);
            return `${fileName} (External)`;
        }
    }

    // Additional utility methods
    saveAudioState() {
        this.store.set('audioHistory', this.audioHistory);
        this.store.set('embeddedAudioHistory', this.embeddedAudioHistory);
    }

    async cleanupTempFiles() {
        try {
            const files = await fs.readdir(this.tempDir);
            for (const file of files) {
                await fs.unlink(path.join(this.tempDir, file));
            }
        } catch (error) {
            console.error('Error cleaning up temp files:', error);
        }
    }
}

module.exports = AudioManager;