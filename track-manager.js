const EventEmitter = require('events');

class SubtitleTrackManager extends EventEmitter {
    constructor(mediaPlayer) {
        super();
        this.mediaPlayer = mediaPlayer;
        this.tracks = new Map();
        this.currentTrack = null;
    }

    addTrack(trackPath, language = 'en', label = 'Subtitle') {
        const track = document.createElement('track');
        track.kind = 'subtitles';
        track.label = label;
        track.srclang = language;
        track.src = trackPath;
        
        // Store track info
        this.tracks.set(trackPath, {
            element: track,
            language,
            label
        });

        this.mediaPlayer.appendChild(track);
        
        // Set as current if it's the first track
        if (!this.currentTrack) {
            this.setCurrentTrack(trackPath);
        }

        this.emit('trackAdded', trackPath);
        return track;
    }

    setCurrentTrack(trackPath) {
        // Hide all tracks first
        this.tracks.forEach(trackInfo => {
            trackInfo.element.track.mode = 'hidden';
        });

        if (trackPath === null) {
            this.currentTrack = null;
            this.emit('trackChanged', null);
            return;
        }

        // Show selected track
        const trackInfo = this.tracks.get(trackPath);
        if (trackInfo) {
            trackInfo.element.track.mode = 'showing';
            this.currentTrack = trackPath;
            this.emit('trackChanged', trackPath);
        }
    }

    removeTrack(trackPath) {
        const trackInfo = this.tracks.get(trackPath);
        if (trackInfo) {
            trackInfo.element.remove();
            this.tracks.delete(trackPath);
            
            // If we removed the current track, select another if available
            if (this.currentTrack === trackPath) {
                const nextTrack = this.tracks.keys().next().value;
                if (nextTrack) {
                    this.setCurrentTrack(nextTrack);
                } else {
                    this.currentTrack = null;
                }
            }
            
            this.emit('trackRemoved', trackPath);
        }
    }

    removeAllTracks() {
        this.tracks.forEach((_, trackPath) => {
            this.removeTrack(trackPath);
        });
    }

    getTracksList() {
        return Array.from(this.tracks.entries()).map(([path, info]) => ({
            path,
            language: info.language,
            label: info.label,
            isActive: path === this.currentTrack
        }));
    }
}

module.exports = SubtitleTrackManager;