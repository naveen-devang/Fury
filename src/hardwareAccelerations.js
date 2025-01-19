// hardwareAcceleration.js

const Store = require('electron-store');
const store = new Store();

class HardwareAcceleration {
    constructor(mediaPlayer) {
        this.mediaPlayer = mediaPlayer;
        this.isHardwareAccelerated = store.get('hardwareAcceleration', true);
    }

    checkSupport() {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        
        if (!gl) {
            console.warn('WebGL not supported - hardware acceleration may be limited');
            return false;
        }
    
        // Check for video texture support
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
            const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            console.log('Graphics hardware:', renderer);
        }
    
        return true;
    }

    toggle(enabled) {
        this.isHardwareAccelerated = enabled;
        store.set('hardwareAcceleration', enabled);
        
        if (this.mediaPlayer) {
            if (enabled) {
                // Enable hardware acceleration
                this.mediaPlayer.style.transform = 'translateZ(0)';
                this.mediaPlayer.style.willChange = 'transform';
                this.mediaPlayer.classList.remove('no-hardware-acceleration');
                
                // Force video decoder hardware acceleration when available
                this.mediaPlayer.setAttribute('x-webkit-airplay', 'allow');
                this.mediaPlayer.setAttribute('webkit-playsinline', '');
                this.mediaPlayer.setAttribute('playsinline', '');
                
                // Add hardware accelerated video rendering
                this.mediaPlayer.style.backfaceVisibility = 'hidden';
                this.mediaPlayer.style.perspective = '1000px';
                this.mediaPlayer.style.transform = 'translate3d(0,0,0)'; // Force GPU layer
                
                // Force video rendering to happen on GPU
                this.mediaPlayer.style.position = 'relative';
                this.mediaPlayer.style.zIndex = '1';
            } else {
                // Disable hardware acceleration
                this.mediaPlayer.style.transform = 'none';
                this.mediaPlayer.style.willChange = 'auto';
                this.mediaPlayer.classList.add('no-hardware-acceleration');
                this.mediaPlayer.removeAttribute('x-webkit-airplay');
                this.mediaPlayer.removeAttribute('webkit-playsinline');
                this.mediaPlayer.removeAttribute('playsinline');
                this.mediaPlayer.style.backfaceVisibility = 'visible';
                this.mediaPlayer.style.perspective = 'none';
            }
        }
    }

    handleError(error, currentPath, onRetry) {
        if (error && this.isHardwareAccelerated) {
            const errorCode = error.code;
            // Check for common hardware acceleration related errors
            if (errorCode === MediaError.MEDIA_ERR_DECODE || 
                errorCode === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
                console.warn('Possible hardware acceleration error, falling back to software decoding');
                this.toggle(false);
                
                // Retry playback if callback provided
                if (onRetry && currentPath) {
                    onRetry(currentPath);
                }
            }
        }
    }

    addCodecSupport(filePath) {
        if (this.isHardwareAccelerated && filePath.toLowerCase().endsWith('.mp4')) {
            this.mediaPlayer.setAttribute('type', 'video/mp4; codecs="avc1.42E01E"');
        }
    }

    isEnabled() {
        return this.isHardwareAccelerated;
    }
}

module.exports = HardwareAcceleration;