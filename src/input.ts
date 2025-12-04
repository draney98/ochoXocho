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
    private board: Board;
    private queue: Shape[];

    constructor(
        canvas: HTMLCanvasElement,
        board: Board,
        queue: Shape[],
        onPlaceShape: (shapeIndex: number, position: Position) => void
    ) {
        this.canvas = canvas;
        this.board = board;
        this.queue = queue;
        this.onPlaceShape = onPlaceShape;
        this.dragState = {
            isDragging: false,
            shapeIndex: -1,
            shape: null,
            mousePosition: { x: 0, y: 0 },
            isValidPosition: false,
            hasBoardPosition: false,
        };

        this.setupEventListeners();
    }

    /**
     * Sets up mouse event listeners on the canvas
     */
    private setupEventListeners(): void {
        this.canvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
        this.canvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
    }

    /**
     * Updates the queue reference when new shapes are generated
     * @param newQueue - The new queue of shapes
     */
    updateQueue(newQueue: Shape[]): void {
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
     * Handles mouse down event - starts dragging if clicking on a shape in queue
     * @param event - Mouse event
     */
    private handleMouseDown(event: MouseEvent): void {
        // Don't allow dragging if game is over
        // (This will be checked via the game state, but we can add an early return)
        const rect = this.canvas.getBoundingClientRect();
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;

        // Check if click is within any queue card under the board
        if (canvasY >= BOARD_PIXEL_SIZE && canvasY <= CANVAS_HEIGHT) {
            for (let i = 0; i < this.queue.length; i++) {
                const rect = getQueueItemRect(i, this.queue.length);
                if (
                    canvasX >= rect.x &&
                    canvasX <= rect.x + rect.width &&
                    canvasY >= rect.y &&
                    canvasY <= rect.y + rect.height
                ) {
                    this.dragState.isDragging = true;
                    this.dragState.shapeIndex = i;
                    this.dragState.shape = this.queue[i];
                    break;
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

        const rect = this.canvas.getBoundingClientRect();
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;

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
            }
        }
    }

    /**
     * Handles mouse up event - places shape if position is valid
     * @param event - Mouse event
     */
    private handleMouseUp(event: MouseEvent): void {
        if (!this.dragState.isDragging) return;

        const rect = this.canvas.getBoundingClientRect();
        const canvasX = event.clientX - rect.left;
        const canvasY = event.clientY - rect.top;

        // Only place if released over the game board area
        if (canvasX >= 0 && canvasX < BOARD_PIXEL_SIZE && canvasY >= 0 && canvasY < BOARD_PIXEL_SIZE) {
            if (this.dragState.isValidPosition && this.dragState.shapeIndex >= 0) {
                const gridPos = snapToGrid(canvasX, canvasY, CELL_SIZE);
                this.onPlaceShape(this.dragState.shapeIndex, gridPos);
            }
        }

        // Reset drag state
        this.dragState = {
            isDragging: false,
            shapeIndex: -1,
            shape: null,
            mousePosition: { x: 0, y: 0 },
            isValidPosition: false,
            hasBoardPosition: false,
        };
    }

    /**
     * Handles mouse leave event - cancels drag operation
     */
    private handleMouseLeave(): void {
        this.dragState = {
            isDragging: false,
            shapeIndex: -1,
            shape: null,
            mousePosition: { x: 0, y: 0 },
            isValidPosition: false,
            hasBoardPosition: false,
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

