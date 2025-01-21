const INACTIVITY_TIMEOUT = 3000; // 3 seconds
const MINIMUM_POSITION = 30; // Only store position if user watched more than 30 seconds
const SEEK_UPDATE_INTERVAL = 2.78; // ~360fps
const MIN_WINDOW_WIDTH = 780;
const MIN_WINDOW_HEIGHT = 580;
const DOUBLE_CLICK_DELAY = 300; // milliseconds

const supportedFormats = [
    // Video
    '.mp4', '.mkv', '.avi', '.webm', '.mov', '.flv', '.m4v', '.3gp', '.wmv', '.ts',
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
    '.raw': 'video/raw',
    '.ts': 'video/mp2t'
};

module.exports = {
    INACTIVITY_TIMEOUT,
    MINIMUM_POSITION,
    SEEK_UPDATE_INTERVAL,
    MIN_WINDOW_WIDTH,
    MIN_WINDOW_HEIGHT,
    DOUBLE_CLICK_DELAY,
    supportedFormats,
    mimeTypes
};