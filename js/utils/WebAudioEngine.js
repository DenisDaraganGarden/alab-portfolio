/**
 * WebAudioEngine - Procedural Audio Synthesis for ALAB
 * Generates premium soundscapes for UI interactions using the Web Audio API.
 */

class WebAudioEngine {
    constructor() {
        this.ctx = null;
        this.isUnlocked = false;
        this.enabled = true;
        
        // Effects configuration
        this.masterVolume = 0.4;
        this.activeNodes = new Map();
        this.customAudio = new Map();
        this.letters = [];
    }

    init() {
        if (this.ctx) return;
        
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
            console.warn("Web Audio API not supported in this browser.");
            return;
        }

        this.ctx = new AudioContext();
        
        // Master gain node
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.masterVolume;
        
        // Add a subtle compressor to avoid clipping
        this.compressor = this.ctx.createDynamicsCompressor();
        this.compressor.threshold.value = -24;
        this.compressor.knee.value = 30;
        this.compressor.ratio.value = 12;
        this.compressor.attack.value = 0.003;
        this.compressor.release.value = 0.25;

        this.masterGain.connect(this.compressor);
        this.compressor.connect(this.ctx.destination);
    }

    configure(settings = {}) {
        const audioSettings = settings.audio || settings;
        this.enabled = audioSettings.enabled !== false;
        this.letters = Array.isArray(audioSettings.letters) ? audioSettings.letters : [];

        const nextVolume = Number(audioSettings.masterVolume);
        if (Number.isFinite(nextVolume)) {
            this.masterVolume = Math.max(0, Math.min(1, nextVolume));
        }

        if (this.masterGain) {
            this.masterGain.gain.value = this.masterVolume;
        }

        if (!this.enabled) {
            this.stopAll();
        }
    }

    unlock() {
        if (!this.enabled) return;
        if (this.isUnlocked) return;
        if (!this.ctx) this.init();
        
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume().then(() => {
                this.isUnlocked = true;
            });
        } else {
            this.isUnlocked = true;
        }
    }

    getLetter(index) {
        return this.letters.find(letter => String(letter.index) === String(index)) || null;
    }

    playLetter(index) {
        if (!this.enabled) return { playing: false, oneShot: false };

        const letter = this.getLetter(index);
        const fallback = letter?.fallback || this.fallbackByIndex(index);

        if (letter?.audioFile) {
            return this.playAudioFile(index, letter.audioFile, fallback);
        }

        switch(String(index)) {
            case '0': this.playVibration(); return { playing: true, oneShot: false };
            case '1': this.playGlitch(); return { playing: true, oneShot: false };
            case '2': this.playGlass(); return { playing: true, oneShot: true };
            case '3': this.playSpotlight(); return { playing: true, oneShot: false };
            default: return { playing: false, oneShot: false };
        }
    }

    stopLetter(index) {
        this.stopAudioFile(index);

        switch(String(index)) {
            case '0': this.stopVibration(); break;
            case '1': this.stopGlitch(); break;
            case '2': this.stopGlass(); break;
            case '3': this.stopSpotlight(); break;
        }
    }

    fallbackByIndex(index) {
        switch(String(index)) {
            case '0': return 'vibration';
            case '1': return 'glitch';
            case '2': return 'glass';
            case '3': return 'spotlight';
            default: return 'sound';
        }
    }

    playAudioFile(index, src, fallback) {
        this.stopLetter(index);

        const audio = new Audio(src);
        audio.volume = this.masterVolume;
        audio.loop = fallback !== 'glass';
        audio.preload = 'auto';
        this.customAudio.set(String(index), audio);

        audio.addEventListener('ended', () => {
            this.customAudio.delete(String(index));
        }, { once: true });

        audio.play().catch(() => {
            this.customAudio.delete(String(index));
        });

        return { playing: true, oneShot: !audio.loop };
    }

    stopAudioFile(index) {
        const audio = this.customAudio.get(String(index));
        if (!audio) return;
        audio.pause();
        audio.currentTime = 0;
        this.customAudio.delete(String(index));
    }

    stopAll() {
        ['0', '1', '2', '3'].forEach(index => this.stopLetter(index));

        if (this.ctx && this.ctx.state === 'running') {
            this.ctx.suspend().catch(() => {});
            this.isUnlocked = false;
        }
    }

    safeStop(node) {
        try { node.stop(); } catch(e) {}
        try { node.disconnect(); } catch(e) {}
    }

    // --- Sound Profiles ---

    // 0: "a." -> Vibration (Deep Bass)
    playVibration() {
        if (!this.enabled || !this.isUnlocked || !this.ctx) return;
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(45, this.ctx.currentTime); // Low sub bass
        osc.frequency.exponentialRampToValueAtTime(30, this.ctx.currentTime + 0.5);
        
        // Tremolo effect for vibration feel
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.type = 'sine';
        lfo.frequency.value = 15; // Fast flutter
        lfoGain.gain.value = 0.5;
        lfo.connect(lfoGain);
        lfoGain.connect(gain.gain);
        
        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.8, this.ctx.currentTime + 0.1);
        
        osc.connect(gain);
        gain.connect(this.masterGain);
        
        osc.start();
        lfo.start();
        
        this.activeNodes.set('vibration', { osc, gain, lfo });
    }

    stopVibration() {
        if (!this.activeNodes.has('vibration')) return;
        const { osc, gain, lfo } = this.activeNodes.get('vibration');
        
        const now = this.ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        
        setTimeout(() => {
            osc.stop();
            lfo.stop();
            osc.disconnect();
            gain.disconnect();
            this.activeNodes.delete('vibration');
        }, 350);
    }

    // 1: "l" -> Glitch/Scramble (Noise + Random Filter)
    playGlitch() {
        if (!this.enabled || !this.isUnlocked || !this.ctx) return;
        
        const bufferSize = this.ctx.sampleRate * 2; // 2 seconds of noise
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;
        
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.value = 10;
        
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.3, this.ctx.currentTime + 0.05);
        
        // Randomize filter frequency for glitch effect
        const glitchInterval = setInterval(() => {
            if (this.ctx) {
                filter.frequency.setTargetAtTime(1000 + Math.random() * 4000, this.ctx.currentTime, 0.02);
            }
        }, 50);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        
        noise.start();
        this.activeNodes.set('glitch', { noise, gain, filter, interval: glitchInterval });
    }

    stopGlitch() {
        if (!this.activeNodes.has('glitch')) return;
        const { noise, gain, interval } = this.activeNodes.get('glitch');
        clearInterval(interval);
        
        const now = this.ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.1);
        
        setTimeout(() => {
            noise.stop();
            noise.disconnect();
            gain.disconnect();
            this.activeNodes.delete('glitch');
        }, 150);
    }

    // 2: "a" -> Glass (FM Synthesis Bell)
    playGlass() {
        if (!this.enabled || !this.isUnlocked || !this.ctx) return;
        
        // We just play a one-shot chime on enter, no loop
        const now = this.ctx.currentTime;
        
        const carrier = this.ctx.createOscillator();
        const modulator = this.ctx.createOscillator();
        const modGain = this.ctx.createGain();
        const mainGain = this.ctx.createGain();
        
        carrier.type = 'sine';
        modulator.type = 'sine';
        
        // Bell ratios
        const baseFreq = 800;
        carrier.frequency.value = baseFreq;
        modulator.frequency.value = baseFreq * 2.8;
        
        modGain.gain.setValueAtTime(800, now);
        modGain.gain.exponentialRampToValueAtTime(10, now + 1.5);
        
        mainGain.gain.setValueAtTime(0, now);
        mainGain.gain.linearRampToValueAtTime(0.4, now + 0.02);
        mainGain.gain.exponentialRampToValueAtTime(0.001, now + 2);
        
        modulator.connect(modGain);
        modGain.connect(carrier.frequency);
        carrier.connect(mainGain);
        mainGain.connect(this.masterGain);
        
        modulator.start(now);
        carrier.start(now);
        modulator.stop(now + 2.1);
        carrier.stop(now + 2.1);
        this.activeNodes.set('glass', { carrier, modulator, mainGain, modGain });

        window.setTimeout(() => {
            this.activeNodes.delete('glass');
        }, 2200);
    }
    
    stopGlass() {
        if (!this.activeNodes.has('glass') || !this.ctx) return;
        const { carrier, modulator, mainGain, modGain } = this.activeNodes.get('glass');
        const now = this.ctx.currentTime;
        mainGain.gain.cancelScheduledValues(now);
        mainGain.gain.setValueAtTime(mainGain.gain.value, now);
        mainGain.gain.linearRampToValueAtTime(0, now + 0.05);

        setTimeout(() => {
            this.safeStop(carrier);
            this.safeStop(modulator);
            try { mainGain.disconnect(); } catch(e) {}
            try { modGain.disconnect(); } catch(e) {}
            this.activeNodes.delete('glass');
        }, 80);
    }

    // 3: "b" -> Spotlight (Sweeping Pad)
    playSpotlight() {
        if (!this.enabled || !this.isUnlocked || !this.ctx) return;
        
        const now = this.ctx.currentTime;
        
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const filter = this.ctx.createBiquadFilter();
        const gain = this.ctx.createGain();
        
        osc1.type = 'sawtooth';
        osc2.type = 'sine';
        
        osc1.frequency.value = 110; // A2
        osc2.frequency.value = 220; // A3
        
        // Detune
        osc1.detune.value = 10;
        osc2.detune.value = -10;
        
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(200, now);
        filter.frequency.exponentialRampToValueAtTime(1500, now + 2);
        filter.Q.value = 2;
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.5);
        
        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(this.masterGain);
        
        osc1.start();
        osc2.start();
        
        this.activeNodes.set('spotlight', { osc1, osc2, gain, filter });
    }

    stopSpotlight() {
        if (!this.activeNodes.has('spotlight')) return;
        const { osc1, osc2, gain } = this.activeNodes.get('spotlight');
        
        const now = this.ctx.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.8);
        
        setTimeout(() => {
            osc1.stop();
            osc2.stop();
            osc1.disconnect();
            osc2.disconnect();
            gain.disconnect();
            this.activeNodes.delete('spotlight');
        }, 850);
    }
}

export const audioEngine = new WebAudioEngine();
