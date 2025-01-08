const { ipcRenderer } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const srt2vtt = require('srt-to-vtt');
const { createReadStream } = require('fs');
const Store = new require('electron-store');
const store = new Store();

class SubtitlesManager {
    constructor(mediaPlayer) {
        this.mediaPlayer = mediaPlayer;
        this.currentSubtitles = [];
        this.activeTrack = null;
        this.subtitleCache = new Map();

        this.store = new Store();
        this.autoLoadEnabled = store.get('autoLoadSubtitles', true);
        this.defaultLanguage = store.get('defaultSubtitleLanguage', 'eng');
        this.subtitleHistory = store.get('subtitleHistory', {});
        this.lastSelectedLanguage = store.get('lastSelectedLanguage', null);
        this.globalSubtitleEnabled = this.store.get('globalSubtitleEnabled', false);

        // Add these properties to track the last successful subtitle settings
        this.lastSuccessfulSubtitle = this.store.get('lastSuccessfulSubtitle', null);
        this.lastSuccessfulLanguage = this.store.get('lastSuccessfulLanguage', null);
        
        // Bind the new save state method
        this.saveSubtitleState = this.saveSubtitleState.bind(this);
        
        // Add event listener for when the window closes
        window.addEventListener('beforeunload', () => {
            this.saveSubtitleState();
        });
        
        this.supportedFormats = ['.srt', '.vtt', '.ass', '.ssa', '.sub', '.ttml', '.dfxp'];
        
        // Expanded language codes
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
            'ru': 'Russian'
        };

