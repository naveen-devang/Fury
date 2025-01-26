// release-notes.js
const RELEASE_NOTES = {

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