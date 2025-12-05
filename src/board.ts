/**
 * Game board management for the 8x8 grid
 */

import { Position, Shape, PlacedBlock } from './types';
import { BOARD_CELL_COUNT } from './constants';

const BOARD_SIZE = BOARD_CELL_COUNT;

/**
 * Board class manages the 8x8 game grid
 * Tracks which cells are filled and provides operations for placing shapes
 */
export class Board {
    private grid: boolean[][];

    constructor() {
        // Initialize empty 8x8 grid
        this.grid = Array(BOARD_SIZE).fill(null).map(() => 
            Array(BOARD_SIZE).fill(false)
        );
    }

    /**
     * Checks if a cell at the given position is empty
     * @param pos - Grid position to check
     * @returns True if the cell is empty (within bounds and not filled)
     */
    isCellEmpty(pos: Position): boolean {
        if (pos.x < 0 || pos.x >= BOARD_SIZE || pos.y < 0 || pos.y >= BOARD_SIZE) {
            return false;
        }
        return !this.grid[pos.y][pos.x];
    }

    /**
     * Gets the current state of the board
     * @returns A copy of the grid array
     */
    getGrid(): boolean[][] {
        return this.grid.map(row => [...row]);
    }

    /**
     * Places a shape on the board at the given position
     * Does not validate placement - use validator before calling
     * @param shape - The shape to place
     * @param position - Top-left position where the shape should be placed
     */
    placeShape(shape: Shape, position: Position): void {
        for (const block of shape) {
            const x = position.x + block.x;
            const y = position.y + block.y;
            if (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE) {
                this.grid[y][x] = true;
            }
        }
    }

    /**
     * Removes a shape from the board at the given position
     * Used when clearing rows/columns
     * @param shape - The shape to remove
     * @param position - Position where the shape was placed
     */
    removeShape(shape: Shape, position: Position): void {
        for (const block of shape) {
            const x = position.x + block.x;
            const y = position.y + block.y;
            if (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE) {
                this.grid[y][x] = false;
            }
        }
    }

    /**
     * Clears a specific row by setting all cells in that row to empty
     * @param row - Row index (0-7)
     */
    clearRow(row: number): void {
        if (row >= 0 && row < BOARD_SIZE) {
            this.grid[row].fill(false);
        }
    }

    /**
     * Clears a specific column by setting all cells in that column to empty
     * @param col - Column index (0-7)
     */
    clearColumn(col: number): void {
        if (col >= 0 && col < BOARD_SIZE) {
            for (let row = 0; row < BOARD_SIZE; row++) {
                this.grid[row][col] = false;
            }
        }
    }

    /**
     * Clears a specific cell by setting it to empty
     * @param x - Column index (0-7)
     * @param y - Row index (0-7)
     */
    clearCell(x: number, y: number): void {
        if (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE) {
            this.grid[y][x] = false;
        }
    }

    /**
     * Checks if a row is completely filled
     * @param row - Row index to check
     * @returns True if all cells in the row are filled
     */
    isRowFull(row: number): boolean {
        if (row < 0 || row >= BOARD_SIZE) return false;
        return this.grid[row].every(cell => cell === true);
    }

    /**
     * Checks if a column is completely filled
     * @param col - Column index to check
     * @returns True if all cells in the column are filled
     */
    isColumnFull(col: number): boolean {
        if (col < 0 || col >= BOARD_SIZE) return false;
        for (let row = 0; row < BOARD_SIZE; row++) {
            if (!this.grid[row][col]) return false;
        }
        return true;
    }

    /**
     * Finds all full rows in the board
     * @returns Array of row indices that are full
     */
    getFullRows(): number[] {
        const fullRows: number[] = [];
        for (let row = 0; row < BOARD_SIZE; row++) {
            if (this.isRowFull(row)) {
                fullRows.push(row);
            }
        }
        return fullRows;
    }

    /**
     * Finds all full columns in the board
     * @returns Array of column indices that are full
     */
    getFullColumns(): number[] {
        const fullColumns: number[] = [];
        for (let col = 0; col < BOARD_SIZE; col++) {
            if (this.isColumnFull(col)) {
                fullColumns.push(col);
            }
        }
        return fullColumns;
    }

    /**
     * Gets all empty cells on the board
     * @returns Array of positions that are empty
     */
    getEmptyCells(): Position[] {
        const emptyCells: Position[] = [];
        for (let y = 0; y < BOARD_SIZE; y++) {
            for (let x = 0; x < BOARD_SIZE; x++) {
                if (!this.grid[y][x]) {
                    emptyCells.push({ x, y });
                }
            }
        }
        return emptyCells;
    }

    /**
     * Checks if the board has no filled cells
     */
    isEmpty(): boolean {
        for (let y = 0; y < BOARD_SIZE; y++) {
            for (let x = 0; x < BOARD_SIZE; x++) {
                if (this.grid[y][x]) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Resets the board to an empty state
     */
    reset(): void {
        this.grid = Array(BOARD_SIZE).fill(null).map(() => 
            Array(BOARD_SIZE).fill(false)
        );
    }

    /**
     * Gets the board size (always 8 for this game)
     * @returns The board size
     */
    getSize(): number {
        return BOARD_SIZE;
    }
}

