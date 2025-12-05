/**
 * Lightweight sound manager that plays simple synthesized tones for key events.
 * Uses the Web Audio API so we don't have to ship asset files.
 */

import { SOUND_CONFIG } from './config';

export class SoundManager {
    private audioContext: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private enabled: boolean;

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
        this.playTone(
            SOUND_CONFIG.place.frequency,
            SOUND_CONFIG.place.duration,
            SOUND_CONFIG.place.waveform
        );
    }

    playClear(linesCleared: number, boardCleared: boolean): void {
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
        this.playTone(freq, duration, waveform);
    }

    playGameOver(): void {
        this.playTone(
            SOUND_CONFIG.gameOver.frequency,
            SOUND_CONFIG.gameOver.duration,
            SOUND_CONFIG.gameOver.waveform
        );
    }

    playPop(): void {
        // Short, sharp pop sound
        const freq = SOUND_CONFIG.pop.baseFrequency + Math.random() * SOUND_CONFIG.pop.randomRange;
        this.playTone(freq, SOUND_CONFIG.pop.duration, SOUND_CONFIG.pop.waveform);
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

    private playTone(frequency: number, duration: number, type: OscillatorType): void {
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

        envelope.gain.setValueAtTime(1, this.audioContext.currentTime);
        envelope.gain.exponentialRampToValueAtTime(
            0.001,
            this.audioContext.currentTime + duration
        );

        oscillator.connect(envelope);
        envelope.connect(this.masterGain);

        oscillator.start();
        oscillator.stop(this.audioContext.currentTime + duration);
    }
}

