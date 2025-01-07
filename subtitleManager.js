// subtitleManager.js
const path = require('path');
const { ipcRenderer } = require('electron');
const Store = new require('electron-store');

class SubtitleManager {
    constructor(mediaPlayer) {
        if (!mediaPlayer) {
            throw new Error('MediaPlayer element is required for SubtitleManager');
        }

        this.mediaPlayer = mediaPlayer;
        this.subtitleTracks = new Map();
        this.activeSubtitleTrack = null;
        this.subtitlesEnabled = true;
        this.subtitleStore = new Store({ name: 'subtitles' });
        this.mediaSubtitleMap = new Map();
        
        this.subtitleMenu = this.createSubtitleMenu();
        document.getElementById('subtitles').parentElement.appendChild(this.subtitleMenu);
        
        // Load saved associations
        this.loadSavedSubtitleAssociations();

        // Add track change event listener
        this.mediaPlayer.textTracks.addEventListener('change', this.handleTrackChange.bind(this));

        // Important: Add listener for when tracks are added
        this.mediaPlayer.textTracks.onaddtrack = (event) => {
            if (event.track) {
                // Ensure new tracks start disabled
                event.track.mode = 'disabled';
            }
        };
    }

    handleTrackChange(event) {
        const tracks = Array.from(this.mediaPlayer.textTracks);
        const activeTrack = tracks.find(track => track.mode === 'showing');
        
        if (activeTrack) {
            document.getElementById('subtitles').classList.add('active');
            this.subtitlesEnabled = true;
        } else {
            document.getElementById('subtitles').classList.remove('active');
            this.subtitlesEnabled = false;
        }

        // Update menu items
        const menuItems = this.subtitleMenu.querySelectorAll('.subtitle-track');
        menuItems.forEach(item => {
            item.classList.toggle('active', activeTrack && item.textContent === activeTrack.label);
        });
    }

    createSubtitleMenu() {
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

        const offTrack = document.createElement('div');
        offTrack.className = 'subtitle-track';
        offTrack.textContent = 'Off';
        offTrack.addEventListener('click', () => {
            this.disableAllSubtitles();
            menu.style.display = 'none';
        });
        menu.appendChild(offTrack);

        return menu;
    }

    loadSavedSubtitleAssociations() {
        const savedAssociations = this.subtitleStore.get('associations') || {};
        this.mediaSubtitleMap = new Map(Object.entries(savedAssociations));
    }

    saveSubtitleAssociations() {
        const associations = Object.fromEntries(this.mediaSubtitleMap);
        this.subtitleStore.set('associations', associations);
    }

    async loadSubtitleContent(content, subtitlePath, language = 'en', label = null) {
        try {
            let subtitleContent = content;
            if (subtitlePath.toLowerCase().endsWith('.srt')) {
                subtitleContent = await this.convertSrtToVtt(content);
            }
    
            const blob = new Blob([subtitleContent], { type: 'text/vtt' });
            const blobUrl = URL.createObjectURL(blob);
    
            const fileName = path.basename(subtitlePath);
            const trackLabel = label || fileName;
    
            // Correct way to remove an existing text track
            const existingTrackIndex = Array.from(this.mediaPlayer.textTracks).findIndex(t => t.label === trackLabel);
            if (existingTrackIndex !== -1) {
                this.mediaPlayer.textTracks.removeTrack(this.mediaPlayer.textTracks[existingTrackIndex]);
            }
    
            // Explicitly disable all existing tracks first (Good practice)
            Array.from(this.mediaPlayer.textTracks).forEach(track => {
                track.mode = 'disabled';
            });
    
            const track = document.createElement('track');
            track.kind = 'subtitles';
            track.label = trackLabel;
            track.srclang = language;
            track.src = blobUrl;
            track.default = false;
            track.mode = 'hidden'; // Start hidden
    
            const trackInfo = {
                track: track,
                blobUrl: blobUrl,
                path: subtitlePath,
                language: language,
                label: trackLabel
            };
    
            this.subtitleTracks.set(subtitlePath, trackInfo);
            this.mediaPlayer.appendChild(track);
    
            this.addSubtitleMenuItem(trackLabel, trackInfo);
    
            return track;
        } catch (error) {
            console.error('Error loading subtitle content:', error);
            throw error;
        }
    }

