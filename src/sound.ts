/**
 * Lightweight sound manager that plays simple synthesized tones for key events.
 * Uses the Web Audio API so we don't have to ship asset files.
 */
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

    playPlace(): void {
        this.playTone(360, 0.11, 'triangle');
    }

    playClear(linesCleared: number, boardCleared: boolean): void {
        const base = boardCleared ? 620 : 460;
        const freq = base + linesCleared * 35;
        const duration = boardCleared ? 0.35 : 0.18;
        this.playTone(freq, duration, boardCleared ? 'sawtooth' : 'square');
    }

    playGameOver(): void {
        this.playTone(220, 0.45, 'sine');
    }

    private ensureContext(): void {
        if (this.audioContext) {
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
        gain.gain.value = 0.15;
        gain.connect(ctx.destination);
        this.audioContext = ctx;
        this.masterGain = gain;
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

