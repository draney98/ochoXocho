/**
 * Canvas rendering system for drawing the game board, shapes, queue, and score
 */

import { Position, Shape, PlacedBlock, DragState, AnimatingCell, GameSettings } from './types';
import { Board } from './board';
import { getShapeColor, getShapeIndex, getShapePointValue } from './shapes';
import {
    BOARD_PIXEL_SIZE,
    CELL_SIZE,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    QUEUE_AREA_HEIGHT,
    QUEUE_AREA_PADDING,
    QUEUE_CELL_SIZE,
    QUEUE_ITEM_HEIGHT,
    getQueueItemRect,
} from './constants';
import { GAMEPLAY_CONFIG } from './config';

/**
 * Renderer class handles all canvas drawing operations
 */
export class Renderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private settings: GameSettings;

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
        const body = document.body;
        if (!body) return '';
        return getComputedStyle(body).getPropertyValue(name).trim();
    }

    /**
     * Darkens a hex color by multiplying RGB values by darkness factor
     * @param hexColor - Hex color string (e.g., "#ff0000")
     * @param darkness - Darkness multiplier (1.0 = full brightness, 0.0 = black)
     * @returns Darkened hex color string
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
        
        // Apply darkness factor
        const darkenedR = Math.floor(r * factor);
        const darkenedG = Math.floor(g * factor);
        const darkenedB = Math.floor(b * factor);
        
        // Convert back to hex
        return `#${darkenedR.toString(16).padStart(2, '0')}${darkenedG.toString(16).padStart(2, '0')}${darkenedB.toString(16).padStart(2, '0')}`;
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
        this.ctx.strokeStyle = '#e0e0e0';
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
                // Calculate point value: base value + points per tier for each level increment since placement
                // Oldest blocks (placed earliest) will have the highest values
                const placementLevel = Math.floor(block.totalShapesPlacedAtPlacement / GAMEPLAY_CONFIG.shapesPerValueTier);
                const currentLevel = Math.floor(totalShapesPlaced / GAMEPLAY_CONFIG.shapesPerValueTier);
                
                // Each block increments by points per tier for every tier of shapes placed after it was placed
                const levelIncrements = currentLevel - placementLevel;
                const displayValue = block.pointValue + (levelIncrements * GAMEPLAY_CONFIG.pointsPerTier);
                
                // Apply darkness to color
                const darkenedColor = this.darkenColor(block.color, block.darkness);
                
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

            // Draw filled cell
            this.ctx.fillStyle = color;
            this.ctx.fillRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);

            // Draw border
            this.ctx.strokeStyle = '#333';
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(x + 2, y + 2, CELL_SIZE - 4, CELL_SIZE - 4);

            // Draw point value if provided
            if (pointValue !== undefined && !isGhost) {
                // Calculate center of the filled block (accounting for 2px padding)
                const blockX = x + 2;
                const blockY = y + 2;
                const blockSize = CELL_SIZE - 4;
                const centerX = blockX + blockSize / 2;
                const centerY = blockY + blockSize / 2;
                
                // Use a semi-transparent white for less contrast
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                // Font size should almost fill the cell (about 80% of cell size)
                const fontSize = Math.floor(CELL_SIZE * 0.8);
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
     * Draws the queue of upcoming shapes beneath the board
     * @param queue - Array of shapes in the queue
     */
    drawQueue(queue: Shape[]): void {
        const queueAreaTop = BOARD_PIXEL_SIZE;

        // Get theme colors for queue area (re-read on each render to catch theme changes)
        const queueStripBg = this.getCSSVariable('--queue-strip-bg') || '#f5f5f5';
        const queueCardBg = this.getCSSVariable('--queue-card-bg') || '#ffffff';
        const queueCardBorder = this.getCSSVariable('--queue-card-border') || '#dddddd';
        const queueShapeBorder = this.getCSSVariable('--queue-shape-border') || '#333333';
        const queuePointText = this.getCSSVariable('--queue-point-text') || '#999999';

        // Draw queue background strip with theme color
        this.ctx.fillStyle = queueStripBg;
        this.ctx.fillRect(0, queueAreaTop, CANVAS_WIDTH, QUEUE_AREA_HEIGHT);

        for (let i = 0; i < queue.length; i++) {
            const shape = queue[i];
            const shapeColor = getShapeColor(getShapeIndex(shape));
            const rect = getQueueItemRect(i, queue.length);

            // Card background
            this.ctx.fillStyle = queueCardBg;
            this.ctx.fillRect(rect.x, rect.y, rect.width, QUEUE_ITEM_HEIGHT);
            this.ctx.strokeStyle = queueCardBorder;
            this.ctx.lineWidth = 2;
            this.ctx.strokeRect(rect.x, rect.y, rect.width, QUEUE_ITEM_HEIGHT);

            const minX = Math.min(...shape.map(b => b.x));
            const maxX = Math.max(...shape.map(b => b.x));
            const minY = Math.min(...shape.map(b => b.y));
            const maxY = Math.max(...shape.map(b => b.y));
            const shapeWidth = maxX - minX + 1;
            const shapeHeight = maxY - minY + 1;

            const offsetX =
                rect.x +
                (rect.width - shapeWidth * QUEUE_CELL_SIZE) / 2 -
                minX * QUEUE_CELL_SIZE;
            const offsetY =
                rect.y +
                (QUEUE_ITEM_HEIGHT - shapeHeight * QUEUE_CELL_SIZE) / 2 -
                minY * QUEUE_CELL_SIZE;

            for (const block of shape) {
                const x = offsetX + block.x * QUEUE_CELL_SIZE;
                const y = offsetY + block.y * QUEUE_CELL_SIZE;

                this.ctx.fillStyle = shapeColor;
                this.ctx.fillRect(
                    x + 2,
                    y + 2,
                    QUEUE_CELL_SIZE - 4,
                    QUEUE_CELL_SIZE - 4
                );

                this.ctx.strokeStyle = queueShapeBorder;
                this.ctx.lineWidth = 2;
                this.ctx.strokeRect(
                    x + 2,
                    y + 2,
                    QUEUE_CELL_SIZE - 4,
                    QUEUE_CELL_SIZE - 4
                );
            }

            // Draw point value in bottom right corner
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
            
            // Draw green border around valid placement
            this.ctx.strokeStyle = '#4CAF50';
            this.ctx.lineWidth = 3;
            this.ctx.globalAlpha = 0.7;
            for (const block of dragState.shape) {
                const x = (position.x + block.x) * CELL_SIZE;
                const y = (position.y + block.y) * CELL_SIZE;
                this.ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
            }
            this.ctx.globalAlpha = 1.0;
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
        
        // Calculate animation values (fade out and scale down)
        const alpha = 1 - cell.progress; // Fade from 1 to 0
        const scale = 1 - cell.progress * 0.5; // Scale from 1 to 0.5
        
        const centerX = x + CELL_SIZE / 2;
        const centerY = y + CELL_SIZE / 2;
        const size = (CELL_SIZE - 4) * scale;
        const offsetX = (CELL_SIZE - 4 - size) / 2;
        const offsetY = (CELL_SIZE - 4 - size) / 2;
        
        this.ctx.save();
        this.ctx.globalAlpha = alpha;
        
        // Draw filled cell (scaled)
        this.ctx.fillStyle = cell.color;
        this.ctx.fillRect(x + 2 + offsetX, y + 2 + offsetY, size, size);
        
        // Draw border (scaled)
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(x + 2 + offsetX, y + 2 + offsetY, size, size);
        
        this.ctx.restore();
    }

    /**
     * Draws game over overlay with animation
     * @param progress - Animation progress from 0 to 1
     */
    drawGameOver(progress: number = 1): void {
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

        // Game over text with glow effect
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 48px sans-serif';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Add text shadow for glow
        this.ctx.shadowColor = '#ff6b6b';
        this.ctx.shadowBlur = 20;
        this.ctx.fillText('GAME OVER', BOARD_PIXEL_SIZE / 2, BOARD_PIXEL_SIZE / 2 - 30);
        
        // Reset shadow
        this.ctx.shadowBlur = 0;
        
        // Restart prompt static text for clarity
        this.ctx.font = '24px sans-serif';
        this.ctx.fillStyle = '#4ECDC4';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(
            'Use the Restart button to play again',
            BOARD_PIXEL_SIZE / 2,
            BOARD_PIXEL_SIZE / 2 + 50
        );
        
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
     */
    render(
        board: Board,
        placedBlocks: PlacedBlock[],
        queue: Shape[],
        dragState: DragState,
        gameOver: boolean,
        animatingCells: AnimatingCell[] = [],
        gameOverProgress: number = 0,
        totalShapesPlaced: number = 0
    ): void {
        this.clear();
        if (this.settings.showGrid) {
            this.drawGrid();
        }
        this.drawBoard(placedBlocks, animatingCells, totalShapesPlaced);
        this.drawQueue(queue);
        if (this.settings.showGhostPreview) {
            this.drawDragPreview(dragState);
        }

        if (gameOver) {
            this.drawGameOver(gameOverProgress);
        }
    }
}