    addSubtitleMenuItem(label, trackInfo) {
        const menuItem = document.createElement('div');
        menuItem.className = 'subtitle-track';
        menuItem.textContent = label;
        menuItem.addEventListener('click', () => {
            this.enableSubtitleTrack(trackInfo);
            this.subtitleMenu.style.display = 'none';
        });
        this.subtitleMenu.appendChild(menuItem);
    }

    setActiveTrack(track) {
        if (!track) return;
        Array.from(this.mediaPlayer.textTracks).forEach(t => {
            t.mode = 'disabled';
        });
        track.mode = 'showing';
    }

    enableSubtitleTrack(trackInfo) {
        if (!trackInfo || !trackInfo.track) {
            console.log('Invalid track info:', trackInfo);
            return;
        }

        this.activeSubtitleTrack = trackInfo;
        this.subtitlesEnabled = true;

        const tracks = this.mediaPlayer.textTracks;
        Array.from(tracks).forEach(track => {
            track.mode = 'disabled';
        });

        const selectedTrack = Array.from(this.mediaPlayer.textTracks).find(
            track => track.label === trackInfo.label
        );

        if (selectedTrack) {
            selectedTrack.mode = 'showing';
            this.activeSubtitleTrack = trackInfo;
            document.getElementById('subtitles').classList.add('active');
            
            const menuItems = this.subtitleMenu.querySelectorAll('.subtitle-track');
            menuItems.forEach(item => {
                item.classList.toggle('active', item.textContent === trackInfo.label);
            });
        }
    }

    disableAllSubtitles() {
        Array.from(this.mediaPlayer.textTracks).forEach(track => {
            track.mode = 'disabled';
        });

        this.activeSubtitleTrack = null;
        this.subtitlesEnabled = false;
        document.getElementById('subtitles').classList.remove('active');

        const menuItems = this.subtitleMenu.querySelectorAll('.subtitle-track');
        menuItems.forEach(item => item.classList.remove('active'));
    }

    clearSubtitles() {
        // Disable all tracks before removing them
        Array.from(this.mediaPlayer.textTracks).forEach(track => {
            track.mode = 'disabled';
        });

        const tracks = Array.from(this.mediaPlayer.getElementsByTagName('track'));
        tracks.forEach(track => {
            this.mediaPlayer.removeChild(track);
        });

        this.subtitleTracks.forEach(trackInfo => {
            URL.revokeObjectURL(trackInfo.blobUrl);
        });
        
        while (this.subtitleMenu.children.length > 1) {
            this.subtitleMenu.removeChild(this.subtitleMenu.lastChild);
        }

        this.subtitleTracks.clear();
        this.activeSubtitleTrack = null;
        document.getElementById('subtitles').classList.remove('active');
    }

    toggleSubtitles() {
        this.subtitlesEnabled = !this.subtitlesEnabled;
        
        if (!this.subtitlesEnabled) {
            this.disableAllSubtitles();
        } else if (this.activeSubtitleTrack) {
            this.setActiveTrack(this.activeSubtitleTrack.track);
        } else if (this.mediaPlayer.textTracks.length > 0) {
            this.setActiveTrack(this.mediaPlayer.textTracks[0]);
        }

        const textTracks = Array.from(this.mediaPlayer.textTracks);
        if (textTracks.length > 0) {
            textTracks.forEach(track => {
                try {
                    track.mode = this.subtitlesEnabled ? 'showing' : 'hidden';
                } catch (error) {
                    console.error('Error toggling subtitle track:', error);
                }
            });
        }
        
        const subtitlesBtn = document.getElementById('subtitles');
        if (subtitlesBtn) {
            subtitlesBtn.classList.toggle('active', this.subtitlesEnabled);
        }
    }

