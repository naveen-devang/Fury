const fs = require('fs');

let content = fs.readFileSync('renderer.js', 'utf8');

// 1. Inject the Object.defineProperty hooks for logicalDuration and logicalCurrentTime
const hookCode = `
Object.defineProperty(mediaPlayer, 'logicalDuration', {
  get() {
    if (this.dataset.isStreaming === "true") {
      return parseFloat(this.dataset.streamDuration) || 0;
    }
    return this.duration;
  }
});

Object.defineProperty(mediaPlayer, 'logicalCurrentTime', {
  get() {
    if (this.dataset.isStreaming === "true") {
      return (parseFloat(this.dataset.streamTimeOffset) || 0) + this.currentTime;
    }
    return this.currentTime;
  },
  set(value) {
    if (this.dataset.isStreaming === "true") {
      this.dataset.streamTimeOffset = value.toString();
      this.src = \`stream://media?path=\${encodeURIComponent(this.dataset.originalPath)}&time=\${value}\`;
      this.play();
    } else {
      this.currentTime = value;
    }
  }
});
`;

if (!content.includes('logicalCurrentTime')) {
    content = content.replace('const mediaPlayer = document.getElementById("media-player");', 'const mediaPlayer = document.getElementById("media-player");\n' + hookCode);
}

// 2. Global replace currentTime -> logicalCurrentTime, duration -> logicalDuration
content = content.replace(/mediaPlayer\.currentTime/g, 'mediaPlayer.logicalCurrentTime');
content = content.replace(/mediaPlayer\.duration/g, 'mediaPlayer.logicalDuration');

// 3. Update playFile function
const playFileRegex = /async function playFile\(filePath\) \{[\s\S]*?const extension = path\.extname\(filePath\)\.toLowerCase\(\);/m;

const playFileNew = `async function playFile(filePath) {
  if (!filePath) {
    console.warn("No file path provided to playFile");
    return;
  }

  const existingDialogs = document.querySelectorAll(".resume-dialog");
  existingDialogs.forEach((dialog) => dialog.remove());

  mediaPlayer.removeAttribute("src");
  mediaPlayer.load();

  if (hardwareAcceleration.isEnabled()) {
    hardwareAcceleration.addCodecSupport(filePath);
  }

  updatePlaylistUI();
  updateWindowTitle();

  const probeData = await ipcRenderer.invoke("probe-file", filePath);
  let isEac3 = false;
  let duration = 0;
  if (probeData) {
    if (probeData.format && probeData.format.duration) {
      duration = probeData.format.duration;
    }
    if (probeData.streams) {
      isEac3 = probeData.streams.some(s => s.codec_name === 'eac3' || s.codec_name === 'ac3');
    }
  }

  mediaPlayer.dataset.isStreaming = isEac3 ? "true" : "false";
  mediaPlayer.dataset.streamDuration = duration.toString();
  mediaPlayer.dataset.originalPath = filePath;
  mediaPlayer.dataset.streamTimeOffset = "0";

  const extension = path.extname(filePath).toLowerCase();`;

content = content.replace(playFileRegex, playFileNew);

// 4. Update the source logic
const srcLogicRegex = /if \(mimeTypes\[extension\]\) \{[\s\S]*?mediaPlayer\.src = filePath;\n  \}/m;

const srcLogicNew = `if (isEac3) {
    mediaPlayer.src = \`stream://media?path=\${encodeURIComponent(filePath)}&time=0\`;
  } else {
    if (mimeTypes[extension]) {
      const source = document.createElement("source");
      source.src = filePath;
      source.type = mimeTypes[extension];
      mediaPlayer.appendChild(source);
    }
    mediaPlayer.src = filePath;
  }`;

content = content.replace(srcLogicRegex, srcLogicNew);

// Write back
fs.writeFileSync('renderer.js', content);

// Also fix subtitles.js
let subContent = fs.readFileSync('subtitles.js', 'utf8');
const subRegex = /if \(this\.mediaPlayer && !this\.mediaPlayer\.paused\) \{/g;
subContent = subContent.replace(subRegex, 'if (this.mediaPlayer && !this.mediaPlayer.paused && this.mediaPlayer.dataset.isStreaming !== "true") {');
fs.writeFileSync('subtitles.js', subContent);

console.log('done');
