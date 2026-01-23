/**
 * Shared layout constants for board and queue rendering/input math
 */

import { BOARD_CONFIG } from './config';

export const BOARD_CELL_COUNT = BOARD_CONFIG.cellCount;
export const BOARD_PIXEL_SIZE = 540; // Reduced by 10% (was 600)
export const CELL_SIZE = BOARD_PIXEL_SIZE / BOARD_CELL_COUNT;
// Canvas width stays at 600 to allow centering the smaller board
export const CANVAS_WIDTH = 600;
export const BOARD_OFFSET_X = (CANVAS_WIDTH - BOARD_PIXEL_SIZE) / 2; // Center the board horizontally (30px)

export const QUEUE_AREA_HEIGHT = 200;
// Top padding to leave space below progress bar
export const TOP_PADDING = 20;
// Calculate the board area height: board size + equal padding above and below
// This ensures the board is centered in the space above the queue
export const BOARD_AREA_HEIGHT = BOARD_PIXEL_SIZE + (TOP_PADDING * 2); // Board + equal padding top and bottom
export const CANVAS_HEIGHT = BOARD_AREA_HEIGHT + QUEUE_AREA_HEIGHT;
// Center the board vertically in the board area
// This positions it with equal padding (TOP_PADDING) above and below
export const BOARD_OFFSET_Y = TOP_PADDING;

export const QUEUE_AREA_PADDING = 10; // Reduced buffer
export const QUEUE_LABEL_HEIGHT = 20; // Reduced
export const QUEUE_ITEM_WIDTH = 150;
export const QUEUE_ITEM_HEIGHT = 150;

// Drag and drop constants
// Visual lift to prevent finger occlusion on mobile
// NOTE: Must be balanced with canvas geometry - too large makes bottom row unreachable
export const DRAG_VISUAL_OFFSET_Y = -180; // Vertical offset to lift piece above finger/cursor (negative = upward)

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
    // Queue starts after the board area (which includes padding)
    const y = BOARD_AREA_HEIGHT + QUEUE_AREA_PADDING + QUEUE_LABEL_HEIGHT;

    return {
        x,
        y,
        width: slotWidth,
        height: QUEUE_ITEM_HEIGHT,
    };
}

