/**
 * Integration tests for complete game flows
 * These tests verify that game systems work together correctly
 */

import { describe, it, expect } from 'vitest';
import { Board } from '../board';
import { calculateScore } from '../scoring';
import { PlacedBlock } from '../types';
import { GAMEPLAY_CONFIG } from '../config';

describe('Game Integration Tests', () => {
    describe('Scoring Integration', () => {
        it('should calculate score for cleared rows correctly', () => {
            const board = new Board();
            // Fill row 0 completely
            for (let x = 0; x < 8; x++) {
                board.placeShape([{ x: 0, y: 0 }], { x, y: 0 });
            }

            expect(board.isRowFull(0)).toBe(true);

            // Create placed blocks matching the board state
            const placedBlocks: PlacedBlock[] = [];
            for (let x = 0; x < 8; x++) {
                placedBlocks.push({
                    shape: [{ x: 0, y: 0 }],
                    position: { x, y: 0 },
                    color: '#000000',
                    pointValue: 1,
                    lineClearBonuses: 0,
                    totalShapesPlacedAtPlacement: 0,
                    shapeIndex: 0,
                    darkness: 1.0,
                });
            }

            const score = calculateScore([0], [], placedBlocks, false, 0);
            expect(score).toBe(8); // 8 blocks with point value 1
        });

        it('should handle explosion-removed cells in easy mode', () => {
            const placedBlocks: PlacedBlock[] = [
                {
                    shape: [{ x: 0, y: 0 }],
                    position: { x: 0, y: 0 },
                    color: '#000000',
                    pointValue: 70, // Above explosion threshold
                    lineClearBonuses: 0,
                    totalShapesPlacedAtPlacement: 0,
                    shapeIndex: 0,
                    darkness: 1.0,
                },
            ];

            const explosionCells = new Set<string>(['0,0']);
            const score = calculateScore([], [], placedBlocks, false, 0, explosionCells, 'easy');
            expect(score).toBe(70); // Explosion-removed block counts in easy mode
        });

        it('should not count explosion-removed cells in hard mode', () => {
            const placedBlocks: PlacedBlock[] = [
                {
                    shape: [{ x: 0, y: 0 }],
                    position: { x: 0, y: 0 },
                    color: '#000000',
                    pointValue: 70,
                    lineClearBonuses: 0,
                    totalShapesPlacedAtPlacement: 0,
                    shapeIndex: 0,
                    darkness: 1.0,
                },
            ];

            const explosionCells = new Set<string>(['0,0']);
            const score = calculateScore([], [], placedBlocks, false, 0, explosionCells, 'hard');
            expect(score).toBe(0); // Explosion-removed blocks don't count in hard mode
        });
    });

    describe('Board and Line Clearing Integration', () => {
        it('should clear full rows and columns correctly', () => {
            const board = new Board();
            
            // Fill row 0
            for (let x = 0; x < 8; x++) {
                board.placeShape([{ x: 0, y: 0 }], { x, y: 0 });
            }
            
            // Fill column 0
            for (let y = 0; y < 8; y++) {
                board.placeShape([{ x: 0, y: 0 }], { x: 0, y });
            }

            expect(board.isRowFull(0)).toBe(true);
            expect(board.isColumnFull(0)).toBe(true);

            board.clearRow(0);
            board.clearColumn(0);

            expect(board.isRowFull(0)).toBe(false);
            expect(board.isColumnFull(0)).toBe(false);
        });
    });
});
