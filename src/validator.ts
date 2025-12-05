/**
 * Placement validation logic for checking if shapes can be placed on the board
 */

import { Position, Shape } from './types';
import { Board } from './board';
import { BOARD_CELL_COUNT } from './constants';

const BOARD_SIZE = BOARD_CELL_COUNT;

/**
 * Checks if a shape can be placed at the given position on the board
 * Validates both boundary conditions and cell availability
 * @param board - The game board
 * @param shape - The shape to check
 * @param position - The position where the shape would be placed
 * @returns True if the shape can be placed at this position
 */
export function canPlaceShape(board: Board, shape: Shape, position: Position): boolean {
    // Check each block in the shape
    for (const block of shape) {
        const x = position.x + block.x;
        const y = position.y + block.y;

        // Check if block is within board boundaries
        if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) {
            return false;
        }

        // Check if the cell is empty
        if (!board.isCellEmpty({ x, y })) {
            return false;
        }
    }

    return true;
}

/**
 * Finds all valid positions where a shape can be placed on the board
 * @param board - The game board
 * @param shape - The shape to find positions for
 * @returns Array of valid positions
 */
export function getValidPositions(board: Board, shape: Shape): Position[] {
    const validPositions: Position[] = [];

    // Try all possible positions on the board
    // Start from 0 and let canPlaceShape handle boundary validation
    // This ensures shapes with negative coordinates (from rotation) can still be placed in early columns
    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            const position: Position = { x, y };
            if (canPlaceShape(board, shape, position)) {
                validPositions.push(position);
            }
        }
    }

    return validPositions;
}

/**
 * Checks if any shape from a queue can be placed on the board
 * Used for game over detection
 * @param board - The game board
 * @param shapes - Array of shapes to check
 * @returns True if at least one shape can be placed
 */
export function canPlaceAnyShape(board: Board, shapes: Shape[]): boolean {
    for (const shape of shapes) {
        const validPositions = getValidPositions(board, shape);
        if (validPositions.length > 0) {
            return true;
        }
    }
    return false;
}

/**
 * Snaps a position to the nearest valid grid cell
 * Used for drag-and-drop positioning
 * @param canvasX - X coordinate in canvas pixels
 * @param canvasY - Y coordinate in canvas pixels
 * @param cellSize - Size of each grid cell in pixels
 * @returns Grid position
 */
export function snapToGrid(canvasX: number, canvasY: number, cellSize: number): Position {
    const x = Math.floor(canvasX / cellSize);
    const y = Math.floor(canvasY / cellSize);
    return { x, y };
}

