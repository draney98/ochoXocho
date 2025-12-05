/**
 * Tests for Board class
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Board } from '../board';
import { Position, Shape } from '../types';

// Test shapes
const MONOMINO: Shape = [{ x: 0, y: 0 }];
const DOMINO: Shape = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
const IPIECE: Shape = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }];

describe('Board', () => {
  let board: Board;

  beforeEach(() => {
    board = new Board();
  });

  describe('initialization', () => {
    it('should create an empty 8x8 board', () => {
      const grid = board.getGrid();
      expect(grid).toHaveLength(8);
      expect(grid[0]).toHaveLength(8);
      expect(grid.every(row => row.every(cell => cell === false))).toBe(true);
    });

    it('should return correct board size', () => {
      expect(board.getSize()).toBe(8);
    });
  });

  describe('cell operations', () => {
    it('should identify empty cells', () => {
      expect(board.isCellEmpty({ x: 0, y: 0 })).toBe(true);
      expect(board.isCellEmpty({ x: 7, y: 7 })).toBe(true);
    });

    it('should reject out-of-bounds positions', () => {
      expect(board.isCellEmpty({ x: -1, y: 0 })).toBe(false);
      expect(board.isCellEmpty({ x: 8, y: 0 })).toBe(false);
      expect(board.isCellEmpty({ x: 0, y: -1 })).toBe(false);
      expect(board.isCellEmpty({ x: 0, y: 8 })).toBe(false);
    });

    it('should clear a specific cell', () => {
      board.placeShape(MONOMINO, { x: 0, y: 0 });
      expect(board.isCellEmpty({ x: 0, y: 0 })).toBe(false);
      board.clearCell(0, 0);
      expect(board.isCellEmpty({ x: 0, y: 0 })).toBe(true);
    });
  });

  describe('shape placement', () => {
    it('should place a monomino shape', () => {
      board.placeShape(MONOMINO, { x: 0, y: 0 });
      expect(board.isCellEmpty({ x: 0, y: 0 })).toBe(false);
    });

    it('should place a domino shape', () => {
      board.placeShape(DOMINO, { x: 0, y: 0 });
      expect(board.isCellEmpty({ x: 0, y: 0 })).toBe(false);
      expect(board.isCellEmpty({ x: 1, y: 0 })).toBe(false);
    });

    it('should place a tetromino shape', () => {
      board.placeShape(IPIECE, { x: 0, y: 0 });
      expect(board.isCellEmpty({ x: 0, y: 0 })).toBe(false);
      expect(board.isCellEmpty({ x: 1, y: 0 })).toBe(false);
      expect(board.isCellEmpty({ x: 2, y: 0 })).toBe(false);
      expect(board.isCellEmpty({ x: 3, y: 0 })).toBe(false);
    });

    it('should not place shapes outside board boundaries', () => {
      board.placeShape(IPIECE, { x: 6, y: 0 }); // Should only place 2 cells (6, 7)
      expect(board.isCellEmpty({ x: 6, y: 0 })).toBe(false);
      expect(board.isCellEmpty({ x: 7, y: 0 })).toBe(false);
      // Cells at x=8,9 should not be placed (out of bounds)
    });
  });

  describe('row operations', () => {
    it('should detect full rows', () => {
      // Fill row 0 completely
      for (let x = 0; x < 8; x++) {
        board.placeShape(MONOMINO, { x, y: 0 });
      }
      expect(board.isRowFull(0)).toBe(true);
      expect(board.isRowFull(1)).toBe(false);
    });

    it('should get all full rows', () => {
      // Fill rows 0 and 2
      for (let x = 0; x < 8; x++) {
        board.placeShape(MONOMINO, { x, y: 0 });
        board.placeShape(MONOMINO, { x, y: 2 });
      }
      const fullRows = board.getFullRows();
      expect(fullRows).toContain(0);
      expect(fullRows).toContain(2);
      expect(fullRows).not.toContain(1);
    });

    it('should clear a row', () => {
      // Fill row 0
      for (let x = 0; x < 8; x++) {
        board.placeShape(MONOMINO, { x, y: 0 });
      }
      board.clearRow(0);
      expect(board.isRowFull(0)).toBe(false);
      expect(board.getEmptyCells().some(cell => cell.y === 0 && cell.x < 8)).toBe(true);
    });
  });

  describe('column operations', () => {
    it('should detect full columns', () => {
      // Fill column 0 completely
      for (let y = 0; y < 8; y++) {
        board.placeShape(MONOMINO, { x: 0, y });
      }
      expect(board.isColumnFull(0)).toBe(true);
      expect(board.isColumnFull(1)).toBe(false);
    });

    it('should get all full columns', () => {
      // Fill columns 0 and 2
      for (let y = 0; y < 8; y++) {
        board.placeShape(MONOMINO, { x: 0, y });
        board.placeShape(MONOMINO, { x: 2, y });
      }
      const fullColumns = board.getFullColumns();
      expect(fullColumns).toContain(0);
      expect(fullColumns).toContain(2);
      expect(fullColumns).not.toContain(1);
    });

    it('should clear a column', () => {
      // Fill column 0
      for (let y = 0; y < 8; y++) {
        board.placeShape(MONOMINO, { x: 0, y });
      }
      board.clearColumn(0);
      expect(board.isColumnFull(0)).toBe(false);
      expect(board.getEmptyCells().some(cell => cell.x === 0 && cell.y < 8)).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset board to empty state', () => {
      board.placeShape(MONOMINO, { x: 0, y: 0 });
      expect(board.isEmpty()).toBe(false);
      board.reset();
      expect(board.isEmpty()).toBe(true);
    });
  });

  describe('getEmptyCells', () => {
    it('should return all empty cells', () => {
      const emptyCells = board.getEmptyCells();
      expect(emptyCells).toHaveLength(64); // 8x8 = 64
    });

    it('should return fewer empty cells after placing shapes', () => {
      board.placeShape(MONOMINO, { x: 0, y: 0 });
      const emptyCells = board.getEmptyCells();
      expect(emptyCells).toHaveLength(63);
    });
  });
});

