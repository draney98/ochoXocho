/**
 * DragController - Physics-based drag smoothing system
 * 
 * Provides smooth, responsive drag behavior using time-based exponential interpolation
 * for a natural feel when dragging pieces.
 * 
 * Key features:
 * - Frame-rate independent smoothing using exponential interpolation
 * - Smooth transitions between floating and grid-snapped positions
 * - Release settle phase for smooth placement animation
 */

/**
 * Configuration for the drag controller behavior
 */
export interface DragControllerConfig {
    /** How quickly the piece follows the finger/cursor (ms). Lower = more responsive. */
    responsiveTimeMs: number;
    /** Distance in cells for snap influence to begin (0.5 = half a cell from center) */
    snapRadiusCells: number;
    /** Snap strength when finger is stationary (0.0-1.0) */
    snapStrengthAtRest: number;
    /** Duration of settle animation after release (ms) */
    settleDurationMs: number;
    /** Velocity dampening factor for snap reduction when moving fast */
    velocityDampening: number;
}

/**
 * Internal state of the drag controller
 */
export interface DragControllerState {
    /** Current smoothed visual position in canvas coordinates */
    visualPosition: { x: number; y: number };
    /** Current velocity of the visual position (pixels per ms) */
    velocity: { x: number; y: number };
    /** Tracked finger/cursor velocity for snap modulation */
    fingerVelocity: { x: number; y: number };
    /** Last raw finger position for velocity calculation */
    lastFingerPosition: { x: number; y: number } | null;
    /** Timestamp of last update for deltaTime calculation */
    lastUpdateTime: number;
    /** Whether we're in the release settle phase */
    isSettling: boolean;
    /** When settle phase started */
    settleStartTime: number;
    /** Frozen target position during settle */
    settleTarget: { x: number; y: number } | null;
    /** Whether drag is currently active */
    isActive: boolean;
}

/**
 * Default configuration values
 */
export const DEFAULT_DRAG_CONTROLLER_CONFIG: DragControllerConfig = {
    responsiveTimeMs: 80,
    snapRadiusCells: 0.6,
    snapStrengthAtRest: 0.85,
    settleDurationMs: 100,
    velocityDampening: 0.003,
};

/**
 * DragController class - manages smooth drag physics
 */
export class DragController {
    private config: DragControllerConfig;
    private state: DragControllerState;

    constructor(config: Partial<DragControllerConfig> = {}) {
        this.config = { ...DEFAULT_DRAG_CONTROLLER_CONFIG, ...config };
        this.state = this.createInitialState();
    }

    /**
     * Creates the initial state object
     */
    private createInitialState(): DragControllerState {
        return {
            visualPosition: { x: 0, y: 0 },
            velocity: { x: 0, y: 0 },
            fingerVelocity: { x: 0, y: 0 },
            lastFingerPosition: null,
            lastUpdateTime: 0,
            isSettling: false,
            settleStartTime: 0,
            settleTarget: null,
            isActive: false,
        };
    }

