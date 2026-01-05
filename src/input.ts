/**
 * Mouse input handling for drag-and-drop operations
 */

import { Position, DragState, Shape, GameSettings } from './types';
import { snapToGrid, canPlaceShape } from './validator';
import { Board } from './board';
import {
    BOARD_PIXEL_SIZE,
    CELL_SIZE,
    CANVAS_HEIGHT,
    BOARD_OFFSET_X,
    BOARD_OFFSET_Y,
    getQueueItemRect,
} from './constants';

/**
 * Input handler class manages mouse interactions for dragging shapes
 */
export class InputHandler {
    private canvas: HTMLCanvasElement;
    private dragState: DragState;
    private onPlaceShape: (shapeIndex: number, position: Position) => void;
    private onRemoveFromQueue: (shapeIndex: number) => void;
    private onRestoreToQueue: (shapeIndex: number, shape: Shape) => void;
    private board: Board;
    private queue: (Shape | null)[];
    private originalQueueIndex: number = -1; // Track where the shape was originally in the queue
    private settings: GameSettings;

    constructor(
        canvas: HTMLCanvasElement,
        board: Board,
        queue: (Shape | null)[],
        onPlaceShape: (shapeIndex: number, position: Position) => void,
        onRemoveFromQueue: (shapeIndex: number) => void,
        onRestoreToQueue: (shapeIndex: number, shape: Shape) => void,
        settings: GameSettings
    ) {
        this.canvas = canvas;
        this.board = board;
        this.queue = queue;
        this.onPlaceShape = onPlaceShape;
        this.onRemoveFromQueue = onRemoveFromQueue;
        this.onRestoreToQueue = onRestoreToQueue;
        this.settings = settings;
        this.dragState = {
            isDragging: false,
            shapeIndex: -1,
            shape: null,
            mousePosition: { x: 0, y: 0 },
            isValidPosition: false,
            hasBoardPosition: false,
            anchorPoint: undefined,
            previewLinesCleared: undefined,
            controlOrigin: undefined,
            projectedBoardPosition: undefined,
            lastProjectedGridCell: undefined,
        };

        this.setupEventListeners();
    }

