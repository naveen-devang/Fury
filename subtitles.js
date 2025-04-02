const { ipcRenderer } = require("electron");
const fs = require("fs").promises;
const srt2vtt = require("srt-to-vtt");
const { createReadStream } = require("fs");
const Store = new require("electron-store");
const os = require("os");
const { promisify } = require("util");
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);

const { app } = require("@electron/remote");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");

function initializeFfmpeg() {
  try {
    let ffmpegBinary;
    let ffprobeBinary;

    if (!app.isPackaged) {
      // Development mode
      ffmpegBinary = require("ffmpeg-static");
      ffprobeBinary = require("ffprobe-static").path;
    } else {
      // Production mode
      if (process.platform === "darwin") {
        // For macOS, determine architecture (arm64 vs x64)
        const arch = process.arch; // 'arm64' or 'x64'

        ffmpegBinary = path.join(
          process.resourcesPath,
          "app.asar.unpacked",
          "node_modules",
          "ffmpeg-static",
          "ffmpeg",
        );

        ffprobeBinary = path.join(
          process.resourcesPath,
          "app.asar.unpacked",
          "node_modules",
          "ffprobe-static",
          "bin",
          "darwin",
          arch, // This will be either 'arm64' or 'x64'
          "ffprobe",
        );

        console.log(`Using macOS ${arch} architecture for ffprobe`);
      } else {
        // For Windows and Linux, use the existing approach
        const ffmpegBinaryDir = path.join(
          process.resourcesPath,
          "ffmpeg-binaries",
        );
        const isWin = process.platform === "win32";
        const ffmpegExt = isWin ? ".exe" : "";
        const ffprobeExt = isWin ? ".exe" : "";

        ffmpegBinary = path.join(ffmpegBinaryDir, `ffmpeg${ffmpegExt}`);
        ffprobeBinary = path.join(ffmpegBinaryDir, `ffprobe${ffprobeExt}`);
      }
    }

    // Set FFmpeg paths
    ffmpeg.setFfmpegPath(ffmpegBinary);
    ffmpeg.setFfprobePath(ffprobeBinary);

    // Verify the paths exist
    const fs = require("fs");
    if (!fs.existsSync(ffmpegBinary)) {
      console.error(`FFmpeg binary not found at: ${ffmpegBinary}`);
      throw new Error(`FFmpeg binary not found at: ${ffmpegBinary}`);
    }
    if (!fs.existsSync(ffprobeBinary)) {
      console.error(`FFprobe binary not found at: ${ffprobeBinary}`);
      throw new Error(`FFprobe binary not found at: ${ffprobeBinary}`);
    }

    console.log("FFmpeg initialized successfully");
    console.log("FFmpeg path:", ffmpegBinary);
    console.log("FFprobe path:", ffprobeBinary);

    return true;
  } catch (error) {
    console.error("FFmpeg initialization error:", error);
    return false;
  }
}

