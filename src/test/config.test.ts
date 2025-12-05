/**
 * Tests for configuration values
 */

import { describe, it, expect } from 'vitest';
import {
  BOARD_CONFIG,
  GAMEPLAY_CONFIG,
  ANIMATION_CONFIG,
  GAME_OVER_CONFIG,
  EASY_MODE_CONFIG,
  SOUND_CONFIG,
  DEFAULT_SETTINGS,
  STORAGE_KEYS,
  HIGH_SCORE_CONFIG,
  RESPONSIVE_CANVAS_LIMITS,
} from '../config';

describe('config', () => {
  describe('BOARD_CONFIG', () => {
    it('should have valid board cell count', () => {
      expect(BOARD_CONFIG.cellCount).toBeGreaterThan(0);
      expect(BOARD_CONFIG.cellCount).toBe(8);
    });
  });

  describe('GAMEPLAY_CONFIG', () => {
    it('should have valid gameplay values', () => {
      expect(GAMEPLAY_CONFIG.shapesPerTurn).toBeGreaterThan(0);
      expect(GAMEPLAY_CONFIG.levelProgressPerLine).toBeGreaterThan(0);
      expect(GAMEPLAY_CONFIG.levelProgressThreshold).toBeGreaterThan(0);
      expect(GAMEPLAY_CONFIG.darknessReduction).toBeGreaterThan(0);
      expect(GAMEPLAY_CONFIG.darknessReduction).toBeLessThanOrEqual(1);
      expect(GAMEPLAY_CONFIG.shapesPerValueTier).toBeGreaterThan(0);
      expect(GAMEPLAY_CONFIG.pointsPerTier).toBeGreaterThan(0);
    });
  });

  describe('ANIMATION_CONFIG', () => {
    it('should have positive animation durations', () => {
      expect(ANIMATION_CONFIG.lineClearMs).toBeGreaterThan(0);
      expect(ANIMATION_CONFIG.gameOverFadeMs).toBeGreaterThan(0);
    });
  });

  describe('GAME_OVER_CONFIG', () => {
    it('should have positive game over timings', () => {
      expect(GAME_OVER_CONFIG.popDelayMs).toBeGreaterThan(0);
      expect(GAME_OVER_CONFIG.popAnimationDurationMs).toBeGreaterThan(0);
      expect(GAME_OVER_CONFIG.restartDelayMs).toBeGreaterThan(0);
    });
  });

  describe('EASY_MODE_CONFIG', () => {
    it('should have positive attempt counts', () => {
      expect(EASY_MODE_CONFIG.maxOptimisticAttempts).toBeGreaterThan(0);
      expect(EASY_MODE_CONFIG.fallbackAttempts).toBeGreaterThan(0);
    });
  });

  describe('SOUND_CONFIG', () => {
    it('should have valid sound settings', () => {
      expect(SOUND_CONFIG.masterGain).toBeGreaterThan(0);
      expect(SOUND_CONFIG.masterGain).toBeLessThanOrEqual(1);
      expect(SOUND_CONFIG.place.frequency).toBeGreaterThan(0);
      expect(SOUND_CONFIG.place.duration).toBeGreaterThan(0);
      expect(SOUND_CONFIG.clear.baseFrequency).toBeGreaterThan(0);
      expect(SOUND_CONFIG.gameOver.frequency).toBeGreaterThan(0);
      expect(SOUND_CONFIG.pop.baseFrequency).toBeGreaterThan(0);
    });
  });

  describe('DEFAULT_SETTINGS', () => {
    it('should have all required settings fields', () => {
      expect(DEFAULT_SETTINGS).toHaveProperty('showGrid');
      expect(DEFAULT_SETTINGS).toHaveProperty('showGhostPreview');
      expect(DEFAULT_SETTINGS).toHaveProperty('enableAnimations');
      expect(DEFAULT_SETTINGS).toHaveProperty('soundEnabled');
      expect(DEFAULT_SETTINGS).toHaveProperty('theme');
      expect(DEFAULT_SETTINGS).toHaveProperty('mode');
    });
  });

  describe('STORAGE_KEYS', () => {
    it('should have all required storage keys', () => {
      expect(STORAGE_KEYS.settings).toBeTruthy();
      expect(STORAGE_KEYS.highScores.easy).toBeTruthy();
      expect(STORAGE_KEYS.highScores.hard).toBeTruthy();
    });
  });

  describe('HIGH_SCORE_CONFIG', () => {
    it('should have valid high score settings', () => {
      expect(HIGH_SCORE_CONFIG.pollIntervalMs).toBeGreaterThan(0);
      expect(HIGH_SCORE_CONFIG.maxEntries).toBeGreaterThan(0);
    });
  });

  describe('RESPONSIVE_CANVAS_LIMITS', () => {
    it('should have valid canvas limits', () => {
      expect(RESPONSIVE_CANVAS_LIMITS.minHeight).toBeGreaterThan(0);
      expect(RESPONSIVE_CANVAS_LIMITS.maxHeight).toBeGreaterThan(RESPONSIVE_CANVAS_LIMITS.minHeight);
      expect(RESPONSIVE_CANVAS_LIMITS.verticalPadding).toBeGreaterThanOrEqual(0);
      expect(RESPONSIVE_CANVAS_LIMITS.horizontalPadding).toBeGreaterThanOrEqual(0);
    });
  });
});

