/**
 * Scoring system with progressive multipliers and board-clear bonuses.
 * Points are calculated based on the point values of cleared blocks.
 */

import { PlacedBlock } from './types';
import { GAMEPLAY_CONFIG } from './config';

/**
 * Calculates the score for cleared rows and columns.
 * Simply adds up the total point values of all blocks in the cleared lines/columns.
 */
export function calculateScore(
    fullRows: number[],
    fullColumns: number[],
    placedBlocks: PlacedBlock[],
    boardCleared: boolean,
    totalShapesPlaced: number
): number {
    if (fullRows.length === 0 && fullColumns.length === 0) {
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

    return total;
}

