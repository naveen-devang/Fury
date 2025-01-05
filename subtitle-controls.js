class SubtitleControls {
    constructor(trackManager, container) {
        this.trackManager = trackManager;
        this.container = container;
        this.setupUI();
        
        // Listen for track changes
        this.trackManager.on('trackAdded', () => this.updateTrackList());
        this.trackManager.on('trackRemoved', () => this.updateTrackList());
        this.trackManager.on('trackChanged', () => this.updateTrackList());
    }

    setupUI() {
        const controls = document.createElement('div');
        controls.className = 'subtitle-controls';
        
        // Create subtitle track selector
        this.trackSelect = document.createElement('select');
        this.trackSelect.className = 'subtitle-track-select';
        this.trackSelect.addEventListener('change', (e) => {
            if (e.target.value === 'off') {
                this.trackManager.removeAllTracks();
            } else {
                this.trackManager.setCurrentTrack(e.target.value);
            }
        });

        // Style for subtitle controls
        const style = document.createElement('style');
        style.textContent = `
            .subtitle-controls {
                display: flex;
                align-items: center;
                gap: 10px;
                margin-top: 10px;
            }
            .subtitle-track-select {
                padding: 5px;
                border-radius: 4px;
                background: #2a2a2a;
                color: white;
                border: 1px solid #444;
            }
        `;
        
        document.head.appendChild(style);
        controls.appendChild(this.trackSelect);
        this.container.appendChild(controls);
        
        this.updateTrackList();
    }

    updateTrackList() {
        const tracks = this.trackManager.getTracksList();
        this.trackSelect.innerHTML = `
            <option value="off">Subtitles Off</option>
            ${tracks.map(track => `
                <option value="${track.path}" ${track.isActive ? 'selected' : ''}>
                    ${track.label} (${track.language})
                </option>
            `).join('')}
        `;
    }
}

module.exports = SubtitleControls;