/**
 * Canvas rendering system for drawing the game board, shapes, queue, and score
 */

import { Position, Shape, PlacedBlock, DragState, AnimatingCell, GameSettings } from './types';
import { Board } from './board';
import { getShapeColor, getShapeIndex, getShapePointValue } from './shapes';
import { getColorSet } from './colorConfig';
import {
    BOARD_PIXEL_SIZE,
    BOARD_CELL_COUNT,
    CELL_SIZE,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    QUEUE_AREA_HEIGHT,
    QUEUE_AREA_PADDING,
    QUEUE_CELL_SIZE,
    QUEUE_ITEM_HEIGHT,
    getQueueItemRect,
} from './constants';
import { GAMEPLAY_CONFIG, ANIMATION_CONFIG } from './config';

/**
 * Renderer class handles all canvas drawing operations
 */
export class Renderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private settings: GameSettings;
    private currentLevel: number = 1;
    private blockIconImage: HTMLImageElement | null = null;
    private blockIconLoaded: boolean = false;

    constructor(canvas: HTMLCanvasElement, settings: GameSettings) {
        this.canvas = canvas;
        this.settings = { ...settings };
        // Set canvas size
        this.canvas.width = CANVAS_WIDTH;
        this.canvas.height = CANVAS_HEIGHT;
        
        const context = this.canvas.getContext('2d');
        if (!context) {
            throw new Error('Could not get 2D rendering context');
        }
        this.ctx = context;
        
        // Load block icon
        this.loadBlockIcon();
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
            console.log('[RENDERER] Block icon loaded successfully');
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
            let value = getComputedStyle(body).getPropertyValue(name).trim();
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
        
        // Check if current theme is dark (midnight)
        const isDarkTheme = this.settings.theme === 'midnight';
        
        let adjustedR: number;
        let adjustedG: number;
        let adjustedB: number;
        
        if (isDarkTheme) {
            // For dark themes: lighten by interpolating toward white
            // When darkness = 1.0, use original color
            // When darkness = 0.0, use white (255, 255, 255)
            const lightness = 1.0 - factor; // Invert: darkness 0 = full lightness, darkness 1 = no lightness
            adjustedR = Math.floor(r * (1 - lightness) + 255 * lightness);
            adjustedG = Math.floor(g * (1 - lightness) + 255 * lightness);
            adjustedB = Math.floor(b * (1 - lightness) + 255 * lightness);
        } else {
            // For light themes: darken by multiplying by darkness factor (current behavior)
            adjustedR = Math.floor(r * factor);
            adjustedG = Math.floor(g * factor);
            adjustedB = Math.floor(b * factor);
        }
        
        // Convert back to hex
        return `#${adjustedR.toString(16).padStart(2, '0')}${adjustedG.toString(16).padStart(2, '0')}${adjustedB.toString(16).padStart(2, '0')}`;
    }

    /**
     * Clears the entire canvas
     */
    clear(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
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

        // Draw vertical lines
        for (let x = 0; x <= 8; x++) {
            this.ctx.beginPath();
            this.ctx.moveTo(x * CELL_SIZE, 0);
            this.ctx.lineTo(x * CELL_SIZE, BOARD_PIXEL_SIZE);
            this.ctx.stroke();
        }

        // Draw horizontal lines
        for (let y = 0; y <= 8; y++) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y * CELL_SIZE);
            this.ctx.lineTo(BOARD_PIXEL_SIZE, y * CELL_SIZE);
            this.ctx.stroke();
        }
    }

    /**
     * Draws all placed blocks on the board
     * @param placedBlocks - Array of all placed blocks
     * @param animatingCells - Array of cells currently animating out
     * @param totalShapesPlaced - Total shapes placed (for calculating current point values)
     */
    drawBoard(placedBlocks: PlacedBlock[], animatingCells: AnimatingCell[] = [], totalShapesPlaced: number = 0): void {
        // Draw placed blocks, but skip cells that are animating
        for (const block of placedBlocks) {
            const cellsToDraw = block.shape.filter(cell => {
                const absoluteX = block.position.x + cell.x;
                const absoluteY = block.position.y + cell.y;
                // Skip cells that are currently animating
                return !animatingCells.some(ac => ac.x === absoluteX && ac.y === absoluteY);
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
                
                // Apply pulsing effect if value > pulse threshold
                const shouldPulse = displayValue > GAMEPLAY_CONFIG.pulseThreshold;
                if (shouldPulse) {
                    const pulseProgress = (Date.now() % ANIMATION_CONFIG.pulseCycleMs) / ANIMATION_CONFIG.pulseCycleMs;
                    // Pulse between 0.7 and 1.0 brightness using sine wave
                    const pulseBrightness = 0.7 + (Math.sin(pulseProgress * Math.PI * 2) * 0.15 + 0.15);
                    // Interpolate between current darkness and full brightness (1.0) based on pulseBrightness
                    // When pulseBrightness is 1.0, use full brightness; when 0.7, use current darkness
                    const pulsedDarkness = block.darkness + (1.0 - block.darkness) * (pulseBrightness - 0.7) / 0.3;
                    darkenedColor = this.darkenColor(block.color, pulsedDarkness);
                }
                
                // Draw only the non-animating cells with incremented point values
                this.drawShape(cellsToDraw, block.position, darkenedColor, false, displayValue);
            }
        }
        
        // Draw animating cells with animation effect
        for (const cell of animatingCells) {
            this.drawAnimatingCell(cell);
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
    private drawBlock(blockX: number, blockY: number, blockSize: number, color: string, borderColor: string = '#333'): void {
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
     * Draws a shape at a given position
     * @param shape - The shape to draw
     * @param position - Grid position where to draw
     * @param color - Color to use for the shape
     * @param isGhost - Whether to draw as a ghost (semi-transparent)
     * @param pointValue - Optional point value to display on each cell
     */
    drawShape(shape: Shape, position: Position, color: string, isGhost: boolean = false, pointValue?: number): void {
        if (isGhost) {
            this.ctx.globalAlpha = 0.5;
        } else {
            this.ctx.globalAlpha = 1.0;
        }

        for (const block of shape) {
            const x = (position.x + block.x) * CELL_SIZE;
            const y = (position.y + block.y) * CELL_SIZE;
            const blockX = x + 2;
            const blockY = y + 2;
            const blockSize = CELL_SIZE - 4;

            this.drawBlock(blockX, blockY, blockSize, color);

            // Draw point value if provided and setting is enabled
            if (pointValue !== undefined && !isGhost && this.settings.showPointValues) {
                // Calculate center of the filled block (accounting for 2px padding)
                const blockX = x + 2;
                const blockY = y + 2;
                const blockSize = CELL_SIZE - 4;
                const centerX = blockX + blockSize / 2;
                const centerY = blockY + blockSize / 2;
                
                // Use a semi-transparent white for less contrast
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                // Font size should be slightly smaller (about 65% of cell size)
                const fontSize = Math.floor(CELL_SIZE * 0.65);
                this.ctx.font = `bold ${fontSize}px sans-serif`;
                
                // Set text alignment for perfect centering
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                
                // Draw text at exact center
                this.ctx.fillText(
                    pointValue.toString(),
                    centerX,
                    centerY
                );
            }
        }

        this.ctx.globalAlpha = 1.0;
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
        const borderM = borderL - borderC / 2;
        
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
        
        // Draw highlight with glow effect
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
                    
                    const cellX = x * CELL_SIZE;
                    const cellY = row * CELL_SIZE;
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
     * Draws the queue of upcoming shapes beneath the board
     * @param queue - Array of shapes in the queue
     */
    drawQueue(queue: (Shape | null)[]): void {
        const queueAreaTop = BOARD_PIXEL_SIZE;

        // Get theme colors for queue area (re-read on each render to catch theme changes)
        const queueStripBg = this.getCSSVariable('--queue-strip-bg') || '#f5f5f5';
        const queueShapeBorder = this.getCSSVariable('--queue-shape-border') || '#333333';
        const queuePointText = this.getCSSVariable('--queue-point-text') || '#999999';

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

                    this.drawBlock(x, y, blockSize, shapeColor, queueShapeBorder);
                }

                // Draw point value in bottom right corner if setting is enabled
                if (this.settings.showPointValues) {
                    const shapeIndex = getShapeIndex(shape);
                    // Note: Queue shows base point value, not level-adjusted
                    const pointValue = getShapePointValue(shapeIndex, 0);
                    this.ctx.fillStyle = queuePointText;
                    this.ctx.font = '14px sans-serif';
                    this.ctx.textAlign = 'right';
                    this.ctx.textBaseline = 'bottom';
                    this.ctx.fillText(
                        pointValue.toString(),
                        rect.x + rect.width - 6,
                        rect.y + QUEUE_ITEM_HEIGHT - 6
                    );
                }
            }
            // If no shape at this index, the area remains empty but still occupies its fixed position
        }
    }

    /**
     * Draws the currently dragged shape with ghost placement preview
     * @param dragState - Current drag state
     */
    drawDragPreview(dragState: DragState): void {
        if (!dragState.isDragging || !dragState.shape || !dragState.hasBoardPosition) return;

        const position = dragState.mousePosition;
        const shapeIndex = getShapeIndex(dragState.shape);
        const color = getShapeColor(shapeIndex);

        if (dragState.isValidPosition) {
            // Draw valid placement (green tint)
            this.drawShape(dragState.shape, position, color, true);
        } else {
            // Draw invalid placement (red tint)
            this.ctx.globalAlpha = 0.3;
            this.drawShape(dragState.shape, position, '#ff0000', true);
            this.ctx.globalAlpha = 1.0;
        }
    }

    /**
     * Draws an animating cell that is being removed
     * @param cell - The animating cell to draw
     */
    drawAnimatingCell(cell: AnimatingCell): void {
        const x = cell.x * CELL_SIZE;
        const y = cell.y * CELL_SIZE;
        const isExplosion = cell.type === 'explosion';
        
        if (isExplosion) {
            // Explosion animation: expand and fade with particles
            const alpha = 1 - cell.progress;
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
            case 0: // Fade out and scale down (original)
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
                
            case 1: // Spin and fade
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
                
            case 2: // Shrink to center
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
                
            case 3: // Slide up and fade
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
                
            case 4: // Expand and fade
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
                
            case 5: // Rotate 180 and shrink
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
                
            case 6: // Fade with pulsing scale
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
     * Draws game over overlay with animation
     * @param progress - Animation progress from 0 to 1
     * @param placedBlocks - Final board state to render as 4x4 grid
     */
    drawGameOver(progress: number = 1, placedBlocks: PlacedBlock[] = []): void {
        // Animated overlay - fade in from 0 to 0.8 opacity
        const overlayAlpha = 0.8 * progress;
        this.ctx.fillStyle = `rgba(0, 0, 0, ${overlayAlpha})`;
        this.ctx.fillRect(0, 0, BOARD_PIXEL_SIZE, BOARD_PIXEL_SIZE);

        // Animated text - fade in and scale up
        const textAlpha = progress;
        const textScale = 0.5 + (progress * 0.5); // Scale from 0.5 to 1.0
        
        this.ctx.save();
        this.ctx.globalAlpha = textAlpha;
        this.ctx.translate(BOARD_PIXEL_SIZE / 2, BOARD_PIXEL_SIZE / 2);
        this.ctx.scale(textScale, textScale);
        this.ctx.translate(-BOARD_PIXEL_SIZE / 2, -BOARD_PIXEL_SIZE / 2);

        // Game over text with glow effect - positioned at top
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 48px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Add text shadow for glow
        this.ctx.shadowColor = '#ff6b6b';
        this.ctx.shadowBlur = 20;
        this.ctx.fillText('GAME OVER', BOARD_PIXEL_SIZE / 2, 80);
        
        // Reset shadow
        this.ctx.shadowBlur = 0;
        
        this.ctx.restore();

        // Draw 4x4 grid representing final board state - positioned below game over text
        if (placedBlocks.length > 0) {
            this.drawFinalBoardGrid(placedBlocks, progress);
        }
        
        // Restart prompt static text for clarity - positioned at bottom
        this.ctx.save();
        this.ctx.globalAlpha = textAlpha;
        this.ctx.font = '24px sans-serif';
        this.ctx.fillStyle = '#4ECDC4';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        this.ctx.fillText(
            'Use the Restart button to play again',
            BOARD_PIXEL_SIZE / 2,
            BOARD_PIXEL_SIZE - 50
        );
        this.ctx.restore();
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
        const gridSize = 120; // Total size of 4x4 grid
        const cellSize = gridSize / 4;
        const gridX = BOARD_PIXEL_SIZE / 2 - gridSize / 2;
        const gridY = 150; // Below the "GAME OVER" text

        this.ctx.save();
        this.ctx.globalAlpha = progress; // Full opacity when progress is 1

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
                    this.ctx.fillStyle = darkestColor;
                    this.ctx.beginPath();
                    this.ctx.roundRect(x, y, cellSize, cellSize, 4);
                    this.ctx.fill();
                } else {
                    // Draw empty cell with a subtle border to show it's empty
                    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
                    this.ctx.beginPath();
                    this.ctx.roundRect(x, y, cellSize, cellSize, 4);
                    this.ctx.fill();
                    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
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
        this.ctx.translate(BOARD_PIXEL_SIZE / 2, BOARD_PIXEL_SIZE / 2);
        this.ctx.scale(scale, scale);
        this.ctx.translate(-BOARD_PIXEL_SIZE / 2, -BOARD_PIXEL_SIZE / 2);
        
        // Level up text with glow effect
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 64px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Add text shadow for glow
        this.ctx.shadowColor = '#4ECDC4';
        this.ctx.shadowBlur = 30;
        this.ctx.fillText('Level up!', BOARD_PIXEL_SIZE / 2, BOARD_PIXEL_SIZE / 2);
        
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
        level: number = 1
    ): void {
        // Update current level for highlight color calculation
        this.currentLevel = level;
        this.clear();
        if (this.settings.showGrid) {
            this.drawGrid();
        }
        this.drawBoard(placedBlocks, animatingCells, totalShapesPlaced);
        
        // Draw preview line highlights if dragging and position would clear lines
        if (dragState.isDragging && dragState.isValidPosition && dragState.previewLinesCleared) {
            this.drawPreviewLineHighlights(dragState.previewLinesCleared, placedBlocks);
        }
        
        this.drawQueue(queue);
        if (this.settings.showGhostPreview) {
            this.drawDragPreview(dragState);
        }

        if (gameOver) {
            this.drawGameOver(gameOverProgress, placedBlocks);
        }
        
        if (levelUpProgress > 0 && levelUpProgress < 1) {
            this.drawLevelUp(levelUpProgress);
        }
    }
}

