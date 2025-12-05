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
    pointValue: number;  // Points per cell in this shape (stored for reference)
    totalShapesPlacedAtPlacement: number;  // Total shapes placed when this block was placed (ensures point values never decrease)
    shapeIndex: number;  // Index of the shape in the shape pool (preserved even when shape cells are removed)
    darkness: number;    // Darkness multiplier (1.0 = full brightness, decreases by 0.1 each clear)
}

/**
 * Represents the current state of the game
 */
export interface GameState {
    board: boolean[][];           // 8x8 grid, true = filled, false = empty
    queue: Shape[];                // Current queue of 3 shapes to place
    placedBlocks: PlacedBlock[];   // All blocks currently on the board
    score: number;                 // Current score
    gameOver: boolean;             // Whether the game has ended
    level: number;                 // Current level (starts at 1, increases when progress reaches 100%)
    levelProgress: number;        // Progress towards next level (0-100, increases 6.6666667% per line cleared)
    totalShapesPlaced: number;     // Total shapes placed this game (for point value calculation)
    turn: number;                  // Turn counter (increments each time a block is placed)
    linesCleared: number;          // Total lines/columns cleared this game
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
    hasBoardPosition: boolean;     // Whether the cursor has entered the board area
}

/**
 * Represents a cell that is animating out (being removed)
 */
export interface AnimatingCell {
    x: number;                     // Grid x coordinate
    y: number;                     // Grid y coordinate
    color: string;                 // Color of the cell
    startTime: number;             // Timestamp when animation started
    progress: number;              // Animation progress (0 to 1)
}

/**
 * User-adjustable game settings exposed through the settings panel
 */
export type ThemeName = 'classic' | 'midnight' | 'sunset';
export type GameMode = 'easy' | 'hard';

export interface GameSettings {
    showGrid: boolean;
    showGhostPreview: boolean;
    enableAnimations: boolean;
    soundEnabled: boolean;
    theme: ThemeName;
    mode: GameMode;
}

