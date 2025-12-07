/**
 * Utility functions for board operations
 */

import { Board } from './board';
import { Shape, Position } from './types';
import { BOARD_CELL_COUNT } from './constants';
import { getValidPositions } from './validator';

const BOARD_SIZE = BOARD_CELL_COUNT;

/**
 * Converts the board state to an emoji text representation
 * @param board - The game board
 * @returns Multi-line string with emoji representation
 */
export function boardToEmoji(board: Board): string {
    const grid = board.getGrid();
    const lines: string[] = [];
    
    for (let y = 0; y < BOARD_SIZE; y++) {
        let line = '';
        for (let x = 0; x < BOARD_SIZE; x++) {
            line += grid[y][x] ? '🟦' : '⬜';
        }
        lines.push(line);
    }
    
    return lines.join('\n');
}

/**
 * Determines the optimal placement order for the three shapes in the queue
 * Uses the same simulation logic as generateEasyShapes to find a valid sequence
 * @param board - The current game board
 * @param shapes - Array of 3 shapes in the queue
 * @returns Array of { shapeIndex, position } in optimal order, or null if no valid sequence found
 */
export function findOptimalPlacementOrder(
    board: Board,
    shapes: (Shape | null)[]
): Array<{ shapeIndex: number; position: Position }> | null {
    // Filter out null shapes
    const validShapes = shapes
        .map((shape, index) => ({ shape, index }))
        .filter(({ shape }) => shape !== null) as Array<{ shape: Shape; index: number }>;
    
    if (validShapes.length === 0) {
        return null;
    }
    
    // Create a virtual board to simulate placements
    const virtualGrid = board.getGrid().map(row => [...row]);
    
    // Try different permutations to find a valid sequence
    const MAX_ATTEMPTS = 100;
    
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        // Shuffle the shapes for this attempt
        const shuffled = [...validShapes];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        
        // Try to place all shapes in this order
        const result: Array<{ shapeIndex: number; position: Position }> = [];
        const tempGrid = virtualGrid.map(row => [...row]);
        let allPlaced = true;
        
        for (const { shape, index } of shuffled) {
            // Find valid positions for this shape on the current temp grid
            const validPositions = getValidPositionsForGrid(tempGrid, shape);
            
            if (validPositions.length === 0) {
                allPlaced = false;
                break;
            }
            
            // Score positions based on how many lines/columns they would clear
            const scoredPositions = validPositions.map(pos => {
                // Create a temporary grid to test this placement
                const testGrid = tempGrid.map(row => [...row]);
                placeShapeOnGrid(testGrid, shape, pos);
                
                // Count how many lines/columns would be cleared
                const fullLines = countFullLines(testGrid);
                const score = fullLines.rows + fullLines.columns;
                
                return { position: pos, score };
            });
            
            // Sort by score (highest first) - prioritize positions that clear lines/columns
            scoredPositions.sort((a, b) => b.score - a.score);
            
            // Pick the best position (or random among top scorers if tied)
            const topScore = scoredPositions[0].score;
            const topScorers = scoredPositions.filter(p => p.score === topScore);
            const position = topScorers[Math.floor(Math.random() * topScorers.length)].position;
            
            // Place the shape on temp grid
            placeShapeOnGrid(tempGrid, shape, position);
            
            // Simulate line clearing
            simulateLineClearing(tempGrid);
            
            result.push({ shapeIndex: index, position });
        }
        
        if (allPlaced) {
            return result;
        }
    }
    
    // If we couldn't find a valid sequence, try placing them one by one in original order
    const result: Array<{ shapeIndex: number; position: Position }> = [];
    const tempGrid = virtualGrid.map(row => [...row]);
    
    for (const { shape, index } of validShapes) {
        const validPositions = getValidPositionsForGrid(tempGrid, shape);
        if (validPositions.length === 0) {
            // Can't place this shape, return what we have so far
            return result.length > 0 ? result : null;
        }
        
        // Score positions based on how many lines/columns they would clear
        const scoredPositions = validPositions.map(pos => {
            const testGrid = tempGrid.map(row => [...row]);
            placeShapeOnGrid(testGrid, shape, pos);
            const fullLines = countFullLines(testGrid);
            const score = fullLines.rows + fullLines.columns;
            return { position: pos, score };
        });
        
        // Sort by score (highest first)
        scoredPositions.sort((a, b) => b.score - a.score);
        
        // Pick the best position (or random among top scorers if tied)
        const topScore = scoredPositions[0].score;
        const topScorers = scoredPositions.filter(p => p.score === topScore);
        const position = topScorers[Math.floor(Math.random() * topScorers.length)].position;
        
        placeShapeOnGrid(tempGrid, shape, position);
        simulateLineClearing(tempGrid);
        result.push({ shapeIndex: index, position });
    }
    
    return result.length > 0 ? result : null;
}

/**
 * Helper function to find valid positions on a grid array
 */
function getValidPositionsForGrid(grid: boolean[][], shape: Shape): Position[] {
    const validPositions: Position[] = [];
    
    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            const position: Position = { x, y };
            let canPlace = true;
            
            for (const block of shape) {
                const blockX = position.x + block.x;
                const blockY = position.y + block.y;
                
                if (blockX < 0 || blockX >= BOARD_SIZE || blockY < 0 || blockY >= BOARD_SIZE) {
                    canPlace = false;
                    break;
                }
                
                if (grid[blockY][blockX]) {
                    canPlace = false;
                    break;
                }
            }
            
            if (canPlace) {
                validPositions.push(position);
            }
        }
    }
    
    return validPositions;
}

/**
 * Helper function to place a shape on a grid array
 */
function placeShapeOnGrid(grid: boolean[][], shape: Shape, position: Position): void {
    for (const block of shape) {
        const x = position.x + block.x;
        const y = position.y + block.y;
        if (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE) {
            grid[y][x] = true;
        }
    }
}

/**
 * Helper function to count full lines/columns without clearing them
 */
function countFullLines(grid: boolean[][]): { rows: number; columns: number } {
    const BOARD_SIZE = BOARD_CELL_COUNT;
    
    // Find full rows
    let fullRows = 0;
    for (let row = 0; row < BOARD_SIZE; row++) {
        if (grid[row].every(cell => cell === true)) {
            fullRows++;
        }
    }
    
    // Find full columns
    let fullColumns = 0;
    for (let col = 0; col < BOARD_SIZE; col++) {
        let isFull = true;
        for (let row = 0; row < BOARD_SIZE; row++) {
            if (!grid[row][col]) {
                isFull = false;
                break;
            }
        }
        if (isFull) {
            fullColumns++;
        }
    }
    
    return { rows: fullRows, columns: fullColumns };
}

/**
 * Helper function to simulate line clearing on a grid array
 */
function simulateLineClearing(grid: boolean[][]): void {
    // Find full rows
    const fullRows: number[] = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
        if (grid[row].every(cell => cell === true)) {
            fullRows.push(row);
        }
    }
    
    // Find full columns
    const fullColumns: number[] = [];
    for (let col = 0; col < BOARD_SIZE; col++) {
        let isFull = true;
        for (let row = 0; row < BOARD_SIZE; row++) {
            if (!grid[row][col]) {
                isFull = false;
                break;
            }
        }
        if (isFull) {
            fullColumns.push(col);
        }
    }
    
    // Clear full rows
    for (const row of fullRows) {
        grid[row].fill(false);
    }
    
    // Clear full columns
    for (const col of fullColumns) {
        for (let row = 0; row < BOARD_SIZE; row++) {
            grid[row][col] = false;
        }
    }
}

