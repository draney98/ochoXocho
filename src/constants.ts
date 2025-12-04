/**
 * Shared layout constants for board and queue rendering/input math
 */

export const BOARD_CELL_COUNT = 8;
export const BOARD_PIXEL_SIZE = 600;
export const CELL_SIZE = BOARD_PIXEL_SIZE / BOARD_CELL_COUNT;

export const QUEUE_AREA_HEIGHT = 220;
export const CANVAS_WIDTH = BOARD_PIXEL_SIZE;
export const CANVAS_HEIGHT = BOARD_PIXEL_SIZE + QUEUE_AREA_HEIGHT;

export const QUEUE_AREA_PADDING = 20;
export const QUEUE_LABEL_HEIGHT = 30;
export const QUEUE_ITEM_WIDTH = 150;
export const QUEUE_ITEM_HEIGHT = 150;
export const QUEUE_ITEM_GAP = 20;
export const QUEUE_CELL_SIZE = 26; // pixel size for each cell within queue preview

/**
 * Calculates the rectangle for a queue item positioned horizontally under the board.
 * @param index - zero-based item index
 * @param totalItems - number of items in the queue (default 3)
 */
export function getQueueItemRect(index: number, totalItems: number = 3) {
    const totalWidth =
        totalItems * QUEUE_ITEM_WIDTH + (totalItems - 1) * QUEUE_ITEM_GAP;
    const startX = (CANVAS_WIDTH - totalWidth) / 2;
    const x = startX + index * (QUEUE_ITEM_WIDTH + QUEUE_ITEM_GAP);
    const y = BOARD_PIXEL_SIZE + QUEUE_AREA_PADDING + QUEUE_LABEL_HEIGHT;

    return {
        x,
        y,
        width: QUEUE_ITEM_WIDTH,
        height: QUEUE_ITEM_HEIGHT,
    };
}

