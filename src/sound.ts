/**
 * Sound manager that plays audio files or synthesized tones for key events.
 * Supports both audio files (MP3, OGG, WAV) and synthesized Web Audio API tones.
 * Falls back to synthesized sounds if audio files are not available.
 */

import { SOUND_CONFIG } from './config';

export class SoundManager {
    private audioContext: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private enabled: boolean;
    private audioBuffers: Map<string, AudioBuffer> = new Map();
    private loadingPromises: Map<string, Promise<AudioBuffer | null>> = new Map();

    constructor(enabled: boolean = true) {
        this.enabled = enabled;
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        if (this.audioContext) {
            if (enabled && this.audioContext.state === 'suspended') {
                this.audioContext.resume().catch(() => void 0);
            } else if (!enabled && this.audioContext.state === 'running') {
                this.audioContext.suspend().catch(() => void 0);
            }
        }
    }

    /**
     * Resumes the AudioContext if suspended (for autoplay policy)
     */
    resumeContext(): void {
        this.ensureContext();
        if (this.audioContext && this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(() => void 0);
        }
    }

    playPlace(): void {
        if (SOUND_CONFIG.place.file) {
            this.playAudioFile(SOUND_CONFIG.place.file, SOUND_CONFIG.place.volume, () => {
                // Fallback to synthesized sound if file fails to load
                this.playTone(
                    SOUND_CONFIG.place.frequency,
                    SOUND_CONFIG.place.duration,
                    SOUND_CONFIG.place.waveform,
                    SOUND_CONFIG.place.volume
                );
            });
        } else {
            this.playTone(
                SOUND_CONFIG.place.frequency,
                SOUND_CONFIG.place.duration,
                SOUND_CONFIG.place.waveform,
                SOUND_CONFIG.place.volume
            );
        }
    }

    playClear(linesCleared: number, boardCleared: boolean): void {
        const file = boardCleared
            ? SOUND_CONFIG.clear.boardClearedFile
            : SOUND_CONFIG.clear.baseFile;
        
        if (file) {
            const volume = boardCleared
                ? SOUND_CONFIG.clear.boardClearedVolume
                : SOUND_CONFIG.clear.baseVolume;
            this.playAudioFile(file, volume, () => {
                // Fallback to synthesized sound
                const base = boardCleared
                    ? SOUND_CONFIG.clear.boardClearedFrequency
                    : SOUND_CONFIG.clear.baseFrequency;
                const freq = base + linesCleared * SOUND_CONFIG.clear.frequencyStep;
                const duration = boardCleared
                    ? SOUND_CONFIG.clear.boardClearedDuration
                    : SOUND_CONFIG.clear.baseDuration;
                const waveform = boardCleared
                    ? SOUND_CONFIG.clear.boardClearedWaveform
                    : SOUND_CONFIG.clear.baseWaveform;
                this.playTone(freq, duration, waveform, volume);
            });
        } else {
            // Use synthesized sound
            const base = boardCleared
                ? SOUND_CONFIG.clear.boardClearedFrequency
                : SOUND_CONFIG.clear.baseFrequency;
            const freq = base + linesCleared * SOUND_CONFIG.clear.frequencyStep;
            const duration = boardCleared
                ? SOUND_CONFIG.clear.boardClearedDuration
                : SOUND_CONFIG.clear.baseDuration;
            const waveform = boardCleared
                ? SOUND_CONFIG.clear.boardClearedWaveform
                : SOUND_CONFIG.clear.baseWaveform;
            const volume = boardCleared
                ? SOUND_CONFIG.clear.boardClearedVolume
                : SOUND_CONFIG.clear.baseVolume;
            this.playTone(freq, duration, waveform, volume);
        }
    }

    playGameOver(): void {
        if (SOUND_CONFIG.gameOver.file) {
            this.playAudioFile(SOUND_CONFIG.gameOver.file, SOUND_CONFIG.gameOver.volume, () => {
                // Fallback to synthesized sound
                this.playTone(
                    SOUND_CONFIG.gameOver.frequency,
                    SOUND_CONFIG.gameOver.duration,
                    SOUND_CONFIG.gameOver.waveform,
                    SOUND_CONFIG.gameOver.volume
                );
            });
        } else {
            this.playTone(
                SOUND_CONFIG.gameOver.frequency,
                SOUND_CONFIG.gameOver.duration,
                SOUND_CONFIG.gameOver.waveform,
                SOUND_CONFIG.gameOver.volume
            );
        }
    }

