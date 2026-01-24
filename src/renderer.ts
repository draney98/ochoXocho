/**
 * Canvas rendering system for drawing the game board, shapes, queue, and score
 */

import { Position, Shape, PlacedBlock, DragState, AnimatingCell, AnimatingShape, GameSettings } from './types';
import { Board } from './board';
import { getShapeColor, getShapeIndex } from './shapes';
import { getColorSet } from './colorConfig';
import {
    BOARD_PIXEL_SIZE,
    BOARD_CELL_COUNT,
    CELL_SIZE,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    QUEUE_AREA_HEIGHT,
    QUEUE_ITEM_HEIGHT,
    BOARD_OFFSET_X,
    BOARD_OFFSET_Y,
    BOARD_AREA_HEIGHT,
    DRAG_VISUAL_OFFSET_Y,
    getQueueItemRect,
} from './constants';
import { GAMEPLAY_CONFIG, ANIMATION_CONFIG, getPulseThreshold, getExplosionThreshold } from './config';
import { SYSTEM_FONT_STACK } from './fontConfig';

/**
 * Renderer class handles all canvas drawing operations
 */
export class Renderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private settings: GameSettings;
    private finalBoardState: PlacedBlock[] | null = null; // Final board state stored when game over starts
    private finalTotalShapesPlaced: number = 0; // Total shapes placed when game ended (for point value calculation)
    private finalScore: number = 0; // Final score when game ended
    private finalLinesCleared: number = 0; // Final lines cleared when game ended
    private finalLevel: number = 1; // Final level when game ended
    private finalMode: 'easy' | 'hard' = 'easy'; // Final mode when game ended
    private currentLevel: number = 1;
    private blockIconImage: HTMLImageElement | null = null;
    private blockIconLoaded: boolean = false;
    private copyLinkBounds: { x: number; y: number; width: number; height: number } | null = null; // Bounds for share link click detection
    private copyLinkText: string = 'Share'; // Current text for share link
    private devicePixelRatio: number = 1; // Device pixel ratio for high-DPI display support

    constructor(canvas: HTMLCanvasElement, settings: GameSettings) {
        this.canvas = canvas;
        this.settings = { ...settings };
        
        // Handle high-DPI displays (Retina, high-DPI mobile)
        // Scale canvas internal resolution while keeping CSS size at logical pixels
        this.devicePixelRatio = window.devicePixelRatio || 1;
        
        // Set canvas internal resolution (physical pixels)
        this.canvas.width = CANVAS_WIDTH * this.devicePixelRatio;
        this.canvas.height = CANVAS_HEIGHT * this.devicePixelRatio;
        
        // Set CSS size to logical pixels (maintains consistent display size)
        // Note: This may be overridden by responsive canvas sizing in main.ts
        this.canvas.style.width = `${CANVAS_WIDTH}px`;
        this.canvas.style.height = `${CANVAS_HEIGHT}px`;
        
        const context = this.canvas.getContext('2d');
        if (!context) {
            throw new Error('Could not get 2D rendering context');
        }
        this.ctx = context;
        
        // Scale context to match devicePixelRatio
        // This allows all drawing operations to use logical pixel coordinates
        this.ctx.scale(this.devicePixelRatio, this.devicePixelRatio);
        
        // Load block icon
        this.loadBlockIcon();
        
        // Set up copy link click handler
        // Convert mouse position to logical coordinates (divide by devicePixelRatio since canvas.width is scaled)
        this.canvas.addEventListener('click', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            // Convert to logical coordinates (CSS pixel space, not physical pixels)
            const x = (e.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
            const y = (e.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
            if (this.isPointInCopyLink(x, y)) {
                this.shareEmojiBoard().then(success => {
                    if (success) {
                        // Change text to "shared" for visual feedback
                        this.copyLinkText = '✓ Shared';
                        // Reset back to "Share" after 2 seconds
                        setTimeout(() => {
                            this.copyLinkText = 'Share';
                        }, 2000);
                    }
                });
            }
        });
        
        // Also handle touch events for mobile
        this.canvas.addEventListener('touchend', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const touch = e.changedTouches[0];
            // Convert to logical coordinates (CSS pixel space, not physical pixels)
            const x = (touch.clientX - rect.left) * (CANVAS_WIDTH / rect.width);
            const y = (touch.clientY - rect.top) * (CANVAS_HEIGHT / rect.height);
            if (this.isPointInCopyLink(x, y)) {
                e.preventDefault();
                this.shareEmojiBoard().then(success => {
                    if (success) {
                        // Change text to "shared" for visual feedback
                        this.copyLinkText = '✓ Shared';
                        // Reset back to "Share" after 2 seconds
                        setTimeout(() => {
                            this.copyLinkText = 'Share';
                        }, 2000);
                    }
                });
            }
        });
    }

    /**
     * Loads the Tabler Icons square icon as an image for use on blocks
     */
    private loadBlockIcon(): void {
        // Tabler Icons square icon - filled version using white fill that we'll colorize
        const svgString = `
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="white" stroke="white" stroke-width="1">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" fill="white" stroke="white"/>
            </svg>
        `;
        
        const img = new Image();
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        img.onload = () => {
            this.blockIconImage = img;
            this.blockIconLoaded = true;
            if (this.settings.devMode) {
                console.log('[RENDERER] Block icon loaded successfully');
            }
            URL.revokeObjectURL(url);
        };
        
        img.onerror = (error) => {
            console.error('[RENDERER] Failed to load block icon:', error);
            this.blockIconLoaded = true; // Mark as loaded even on error to prevent retries
            URL.revokeObjectURL(url);
        };
        
        img.src = url;
    }

    /**
     * Updates the rendering settings
     * @param settings - latest settings to apply
     */
    updateSettings(settings: GameSettings): void {
        this.settings = { ...settings };
    }

    /**
     * Gets a CSS variable value from the document body (where theme is applied)
     */
    private getCSSVariable(name: string): string {
        // Try multiple methods to get the CSS variable
        // First try body (which has data-theme attribute)
        const body = document.body;
        if (body) {
            const value = getComputedStyle(body).getPropertyValue(name).trim();
            if (value) return value;
        }
        
        // Try :root as fallback
        const root = document.documentElement;
        let value = getComputedStyle(root).getPropertyValue(name).trim();
        if (value) return value;
        
        // If still empty, try reading directly from body's style attribute or computed style
        // This handles cases where the variable might be set but not immediately available
        if (body) {
            // Force a reflow to ensure styles are computed
            void body.offsetHeight;
            value = getComputedStyle(body).getPropertyValue(name).trim();
            if (value) return value;
        }
        
        return '';
    }

    /**
     * Adjusts a hex color based on darkness factor and theme
     * For light themes: darkens by multiplying RGB values by darkness factor
     * For dark themes: lightens by interpolating toward white
     * @param hexColor - Hex color string (e.g., "#ff0000")
     * @param darkness - Darkness multiplier (1.0 = full brightness, 0.0 = black/white depending on theme)
     * @returns Adjusted hex color string
     */
    private darkenColor(hexColor: string, darkness: number): string {
        // Clamp darkness between 0 and 1
        const factor = Math.max(0, Math.min(1, darkness));
        
        // Remove # if present
        const hex = hexColor.replace('#', '');
        
        // Parse RGB values
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        // Darken by multiplying by darkness factor
        // When darkness = 1.0, use original color
        // When darkness = 0.0, use black (0, 0, 0)
        const adjustedR = Math.floor(r * factor);
        const adjustedG = Math.floor(g * factor);
        const adjustedB = Math.floor(b * factor);
        
        // Convert back to hex
        return `#${adjustedR.toString(16).padStart(2, '0')}${adjustedG.toString(16).padStart(2, '0')}${adjustedB.toString(16).padStart(2, '0')}`;
    }

    /**
     * Blends two hex colors together
     * @param color1 - First color (hex string)
     * @param color2 - Second color (hex string)
     * @param blendFactor - Blend factor from 0 to 1 (0 = all color1, 1 = all color2)
     * @returns Blended color as hex string
     */
    private blendColors(color1: string, color2: string, blendFactor: number): string {
        const factor = Math.max(0, Math.min(1, blendFactor));
        
        // Remove # if present
        const hex1 = color1.replace('#', '');
        const hex2 = color2.replace('#', '');
        
        // Parse RGB values
        const r1 = parseInt(hex1.substring(0, 2), 16);
        const g1 = parseInt(hex1.substring(2, 4), 16);
        const b1 = parseInt(hex1.substring(4, 6), 16);
        
        const r2 = parseInt(hex2.substring(0, 2), 16);
        const g2 = parseInt(hex2.substring(2, 4), 16);
        const b2 = parseInt(hex2.substring(4, 6), 16);
        
        // Blend colors
        const blendedR = Math.floor(r1 * (1 - factor) + r2 * factor);
        const blendedG = Math.floor(g1 * (1 - factor) + g2 * factor);
        const blendedB = Math.floor(b1 * (1 - factor) + b2 * factor);
        
        // Convert back to hex
        return `#${blendedR.toString(16).padStart(2, '0')}${blendedG.toString(16).padStart(2, '0')}${blendedB.toString(16).padStart(2, '0')}`;
    }

    /**
     * Clears the entire canvas and fills with background color
     */
    clear(): void {
        // Use logical dimensions since context is scaled by devicePixelRatio
        this.ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }

    /**
     * Resets the final board state (called when game resets)
     */
    resetFinalBoardSnapshot(): void {
        this.finalBoardState = null;
        this.finalTotalShapesPlaced = 0;
        this.finalScore = 0;
        this.finalLinesCleared = 0;
        this.finalLevel = 1;
        this.finalMode = 'easy';
        this.copyLinkBounds = null;
        this.copyLinkText = 'Share'; // Reset share link text
    }

    /**
     * Checks if a point is within the copy link bounds
     */
    isPointInCopyLink(x: number, y: number): boolean {
        if (!this.copyLinkBounds) return false;
        return x >= this.copyLinkBounds.x &&
               x <= this.copyLinkBounds.x + this.copyLinkBounds.width &&
               y >= this.copyLinkBounds.y &&
               y <= this.copyLinkBounds.y + this.copyLinkBounds.height;
    }

    /**
     * Generates a 4x4 emoji representation of the final board state with 4 distinct colors
     * Uses the convertTo4x4Grid logic to map 8x8 to 4x4
     */
    generateEmojiBoard(): string {
        if (!this.finalBoardState || this.finalBoardState.length === 0) {
            return '';
        }

        // Get the 4x4 grid representation
        const grid4x4 = this.convertTo4x4Grid();
        
        // Get the color set for the final level
        const colorSet = getColorSet(this.finalLevel);
        
        // Find the darkest color in the color set (lowest brightness)
        const getBrightness = (hex: string): number => {
            const r = parseInt(hex.substring(1, 3), 16);
            const g = parseInt(hex.substring(3, 5), 16);
            const b = parseInt(hex.substring(5, 7), 16);
            // Calculate relative luminance (simplified brightness)
            return (r * 299 + g * 587 + b * 114) / 1000;
        };
        
        let darkestColor = colorSet.colors[0];
        let darkestBrightness = getBrightness(darkestColor);
        for (const color of colorSet.colors) {
            const brightness = getBrightness(color);
            if (brightness < darkestBrightness) {
                darkestBrightness = brightness;
                darkestColor = color;
            }
        }
        
        // Convert darkest color to HSL to determine hue
        const hex = darkestColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;
        
        let h = 0;
        if (delta !== 0) {
            if (max === r) {
                h = ((g - b) / delta) % 6;
            } else if (max === g) {
                h = (b - r) / delta + 2;
            } else {
                h = (r - g) / delta + 4;
            }
        }
        h = Math.round(h * 60);
        if (h < 0) h += 360;
        
        // Map hue to closest emoji square color
        // This ensures the 4-block emoji matches the darkest color's hue
        let levelEmoji: string;
        if ((h >= 0 && h < 30) || (h >= 330 && h <= 360)) {
            levelEmoji = '🟥'; // Red
        } else if (h >= 30 && h < 60) {
            levelEmoji = '🟧'; // Orange
        } else if (h >= 60 && h < 90) {
            levelEmoji = '🟨'; // Yellow
        } else if (h >= 90 && h < 150) {
            levelEmoji = '🟩'; // Green
        } else if (h >= 150 && h < 210) {
            levelEmoji = '🟦'; // Cyan/Blue
        } else if (h >= 210 && h < 250) {
            levelEmoji = '🟦'; // Blue
        } else if (h >= 250 && h < 330) {
            levelEmoji = '🟪'; // Purple/Magenta (includes purple hues around 260-300)
        } else {
            levelEmoji = '🟪'; // Purple (fallback for 330-360, though red handles most of this)
        }
        
        // Map fill count to emoji: 0-1 blocks = white, 2-3 blocks = gray, 4 blocks = unique level emoji
        const getEmojiForFillCount = (fillCount: number): string => {
            if (fillCount === 0 || fillCount === 1) {
                return '⬜'; // White (0-1 blocks)
            } else if (fillCount === 2 || fillCount === 3) {
                return '⬛'; // Gray/Black (2-3 blocks)
            } else {
                // 4 blocks = unique emoji for this level
                return levelEmoji;
            }
        };

        // Convert 4x4 grid to emoji string
        let emojiString = '';
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                const cell = grid4x4[r][c];
                emojiString += getEmojiForFillCount(cell.fillCount);
            }
            emojiString += '\n';
        }

        // Add score, lines, level, and mode
        emojiString += `\nScore: ${this.finalScore.toLocaleString()}\n`;
        emojiString += `Lines: ${this.finalLinesCleared.toLocaleString()}\n`;
        emojiString += `Level: ${this.finalLevel}\n`;
        emojiString += `Mode: ${this.finalMode.charAt(0).toUpperCase() + this.finalMode.slice(1)}`;

        return emojiString;
    }

    /**
     * Copies the emoji board representation to clipboard
     */
    async copyEmojiBoard(): Promise<boolean> {
        const emojiString = this.generateEmojiBoard();
        if (!emojiString) return false;

        try {
            await navigator.clipboard.writeText(emojiString);
            return true;
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = emojiString;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                document.body.removeChild(textArea);
                return true;
            } catch (fallbackErr) {
                document.body.removeChild(textArea);
                return false;
            }
        }
    }

    /**
     * Shares the emoji board representation using Web Share API on mobile, or clipboard on desktop
     */
    async shareEmojiBoard(): Promise<boolean> {
        const emojiString = this.generateEmojiBoard();
        if (!emojiString) return false;

        // Check if Web Share API is available (typically on mobile)
        if (navigator.share) {
            try {
                await navigator.share({
                    text: emojiString
                });
                return true;
            } catch (err) {
                // User cancelled or share failed, fall back to clipboard
                if ((err as Error).name !== 'AbortError') {
                    console.warn('Share failed, falling back to clipboard:', err);
                } else {
                    // User cancelled, don't treat as error
                    return false;
                }
            }
        }

        // Fallback to clipboard on desktop or if share fails
        return this.copyEmojiBoard();
    }

    /**
     * Draws the 8x8 game grid
     */
    drawGrid(): void {
        // Get grid color from CSS variable (theme-aware)
        // Try multiple times to ensure we get the correct value on responsive designs
        let gridColor = this.getCSSVariable('--grid-color');
        if (!gridColor) {
            // Force a small delay and retry (helps with responsive design timing)
            gridColor = this.getCSSVariable('--grid-color');
        }
        // Fallback to light gray if still not found
        if (!gridColor) {
            gridColor = '#e0e0e0';
        }
        this.ctx.strokeStyle = gridColor;
        this.ctx.lineWidth = 1;

        // Draw vertical lines (offset by BOARD_OFFSET_X to center the board)
        for (let x = 0; x <= 8; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(BOARD_OFFSET_X + x * CELL_SIZE, BOARD_OFFSET_Y);
            this.ctx.lineTo(BOARD_OFFSET_X + x * CELL_SIZE, BOARD_OFFSET_Y + BOARD_PIXEL_SIZE);
            this.ctx.stroke();
        }

        // Draw horizontal lines (offset by BOARD_OFFSET_X to center the board)
        for (let y = 0; y <= 8; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(BOARD_OFFSET_X, BOARD_OFFSET_Y + y * CELL_SIZE);
            this.ctx.lineTo(BOARD_OFFSET_X + BOARD_PIXEL_SIZE, BOARD_OFFSET_Y + y * CELL_SIZE);
            this.ctx.stroke();
        }
    }

    /**
     * Draws all placed blocks on the board
     * @param board - The game board (to check if cells are actually filled)
     * @param placedBlocks - Array of all placed blocks
     * @param animatingCells - Array of cells currently animating out
     * @param totalShapesPlaced - Total shapes placed (for calculating current point values)
     */
    drawBoard(board: Board, placedBlocks: PlacedBlock[], animatingCells: AnimatingCell[] = [], totalShapesPlaced: number = 0, hoverPosition: Position | null = null): void {
        // Draw placed blocks, but skip cells that are animating or have been cleared from the board
        for (const block of placedBlocks) {
            const cellsToDraw = block.shape.filter(cell => {
                const absoluteX = block.position.x + cell.x;
                const absoluteY = block.position.y + cell.y;
                // Skip cells that are currently animating
                if (animatingCells.some(ac => ac.x === absoluteX && ac.y === absoluteY)) {
                    return false;
                }
                // Skip cells that have been cleared from the board (prevents brief reappearance after animation)
                if (board.isCellEmpty({ x: absoluteX, y: absoluteY })) {
                    return false;
                }
                return true;
            });
            
            if (cellsToDraw.length > 0) {
                // Calculate point value: base value + line clear bonuses + level increments
                // Oldest blocks (placed earliest) will have the highest values
                const placementLevel = Math.floor(block.totalShapesPlacedAtPlacement / GAMEPLAY_CONFIG.shapesPerValueTier);
                const currentLevel = Math.floor(totalShapesPlaced / GAMEPLAY_CONFIG.shapesPerValueTier);
                
                // Each block increments by points per tier for every tier of shapes placed after it was placed
                const levelIncrements = currentLevel - placementLevel;
                const displayValue = block.pointValue + block.lineClearBonuses + (levelIncrements * GAMEPLAY_CONFIG.pointsPerTier);
                
                // Apply darkness to color
                let darkenedColor = this.darkenColor(block.color, block.darkness);
                
                // Apply pulsing effect if value >= pulse threshold (skip for explosion-only blocks)
                const isExplosionOnly = block.explosionOnly ?? false;
                const pulseThreshold = getPulseThreshold(this.settings.mode);
                const explosionThreshold = getExplosionThreshold(this.settings.mode);
                const shouldPulse = !isExplosionOnly && displayValue >= pulseThreshold;
                const willExplode = !isExplosionOnly && displayValue >= explosionThreshold;
                
                if (shouldPulse) {
                    // In hard mode, pulsing takes half the time
                    const pulseCycleMs = this.settings.mode === 'hard' 
                        ? ANIMATION_CONFIG.pulseCycleMs / 2 
                        : ANIMATION_CONFIG.pulseCycleMs;
                    const pulseProgress = (Date.now() % pulseCycleMs) / pulseCycleMs;
                    // Pulse between 0.7 and 1.0 brightness using sine wave
                    const pulseBrightness = 0.7 + (Math.sin(pulseProgress * Math.PI * 2) * 0.15 + 0.15);
                    // Interpolate between current darkness and full brightness (1.0) based on pulseBrightness
                    // When pulseBrightness is 1.0, use full brightness; when 0.7, use current darkness
                    const pulsedDarkness = block.darkness + (1.0 - block.darkness) * (pulseBrightness - 0.7) / 0.3;
                    darkenedColor = this.darkenColor(block.color, pulsedDarkness);
                    
                    // If block will explode, incorporate red into the pulsing color
                    if (willExplode) {
                        // Blend red with the current color based on pulse brightness
                        // More red when pulse is brighter (at peak of pulse)
                        const redIntensity = (pulseBrightness - 0.7) / 0.3; // 0 to 1 as pulse goes from 0.7 to 1.0
                        const redColor = '#ff0000';
                        darkenedColor = this.blendColors(darkenedColor, redColor, redIntensity * 0.5); // Blend up to 50% red
                    }
                }
                
                // Draw only the non-animating cells with incremented point values
                // Pass explosionOnly flag so X can be drawn instead of point value
                this.drawShape(cellsToDraw, block.position, darkenedColor, false, isExplosionOnly ? undefined : displayValue, isExplosionOnly);
            }
        }
        
        // Draw animating cells with animation effect
        for (const cell of animatingCells) {
            this.drawAnimatingCell(cell);
        }
        
        // Draw hover point value if showPointValues is false and hovering over a block
        if (!this.settings.showPointValues && hoverPosition !== null) {
            // Find which block contains the hovered cell
            for (const block of placedBlocks) {
                for (const cell of block.shape) {
                    const absoluteX = block.position.x + cell.x;
                    const absoluteY = block.position.y + cell.y;
                    
                    // Check if this cell matches the hover position
                    if (absoluteX === hoverPosition.x && absoluteY === hoverPosition.y) {
                        // Skip if cell is animating or cleared
                        if (animatingCells.some(ac => ac.x === absoluteX && ac.y === absoluteY)) {
                            continue;
                        }
                        if (board.isCellEmpty({ x: absoluteX, y: absoluteY })) {
                            continue;
                        }
                        
                        // Calculate current point value for this block
                        const placementLevel = Math.floor(block.totalShapesPlacedAtPlacement / GAMEPLAY_CONFIG.shapesPerValueTier);
                        const currentLevel = Math.floor(totalShapesPlaced / GAMEPLAY_CONFIG.shapesPerValueTier);
                        const levelIncrements = currentLevel - placementLevel;
                        const displayValue = block.pointValue + block.lineClearBonuses + (levelIncrements * GAMEPLAY_CONFIG.pointsPerTier);
                        
                        // Calculate canvas position for this cell
                        const x = BOARD_OFFSET_X + absoluteX * CELL_SIZE;
                        const y = BOARD_OFFSET_Y + absoluteY * CELL_SIZE;
                        
                        // Apply darkness to color
                        let darkenedColor = this.darkenColor(block.color, block.darkness);
                        
                        // Check if this is an explosion-only block
                        const isExplosionOnly = block.explosionOnly ?? false;
                        
                        // Apply pulsing effect if value >= pulse threshold (skip for explosion-only blocks)
                        const pulseThreshold = getPulseThreshold(this.settings.mode);
                        const explosionThreshold = getExplosionThreshold(this.settings.mode);
                        const shouldPulse = !isExplosionOnly && displayValue >= pulseThreshold;
                        const willExplode = !isExplosionOnly && displayValue >= explosionThreshold;
                        
                        if (shouldPulse) {
                            const pulseCycleMs = this.settings.mode === 'hard' 
                                ? ANIMATION_CONFIG.pulseCycleMs / 2 
                                : ANIMATION_CONFIG.pulseCycleMs;
                            const pulseProgress = (Date.now() % pulseCycleMs) / pulseCycleMs;
                            const pulseBrightness = 0.7 + (Math.sin(pulseProgress * Math.PI * 2) * 0.15 + 0.15);
                            const pulsedDarkness = block.darkness + (1.0 - block.darkness) * (pulseBrightness - 0.7) / 0.3;
                            darkenedColor = this.darkenColor(block.color, pulsedDarkness);
                            
                            // If block will explode, incorporate red into the pulsing color
                            if (willExplode) {
                                // Blend red with the current color based on pulse brightness
                                // More red when pulse is brighter (at peak of pulse)
                                const redIntensity = (pulseBrightness - 0.7) / 0.3; // 0 to 1 as pulse goes from 0.7 to 1.0
                                const redColor = '#ff0000';
                                darkenedColor = this.blendColors(darkenedColor, redColor, redIntensity * 0.5); // Blend up to 50% red
                            }
                        }
                        
                        // Draw X for explosion-only blocks, or point value for normal blocks
                        const blockX = x + 2;
                        const blockY = y + 2;
                        const blockSize = CELL_SIZE - 4;
                        
                        if (isExplosionOnly) {
                            // Draw X on explosion-only blocks
                            this.drawX(blockX, blockY, blockSize, darkenedColor);
                        } else {
                            // Draw point value on hovered cell
                            const centerX = Math.round(blockX + blockSize / 2);
                            const centerY = Math.round(blockY + blockSize / 2);
                            
                            const textColor = this.getContrastTextColor(darkenedColor);
                            this.ctx.fillStyle = textColor;
                            const fontSize = Math.floor(CELL_SIZE * 0.65);
                            this.ctx.font = `bold ${fontSize}px ${SYSTEM_FONT_STACK}`;
                            this.ctx.textAlign = 'center';
                            this.ctx.textBaseline = 'middle';
                            this.ctx.fillText(
                                displayValue.toString(),
                                centerX,
                                centerY
                            );
                        }
                        
                        // Only draw for the first matching cell (in case of overlap)
                        return;
                    }
                }
            }
        }
    }

    /**
     * Draws a single block with Heroicons icon overlay
     * @param blockX - X position of the block
     * @param blockY - Y position of the block
     * @param blockSize - Size of the block
     * @param color - Color to use for the block
     * @param borderColor - Color for the border (defaults to '#333')
     */
    private drawBlock(blockX: number, blockY: number, blockSize: number, color: string): void {
        // Draw the icon instead of a filled rectangle
        if (this.blockIconLoaded && this.blockIconImage) {
            this.ctx.save();
            
            // Make icon slightly bigger (110% of block size)
            const iconScale = 1.1;
            const iconSize = blockSize * iconScale;
            const iconX = blockX - (iconSize - blockSize) / 2;
            const iconY = blockY - (iconSize - blockSize) / 2;
            
            // Create a temporary canvas to colorize the icon
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = iconSize;
            tempCanvas.height = iconSize;
            const tempCtx = tempCanvas.getContext('2d');
            
            if (tempCtx) {
                // Draw the white icon to temp canvas
                tempCtx.drawImage(this.blockIconImage, 0, 0, iconSize, iconSize);
                
                // Colorize: use source-atop to fill with color where icon is opaque
                tempCtx.globalCompositeOperation = 'source-atop';
                tempCtx.fillStyle = color;
                tempCtx.fillRect(0, 0, iconSize, iconSize);
                
                // Draw the colorized icon to the main canvas
                this.ctx.drawImage(tempCanvas, iconX, iconY);
            } else {
                // Fallback if temp canvas fails
                this.ctx.fillStyle = color;
                this.ctx.fillRect(blockX, blockY, blockSize, blockSize);
            }
            
            this.ctx.restore();
        } else {
            // Fallback: draw filled rectangle if icon not loaded yet
            this.ctx.fillStyle = color;
            this.ctx.fillRect(blockX, blockY, blockSize, blockSize);
        }
    }

    /**
     * Draws an X mark on a block (for explosion-only blocks)
     * @param blockX - X position of the block
     * @param blockY - Y position of the block
     * @param blockSize - Size of the block
     * @param color - Background color of the block (for contrast calculation)
     */
    private drawX(blockX: number, blockY: number, blockSize: number, color: string): void {
        this.ctx.save();
        
        // Calculate center and size of X
        const centerX = Math.round(blockX + blockSize / 2);
        const centerY = Math.round(blockY + blockSize / 2);
        const xSize = blockSize * 0.5; // X size is 50% of block size
        const lineWidth = Math.max(2, Math.floor(blockSize * 0.1)); // Line width scales with block size
        
        // Get contrasting color for X
        const xColor = this.getContrastTextColor(color);
        this.ctx.strokeStyle = xColor;
        this.ctx.lineWidth = lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        // Draw X as two diagonal lines
        this.ctx.beginPath();
        // Top-left to bottom-right
        this.ctx.moveTo(centerX - xSize / 2, centerY - xSize / 2);
        this.ctx.lineTo(centerX + xSize / 2, centerY + xSize / 2);
        // Top-right to bottom-left
        this.ctx.moveTo(centerX + xSize / 2, centerY - xSize / 2);
        this.ctx.lineTo(centerX - xSize / 2, centerY + xSize / 2);
        this.ctx.stroke();
        
        this.ctx.restore();
    }

    /**
     * Draws a shape at a given position
     * @param shape - The shape to draw
     * @param position - Grid position where to draw
     * @param color - Color to use for the shape
     * @param isGhost - Whether to draw as a ghost (semi-transparent)
     * @param pointValue - Optional point value to display on each cell
     * @param isExplosionOnly - Whether this is an explosion-only block (draws X instead of point value)
     */
    drawShape(shape: Shape, position: Position, color: string, isGhost: boolean = false, pointValue?: number, isExplosionOnly: boolean = false): void {
        if (isGhost) {
            // Ghost preview: draw with outline style for better visibility
            this.ctx.globalAlpha = 0.3; // More transparent than before
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 3;
            this.ctx.setLineDash([4, 4]); // Dashed outline pattern
            
            for (const block of shape) {
                const x = BOARD_OFFSET_X + (position.x + block.x) * CELL_SIZE;
                const y = BOARD_OFFSET_Y + (position.y + block.y) * CELL_SIZE;
                const blockX = x + 2;
                const blockY = y + 2;
                const blockSize = CELL_SIZE - 4;

                // Draw filled block with low opacity
                this.ctx.fillStyle = color;
                this.ctx.fillRect(blockX, blockY, blockSize, blockSize);
                
                // Draw dashed outline for better visibility
                this.ctx.strokeRect(blockX, blockY, blockSize, blockSize);
            }
            
            // Reset line dash
            this.ctx.setLineDash([]);
            this.ctx.globalAlpha = 1.0;
        } else {
            this.ctx.globalAlpha = 1.0;

            for (const block of shape) {
                const x = BOARD_OFFSET_X + (position.x + block.x) * CELL_SIZE;
                const y = BOARD_OFFSET_Y + (position.y + block.y) * CELL_SIZE;
                const blockX = x + 2;
                const blockY = y + 2;
                const blockSize = CELL_SIZE - 4;

                this.drawBlock(blockX, blockY, blockSize, color);

                // Draw X for explosion-only blocks, or point value if provided and setting is enabled
                if (isExplosionOnly) {
                    // Draw X on explosion-only blocks
                    this.drawX(blockX, blockY, blockSize, color);
                } else if (pointValue !== undefined && this.settings.showPointValues) {
                    // Calculate center of the filled block (accounting for 2px padding)
                    const blockX = x + 2;
                    const blockY = y + 2;
                    const blockSize = CELL_SIZE - 4;
                    // Snap text position to integer pixels to prevent subpixel blur
                    const centerX = Math.round(blockX + blockSize / 2);
                    const centerY = Math.round(blockY + blockSize / 2);
                    
                    // Select text color for maximum WCAG contrast against block color
                    // Uses relative luminance to choose black or white
                    const textColor = this.getContrastTextColor(color);
                    this.ctx.fillStyle = textColor;
                    // Font size should be slightly smaller (about 65% of cell size)
                    const fontSize = Math.floor(CELL_SIZE * 0.65);
                    this.ctx.font = `bold ${fontSize}px ${SYSTEM_FONT_STACK}`;
                    
                    // Set text alignment for perfect centering
                    this.ctx.textAlign = 'center';
                    this.ctx.textBaseline = 'middle';
                    
                    // Draw text at integer pixel position
                    this.ctx.fillText(
                        pointValue.toString(),
                        centerX,
                        centerY
                    );
                }
            }
        }
    }

    /**
     * Calculates the optimal text color (black or white) for maximum WCAG contrast
     * against a given background color using relative luminance.
     * @param backgroundColor - Hex color string (e.g., "#ff0000")
     * @returns '#000000' (black) or '#ffffff' (white) based on which has higher contrast
     */
    private getContrastTextColor(backgroundColor: string): string {
        const hex = backgroundColor.replace('#', '');
        
        // Parse RGB values
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;
        
        // Convert to linear RGB (sRGB to linear)
        const linearR = r <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
        const linearG = g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
        const linearB = b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
        
        // Calculate relative luminance (WCAG formula)
        const luminance = 0.2126 * linearR + 0.7152 * linearG + 0.0722 * linearB;
        
        // Calculate contrast ratios against black (0) and white (1)
        // Contrast ratio = (L1 + 0.05) / (L2 + 0.05) where L1 > L2
        const contrastWithWhite = (1 + 0.05) / (luminance + 0.05);
        const contrastWithBlack = (luminance + 0.05) / (0 + 0.05);
        
        // Return the color with higher contrast ratio
        return contrastWithBlack > contrastWithWhite ? '#000000' : '#ffffff';
    }

    /**
     * Calculates a complementary color for a given hex color
     * @param hexColor - Hex color string (e.g., "#ff0000")
     * @returns Object with highlight and border colors (complementary to the input color)
     */
    private getComplementaryColor(hexColor: string): { highlight: string; border: string } {
        const hex = hexColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;
        
        let h = 0;
        if (delta > 0.01) { // Only calculate hue if color is not too desaturated
            if (max === r) {
                h = ((g - b) / delta) % 6;
            } else if (max === g) {
                h = (b - r) / delta + 2;
            } else {
                h = (r - g) / delta + 4;
            }
            h = h * 60;
            if (h < 0) h += 360;
        } else {
            // For grayscale colors, use a default hue
            h = 200; // Blue-ish
        }
        
        // Calculate complementary color (opposite on color wheel, shifted 180 degrees)
        const complementaryHue = (h + 180) % 360;
        
        // Convert to HSL and create a bright, saturated highlight color
        // Use high saturation (80-90%) and medium-high lightness (60-70%) for visibility
        const saturation = 85;
        const lightness = 65;
        
        return this.hslToHex(complementaryHue, saturation, lightness);
    }
    
    /**
     * Converts HSL to hex color
     * @param h - Hue (0-360)
     * @param s - Saturation (0-100)
     * @param l - Lightness (0-100)
     * @returns Object with highlight and border colors (border is slightly darker)
     */
    private hslToHex(h: number, s: number, l: number): { highlight: string; border: string } {
        s /= 100;
        l /= 100;
        
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const x = c * (1 - Math.abs((h / 60) % 2 - 1));
        const m = l - c / 2;
        let r = 0, g = 0, b = 0;
        
        if (0 <= h && h < 60) {
            r = c; g = x; b = 0;
        } else if (60 <= h && h < 120) {
            r = x; g = c; b = 0;
        } else if (120 <= h && h < 180) {
            r = 0; g = c; b = x;
        } else if (180 <= h && h < 240) {
            r = 0; g = x; b = c;
        } else if (240 <= h && h < 300) {
            r = x; g = 0; b = c;
        } else if (300 <= h && h < 360) {
            r = c; g = 0; b = x;
        }
        
        const toHex = (n: number) => {
            const val = Math.round((n + m) * 255);
            return val.toString(16).padStart(2, '0');
        };
        
        const highlight = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
        
        // Border is slightly darker (reduce lightness by 15%)
        const borderL = Math.max(0, l - 0.15);
        const borderC = (1 - Math.abs(2 * borderL - 1)) * s;
        const borderX = borderC * (1 - Math.abs((h / 60) % 2 - 1));
        
        let borderR = 0, borderG = 0, borderB = 0;
        if (0 <= h && h < 60) {
            borderR = borderC; borderG = borderX; borderB = 0;
        } else if (60 <= h && h < 120) {
            borderR = borderX; borderG = borderC; borderB = 0;
        } else if (120 <= h && h < 180) {
            borderR = 0; borderG = borderC; borderB = borderX;
        } else if (180 <= h && h < 240) {
            borderR = 0; borderG = borderX; borderB = borderC;
        } else if (240 <= h && h < 300) {
            borderR = borderX; borderG = 0; borderB = borderC;
        } else if (300 <= h && h < 360) {
            borderR = borderC; borderG = 0; borderB = borderX;
        }
        
        const border = `#${toHex(borderR)}${toHex(borderG)}${toHex(borderB)}`;
        
        return { highlight, border };
    }

    /**
     * Draws highlight overlay for lines/columns that would be cleared if shape is placed
     * Each block gets its own complementary color highlight
     * @param previewLines - Object containing rows and columns that would be cleared
     * @param placedBlocks - All placed blocks on the board (to find which block occupies each cell)
     */
    private drawPreviewLineHighlights(previewLines: { rows: number[]; columns: number[] }, placedBlocks: PlacedBlock[]): void {
        if (previewLines.rows.length === 0 && previewLines.columns.length === 0) {
            return;
        }

        this.ctx.save();
        
        // Use a more obvious pulsing highlight effect
        const pulseProgress = (Date.now() % 800) / 800;
        const pulseAlpha = 0.5 + Math.sin(pulseProgress * Math.PI * 2) * 0.2; // Pulse between 0.3 and 0.7
        
        // Create a map of cell positions to block colors for quick lookup
        const cellColorMap = new Map<string, string>();
        for (const block of placedBlocks) {
            for (const cell of block.shape) {
                const absoluteX = block.position.x + cell.x;
                const absoluteY = block.position.y + cell.y;
                const key = `${absoluteX},${absoluteY}`;
                cellColorMap.set(key, block.color);
            }
        }
        
        // Draw highlight with glow effect for blocks only (no text affected)
        // Shadow blur = 10 is acceptable here as it only affects block icons, not text
        this.ctx.shadowBlur = 10;
        
        // Highlight individual cells in full rows
        for (const row of previewLines.rows) {
            for (let x = 0; x < BOARD_CELL_COUNT; x++) {
                const key = `${x},${row}`;
                const blockColor = cellColorMap.get(key);
                
                if (blockColor && this.blockIconLoaded && this.blockIconImage) {
                    // Get complementary color for this specific block
                    const colors = this.getComplementaryColor(blockColor);
                    const highlightColor = colors.highlight;
                    const borderColor = colors.border;
                    
                    const cellX = BOARD_OFFSET_X + x * CELL_SIZE;
                    const cellY = BOARD_OFFSET_Y + row * CELL_SIZE;
                    const blockX = cellX + 2;
                    const blockY = cellY + 2;
                    const blockSize = CELL_SIZE - 4;
                    
                    // Use icon shape for highlight instead of rectangle
                    const iconScale = 1.1;
                    const iconSize = blockSize * iconScale;
                    const iconX = blockX - (iconSize - blockSize) / 2;
                    const iconY = blockY - (iconSize - blockSize) / 2;
                    
                    // Create temp canvas for highlighted icon
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = iconSize;
                    tempCanvas.height = iconSize;
                    const tempCtx = tempCanvas.getContext('2d');
                    
                    if (tempCtx) {
                        // Draw the white icon to temp canvas
                        tempCtx.drawImage(this.blockIconImage, 0, 0, iconSize, iconSize);
                        
                        // Colorize with highlight color
                        tempCtx.globalCompositeOperation = 'source-atop';
                        tempCtx.fillStyle = highlightColor;
                        tempCtx.fillRect(0, 0, iconSize, iconSize);
                        
                        // Draw highlighted icon with pulsing alpha
                        this.ctx.shadowColor = highlightColor;
                        this.ctx.shadowBlur = 10;
                        this.ctx.globalAlpha = pulseAlpha;
                        this.ctx.drawImage(tempCanvas, iconX, iconY);
                        
                        // Draw border
                        this.ctx.globalAlpha = 1.0;
                        this.ctx.strokeStyle = borderColor;
                        this.ctx.lineWidth = 3;
                        // Draw border around the icon shape (approximate with rounded rect)
                        this.ctx.beginPath();
                        this.ctx.roundRect(iconX, iconY, iconSize, iconSize, 2);
                        this.ctx.stroke();
                    }
                }
            }
        }
        
        // Highlight individual cells in full columns - only highlight filled blocks using icon shape
        for (const col of previewLines.columns) {
            for (let y = 0; y < BOARD_CELL_COUNT; y++) {
                const key = `${col},${y}`;
                const blockColor = cellColorMap.get(key);
                
                if (blockColor && this.blockIconLoaded && this.blockIconImage) {
                    // Get complementary color for this specific block
                    const colors = this.getComplementaryColor(blockColor);
                    const highlightColor = colors.highlight;
                    const borderColor = colors.border;
                    
                    const cellX = col * CELL_SIZE;
                    const cellY = y * CELL_SIZE;
                    const blockX = cellX + 2;
                    const blockY = cellY + 2;
                    const blockSize = CELL_SIZE - 4;
                    
                    // Use icon shape for highlight instead of rectangle
                    const iconScale = 1.1;
                    const iconSize = blockSize * iconScale;
                    const iconX = blockX - (iconSize - blockSize) / 2;
                    const iconY = blockY - (iconSize - blockSize) / 2;
                    
                    // Create temp canvas for highlighted icon
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = iconSize;
                    tempCanvas.height = iconSize;
                    const tempCtx = tempCanvas.getContext('2d');
                    
                    if (tempCtx) {
                        // Draw the white icon to temp canvas
                        tempCtx.drawImage(this.blockIconImage, 0, 0, iconSize, iconSize);
                        
                        // Colorize with highlight color
                        tempCtx.globalCompositeOperation = 'source-atop';
                        tempCtx.fillStyle = highlightColor;
                        tempCtx.fillRect(0, 0, iconSize, iconSize);
                        
                        // Draw highlighted icon with pulsing alpha
                        this.ctx.shadowColor = highlightColor;
                        this.ctx.shadowBlur = 10;
                        this.ctx.globalAlpha = pulseAlpha;
                        this.ctx.drawImage(tempCanvas, iconX, iconY);
                        
                        // Draw border
                        this.ctx.globalAlpha = 1.0;
                        this.ctx.strokeStyle = borderColor;
                        this.ctx.lineWidth = 3;
                        // Draw border around the icon shape (approximate with rounded rect)
                        this.ctx.beginPath();
                        this.ctx.roundRect(iconX, iconY, iconSize, iconSize, 2);
                        this.ctx.stroke();
                    }
                }
            }
        }
        
        // Reset shadow
        this.ctx.shadowBlur = 0;
        
        this.ctx.restore();
    }

    /**
     * Draws a border line between the board and queue area
     */
    private drawBoardQueueBorder(): void {
        const borderY = BOARD_AREA_HEIGHT;
        const borderColor = this.getCSSVariable('--queue-shape-border') || '#333333';
        
        this.ctx.save();
        this.ctx.strokeStyle = borderColor;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(0, borderY);
        this.ctx.lineTo(CANVAS_WIDTH, borderY);
        this.ctx.stroke();
        this.ctx.restore();
    }

    /**
     * Draws the queue of upcoming shapes beneath the board
     * @param queue - Array of shapes in the queue
     */
    drawQueue(queue: (Shape | null)[]): void {
        const queueAreaTop = BOARD_AREA_HEIGHT;

        // Get theme colors for queue area (re-read on each render to catch theme changes)
        const queueStripBg = this.getCSSVariable('--queue-strip-bg') || '#f5f5f5';
        const queueShapeBorder = this.getCSSVariable('--queue-shape-border') || '#333333';

        // Draw queue background strip with theme color
        this.ctx.fillStyle = queueStripBg;
        this.ctx.fillRect(0, queueAreaTop, CANVAS_WIDTH, QUEUE_AREA_HEIGHT);

        // Target 70% of the playing surface block size, but clamp to fit slot with padding
        const maxCellSize = CELL_SIZE * 0.7;

        // Always draw 3 fixed areas - shapes stay in their positions even when one is removed
        const QUEUE_SIZE = 3;
        for (let i = 0; i < QUEUE_SIZE; i++) {
            // Get the fixed rectangle for this queue slot (always uses QUEUE_SIZE = 3)
            const rect = getQueueItemRect(i, QUEUE_SIZE);
            
            // Only draw if there's a shape at this index and it's valid
            if (i < queue.length) {
                const shape = queue[i];
                if (!shape || shape.length === 0) {
                    continue;
                }
                const shapeColor = getShapeColor(getShapeIndex(shape));

                // Calculate shape dimensions
                const minX = Math.min(...shape.map(b => b.x));
                const maxX = Math.max(...shape.map(b => b.x));
                const minY = Math.min(...shape.map(b => b.y));
                const maxY = Math.max(...shape.map(b => b.y));
                const shapeWidth = maxX - minX + 1;
                const shapeHeight = maxY - minY + 1;

                // Compute cell size constrained by slot with small padding
                const padding = 4;
                const availableWidth = rect.width - padding * 2;
                const availableHeight = QUEUE_ITEM_HEIGHT - padding * 2;
                const cellSize = Math.min(
                    maxCellSize,
                    availableWidth / shapeWidth,
                    availableHeight / shapeHeight
                );

                // Center the shape in the fixed area using the uniform cell size
                const totalShapeWidth = shapeWidth * cellSize;
                const totalShapeHeight = shapeHeight * cellSize;
                const offsetX = rect.x + (rect.width - totalShapeWidth) / 2 - minX * cellSize;
                const offsetY = rect.y + (QUEUE_ITEM_HEIGHT - totalShapeHeight) / 2 - minY * cellSize;

                // Draw each block in the shape
                for (const block of shape) {
                    const x = offsetX + block.x * cellSize;
                    const y = offsetY + block.y * cellSize;
                    const blockSize = cellSize; // Use uniform cell size for all blocks

                    this.drawBlock(x, y, blockSize, shapeColor);
                }

                // Point values removed from queue display per user request
            }
            // If no shape at this index, the area remains empty but still occupies its fixed position
        }
    }

    /**
     * Draws an animating shape (snap animation from finger to final position)
     * @param animShape - The animating shape data
     */
    drawAnimatingShape(animShape: AnimatingShape): void {
        const currentTime = Date.now();
        const elapsed = currentTime - animShape.startTime;
        const progress = Math.min(elapsed / animShape.duration, 1);
        
        // Ease-out function for smooth animation
        const easeOut = (t: number): number => {
            return 1 - Math.pow(1 - t, 3); // Cubic ease-out
        };
        const easedProgress = easeOut(progress);
        
        if (animShape.type === 'place') {
            // Animate from start position to grid position
            const startX = animShape.startPosition.x;
            const startY = animShape.startPosition.y;
            
            // Calculate end position in canvas coordinates
            const minX = Math.min(...animShape.shape.map(b => b.x));
            const minY = Math.min(...animShape.shape.map(b => b.y));
            const endX = BOARD_OFFSET_X + (animShape.endPosition.x + minX) * CELL_SIZE + CELL_SIZE / 2;
            const endY = BOARD_OFFSET_Y + (animShape.endPosition.y + minY) * CELL_SIZE + CELL_SIZE / 2;
            
            // Interpolate position
            const currentX = startX + (endX - startX) * easedProgress;
            const currentY = startY + (endY - startY) * easedProgress;
            
            // Draw shape at interpolated position
            this.ctx.save();
            this.ctx.translate(currentX, currentY);
            
            // Center the shape
            const maxX = Math.max(...animShape.shape.map(b => b.x));
            const maxY = Math.max(...animShape.shape.map(b => b.y));
            const shapeWidth = (maxX - minX + 1) * CELL_SIZE;
            const shapeHeight = (maxY - minY + 1) * CELL_SIZE;
            this.ctx.translate(-shapeWidth / 2, -shapeHeight / 2);
            
            // Draw with slight fade as it approaches final position
            this.ctx.globalAlpha = 0.7 + (0.3 * (1 - easedProgress));
            for (const block of animShape.shape) {
                const x = block.x * CELL_SIZE;
                const y = block.y * CELL_SIZE;
                const blockX = x + 2;
                const blockY = y + 2;
                const blockSize = CELL_SIZE - 4;
                this.drawBlock(blockX, blockY, blockSize, animShape.color);
            }
            
            this.ctx.globalAlpha = 1.0;
            this.ctx.restore();
        } else if (animShape.type === 'restore') {
            // Animate from start position back to queue
            const startX = animShape.startPosition.x;
            const startY = animShape.startPosition.y;
            
            // End position is already in canvas coordinates (from queue rect)
            const endX = animShape.endPosition.x;
            const endY = animShape.endPosition.y;
            
            // Interpolate position
            const currentX = startX + (endX - startX) * easedProgress;
            const currentY = startY + (endY - startY) * easedProgress;
            
            // Draw shape at interpolated position
            this.ctx.save();
            this.ctx.translate(currentX, currentY);
            
            // Center the shape
            const minX = Math.min(...animShape.shape.map(b => b.x));
            const minY = Math.min(...animShape.shape.map(b => b.y));
            const maxX = Math.max(...animShape.shape.map(b => b.x));
            const maxY = Math.max(...animShape.shape.map(b => b.y));
            const shapeWidth = (maxX - minX + 1) * CELL_SIZE;
            const shapeHeight = (maxY - minY + 1) * CELL_SIZE;
            this.ctx.translate(-shapeWidth / 2, -shapeHeight / 2);
            
            // Draw with fade as it approaches queue
            this.ctx.globalAlpha = 0.7 + (0.3 * (1 - easedProgress));
            for (const block of animShape.shape) {
                const x = block.x * CELL_SIZE;
                const y = block.y * CELL_SIZE;
                const blockX = x + 2;
                const blockY = y + 2;
                const blockSize = CELL_SIZE - 4;
                this.drawBlock(blockX, blockY, blockSize, animShape.color);
            }
            
            this.ctx.globalAlpha = 1.0;
            this.ctx.restore();
        }
    }

    /**
     * Draws the currently dragged shape with ghost placement preview
     * The shape is visually offset upward so it appears above the cursor/finger
     * to prevent occlusion on mobile devices. Placement logic remains unchanged.
     * @param dragState - Current drag state
     * @param smoothedPosition - Pre-smoothed visual position from DragController (optional for backward compat)
     */
    drawDragPreview(dragState: DragState, smoothedPosition?: { x: number; y: number }): void {
        if (!dragState.isDragging || !dragState.shape || !dragState.anchorPoint) {
            return;
        }

        const shapeIndex = getShapeIndex(dragState.shape);
        const color = getShapeColor(shapeIndex);

        // Calculate shape dimensions for centering
        const minX = Math.min(...dragState.shape.map(b => b.x));
        const minY = Math.min(...dragState.shape.map(b => b.y));
        const maxX = Math.max(...dragState.shape.map(b => b.x));
        const maxY = Math.max(...dragState.shape.map(b => b.y));
        const shapeWidth = (maxX - minX + 1) * CELL_SIZE;
        const shapeHeight = (maxY - minY + 1) * CELL_SIZE;
        
        // Use pre-smoothed position from DragController if provided
        // Otherwise fall back to calculating position for backward compatibility
        let effectivePosition: { x: number; y: number };
        if (smoothedPosition) {
            effectivePosition = smoothedPosition;
        } else {
            // Fallback: apply visual offset and use directly (no smoothing)
            const basePosition = dragState.projectedBoardPosition || dragState.anchorPoint;
            effectivePosition = {
                x: basePosition.x,
                y: basePosition.y + DRAG_VISUAL_OFFSET_Y
            };
        }

        // Draw the visual copy at effectivePosition
        // The shape is drawn in pixel space, centered on the effectivePosition
        this.ctx.save();
        this.ctx.translate(effectivePosition.x, effectivePosition.y);
        
        // Center the shape
        this.ctx.translate(-shapeWidth / 2, -shapeHeight / 2);
        
        // Draw each block in pixel space
        // Use red color if position is invalid, otherwise use shape color
        const drawColor = (dragState.hasBoardPosition && !dragState.isValidPosition) ? '#ff0000' : color;
        this.ctx.globalAlpha = 0.7;
        for (const block of dragState.shape) {
            const x = block.x * CELL_SIZE;
            const y = block.y * CELL_SIZE;
            const blockX = x + 2;
            const blockY = y + 2;
            const blockSize = CELL_SIZE - 4;
            this.drawBlock(blockX, blockY, blockSize, drawColor);
        }
        
        this.ctx.globalAlpha = 1.0;
        this.ctx.restore();
        
        // Draw glow around destination cells when hovering over a valid drop location
        if (dragState.hasBoardPosition && dragState.isValidPosition && dragState.mousePosition) {
            this.ctx.save();
            
            // Determine glow color based on theme (white for dark themes, black for light themes)
            const isDarkTheme = this.settings.theme === 'midnight';
            const glowColor = isDarkTheme ? '#ffffff' : '#000000';
            
            // Set up glow effect using shadow
            this.ctx.shadowBlur = 12;
            this.ctx.shadowColor = glowColor;
            this.ctx.globalAlpha = 0.6;
            this.ctx.fillStyle = glowColor;
            
            // Draw a subtle glow for each cell in the shape
            for (const block of dragState.shape) {
                const gridX = dragState.mousePosition.x + block.x;
                const gridY = dragState.mousePosition.y + block.y;
                
                // Only draw if within board bounds
                if (gridX >= 0 && gridX < BOARD_CELL_COUNT && gridY >= 0 && gridY < BOARD_CELL_COUNT) {
                    const cellX = BOARD_OFFSET_X + gridX * CELL_SIZE;
                    const cellY = BOARD_OFFSET_Y + gridY * CELL_SIZE;
                    
                    // Draw a small filled rectangle with glow
                    // Use a slightly smaller size to create a subtle inner glow effect
                    const glowSize = CELL_SIZE * 0.7;
                    const glowOffset = (CELL_SIZE - glowSize) / 2;
                    this.ctx.fillRect(
                        cellX + glowOffset,
                        cellY + glowOffset,
                        glowSize,
                        glowSize
                    );
                }
            }
            
            this.ctx.restore();
        }
    }

    /**
     * Draws an animating cell that is being removed
     * @param cell - The animating cell to draw
     */
    drawAnimatingCell(cell: AnimatingCell): void {
        const x = BOARD_OFFSET_X + cell.x * CELL_SIZE;
        const y = BOARD_OFFSET_Y + cell.y * CELL_SIZE;
        const isExplosion = cell.type === 'explosion';
        
        if (isExplosion) {
            // Explosion animation: expand and fade with particles
            // Use smooth easing for fade: ease-out curve (starts fast, ends slow)
            // This creates a smoother, more natural fade
            const easedProgress = 1 - Math.pow(1 - cell.progress, 3); // Cubic ease-out
            const alpha = 1 - easedProgress;
            const scale = 1 + cell.progress * 2; // Expand from 1x to 3x size
            
            const centerX = x + CELL_SIZE / 2;
            const centerY = y + CELL_SIZE / 2;
            const size = (CELL_SIZE - 4) * scale;
            const offsetX = (CELL_SIZE - 4 - size) / 2;
            const offsetY = (CELL_SIZE - 4 - size) / 2;
            
            this.ctx.save();
            this.ctx.globalAlpha = alpha * 0.8; // Slightly transparent
            
            // Draw expanding cell
            this.ctx.fillStyle = cell.color;
            this.ctx.beginPath();
            this.ctx.roundRect(x + 2 + offsetX, y + 2 + offsetY, size, size, 2);
            this.ctx.fill();
            
            // Draw particles (small rounded squares radiating outward)
            const particleCount = 8;
            for (let i = 0; i < particleCount; i++) {
                const angle = (i / particleCount) * Math.PI * 2;
                const distance = cell.progress * CELL_SIZE * 1.5;
                const particleX = centerX + Math.cos(angle) * distance;
                const particleY = centerY + Math.sin(angle) * distance;
                const particleSize = (CELL_SIZE - 4) * 0.3 * (1 - cell.progress);
                
                this.ctx.fillStyle = cell.color;
                this.ctx.beginPath();
                this.ctx.roundRect(particleX - particleSize / 2, particleY - particleSize / 2, particleSize, particleSize, Math.max(1, particleSize * 0.1));
                this.ctx.fill();
            }
            
            this.ctx.restore();
        } else {
            // Line clear animation - use one of 10 unique animations based on animationIndex
            const animIndex = cell.animationIndex ?? 0;
            this.drawClearAnimation(cell, x, y, animIndex);
        }
    }

    /**
     * Draws one of 20 unique clear animations based on animation index
     * @param cell - The animating cell
     * @param x - Canvas x position
     * @param y - Canvas y position
     * @param animIndex - Animation index (0-16)
     */
    private drawClearAnimation(cell: AnimatingCell, x: number, y: number, animIndex: number): void {
        const centerX = x + CELL_SIZE / 2;
        const centerY = y + CELL_SIZE / 2;
        const baseSize = CELL_SIZE - 4;
        const progress = cell.progress;
        
        this.ctx.save();
        
        switch (animIndex % 17) {
            case 0: { // Fade out and scale down (original)
                const alpha0 = 1 - progress;
                const scale0 = 1 - progress * 0.5;
                const size0 = baseSize * scale0;
                const offset0 = (baseSize - size0) / 2;
                this.ctx.globalAlpha = alpha0;
                this.ctx.fillStyle = cell.color;
                this.ctx.beginPath();
                this.ctx.roundRect(x + 2 + offset0, y + 2 + offset0, size0, size0, 2);
                this.ctx.fill();
                this.ctx.strokeStyle = '#333';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
                break;
            }
                
            case 1: { // Spin and fade
                const alpha1 = 1 - progress;
                const rotation1 = progress * Math.PI * 2;
                const scale1 = 1 - progress * 0.3;
                const size1 = baseSize * scale1;
                const offset1 = (baseSize - size1) / 2;
                this.ctx.globalAlpha = alpha1;
                this.ctx.translate(centerX, centerY);
                this.ctx.rotate(rotation1);
                this.ctx.fillStyle = cell.color;
                this.ctx.beginPath();
                this.ctx.roundRect(-size1 / 2, -size1 / 2, size1, size1, 2);
                this.ctx.fill();
                this.ctx.strokeStyle = '#333';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
                break;
            }
                
            case 2: { // Shrink to center
                const alpha2 = 1 - progress;
                const scale2 = 1 - progress;
                const size2 = baseSize * scale2;
                const offset2 = (baseSize - size2) / 2;
                this.ctx.globalAlpha = alpha2;
                this.ctx.fillStyle = cell.color;
                this.ctx.beginPath();
                this.ctx.roundRect(x + 2 + offset2, y + 2 + offset2, size2, size2, 2);
                this.ctx.fill();
                this.ctx.strokeStyle = '#333';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
                break;
            }
                
            case 3: { // Slide up and fade
                const alpha3 = 1 - progress;
                const slideY3 = -progress * CELL_SIZE;
                this.ctx.globalAlpha = alpha3;
                this.ctx.fillStyle = cell.color;
                this.ctx.beginPath();
                this.ctx.roundRect(x + 2, y + 2 + slideY3, baseSize, baseSize, 2);
                this.ctx.fill();
                this.ctx.strokeStyle = '#333';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
                break;
            }
                
            case 4: { // Expand and fade
                const alpha4 = 1 - progress;
                const scale4 = 1 + progress * 0.5;
                const size4 = baseSize * scale4;
                const offset4 = (baseSize - size4) / 2;
                this.ctx.globalAlpha = alpha4;
                this.ctx.fillStyle = cell.color;
                this.ctx.beginPath();
                this.ctx.roundRect(x + 2 + offset4, y + 2 + offset4, size4, size4, 2);
                this.ctx.fill();
                this.ctx.strokeStyle = '#333';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
                break;
            }
                
            case 5: { // Rotate 180 and shrink
                const alpha5 = 1 - progress;
                const rotation5 = progress * Math.PI;
                const scale5 = 1 - progress * 0.6;
                const size5 = baseSize * scale5;
                const offset5 = (baseSize - size5) / 2;
                this.ctx.globalAlpha = alpha5;
                this.ctx.translate(centerX, centerY);
                this.ctx.rotate(rotation5);
                this.ctx.fillStyle = cell.color;
                this.ctx.beginPath();
                this.ctx.roundRect(-size5 / 2, -size5 / 2, size5, size5, 2);
                this.ctx.fill();
                this.ctx.strokeStyle = '#333';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
                break;
            }
                
            case 6: { // Fade with pulsing scale
                const alpha6 = 1 - progress;
                const pulse6 = Math.sin(progress * Math.PI * 4) * 0.1;
                const scale6 = 1 - progress * 0.4 + pulse6;
                const size6 = baseSize * scale6;
                const offset6 = (baseSize - size6) / 2;
                this.ctx.globalAlpha = alpha6;
                this.ctx.fillStyle = cell.color;
                this.ctx.beginPath();
                this.ctx.roundRect(x + 2 + offset6, y + 2 + offset6, size6, size6, 2);
                this.ctx.fill();
                this.ctx.strokeStyle = '#333';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
                break;
            }
                
            case 7: { // Flip horizontally and fade
                const alpha = 1 - progress;
                const scaleX = 1 - progress * 2; // Flip by scaling X to negative
                const size = baseSize;
                this.ctx.globalAlpha = alpha;
                this.ctx.translate(centerX, centerY);
                this.ctx.scale(scaleX, 1);
                this.ctx.fillStyle = cell.color;
                this.ctx.beginPath();
                this.ctx.roundRect(-size / 2, -size / 2, size, size, 2);
                this.ctx.fill();
                this.ctx.strokeStyle = '#333';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
                break;
            }
                
            case 8: { // Wobble and fade
                const alpha = 1 - progress;
                const wobble = Math.sin(progress * Math.PI * 6) * progress * 5;
                const scale = 1 - progress * 0.5;
                const size = baseSize * scale;
                const offset = (baseSize - size) / 2;
                this.ctx.globalAlpha = alpha;
                this.ctx.translate(centerX + wobble, centerY);
                this.ctx.fillStyle = cell.color;
                this.ctx.beginPath();
                this.ctx.roundRect(-size / 2, -size / 2, size, size, 2);
                this.ctx.fill();
                this.ctx.strokeStyle = '#333';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
                break;
            }
                
            case 9: { // Squash and stretch
                const alpha = 1 - progress;
                const squash = Math.sin(progress * Math.PI);
                const scaleX = 1 + squash * 0.3;
                const scaleY = 1 - squash * 0.3;
                const size = baseSize;
                this.ctx.globalAlpha = alpha;
                this.ctx.translate(centerX, centerY);
                this.ctx.scale(scaleX, scaleY);
                this.ctx.fillStyle = cell.color;
                this.ctx.beginPath();
                this.ctx.roundRect(-size / 2, -size / 2, size, size, 2);
                this.ctx.fill();
                this.ctx.strokeStyle = '#333';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
                break;
            }
                
            case 10: { // Spiral out
                const alpha = 1 - progress;
                const rotation = progress * Math.PI * 3;
                const distance = progress * CELL_SIZE * 0.5;
                const scale = 1 - progress * 0.6;
                const size = baseSize * scale;
                this.ctx.globalAlpha = alpha;
                this.ctx.translate(centerX, centerY);
                this.ctx.rotate(rotation);
                this.ctx.translate(distance, 0);
                this.ctx.fillStyle = cell.color;
                this.ctx.beginPath();
                this.ctx.roundRect(-size / 2, -size / 2, size, size, 2);
                this.ctx.fill();
                this.ctx.strokeStyle = '#333';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
                break;
            }
                
            case 11: { // Fade to white
                const alpha = 1 - progress;
                const whiteMix = progress;
                const r = parseInt(cell.color.slice(1, 3), 16);
                const g = parseInt(cell.color.slice(3, 5), 16);
                const b = parseInt(cell.color.slice(5, 7), 16);
                const mixedR = Math.round(r + (255 - r) * whiteMix);
                const mixedG = Math.round(g + (255 - g) * whiteMix);
                const mixedB = Math.round(b + (255 - b) * whiteMix);
                this.ctx.globalAlpha = alpha;
                this.ctx.fillStyle = `rgb(${mixedR}, ${mixedG}, ${mixedB})`;
                this.ctx.beginPath();
                this.ctx.roundRect(x + 2, y + 2, baseSize, baseSize, 2);
                this.ctx.fill();
                this.ctx.strokeStyle = '#333';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
                break;
            }
                
            case 12: { // Bounce out
                const alpha = 1 - progress;
                const bounce = Math.sin(progress * Math.PI) * (1 - progress) * CELL_SIZE * 0.3;
                const scale = 1 - progress * 0.4;
                const size = baseSize * scale;
                const offset = (baseSize - size) / 2;
                this.ctx.globalAlpha = alpha;
                this.ctx.fillStyle = cell.color;
                this.ctx.beginPath();
                this.ctx.roundRect(x + 2 + offset, y + 2 + offset - bounce, size, size, 2);
                this.ctx.fill();
                this.ctx.strokeStyle = '#333';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
                break;
            }
                
            case 13: { // Pixelate and fade
                const alpha = 1 - progress;
                const pixelSize = Math.max(2, baseSize * (1 - progress * 0.8));
                const pixelCount = Math.floor(baseSize / pixelSize);
                this.ctx.globalAlpha = alpha;
                this.ctx.fillStyle = cell.color;
                const cornerRadius = Math.max(1, pixelSize * 0.1);
                for (let px = 0; px < pixelCount; px++) {
                    for (let py = 0; py < pixelCount; py++) {
                        this.ctx.beginPath();
                        this.ctx.roundRect(
                            x + 2 + px * pixelSize,
                            y + 2 + py * pixelSize,
                            pixelSize - 1,
                            pixelSize - 1,
                            cornerRadius
                        );
                        this.ctx.fill();
                    }
                }
                break;
            }
                
            case 14: { // Rotate and explode outward
                const alpha = 1 - progress;
                const rotation = progress * Math.PI * 4;
                const explode = progress * CELL_SIZE * 0.8;
                const scale = 1 - progress * 0.5;
                const size = baseSize * scale;
                this.ctx.globalAlpha = alpha;
                this.ctx.translate(centerX, centerY);
                this.ctx.rotate(rotation);
                const explodeX = Math.cos(rotation) * explode;
                const explodeY = Math.sin(rotation) * explode;
                this.ctx.translate(explodeX, explodeY);
                this.ctx.fillStyle = cell.color;
                this.ctx.beginPath();
                this.ctx.roundRect(-size / 2, -size / 2, size, size, 2);
                this.ctx.fill();
                this.ctx.strokeStyle = '#333';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
                break;
            }
                
            case 15: { // Shake and fade
                const alpha = 1 - progress;
                const shake = (Math.random() - 0.5) * progress * 8;
                const shakeY = (Math.random() - 0.5) * progress * 8;
                const scale = 1 - progress * 0.5;
                const size = baseSize * scale;
                const offset = (baseSize - size) / 2;
                this.ctx.globalAlpha = alpha;
                this.ctx.fillStyle = cell.color;
                this.ctx.beginPath();
                this.ctx.roundRect(x + 2 + offset + shake, y + 2 + offset + shakeY, size, size, 2);
                this.ctx.fill();
                this.ctx.strokeStyle = '#333';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
                break;
            }
                
            case 16: { // Dissolve (checkerboard pattern fade)
                const alpha = 1 - progress;
                const checkerSize = 4;
                const checkerProgress = Math.floor(progress * 10);
                this.ctx.globalAlpha = alpha;
                this.ctx.fillStyle = cell.color;
                const cornerRadius = Math.max(1, checkerSize * 0.2);
                for (let cx = 0; cx < baseSize; cx += checkerSize) {
                    for (let cy = 0; cy < baseSize; cy += checkerSize) {
                        const checkerIndex = Math.floor(cx / checkerSize) + Math.floor(cy / checkerSize);
                        if (checkerIndex % 2 === checkerProgress % 2) {
                            this.ctx.beginPath();
                            this.ctx.roundRect(x + 2 + cx, y + 2 + cy, checkerSize, checkerSize, cornerRadius);
                            this.ctx.fill();
                        }
                    }
                }
                break;
            }
        }
        
        this.ctx.restore();
    }

    /**
     * Converts 8x8 board state to 4x4 grid representation
     * Each 4x4 cell represents a 2x2 block from the original board
     * @returns 4x4 grid with color, darkness, and fill count (0-4) information
     */
    private convertTo4x4Grid(): Array<Array<{ color: string; darkness: number; fillCount: number }>> {
        if (!this.finalBoardState || this.finalBoardState.length === 0) {
            return Array(4).fill(null).map(() => Array(4).fill({ color: '#ffffff', darkness: 1.0, fillCount: 0 }));
        }

        // Create an 8x8 boolean grid to track filled cells
        const grid8x8: Array<Array<{ filled: boolean; color: string }>> = Array(BOARD_CELL_COUNT)
            .fill(null)
            .map(() => Array(BOARD_CELL_COUNT).fill({ filled: false, color: '#ffffff' }));

        // Fill the 8x8 grid with blocks from final board state
        // Use original color (before darkness) - we'll apply darkness based on fill count
        for (const block of this.finalBoardState) {
            for (const cell of block.shape) {
                const x = block.position.x + cell.x;
                const y = block.position.y + cell.y;
                if (x >= 0 && x < BOARD_CELL_COUNT && y >= 0 && y < BOARD_CELL_COUNT) {
                    grid8x8[y][x] = { filled: true, color: block.color };
                }
            }
        }

        // Convert to 4x4 grid
        const grid4x4: Array<Array<{ color: string; darkness: number; fillCount: number }>> = Array(4)
            .fill(null)
            .map(() => Array(4).fill({ color: '#ffffff', darkness: 1.0, fillCount: 0 }));

        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                // Top-left corner of 2x2 block in 8x8 grid
                const startY = r * 2;
                const startX = c * 2;

                // Count filled cells in this 2x2 block
                let filledCount = 0;
                let representativeColor = '#ffffff';
                const colorsInBlock: string[] = [];

                for (let dy = 0; dy < 2; dy++) {
                    for (let dx = 0; dx < 2; dx++) {
                        const y = startY + dy;
                        const x = startX + dx;
                        if (grid8x8[y][x].filled) {
                            filledCount++;
                            colorsInBlock.push(grid8x8[y][x].color);
                        }
                    }
                }

                // Determine darkness based on fill count
                // 0 = light (1.0), 1 = mid (0.7), 2 = dark (0.5), 3+ = darkest (0.3)
                let darkness: number;
                if (filledCount === 0) {
                    darkness = 1.0; // light
                } else if (filledCount === 1) {
                    darkness = 0.7; // mid
                } else if (filledCount === 2) {
                    darkness = 0.5; // dark
                } else {
                    darkness = 0.3; // darkest (3 or 4 filled)
                }

                // Use the most common color in the block, or first color if all are different
                if (colorsInBlock.length > 0) {
                    // Find the most frequent color
                    const colorCounts = new Map<string, number>();
                    for (const color of colorsInBlock) {
                        colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
                    }
                    let maxCount = 0;
                    for (const [color, count] of colorCounts.entries()) {
                        if (count > maxCount) {
                            maxCount = count;
                            representativeColor = color;
                        }
                    }
                }

                grid4x4[r][c] = { color: representativeColor, darkness, fillCount: filledCount };
            }
        }

        return grid4x4;
    }

    /**
     * Draws the 4x4 converted board representation
     * @param x - X position to draw at
     * @param y - Y position to draw at
     * @param size - Size of the 4x4 grid
     */
    private draw4x4Board(x: number, y: number, size: number): void {
        const grid4x4 = this.convertTo4x4Grid();
        const cellSize = size / 4;

        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                const cell = grid4x4[r][c];
                const cellX = x + c * cellSize;
                const cellY = y + r * cellSize;

                // Apply darkness to the color
                const darkenedColor = this.darkenColor(cell.color, cell.darkness);

                // Draw the cell
                this.ctx.fillStyle = darkenedColor;
                this.ctx.fillRect(cellX, cellY, cellSize, cellSize);

                // Draw border
                this.ctx.strokeStyle = '#333';
                this.ctx.lineWidth = 1;
                this.ctx.strokeRect(cellX, cellY, cellSize, cellSize);
            }
        }
    }

    /**
     * Draws game over overlay with animation
     * @param progress - Animation progress from 0 to 1
     * @param placedBlocks - Final board state to render as 4x4 grid
     */
    drawGameOver(progress: number = 1, placedBlocks: PlacedBlock[] = [], leaderboardRanks: { today: number | null; week: number | null; ever: number | null; todayTotal: number; weekTotal: number; everTotal: number } | null = null, mode: 'easy' | 'hard' = 'easy'): void {
        // Animated overlay - fade in from 0 to 0.8 opacity (cover the entire playing surface and queue area)
        const overlayAlpha = 0.8 * progress;
        this.ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`;
        // Cover both board and queue area
        const totalGameAreaHeight = BOARD_PIXEL_SIZE + QUEUE_AREA_HEIGHT;
        this.ctx.fillRect(BOARD_OFFSET_X, BOARD_OFFSET_Y, BOARD_PIXEL_SIZE, totalGameAreaHeight);

        const textAlpha = progress;
        // Snap centerX to integer pixel for crisp text rendering
        const centerX = Math.round(BOARD_OFFSET_X + BOARD_PIXEL_SIZE / 2);
        // Use unified system font stack from fontConfig
        const baseFont = SYSTEM_FONT_STACK;
        
        // Calculate total content height for vertical centering
        const gameOverTextHeight = 54;
        const gameOverSpacing = 28;
        let emojiBoardHeight = 0;
        if (progress > 0 && this.finalBoardState && this.finalBoardState.length > 0) {
            const emojiText = this.generateEmojiBoard();
            const lines = emojiText.split('\n').filter(line => line.trim() !== '' && !line.includes('Score:') && !line.includes('Lines:') && !line.includes('Level:') && !line.includes('Mode:') && !line.includes('Rank') && !line.includes('Leaderboard'));
            emojiBoardHeight = lines.length * 28 + 25; // Line height * number of lines + spacing
        }
        const scoreHeight = 23 + 20; // Score line height + spacing
        const linesLevelHeight = 23 + 20; // Lines/Level line height + spacing
        const modeHeight = 23 + 20; // Mode line height + spacing
        let rankingsHeight = 0;
        if (leaderboardRanks) {
            // Calculate height for rankings (3 lines max, each 23px + 20px spacing)
            const periods = [
                { rank: leaderboardRanks.today, total: leaderboardRanks.todayTotal },
                { rank: leaderboardRanks.week, total: leaderboardRanks.weekTotal },
                { rank: leaderboardRanks.ever, total: leaderboardRanks.everTotal }
            ];
            const visibleRankings = periods.filter(p => p.rank !== null && p.total > 0).length;
            rankingsHeight = visibleRankings * (23 + 20) + 5; // Each ranking line + spacing + extra space
        }
        const buttonHeight = 44 + 15; // Button height + spacing
        const totalContentHeight = gameOverTextHeight + gameOverSpacing + emojiBoardHeight + scoreHeight + linesLevelHeight + modeHeight + rankingsHeight + buttonHeight;
        
        // Calculate starting Y position to center content vertically
        const contentStartY = Math.round(BOARD_OFFSET_Y + (totalGameAreaHeight - totalContentHeight) / 2);
        let currentY = contentStartY;

        // Draw "GAME OVER" text - 100% larger than 27px (27px * 2 = 54px) and bold
        this.ctx.save();
        this.ctx.globalAlpha = textAlpha;
        this.ctx.font = `bold 54px ${baseFont}`;
        this.ctx.fillStyle = '#fff';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        this.ctx.fillText('GAME OVER', centerX, currentY);
        this.ctx.restore();
        
        currentY += gameOverTextHeight + gameOverSpacing;

        // Draw the emoji board representation if we have final board state
        if (progress > 0 && this.finalBoardState && this.finalBoardState.length > 0) {
            // Generate emoji board text (just the grid, no stats)
            const emojiText = this.generateEmojiBoard();
            const lines = emojiText.split('\n').filter(line => line.trim() !== '' && !line.includes('Score:') && !line.includes('Lines:') && !line.includes('Level:') && !line.includes('Mode:') && !line.includes('Rank') && !line.includes('Leaderboard'));
            
            this.ctx.save();
            this.ctx.globalAlpha = progress;
            this.ctx.font = `23px ${baseFont}`;
            this.ctx.fillStyle = '#fff';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'top';
            
            const lineHeight = 28;
            lines.forEach((line, index) => {
                this.ctx.fillText(line, centerX, Math.round(currentY + index * lineHeight));
            });
            
            this.ctx.restore();
            currentY += lines.length * lineHeight + 25;
        }

        // Draw stats - Score, Lines/Level, Mode, and Rankings on separate lines
        currentY = Math.round(currentY);
        this.ctx.save();
        this.ctx.globalAlpha = textAlpha;
        this.ctx.font = `23px ${baseFont}`;
        this.ctx.fillStyle = '#fff';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'top';
        
        // Score line
        this.ctx.fillText(`Score: ${this.finalScore.toLocaleString()}`, centerX, currentY);
        currentY += 23 + 20;
        
        // Lines / Level line
        this.ctx.fillText(`Lines: ${this.finalLinesCleared} / Level ${this.finalLevel}`, centerX, currentY);
        currentY += 23 + 20;
        
        // Mode line
        const modeText = mode.charAt(0).toUpperCase() + mode.slice(1);
        this.ctx.fillText(`Mode: ${modeText}`, centerX, currentY);
        currentY += 23 + 20;
        
        // Draw rankings if available
        if (leaderboardRanks) {
            const periods = [
                { key: 'today' as const, label: 'Today', rank: leaderboardRanks.today, total: leaderboardRanks.todayTotal },
                { key: 'week' as const, label: 'Week', rank: leaderboardRanks.week, total: leaderboardRanks.weekTotal },
                { key: 'ever' as const, label: 'Ever', rank: leaderboardRanks.ever, total: leaderboardRanks.everTotal }
            ];
            
            for (const period of periods) {
                if (period.rank !== null && period.total > 0) {
                    const isTop10 = period.rank <= 10;
                    const rankText = `${period.label}: ${period.rank} of ${period.total}`;
                    
                    // Use gold for top 10, white otherwise
                    this.ctx.fillStyle = isTop10 ? '#FFD700' : '#fff';
                    this.ctx.fillText(rankText, centerX, currentY);
                    currentY += 23 + 20;
                }
            }
        }
        
        currentY += 5; // Extra space before button
        this.ctx.restore();

        // Draw Share button
        if (progress > 0 && this.finalBoardState && this.finalBoardState.length > 0) {
            this.ctx.save();
            this.ctx.globalAlpha = progress;
            
            // Button dimensions matching the style of other buttons
            const buttonWidth = 140;
            const buttonHeight = 44;
            const buttonX = Math.round(centerX - buttonWidth / 2);
            const buttonY = Math.round(currentY);
            const borderRadius = 8;
            
            // Get theme colors
            const accentColor = this.getCSSVariable('--accent-color') || '#4b5563';
            const textColor = this.getCSSVariable('--accent-color-contrast') || '#ffffff';
            
            // Draw button background with rounded corners
            this.ctx.beginPath();
            this.ctx.moveTo(buttonX + borderRadius, buttonY);
            this.ctx.lineTo(buttonX + buttonWidth - borderRadius, buttonY);
            this.ctx.quadraticCurveTo(buttonX + buttonWidth, buttonY, buttonX + buttonWidth, buttonY + borderRadius);
            this.ctx.lineTo(buttonX + buttonWidth, buttonY + buttonHeight - borderRadius);
            this.ctx.quadraticCurveTo(buttonX + buttonWidth, buttonY + buttonHeight, buttonX + buttonWidth - borderRadius, buttonY + buttonHeight);
            this.ctx.lineTo(buttonX + borderRadius, buttonY + buttonHeight);
            this.ctx.quadraticCurveTo(buttonX, buttonY + buttonHeight, buttonX, buttonY + buttonHeight - borderRadius);
            this.ctx.lineTo(buttonX, buttonY + borderRadius);
            this.ctx.quadraticCurveTo(buttonX, buttonY, buttonX + borderRadius, buttonY);
            this.ctx.closePath();
            
            this.ctx.fillStyle = accentColor;
            this.ctx.fill();
            
            // Draw emoji and text
            // Determine text color for best visibility (black or white)
            const r = parseInt(accentColor.substring(1, 3), 16);
            const g = parseInt(accentColor.substring(3, 5), 16);
            const b = parseInt(accentColor.substring(5, 7), 16);
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            const buttonTextColor = brightness > 128 ? '#000000' : '#ffffff';
            
            this.ctx.font = `bold 16px ${baseFont}`;
            this.ctx.fillStyle = buttonTextColor;
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            const buttonCenterX = Math.round(buttonX + buttonWidth / 2);
            const buttonCenterY = Math.round(buttonY + buttonHeight / 2);
            const buttonText = 'Share';
            this.ctx.fillText(buttonText, buttonCenterX, buttonCenterY);
            
            // Store bounds for click detection
            this.copyLinkBounds = {
                x: buttonX,
                y: buttonY,
                width: buttonWidth,
                height: buttonHeight
            };
            
            this.ctx.restore();
        } else {
            this.copyLinkBounds = null;
        }
    }

    /**
     * Draws a 4x4 grid representing the final board state
     * Each cell in the 4x4 represents a 2x2 area on the 8x8 board
     * Uses the darkest color from each 2x2 area
     * @param placedBlocks - Final board state
     * @param progress - Animation progress for fade-in
     */
    private drawFinalBoardGrid(placedBlocks: PlacedBlock[], progress: number): void {
        // Create a map of cell positions to their darkened colors
        const cellMap = new Map<string, string>();
        
        for (const block of placedBlocks) {
            for (const cell of block.shape) {
                const absoluteX = block.position.x + cell.x;
                const absoluteY = block.position.y + cell.y;
                const key = `${absoluteX},${absoluteY}`;
                
                // Get the darkened color for this cell
                const darkenedColor = this.darkenColor(block.color, block.darkness);
                
                // Calculate brightness of the darkened color (lower = darker)
                const hex = darkenedColor.replace('#', '');
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);
                const brightness = (r + g + b) / 3;
                
                // Store if this is the darkest cell in this position, or if position is empty
                const existing = cellMap.get(key);
                if (!existing) {
                    cellMap.set(key, darkenedColor);
                } else {
                    // Compare brightness - keep the darker one
                    const existingHex = existing.replace('#', '');
                    const existingR = parseInt(existingHex.substring(0, 2), 16);
                    const existingG = parseInt(existingHex.substring(2, 4), 16);
                    const existingB = parseInt(existingHex.substring(4, 6), 16);
                    const existingBrightness = (existingR + existingG + existingB) / 3;
                    
                    if (brightness < existingBrightness) {
                        cellMap.set(key, darkenedColor);
                    }
                }
            }
        }

        // Calculate 4x4 grid size and position (centered below game over text)
        const gridSize = 160; // Increased size for better visibility
        const cellSize = gridSize / 4;
        const gridX = BOARD_OFFSET_X + BOARD_PIXEL_SIZE / 2 - gridSize / 2;
        const gridY = BOARD_OFFSET_Y + 150; // Below the "GAME OVER" text

        this.ctx.save();
        // Use full opacity (not affected by progress) so grid is always visible
        this.ctx.globalAlpha = 1.0;

        // Draw 4x4 grid
        for (let gridYIdx = 0; gridYIdx < 4; gridYIdx++) {
            for (let gridXIdx = 0; gridXIdx < 4; gridXIdx++) {
                // Each 4x4 cell represents a 2x2 area on the 8x8 board
                const boardStartX = gridXIdx * 2;
                const boardStartY = gridYIdx * 2;
                
                // Find the darkest color in this 2x2 area
                let darkestColor: string | null = null;
                let darkestBrightness = 255;
                
                for (let by = 0; by < 2; by++) {
                    for (let bx = 0; bx < 2; bx++) {
                        const boardX = boardStartX + bx;
                        const boardY = boardStartY + by;
                        const key = `${boardX},${boardY}`;
                        const cellColor = cellMap.get(key);
                        
                        if (cellColor) {
                            // Calculate brightness of this color
                            const hex = cellColor.replace('#', '');
                            const r = parseInt(hex.substring(0, 2), 16);
                            const g = parseInt(hex.substring(2, 4), 16);
                            const b = parseInt(hex.substring(4, 6), 16);
                            const brightness = (r + g + b) / 3;
                            
                            if (brightness < darkestBrightness) {
                                darkestBrightness = brightness;
                                darkestColor = cellColor;
                            }
                        }
                    }
                }

                // Draw the cell
                const x = gridX + gridXIdx * cellSize;
                const y = gridY + gridYIdx * cellSize;
                
                // Draw rounded rectangle for the cell
                if (darkestColor) {
                    // Draw filled cell with the darkest color from the 2x2 area
                    // Add a subtle border for better visibility
                    this.ctx.fillStyle = darkestColor;
                    this.ctx.beginPath();
                    this.ctx.roundRect(x, y, cellSize, cellSize, 4);
                    this.ctx.fill();
                    // Add border for contrast
                    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                    this.ctx.lineWidth = 1;
                    this.ctx.stroke();
                } else {
                    // Draw empty cell with a subtle border to show it's empty
                    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
                    this.ctx.beginPath();
                    this.ctx.roundRect(x, y, cellSize, cellSize, 4);
                    this.ctx.fill();
                    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
                    this.ctx.lineWidth = 1;
                    this.ctx.stroke();
                }
            }
        }

        this.ctx.restore();
    }

    /**
     * Draws "Level up!" text animation that appears when player levels up
     * @param progress - Animation progress from 0 to 1
     */
    drawLevelUp(progress: number): void {
        // Fade in quickly, then fade out slowly
        // Show at full opacity from 0 to 0.3, then fade out from 0.3 to 1.0
        let alpha: number;
        if (progress <= 0.3) {
            // Fade in quickly (0 to 0.3)
            alpha = progress / 0.3;
        } else {
            // Fade out slowly (0.3 to 1.0)
            alpha = 1 - ((progress - 0.3) / 0.7);
        }
        
        // Scale animation: start small, grow to full size, then shrink slightly
        let scale: number;
        if (progress <= 0.2) {
            // Grow from 0.5 to 1.2
            scale = 0.5 + (progress / 0.2) * 0.7;
        } else if (progress <= 0.4) {
            // Bounce back to 1.0
            scale = 1.2 - ((progress - 0.2) / 0.2) * 0.2;
        } else {
            // Stay at 1.0
            scale = 1.0;
        }
        
        this.ctx.save();
        this.ctx.globalAlpha = alpha;
        
        // Instead of using ctx.scale() which causes subpixel blur on text,
        // compute the font size directly based on scale factor
        const baseFontSize = 64;
        const scaledFontSize = Math.round(baseFontSize * scale);
        
        // Level up text - use system font stack for consistency
        this.ctx.fillStyle = '#fff';
        this.ctx.font = `bold ${scaledFontSize}px ${SYSTEM_FONT_STACK}`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Snap position to integer pixels
        const textX = Math.round(BOARD_PIXEL_SIZE / 2);
        const textY = Math.round(BOARD_PIXEL_SIZE / 2);
        
        // Reduced shadow blur for sharper text (was 30, now 3 for subtle glow without blur)
        this.ctx.shadowColor = '#4ECDC4';
        this.ctx.shadowBlur = 3;
        this.ctx.fillText('Level up!', textX, textY);
        
        // Reset shadow
        this.ctx.shadowBlur = 0;
        
        this.ctx.restore();
    }

    /**
     * Main render method that draws everything
     * @param board - The game board
     * @param placedBlocks - All placed blocks
     * @param queue - Queue of upcoming shapes
     * @param dragState - Current drag state
     * @param gameOver - Whether game is over
     * @param animatingCells - Cells currently animating out
     * @param gameOverProgress - Animation progress for game over (0 to 1)
     * @param totalShapesPlaced - Total shapes placed (for calculating current point values)
     * @param levelUpProgress - Animation progress for level up text (0 to 1, 0 = not showing)
     * @param level - Current game level (for calculating contrasting highlight color)
     * @param smoothedDragPosition - Pre-smoothed drag position from DragController (optional)
     */
    render(
        board: Board,
        placedBlocks: PlacedBlock[],
        queue: (Shape | null)[],
        dragState: DragState,
        gameOver: boolean,
        animatingCells: AnimatingCell[] = [],
        gameOverProgress: number = 0,
        totalShapesPlaced: number = 0,
        levelUpProgress: number = 0,
        level: number = 1,
        score: number = 0,
        linesCleared: number = 0,
        leaderboardRanks: { today: number | null; week: number | null; ever: number | null; todayTotal: number; weekTotal: number; everTotal: number } | null = null,
        mode: 'easy' | 'hard' = 'easy',
        animatingShapes: AnimatingShape[] = [],
        pointsAnimationProgress: number = 0,
        pointsAnimationValue: number = 0,
        comboAnimationProgress: number = 0,
        comboAnimationType: 'continue' | 'break' | null = null,
        comboAnimationMultiplier: number = 0,
        comboCount: number = 0,
        hoverPosition: Position | null = null,
        smoothedDragPosition?: { x: number; y: number }
    ): void {
        // Update current level for highlight color calculation
        this.currentLevel = level;
        this.clear();
        if (this.settings.showGrid) {
            this.drawGrid();
        }
        this.drawBoard(board, placedBlocks, animatingCells, totalShapesPlaced, hoverPosition);
        
        // Draw preview line highlights if dragging and position would clear lines
        if (dragState.isDragging && dragState.isValidPosition && dragState.previewLinesCleared) {
            this.drawPreviewLineHighlights(dragState.previewLinesCleared, placedBlocks);
        }
        
        // Draw animating shapes (snap animations)
        for (const animShape of animatingShapes) {
            this.drawAnimatingShape(animShape);
        }
        
        this.drawQueue(queue);
        
        // Draw border between board and queue area
        this.drawBoardQueueBorder();
        
        this.drawDragPreview(dragState, smoothedDragPosition);

        // Store final board state when game over just starts (before pop animations begin)
        // Capture when gameOver is true but no animations have started yet (animatingCells is empty)
        if (gameOver && animatingCells.length === 0 && this.finalBoardState === null) {
            // Store a deep copy of the placed blocks state
            this.finalBoardState = placedBlocks.map(block => ({
                ...block,
                shape: block.shape.map(cell => ({ ...cell })),
                position: { ...block.position }
            }));
            // Store the total shapes placed for point value calculation
            this.finalTotalShapesPlaced = totalShapesPlaced;
            // Store lines cleared and level (these don't change after game over)
            this.finalLinesCleared = linesCleared;
            this.finalLevel = level;
            this.finalMode = mode;
        }
        
        // Always update finalScore when gameOver is true (score may change due to game over bonus)
        if (gameOver) {
            this.finalScore = score;
        }

        if (gameOver) {
            this.drawGameOver(gameOverProgress, placedBlocks, leaderboardRanks ?? null, mode);
        }
        
        if (levelUpProgress > 0 && levelUpProgress < 1) {
            this.drawLevelUp(levelUpProgress);
        }
        
        if (pointsAnimationProgress > 0 && pointsAnimationProgress < 1 && pointsAnimationValue > 200) {
            this.drawPointsAnimation(pointsAnimationProgress, pointsAnimationValue);
        }
        
        if (comboAnimationProgress > 0 && comboAnimationProgress < 1 && comboAnimationType !== null) {
            this.drawComboAnimation(comboAnimationProgress, comboAnimationType, comboAnimationMultiplier, comboCount);
        }
    }
    
    /**
     * Draws points animation that appears when clearing lines/columns worth more than 200 points
     * Animation gets more dramatic for every 100 points over 200
     * @param progress - Animation progress from 0 to 1
     * @param points - The point value to display
     */
    drawPointsAnimation(progress: number, points: number): void {
        // Calculate drama level: 0 for 200-299, 1 for 300-399, 2 for 400-499, etc.
        const dramaLevel = Math.floor((points - 200) / 100);
        
        // Fade in quickly, then fade out slowly
        // Show at full opacity from 0 to 0.25, then fade out from 0.25 to 1.0
        let alpha: number;
        if (progress <= 0.25) {
            // Fade in quickly (0 to 0.25)
            alpha = progress / 0.25;
        } else {
            // Fade out slowly (0.25 to 1.0)
            alpha = 1 - ((progress - 0.25) / 0.75);
        }
        
        // Scale animation: start small, grow to full size with bounce
        // More dramatic = larger scale
        const baseScale = 1.2; // Increased base scale
        const dramaScale = 0.3 * dramaLevel; // +0.3 scale per 100 points over 200
        const maxScale = baseScale + dramaScale;
        
        let scale: number;
        if (progress <= 0.15) {
            // Grow from 0.3 to maxScale (more dramatic entrance)
            scale = 0.3 + (progress / 0.15) * (maxScale - 0.3);
        } else if (progress <= 0.35) {
            // Bounce back slightly then settle
            const bounceProgress = (progress - 0.15) / 0.2;
            const bounceAmount = (maxScale - baseScale) * 0.3; // 30% bounce
            scale = maxScale - (bounceProgress * bounceAmount);
        } else {
            // Stay at baseScale
            scale = baseScale;
        }
        
        this.ctx.save();
        
        // Center on entire canvas, not just board
        const centerX = Math.round(CANVAS_WIDTH / 2);
        // Center Y is the middle of the board (which is centered in the board area)
        const centerY = Math.round(BOARD_OFFSET_Y + BOARD_PIXEL_SIZE / 2);
        
        // Calculate font size based on scale and drama level - MUCH larger
        const baseFontSize = 96; // Doubled from 48
        const dramaFontSize = 24 * dramaLevel; // +24px per 100 points over 200 (doubled)
        const scaledFontSize = Math.round((baseFontSize + dramaFontSize) * scale);
        
        // Format points with commas and add "+" prefix
        const pointsText = `+${points.toLocaleString('en-US')}`;
        
        // Draw background circle/glow for emphasis
        const bgRadius = scaledFontSize * 0.8;
        const bgAlpha = alpha * 0.3;
        const shadowColor = this.getDramaShadowColor(dramaLevel);
        
        // Draw multiple glow layers for more emphasis
        for (let i = 0; i < 3; i++) {
            const glowRadius = bgRadius + (i * 20);
            const glowAlpha = bgAlpha * (1 - i * 0.3);
            this.ctx.globalAlpha = glowAlpha;
            this.ctx.fillStyle = shadowColor;
            this.ctx.beginPath();
            this.ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
            this.ctx.fill();
        }
        
        // Draw text outline for better visibility
        this.ctx.globalAlpha = alpha;
        this.ctx.fillStyle = '#fff';
        this.ctx.font = `bold ${scaledFontSize}px ${SYSTEM_FONT_STACK}`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Shadow effect gets more dramatic with higher points
        // Base shadow blur: 15, +10 per 100 points over 200
        const shadowBlur = 15 + (dramaLevel * 10);
        
        this.ctx.shadowColor = shadowColor;
        this.ctx.shadowBlur = shadowBlur;
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 0;
        
        // Draw text outline (stroke) for extra emphasis
        this.ctx.strokeStyle = '#000';
        this.ctx.lineWidth = Math.max(2, scaledFontSize * 0.05);
        this.ctx.strokeText(pointsText, centerX, centerY);
        
        // Draw main text
        this.ctx.fillText(pointsText, centerX, centerY);
        
        // Add extra glow layers for very high scores (400+)
        if (dramaLevel >= 2) {
            // Add multiple additional glow layers
            for (let i = 0; i < 2; i++) {
                this.ctx.shadowBlur = shadowBlur * (1.5 + i * 0.5);
                this.ctx.globalAlpha = alpha * (0.4 - i * 0.1);
                this.ctx.fillText(pointsText, centerX, centerY);
            }
        }
        
        // Reset shadow
        this.ctx.shadowBlur = 0;
        this.ctx.restore();
    }
    
    /**
     * Draws combo animation that appears when a combo continues or breaks
     * @param progress - Animation progress from 0 to 1
     * @param type - Type of combo event ('continue' or 'break')
     * @param multiplier - The combo multiplier value
     */
    drawComboAnimation(progress: number, type: 'continue' | 'break', multiplier: number, comboCount: number = 0): void {
        // Fade in quickly, then fade out slowly
        let alpha: number;
        if (progress <= 0.2) {
            // Fade in quickly (0 to 0.2)
            alpha = progress / 0.2;
        } else {
            // Fade out slowly (0.2 to 1.0)
            alpha = 1 - ((progress - 0.2) / 0.8);
        }
        
        // Scale animation: start small, grow to full size with bounce
        let scale: number;
        if (progress <= 0.15) {
            // Grow from 0.3 to 1.3
            scale = 0.3 + (progress / 0.15) * 1.0;
        } else if (progress <= 0.3) {
            // Bounce back slightly
            const bounceProgress = (progress - 0.15) / 0.15;
            scale = 1.3 - (bounceProgress * 0.2);
        } else {
            // Stay at base scale
            scale = 1.1;
        }
        
        this.ctx.save();
        
        // Center on entire canvas, slightly above center
        const centerX = Math.round(CANVAS_WIDTH / 2);
        const centerY = Math.round((BOARD_OFFSET_Y + BOARD_PIXEL_SIZE / 2) - 60);
        
        // Calculate font size based on scale
        const baseFontSize = 64;
        const scaledFontSize = Math.round(baseFontSize * scale);
        
        // Determine text and color based on type
        let comboText: string;
        let textColor: string;
        let shadowColor: string;
        
        if (type === 'continue') {
            comboText = `COMBO x${comboCount}!`;
            textColor = '#4ade80'; // Green for continue
            shadowColor = '#16a34a';
        } else {
            // Use newline to wrap "COMBO" and "BROKEN" on separate lines
            comboText = `COMBO\nBROKEN`;
            textColor = '#fbbf24'; // Amber for break
            shadowColor = '#f59e0b';
        }
        
        // Draw background glow
        const glowRadius = scaledFontSize * 0.6;
        this.ctx.filter = `blur(10px)`;
        this.ctx.globalAlpha = alpha * 0.4;
        this.ctx.fillStyle = shadowColor;
        this.ctx.beginPath();
        this.ctx.arc(centerX, centerY, glowRadius * 1.5, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.filter = 'none';
        
        // Draw text outline for better visibility
        this.ctx.globalAlpha = alpha;
        this.ctx.fillStyle = textColor;
        this.ctx.font = `bold ${scaledFontSize}px ${SYSTEM_FONT_STACK}`;
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Shadow effect
        this.ctx.shadowColor = shadowColor;
        this.ctx.shadowBlur = 15;
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 0;
        
        // Split text by newline and draw each line
        const lines = comboText.split('\n');
        const lineSpacing = scaledFontSize * 1.2; // Line height (120% of font size)
        const totalHeight = (lines.length - 1) * lineSpacing;
        const startY = centerY - totalHeight / 2;
        
        // Draw each line with the same animation (no delays)
        for (let i = 0; i < lines.length; i++) {
            const lineY = startY + (i * lineSpacing);
            
            // Draw text outline (stroke) for this line
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 3;
            this.ctx.strokeText(lines[i], centerX, lineY);
            
            // Draw main text with shadow for this line
            this.ctx.fillText(lines[i], centerX, lineY);
        }
        
        this.ctx.shadowBlur = 0;
        this.ctx.restore();
    }
    
    /**
     * Gets shadow color based on drama level
     * More dramatic = brighter/more colorful glow
     */
    private getDramaShadowColor(dramaLevel: number): string {
        const colors = [
            '#4ECDC4',  // Base (200-299): teal
            '#FFD93D',  // Level 1 (300-399): yellow
            '#FF6B6B',  // Level 2 (400-499): red
            '#A8E6CF',  // Level 3 (500-599): green
            '#FF8B94',  // Level 4 (600-699): pink
            '#95E1D3',  // Level 5 (700-799): mint
        ];
        // Cycle through colors for very high scores
        return colors[Math.min(dramaLevel, colors.length - 1)];
    }
}

