/**
 * Game over detection - checks if any shapes can be placed on the board
 */

import { Shape } from './types';
import { Board } from './board';
import { canPlaceAnyShape } from './validator';

/**
 * Checks if the game is over by determining if any shape from the queue
 * can be placed on the board
 * @param board - The current game board state
 * @param queue - The queue of 3 shapes available to place
 * @returns True if game is over (no shapes can be placed)
 */
export function checkGameOver(board: Board, queue: Shape[]): boolean {
    // If there are no shapes in the queue, game is not over yet
    if (queue.length === 0) {
        return false;
    }

    // Check if any shape in the queue can be placed
    return !canPlaceAnyShape(board, queue);
}