        // Initialize subtitle menu after DOM is fully loaded
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.initializeSubtitleMenu());
        } else {
            this.initializeSubtitleMenu();
        }

        this.mediaPlayer.addEventListener('loadstart', () => {
            this.clearSubtitles();
        });

        // Add listener for when tracks are added
        this.mediaPlayer.textTracks.addEventListener('addtrack', () => {
            this.disableAllTextTracks();
        });

        // Force cleanup when video loads
        this.mediaPlayer.addEventListener('loadeddata', () => {
            this.disableAllTextTracks();
        });
    }

    saveSubtitleState() {
        // Save current subtitle state
        this.store.set('globalSubtitleEnabled', !!this.activeTrack);
        this.store.set('lastSuccessfulSubtitle', this.lastSuccessfulSubtitle);
        this.store.set('lastSuccessfulLanguage', this.lastSuccessfulLanguage);
        this.store.set('subtitleHistory', this.subtitleHistory);
        this.store.set('lastUsedLanguage', this.lastUsedLanguage);
    }

    initializeSubtitleMenu() {
        // First remove any existing menu to prevent duplicates
        const existingMenu = document.querySelector('.subtitle-menu');
        if (existingMenu) {
            existingMenu.remove();
        }

        // Create and append the subtitle menu to the controls overlay
        const controlsOverlay = document.getElementById('controls-overlay');
        if (!controlsOverlay) {
            console.error('Controls overlay not found');
            return;
        }

        const advancedOptions = controlsOverlay.querySelector('.advanced-options');
        if (!advancedOptions) {
            console.error('Advanced options container not found');
            return;
        }

        // Create subtitle button
        const subtitleButton = document.createElement('button');
        subtitleButton.className = 'control-button';
        subtitleButton.id = 'subtitles-button';
        subtitleButton.title = 'Subtitles';
        subtitleButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M2 12h20"/>
                <path d="M2 18h20"/>
                <path d="M2 6h20"/>
                <circle cx="12" cy="12" r="1"/>
            </svg>
        `;

        // Create subtitle menu
        const subtitleMenu = document.createElement('div');
        subtitleMenu.className = 'subtitle-menu';
        subtitleMenu.style.position = 'absolute';
        subtitleMenu.style.display = 'none';
        subtitleMenu.innerHTML = `
            <div class="subtitle-options">
                <div class="subtitle-track-list"></div>
                <div class="subtitle-controls">
                    <button id="load-subtitle">Load Subtitle File</button>
                    <label>
                        <input type="checkbox" id="auto-load-subtitles" ${this.autoLoadEnabled ? 'checked' : ''}>
                        Auto-load subtitles
                    </label>
                </div>
            </div>
        `;

        // Insert elements
        advancedOptions.insertBefore(subtitleButton, advancedOptions.lastChild);
        controlsOverlay.appendChild(subtitleMenu);

        // Event listeners
        subtitleButton.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = subtitleMenu.style.display === 'block';
            subtitleMenu.style.display = isVisible ? 'none' : 'block';
            subtitleButton.classList.toggle('active', !isVisible);
        });

        document.getElementById('auto-load-subtitles')?.addEventListener('change', (e) => {
            this.autoLoadEnabled = e.target.checked;
            store.set('autoLoadSubtitles', this.autoLoadEnabled);
        });

        document.getElementById('load-subtitle')?.addEventListener('click', () => {
            this.loadSubtitleFile();
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!subtitleMenu.contains(e.target) && e.target !== subtitleButton) {
                subtitleMenu.style.display = 'none';
                subtitleButton.classList.remove('active');
            }
        });

        // Prevent menu close when clicking inside
        subtitleMenu.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        this.updateSubtitleMenu();
    }

    async loadSubtitleFile() {
        const result = await ipcRenderer.invoke('open-subtitle-file');
        if (result.filePaths.length > 0) {
            await this.addSubtitleTrack(result.filePaths[0]);
        }
    }

    disableAllTextTracks() {
        // Disable all text tracks
        Array.from(this.mediaPlayer.textTracks).forEach(track => {
            track.mode = 'disabled';
        });
    }

    clearSubtitles() {
        // First disable all text tracks
        this.disableAllTextTracks();

        // Clear cached subtitle URLs
        for (const [, url] of this.subtitleCache) {
            if (url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        }
        this.subtitleCache.clear();

        // Remove all track elements
        const tracks = Array.from(this.mediaPlayer.getElementsByTagName('track'));
        tracks.forEach(track => {
            track.remove();
        });

        // Reset state
        this.currentSubtitles = [];
        this.activeTrack = null;

        // Force refresh the text track list
        this.mediaPlayer.textTracks.onchange = null;
        this.mediaPlayer.textTracks.onaddtrack = null;
        this.mediaPlayer.textTracks.onremovetrack = null;

        // Update UI
        this.updateSubtitleMenu();
    }

    async detectSubtitles(videoPath) {
        if (!this.autoLoadEnabled && !this.globalSubtitleEnabled) return;

        // Store new video path
        this.currentVideoPath = videoPath;

        const videoDir = path.dirname(videoPath);
        const videoName = path.parse(videoPath).name;
        
        try {
            // Clear existing subtitles before detecting new ones
            this.clearSubtitles();
            
            const files = await fs.readdir(videoDir);
            const subtitleFiles = files.filter(file => {
                const ext = path.extname(file).toLowerCase();
                const name = path.parse(file).name;
                return this.supportedFormats.includes(ext) && 
                       (name.startsWith(videoName) || name.includes(videoName));
            });

            // Load all detected subtitles first
            for (const subFile of subtitleFiles) {
                await this.addSubtitleTrack(path.join(videoDir, subFile));
            }

            // Determine which subtitle to activate
            let subtitleToActivate = null;

            // Priority 1: Check if this video has a previously selected subtitle in history
            if (this.subtitleHistory[videoPath]) {
                const historicalSubtitle = this.subtitleHistory[videoPath];
                if (this.currentSubtitles.includes(historicalSubtitle)) {
                    subtitleToActivate = historicalSubtitle;
                }
            }

            // Priority 2: If no historical subtitle for this video, try to use the last used language
            if (!subtitleToActivate && this.lastUsedLanguage) {
                const matchingTrack = Array.from(this.mediaPlayer.textTracks).find(track => 
                    track.language === this.lastUsedLanguage
                );
                if (matchingTrack) {
                    subtitleToActivate = matchingTrack.dataset?.originalPath;
                }
            }

            // Priority 3: If still no match and no lastUsedLanguage is set, use default language
            if (!subtitleToActivate && !this.lastUsedLanguage && this.defaultLanguage) {
                const matchingTrack = Array.from(this.mediaPlayer.textTracks).find(track => 
                    track.language === this.defaultLanguage
                );
                if (matchingTrack) {
                    subtitleToActivate = matchingTrack.dataset?.originalPath;
                }
            }

            // Activate the chosen subtitle
            if (subtitleToActivate) {
                await this.setActiveSubtitle(subtitleToActivate);
                // Store successful subtitle activation
                this.lastSuccessfulSubtitle = subtitleToActivate;
                this.lastSuccessfulLanguage = Array.from(this.mediaPlayer.textTracks)
                    .find(track => track.dataset?.originalPath === subtitleToActivate)?.language;
                this.saveSubtitleState();
            }

        } catch (error) {
            console.error('Error detecting subtitles:', error);
        }
    }

    async addSubtitleTrack(filePath) {
        try {
            const ext = path.extname(filePath).toLowerCase();
            
            if (!this.supportedFormats.includes(ext)) {
                throw new Error('Unsupported subtitle format');
            }

            // First disable all existing tracks
            this.disableAllTextTracks();

            // Convert to VTT if needed
            let vttPath = filePath;
            if (ext !== '.vtt') {
                vttPath = await this.convertToVTT(filePath);
            }

            // Remove any existing track with the same source
            const existingTracks = Array.from(this.mediaPlayer.getElementsByTagName('track'));
            existingTracks.forEach(track => {
                if (track.dataset.originalPath === filePath) {
                    track.remove();
                }
            });

            // Create new track element
            const track = document.createElement('track');
            track.kind = 'subtitles';
            track.label = this.getSubtitleLabel(filePath);
            track.srclang = this.detectLanguage(filePath);
            track.src = vttPath.startsWith('blob:') ? vttPath : `file://${vttPath}`;
            track.dataset.originalPath = filePath;
            track.mode = 'disabled'; // Ensure it starts disabled

            // Add to player
            this.mediaPlayer.appendChild(track);
            if (!this.currentSubtitles.includes(filePath)) {
                this.currentSubtitles.push(filePath);
            }

            // Update UI
            this.updateSubtitleMenu();

            return track;
        } catch (error) {
            console.error('Error adding subtitle track:', error);
            throw error;
        }
    }

    async convertToVTT(filePath) {
        // Check cache first
        if (this.subtitleCache.has(filePath)) {
            return this.subtitleCache.get(filePath);
        }

        try {
            const ext = path.extname(filePath).toLowerCase();
            
            // Handle TTML/DFXP files
            if (ext === '.ttml' || ext === '.dfxp') {
                const content = await fs.readFile(filePath, 'utf8');
                const vttContent = await this.ttmlToVTT(content);
                const blob = new Blob([vttContent], { type: 'text/vtt' });
                const url = URL.createObjectURL(blob);
                this.subtitleCache.set(filePath, url);
                return url;
            }

            // Handle other formats using existing srt2vtt
            return new Promise((resolve, reject) => {
                const chunks = [];
                createReadStream(filePath)
                    .pipe(srt2vtt())
                    .on('data', chunk => chunks.push(chunk))
                    .on('end', () => {
                        const blob = new Blob(chunks, { type: 'text/vtt' });
                        const url = URL.createObjectURL(blob);
                        this.subtitleCache.set(filePath, url);
                        resolve(url);
                    })
                    .on('error', reject);
            });
        } catch (error) {
            console.error('Error converting subtitle:', error);
            throw error;
        }
    }

    async ttmlToVTT(ttmlContent) {
        // Basic TTML to VTT converter
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(ttmlContent, 'text/xml');
        const paragraphs = xmlDoc.getElementsByTagName('p');
        
        let vttContent = 'WEBVTT\n\n';
        
        for (let i = 0; i < paragraphs.length; i++) {
            const p = paragraphs[i];
            const begin = this.convertTTMLTime(p.getAttribute('begin'));
            const end = this.convertTTMLTime(p.getAttribute('end'));
            const text = p.textContent;
            
            if (begin && end && text) {
                vttContent += `${begin} --> ${end}\n${text}\n\n`;
            }
        }
        
        return vttContent;
    }

    convertTTMLTime(ttmlTime) {
        if (!ttmlTime) return null;
        
        // Handle different TTML time formats
        if (ttmlTime.includes('t')) {
            // Handle tick format
            const ticks = parseInt(ttmlTime.replace('t', ''));
            const seconds = ticks / 10000000;
            return this.formatVTTTime(seconds);
        }
        
        if (ttmlTime.includes('s')) {
            // Handle seconds format
            const seconds = parseFloat(ttmlTime.replace('s', ''));
            return this.formatVTTTime(seconds);
        }
        
        // Handle clock format (HH:MM:SS.mmm)
        const parts = ttmlTime.split(':');
        if (parts.length === 3) {
            const hours = parseInt(parts[0]);
            const minutes = parseInt(parts[1]);
            const seconds = parseFloat(parts[2]);
            const totalSeconds = hours * 3600 + minutes * 60 + seconds;
            return this.formatVTTTime(totalSeconds);
        }
        
        return null;
    }

    formatVTTTime(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);
        const milliseconds = Math.floor((totalSeconds % 1) * 1000);
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
    }

    async setActiveSubtitle(filePath) {
        // First disable all tracks
        this.disableAllTextTracks();

        if (filePath) {
            const trackElements = Array.from(this.mediaPlayer.getElementsByTagName('track'));
            for (const trackElement of trackElements) {
                if (trackElement.dataset.originalPath === filePath) {
                    setTimeout(() => {
                        this.disableAllTextTracks();
                        trackElement.track.mode = 'showing';
                        this.activeTrack = trackElement.track;
                        
                        // Update the last used language
                        this.lastUsedLanguage = trackElement.srclang;
                        this.globalSubtitleEnabled = true;
                        this.lastSuccessfulSubtitle = filePath;
                        this.lastSuccessfulLanguage = trackElement.srclang;
                        
                        // Save state
                        this.saveSubtitleState();
                    }, 100);

                    // Store in subtitle history for this specific video
                    this.subtitleHistory[this.currentVideoPath] = filePath;
                    this.store.set('subtitleHistory', this.subtitleHistory);
                    break;
                }
            }
        } else {
            // Subtitle turned off
            this.globalSubtitleEnabled = false;
            // Remove from subtitle history when explicitly turned off
            delete this.subtitleHistory[this.currentVideoPath];
            this.store.set('subtitleHistory', this.subtitleHistory);
            // Don't reset lastUsedLanguage when turning off subtitles
            this.saveSubtitleState();
        }

        this.updateSubtitleMenu();
    }

    removeAllTracks() {
        const tracks = Array.from(this.mediaPlayer.getElementsByTagName('track'));
        tracks.forEach(track => track.remove());
        this.activeTrack = null;
        this.updateSubtitleMenu();
    }

    updateSubtitleMenu() {
        const trackList = document.querySelector('.subtitle-track-list');
        if (!trackList) return;

        // Get currently active track's original path
        const activeTrackPath = Array.from(this.mediaPlayer.getElementsByTagName('track'))
            .find(track => track.track === this.activeTrack)?.dataset.originalPath;

        // Create menu items with proper event handling
        trackList.innerHTML = `
            <div class="subtitle-item ${!this.activeTrack ? 'active' : ''}" data-path="">
                Off
            </div>
            ${this.currentSubtitles.map(sub => `
                <div class="subtitle-item ${sub === activeTrackPath ? 'active' : ''}"
                     data-path="${sub.replace(/"/g, '&quot;')}">
                    ${this.getSubtitleLabel(sub)}
                </div>
            `).join('')}
        `;

        // Add click handlers using proper event delegation
        trackList.querySelectorAll('.subtitle-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const path = item.dataset.path;
                this.setActiveSubtitle(path || null);
            });
        });
    }

    getSubtitleLabel(filePath) {
        const fileName = path.basename(filePath, path.extname(filePath));
        const langCode = this.detectLanguage(filePath);
        const language = this.languageCodes[langCode] || 'English'; // Default to English instead of Unknown
        
        // Try to extract a clean name without language codes
        let cleanName = fileName
            .replace(/\.[a-z]{2,3}\./, '.') // Remove language codes
            .replace(/\([^)]*\)/g, '')      // Remove parentheses
            .replace(/\[[^\]]*\]/g, '')     // Remove square brackets
            .replace(/_+/g, ' ')            // Replace underscores with spaces
            .replace(/\.+/g, ' ')           // Replace dots with spaces
            .trim();
                                
        return `${cleanName} (${language})`;
    }

    detectLanguage(filePath) {
        const fileName = path.basename(filePath).toLowerCase();
        
        // Look for language patterns in filename
        const patterns = [
            /\.([a-z]{2,3})\./, // matches .en. .eng. etc
            /\[([a-z]{2,3})\]/, // matches [en] [eng] etc
            /\(([a-z]{2,3})\)/, // matches (en) (eng) etc
            /_([a-z]{2,3})_/,   // matches _en_ _eng_ etc
            /[-.]([a-z]{2,3})[-.]/ // matches -en- .en. etc
        ];

        for (const pattern of patterns) {
            const match = fileName.match(pattern);
            if (match && match[1]) {
                const code = match[1].toLowerCase();
                // Check both the code and the language name
                if (this.languageCodes[code]) {
                    return code;
                }
            }
        }
        
        // Default to English if no language is detected
        return 'eng';
    }

    // Style management
    updateSubtitleStyle(styles) {
        const styleSheet = document.styleSheets[0];
        const cueRule = Array.from(styleSheet.cssRules)
            .find(rule => rule.selectorText === '::cue');

        if (cueRule) {
            Object.entries(styles).forEach(([property, value]) => {
                cueRule.style[property] = value;
            });
        }
    }
}

// Export the class
module.exports = SubtitlesManager;