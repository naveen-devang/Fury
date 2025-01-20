const INACTIVITY_TIMEOUT = 3000; // 3 seconds
const LAST_POSITIONS_KEY = 'lastPositions';
const MAX_STORED_POSITIONS = 1000; // Limit number of stored positions to prevent excessive storage
const MINIMUM_DURATION = 60; // Only store position for media longer than 1 minute
const MINIMUM_POSITION = 30; // Only store position if user watched more than 30 seconds
const SEEK_UPDATE_INTERVAL = 2.78; // ~360fps
const MIN_WINDOW_WIDTH = 780;
const MIN_WINDOW_HEIGHT = 580;
const DOUBLE_CLICK_DELAY = 300; // milliseconds

const supportedFormats = [
    // Video
    '.mp4', '.mkv', '.avi', '.webm', '.mov', '.flv', '.m4v', '.3gp', '.wmv',
    // Audio
    '.mp3', '.wav', '.ogg', '.aac', '.m4a', '.flac', '.wma', '.opus'
];

const mimeTypes = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mkv': ['video/x-matroska', 'video/mkv', 'application/x-matroska'],
    '.mov': 'video/quicktime',
    '.H265': 'video/H265',
    '.mpeg': 'video/mpeg',
    '.raw': 'video/raw'
};

module.exports = {
    INACTIVITY_TIMEOUT,
    LAST_POSITIONS_KEY,
    MAX_STORED_POSITIONS,
    MINIMUM_DURATION,
    MINIMUM_POSITION,
    SEEK_UPDATE_INTERVAL,
    MIN_WINDOW_WIDTH,
    MIN_WINDOW_HEIGHT,
    DOUBLE_CLICK_DELAY,
    supportedFormats,
    mimeTypes
};