class SubtitlesManager {
  constructor(mediaPlayer) {
    this.debug = true; // Set to true to enable detailed logging

    this.store = new Store();

    // Initialize subtitle delay with stored value
    this.subtitleDelay = this.store.get("subtitleDelay", 0);
    this.lastSubtitleDelay = this.store.get("lastSubtitleDelay", 0);

    // Rest of the constructor remains the same as in previous implementation
    this.mediaPlayer = mediaPlayer;
    this.currentSubtitles = [];
    this.embeddedSubtitles = [];
    this.activeTrack = null;
    this.subtitleCache = new Map();
    this.tempDir = path.join(os.tmpdir(), "video-player-subtitles");

    this.ffmpegAvailable = initializeFfmpeg();

    if (!this.ffmpegAvailable) {
      console.error(
        "FFmpeg initialization failed. Embedded subtitles will not be available.",
      );
    }

    this.store = new Store();
    this.autoLoadEnabled = store.get("autoLoadSubtitles", true);
    this.defaultLanguage = store.get("defaultSubtitleLanguage", "eng");
    this.subtitleHistory = store.get("subtitleHistory", {});
    this.lastSelectedLanguage = store.get("lastSelectedLanguage", null);
    this.globalSubtitleEnabled = this.store.get("globalSubtitleEnabled", false);

    this.extractedEmbeddedSubtitles = new Map(); // Store extracted subtitle paths
    this.embeddedSubtitleHistory = this.store.get(
      "embeddedSubtitleHistory",
      {},
    );
    this.extractedSubtitlesCache = store.get("extractedSubtitlesCache", {});

    this.initializeEmbeddedSubtitles();
    this.initializeTempDirectory();

    // Add these properties to track the last successful subtitle settings
    this.lastSuccessfulSubtitle = this.store.get(
      "lastSuccessfulSubtitle",
      null,
    );
    this.lastSuccessfulLanguage = this.store.get(
      "lastSuccessfulLanguage",
      null,
    );

    // Bind the new save state method
    this.saveSubtitleState = this.saveSubtitleState.bind(this);

    // Add event listener for when the window closes
    window.addEventListener("beforeunload", () => {
      this.saveSubtitleState();
      store.set(
        "extractedSubtitlesCache",
        Object.fromEntries(this.extractedEmbeddedSubtitles),
      );
      this.cleanupTempFiles();
      this.store.set("embeddedSubtitleHistory", this.embeddedSubtitleHistory);
    });

    this.supportedFormats = [
      ".srt",
      ".vtt",
      ".ass",
      ".ssa",
      ".sub",
      ".ttml",
      ".dfxp",
    ];

    // Expanded language codes
    this.languageCodes = {
      eng: "English",
      en: "English",
      spa: "Spanish",
      es: "Spanish",
      fre: "French",
      fr: "French",
      ger: "German",
      de: "German",
      ita: "Italian",
      it: "Italian",
      jpn: "Japanese",
      ja: "Japanese",
      kor: "Korean",
      ko: "Korean",
      chi: "Chinese",
      zh: "Chinese",
      rus: "Russian",
      ru: "Russian",
      por: "Portuguese",
      pt: "Portuguese",
      ara: "Arabic",
      ar: "Arabic",
      hin: "Hindi",
      hi: "Hindi",
      ben: "Bengali",
      bn: "Bengali",
      vie: "Vietnamese",
      vi: "Vietnamese",
      tha: "Thai",
      th: "Thai",
      nld: "Dutch",
      nl: "Dutch",
      pol: "Polish",
      pl: "Polish",
      tur: "Turkish",
      tr: "Turkish",
      ukr: "Ukrainian",
      uk: "Ukrainian",
      swe: "Swedish",
      sv: "Swedish",
      dan: "Danish",
      da: "Danish",
      fin: "Finnish",
      fi: "Finnish",
      nor: "Norwegian",
      no: "Norwegian",
      heb: "Hebrew",
      he: "Hebrew",
      iw: "Hebrew",
      hun: "Hungarian",
      hu: "Hungarian",
      ces: "Czech",
      cs: "Czech",
      ell: "Greek",
      el: "Greek",
      ron: "Romanian",
      rum: "Romanian",
      ro: "Romanian",
      ind: "Indonesian",
      id: "Indonesian",
      may: "Malay",
      ms: "Malay",
      cat: "Catalan",
      ca: "Catalan",
      bul: "Bulgarian",
      bg: "Bulgarian",
      hrv: "Croatian",
      hr: "Croatian",
      srp: "Serbian",
      sr: "Serbian",
      slk: "Slovak",
      sk: "Slovak",
      slv: "Slovenian",
      sl: "Slovenian",
    };

    // Initialize subtitle menu after DOM is fully loaded
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () =>
        this.initializeSubtitleMenu(),
      );
    } else {
      this.initializeSubtitleMenu();
    }

    this.mediaPlayer.addEventListener("loadstart", () => {
      this.clearSubtitles();
    });

    // Add listener for when tracks are added
    this.mediaPlayer.textTracks.addEventListener("addtrack", () => {
      this.disableAllTextTracks();
    });

    // Force cleanup when video loads
    this.mediaPlayer.addEventListener("loadeddata", () => {
      this.disableAllTextTracks();
    });

    this.updateSubtitleStyle();
  }

  log(...args) {
    if (this.debug) {
      console.log("[SubtitlesManager]", ...args);
    }
  }

  setSubtitleDelay(delayInSeconds) {
    // Store the delay value
    this.subtitleDelay = delayInSeconds;
    this.store.set("subtitleDelay", delayInSeconds);
    this.store.set("lastSubtitleDelay", delayInSeconds);

    this.log(`Setting subtitle delay to ${delayInSeconds.toFixed(1)}s`);

    // Apply the delay to the current subtitle track if one is active
    if (this.activeTrack) {
      this.applySubtitleDelay();
    }

    // Update the UI to show the current delay
    this.updateDelayDisplay();
  }

  applySubtitleDelay() {
    if (!this.activeTrack) {
      this.log("No active subtitle track to apply delay to");
      return;
    }

    this.log(
      `Applying ${this.subtitleDelay.toFixed(1)}s delay to subtitle track`,
    );

    // Get all track elements
    const tracks = Array.from(this.mediaPlayer.getElementsByTagName("track"));

    // For each track, we need to create a modified version with the delay applied
    tracks.forEach((track) => {
      // Only process if it's the active track
      if (track.track === this.activeTrack) {
        const originalPath = track.dataset.originalPath;
        const isEmbedded = track.dataset.isEmbedded === "true";

        this.log(`Processing track: ${track.label}`);

        // Cache key for the delayed version
        const cacheKey = `${originalPath}_delay_${this.subtitleDelay}`;

        // If it's not in the cache or the delay has changed, process it
        if (!this.subtitleCache.has(cacheKey)) {
          this.log(`Generating delayed subtitle for ${cacheKey}`);

          // Get the original VTT content
          const originalVttSrc = track.src;

          // Fetch the content and apply the delay
          fetch(originalVttSrc)
            .then((response) => {
              if (!response.ok) {
                throw new Error(
                  `Failed to fetch subtitle content: ${response.status}`,
                );
              }
              return response.text();
            })
            .then((vttContent) => {
              // Apply the delay to the VTT content
              this.log("Applying delay to VTT content");
              const delayedVtt = this.applyDelayToVtt(
                vttContent,
                this.subtitleDelay,
              );

              // Create a new blob and URL
              const blob = new Blob([delayedVtt], { type: "text/vtt" });
              const url = URL.createObjectURL(blob);

              // Cache the delayed version
              this.subtitleCache.set(cacheKey, url);

              // Update the track source
              track.src = url;

              // Make sure it's showing if it was the active track
              this.log("Setting track mode to showing");
              track.track.mode = "showing";
              this.activeTrack = track.track;
            })
            .catch((err) => {
              console.error("Error applying subtitle delay:", err);
            });
        } else {
          this.log(`Using cached delayed subtitle for ${cacheKey}`);
          // Use cached delayed version
          track.src = this.subtitleCache.get(cacheKey);
          track.track.mode = "showing";
          this.activeTrack = track.track;
        }
      }
    });
  }

  applyDelayToVtt(vttContent, delayInSeconds) {
    // Parse the VTT content and apply the delay to each cue
    const lines = vttContent.split("\n");
    const output = [];

    // VTT file always starts with "WEBVTT"
    let inCue = false;
    let isHeader = true;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Always include the WEBVTT header unchanged
      if (isHeader) {
        output.push(line);
        if (line === "WEBVTT" || line.startsWith("WEBVTT ")) {
          isHeader = false;
        }
        continue;
      }

      // Look for timestamp lines
      if (line.includes("-->")) {
        inCue = true;
        const timestamps = line.split("-->");
        if (timestamps.length === 2) {
          const startTime = this.adjustTimestamp(
            timestamps[0].trim(),
            delayInSeconds,
          );
          const endTime = this.adjustTimestamp(
            timestamps[1].trim(),
            delayInSeconds,
          );
          output.push(`${startTime} --> ${endTime}`);
        } else {
          // If the line is malformed, just include it unchanged
          output.push(line);
        }
      } else {
        // Non-timestamp lines are included unchanged
        output.push(line);
      }

      // Empty line means end of a cue
      if (inCue && line === "") {
        inCue = false;
      }
    }

    return output.join("\n");
  }

  async initializeEmbeddedSubtitles() {
    // Create temp directory if it doesn't exist
    await this.initializeTempDirectory();

    // Clear any existing extracted subtitles
    await this.cleanupTempFiles();
  }

  adjustTimestamp(timestamp, delayInSeconds) {
    // Parse the timestamp (format: HH:MM:SS.mmm)
    const parts = timestamp.split(":");
    if (parts.length !== 3) return timestamp;

    const hours = parseInt(parts[0]);
    const minutes = parseInt(parts[1]);
    const secondsAndMs = parts[2].split(".");
    const seconds = parseInt(secondsAndMs[0]);
    const ms = parseInt(secondsAndMs[1] || "0");

    // Convert to total milliseconds
    let totalMs = (hours * 3600 + minutes * 60 + seconds) * 1000 + ms;

    // Apply delay (convert delay from seconds to milliseconds)
    totalMs += delayInSeconds * 1000;
    if (totalMs < 0) totalMs = 0; // Don't allow negative times

    // Convert back to timestamp format
    const newHours = Math.floor(totalMs / 3600000);
    totalMs %= 3600000;
    const newMinutes = Math.floor(totalMs / 60000);
    totalMs %= 60000;
    const newSeconds = Math.floor(totalMs / 1000);
    const newMs = totalMs % 1000;

    return `${newHours.toString().padStart(2, "0")}:${newMinutes.toString().padStart(2, "0")}:${newSeconds.toString().padStart(2, "0")}.${newMs.toString().padStart(3, "0")}`;
  }

  updateDelayDisplay() {
    const delayDisplay = document.getElementById("subtitle-delay-display");
    if (delayDisplay) {
      // Format the delay: for example "+1.5s" or "-0.5s"
      const formattedDelay =
        this.subtitleDelay > 0
          ? `+${this.subtitleDelay.toFixed(1)}s`
          : `${this.subtitleDelay.toFixed(1)}s`;

      this.log(`Updating delay display to: ${formattedDelay}`);
      delayDisplay.textContent = formattedDelay;

      // Highlight if there's a non-zero delay
      delayDisplay.classList.toggle("active", this.subtitleDelay !== 0);
    } else {
      this.log("Delay display element not found");
    }
  }

  adjustSubtitleDelay(amount) {
    // Adjust the delay by the given amount (positive or negative)
    const newDelay = parseFloat((this.subtitleDelay + amount).toFixed(1));
    this.log(`Adjusting subtitle delay by ${amount}s to ${newDelay}s`);
    this.setSubtitleDelay(newDelay);
  }

  toggleDebugOverlay() {
    let overlay = document.getElementById("subtitle-debug-overlay");

    if (overlay) {
      overlay.remove();
      return;
    }

    overlay = document.createElement("div");
    overlay.id = "subtitle-debug-overlay";
    overlay.style.position = "absolute";
    overlay.style.top = "10px";
    overlay.style.left = "10px";
    overlay.style.background = "rgba(0,0,0,0.7)";
    overlay.style.color = "white";
    overlay.style.padding = "10px";
    overlay.style.borderRadius = "5px";
    overlay.style.zIndex = "9999";
    overlay.style.fontSize = "12px";
    overlay.style.fontFamily = "monospace";

    const updateDebugInfo = () => {
      if (!document.getElementById("subtitle-debug-overlay")) return;

      const trackElements = Array.from(
        this.mediaPlayer.getElementsByTagName("track"),
      );
      const activeTrack = trackElements.find(
        (track) => track.track === this.activeTrack,
      );

      overlay.innerHTML = `
        <div>Subtitle Debug:</div>
        <div>Current Delay: ${this.subtitleDelay.toFixed(1)}s</div>
        <div>Tracks Count: ${trackElements.length}</div>
        <div>Active Track: ${activeTrack ? "Yes" : "No"}</div>
        ${activeTrack ? `<div>Track Path: ${activeTrack.dataset.originalPath.substring(0, 30)}...</div>` : ""}
        ${activeTrack ? `<div>Track Src: ${activeTrack.src.substring(0, 30)}...</div>` : ""}
        <div>Cache Entries: ${this.subtitleCache.size}</div>
      `;

      requestAnimationFrame(updateDebugInfo);
    };

    document.body.appendChild(overlay);
    updateDebugInfo();
  }

  resetSubtitleDelay() {
    this.log("Completely resetting subtitle delay system");

    // Clear the delay values
    this.subtitleDelay = 0;
    this.store.set("subtitleDelay", 0);
    this.store.set("lastSubtitleDelay", 0);

    // Update the display
    this.updateDelayDisplay();

    // This is key: We need to actually reset the subtitles by reloading the active track
    if (this.activeTrack) {
      const trackElements = Array.from(
        this.mediaPlayer.getElementsByTagName("track"),
      );
      const activeTrack = trackElements.find(
        (track) => track.track === this.activeTrack,
      );

      if (activeTrack) {
        const originalPath = activeTrack.dataset.originalPath;
        const isEmbedded = activeTrack.dataset.isEmbedded === "true";
        const streamIndex = activeTrack.dataset.streamIndex;

        // Temporarily store active track info
        const trackInfo = {
          path: originalPath,
          isEmbedded: isEmbedded,
          streamIndex: streamIndex ? parseInt(streamIndex) : undefined,
        };

        // Disable current track
        this.disableAllTextTracks();
        this.activeTrack = null;

        // Remove the track element
        activeTrack.remove();

        // Remove from cache
        if (this.subtitleCache.has(originalPath)) {
          const oldUrl = this.subtitleCache.get(originalPath);
          if (oldUrl.startsWith("blob:")) {
            URL.revokeObjectURL(oldUrl);
          }
          this.subtitleCache.delete(originalPath);
        }

        // Also clear any delayed versions
        for (const [key, url] of [...this.subtitleCache.entries()]) {
          if (key.startsWith(`${originalPath}_delay_`)) {
            if (url.startsWith("blob:")) {
              URL.revokeObjectURL(url);
            }
            this.subtitleCache.delete(key);
          }
        }

        // Re-add the track with no delay
        setTimeout(async () => {
          try {
            if (trackInfo.isEmbedded && trackInfo.streamIndex !== undefined) {
              // Handle embedded subtitle
              const embedInfo = this.embeddedSubtitles.find(
                (s) => s.index === trackInfo.streamIndex,
              );
              if (embedInfo) {
                await this.addSubtitleTrack(trackInfo.path, true, embedInfo);
              }
            } else {
              // Handle external subtitle
              await this.addSubtitleTrack(trackInfo.path, false);
            }

            // Re-activate the subtitle
            await this.setActiveSubtitle(trackInfo.path);

            this.log("Successfully reset and reloaded subtitle");
          } catch (err) {
            console.error("Error reloading subtitle after reset:", err);
          }
        }, 100);
      }
    }
  }

  async detectEmbeddedSubtitles(videoPath) {
    if (!this.ffmpegAvailable) {
      return [];
    }

    if (!videoPath) {
      return [];
    }

    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          resolve([]);
          return;
        }

        if (!metadata || !metadata.streams) {
          resolve([]);
          return;
        }

        const subtitleStreams = metadata.streams.filter(
          (stream) => stream.codec_type === "subtitle",
        );

        const subtitleInfo = subtitleStreams.map((stream) => ({
          index: stream.index,
          language: stream.tags?.language || "und",
          title: stream.tags?.title || `Stream ${stream.index}`,
          codec: stream.codec_name,
        }));

        resolve(subtitleInfo);
      });
    });
  }

  saveSubtitleState() {
    // Save current subtitle state
    this.store.set("globalSubtitleEnabled", !!this.activeTrack);
    this.store.set("subtitleDelay", this.subtitleDelay);

    if (this.lastSuccessfulSubtitle) {
      this.store.set("lastSuccessfulSubtitle", this.lastSuccessfulSubtitle);
    } else {
      this.store.delete("lastSuccessfulSubtitle");
    }
    if (this.lastSuccessfulLanguage) {
      this.store.set("lastSuccessfulLanguage", this.lastSuccessfulLanguage);
    } else {
      this.store.delete("lastSuccessfulLanguage");
    }

    this.store.set("subtitleHistory", this.subtitleHistory);
    if (this.lastUsedLanguage) {
      this.store.set("lastUsedLanguage", this.lastUsedLanguage);
    } else {
      this.store.delete("lastUsedLanguage");
    }
  }

  initializeSubtitleMenu() {
    // First remove any existing menu to prevent duplicates
    const existingMenu = document.querySelector(".subtitle-menu");
    if (existingMenu) {
      existingMenu.remove();
    }

    // Create and append the subtitle menu to the controls overlay
    const controlsOverlay = document.getElementById("controls-overlay");
    if (!controlsOverlay) {
      return;
    }

    const advancedOptions = controlsOverlay.querySelector(".advanced-options");
    if (!advancedOptions) {
      return;
    }

    // Create subtitle button
    const subtitleButton = document.createElement("button");
    subtitleButton.className = "control-button";
    subtitleButton.id = "subtitles-button";
    subtitleButton.title = "Subtitles";
    subtitleButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 7c0-1.1.9-2 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>
        <path d="M7 12h3"/>
        <path d="M14 12h3"/>
        <path d="M7 16h10"/>
      </svg>
    `;

    // Create subtitle menu
    const subtitleMenu = document.createElement("div");
    subtitleMenu.className = "subtitle-menu";
    subtitleMenu.style.position = "absolute";
    subtitleMenu.style.display = "none";
    subtitleMenu.innerHTML = `
      <div class="subtitle-options">
        <div class="subtitle-track-list"></div>

        <div class="subtitle-delay-controls">
          <div class="subtitle-delay-header">
            <span>Subtitle Delay: </span>
            <span id="subtitle-delay-display">${this.subtitleDelay.toFixed(1)}s</span>
          </div>
          <div class="subtitle-delay-buttons">
            <button id="subtitle-delay-decrease">-0.1s</button>
            <button id="subtitle-delay-reset">Reset</button>
            <button id="subtitle-delay-increase">+0.1s</button>
          </div>
          <div class="subtitle-delay-buttons secondary">
            <button id="subtitle-delay-decrease-large">-1.0s</button>
            <button id="subtitle-delay-increase-large">+1.0s</button>
          </div>

        <div class="subtitle-controls">
          <button id="load-subtitle">Load Subtitle File</button>
          <label>
            <input type="checkbox" id="auto-load-subtitles" ${this.autoLoadEnabled ? "checked" : ""}>
            Auto-load subtitles
          </label>
      </div>
    `;

    // Insert elements
    advancedOptions.insertBefore(subtitleButton, advancedOptions.firstChild);
    controlsOverlay.appendChild(subtitleMenu);

    // Event listeners
    subtitleButton.addEventListener("click", (e) => {
      e.stopPropagation();
      const isVisible = subtitleMenu.style.display === "block";
      subtitleMenu.style.display = isVisible ? "none" : "block";
      subtitleButton.classList.toggle("active", !isVisible);
    });

    document
      .getElementById("auto-load-subtitles")
      ?.addEventListener("change", (e) => {
        this.autoLoadEnabled = e.target.checked;
        store.set("autoLoadSubtitles", this.autoLoadEnabled);
      });

    document.getElementById("load-subtitle")?.addEventListener("click", () => {
      this.loadSubtitleFile();
    });

    // Add event listeners for delay controls
    document
      .getElementById("subtitle-delay-decrease")
      ?.addEventListener("click", () => {
        this.log("Decrease button clicked");
        this.adjustSubtitleDelay(-0.1);
      });

    document
      .getElementById("subtitle-delay-increase")
      ?.addEventListener("click", () => {
        this.log("Increase button clicked");
        this.adjustSubtitleDelay(0.1);
      });

    document
      .getElementById("subtitle-delay-decrease-large")
      ?.addEventListener("click", () => {
        this.log("Large decrease button clicked");
        this.adjustSubtitleDelay(-1.0);
      });

    document
      .getElementById("subtitle-delay-increase-large")
      ?.addEventListener("click", () => {
        this.log("Large increase button clicked");
        this.adjustSubtitleDelay(1.0);
      });

    document
      .getElementById("subtitle-delay-reset")
      ?.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent event bubbling
        this.log("Reset button clicked");
        this.resetSubtitleDelay();
      });

    // Update the delay display with current value
    this.updateDelayDisplay();

    // Close menu when clicking outside
    document.addEventListener("click", (e) => {
      if (!subtitleMenu.contains(e.target) && e.target !== subtitleButton) {
        subtitleMenu.style.display = "none";
        subtitleButton.classList.remove("active");
      }
    });

    // Prevent menu close when clicking inside
    subtitleMenu.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    this.updateSubtitleMenu();
  }

  async initializeTempDirectory() {
    try {
      await mkdir(this.tempDir, { recursive: true });
    } catch (error) {
      console.error("Error creating temp directory:", error);
    }
  }

  async cleanupTempFiles() {
    try {
      const files = await fs.readdir(this.tempDir);
      for (const file of files) {
        await fs.unlink(path.join(this.tempDir, file));
      }
    } catch (error) {
      console.error("Error cleaning up temp files:", error);
    }
  }

  async loadSubtitleFile() {
    const result = await ipcRenderer.invoke("open-subtitle-file");
    if (result.filePaths.length > 0) {
      await this.addSubtitleTrack(result.filePaths[0]);
    }
  }

  disableAllTextTracks() {
    Array.from(this.mediaPlayer.textTracks).forEach((track) => {
      track.mode = "disabled";
    });
  }

  clearSubtitles(cleanupFiles = false) {
    // Disable all text tracks
    this.disableAllTextTracks();

    // Clear cached subtitle URLs
    for (const [, url] of this.subtitleCache) {
      if (url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
      }
    }
    this.subtitleCache.clear();

    // Remove all track elements
    const tracks = Array.from(this.mediaPlayer.getElementsByTagName("track"));
    tracks.forEach((track) => {
      track.remove();
    });

    // Reset state
    this.currentSubtitles = [];
    this.activeTrack = null;

    // Only clear extracted subtitles if cleanupFiles is true
    if (cleanupFiles) {
      this.extractedEmbeddedSubtitles.clear();
      this.cleanupTempFiles();
    }

    // Update UI
    this.updateSubtitleMenu();
  }

  async detectSubtitles(videoPath) {
    if (!this.autoLoadEnabled && !this.globalSubtitleEnabled) {
      return;
    }

    if (!videoPath) {
      return;
    }

    // Reset subtitle delays when loading a new video
    this.subtitleDelay = 0;
    this.store.set("subtitleDelay", 0);
    this.updateDelayDisplay();

    this.currentVideoPath = videoPath;
    const videoDir = path.dirname(videoPath);
    const videoName = path.parse(videoPath).name;

    try {
      // Clear existing subtitles
      this.clearSubtitles();

      let hasProcessedPreferredSubtitle = false;

      // Get historical preferences
      const historicalSubtitle = this.subtitleHistory[videoPath];
      const historicalEmbeddedSubtitle =
        this.embeddedSubtitleHistory[videoPath];

      // First detect all available external subtitle files
      const files = await fs.readdir(videoDir);
      const subtitleFiles = files.filter((file) => {
        const ext = path.extname(file).toLowerCase();
        const name = path.parse(file).name;
        const isSupported = this.supportedFormats.includes(ext);
        const matchesVideo =
          name.startsWith(videoName) || name.includes(videoName);
        return isSupported && matchesVideo;
      });

      // Process embedded subtitles if available
      if (this.ffmpegAvailable) {
        const embeddedTracks = await this.detectEmbeddedSubtitles(videoPath);
        this.embeddedSubtitles = embeddedTracks;

        // Reorder tracks to prioritize the last used subtitle
        if (historicalEmbeddedSubtitle) {
          const prioritizedTracks = [
            ...embeddedTracks.filter(
              (track) => track.index === historicalEmbeddedSubtitle.streamIndex,
            ),
            ...embeddedTracks.filter(
              (track) => track.index !== historicalEmbeddedSubtitle.streamIndex,
            ),
          ];

          // Process tracks in the new order
          for (const track of prioritizedTracks) {
            try {
              let subtitlePath;
              const cacheKey = `${videoPath}_${track.index}`;
              const isPrioritizedTrack =
                track.index === historicalEmbeddedSubtitle.streamIndex;

              // Check caches for existing extraction
              if (this.extractedEmbeddedSubtitles.has(cacheKey)) {
                subtitlePath = this.extractedEmbeddedSubtitles.get(cacheKey);
                if (await this.fileExists(subtitlePath)) {
                  await this.addSubtitleTrack(subtitlePath, true, track);

                  if (isPrioritizedTrack && !hasProcessedPreferredSubtitle) {
                    await this.setActiveSubtitle(subtitlePath);
                    hasProcessedPreferredSubtitle = true;
                  }
                  continue;
                }
              }

              if (this.extractedSubtitlesCache[cacheKey]) {
                subtitlePath = this.extractedSubtitlesCache[cacheKey];
                if (await this.fileExists(subtitlePath)) {
                  this.extractedEmbeddedSubtitles.set(cacheKey, subtitlePath);
                  await this.addSubtitleTrack(subtitlePath, true, track);

                  if (isPrioritizedTrack && !hasProcessedPreferredSubtitle) {
                    await this.setActiveSubtitle(subtitlePath);
                    hasProcessedPreferredSubtitle = true;
                  }
                  continue;
                }
              }

              // Extract if not found in cache
              subtitlePath = await this.extractEmbeddedSubtitle(
                videoPath,
                track.index,
              );
              this.extractedEmbeddedSubtitles.set(cacheKey, subtitlePath);
              await this.addSubtitleTrack(subtitlePath, true, track);

              if (isPrioritizedTrack && !hasProcessedPreferredSubtitle) {
                await this.setActiveSubtitle(subtitlePath);
                hasProcessedPreferredSubtitle = true;
              }
            } catch (error) {
              console.error("Error adding embedded subtitle:", error);
            }
          }
        } else {
          // If no historical embedded subtitle, process normally
          for (const track of embeddedTracks) {
            try {
              let subtitlePath;
              const cacheKey = `${videoPath}_${track.index}`;

              if (this.extractedEmbeddedSubtitles.has(cacheKey)) {
                subtitlePath = this.extractedEmbeddedSubtitles.get(cacheKey);
                if (await this.fileExists(subtitlePath)) {
                  await this.addSubtitleTrack(subtitlePath, true, track);
                  continue;
                }
              }

              if (this.extractedSubtitlesCache[cacheKey]) {
                subtitlePath = this.extractedSubtitlesCache[cacheKey];
                if (await this.fileExists(subtitlePath)) {
                  this.extractedEmbeddedSubtitles.set(cacheKey, subtitlePath);
                  await this.addSubtitleTrack(subtitlePath, true, track);
                  continue;
                }
              }

              subtitlePath = await this.extractEmbeddedSubtitle(
                videoPath,
                track.index,
              );
              this.extractedEmbeddedSubtitles.set(cacheKey, subtitlePath);
              await this.addSubtitleTrack(subtitlePath, true, track);
            } catch (error) {
              console.error("Error adding embedded subtitle:", error);
            }
          }
        }
      }

      // Load external subtitles
      for (const subFile of subtitleFiles) {
        const fullPath = path.join(videoDir, subFile);
        await this.addSubtitleTrack(fullPath, false);

        // If this is the historically selected external subtitle and no embedded subtitle
        // was already activated, activate it
        if (!hasProcessedPreferredSubtitle && historicalSubtitle === fullPath) {
          await this.setActiveSubtitle(fullPath);
          hasProcessedPreferredSubtitle = true;
        }
      }

      this.updateSubtitleMenu();
    } catch (error) {
      console.error("Error detecting subtitles:", error);
    }
  }

  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async extractEmbeddedSubtitle(videoPath, streamIndex) {
    const outputPath = path.join(
      this.tempDir,
      `embedded_${streamIndex}_${Date.now()}.srt`,
    );

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .outputOptions([`-map 0:${streamIndex}`, "-c:s srt"])
        .output(outputPath)
        .on("end", () => resolve(outputPath))
        .on("error", (err) => reject(err))
        .run();
    });
  }

  async addSubtitleTrack(filePath, isEmbedded = false, embedInfo = null) {
    try {
      const ext = path.extname(filePath).toLowerCase();

      if (!this.supportedFormats.includes(ext)) {
        throw new Error("Unsupported subtitle format");
      }

      // Store the currently active track path before disabling tracks
      const activeTrackElement = Array.from(
        this.mediaPlayer.getElementsByTagName("track"),
      ).find((track) => track.track === this.activeTrack);
      const activeTrackPath = activeTrackElement?.dataset.originalPath;

      // Only disable the specific track being replaced, not all tracks
      const existingTracks = Array.from(
        this.mediaPlayer.getElementsByTagName("track"),
      );
      existingTracks.forEach((track) => {
        if (track.dataset.originalPath === filePath) {
          track.track.mode = "disabled";
          track.remove();
        }
      });

      let vttPath = filePath;
      if (ext !== ".vtt") {
        vttPath = await this.convertToVTT(filePath);
      }

      const track = document.createElement("track");
      track.kind = "subtitles";
      track.label = isEmbedded
        ? this.getEmbeddedSubtitleLabel(embedInfo)
        : this.getSubtitleLabel(filePath);
      track.srclang = isEmbedded
        ? embedInfo.language
        : this.detectLanguage(filePath);
      track.src = vttPath.startsWith("blob:") ? vttPath : `file://${vttPath}`;
      track.dataset.originalPath = filePath;
      track.dataset.isEmbedded = isEmbedded;
      if (isEmbedded) {
        track.dataset.streamIndex = embedInfo.index;
      }
      track.mode = "disabled"; // Start with disabled mode

      this.mediaPlayer.appendChild(track);
      if (!this.currentSubtitles.includes(filePath)) {
        this.currentSubtitles.push(filePath);
      }

      // If this is the active track path, re-enable it
      if (activeTrackPath === filePath) {
        setTimeout(() => {
          track.track.mode = "showing";
          this.activeTrack = track.track;
        }, 50);
      }
      // Otherwise restore the previously active track if there was one
      else if (activeTrackPath && this.activeTrack) {
        setTimeout(() => {
          const currentActiveTrack = Array.from(
            this.mediaPlayer.getElementsByTagName("track"),
          ).find((t) => t.dataset.originalPath === activeTrackPath);
          if (currentActiveTrack) {
            currentActiveTrack.track.mode = "showing";
            this.activeTrack = currentActiveTrack.track;
          }
        }, 50);
      }

      this.updateSubtitleMenu();
      return track;
    } catch (error) {
      console.error("Error adding subtitle track:", error);
      throw error;
    }
  }

  getEmbeddedSubtitleLabel(embedInfo) {
    const language =
      this.languageCodes[embedInfo.language] || embedInfo.language || "Unknown";
    // If there's a title, use it; otherwise create a more descriptive label
    if (embedInfo.title && !embedInfo.title.startsWith("Stream")) {
      return `${embedInfo.title} (${language}) [Embedded]`;
    }
    return `Subtitle Track ${embedInfo.index + 1} (${language}) [Embedded]`;
  }

  async convertToVTT(filePath) {
    // Check cache first
    if (this.subtitleCache.has(filePath)) {
      return this.subtitleCache.get(filePath);
    }

    try {
      const ext = path.extname(filePath).toLowerCase();

      // Handle TTML/DFXP files
      if (ext === ".ttml" || ext === ".dfxp") {
        const content = await fs.readFile(filePath, "utf8");
        const vttContent = await this.ttmlToVTT(content);
        const blob = new Blob([vttContent], { type: "text/vtt" });
        const url = URL.createObjectURL(blob);
        this.subtitleCache.set(filePath, url);
        return url;
      }

      // Handle SRT and other formats using existing srt2vtt
      return new Promise((resolve, reject) => {
        const chunks = [];
        createReadStream(filePath)
          .pipe(srt2vtt())
          .on("data", (chunk) => chunks.push(chunk))
          .on("end", () => {
            // Ensure subtitle content doesn't have timing issues
            const blob = new Blob(chunks, { type: "text/vtt" });
            const url = URL.createObjectURL(blob);
            this.subtitleCache.set(filePath, url);
            resolve(url);
          })
          .on("error", reject);
      });
    } catch (error) {
      console.error("Error converting subtitle:", error);
      throw error;
    }
  }

  resetSubtitleTimingSystem() {
    // Clear cached subtitle URLs
    for (const [, url] of this.subtitleCache) {
      if (url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
      }
    }

    this.subtitleCache.clear();
    this.subtitleDelay = 0;
    this.store.set("subtitleDelay", 0);
    this.store.set("lastSubtitleDelay", 0);

    // If there's an active subtitle, reload it
    if (this.activeTrack) {
      const trackElements = Array.from(
        this.mediaPlayer.getElementsByTagName("track"),
      );
      const activeTrack = trackElements.find(
        (track) => track.track === this.activeTrack,
      );
      if (activeTrack) {
        const filePath = activeTrack.dataset.originalPath;
        setTimeout(() => {
          this.setActiveSubtitle(filePath);
        }, 100);
      }
    }

    this.updateDelayDisplay();
  }

  async ttmlToVTT(ttmlContent) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(ttmlContent, "text/xml");
    const paragraphs = xmlDoc.getElementsByTagName("p");

    let vttContent = "WEBVTT\n\n";

    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      const begin = this.convertTTMLTime(p.getAttribute("begin"));
      const end = this.convertTTMLTime(p.getAttribute("end"));

      if (begin && end) {
        // Get the text content while preserving line breaks
        let text = this.extractTTMLText(p);
        text = this.addPunctuationBreaks(text);

        if (text) {
          vttContent += `${begin} --> ${end}\n${text}\n\n`;
        }
      }
    }

    return vttContent;
  }

  extractTTMLText(element) {
    let text = "";

    // Process all child nodes
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        // Text node - add its content
        text += node.textContent.trim();
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName.toLowerCase() === "br") {
          // <br> tag - add a line break
          text += "\n";
        } else if (node.tagName.toLowerCase() === "span") {
          // <span> tag - process its content
          text += this.extractTTMLText(node);
        }
      }
    }

    // Clean up multiple consecutive line breaks and spaces
    return text
      .replace(/\n\s+/g, "\n") // Remove spaces after line breaks
      .replace(/\s+\n/g, "\n") // Remove spaces before line breaks
      .replace(/\n+/g, "\n") // Collapse multiple line breaks
      .replace(/\s+/g, " ") // Collapse multiple spaces
      .trim();
  }

  addPunctuationBreaks(text) {
    // Split the text into existing lines
    const lines = text.split("\n");

    // Process each line
    return lines
      .map((line) => {
        return (
          line
            // Break at periods followed by a space and uppercase letter,
            // but not after common abbreviations or within numbers
            .replace(
              /(?<!Mr|Mrs|Dr|Ms|vs|etc|[A-Z]|[0-9])\.(?=\s+[A-Z])/g,
              ".\n",
            )

            // Break at question marks and exclamation marks followed by a space
            .replace(/([?!])(?=\s+)/g, "$1\n")

            // Break at dashes between words (but not hyphenated words)
            .replace(/\s-\s/g, "\n- ")

            // Break at semicolons between independent clauses
            .replace(/;(?=\s+)/g, ";\n")

            // Break at colons introducing lists or explanations
            .replace(/:(?=\s+)/g, ":\n")
        );
      })
      .join("\n");
  }

  convertTTMLTime(ttmlTime) {
    if (!ttmlTime) return null;

    // Handle different TTML time formats
    if (ttmlTime.includes("t")) {
      // Handle tick format
      const ticks = parseInt(ttmlTime.replace("t", ""));
      const seconds = ticks / 10000000;
      return this.formatVTTTime(seconds);
    }

    if (ttmlTime.includes("s")) {
      // Handle seconds format
      const seconds = parseFloat(ttmlTime.replace("s", ""));
      return this.formatVTTTime(seconds);
    }

    // Handle clock format (HH:MM:SS.mmm)
    const parts = ttmlTime.split(":");
    if (parts.length === 3) {
      const hours = parseInt(parts[0]);
      const minutes = parseInt(parts[1]);
      const seconds = parseFloat(parts[2]);
      const totalSeconds = hours * 3600 + minutes * 60 + seconds;
      return this.formatVTTTime(totalSeconds);
    }

    return null;
  }

  formatVTTTime(totalSeconds) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const milliseconds = Math.floor((totalSeconds % 1) * 1000);

    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}.${milliseconds.toString().padStart(3, "0")}`;
  }

  async setActiveSubtitle(filePath) {
    // First disable all tracks
    this.disableAllTextTracks();
    this.activeTrack = null;

    if (filePath) {
      const trackElements = Array.from(
        this.mediaPlayer.getElementsByTagName("track"),
      );
      const matchingTrack = trackElements.find(
        (track) => track.dataset.originalPath === filePath,
      );

      if (matchingTrack) {
        setTimeout(() => {
          this.disableAllTextTracks();
          matchingTrack.track.mode = "showing";
          this.activeTrack = matchingTrack.track;

          // Update the last used language
          this.lastUsedLanguage = matchingTrack.srclang;
          this.globalSubtitleEnabled = true;
          this.lastSuccessfulSubtitle = filePath;
          this.lastSuccessfulLanguage = matchingTrack.srclang;

          // Save state for both external and embedded subtitles
          if (this.currentVideoPath) {
            if (matchingTrack.dataset.isEmbedded === "true") {
              this.embeddedSubtitleHistory[this.currentVideoPath] = {
                streamIndex: parseInt(matchingTrack.dataset.streamIndex),
                language: matchingTrack.srclang,
              };
            } else {
              this.subtitleHistory[this.currentVideoPath] = filePath;
            }
          }

          // Only apply subtitle delay if there's an actual non-zero delay set
          if (this.subtitleDelay !== 0) {
            this.applySubtitleDelay();
          }

          this.saveSubtitleState();
          this.updateSubtitleMenu();
        }, 100);
      }
    } else {
      // Subtitle turned off
      this.globalSubtitleEnabled = false;
      if (this.currentVideoPath) {
        delete this.subtitleHistory[this.currentVideoPath];
        this.store.set("subtitleHistory", this.subtitleHistory);
      }
      this.lastSuccessfulSubtitle = null;
      this.lastSuccessfulLanguage = null;
      this.saveSubtitleState();
      this.updateSubtitleMenu();
    }
  }

  removeAllTracks() {
    const tracks = Array.from(this.mediaPlayer.getElementsByTagName("track"));
    tracks.forEach((track) => track.remove());
    this.activeTrack = null;
    this.updateSubtitleMenu();
  }

  updateSubtitleMenu() {
    const trackList = document.querySelector(".subtitle-track-list");
    if (!trackList) return;

    const activeTrack = Array.from(this.mediaPlayer.textTracks).find(
      (track) => track.mode === "showing",
    );
    const activeTrackElement = activeTrack
      ? Array.from(this.mediaPlayer.getElementsByTagName("track")).find(
          (track) => track.track === activeTrack,
        )
      : null;

    trackList.innerHTML = `
            <div class="subtitle-item ${!activeTrackElement ? "active" : ""}" data-path="">
                Off
            </div>
            <div class="subtitle-section">
                ${Array.from(this.mediaPlayer.getElementsByTagName("track"))
                  .filter((track) => track.dataset.isEmbedded === "true")
                  .map(
                    (track) => `
                        <div class="subtitle-item ${track === activeTrackElement ? "active" : ""}"
                             data-path="${track.dataset.originalPath.replace(/"/g, "&quot;")}"
                             data-embedded="true"
                             data-stream-index="${track.dataset.streamIndex}">
                            ${track.label}
                        </div>
                    `,
                  )
                  .join("")}
            </div>
            <div class="subtitle-section">
                ${Array.from(this.mediaPlayer.getElementsByTagName("track"))
                  .filter((track) => track.dataset.isEmbedded !== "true")
                  .map(
                    (track) => `
                        <div class="subtitle-item ${track === activeTrackElement ? "active" : ""}"
                             data-path="${track.dataset.originalPath.replace(/"/g, "&quot;")}">
                            ${track.label}
                        </div>
                    `,
                  )
                  .join("")}
            </div>
        `;

    // Add click handlers
    trackList.querySelectorAll(".subtitle-item").forEach((item) => {
      item.addEventListener("click", async (e) => {
        e.stopPropagation();
        const path = item.dataset.path;
        await this.setActiveSubtitle(path || null);
      });
    });
  }

  getSubtitleLabel(filePath) {
    const fileName = path.basename(filePath, path.extname(filePath));
    const langCode = this.detectLanguage(filePath);
    const language = this.languageCodes[langCode] || "English"; // Default to English instead of Unknown

    // Try to extract a clean name without language codes
    let cleanName = fileName
      .replace(/\.[a-z]{2,3}\./, ".") // Remove language codes
      .replace(/\([^)]*\)/g, "") // Remove parentheses
      .replace(/\[[^\]]*\]/g, "") // Remove square brackets
      .replace(/_+/g, " ") // Replace underscores with spaces
      .replace(/\.+/g, " ") // Replace dots with spaces
      .trim();

    return `${cleanName} (${language})`;
  }

  detectLanguage(filePath) {
    const fileName = path.basename(filePath).toLowerCase();

    // Look for language patterns in filename
    const patterns = [
      /\.([a-z]{2,3})\./, // matches .en. .eng. etc
      /\[([a-z]{2,3})\]/, // matches [en] [eng] etc
      /\(([a-z]{2,3})\)/, // matches (en) (eng) etc
      /_([a-z]{2,3})_/, // matches _en_ _eng_ etc
      /[-.]([a-z]{2,3})[-.]/, // matches -en- .en. etc
    ];

    for (const pattern of patterns) {
      const match = fileName.match(pattern);
      if (match && match[1]) {
        const code = match[1].toLowerCase();
        // Check both the code and the language name
        if (this.languageCodes[code]) {
          return code;
        }
      }
    }

    // Default to English if no language is detected
    return "eng";
  }

  // Style management
  updateSubtitleStyle() {
    const styleSheet = document.styleSheets[0];
    let cueRule = Array.from(styleSheet.cssRules).find(
      (rule) => rule.selectorText === "::cue",
    );

    if (!cueRule) {
      styleSheet.insertRule(
        "::cue { white-space: pre-line; }",
        styleSheet.cssRules.length,
      );
    } else {
      cueRule.style.whiteSpace = "pre-line";
    }
  }
}

// Export the class
module.exports = SubtitlesManager;
