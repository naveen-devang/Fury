const playerContainer = document.getElementById("player-container");

function toggleFullscreen() {
  // Check if we're already in fullscreen
  const isCurrentlyFullscreen = !!(
    document.fullscreenElement || document.webkitFullscreenElement
  );

  try {
    if (!isCurrentlyFullscreen) {
      // Define all possible fullscreen request methods
      const requestFullscreen =
        playerContainer.requestFullscreen ||
        playerContainer.webkitRequestFullscreen;

      if (requestFullscreen) {
        Promise.resolve(requestFullscreen.call(playerContainer))
          .then(() => {
            isFullscreen = true;
            ipcRenderer.send("toggle-menu-bar", false);
            showControls();
            fullscreenBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v3a2 2 0 0 1-2 2H3"></path><path d="M21 8h-3a2 2 0 0 1-2-2V3"></path><path d="M3 16h3a2 2 0 0 1 2 2v3"></path><path d="M16 21v-3a2 2 0 0 1 2-2h3"></path></svg>`;
          })
          .catch((err) => {
            console.warn("Fullscreen request failed:", err);
            // Try alternative methods if the primary method fails
            if (playerContainer.webkitRequestFullscreen) {
              playerContainer.webkitRequestFullscreen();
            }
          });
      }
    } else {
      // Define all possible exit fullscreen methods
      const exitFullscreen =
        document.exitFullscreen || document.webkitExitFullscreen;

      if (exitFullscreen) {
        Promise.resolve(exitFullscreen.call(document))
          .then(() => {
            isFullscreen = false;
            ipcRenderer.send("toggle-menu-bar", true);
            clearTimeout(controlsTimeout);
            showControls();
            fullscreenBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"></path><path d="M21 8V5a2 2 0 0 0-2-2h-3"></path><path d="M3 16v3a2 2 0 0 0 2 2h3"></path><path d="M16 21h3a2 2 0 0 0 2-2v-3"></path></svg>`;
          })
          .catch((err) => {
            console.warn("Exit fullscreen failed:", err);
          });
      }
    }
  } catch (error) {
    console.error("Error toggling fullscreen:", error);
  }
}

function handleFullscreenChange() {
  isFullscreen = !!(
    document.fullscreenElement || document.webkitFullscreenElement
  );

  if (!isFullscreen) {
    ipcRenderer.send("toggle-menu-bar", true);
    clearTimeout(controlsTimeout);
    showControls();
  }
}

function isFullscreenSupported() {
  return !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
}

module.exports = {
  isFullscreenSupported,
  handleFullscreenChange,
  toggleFullscreen,
};
