// copyFFmpeg.js
const fs = require('fs');
const path = require('path');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

const ffmpegBinaryDir = path.join(__dirname, 'ffmpeg-binaries');

// Create the directory if it doesn't exist
if (!fs.existsSync(ffmpegBinaryDir)) {
    fs.mkdirSync(ffmpegBinaryDir, { recursive: true });
}

const ffmpegExt = process.platform === 'win32' ? '.exe' : '';
const ffmpegDest = path.join(ffmpegBinaryDir, `ffmpeg${ffmpegExt}`);
if (!fs.existsSync(ffmpegDest)) {
    fs.copyFileSync(ffmpegPath, ffmpegDest);
}

const ffprobeExt = process.platform === 'win32' ? '.exe' : '';
const ffprobeDest = path.join(ffmpegBinaryDir, `ffprobe${ffprobeExt}`);
if (!fs.existsSync(ffprobeDest)) {
    fs.copyFileSync(ffprobePath, ffprobeDest);
}

console.log('FFmpeg binaries copied successfully to:', ffmpegBinaryDir);