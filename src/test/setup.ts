/**
 * Test setup file - runs before all tests
 * Use this to configure test environment, mocks, or global test utilities
 */

import { afterEach, vi } from 'vitest';

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks();
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock AudioContext for sound tests
(globalThis as any).AudioContext = class MockAudioContext {
  state = 'running';
  currentTime = 0;
  destination = {} as AudioDestinationNode;

  createGain() {
    return {
      gain: { value: 0 },
      connect: vi.fn(),
    } as unknown as GainNode;
  }

  createOscillator() {
    return {
      type: '',
      frequency: { value: 0 },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    } as unknown as OscillatorNode;
  }

  resume() {
    return Promise.resolve();
  }

  suspend() {
    return Promise.resolve();
  }
} as unknown as typeof AudioContext;

