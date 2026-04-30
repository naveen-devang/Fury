const fs = require('fs');

let content = fs.readFileSync('subtitles.js', 'utf8');

if (!content.includes("const fsSync = require('fs');")) {
  content = content.replace('const { createReadStream } = require("fs");', 'const { createReadStream } = require("fs");\nconst fsSync = require("fs");');
}

// 1. Replace matchingTrack.track.mode = "showing"; with "hidden"; and add parser
const setActiveSubRegex = /matchingTrack\.track\.mode = "showing";[\s\S]*?this\.activeTrack = matchingTrack\.track;/m;
const setActiveSubNew = `matchingTrack.track.mode = "hidden";
          this.activeTrack = matchingTrack.track;
          
          // --- JS Overlay Logic ---
          this.activeSubtitlePath = filePath;
          try {
            const fileContent = fsSync.readFileSync(filePath, 'utf8');
            const { parseSync } = require('subtitle');
            this.parsedCues = parseSync(fileContent).filter(n => n.type === 'cue').map(c => c.data);
            
            if (!this.renderLoopActive) {
              this.renderLoopActive = true;
              this.renderSubtitles();
            }
          } catch (e) {
            console.error("Failed to parse subtitle", e);
          }`;

content = content.replace(setActiveSubRegex, setActiveSubNew);

// 2. Add renderSubtitles function to the class
if (!content.includes('renderSubtitles() {')) {
  const classRegex = /class SubtitlesManager \{[\s\S]*?constructor\(mediaPlayer\) \{/m;
  const classNew = `class SubtitlesManager {
  renderSubtitles() {
    if (!this.renderLoopActive) {
      const overlay = document.getElementById("subtitle-overlay");
      if (overlay) overlay.innerHTML = "";
      return;
    }

    const overlay = document.getElementById("subtitle-overlay");
    if (overlay && this.parsedCues && this.parsedCues.length > 0) {
      const currentTimeMs = this.mediaPlayer.logicalCurrentTime * 1000;
      // Subtitle delay is typically stored in seconds or milliseconds. 
      // Based on typical Fury app code, let's assume subtitleDelay is in seconds.
      const adjustedTimeMs = currentTimeMs - (this.subtitleDelay * 1000);

      const activeCue = this.parsedCues.find(cue => adjustedTimeMs >= cue.start && adjustedTimeMs <= cue.end);

      if (activeCue) {
        overlay.innerHTML = activeCue.text.replace(/\\n/g, '<br>');
      } else {
        overlay.innerHTML = "";
      }
    }

    requestAnimationFrame(() => this.renderSubtitles());
  }

  constructor(mediaPlayer) {`;
  content = content.replace(classRegex, classNew);
}

// 3. Update subtitle turn off logic
const turnOffRegex = /\/\/ Subtitle turned off[\s\S]*?this\.globalSubtitleEnabled = false;/m;
const turnOffNew = `// Subtitle turned off
      this.globalSubtitleEnabled = false;
      this.renderLoopActive = false;
      this.activeSubtitlePath = null;
      this.parsedCues = [];
      const overlay = document.getElementById("subtitle-overlay");
      if (overlay) overlay.innerHTML = "";`;

content = content.replace(turnOffRegex, turnOffNew);

// 4. Update the applySubtitleDelay function since it used to rewrite the VTTCues directly
// We no longer need it to modify VTTCues because our renderSubtitles dynamically applies it!
const delayRegex = /applySubtitleDelay\(\) \{[\s\S]*?\}\n\n  async detectSubtitles/m;
const delayNew = `applySubtitleDelay() {
    // Our JS overlay natively reads this.subtitleDelay on every frame, so we don't need to rewrite VTTCues!
  }

  async detectSubtitles`;
content = content.replace(delayRegex, delayNew);


// 5. Also hide native tracks in updateSubtitleStyle since we don't need them
const styleRegex = /updateSubtitleStyle\(\) \{[\s\S]*?cueRule\.style\.backgroundColor = /m;
// We can just skip modifying the native styles or override video::cue to display: none
const hideNativeCSS = `
  const sheet = document.styleSheets[0];
  try { sheet.insertRule('video::cue { display: none !important; opacity: 0 !important; }', sheet.cssRules.length); } catch(e) {}
`;
if (!content.includes('video::cue { display: none')) {
   content = content.replace('updateSubtitleStyle() {', 'updateSubtitleStyle() {' + hideNativeCSS);
}


fs.writeFileSync('subtitles.js', content);
console.log('done');
