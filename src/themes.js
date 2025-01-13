// themes.js
const Store = require('electron-store');
const store = new Store();

const themes = {
    default: {
        primaryColor: '#ff6600',
        primaryHover: 'linear-gradient(135deg, #ff8533 0%, #ff4d00 100%)',
        bgDark: 'linear-gradient(180deg, #232323 0%, #1a1a1a 100%)',
        bgDarker: '#141414',
        textColor: '#ffffff',
        sliderBg: 'linear-gradient(90deg, #444 0%, #333 100%)',
        controlBg: 'rgba(20, 20, 20, 0.95)',
        accentColor: '#ff8533',
        shadowColor: 'rgba(255, 101, 0, 0.2)',
        borderGlow: '0 0 10px rgba(255, 101, 0, 0.3)',
        activeGlow: '0 0 20px rgba(255, 101, 0, 0.5)'
    },
    cosmos: {
        primaryColor: '#7B2DFF',
        primaryHover: 'linear-gradient(135deg, #9D50FF 0%, #6223E0 100%)',
        bgDark: 'linear-gradient(180deg, #0B0B2B 0%, #040412 100%)',
        bgDarker: '#020208',
        textColor: '#E2D8FF',
        sliderBg: 'linear-gradient(90deg, #2A1B54 0%, #1A0F33 100%)',
        controlBg: 'rgba(11, 11, 43, 0.95)',
        accentColor: '#B76EFF',
        shadowColor: 'rgba(123, 45, 255, 0.25)',
        borderGlow: '0 0 15px rgba(183, 110, 255, 0.3)',
        activeGlow: '0 0 25px rgba(183, 110, 255, 0.6)',
        constellations: 'radial-gradient(circle at 10% 20%, rgba(183, 110, 255, 0.1) 1px, transparent 1px)'
    },
    quantum: {
        primaryColor: '#00FFB2',
        primaryHover: 'linear-gradient(135deg, #00FFB2 0%, #00CC8E 100%)',
        bgDark: 'linear-gradient(180deg, #001614 0%, #000A09 100%)',
        bgDarker: '#000504',
        textColor: '#B3FFF1',
        sliderBg: 'linear-gradient(90deg, #003D35 0%, #002622 100%)',
        controlBg: 'rgba(0, 22, 20, 0.95)',
        accentColor: '#00FFD1',
        shadowColor: 'rgba(0, 255, 178, 0.25)',
        borderGlow: '0 0 15px rgba(0, 255, 209, 0.3)',
        activeGlow: '0 0 30px rgba(0, 255, 209, 0.5)',
        matrixEffect: 'linear-gradient(0deg, rgba(0, 255, 178, 0.05) 1px, transparent 1px) 0 0 / 50px 50px'
    },
    bloodMoon: {
        primaryColor: '#FF2D55',
        primaryHover: 'linear-gradient(135deg, #FF4D6D 0%, #FF1A1A 100%)',
        bgDark: 'linear-gradient(180deg, #1A0005 0%, #0D0003 100%)',
        bgDarker: '#080001',
        textColor: '#FFD6DD',
        sliderBg: 'linear-gradient(90deg, #4D0011 0%, #330008 100%)',
        controlBg: 'rgba(26, 0, 5, 0.95)',
        accentColor: '#FF6B88',
        shadowColor: 'rgba(255, 45, 85, 0.25)',
        borderGlow: '0 0 15px rgba(255, 107, 136, 0.3)',
        activeGlow: '0 0 30px rgba(255, 107, 136, 0.5)',
        eclipseEffect: 'radial-gradient(circle at 50% 50%, rgba(255, 45, 85, 0.15), transparent 60%)'
    },
    crystalWave: {
        primaryColor: '#3CFFFF',
        primaryHover: 'linear-gradient(135deg, #50F9F9 0%, #00E5E5 100%)',
        bgDark: 'linear-gradient(180deg, #082B2B 0%, #041515 100%)',
        bgDarker: '#020A0A',
        textColor: '#E0FFFF',
        sliderBg: 'linear-gradient(90deg, #0A4D4D 0%, #063333 100%)',
        controlBg: 'rgba(8, 43, 43, 0.95)',
        accentColor: '#80FFFF',
        shadowColor: 'rgba(60, 255, 255, 0.25)',
        borderGlow: '0 0 15px rgba(128, 255, 255, 0.3)',
        activeGlow: '0 0 30px rgba(128, 255, 255, 0.5)',
        crystalEffect: 'repeating-linear-gradient(45deg, rgba(60, 255, 255, 0.03) 0px, transparent 5px)'
    },
    solarFlare: {
        primaryColor: '#FFB302',
        primaryHover: 'linear-gradient(135deg, #FFD700 0%, #FF8C00 100%)',
        bgDark: 'linear-gradient(180deg, #261500 0%, #1A0F00 100%)',
        bgDarker: '#0D0800',
        textColor: '#FFE5B3',
        sliderBg: 'linear-gradient(90deg, #663300 0%, #4D2600 100%)',
        controlBg: 'rgba(38, 21, 0, 0.95)',
        accentColor: '#FFC733',
        shadowColor: 'rgba(255, 179, 2, 0.25)',
        borderGlow: '0 0 15px rgba(255, 199, 51, 0.3)',
        activeGlow: '0 0 30px rgba(255, 199, 51, 0.5)',
        solarEffect: 'radial-gradient(circle at 50% -20%, rgba(255, 179, 2, 0.2), transparent 70%)'
    },
    auroraBreeze: {
        primaryColor: '#64FFDA',
        primaryHover: 'linear-gradient(135deg, #64FFDA 0%, #48A999 100%)',
        bgDark: 'linear-gradient(180deg, #0A192F 0%, #040C15 100%)',
        bgDarker: '#020610',
        textColor: '#C9FFF3',
        sliderBg: 'linear-gradient(90deg, #153D57 0%, #0E2837 100%)',
        controlBg: 'rgba(10, 25, 47, 0.95)',
        accentColor: '#98FFEA',
        shadowColor: 'rgba(100, 255, 218, 0.25)',
        borderGlow: '0 0 15px rgba(152, 255, 234, 0.3)',
        activeGlow: '0 0 30px rgba(152, 255, 234, 0.5)',
        auroraEffect: 'linear-gradient(180deg, rgba(100, 255, 218, 0.1) 0%, transparent 100%)'
    },
    neonDreams: {
        primaryColor: '#FF00FF',
        primaryHover: 'linear-gradient(135deg, #FF33FF 0%, #CC00CC 100%)',
        bgDark: 'linear-gradient(180deg, #1A0B33 0%, #0D0519 100%)',
        bgDarker: '#06030D',
        textColor: '#FFB3FF',
        sliderBg: 'linear-gradient(90deg, #4D0066 0%, #330044 100%)',
        controlBg: 'rgba(26, 11, 51, 0.95)',
        accentColor: '#FF4DFF',
        shadowColor: 'rgba(255, 0, 255, 0.25)',
        borderGlow: '0 0 15px rgba(255, 77, 255, 0.3)',
        activeGlow: '0 0 30px rgba(255, 77, 255, 0.5)',
        neonGrid: 'linear-gradient(90deg, rgba(255, 0, 255, 0.05) 1px, transparent 1px), linear-gradient(0deg, rgba(255, 0, 255, 0.05) 1px, transparent 1px)'
    },
    emeraldForest: {
        primaryColor: '#00FF9D',
        primaryHover: 'linear-gradient(135deg, #00FF9D 0%, #00B36F 100%)',
        bgDark: 'linear-gradient(180deg, #004D31 0%, #00261A 100%)',
        bgDarker: '#001A11',
        textColor: '#B3FFE0',
        sliderBg: 'linear-gradient(90deg, #006644 0%, #004D31 100%)',
        controlBg: 'rgba(0, 77, 49, 0.95)',
        accentColor: '#4DFFB8',
        shadowColor: 'rgba(0, 255, 157, 0.25)',
        borderGlow: '0 0 15px rgba(77, 255, 184, 0.3)',
        activeGlow: '0 0 30px rgba(77, 255, 184, 0.5)',
        forestEffect: 'repeating-radial-gradient(circle at 50% -20%, rgba(0, 255, 157, 0.05) 0px, transparent 40px)'
    },
    crimsonNight: {
        primaryColor: '#FF3366',
        primaryHover: 'linear-gradient(135deg, #FF4D7F 0%, #FF1A4D 100%)',
        bgDark: 'linear-gradient(180deg, #330014 0%, #1A000A 100%)',
        bgDarker: '#0D0005',
        textColor: '#FFB3C6',
        sliderBg: 'linear-gradient(90deg, #800033 0%, #660029 100%)',
        controlBg: 'rgba(51, 0, 20, 0.95)',
        accentColor: '#FF809F',
        shadowColor: 'rgba(255, 51, 102, 0.25)',
        borderGlow: '0 0 15px rgba(255, 128, 159, 0.3)',
        activeGlow: '0 0 30px rgba(255, 128, 159, 0.5)',
        nightEffect: 'radial-gradient(circle at 80% 10%, rgba(255, 51, 102, 0.15), transparent 60%)'
    }
};