    /**
     * Sets up mouse and touch event listeners on the canvas
     */
    private setupEventListeners(): void {
        // Mouse events
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
        
        // Touch events for mobile
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: false });
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        this.canvas.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: false });
        this.canvas.addEventListener('touchcancel', this.handleTouchCancel.bind(this), { passive: false });
    }

    /**
     * Updates the queue reference when new shapes are generated
     * @param newQueue - The new queue of shapes
     */
    updateQueue(newQueue: (Shape | null)[]): void {
        this.queue = newQueue;
    }

    /**
     * Updates the board reference
     * @param newBoard - The current board state
     */
    updateBoard(newBoard: Board): void {
        // CRITICAL: Always use the latest board reference
        // The board instance is shared, so we need to ensure we're using the same instance
        // that the Game class is modifying
        this.board = newBoard;
        
        // Force validation to re-check if currently dragging
        // This ensures validation state matches the latest board state
        if (this.dragState.isDragging && this.dragState.shape && this.dragState.hasBoardPosition) {
            // Re-validate the current position with the fresh board state
            // Always re-validate - don't trust cached state
            // Get a fresh grid copy to ensure we're reading the absolute latest state
            const grid = this.board.getGrid();
            const isValid = canPlaceShape(this.board, this.dragState.shape, this.dragState.mousePosition);
            
            // In dev mode, log detailed state for debugging
            if (this.settings.devMode) {
                console.log(`[BOARD UPDATE] Re-validated position (${this.dragState.mousePosition.x}, ${this.dragState.mousePosition.y}): ${isValid}`);
                // Log the actual grid state for the shape's blocks
                for (const block of this.dragState.shape) {
                    const absX = this.dragState.mousePosition.x + block.x;
                    const absY = this.dragState.mousePosition.y + block.y;
                    if (absX >= 0 && absX < 8 && absY >= 0 && absY < 8) {
                        const gridValue = grid[absY][absX];
                        const isEmpty = this.board.isCellEmpty({ x: absX, y: absY });
                        if (gridValue || !isEmpty) {
                            console.log(`  [BOARD UPDATE] Block (${block.x},${block.y}) -> grid(${absX},${absY}): grid[${absY}][${absX}]=${gridValue}, isCellEmpty=${isEmpty}`);
                        }
                    }
                }
            }
            
            this.dragState.isValidPosition = isValid;
        }
    }

    /**
     * Debug method: Resets drag state and forces board synchronization
     * This can help fix validation issues after autoplace operations
     */
    debugReset(): void {
        // Reset drag state completely
        this.dragState = {
            isDragging: false,
            shapeIndex: -1,
            shape: null,
            mousePosition: { x: 0, y: 0 },
            isValidPosition: false,
            hasBoardPosition: false,
            anchorPoint: undefined,
            previewLinesCleared: undefined,
            controlOrigin: undefined,
            projectedBoardPosition: undefined,
            lastProjectedGridCell: undefined,
        };
        this.originalQueueIndex = -1;
        // Clear any cached validation state
        (this as any).lastInvalidLog = null;
        if (this.settings.devMode) {
            console.log('[DEBUG] Input handler state reset');
        }
    }

    /**
     * Updates the settings reference
     * @param newSettings - The updated settings
     */
    updateSettings(newSettings: GameSettings): void {
        this.settings = newSettings;
    }

    /**
     * Converts screen event coordinates to normalized canvas coordinates
     * Uses getBoundingClientRect() to account for CSS scaling
     * This ensures 1 pixel of movement on screen equals 1 pixel in canvas space
     * @param event - MouseEvent or TouchEvent
     * @returns Normalized canvas coordinates {x, y}
     */
    private getCanvasCoordinates(event: MouseEvent | TouchEvent): { x: number; y: number } {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        
        // Get client coordinates from event
        let clientX: number;
        let clientY: number;
        
        if (event instanceof MouseEvent) {
            clientX = event.clientX;
            clientY = event.clientY;
        } else if (event instanceof TouchEvent) {
            const touch = event.touches[0] || event.changedTouches[0];
            if (!touch) {
                return { x: 0, y: 0 };
            }
            clientX = touch.clientX;
            clientY = touch.clientY;
        } else {
            return { x: 0, y: 0 };
        }
        
        // Calculate normalized canvas coordinates
        const x = (clientX - rect.left) * scaleX;
        const y = (clientY - rect.top) * scaleY;
        
        return { x, y };
    }

    /**
     * Handles mouse down event - starts dragging if clicking on a shape in queue
     * @param event - Mouse event
     */
    private handleMouseDown(event: MouseEvent): void {
        // Don't allow dragging if game is over
        // (This will be checked via the game state, but we can add an early return)
        const { x: canvasX, y: canvasY } = this.getCanvasCoordinates(event);

        // Check if click is within any queue card under the board
        // Use fixed queue size (3) for hit detection so areas don't move
        const QUEUE_SIZE = 3;
        if (canvasY >= BOARD_PIXEL_SIZE && canvasY <= CANVAS_HEIGHT) {
            for (let i = 0; i < QUEUE_SIZE; i++) {
                const rect = getQueueItemRect(i, QUEUE_SIZE);
                if (
                    canvasX >= rect.x &&
                    canvasX <= rect.x + rect.width &&
                    canvasY >= rect.y &&
                    canvasY <= rect.y + rect.height
                ) {
                    // Only allow dragging if there's actually a shape at this index
                    if (i < this.queue.length && this.queue[i]) {
                        this.dragState.isDragging = true;
                        this.dragState.shapeIndex = i;
                        this.dragState.shape = this.queue[i];
                        this.originalQueueIndex = i; // Store original position
                        // Remove shape from queue immediately when selected
                        this.onRemoveFromQueue(i);
                        break;
                    }
                }
            }
        }
    }

    /**
     * Calculates the grid position for a shape based on cursor position
     * SIMPLIFIED: The cursor position directly maps to a grid cell
     * The shape's top-left block (minX, minY) will align with the grid cell under the cursor
     * @param cursorPosition - The cursor position in canvas coordinates
     * @param shape - The shape being dragged
     * @returns The grid position where the shape would be placed, or null if outside board
     */
    private calculateGridPosition(cursorPosition: { x: number; y: number }, shape: Shape): Position | null {
        // Adjust cursor position to account for board offset
        const adjustedX = cursorPosition.x - BOARD_OFFSET_X;
        const adjustedY = cursorPosition.y - BOARD_OFFSET_Y;
        
        // Check if cursor is over the board
        if (adjustedX < 0 || adjustedX >= BOARD_PIXEL_SIZE || 
            adjustedY < 0 || adjustedY >= BOARD_PIXEL_SIZE) {
            return null;
        }

        // Find the top-left block of the shape (minimum x and y coordinates)
        const minX = Math.min(...shape.map(b => b.x));
        const minY = Math.min(...shape.map(b => b.y));

        // Convert adjusted cursor position to grid coordinates
        const cursorGridX = Math.floor(adjustedX / CELL_SIZE);
        const cursorGridY = Math.floor(adjustedY / CELL_SIZE);

        // The shape's grid position: align the shape's top-left block with the cursor's grid cell
        // If cursor is at grid (cx, cy) and shape's top-left is at (minX, minY),
        // then shape's grid position is (cx - minX, cy - minY)
        const shapeGridX = cursorGridX - minX;
        const shapeGridY = cursorGridY - minY;
        
        return {
            x: shapeGridX,
            y: shapeGridY
        };
    }

    /**
     * Maps finger position to projected board position using reach scaling
     * The control zone at the bottom of the screen uses variable scaling to allow
     * small thumb movements to control large board movements.
     * @param fingerPosition - Current finger position in canvas coordinates
     * @param controlOrigin - Initial touch position (control zone origin)
     * @returns Projected board position in canvas coordinates
     */
    private projectBoardPosition(
        fingerPosition: { x: number; y: number },
        controlOrigin: { x: number; y: number }
    ): { x: number; y: number } {
        const controlZoneTop = CANVAS_HEIGHT * (1 - this.settings.controlZoneHeight);
        const controlZoneHeight = CANVAS_HEIGHT - controlZoneTop;
        
        // If finger is in control zone (bottom of screen)
        if (fingerPosition.y > controlZoneTop) {
            // Calculate progress through control zone (0 at top of zone, 1 at bottom)
            const progress = (fingerPosition.y - controlZoneTop) / controlZoneHeight;
            
            // Variable scaling: stronger at bottom, weaker at top of control zone
            // Use smooth easing for natural feel
            const easedProgress = progress * progress; // Ease-in curve
            const scale = this.settings.controlZoneMinScale + 
                         (this.settings.controlZoneMaxScale - this.settings.controlZoneMinScale) * easedProgress;
            
            // Calculate delta from control origin
            const deltaX = fingerPosition.x - controlOrigin.x;
            const deltaY = fingerPosition.y - controlOrigin.y;
            
            // Project using scaled delta
            return {
                x: controlOrigin.x + deltaX * scale,
                y: controlOrigin.y + deltaY * scale
            };
        } else {
            // Outside control zone: use 1:1 mapping with smooth transition
            // Smooth transition at boundary to prevent jarring change
            const distanceFromBoundary = controlZoneTop - fingerPosition.y;
            const transitionZone = 50; // Pixels of smooth transition
            
            if (distanceFromBoundary < transitionZone) {
                // In transition zone: blend between scaled and 1:1
                const blendFactor = distanceFromBoundary / transitionZone;
                const minScale = this.settings.controlZoneMinScale;
                
                // Calculate what the projected position would be at boundary
                const boundaryY = controlZoneTop;
                const boundaryDeltaX = fingerPosition.x - controlOrigin.x;
                const boundaryDeltaY = boundaryY - controlOrigin.y;
                const boundaryScale = minScale;
                const boundaryProjectedX = controlOrigin.x + boundaryDeltaX * boundaryScale;
                const boundaryProjectedY = controlOrigin.y + boundaryDeltaY * boundaryScale;
                
                // Blend between boundary projection and 1:1
                const oneToOneX = fingerPosition.x;
                const oneToOneY = fingerPosition.y;
                
                return {
                    x: boundaryProjectedX * blendFactor + oneToOneX * (1 - blendFactor),
                    y: boundaryProjectedY * blendFactor + oneToOneY * (1 - blendFactor)
                };
            } else {
                // Fully outside: pure 1:1 mapping
                return {
                    x: fingerPosition.x,
                    y: fingerPosition.y
                };
            }
        }
    }

    /**
     * Handles mouse move event - updates drag position and validates placement
     * @param event - Mouse event
     */
    private handleMouseMove(event: MouseEvent): void {
        if (!this.dragState.isDragging || !this.dragState.shape) return;

        const { x: canvasX, y: canvasY } = this.getCanvasCoordinates(event);

        // Update anchor point to follow the cursor exactly (normalized canvas coordinates)
        this.dragState.anchorPoint = { x: canvasX, y: canvasY };
        
        // For mouse, use 1:1 mapping (no projection needed)
        // Mouse has full precision, so no need for reach mapping
        const gridPos = this.calculateGridPosition({ x: canvasX, y: canvasY }, this.dragState.shape);
        
        if (gridPos) {
            this.dragState.mousePosition = gridPos;
            this.dragState.hasBoardPosition = true;
            
            // CRITICAL: Always validate with the absolute latest board state
            // Get a fresh grid copy to ensure we're not reading stale data
            // The board reference is shared, but we need to ensure we read the current grid
            const isValid = canPlaceShape(this.board, this.dragState.shape, gridPos);
            
            // In dev mode, always log validation details to diagnose issues
            if (this.settings.devMode) {
                const grid = this.board.getGrid(); // Get fresh grid copy
                let manualCheck = true;
                const invalidBlocks: Array<{block: {x: number, y: number}, abs: {x: number, y: number}, reason: string}> = [];
                
                for (const block of this.dragState.shape) {
                    const absX = gridPos.x + block.x;
                    const absY = gridPos.y + block.y;
                    if (absX < 0 || absX >= 8 || absY < 0 || absY >= 8) {
                        manualCheck = false;
                        invalidBlocks.push({block, abs: {x: absX, y: absY}, reason: 'out of bounds'});
                        break;
                    }
                    const gridValue = grid[absY][absX];
                    const isEmptyMethod = this.board.isCellEmpty({ x: absX, y: absY });
                    if (gridValue || !isEmptyMethod) {
                        manualCheck = false;
                        invalidBlocks.push({
                            block, 
                            abs: {x: absX, y: absY}, 
                            reason: `grid[${absY}][${absX}]=${gridValue}, isCellEmpty=${isEmptyMethod}`
                        });
                        break;
                    }
                }
                
                if (!isValid || !manualCheck) {
                    const lastLog = (this as any).lastInvalidLog;
                    const logKey = `${gridPos.x},${gridPos.y}`;
                    if (!lastLog || lastLog !== logKey) {
                        console.log(`[VALIDATION] Position (${gridPos.x}, ${gridPos.y}) invalid.`);
                        console.log(`  Cursor: (${canvasX.toFixed(1)}, ${canvasY.toFixed(1)})`);
                        console.log(`  Grid cell under cursor: (${Math.floor(canvasX / CELL_SIZE)}, ${Math.floor(canvasY / CELL_SIZE)})`);
                        const minX = Math.min(...this.dragState.shape.map(b => b.x));
                        const minY = Math.min(...this.dragState.shape.map(b => b.y));
                        console.log(`  Shape top-left offset: (${minX}, ${minY})`);
                        console.log(`  canPlaceShape=${isValid}, manualCheck=${manualCheck}`);
                        if (invalidBlocks.length > 0) {
                            invalidBlocks.forEach(({block, abs, reason}) => {
                                console.log(`  Block (${block.x},${block.y}) -> grid(${abs.x},${abs.y}): ${reason}`);
                            });
                        }
                        (this as any).lastInvalidLog = logKey;
                    }
                } else {
                    (this as any).lastInvalidLog = null;
                }
                
                if (manualCheck !== isValid) {
                    console.error(`[VALIDATION BUG] Position (${gridPos.x}, ${gridPos.y}): manual=${manualCheck}, canPlaceShape=${isValid}`);
                }
            }
            
            this.dragState.isValidPosition = isValid;
        } else {
            // Cursor is outside the board
            this.dragState.hasBoardPosition = false;
            this.dragState.isValidPosition = false;
            this.dragState.mousePosition = { x: 0, y: 0 };
        }
        this.dragState.previewLinesCleared = undefined;
    }

    /**
     * Handles mouse up event - places shape if position is valid
     * @param event - Mouse event
     */
    private handleMouseUp(event: MouseEvent): void {
        if (!this.dragState.isDragging || !this.dragState.shape || !this.dragState.anchorPoint) return;

        // Update anchor to final position (normalized canvas coordinates)
        const { x: canvasX, y: canvasY } = this.getCanvasCoordinates(event);
        this.dragState.anchorPoint = { x: canvasX, y: canvasY };

        // Check if cursor is over the queue area - if so, always restore to queue
        const isOverQueueArea = canvasY >= BOARD_OFFSET_Y + BOARD_PIXEL_SIZE && canvasY <= CANVAS_HEIGHT;
        
        // Only allow placement on the playing surface (board area with valid empty cells)
        let shapePlaced = false;
        if (!isOverQueueArea) {
            // Calculate grid position directly from cursor (accounting for board offset)
            const gridPos = this.calculateGridPosition({ x: canvasX, y: canvasY }, this.dragState.shape);

            // Check if cursor is over the board area and placement is valid
            const adjustedX = canvasX - BOARD_OFFSET_X;
            const adjustedY = canvasY - BOARD_OFFSET_Y;
            if (gridPos && adjustedX >= 0 && adjustedX < BOARD_PIXEL_SIZE && 
                adjustedY >= 0 && adjustedY < BOARD_PIXEL_SIZE) {
                
                // Only place if the position is valid (empty cells only - canPlaceShape checks this)
                if (canPlaceShape(this.board, this.dragState.shape, gridPos)) {
                    // Pass -1 as shapeIndex since shape was already removed from queue
                    this.onPlaceShape(-1, gridPos);
                    shapePlaced = true;
                }
            }
        }

        // If shape wasn't placed (invalid position, over queue area, or outside board), restore it to queue
        if (!shapePlaced && this.dragState.shape && this.originalQueueIndex >= 0) {
            this.onRestoreToQueue(this.originalQueueIndex, this.dragState.shape);
        }

        // Reset drag state
        this.originalQueueIndex = -1;
        this.dragState = {
            isDragging: false,
            shapeIndex: -1,
            shape: null,
            mousePosition: { x: 0, y: 0 },
            isValidPosition: false,
            hasBoardPosition: false,
            anchorPoint: undefined,
            previewLinesCleared: undefined,
            controlOrigin: undefined,
            projectedBoardPosition: undefined,
            lastProjectedGridCell: undefined,
        };
    }

    /**
     * Handles mouse leave event - cancels drag operation
     */
    private handleMouseLeave(): void {
        // If shape wasn't placed, restore it to queue
        if (this.dragState.shape && this.originalQueueIndex >= 0) {
            this.onRestoreToQueue(this.originalQueueIndex, this.dragState.shape);
        }

        // Reset drag state
        this.originalQueueIndex = -1;
        this.dragState = {
            isDragging: false,
            shapeIndex: -1,
            shape: null,
            mousePosition: { x: 0, y: 0 },
            isValidPosition: false,
            hasBoardPosition: false,
            anchorPoint: undefined,
            previewLinesCleared: undefined,
            controlOrigin: undefined,
            projectedBoardPosition: undefined,
            lastProjectedGridCell: undefined,
        };
    }

    /**
     * Handles touch start event - starts dragging if touching a shape in queue
     * @param event - Touch event
     */
    private handleTouchStart(event: TouchEvent): void {
        event.preventDefault(); // Prevent scrolling
        if (event.touches.length === 0) return;
        
        const { x: canvasX, y: canvasY } = this.getCanvasCoordinates(event);

        // Check if touch is within any queue card under the board
        // Use fixed queue size (3) for hit detection so areas don't move
        const QUEUE_SIZE = 3;
        if (canvasY >= BOARD_OFFSET_Y + BOARD_PIXEL_SIZE && canvasY <= CANVAS_HEIGHT) {
            for (let i = 0; i < QUEUE_SIZE; i++) {
                const rect = getQueueItemRect(i, QUEUE_SIZE);
                if (
                    canvasX >= rect.x &&
                    canvasX <= rect.x + rect.width &&
                    canvasY >= rect.y &&
                    canvasY <= rect.y + rect.height
                ) {
                    // Only allow dragging if there's actually a shape at this index
                    if (i < this.queue.length && this.queue[i]) {
                        this.dragState.isDragging = true;
                        this.dragState.shapeIndex = i;
                        this.dragState.shape = this.queue[i];
                        this.originalQueueIndex = i; // Store original position
                        
                        // Record control origin for reach mapping (initial touch position)
                        this.dragState.controlOrigin = { x: canvasX, y: canvasY };
                        
                        // Set anchor point to exact touch location (piece follows finger)
                        this.dragState.anchorPoint = { x: canvasX, y: canvasY };
                        
                        // Do NOT remove shape from queue yet - keep it visible
                        // It will be removed when dropped on valid position
                        break;
                    }
                }
            }
        }
    }

    /**
     * Handles touch move event - updates drag position and validates placement
     * @param event - Touch event
     */
    private handleTouchMove(event: TouchEvent): void {
        event.preventDefault(); // Prevent scrolling
        if (!this.dragState.isDragging || event.touches.length === 0 || !this.dragState.shape || !this.dragState.controlOrigin) return;

        const { x: canvasX, y: canvasY } = this.getCanvasCoordinates(event);

        // Update anchor point to follow the finger exactly (no offset)
        this.dragState.anchorPoint = { x: canvasX, y: canvasY };
        
        // Calculate projected board position using reach mapping
        const projectedPos = this.projectBoardPosition(
            { x: canvasX, y: canvasY },
            this.dragState.controlOrigin
        );
        this.dragState.projectedBoardPosition = projectedPos;
        
        // Convert projected position to grid coordinates
        const gridPos = this.calculateGridPosition(projectedPos, this.dragState.shape);
        
        if (gridPos) {
            this.dragState.mousePosition = gridPos;
            this.dragState.hasBoardPosition = true;
            
            // CRITICAL: Always validate with the absolute latest board state
            // Get a fresh grid copy to ensure we're not reading stale data
            // The board reference is shared, but we need to ensure we read the current grid
            const isValid = canPlaceShape(this.board, this.dragState.shape, gridPos);
            
            // In dev mode, always log validation details to diagnose issues
            if (this.settings.devMode) {
                const grid = this.board.getGrid(); // Get fresh grid copy
                let manualCheck = true;
                const invalidBlocks: Array<{block: {x: number, y: number}, abs: {x: number, y: number}, reason: string}> = [];
                
                for (const block of this.dragState.shape) {
                    const absX = gridPos.x + block.x;
                    const absY = gridPos.y + block.y;
                    if (absX < 0 || absX >= 8 || absY < 0 || absY >= 8) {
                        manualCheck = false;
                        invalidBlocks.push({block, abs: {x: absX, y: absY}, reason: 'out of bounds'});
                        break;
                    }
                    const gridValue = grid[absY][absX];
                    const isEmptyMethod = this.board.isCellEmpty({ x: absX, y: absY });
                    if (gridValue || !isEmptyMethod) {
                        manualCheck = false;
                        invalidBlocks.push({
                            block, 
                            abs: {x: absX, y: absY}, 
                            reason: `grid[${absY}][${absX}]=${gridValue}, isCellEmpty=${isEmptyMethod}`
                        });
                        break;
                    }
                }
                
                if (!isValid || !manualCheck) {
                    const lastLog = (this as any).lastInvalidLog;
                    const logKey = `${gridPos.x},${gridPos.y}`;
                    if (!lastLog || lastLog !== logKey) {
                        console.log(`[VALIDATION] Position (${gridPos.x}, ${gridPos.y}) invalid.`);
                        console.log(`  Cursor: (${canvasX.toFixed(1)}, ${canvasY.toFixed(1)})`);
                        console.log(`  Grid cell under cursor: (${Math.floor(canvasX / CELL_SIZE)}, ${Math.floor(canvasY / CELL_SIZE)})`);
                        const minX = Math.min(...this.dragState.shape.map(b => b.x));
                        const minY = Math.min(...this.dragState.shape.map(b => b.y));
                        console.log(`  Shape top-left offset: (${minX}, ${minY})`);
                        console.log(`  canPlaceShape=${isValid}, manualCheck=${manualCheck}`);
                        if (invalidBlocks.length > 0) {
                            invalidBlocks.forEach(({block, abs, reason}) => {
                                console.log(`  Block (${block.x},${block.y}) -> grid(${abs.x},${abs.y}): ${reason}`);
                            });
                        }
                        (this as any).lastInvalidLog = logKey;
                    }
                } else {
                    (this as any).lastInvalidLog = null;
                }
                
                if (manualCheck !== isValid) {
                    console.error(`[VALIDATION BUG] Position (${gridPos.x}, ${gridPos.y}): manual=${manualCheck}, canPlaceShape=${isValid}`);
                }
            }
            
            this.dragState.isValidPosition = isValid;
        } else {
            // Cursor is outside the board
            this.dragState.hasBoardPosition = false;
            this.dragState.isValidPosition = false;
            this.dragState.mousePosition = { x: 0, y: 0 };
        }
        this.dragState.previewLinesCleared = undefined;
    }

    /**
     * Handles touch end event - places shape if position is valid
     * @param event - Touch event
     */
    private handleTouchEnd(event: TouchEvent): void {
        event.preventDefault();
        if (!this.dragState.isDragging || !this.dragState.shape || !this.dragState.controlOrigin) return;

        // Update anchor to final position (normalized canvas coordinates)
        const { x: canvasX, y: canvasY } = this.getCanvasCoordinates(event);
        this.dragState.anchorPoint = { x: canvasX, y: canvasY };

        // Calculate final projected position using reach mapping
        const projectedPos = this.projectBoardPosition(
            { x: canvasX, y: canvasY },
            this.dragState.controlOrigin
        );
        this.dragState.projectedBoardPosition = projectedPos;

        // Check if cursor is over the queue area - if so, always restore to queue
        const isOverQueueArea = canvasY >= BOARD_OFFSET_Y + BOARD_PIXEL_SIZE && canvasY <= CANVAS_HEIGHT;
        
        // Only allow placement on the playing surface (board area with valid empty cells)
        let shapePlaced = false;
        if (!isOverQueueArea) {
            // Calculate grid position from projected position (not finger position)
            const gridPos = this.calculateGridPosition(projectedPos, this.dragState.shape);

            // Check if projected position is over the board area and placement is valid
            const adjustedX = projectedPos.x - BOARD_OFFSET_X;
            const adjustedY = projectedPos.y - BOARD_OFFSET_Y;
            if (gridPos && adjustedX >= 0 && adjustedX < BOARD_PIXEL_SIZE && 
                adjustedY >= 0 && adjustedY < BOARD_PIXEL_SIZE) {
                
                // Only place if the position is valid (empty cells only - canPlaceShape checks this)
                if (canPlaceShape(this.board, this.dragState.shape, gridPos)) {
                    // Remove shape from queue now (was kept visible during drag)
                    if (this.originalQueueIndex >= 0) {
                        this.onRemoveFromQueue(this.originalQueueIndex);
                    }
                    
                    // Place the shape
                    this.onPlaceShape(-1, gridPos);
                    shapePlaced = true;
                    
                    // Haptic feedback on valid placement
                    if ('vibrate' in navigator) {
                        navigator.vibrate(20); // Slightly longer vibration for placement
                    }
                }
            }
        }

        // If shape wasn't placed (invalid position, over queue area, or outside board), restore it to queue
        if (!shapePlaced && this.originalQueueIndex >= 0) {
            this.onRestoreToQueue(this.originalQueueIndex, this.dragState.shape);
        }

        // Reset drag state
        this.originalQueueIndex = -1;
        this.dragState = {
            isDragging: false,
            shapeIndex: -1,
            shape: null,
            mousePosition: { x: 0, y: 0 },
            isValidPosition: false,
            hasBoardPosition: false,
            anchorPoint: undefined,
            previewLinesCleared: undefined,
            controlOrigin: undefined,
            projectedBoardPosition: undefined,
            lastProjectedGridCell: undefined,
        };
    }

    /**
     * Handles touch cancel event - cancels drag operation
     * @param event - Touch event
     */
    private handleTouchCancel(event: TouchEvent): void {
        event.preventDefault();
        // If shape wasn't placed, restore it to queue
        if (this.dragState.shape && this.originalQueueIndex >= 0) {
            this.onRestoreToQueue(this.originalQueueIndex, this.dragState.shape);
        }

        // Reset drag state
        this.originalQueueIndex = -1;
        this.dragState = {
            isDragging: false,
            shapeIndex: -1,
            shape: null,
            mousePosition: { x: 0, y: 0 },
            isValidPosition: false,
            hasBoardPosition: false,
            anchorPoint: undefined,
            previewLinesCleared: undefined,
            controlOrigin: undefined,
            projectedBoardPosition: undefined,
            lastProjectedGridCell: undefined,
        };
    }

    /**
     * Gets the current drag state for rendering
     * @returns The current drag state
     */
    getDragState(): DragState {
        return this.dragState;
    }
}

