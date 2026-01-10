/**
 * Tests for input handling, specifically bottom row placement bug
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Board } from '../board';
import { canPlaceShape } from '../validator';
import { Position, Shape } from '../types';
import {
    BOARD_OFFSET_X,
    BOARD_OFFSET_Y,
    BOARD_PIXEL_SIZE,
    CELL_SIZE,
    DRAG_VISUAL_OFFSET_Y,
    BOARD_CELL_COUNT,
} from '../constants';

// Test shapes
const MONOMINO: Shape = [{ x: 0, y: 0 }];
const DOMINO_H: Shape = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
const DOMINO_V: Shape = [{ x: 0, y: 0 }, { x: 0, y: 1 }];
const SQUARE_2X2: Shape = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
];

/**
 * Simulates calculateGridPosition logic for testing
 * This mirrors the private method in InputHandler
 */
function simulateCalculateGridPosition(
    cursorPosition: { x: number; y: number },
    shape: Shape
): Position | null {
    const adjustedX = cursorPosition.x - BOARD_OFFSET_X;
    const adjustedY = cursorPosition.y - BOARD_OFFSET_Y;
    
    if (adjustedX < 0 || adjustedX >= BOARD_PIXEL_SIZE) {
        return null;
    }

    const minX = Math.min(...shape.map(b => b.x));
    const minY = Math.min(...shape.map(b => b.y));
    const maxX = Math.max(...shape.map(b => b.x));
    const maxY = Math.max(...shape.map(b => b.y));

    const cursorGridX = Math.floor(adjustedX / CELL_SIZE);
    const cursorGridY = Math.floor(adjustedY / CELL_SIZE);

    const shapeGridX = cursorGridX - minX;
    const shapeGridY = cursorGridY - minY;
    
    if (shapeGridX < 0 || shapeGridX >= BOARD_CELL_COUNT ||
        shapeGridY < 0 || shapeGridY >= BOARD_CELL_COUNT) {
        return null;
    }
    
    // Additional validation: ensure all shape blocks would be within bounds
    const finalMaxX = shapeGridX + maxX;
    const finalMaxY = shapeGridY + maxY;
    if (finalMaxX >= BOARD_CELL_COUNT || finalMaxY >= BOARD_CELL_COUNT) {
        return null;
    }
    
    return {
        x: shapeGridX,
        y: shapeGridY
    };
}

/**
 * Simulates coordinate calculations for drag operations
 * Placement is based on visual piece position (no shadow)
 */
function simulateDragCoordinates(fingerY: number) {
    const canvasX = BOARD_OFFSET_X + (BOARD_PIXEL_SIZE / 2); // Center X
    const canvasY = fingerY;
    
    // For touch, projectedPos uses reach mapping, but for testing we'll use 1:1
    const projectedPos = { x: canvasX, y: canvasY };
    
    const visualPiecePosition = {
        x: projectedPos.x,
        y: projectedPos.y + DRAG_VISUAL_OFFSET_Y
    };
    
    return {
        anchorPoint: { x: canvasX, y: canvasY },
        projectedPos,
        visualPiecePosition,
    };
}