// Add CSS to inject these advanced effects
const injectAdvancedCSS = (theme) => {
    const style = document.createElement('style');
    style.textContent = `
        :root {
            --theme-transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }

        body {
            background-image: var(--bg-dark);
            transition: var(--theme-transition);
        }

        .media-controls button:hover {
            transform: translateY(-1px);
            box-shadow: var(--border-glow);
        }

        .slider::-webkit-slider-thumb {
            box-shadow: var(--active-glow);
            transition: var(--theme-transition);
        }

        .playlist-item {
            backdrop-filter: blur(10px);
            transition: var(--theme-transition);
        }

        .playlist-item:hover {
            transform: translateX(5px);
            box-shadow: var(--border-glow);
        }

        .playlist-item.active {
            box-shadow: var(--active-glow);
        }

        #media-player {
            box-shadow: var(--shadow-color) 0 8px 32px;
        }

        .controls-overlay {
            background: var(--control-bg);
            backdrop-filter: blur(10px);
        }
    `;
    
    // Remove any previous theme styles
    const prevStyle = document.getElementById('theme-style');
    if (prevStyle) prevStyle.remove();
    
    style.id = 'theme-style';
    document.head.appendChild(style);
};

const applyTheme = (themeName) => {
    const theme = themes[themeName];
    if (!theme) {
        console.warn(`Theme "${themeName}" not found. Falling back to default theme.`);
        theme = themes.default;
    }
    
    if (typeof document !== 'undefined') {
        const root = document.documentElement;
        Object.entries(theme).forEach(([property, value]) => {
            root.style.setProperty(`--${property.replace(/([A-Z])/g, "-$1").toLowerCase()}`, value);
        });
        injectAdvancedCSS(theme);
    }
    store.set('selected-theme', themeName);
};  

const getCurrentTheme = () => store.get('selected-theme', 'default');

module.exports = { themes, applyTheme, getCurrentTheme };