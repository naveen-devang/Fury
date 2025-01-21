const Store = new require('electron-store');
const store = new Store();

const LAST_POSITIONS_KEY = 'lastPositions';
const MAX_STORED_POSITIONS = 1000; // Limit number of stored positions to prevent excessive storage
const MINIMUM_DURATION = 60; // Only store position for media longer than 1 minute

let activeResumeTimer = null;
let activeDialog = null;

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

// Function to get stored positions
function getStoredPositions() {
    return store.get(LAST_POSITIONS_KEY, {});
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

module.exports = { showResumeDialog, removeLastPosition, getLastPosition, saveLastPosition }