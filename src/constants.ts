/**
 * Shared layout constants for board and queue rendering/input math
 */

import { BOARD_CONFIG } from './config';

export const BOARD_CELL_COUNT = BOARD_CONFIG.cellCount;
export const BOARD_PIXEL_SIZE = 600;
export const CELL_SIZE = BOARD_PIXEL_SIZE / BOARD_CELL_COUNT;

export const QUEUE_AREA_HEIGHT = 220;
export const CANVAS_WIDTH = BOARD_PIXEL_SIZE;
export const CANVAS_HEIGHT = BOARD_PIXEL_SIZE + QUEUE_AREA_HEIGHT;

export const QUEUE_AREA_PADDING = 10; // Reduced buffer
export const QUEUE_LABEL_HEIGHT = 20; // Reduced
export const QUEUE_ITEM_WIDTH = 150;
export const QUEUE_ITEM_HEIGHT = 150;
export const QUEUE_ITEM_GAP = 10; // (unused now, kept for compatibility)
export const QUEUE_CELL_SIZE = 42; // (unused for sizing, kept for compatibility)

// Drag and drop constants
export const LIFT_OFFSET_PIXELS = 100; // Vertical offset for lifted piece during drag

/**
 * Calculates the rectangle for a queue item positioned horizontally under the board.
 * @param index - zero-based item index
 * @param totalItems - number of items in the queue (default 3)
 */
export function getQueueItemRect(index: number, totalItems: number = 3) {
    // Each slot gets equal width (approx 33% of canvas) with 2% canvas gap between slots
    const gap = CANVAS_WIDTH * 0.02;
    const slotWidth = (CANVAS_WIDTH - gap * (totalItems - 1)) / totalItems;
    const totalWidth = slotWidth * totalItems + gap * (totalItems - 1);
    const startX = (CANVAS_WIDTH - totalWidth) / 2;
    const x = startX + index * (slotWidth + gap);
    const y = BOARD_PIXEL_SIZE + QUEUE_AREA_PADDING + QUEUE_LABEL_HEIGHT;

    return {
        x,
        y,
        width: slotWidth,
        height: QUEUE_ITEM_HEIGHT,
    };
}

