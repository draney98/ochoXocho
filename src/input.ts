/**
 * Mouse input handling for drag-and-drop operations
 */

import { Position, DragState, Shape } from './types';
import { snapToGrid, canPlaceShape } from './validator';
import { Board } from './board';
import {
    BOARD_PIXEL_SIZE,
    CELL_SIZE,
    CANVAS_HEIGHT,
    getQueueItemRect,
    LIFT_OFFSET_PIXELS,
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

    constructor(
        canvas: HTMLCanvasElement,
        board: Board,
        queue: (Shape | null)[],
        onPlaceShape: (shapeIndex: number, position: Position) => void,
        onRemoveFromQueue: (shapeIndex: number) => void,
        onRestoreToQueue: (shapeIndex: number, shape: Shape) => void
    ) {
        this.canvas = canvas;
        this.board = board;
        this.queue = queue;
        this.onPlaceShape = onPlaceShape;
        this.onRemoveFromQueue = onRemoveFromQueue;
        this.onRestoreToQueue = onRestoreToQueue;
        this.dragState = {
            isDragging: false,
            shapeIndex: -1,
            shape: null,
            mousePosition: { x: 0, y: 0 },
            isValidPosition: false,
            hasBoardPosition: false,
            anchorPoint: undefined,
            previewLinesCleared: undefined,
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
        this.board = newBoard;
    }

    /**
     * Converts screen coordinates to canvas coordinates accounting for CSS scaling
     */
    private screenToCanvas(screenX: number, screenY: number): { x: number; y: number } {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: (screenX - rect.left) * scaleX,
            y: (screenY - rect.top) * scaleY,
        };
    }

    /**
     * Handles mouse down event - starts dragging if clicking on a shape in queue
     * @param event - Mouse event
     */
    private handleMouseDown(event: MouseEvent): void {
        // Don't allow dragging if game is over
        // (This will be checked via the game state, but we can add an early return)
        const { x: canvasX, y: canvasY } = this.screenToCanvas(event.clientX, event.clientY);

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
     * Calculates the grid position for a shape based on its effective position (lifted piece position)
     * @param effectivePosition - The on-screen position of the lifted piece (anchor + offset)
     * @param shape - The shape being dragged
     * @returns The grid position where the shape would be placed, or null if outside board
     */
    private calculateGridPositionFromEffectivePosition(effectivePosition: { x: number; y: number }, shape: Shape): Position | null {
        // Check if effectivePosition (lifted piece) is over the board
        if (effectivePosition.x < 0 || effectivePosition.x >= BOARD_PIXEL_SIZE || 
            effectivePosition.y < 0 || effectivePosition.y >= BOARD_PIXEL_SIZE) {
            return null;
        }

        // Find the top-left block of the shape
        const minX = Math.min(...shape.map(b => b.x));
        const minY = Math.min(...shape.map(b => b.y));
        const maxX = Math.max(...shape.map(b => b.x));
        const maxY = Math.max(...shape.map(b => b.y));
        const shapeWidth = (maxX - minX + 1) * CELL_SIZE;
        const shapeHeight = (maxY - minY + 1) * CELL_SIZE;

        // Calculate where the top-left block is in pixel space
        // Shape is centered on effectivePosition
        const topLeftBlockPixelX = effectivePosition.x - shapeWidth / 2 + minX * CELL_SIZE;
        const topLeftBlockPixelY = effectivePosition.y - shapeHeight / 2 + minY * CELL_SIZE;

        // Convert the top-left block position to grid coordinates
        const gridPos = snapToGrid(topLeftBlockPixelX, topLeftBlockPixelY, CELL_SIZE);

        // Adjust grid position to account for the shape's internal offset
        return {
            x: gridPos.x - minX,
            y: gridPos.y - minY
        };
    }

    /**
     * Handles mouse move event - updates drag position and validates placement
     * @param event - Mouse event
     */
    private handleMouseMove(event: MouseEvent): void {
        if (!this.dragState.isDragging || !this.dragState.shape) return;

        const { x: canvasX, y: canvasY } = this.screenToCanvas(event.clientX, event.clientY);

        // Update anchor point to follow the finger/cursor exactly
        this.dragState.anchorPoint = { x: canvasX, y: canvasY };
        
        // Calculate effectivePosition: mouse position + lift offset
        // This is the hotspot - the actual position of the lifted piece
        const effectivePosition = {
            x: canvasX,
            y: canvasY - LIFT_OFFSET_PIXELS
        };

        const gridPos = this.calculateGridPositionFromEffectivePosition(effectivePosition, this.dragState.shape);
        
        if (gridPos) {
            this.dragState.mousePosition = gridPos;
            this.dragState.hasBoardPosition = true;
            this.dragState.isValidPosition = canPlaceShape(this.board, this.dragState.shape, gridPos);
        } else {
            // Effective position (lifted piece) is outside the board
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

        // Update anchor to final position
        const { x: canvasX, y: canvasY } = this.screenToCanvas(event.clientX, event.clientY);
        this.dragState.anchorPoint = { x: canvasX, y: canvasY };

        // Calculate effectivePosition: mouse position + lift offset
        // This is the hotspot - the actual position of the lifted piece
        const effectivePosition = {
            x: canvasX,
            y: canvasY - LIFT_OFFSET_PIXELS
        };

        const gridPos = this.calculateGridPositionFromEffectivePosition(effectivePosition, this.dragState.shape);

        // Check if the effectivePosition (lifted piece) is over the board and placement is valid
        let shapePlaced = false;
        if (gridPos && effectivePosition.x >= 0 && effectivePosition.x < BOARD_PIXEL_SIZE && 
            effectivePosition.y >= 0 && effectivePosition.y < BOARD_PIXEL_SIZE) {
            
            if (canPlaceShape(this.board, this.dragState.shape, gridPos)) {
                // Pass -1 as shapeIndex since shape was already removed from queue
                this.onPlaceShape(-1, gridPos);
                shapePlaced = true;
            }
        }

        // If shape wasn't placed (invalid position or outside board), restore it to queue
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
        };
    }

    /**
     * Handles touch start event - starts dragging if touching a shape in queue
     * @param event - Touch event
     */
    private handleTouchStart(event: TouchEvent): void {
        event.preventDefault(); // Prevent scrolling
        if (event.touches.length === 0) return;
        
        const touch = event.touches[0];
        const { x: canvasX, y: canvasY } = this.screenToCanvas(touch.clientX, touch.clientY);

        // Check if touch is within any queue card under the board
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
                        // Set anchor point to exact touch location (don't move it to board)
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
     * Handles touch move event - updates drag position and validates placement
     * @param event - Touch event
     */
    private handleTouchMove(event: TouchEvent): void {
        event.preventDefault(); // Prevent scrolling
        if (!this.dragState.isDragging || event.touches.length === 0) return;

        const touch = event.touches[0];
        const { x: canvasX, y: canvasY } = this.screenToCanvas(touch.clientX, touch.clientY);

        // Update anchor point to follow the finger exactly
        // Anchor is always in pixel coordinates, never converted to grid during drag
        this.dragState.anchorPoint = { x: canvasX, y: canvasY };
        
        // Clear grid position and validation flags during drag
        // Grid position is only calculated on release
        this.dragState.hasBoardPosition = false;
        this.dragState.isValidPosition = false;
        this.dragState.mousePosition = { x: 0, y: 0 };
        this.dragState.previewLinesCleared = undefined;
    }

    /**
     * Handles touch end event - places shape if position is valid
     * @param event - Touch event
     */
    private handleTouchEnd(event: TouchEvent): void {
        event.preventDefault();
        if (!this.dragState.isDragging) return;

        // Update anchor to final position
        const { x: canvasX, y: canvasY } = this.screenToCanvas(
            event.changedTouches[0]?.clientX ?? 0, 
            event.changedTouches[0]?.clientY ?? 0
        );
        this.dragState.anchorPoint = { x: canvasX, y: canvasY };

        if (!this.dragState.shape) {
            return;
        }

        // Calculate effectivePosition: mouse position + lift offset
        // This is the hotspot - the actual position of the lifted piece
        const effectivePosition = {
            x: canvasX,
            y: canvasY - LIFT_OFFSET_PIXELS
        };

        const gridPos = this.calculateGridPositionFromEffectivePosition(effectivePosition, this.dragState.shape);

        // Check if the effectivePosition (lifted piece) is over the board and placement is valid
        let shapePlaced = false;
        if (gridPos && effectivePosition.x >= 0 && effectivePosition.x < BOARD_PIXEL_SIZE && 
            effectivePosition.y >= 0 && effectivePosition.y < BOARD_PIXEL_SIZE) {
            
            if (canPlaceShape(this.board, this.dragState.shape, gridPos)) {
                // Pass -1 as shapeIndex since shape was already removed from queue
                this.onPlaceShape(-1, gridPos);
                shapePlaced = true;
            }
        }

        // If shape wasn't placed (invalid position or outside board), restore it to queue
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

