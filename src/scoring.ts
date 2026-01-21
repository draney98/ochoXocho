/**
 * Scoring system with progressive multipliers and board-clear bonuses.
 * Points are calculated based on the point values of cleared blocks.
 */

import { PlacedBlock, Position } from './types';
import { GAMEPLAY_CONFIG } from './config';

/**
 * Calculates the score for cleared rows and columns.
 * Simply adds up the total point values of all blocks in the cleared lines/columns.
 * In easy mode, also counts explosion-removed blocks.
 */
export function calculateScore(
    fullRows: number[],
    fullColumns: number[],
    placedBlocks: PlacedBlock[],
    boardCleared: boolean,
    totalShapesPlaced: number,
    explosionRemovedCells?: Set<string>,  // Set of cell keys (x,y) removed by explosions
    mode?: 'easy' | 'hard'  // Game mode - easy mode counts explosion points
): number {
    if (fullRows.length === 0 && fullColumns.length === 0 && (!explosionRemovedCells || explosionRemovedCells.size === 0)) {
        return 0;
    }

    const clearedRowsSet = new Set(fullRows);
    const clearedColsSet = new Set(fullColumns);
    let total = 0;

    // Sum up point values of all blocks in cleared lines/columns
    for (const block of placedBlocks) {
        // Calculate current point value (base + line clear bonuses + level increments)
        const placementLevel = Math.floor(block.totalShapesPlacedAtPlacement / GAMEPLAY_CONFIG.shapesPerValueTier);
        const currentLevel = Math.floor(totalShapesPlaced / GAMEPLAY_CONFIG.shapesPerValueTier);
        const levelIncrements = currentLevel - placementLevel;
        const currentPointValue = block.pointValue + block.lineClearBonuses + (levelIncrements * GAMEPLAY_CONFIG.pointsPerTier);
        
        // Check if any cell of this block is in a cleared line/column
        let blockInClearedLine = false;
        for (const cell of block.shape) {
            const absoluteX = block.position.x + cell.x;
            const absoluteY = block.position.y + cell.y;
            
            if (clearedRowsSet.has(absoluteY) || clearedColsSet.has(absoluteX)) {
                blockInClearedLine = true;
                break;
            }
        }
        
        // If block is in a cleared line, add its point value
        if (blockInClearedLine) {
            total += currentPointValue;
        }
    }

    // In easy mode, also count explosion-removed blocks toward score
    if (mode === 'easy' && explosionRemovedCells && explosionRemovedCells.size > 0) {
        // Create a map of cell positions to blocks for quick lookup
        const cellToBlockMap = new Map<string, { block: PlacedBlock; cell: Position }>();
        for (const block of placedBlocks) {
            for (const cell of block.shape) {
                const absoluteX = block.position.x + cell.x;
                const absoluteY = block.position.y + cell.y;
                const key = `${absoluteX},${absoluteY}`;
                cellToBlockMap.set(key, { block, cell });
            }
        }

        // Count points for explosion-removed cells (only if not already in cleared lines)
        for (const key of explosionRemovedCells) {
            const [x, y] = key.split(',').map(Number);
            // Skip if already counted in line clear
            if (clearedRowsSet.has(y) || clearedColsSet.has(x)) {
                continue;
            }

            const cellData = cellToBlockMap.get(key);
            if (cellData) {
                const block = cellData.block;
                const placementLevel = Math.floor(block.totalShapesPlacedAtPlacement / GAMEPLAY_CONFIG.shapesPerValueTier);
                const currentLevel = Math.floor(totalShapesPlaced / GAMEPLAY_CONFIG.shapesPerValueTier);
                const levelIncrements = currentLevel - placementLevel;
                const currentPointValue = block.pointValue + block.lineClearBonuses + (levelIncrements * GAMEPLAY_CONFIG.pointsPerTier);
                total += currentPointValue;
            }
        }
    }

    return total;
}

