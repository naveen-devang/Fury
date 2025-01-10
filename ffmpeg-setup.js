// ffmpeg-setup.js
const path = require('path');
const isPackaged = require('electron-is-packaged');
const ffmpeg = require('fluent-ffmpeg');

let ffmpegPath;
let ffprobePath;

if (isPackaged) {
    ffmpeg.setFfmpegPath(path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe'));
    ffmpeg.setFfprobePath(path.join(process.resourcesPath, 'ffmpeg', 'ffprobe.exe'));
} else {
    ffmpeg.setFfmpegPath(require('ffmpeg-static').path);
    ffmpeg.setFfprobePath(require('ffprobe-static').path);
}


module.exports = ffmpeg; // Export the configured ffmpeg instance