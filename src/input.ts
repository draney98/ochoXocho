/**
 * Mouse input handling for drag-and-drop operations
 */

import { Position, DragState, Shape } from './types';
import { snapToGrid } from './validator';
import { Board } from './board';
import { canPlaceShape } from './validator';
import {
    BOARD_PIXEL_SIZE,
    CELL_SIZE,
    CANVAS_HEIGHT,
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
     * Handles mouse move event - updates drag position and validates placement
     * @param event - Mouse event
     */
    private handleMouseMove(event: MouseEvent): void {
        if (!this.dragState.isDragging) return;

        const { x: canvasX, y: canvasY } = this.screenToCanvas(event.clientX, event.clientY);

        // Only allow dragging over the game board area
        if (canvasX >= 0 && canvasX < BOARD_PIXEL_SIZE && canvasY >= 0 && canvasY < BOARD_PIXEL_SIZE) {
            const gridPos = snapToGrid(canvasX, canvasY, CELL_SIZE);
            this.dragState.mousePosition = gridPos;
            this.dragState.hasBoardPosition = true;

            if (this.dragState.shape) {
                this.dragState.isValidPosition = canPlaceShape(
                    this.board,
                    this.dragState.shape,
                    gridPos
                );
                
                // Check which lines/columns would be cleared if placed here
                if (this.dragState.isValidPosition) {
                    const previewLines = this.board.getFullLinesIfPlaced(this.dragState.shape, gridPos);
                    const hadLines = this.dragState.previewLinesCleared && 
                        (this.dragState.previewLinesCleared.rows.length > 0 || 
                         this.dragState.previewLinesCleared.columns.length > 0);
                    const hasLines = previewLines.rows.length > 0 || previewLines.columns.length > 0;
                    
                    // Debug: log detected lines
                    if (hasLines) {
                        console.log(`[PREVIEW] Would clear ${previewLines.rows.length} row(s): [${previewLines.rows.join(', ')}], ${previewLines.columns.length} column(s): [${previewLines.columns.join(', ')}]`);
                    }
                    
                    this.dragState.previewLinesCleared = previewLines;
                    
                    // Vibrate when lines would be cleared (only on first detection, not every move)
                    if (hasLines && !hadLines && 'vibrate' in navigator) {
                        navigator.vibrate(30); // Short vibration for preview
                    }
                } else {
                    this.dragState.previewLinesCleared = undefined;
                }
            }
        } else {
            // Cursor is outside the board area - clear board position flag
            this.dragState.hasBoardPosition = false;
            this.dragState.isValidPosition = false;
            this.dragState.previewLinesCleared = undefined;
        }
    }

    /**
     * Handles mouse up event - places shape if position is valid
     * @param event - Mouse event
     */
    private handleMouseUp(event: MouseEvent): void {
        if (!this.dragState.isDragging) return;

        const { x: canvasX, y: canvasY } = this.screenToCanvas(event.clientX, event.clientY);

        // Only place if released over the game board area and position is valid
        let shapePlaced = false;
        if (canvasX >= 0 && canvasX < BOARD_PIXEL_SIZE && canvasY >= 0 && canvasY < BOARD_PIXEL_SIZE) {
            if (this.dragState.isValidPosition && this.dragState.shape) {
                const gridPos = snapToGrid(canvasX, canvasY, CELL_SIZE);
                // Pass -1 as shapeIndex since shape was already removed from queue
                // The handler will get the shape from dragState
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

        // Only allow dragging over the game board area
        if (canvasX >= 0 && canvasX < BOARD_PIXEL_SIZE && canvasY >= 0 && canvasY < BOARD_PIXEL_SIZE) {
            const gridPos = snapToGrid(canvasX, canvasY, CELL_SIZE);
            this.dragState.mousePosition = gridPos;
            this.dragState.hasBoardPosition = true;

            if (this.dragState.shape) {
                this.dragState.isValidPosition = canPlaceShape(
                    this.board,
                    this.dragState.shape,
                    gridPos
                );
                
                // Check which lines/columns would be cleared if placed here
                if (this.dragState.isValidPosition) {
                    const previewLines = this.board.getFullLinesIfPlaced(this.dragState.shape, gridPos);
                    const hadLines = this.dragState.previewLinesCleared && 
                        (this.dragState.previewLinesCleared.rows.length > 0 || 
                         this.dragState.previewLinesCleared.columns.length > 0);
                    const hasLines = previewLines.rows.length > 0 || previewLines.columns.length > 0;
                    
                    // Debug: log detected lines
                    if (hasLines) {
                        console.log(`[PREVIEW] Would clear ${previewLines.rows.length} row(s): [${previewLines.rows.join(', ')}], ${previewLines.columns.length} column(s): [${previewLines.columns.join(', ')}]`);
                    }
                    
                    this.dragState.previewLinesCleared = previewLines;
                    
                    // Vibrate when lines would be cleared (only on first detection, not every move)
                    if (hasLines && !hadLines && 'vibrate' in navigator) {
                        navigator.vibrate(30); // Short vibration for preview
                    }
                } else {
                    this.dragState.previewLinesCleared = undefined;
                }
            }
        } else {
            // Touch is outside the board area - clear board position flag
            this.dragState.hasBoardPosition = false;
            this.dragState.isValidPosition = false;
            this.dragState.previewLinesCleared = undefined;
        }
    }

    /**
     * Handles touch end event - places shape if position is valid
     * @param event - Touch event
     */
    private handleTouchEnd(event: TouchEvent): void {
        event.preventDefault();
        if (!this.dragState.isDragging) return;

        // Use last known position if touch ended outside
        const { x: canvasX, y: canvasY } = this.dragState.hasBoardPosition
            ? { x: this.dragState.mousePosition.x * CELL_SIZE, y: this.dragState.mousePosition.y * CELL_SIZE }
            : this.screenToCanvas(event.changedTouches[0]?.clientX ?? 0, event.changedTouches[0]?.clientY ?? 0);

        // Only place if released over the game board area and position is valid
        let shapePlaced = false;
        if (canvasX >= 0 && canvasX < BOARD_PIXEL_SIZE && canvasY >= 0 && canvasY < BOARD_PIXEL_SIZE) {
            if (this.dragState.isValidPosition && this.dragState.shape) {
                const gridPos = this.dragState.mousePosition;
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

