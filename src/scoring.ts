/**
 * Scoring system with progressive multipliers and board-clear bonuses.
 */

const BASE_POINTS_PER_ROW = 100;
const BASE_POINTS_PER_COLUMN = 100;

/**
 * Calculates the score for cleared rows and columns using progressive multipliers.
 * The first line awards its base points, the second line is doubled, the third tripled, etc.
 * If the clear leaves the board empty, the total for that clear is multiplied by 5.
 */
export function calculateScore(
    rowsCleared: number,
    columnsCleared: number,
    boardCleared: boolean
): number {
    const lineValues: number[] = [
        ...Array(rowsCleared).fill(BASE_POINTS_PER_ROW),
        ...Array(columnsCleared).fill(BASE_POINTS_PER_COLUMN),
    ];

    if (lineValues.length === 0) {
        return 0;
    }

    let total = 0;
    lineValues.forEach((value, index) => {
        const multiplier = index + 1;
        total += value * multiplier;
    });

    if (boardCleared) {
        total *= 5;
    }

    return total;
}

