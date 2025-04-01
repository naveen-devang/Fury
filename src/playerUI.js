const controlsOverlay = document.getElementById("controls-overlay");

function showControls() {
  controlsOverlay.style.opacity = "1";
  document.body.classList.remove("hide-cursor");

  clearTimeout(controlsTimeout);
  controlsTimeout = setTimeout(hideControls, INACTIVITY_TIMEOUT);
}

function hideControls() {
  controlsOverlay.style.opacity = "0";
  document.body.classList.add("hide-cursor");
}

function updateWindowTitle() {
  document.title =
    currentIndex === -1
      ? "Fury"
      : `${playlist[currentIndex].metadata.title} - Fury`;
}

function adjustForScreenSize() {
  const width = Math.max(window.innerWidth, MIN_WINDOW_WIDTH);

  if (width < 900) {
    // Adjust playlist panel
    playlistPanel.style.width = "280px";
    playerSection.style.minWidth = `${MIN_WINDOW_WIDTH - 280}px`; // Account for smaller playlist panel

    // Ensure controls stay visible
    document.querySelectorAll(".control-button").forEach((button) => {
      button.style.padding = "6px";
    });

    // Adjust volume slider
    const volumeControl = document.querySelector(".volume-control");
    if (volumeControl) {
      if (width < 800) {
        volumeControl.classList.add("vertical");

        // Make sure we have a tooltip for the volume
        if (!volumeControl.querySelector(".volume-tooltip")) {
          const tooltip = document.createElement("div");
          tooltip.className = "volume-tooltip";
          tooltip.textContent = Math.round(volumeSlider.value) + "%";
          volumeControl.appendChild(tooltip);
        }
      } else {
        volumeControl.classList.remove("vertical");
        volumeControl.style.minWidth = "80px";
        volumeControl.style.width = "80px";
      }
    }
  } else {
    // Reset styles for larger screens
    playlistPanel.style.width = "320px";
    playerSection.style.minWidth = `${MIN_WINDOW_WIDTH - 320}px`;

    document.querySelectorAll(".control-button").forEach((button) => {
      button.style.padding = "8px";
    });

    const volumeControl = document.querySelector(".volume-control");
    if (volumeControl) {
      volumeControl.classList.remove("vertical");
      volumeControl.style.minWidth = "100px";
      volumeControl.style.width = "120px";
    }
  }
}

module.exports = {
  adjustForScreenSize,
  updateWindowTitle,
  hideControls,
  showControls,
};