    playPop(): void {
        if (SOUND_CONFIG.pop.file) {
            this.playAudioFile(SOUND_CONFIG.pop.file, SOUND_CONFIG.pop.volume, () => {
                // Fallback to synthesized sound
                const freq = SOUND_CONFIG.pop.baseFrequency + Math.random() * SOUND_CONFIG.pop.randomRange;
                this.playTone(freq, SOUND_CONFIG.pop.duration, SOUND_CONFIG.pop.waveform, SOUND_CONFIG.pop.volume);
            });
        } else {
            // Short, sharp pop sound
            const freq = SOUND_CONFIG.pop.baseFrequency + Math.random() * SOUND_CONFIG.pop.randomRange;
            this.playTone(freq, SOUND_CONFIG.pop.duration, SOUND_CONFIG.pop.waveform, SOUND_CONFIG.pop.volume);
        }
    }

    private ensureContext(): void {
        if (this.audioContext) {
            // Always try to resume if suspended (fixes autoplay policy issues)
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume().catch(() => void 0);
            }
            return;
        }

        const globalWindow =
            typeof window === 'undefined' ? undefined : window;
        const AudioCtor =
            globalWindow?.AudioContext ||
            (globalWindow as typeof globalWindow & {
                webkitAudioContext?: typeof AudioContext;
            })?.webkitAudioContext;

        if (!AudioCtor) {
            this.enabled = false;
            return;
        }

        const ctx = new AudioCtor();
        const gain = ctx.createGain();
        gain.gain.value = SOUND_CONFIG.masterGain;
        gain.connect(ctx.destination);
        this.audioContext = ctx;
        this.masterGain = gain;
        
        // Try to resume immediately (may fail due to autoplay policy, but will work after user interaction)
        if (ctx.state === 'suspended') {
            ctx.resume().catch(() => void 0);
        }
    }

    private playTone(frequency: number, duration: number, type: OscillatorType, volume: number = 1.0): void {
        if (!this.enabled) {
            return;
        }

        this.ensureContext();

        if (!this.audioContext || !this.masterGain) {
            return;
        }

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(() => void 0);
        }

        const oscillator = this.audioContext.createOscillator();
        const envelope = this.audioContext.createGain();

        oscillator.type = type;
        oscillator.frequency.value = frequency;

        // Apply volume multiplier to the envelope
        // Start at the volume level, then decay to a proportionally lower value
        envelope.gain.setValueAtTime(volume, this.audioContext.currentTime);
        envelope.gain.exponentialRampToValueAtTime(
            volume * 0.001, // Maintain proportional decay
            this.audioContext.currentTime + duration
        );

        oscillator.connect(envelope);
        envelope.connect(this.masterGain);

        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + duration);
    }

    /**
     * Loads an audio file and caches it for future use
     * @param filename - Name of the audio file (e.g., 'place.mp3')
     * @returns Promise that resolves to the AudioBuffer or null if loading fails
     */
    private async loadAudioFile(filename: string): Promise<AudioBuffer | null> {
        // Check if already cached
        if (this.audioBuffers.has(filename)) {
            return this.audioBuffers.get(filename)!;
        }

        // Check if already loading
        if (this.loadingPromises.has(filename)) {
            return this.loadingPromises.get(filename)!;
        }

        // Start loading
        const loadPromise = (async () => {
            try {
                this.ensureContext();
                if (!this.audioContext) {
                    return null;
                }

                const response = await fetch(`/sounds/${filename}`);
                if (!response.ok) {
                    console.warn(`[SOUND] Failed to load audio file: ${filename}`);
                    return null;
                }

                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
                
                // Cache the buffer
                this.audioBuffers.set(filename, audioBuffer);
                return audioBuffer;
            } catch (error) {
                console.warn(`[SOUND] Error loading audio file ${filename}:`, error);
                return null;
            } finally {
                // Remove from loading promises once done
                this.loadingPromises.delete(filename);
            }
        })();

        this.loadingPromises.set(filename, loadPromise);
        return loadPromise;
    }

    /**
     * Plays an audio file, falling back to a callback if the file fails to load
     * @param filename - Name of the audio file
     * @param volume - Volume multiplier (0.0 to 1.0)
     * @param fallback - Callback to execute if audio file fails to load
     */
    private async playAudioFile(filename: string, volume: number, fallback: () => void): Promise<void> {
        if (!this.enabled) {
            return;
        }

        this.ensureContext();
        if (!this.audioContext || !this.masterGain) {
            fallback();
            return;
        }

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().catch(() => void 0);
        }

        const audioBuffer = await this.loadAudioFile(filename);
        
        if (!audioBuffer) {
            // File failed to load, use fallback
            fallback();
            return;
        }

        try {
            const source = this.audioContext.createBufferSource();
            const gainNode = this.audioContext.createGain();
            
            source.buffer = audioBuffer;
            gainNode.gain.value = volume * SOUND_CONFIG.masterGain;
            
            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            source.start(0);
        } catch (error) {
            console.warn(`[SOUND] Error playing audio file ${filename}:`, error);
            fallback();
        }
    }
}

