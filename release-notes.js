// release-notes.js
const RELEASE_NOTES = {
  "0.0.38": [
    "Now Stores last used volume percentage",
    "Updated logic for shuffle",
    ""
  ]
};

// Export both the release notes object and a helper function
module.exports = {
  RELEASE_NOTES,
  getReleaseNotes: function(version) {
    // First try to get notes from our predefined list
    if (RELEASE_NOTES[version]) {
      return '• ' + RELEASE_NOTES[version].join('\n• ');
    }
    return null;
  }
};