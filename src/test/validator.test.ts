/**
 * Tests for validator functions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Board } from '../board';
import { canPlaceShape, getValidPositions, canPlaceAnyShape, snapToGrid } from '../validator';
import { Position, Shape } from '../types';

// Test shapes
const MONOMINO: Shape = [{ x: 0, y: 0 }];
const DOMINO: Shape = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
const IPIECE: Shape = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];

describe('validator', () => {
  let board: Board;

  beforeEach(() => {
    board = new Board();
  });

  describe('canPlaceShape', () => {
    it('should allow placing a shape on an empty board', () => {
      expect(canPlaceShape(board, MONOMINO, { x: 0, y: 0 })).toBe(true);
      expect(canPlaceShape(board, DOMINO, { x: 0, y: 0 })).toBe(true);
    });

    it('should reject placement outside board boundaries', () => {
      expect(canPlaceShape(board, IPIECE, { x: 5, y: 0 })).toBe(false); // Would extend to x=8
      expect(canPlaceShape(board, IPIECE, { x: -1, y: 0 })).toBe(false);
      expect(canPlaceShape(board, IPIECE, { x: 0, y: -1 })).toBe(false);
      expect(canPlaceShape(board, IPIECE, { x: 0, y: 8 })).toBe(false);
    });

    it('should reject placement on occupied cells', () => {
      board.placeShape(MONOMINO, { x: 0, y: 0 });
      expect(canPlaceShape(board, MONOMINO, { x: 0, y: 0 })).toBe(false);
    });

    it('should allow placement adjacent to occupied cells', () => {
      board.placeShape(MONOMINO, { x: 0, y: 0 });
      expect(canPlaceShape(board, MONOMINO, { x: 1, y: 0 })).toBe(true);
      expect(canPlaceShape(board, MONOMINO, { x: 0, y: 1 })).toBe(true);
    });
  });

  describe('getValidPositions', () => {
    it('should find valid positions for a monomino on empty board', () => {
      const positions = getValidPositions(board, MONOMINO);
      expect(positions).toHaveLength(64); // All 64 cells are valid
    });

    it('should find fewer positions when board has obstacles', () => {
      // Fill a row
      for (let x = 0; x < 8; x++) {
        board.placeShape(MONOMINO, { x, y: 0 });
      }
      const positions = getValidPositions(board, MONOMINO);
      expect(positions.length).toBeLessThan(64);
      // Should not include any positions in row 0
      expect(positions.every(p => p.y !== 0)).toBe(true);
    });

    it('should return empty array when no valid positions exist', () => {
      // Fill entire board
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          board.placeShape(MONOMINO, { x, y });
        }
      }
      const positions = getValidPositions(board, MONOMINO);
      expect(positions).toHaveLength(0);
    });
  });

  describe('canPlaceAnyShape', () => {
    it('should return true if any shape can be placed', () => {
      const shapes = [MONOMINO, DOMINO, IPIECE];
      expect(canPlaceAnyShape(board, shapes)).toBe(true);
    });

    it('should return false if no shapes can be placed', () => {
      // Fill entire board
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 8; x++) {
          board.placeShape(MONOMINO, { x, y });
        }
      }
      const shapes = [MONOMINO, DOMINO, IPIECE];
      expect(canPlaceAnyShape(board, shapes)).toBe(false);
    });
  });

  describe('snapToGrid', () => {
    it('should snap coordinates to grid cells', () => {
      expect(snapToGrid(0, 0, 75)).toEqual({ x: 0, y: 0 });
      expect(snapToGrid(37, 37, 75)).toEqual({ x: 0, y: 0 });
      expect(snapToGrid(75, 75, 75)).toEqual({ x: 1, y: 1 });
      expect(snapToGrid(149, 149, 75)).toEqual({ x: 1, y: 1 });
      expect(snapToGrid(150, 150, 75)).toEqual({ x: 2, y: 2 });
    });

    it('should handle edge cases', () => {
      expect(snapToGrid(-10, -10, 75)).toEqual({ x: -1, y: -1 });
      expect(snapToGrid(600, 600, 75)).toEqual({ x: 8, y: 8 });
    });
  });
});