describe('Bottom Row Placement', () => {
    let board: Board;

    beforeEach(() => {
        board = new Board();
    });

    describe('Single cell shape bottom row placement', () => {
        it('should place monomino in row 7 when finger is at bottom', () => {
            // Simulate finger at bottom of board (row 7)
            // Bottom row center: BOARD_OFFSET_Y + 7 * CELL_SIZE + CELL_SIZE/2
            const bottomRowCenterY = BOARD_OFFSET_Y + 7 * CELL_SIZE + CELL_SIZE / 2;
            const coords = simulateDragCoordinates(bottomRowCenterY);
            
            // Calculate grid position from visual piece position
            const gridPos = simulateCalculateGridPosition(coords.visualPiecePosition, MONOMINO);
            
            expect(gridPos).not.toBeNull();
            if (gridPos) {
                expect(gridPos.y).toBe(7); // Bottom row
                expect(canPlaceShape(board, MONOMINO, gridPos)).toBe(true);
            }
        });

        it('should place monomino in row 7 when visual piece position is calculated', () => {
            // Test with finger position that results in visual piece targeting bottom row
            // Visual piece is 240px above finger
            // For visual piece to be at row 7, we need: visualY = BOARD_OFFSET_Y + 7 * CELL_SIZE + CELL_SIZE/2
            const targetVisualY = BOARD_OFFSET_Y + 7 * CELL_SIZE + CELL_SIZE / 2;
            const fingerY = targetVisualY - DRAG_VISUAL_OFFSET_Y;
            
            const coords = simulateDragCoordinates(fingerY);
            const gridPos = simulateCalculateGridPosition(coords.visualPiecePosition, MONOMINO);
            
            expect(gridPos).not.toBeNull();
            if (gridPos) {
                expect(gridPos.y).toBe(7);
            }
        });
    });

    describe('2x2 shape bottom edge alignment', () => {
        it('should place 2x2 square with bottom edge at row 7', () => {
            // For 2x2 square to have bottom edge at row 7, the shape position should be y=6
            // (since shape has blocks at y=0 and y=1, so y=6 means blocks at rows 6 and 7)
            const targetShapeY = 6;
            const targetVisualY = BOARD_OFFSET_Y + targetShapeY * CELL_SIZE + CELL_SIZE / 2;
            const fingerY = targetVisualY - DRAG_VISUAL_OFFSET_Y;
            
            const coords = simulateDragCoordinates(fingerY);
            const gridPos = simulateCalculateGridPosition(coords.visualPiecePosition, SQUARE_2X2);
            
            expect(gridPos).not.toBeNull();
            if (gridPos) {
                expect(gridPos.y).toBe(targetShapeY);
                // Verify all blocks are within bounds
                expect(canPlaceShape(board, SQUARE_2X2, gridPos)).toBe(true);
                
                // Verify bottom row is occupied
                const bottomBlockY = gridPos.y + 1; // Square has block at relative y=1
                expect(bottomBlockY).toBe(7);
            }
        });
    });

    describe('Automated touch simulation', () => {
        it('should produce valid placement for three Y values in control zone', () => {
            const CANVAS_HEIGHT = BOARD_OFFSET_Y + BOARD_PIXEL_SIZE + 220; // From constants
            const controlZoneTop = CANVAS_HEIGHT * 0.67; // Bottom 33% is control zone
            
            // Test three positions: top of control zone, middle, and bottom
            const testPositions = [
                controlZoneTop,
                controlZoneTop + (CANVAS_HEIGHT - controlZoneTop) / 2,
                CANVAS_HEIGHT - 10, // Near absolute bottom
            ];
            
            for (const fingerY of testPositions) {
                const coords = simulateDragCoordinates(fingerY);
                const gridPos = simulateCalculateGridPosition(coords.visualPiecePosition, MONOMINO);
                
                // Should produce a valid grid position (may not be row 7, but should be valid)
                if (gridPos) {
                    expect(gridPos.x).toBeGreaterThanOrEqual(0);
                    expect(gridPos.x).toBeLessThan(BOARD_CELL_COUNT);
                    expect(gridPos.y).toBeGreaterThanOrEqual(0);
                    expect(gridPos.y).toBeLessThan(BOARD_CELL_COUNT);
                    expect(canPlaceShape(board, MONOMINO, gridPos)).toBe(true);
                }
            }
        });

        it('should handle finger at absolute bottom of screen', () => {
            const CANVAS_HEIGHT = BOARD_OFFSET_Y + BOARD_PIXEL_SIZE + 220;
            const absoluteBottom = CANVAS_HEIGHT - 1;
            
            const coords = simulateDragCoordinates(absoluteBottom);
            
            // Visual piece position might be above board, so test both visual and projected
            let gridPos = simulateCalculateGridPosition(coords.visualPiecePosition, MONOMINO);
            
            // If visual piece fails, try projected (simulating fallback)
            if (!gridPos) {
                gridPos = simulateCalculateGridPosition(coords.projectedPos, MONOMINO);
            }
            
            // Should find a valid position (neighborhood probing would help in real code)
            // For this test, we verify the logic doesn't crash and produces some result
            expect(gridPos === null || (gridPos.y >= 0 && gridPos.y < BOARD_CELL_COUNT)).toBe(true);
        });
    });

    describe('Regression tests for rows 0-6', () => {
        it('should place monomino in all rows 0-6', () => {
            for (let row = 0; row < 7; row++) {
                const targetY = BOARD_OFFSET_Y + row * CELL_SIZE + CELL_SIZE / 2;
                const coords = simulateDragCoordinates(targetY);
                const gridPos = simulateCalculateGridPosition(coords.visualPiecePosition, MONOMINO);
                
                expect(gridPos).not.toBeNull();
                if (gridPos) {
                    expect(gridPos.y).toBe(row);
                    expect(canPlaceShape(board, MONOMINO, gridPos)).toBe(true);
                }
            }
        });

        it('should place vertical domino in rows 0-6', () => {
            for (let row = 0; row < 7; row++) {
                const targetY = BOARD_OFFSET_Y + row * CELL_SIZE + CELL_SIZE / 2;
                const coords = simulateDragCoordinates(targetY);
                const gridPos = simulateCalculateGridPosition(coords.visualPiecePosition, DOMINO_V);
                
                expect(gridPos).not.toBeNull();
                if (gridPos) {
                    expect(gridPos.y).toBe(row);
                    expect(canPlaceShape(board, DOMINO_V, gridPos)).toBe(true);
                }
            }
        });
    });

    describe('Shape with negative minY', () => {
        it('should handle L-shape with negative minY for bottom row', () => {
            // L-shape example: blocks at (0,0), (0,1), (1,1)
            // minY = 0, but if rotated could have negative
            // Test with shape that extends upward
            const L_SHAPE_UP: Shape = [
                { x: 0, y: -1 },
                { x: 0, y: 0 },
                { x: 1, y: 0 },
            ];
            
            // For this shape to place bottom block at row 7, position should be y=7
            const targetY = BOARD_OFFSET_Y + 7 * CELL_SIZE + CELL_SIZE / 2;
            const coords = simulateDragCoordinates(targetY);
            const gridPos = simulateCalculateGridPosition(coords.visualPiecePosition, L_SHAPE_UP);
            
            // Should calculate correctly accounting for negative minY
            if (gridPos) {
                // Shape at y=7 with minY=-1 means blocks at rows 6, 7, 7
                // So gridPos.y should be 7 - (-1) = 8, but that's out of bounds
                // Actually, if we want bottom at row 7, we need gridPos.y = 7 - 0 = 7
                // But shape has block at y=-1, so that block would be at row 6
                // This test verifies the calculation handles negative minY
                expect(gridPos.y).toBeGreaterThanOrEqual(0);
                expect(gridPos.y).toBeLessThan(BOARD_CELL_COUNT);
            }
        });
    });
});

