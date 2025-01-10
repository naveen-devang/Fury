const { app } = require('electron');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const isDev = require('electron-is-dev');

function getFFmpegPaths() {
    let ffmpegPath;
    let ffprobePath;

    if (isDev) {
        // Development environment - use node_modules directly
        ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
        ffprobePath = require('@ffprobe-installer/ffprobe').path;
    } else {
        // Production environment - resolve from unpacked directory
        const basePath = process.platform === 'win32' ? 
            path.join(process.resourcesPath, '..') : 
            path.join(process.resourcesPath);

        const ffmpegBinary = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
        const ffprobeBinary = process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe';

        ffmpegPath = path.join(
            basePath,
            'node_modules',
            '@ffmpeg-installer',
            'ffmpeg',
            'binaries',
            process.platform,
            process.arch,
            ffmpegBinary
        );

        ffprobePath = path.join(
            basePath,
            'node_modules',
            '@ffprobe-installer',
            'ffprobe',
            'binaries',
            process.platform,
            process.arch,
            ffprobeBinary
        );
    }

    return { ffmpegPath, ffprobePath };
}

module.exports = { getFFmpegPaths };