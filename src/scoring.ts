/**
 * Scoring system with base points and consecutive clear bonuses
 */

const BASE_POINTS_PER_ROW = 100;
const BASE_POINTS_PER_COLUMN = 100;

/**
 * Calculates the score for cleared rows and columns
 * Awards bonus points for consecutive clears
 * @param rowsCleared - Number of rows cleared
 * @param columnsCleared - Number of columns cleared
 * @param consecutiveClears - Number of consecutive clears in this turn
 * @returns The points to award
 */
export function calculateScore(
    rowsCleared: number,
    columnsCleared: number,
    consecutiveClears: number
): number {
    let baseScore = 0;

    // Base points for rows
    baseScore += rowsCleared * BASE_POINTS_PER_ROW;

    // Base points for columns
    baseScore += columnsCleared * BASE_POINTS_PER_COLUMN;

    // Consecutive clear multiplier
    // 2 consecutive = 2x, 3 consecutive = 3x, 4+ consecutive = 4x
    let multiplier = 1;
    if (consecutiveClears >= 4) {
        multiplier = 4;
    } else if (consecutiveClears >= 3) {
        multiplier = 3;
    } else if (consecutiveClears >= 2) {
        multiplier = 2;
    }

    return baseScore * multiplier;
}

/**
 * Gets the display text for the score breakdown
 * @param rowsCleared - Number of rows cleared
 * @param columnsCleared - Number of columns cleared
 * @param consecutiveClears - Number of consecutive clears
 * @returns A string describing the score breakdown
 */
export function getScoreBreakdown(
    rowsCleared: number,
    columnsCleared: number,
    consecutiveClears: number
): string {
    const baseScore = rowsCleared * BASE_POINTS_PER_ROW + columnsCleared * BASE_POINTS_PER_COLUMN;
    let multiplier = 1;
    if (consecutiveClears >= 4) {
        multiplier = 4;
    } else if (consecutiveClears >= 3) {
        multiplier = 3;
    } else if (consecutiveClears >= 2) {
        multiplier = 2;
    }

    let breakdown = `Base: ${baseScore}`;
    if (multiplier > 1) {
        breakdown += ` × ${multiplier} (${consecutiveClears} consecutive) = ${baseScore * multiplier}`;
    }

    return breakdown;
}

