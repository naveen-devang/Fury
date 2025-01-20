// release-notes.js
const RELEASE_NOTES = {
  "0.0.38": [
    "Now stores last used volume percentage",
    "Updated logic for shuffle",
    "Improved performance and stability"
  ],
};

module.exports = {
  RELEASE_NOTES,
  getReleaseNotes: function(version) {
    if (RELEASE_NOTES[version]) {
      return '• ' + RELEASE_NOTES[version].join('\n• ');
    }
    return null;
  }
};