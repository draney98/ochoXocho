/**
 * Shared TypeScript types for the block placement puzzle game
 */

/**
 * Represents a position on the game board using grid coordinates
 */
export interface Position {
    x: number;
    y: number;
}

/**
 * Represents a shape as an array of relative positions from its origin
 * Each position is relative to (0, 0) as the shape's top-left corner
 */
export type Shape = Position[];

/**
 * Represents a block that has been placed on the board
 * Contains the shape definition and its absolute position on the board
 */
export interface PlacedBlock {
    shape: Shape;
    position: Position;
    color: string;
}

/**
 * Represents the current state of the game
 */
export interface GameState {
    board: boolean[][];           // 8x8 grid, true = filled, false = empty
    queue: Shape[];                // Current queue of 3 shapes to place
    placedBlocks: PlacedBlock[];   // All blocks currently on the board
    score: number;                 // Current score
    gameOver: boolean;              // Whether the game has ended
    consecutiveClears: number;     // Number of consecutive clears in current turn
}

/**
 * Represents a drag operation in progress
 */
export interface DragState {
    isDragging: boolean;
    shapeIndex: number;            // Index in the queue of the shape being dragged
    shape: Shape | null;           // The shape being dragged
    mousePosition: Position;       // Current mouse position in grid coordinates
    isValidPosition: boolean;      // Whether current position is valid for placement
}

/**
 * Represents a cell that is animating out (being removed)
 */
export interface AnimatingCell {
    x: number;                     // Grid x coordinate
    y: number;                     // Grid y coordinate
    color: string;                 // Color of the cell
    letter: string;                // Letter to display (if tetromino)
    startTime: number;             // Timestamp when animation started
    progress: number;              // Animation progress (0 to 1)
}

