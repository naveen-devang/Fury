const fs = require('fs');
const path = require('path');
const os = require('os');

async function parseSubtitles(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const ext = path.extname(filePath).toLowerCase();
    
    if (ext === '.vtt') {
        return filePath; // Already in VTT format
    }
    
    let vttContent = 'WEBVTT\n\n';
    
    if (ext === '.srt') {
        // Split content into subtitle blocks
        const blocks = content.trim().split(/\r?\n\r?\n/);
        
        for (const block of blocks) {
            const lines = block.split(/\r?\n/);
            
            if (lines.length < 3) continue;
            
            // Skip the subtitle number
            const timeCode = lines[1];
            const text = lines.slice(2).join('\n');
            
            // Convert SRT timeformat (00:00:00,000) to WebVTT format (00:00:00.000)
            const vttTime = timeCode.replace(/,/g, '.');
            
            vttContent += `${vttTime}\n${text}\n\n`;
        }
    } else {
        throw new Error('Unsupported subtitle format');
    }
    
    // Create temporary file
    const tmpFile = path.join(os.tmpdir(), `subtitle-${Date.now()}.vtt`);
    fs.writeFileSync(tmpFile, vttContent, 'utf-8');
    
    return tmpFile;
}

module.exports = { parseSubtitles };