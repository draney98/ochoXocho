/**
 * Mouse input handling for drag-and-drop operations
 */

import { Position, DragState, Shape, GameSettings } from './types';
import { canPlaceShape } from './validator';
import { Board } from './board';
import {
    BOARD_PIXEL_SIZE,
    BOARD_CELL_COUNT,
    CELL_SIZE,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    BOARD_OFFSET_X,
    BOARD_OFFSET_Y,
    BOARD_AREA_HEIGHT,
    DRAG_VISUAL_OFFSET_Y,
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
    private hoverPosition: Position | null = null; // Grid position of hovered block (null when not hovering or dragging)
    private isGameOver: boolean = false; // Track game over state to prevent dragging

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
            const isValid = canPlaceShape(this.board, this.dragState.shape, this.dragState.mousePosition);
            
            // In dev mode, log detailed state for debugging
            // if (this.settings.devMode) {
            //     console.log(`[BOARD UPDATE] Re-validated position (${this.dragState.mousePosition.x}, ${this.dragState.mousePosition.y}): ${isValid}`);
            //     // Log the actual grid state for the shape's blocks
            //     for (const block of this.dragState.shape) {
            //         const absX = this.dragState.mousePosition.x + block.x;
            //         const absY = this.dragState.mousePosition.y + block.y;
            //         if (absX >= 0 && absX < 8 && absY >= 0 && absY < 8) {
            //             const gridValue = grid[absY][absX];
            //             const isEmpty = this.board.isCellEmpty({ x: absX, y: absY });
            //             if (gridValue || !isEmpty) {
            //                 console.log(`  [BOARD UPDATE] Block (${block.x},${block.y}) -> grid(${absX},${absY}): grid[${absY}][${absX}]=${gridValue}, isCellEmpty=${isEmpty}`);
            //             }
            //         }
            //     }
            // }
            
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
        (this as unknown as { lastInvalidLog: string | null }).lastInvalidLog = null;
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
     * Converts screen event coordinates to logical canvas coordinates
     * Uses getBoundingClientRect() to account for CSS scaling
     * Uses CANVAS_WIDTH/CANVAS_HEIGHT (logical dimensions) instead of canvas.width/height
     * (which are scaled by devicePixelRatio for high-DPI displays)
     * @param event - MouseEvent or TouchEvent
     * @returns Logical canvas coordinates {x, y}
     */
    private getCanvasCoordinates(event: MouseEvent | TouchEvent): { x: number; y: number } {
        const rect = this.canvas.getBoundingClientRect();
        // Use logical canvas dimensions, not physical (devicePixelRatio-scaled) dimensions
        // This ensures coordinates match the logical coordinate system used by all game logic
        const scaleX = CANVAS_WIDTH / rect.width;
        const scaleY = CANVAS_HEIGHT / rect.height;
        
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
        
        // Calculate logical canvas coordinates
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
        if (this.isGameOver) {
            return;
        }
        
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
                        this.hoverPosition = null; // Clear hover when dragging starts
                        // Set initial anchor point to prevent shape loss on quick click-release
                        this.dragState.anchorPoint = { x: canvasX, y: canvasY };
                        // Remove shape from queue immediately when selected
                        this.onRemoveFromQueue(i);
                        break;
                    }
                }
            }
        }
    }

    /**
     * Probes a 3x3 neighborhood around a position to find the nearest valid placement
     * Used as fallback when primary shadow position fails
     * @param centerPosition - Center position to probe around
     * @param shape - The shape being placed
     * @returns The nearest valid grid position, or null if none found
     */
    private probeNeighborhoodForPlacement(
        centerPosition: { x: number; y: number },
        shape: Shape
    ): Position | null {
        // Probe 3x3 grid: offsets from -1 to +1 in both X and Y
        const offsets = [-1, 0, 1];
        const candidates: Array<{ pos: Position; distance: number }> = [];
        
        for (const offsetY of offsets) {
            for (const offsetX of offsets) {
                const candidatePos = {
                    x: centerPosition.x + offsetX * CELL_SIZE,
                    y: centerPosition.y + offsetY * CELL_SIZE
                };
                
                const gridPos = this.calculateGridPosition(candidatePos, shape);
                if (gridPos && gridPos.x >= 0 && gridPos.x < BOARD_CELL_COUNT &&
                    gridPos.y >= 0 && gridPos.y < BOARD_CELL_COUNT) {
                    if (canPlaceShape(this.board, shape, gridPos)) {
                        // Calculate distance from center for preference (prefer closer)
                        const distance = Math.sqrt(
                            Math.pow(offsetX, 2) + Math.pow(offsetY, 2)
                        );
                        candidates.push({ pos: gridPos, distance });
                    }
                }
            }
        }
        
        if (candidates.length === 0) {
            return null;
        }
        
        // Return the candidate with smallest distance (prefer center, then adjacent)
        candidates.sort((a, b) => a.distance - b.distance);
        return candidates[0].pos;
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
        
        // Check if cursor X is over the board (Y can be negative for shadow positions above board)
        if (adjustedX < 0 || adjustedX >= BOARD_PIXEL_SIZE) {
            return null;
        }

        // Find the top-left block of the shape (minimum x and y coordinates)
        const minX = Math.min(...shape.map(b => b.x));
        const minY = Math.min(...shape.map(b => b.y));
        const maxX = Math.max(...shape.map(b => b.x));
        const maxY = Math.max(...shape.map(b => b.y));

        // Convert adjusted cursor position to grid coordinates
        // The cursor position is the visual piece's top-left
        // We find which cell this top-left falls into
        const cursorGridX = Math.floor(adjustedX / CELL_SIZE);
        const cursorGridY = Math.floor(adjustedY / CELL_SIZE);

        // The shape's grid position: align the shape's top-left block with the cursor's grid cell
        // If cursor is at grid (cx, cy) and shape's top-left is at (minX, minY),
        // then shape's grid position is (cx - minX, cy - minY)
        const shapeGridX = cursorGridX - minX;
        const shapeGridY = cursorGridY - minY;

        
        // Validate that all shape blocks would be within bounds
        // This is the critical check - all blocks must be inside [0, BOARD_CELL_COUNT)
        const finalMinX = shapeGridX + minX;
        const finalMinY = shapeGridY + minY;
        const finalMaxX = shapeGridX + maxX;
        const finalMaxY = shapeGridY + maxY;
        
        // Check if all shape blocks would be within bounds
        if (finalMinX < 0 || finalMaxX >= BOARD_CELL_COUNT ||
            finalMinY < 0 || finalMaxY >= BOARD_CELL_COUNT) {
            return null;
        }
        
        // Also validate that the shape's grid position itself is reasonable
        // (top-left should be within bounds, but we allow it to be slightly outside
        // if all blocks are still inside - this handles edge cases)
        if (shapeGridX < -maxX || shapeGridX >= BOARD_CELL_COUNT ||
            shapeGridY < -maxY || shapeGridY >= BOARD_CELL_COUNT) {
            return null;
        }
        
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
     * Converts canvas coordinates to grid cell coordinates (for hover detection)
     * @param canvasX - X coordinate in canvas space
     * @param canvasY - Y coordinate in canvas space
     * @returns Grid position {x, y} or null if outside board
     */
    private canvasToGridCell(canvasX: number, canvasY: number): Position | null {
        // Adjust for board offset
        const adjustedX = canvasX - BOARD_OFFSET_X;
        const adjustedY = canvasY - BOARD_OFFSET_Y;
        
        // Check if within board bounds
        if (adjustedX < 0 || adjustedX >= BOARD_PIXEL_SIZE ||
            adjustedY < 0 || adjustedY >= BOARD_PIXEL_SIZE) {
            return null;
        }
        
        // Convert to grid coordinates
        const gridX = Math.floor(adjustedX / CELL_SIZE);
        const gridY = Math.floor(adjustedY / CELL_SIZE);
        
        // Validate grid bounds
        if (gridX < 0 || gridX >= BOARD_CELL_COUNT ||
            gridY < 0 || gridY >= BOARD_CELL_COUNT) {
            return null;
        }
        
        return { x: gridX, y: gridY };
    }

    /**
     * Handles mouse move event - updates drag position and validates placement
     * @param event - Mouse event
     */
    private handleMouseMove(event: MouseEvent): void {
        const { x: canvasX, y: canvasY } = this.getCanvasCoordinates(event);
        
        // Handle hover when not dragging (only on desktop, not mobile)
        if (!this.dragState.isDragging) {
            const gridCell = this.canvasToGridCell(canvasX, canvasY);
            this.hoverPosition = gridCell;
            return;
        }
        
        if (!this.dragState.shape) return;

        // Update anchor point to follow the cursor exactly (normalized canvas coordinates)
        // Don't clamp anchor - allow it to go anywhere
        this.dragState.anchorPoint = { x: canvasX, y: canvasY };
        
        // For mouse, projected position is same as cursor (no reach mapping)
        const projectedPos = { x: canvasX, y: canvasY };
        this.dragState.projectedBoardPosition = projectedPos;
        
        // Calculate visual piece CENTER position (above the cursor)
        let visualPieceCenter = {
            x: projectedPos.x,
            y: projectedPos.y + DRAG_VISUAL_OFFSET_Y
        };
        
        // Compute shape dimensions
        const minX = Math.min(...this.dragState.shape.map(b => b.x));
        const minY = Math.min(...this.dragState.shape.map(b => b.y));
        const maxX = Math.max(...this.dragState.shape.map(b => b.x));
        const maxY = Math.max(...this.dragState.shape.map(b => b.y));
        const shapeWidth = (maxX - minX + 1) * CELL_SIZE;
        const shapeHeight = (maxY - minY + 1) * CELL_SIZE;
        
        // Clamp visual piece center to keep it within the board area (playing surface)
        // This prevents the piece from visually going off-screen, but doesn't return it to queue
        const minVisualX = shapeWidth / 2;
        const maxVisualX = CANVAS_WIDTH - shapeWidth / 2;
        const minVisualY = shapeHeight / 2;
        const maxVisualY = BOARD_AREA_HEIGHT - shapeHeight / 2;
        
        visualPieceCenter = {
            x: Math.max(minVisualX, Math.min(maxVisualX, visualPieceCenter.x)),
            y: Math.max(minVisualY, Math.min(maxVisualY, visualPieceCenter.y))
        };
        
        // Compute TOP-LEFT corner of the visual piece (matching renderer's centering)
        const visualPieceTopLeft = {
            x: visualPieceCenter.x - shapeWidth / 2,
            y: visualPieceCenter.y - shapeHeight / 2
        };
        
        // Verbose logging for debugging (mouse)
        
        // Calculate grid position from visual piece TOP-LEFT
        const gridPos = this.calculateGridPosition(visualPieceTopLeft, this.dragState.shape);
        
        if (gridPos) {
            this.dragState.mousePosition = gridPos;
            this.dragState.hasBoardPosition = true;
            
            if (this.settings.devMode) {
                canPlaceShape(this.board, this.dragState.shape, gridPos);
            }
            
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
                    const lastLog = (this as unknown as { lastInvalidLog: string | null }).lastInvalidLog;
                    const logKey = `${gridPos.x},${gridPos.y}`;
                    if (!lastLog || lastLog !== logKey) {
                        if (invalidBlocks.length > 0) {
                            invalidBlocks.forEach(() => {
                                // Debug logging removed
                            });
                        }
                        (this as unknown as { lastInvalidLog: string | null }).lastInvalidLog = logKey;
                    }
                } else {
                    (this as unknown as { lastInvalidLog: string | null }).lastInvalidLog = null;
                }
                
                if (manualCheck !== isValid) {
                    console.error(`[VALIDATION BUG] Position (${gridPos.x}, ${gridPos.y}): manual=${manualCheck}, canPlaceShape=${isValid}`);
                }
            }
            
            // Haptic feedback when piece snaps to a new valid position on the board
            // Only trigger when: position is valid AND grid cell has changed
            const lastCell = this.dragState.lastProjectedGridCell;
            const cellChanged = !lastCell || lastCell.x !== gridPos.x || lastCell.y !== gridPos.y;
            
            if (isValid && cellChanged) {
                // Trigger haptic feedback for successful snap to valid cell
                this.triggerHapticFeedback(10);
            }
            
            // Update last projected grid cell for next comparison
            this.dragState.lastProjectedGridCell = { x: gridPos.x, y: gridPos.y };
            
            this.dragState.isValidPosition = isValid;
        } else {
            // Cursor is outside the board - clear last cell tracking
            this.dragState.hasBoardPosition = false;
            this.dragState.isValidPosition = false;
            this.dragState.mousePosition = { x: 0, y: 0 };
            this.dragState.lastProjectedGridCell = undefined;
        }
        this.dragState.previewLinesCleared = undefined;
    }

    /**
     * Handles mouse up event - places shape if position is valid
     * @param event - Mouse event
     */
    private handleMouseUp(event: MouseEvent): void {
        // Safety check: if not properly dragging, restore shape if we have one
        if (!this.dragState.isDragging || !this.dragState.shape || !this.dragState.anchorPoint) {
            // Restore shape to queue if we somehow have a shape but invalid state
            if (this.dragState.shape && this.originalQueueIndex >= 0) {
                this.onRestoreToQueue(this.originalQueueIndex, this.dragState.shape);
                this.originalQueueIndex = -1;
                this.dragState.shape = null;
                this.dragState.isDragging = false;
            }
            return;
        }

        // Update anchor to final position (normalized canvas coordinates)
        const { x: canvasX, y: canvasY } = this.getCanvasCoordinates(event);
        
        // Don't clamp anchor - allow it to go anywhere
        this.dragState.anchorPoint = { x: canvasX, y: canvasY };

        // For mouse, projected position is same as cursor (no reach mapping)
        const projectedPos = { x: canvasX, y: canvasY };
        this.dragState.projectedBoardPosition = projectedPos;
        
        // Calculate visual piece CENTER position (above the cursor)
        let visualPieceCenter = {
            x: projectedPos.x,
            y: projectedPos.y + DRAG_VISUAL_OFFSET_Y
        };
        
        // Compute shape dimensions
        const minX = Math.min(...this.dragState.shape.map(b => b.x));
        const minY = Math.min(...this.dragState.shape.map(b => b.y));
        const maxX = Math.max(...this.dragState.shape.map(b => b.x));
        const maxY = Math.max(...this.dragState.shape.map(b => b.y));
        const shapeWidth = (maxX - minX + 1) * CELL_SIZE;
        const shapeHeight = (maxY - minY + 1) * CELL_SIZE;
        
        // Clamp visual piece center to keep it within the board area (playing surface)
        // This prevents the piece from visually going off-screen, but doesn't return it to queue
        const minVisualX = shapeWidth / 2;
        const maxVisualX = CANVAS_WIDTH - shapeWidth / 2;
        const minVisualY = shapeHeight / 2;
        const maxVisualY = BOARD_AREA_HEIGHT - shapeHeight / 2;
        
        visualPieceCenter = {
            x: Math.max(minVisualX, Math.min(maxVisualX, visualPieceCenter.x)),
            y: Math.max(minVisualY, Math.min(maxVisualY, visualPieceCenter.y))
        };
        
        const visualPieceTopLeft = {
            x: visualPieceCenter.x - shapeWidth / 2,
            y: visualPieceCenter.y - shapeHeight / 2
        };
        
        // Calculate grid position from visual piece TOP-LEFT first
        // This allows us to check if placement is valid before checking queue area
        let gridPos = this.calculateGridPosition(visualPieceTopLeft, this.dragState.shape);
        
        // Check if dropped outside the playing surface (board area)
        // Return to queue if visual piece center is outside board area
        const droppedOutsideBoard = visualPieceCenter.y > BOARD_AREA_HEIGHT || 
                                     visualPieceCenter.x < 0 || 
                                     visualPieceCenter.x > CANVAS_WIDTH;
        
        // Check if VISUAL PIECE (not mouse) is over the queue area - if so, restore to queue
        // Use a small threshold to allow placement near the board edge (for bottom row placement)
        // Only consider it "over queue area" if it's clearly in the queue (10px threshold)
        const queueAreaThreshold = 10; // Allow 10px overlap to support bottom row placement
        const visualPieceOverQueueArea = visualPieceTopLeft.y >= BOARD_AREA_HEIGHT + queueAreaThreshold;
        
        // Check if there's an outline (ghost preview) - if not, return to queue
        // Outline is shown when hasBoardPosition is true AND isValidPosition is true
        const hasOutline = this.dragState.hasBoardPosition && this.dragState.isValidPosition;
        
        // Only allow placement on the playing surface (board area with valid empty cells)
        // If we have a valid grid position, allow placement even if visual piece is slightly over queue area
        let shapePlaced = false;
        if (!visualPieceOverQueueArea || gridPos !== null) {
            let isValid = false;
            
            // Validate visual piece position if it exists
            if (gridPos && gridPos.x >= 0 && gridPos.x < BOARD_CELL_COUNT &&
                gridPos.y >= 0 && gridPos.y < BOARD_CELL_COUNT) {
                isValid = canPlaceShape(this.board, this.dragState.shape, gridPos);
            }
            
            // If visual piece position fails, try neighborhood probing around projected position
            if (!gridPos || !isValid) {
                gridPos = this.probeNeighborhoodForPlacement(projectedPos, this.dragState.shape);
                
                if (gridPos) {
                    isValid = canPlaceShape(this.board, this.dragState.shape, gridPos);
                }
            }
            
            // Only place if we have an outline (hasBoardPosition and isValidPosition)
            // This ensures the user can see where the piece will be placed
            if (gridPos && isValid && hasOutline) {
                // Pass -1 as shapeIndex since shape was already removed from queue
                this.onPlaceShape(-1, gridPos);
                shapePlaced = true;
            } else {
                if (this.settings.devMode) {
                    console.log(`  ✗ Placement REJECTED`);
                    if (!hasOutline) {
                        console.log(`    no outline visible (hasBoardPosition=${this.dragState.hasBoardPosition}, isValidPosition=${this.dragState.isValidPosition})`);
                    } else if (gridPos) {
                        console.log(`    canPlaceShape returned false`);
                    } else {
                        console.log(`    no valid grid position found`);
                    }
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
        // Clear hover when mouse leaves canvas
        this.hoverPosition = null;
        
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
        
        // Don't allow dragging if game is over
        if (this.isGameOver) {
            return;
        }
        
        const { x: canvasX, y: canvasY } = this.getCanvasCoordinates(event);

        // Check if touch is within any queue card under the board
        // Use fixed queue size (3) for hit detection so areas don't move
        const QUEUE_SIZE = 3;
        if (canvasY >= BOARD_AREA_HEIGHT && canvasY <= CANVAS_HEIGHT) {
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
        // Don't clamp anchor - allow it to go anywhere
        this.dragState.anchorPoint = { x: canvasX, y: canvasY };
        
        // Calculate projected board position using reach mapping
        const projectedPos = this.projectBoardPosition(
            { x: canvasX, y: canvasY },
            this.dragState.controlOrigin
        );
        this.dragState.projectedBoardPosition = projectedPos;
        
        // Calculate visual piece CENTER position (above the finger)
        // This is where the CENTER of the piece appears (same as renderer)
        let visualPieceCenter = {
            x: projectedPos.x,
            y: projectedPos.y + DRAG_VISUAL_OFFSET_Y
        };
        
        // Compute shape dimensions
        const minX = Math.min(...this.dragState.shape.map(b => b.x));
        const minY = Math.min(...this.dragState.shape.map(b => b.y));
        const maxX = Math.max(...this.dragState.shape.map(b => b.x));
        const maxY = Math.max(...this.dragState.shape.map(b => b.y));
        const shapeWidth = (maxX - minX + 1) * CELL_SIZE;
        const shapeHeight = (maxY - minY + 1) * CELL_SIZE;
        
        // Clamp visual piece center to keep it within the board area (playing surface)
        // This prevents the piece from visually going off-screen, but doesn't return it to queue
        const minVisualX = shapeWidth / 2;
        const maxVisualX = CANVAS_WIDTH - shapeWidth / 2;
        const minVisualY = shapeHeight / 2;
        const maxVisualY = BOARD_AREA_HEIGHT - shapeHeight / 2;
        
        visualPieceCenter = {
            x: Math.max(minVisualX, Math.min(maxVisualX, visualPieceCenter.x)),
            y: Math.max(minVisualY, Math.min(maxVisualY, visualPieceCenter.y))
        };
        
        // Top-left corner of the visual piece (matching renderer's centering)
        const visualPieceTopLeft = {
            x: visualPieceCenter.x - shapeWidth / 2,
            y: visualPieceCenter.y - shapeHeight / 2
        };
        
        
        // Verbose logging for debugging bottom row placement
        if (this.settings.devMode) {
            console.log('[DRAG_MOVE] Coordinate trace:');
            console.log(`  anchorPoint: (${this.dragState.anchorPoint.x.toFixed(1)}, ${this.dragState.anchorPoint.y.toFixed(1)})`);
            console.log(`  projectedPos: (${projectedPos.x.toFixed(1)}, ${projectedPos.y.toFixed(1)})`);
            console.log(`  visualPieceCenter: (${visualPieceCenter.x.toFixed(1)}, ${visualPieceCenter.y.toFixed(1)})`);
            console.log(`  visualPieceTopLeft: (${visualPieceTopLeft.x.toFixed(1)}, ${visualPieceTopLeft.y.toFixed(1)})`);
            console.log(`  shape offsets: minX=${minX}, minY=${minY}`);
        }
        
        // Calculate grid position from visual piece TOP-LEFT (where piece actually appears)
        // This ensures placement follows what the user sees visually
        const gridPos = this.calculateGridPosition(visualPieceTopLeft, this.dragState.shape);
        
        if (gridPos) {
            this.dragState.mousePosition = gridPos;
            this.dragState.hasBoardPosition = true;
            
            // CRITICAL: Always validate with the absolute latest board state
            // Get a fresh grid copy to ensure we're not reading stale data
            // The board reference is shared, but we need to ensure we read the current grid
            const isValid = canPlaceShape(this.board, this.dragState.shape, gridPos);
            
            // Verbose logging for grid position and validation
            if (this.settings.devMode) {
                console.log(`  gridPos candidate: (${gridPos.x}, ${gridPos.y})`);
                console.log(`  canPlaceShape result: ${isValid}`);
            }
            
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
                    const lastLog = (this as unknown as { lastInvalidLog: string | null }).lastInvalidLog;
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
                        (this as unknown as { lastInvalidLog: string | null }).lastInvalidLog = logKey;
                    }
                } else {
                    (this as unknown as { lastInvalidLog: string | null }).lastInvalidLog = null;
                }
                
                if (manualCheck !== isValid) {
                    console.error(`[VALIDATION BUG] Position (${gridPos.x}, ${gridPos.y}): manual=${manualCheck}, canPlaceShape=${isValid}`);
                }
            }
            
            // Haptic feedback when piece snaps to a new valid position on the board
            // Only trigger when: position is valid AND grid cell has changed
            const lastCell = this.dragState.lastProjectedGridCell;
            const cellChanged = !lastCell || lastCell.x !== gridPos.x || lastCell.y !== gridPos.y;
            
            if (isValid && cellChanged) {
                // Trigger haptic feedback for successful snap to valid cell
                this.triggerHapticFeedback(10);
            }
            
            // Update last projected grid cell for next comparison
            this.dragState.lastProjectedGridCell = { x: gridPos.x, y: gridPos.y };
            
            this.dragState.isValidPosition = isValid;
        } else {
            // Cursor is outside the board - clear last cell tracking
            this.dragState.hasBoardPosition = false;
            this.dragState.isValidPosition = false;
            this.dragState.mousePosition = { x: 0, y: 0 };
            this.dragState.lastProjectedGridCell = undefined;
        }
        this.dragState.previewLinesCleared = undefined;
    }

    /**
     * Handles touch end event - places shape if position is valid
     * @param event - Touch event
     */
    private handleTouchEnd(event: TouchEvent): void {
        event.preventDefault();
        // Safety check: if not properly dragging, restore shape if we have one
        if (!this.dragState.isDragging || !this.dragState.shape || !this.dragState.controlOrigin) {
            // Restore shape to queue if we somehow have a shape but invalid state
            if (this.dragState.shape && this.originalQueueIndex >= 0) {
                this.onRestoreToQueue(this.originalQueueIndex, this.dragState.shape);
                this.originalQueueIndex = -1;
                this.dragState.shape = null;
                this.dragState.isDragging = false;
            }
            return;
        }

        // Update anchor to final position (normalized canvas coordinates)
        const { x: canvasX, y: canvasY } = this.getCanvasCoordinates(event);
        
        // Don't clamp anchor - allow it to go anywhere
        this.dragState.anchorPoint = { x: canvasX, y: canvasY };

        // Calculate final projected position using reach mapping
        const projectedPos = this.projectBoardPosition(
            { x: canvasX, y: canvasY },
            this.dragState.controlOrigin
        );
        this.dragState.projectedBoardPosition = projectedPos;
        
        // Calculate visual piece CENTER position (above the finger)
        let visualPieceCenter = {
            x: projectedPos.x,
            y: projectedPos.y + DRAG_VISUAL_OFFSET_Y
        };
        
        // Compute shape dimensions
        const minX = Math.min(...this.dragState.shape.map(b => b.x));
        const minY = Math.min(...this.dragState.shape.map(b => b.y));
        const maxX = Math.max(...this.dragState.shape.map(b => b.x));
        const maxY = Math.max(...this.dragState.shape.map(b => b.y));
        const shapeWidth = (maxX - minX + 1) * CELL_SIZE;
        const shapeHeight = (maxY - minY + 1) * CELL_SIZE;
        
        // Clamp visual piece center to keep it within the board area (playing surface)
        // This prevents the piece from visually going off-screen, but doesn't return it to queue
        const minVisualX = shapeWidth / 2;
        const maxVisualX = CANVAS_WIDTH - shapeWidth / 2;
        const minVisualY = shapeHeight / 2;
        const maxVisualY = BOARD_AREA_HEIGHT - shapeHeight / 2;
        
        visualPieceCenter = {
            x: Math.max(minVisualX, Math.min(maxVisualX, visualPieceCenter.x)),
            y: Math.max(minVisualY, Math.min(maxVisualY, visualPieceCenter.y))
        };
        
        const visualPieceTopLeft = {
            x: visualPieceCenter.x - shapeWidth / 2,
            y: visualPieceCenter.y - shapeHeight / 2
        };

        
        // Verbose logging for debugging bottom row placement
        if (this.settings.devMode) {
            console.log('[DROP] Coordinate trace:');
            console.log(`  anchorPoint: (${this.dragState.anchorPoint.x.toFixed(1)}, ${this.dragState.anchorPoint.y.toFixed(1)})`);
            console.log(`  projectedPos: (${projectedPos.x.toFixed(1)}, ${projectedPos.y.toFixed(1)})`);
            console.log(`  visualPieceTopLeft: (${visualPieceTopLeft.x.toFixed(1)}, ${visualPieceTopLeft.y.toFixed(1)})`);
            console.log(`  shape offsets: minX=${minX}, minY=${minY}`);
        }

        // Calculate grid position from visual piece TOP-LEFT first
        // This allows us to check if placement is valid before checking queue area
        let gridPos = this.calculateGridPosition(visualPieceTopLeft, this.dragState.shape);
        
        // Check if dropped outside the playing surface (board area)
        // Return to queue if visual piece center is outside board area
        const droppedOutsideBoard = visualPieceCenter.y > BOARD_AREA_HEIGHT || 
                                     visualPieceCenter.x < 0 || 
                                     visualPieceCenter.x > CANVAS_WIDTH;
        
        // Check if VISUAL PIECE (not mouse) is over the queue area - if so, restore to queue
        // Use a small threshold to allow placement near the board edge (for bottom row placement)
        // Only consider it "over queue area" if it's clearly in the queue (10px threshold)
        const queueAreaThreshold = 10; // Allow 10px overlap to support bottom row placement
        const visualPieceOverQueueArea = visualPieceTopLeft.y >= BOARD_AREA_HEIGHT + queueAreaThreshold;
        
        // Check if there's an outline (ghost preview) - if not, return to queue
        // Outline is shown when hasBoardPosition is true AND isValidPosition is true
        const hasOutline = this.dragState.hasBoardPosition && this.dragState.isValidPosition;
        
        // Only allow placement on the playing surface (board area with valid empty cells)
        // Return to queue if dropped outside the playing surface
        let shapePlaced = false;
        if (droppedOutsideBoard) {
            // Dropped outside playing surface - return to queue
            if (this.settings.devMode) {
                console.log(`  ✗ Placement REJECTED: dropped outside playing surface`);
            }
        } else if (!visualPieceOverQueueArea || gridPos !== null) {
            let isValid = false;
            
            if (this.settings.devMode) {
                console.log(`  visual-piece gridPos: ${gridPos ? `(${gridPos.x}, ${gridPos.y})` : 'null'}`);
            }
            
            // Validate visual piece position if it exists
            if (gridPos && gridPos.x >= 0 && gridPos.x < BOARD_CELL_COUNT &&
                gridPos.y >= 0 && gridPos.y < BOARD_CELL_COUNT) {
                isValid = canPlaceShape(this.board, this.dragState.shape, gridPos);
            }
            
            // If visual piece position fails, try neighborhood probing around projected position
            if (!gridPos || !isValid) {
                if (this.settings.devMode) {
                    console.log(`  visual-piece position failed, probing neighborhood around projectedPos`);
                }
                gridPos = this.probeNeighborhoodForPlacement(projectedPos, this.dragState.shape);
                
                if (this.settings.devMode) {
                    console.log(`  neighborhood gridPos: ${gridPos ? `(${gridPos.x}, ${gridPos.y})` : 'null'}`);
                }
                
                if (gridPos) {
                    isValid = canPlaceShape(this.board, this.dragState.shape, gridPos);
                }
            }
            
            // Only place if we have an outline (hasBoardPosition and isValidPosition)
            // This ensures the user can see where the piece will be placed
            if (this.settings.devMode) {
                if (gridPos) {
                    console.log(`  final gridPos: (${gridPos.x}, ${gridPos.y})`);
                    console.log(`  canPlaceShape result: ${isValid}`);
                    console.log(`  hasOutline: ${hasOutline} (hasBoardPosition=${this.dragState.hasBoardPosition}, isValidPosition=${this.dragState.isValidPosition})`);
                } else {
                    console.log(`  final gridPos: null (no valid placement found)`);
                }
            }
                
            if (gridPos && isValid && hasOutline) {
                    // Remove shape from queue now (was kept visible during drag)
                    if (this.originalQueueIndex >= 0) {
                        this.onRemoveFromQueue(this.originalQueueIndex);
                    }
                    
                    // Place the shape
                    this.onPlaceShape(-1, gridPos);
                    shapePlaced = true;
                    
                    if (this.settings.devMode) {
                        console.log(`  ✓ Placement SUCCEEDED at (${gridPos.x}, ${gridPos.y})`);
                    }
                    
                    // Haptic feedback on valid placement
                    this.triggerHapticFeedback(20);
                } else {
                    if (this.settings.devMode) {
                        if (!hasOutline) {
                            console.log(`  ✗ Placement REJECTED: no outline visible (hasBoardPosition=${this.dragState.hasBoardPosition}, isValidPosition=${this.dragState.isValidPosition})`);
                        } else if (gridPos) {
                            console.log(`  ✗ Placement REJECTED: canPlaceShape returned false`);
                            // Log why it was rejected
                            for (const block of this.dragState.shape) {
                                const absX = gridPos.x + block.x;
                                const absY = gridPos.y + block.y;
                                if (absX < 0 || absX >= BOARD_CELL_COUNT || absY < 0 || absY >= BOARD_CELL_COUNT) {
                                    console.log(`    Block (${block.x},${block.y}) -> grid(${absX},${absY}): out of bounds`);
                                } else if (!this.board.isCellEmpty({ x: absX, y: absY })) {
                                    console.log(`    Block (${block.x},${block.y}) -> grid(${absX},${absY}): occupied cell`);
                                }
                            }
                        } else {
                            console.log(`  ✗ Placement REJECTED: no valid grid position found`);
                        }
                    }
                }
        }

        // If shape wasn't placed (invalid position, over queue area, or outside board), restore it to queue
        if (!shapePlaced && this.originalQueueIndex >= 0) {
            if (this.settings.devMode) {
                console.log(`  ✗ Shape restored to queue (placement failed)`);
            }
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
    
    /**
     * Gets the current hover position (grid cell being hovered, or null if not hovering)
     * Only valid when not dragging and mouse is over a block on the board
     * @returns Grid position {x, y} or null
     */
    getHoverPosition(): Position | null {
        return this.hoverPosition;
    }
    
    /**
     * Updates the game over state to prevent dragging during game over
     * @param gameOver - Whether the game is over
     */
    updateGameOverState(gameOver: boolean): void {
        this.isGameOver = gameOver;
        // If game over is triggered while dragging, cancel the drag
        if (gameOver && this.dragState.isDragging) {
            if (this.dragState.shape && this.originalQueueIndex >= 0) {
                this.onRestoreToQueue(this.originalQueueIndex, this.dragState.shape);
            }
            this.dragState.isDragging = false;
            this.dragState.shape = null;
            this.originalQueueIndex = -1;
        }
    }
    
    /**
     * Triggers haptic feedback on supported devices.
     * Note: navigator.vibrate() is NOT supported on iOS Safari (platform limitation).
     * This will only work on Android and some desktop browsers.
     * @param duration - Vibration duration in milliseconds
     */
    private triggerHapticFeedback(duration: number): void {
        try {
            if (navigator.vibrate) {
                navigator.vibrate(duration);
            }
        } catch {
            // Vibration not supported or failed - ignore silently
        }
    }
}