    isMatchingSubtitle(videoPath, subtitlePath) {
        const videoBaseName = path.basename(videoPath, path.extname(videoPath));
        const subtitleBaseName = path.basename(subtitlePath, path.extname(subtitlePath));
        
        if (subtitleBaseName === videoBaseName) return true;
        
        const languageCodes = [
            'eng', 'en', 'english',
            'kor', 'ko', 'korean',
            'jpn', 'ja', 'japanese',
            'chi', 'zh', 'chinese',
            'spa', 'es', 'spanish',
            'fre', 'fr', 'french',
            'ger', 'de', 'german'
        ];
        
        const patterns = [videoBaseName];
        
        languageCodes.forEach(lang => {
            patterns.push(
                `${videoBaseName}.${lang}`,
                `${videoBaseName}_${lang}`,
                `${videoBaseName} ${lang}`,
                `${videoBaseName}-${lang}`
            );
        });
        
        patterns.push(
            `${videoBaseName}.forced`,
            `${videoBaseName}.default`,
            `${videoBaseName}.sub`
        );
        
        return patterns.some(pattern => {
            const normalizedPattern = pattern.toLowerCase().replace(/[.'"\s-_]+/g, '');
            const normalizedSubtitle = subtitleBaseName.toLowerCase().replace(/[.'"\s-_]+/g, '');
            return normalizedSubtitle.includes(normalizedPattern) || normalizedPattern.includes(normalizedSubtitle);
        });
    }

    async findMatchingSubtitles(videoPath) {
        try {
            // First, clear any existing tracks
            this.clearSubtitles();

            const files = await ipcRenderer.invoke('read-directory', path.dirname(videoPath));
            const subtitleExtensions = ['.srt', '.vtt', '.ass', '.ssa', '.sub', '.ttml', '.dfxp'];
            
            const matchingSubtitles = files.filter(file => {
                const ext = path.extname(file).toLowerCase();
                return subtitleExtensions.includes(ext) && 
                       this.isMatchingSubtitle(videoPath, file);
            });

            // Sort subtitles so English comes first (if present)
            const sortedSubtitles = matchingSubtitles.sort((a, b) => {
                const aIsEng = a.toLowerCase().includes('eng') || a.toLowerCase().includes('en');
                const bIsEng = b.toLowerCase().includes('eng') || b.toLowerCase().includes('en');
                return bIsEng - aIsEng;
            });
            
            const subtitlePaths = sortedSubtitles.map(file => path.join(path.dirname(videoPath), file));
            
            // Load all subtitles first
            for (const subtitlePath of subtitlePaths) {
                try {
                    const content = await ipcRenderer.invoke('read-subtitle-file', subtitlePath);
                    await this.loadSubtitleContent(content, subtitlePath);
                } catch (error) {
                    console.error(`Error loading subtitle ${subtitlePath}:`, error);
                }
            }

            // After loading all tracks, enable only the first one
            if (this.mediaPlayer.textTracks.length > 0) {
                // First, ensure all tracks are hidden
                Array.from(this.mediaPlayer.textTracks).forEach(track => {
                    track.mode = 'hidden';
                });
                
                // Get the first track (English should be first due to sorting)
                const firstTrack = this.mediaPlayer.textTracks[0];
                const trackPath = subtitlePaths[0];
                const trackInfo = this.subtitleTracks.get(trackPath);
                
                // Small delay to ensure track modes are set properly
                setTimeout(() => {
                    // Set all tracks to hidden again
                    Array.from(this.mediaPlayer.textTracks).forEach(track => {
                        track.mode = 'hidden';
                    });
                    
                    // Then set only the first track to showing
                    firstTrack.mode = 'showing';
                    this.activeSubtitleTrack = trackInfo;
                    document.getElementById('subtitles').classList.add('active');
                }, 100);
            }
            
            return subtitlePaths;
        } catch (error) {
            console.error('Error finding subtitles:', error);
            return [];
        }
    }

    async loadSubtitles(currentMediaPath) {
        try {
            if (!currentMediaPath) {
                alert('Please select a media file first before adding subtitles.');
                return;
            }

            const filePaths = await ipcRenderer.invoke('open-subtitle');
            if (!filePaths || filePaths.length === 0) return;

            for (const subtitlePath of filePaths) {
                const resolvedMediaPath = path.resolve(currentMediaPath);
                
                try {
                    const subtitleContent = await ipcRenderer.invoke('read-subtitle-file', subtitlePath);
                    const label = path.basename(subtitlePath, path.extname(subtitlePath));
                    
                    const langMatch = label.match(/\.(eng|en|spa|es|fra|fr|ger|de|ita|it|por|pt|rus|ru|jpn|ja|kor|ko|chi|zh)$/i);
                    const language = langMatch ? langMatch[1].substring(0, 2).toLowerCase() : 'en';
                    
                    await this.loadSubtitleContent(subtitleContent, subtitlePath, language, label);
                    
                    const currentAssociations = this.mediaSubtitleMap.get(resolvedMediaPath) || [];
                    if (!currentAssociations.includes(subtitlePath)) {
                        currentAssociations.push(subtitlePath);
                        this.mediaSubtitleMap.set(resolvedMediaPath, currentAssociations);
                        this.saveSubtitleAssociations();
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
}

module.exports = SubtitleManager;