    /**
     * Updates the configuration at runtime
     */
    updateConfig(config: Partial<DragControllerConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Starts a new drag operation
     * @param initialPosition - Starting position in canvas coordinates
     */
    beginDrag(initialPosition: { x: number; y: number }): void {
        this.state = this.createInitialState();
        this.state.isActive = true;
        this.state.visualPosition = { ...initialPosition };
        this.state.lastFingerPosition = { ...initialPosition };
        this.state.lastUpdateTime = performance.now();
    }

    /**
     * Updates the drag controller each frame
     * @param rawTarget - Raw floating position (follows finger with visual offset)
     * @param snapTarget - Grid-snapped target position if over board (shape's visual center when placed), null otherwise
     * @param deltaTimeMs - Time since last frame in milliseconds (optional, calculated if not provided)
     * @returns The smoothed visual position to render the dragged piece at
     */
    update(
        rawTarget: { x: number; y: number },
        snapTarget: { x: number; y: number } | null,
        deltaTimeMs?: number
    ): { x: number; y: number } {
        if (!this.state.isActive) {
            return rawTarget;
        }

        const currentTime = performance.now();
        const dt = deltaTimeMs ?? (this.state.lastUpdateTime > 0 
            ? currentTime - this.state.lastUpdateTime 
            : 16.67); // Default to ~60fps
        this.state.lastUpdateTime = currentTime;

        // Clamp deltaTime to prevent huge jumps
        const clampedDt = Math.min(dt, 50);

        // Update finger velocity tracking
        this.updateFingerVelocity(rawTarget, clampedDt);

        // During settle phase, target is frozen
        if (this.state.isSettling && this.state.settleTarget) {
            return this.updateSpring(this.state.settleTarget, clampedDt);
        }

        // Determine target: use snap target if over board, otherwise raw target
        const target = snapTarget ?? rawTarget;

        // Apply smooth interpolation toward target
        return this.updateSpring(target, clampedDt);
    }

    /**
     * Tracks finger velocity (kept for potential future use)
     */
    private updateFingerVelocity(
        rawPosition: { x: number; y: number },
        dt: number
    ): void {
        if (this.state.lastFingerPosition && dt > 0) {
            const dx = rawPosition.x - this.state.lastFingerPosition.x;
            const dy = rawPosition.y - this.state.lastFingerPosition.y;
            
            // Smooth finger velocity using exponential moving average
            const smoothing = 0.3;
            this.state.fingerVelocity.x = this.state.fingerVelocity.x * (1 - smoothing) + (dx / dt) * smoothing;
            this.state.fingerVelocity.y = this.state.fingerVelocity.y * (1 - smoothing) + (dy / dt) * smoothing;
        }
        this.state.lastFingerPosition = { ...rawPosition };
    }

    /**
     * Applies smooth exponential interpolation toward target
     * Uses time-based exponential smoothing for frame-rate independent, stable convergence
     * This is equivalent to a first-order low-pass filter and avoids spring oscillation issues
     */
    private updateSpring(
        target: { x: number; y: number },
        dt: number
    ): { x: number; y: number } {
        const pos = this.state.visualPosition;
        
        // Time-based exponential smoothing
        // alpha = 1 - e^(-dt / timeConstant)
        // This gives smooth, frame-rate independent interpolation
        // responsiveTimeMs is the time constant - lower = faster response
        const timeConstant = this.config.responsiveTimeMs;
        const alpha = 1 - Math.exp(-dt / timeConstant);
        
        // Clamp alpha to prevent overshoot on large dt values
        const clampedAlpha = Math.min(alpha, 1.0);
        
        // Smoothly interpolate toward target
        pos.x += (target.x - pos.x) * clampedAlpha;
        pos.y += (target.y - pos.y) * clampedAlpha;

        return { x: pos.x, y: pos.y };
    }

    /**
     * Begins the settle phase on drag release
     * @param settleTarget - Canvas coordinates to settle to (or null to settle in place)
     */
    beginSettle(settleTarget: { x: number; y: number } | null): void {
        this.state.isSettling = true;
        this.state.settleStartTime = performance.now();

        if (settleTarget) {
            this.state.settleTarget = { ...settleTarget };
        } else {
            // Settle to current visual position (no valid placement)
            this.state.settleTarget = { ...this.state.visualPosition };
        }
    }

    /**
     * Checks if the settle phase is complete
     */
    isSettleComplete(): boolean {
        if (!this.state.isSettling) {
            return true;
        }
        return (performance.now() - this.state.settleStartTime) >= this.config.settleDurationMs;
    }

    /**
     * Ends the drag operation and resets state
     */
    endDrag(): void {
        this.state = this.createInitialState();
    }

    /**
     * Gets whether a drag is currently active
     */
    isActive(): boolean {
        return this.state.isActive;
    }

    /**
     * Gets whether currently in settle phase
     */
    isSettling(): boolean {
        return this.state.isSettling;
    }

    /**
     * Gets the current visual position
     */
    getVisualPosition(): { x: number; y: number } {
        return { ...this.state.visualPosition };
    }

    /**
     * Gets the settle progress (0 to 1)
     */
    getSettleProgress(): number {
        if (!this.state.isSettling) {
            return 0;
        }
        const elapsed = performance.now() - this.state.settleStartTime;
        return Math.min(elapsed / this.config.settleDurationMs, 1);
    }
}
