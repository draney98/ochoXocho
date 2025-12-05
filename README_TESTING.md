# Testing Guide

This project uses [Vitest](https://vitest.dev/) for unit testing.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Test Structure

Tests are located in `src/test/` directory:

- `setup.ts` - Test setup and global mocks
- `board.test.ts` - Board class tests
- `validator.test.ts` - Validation logic tests
- `scoring.test.ts` - Scoring system tests
- `config.test.ts` - Configuration validation tests

## Writing Tests

Tests use Vitest's API which is similar to Jest:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('MyClass', () => {
  beforeEach(() => {
    // Setup before each test
  });

  it('should do something', () => {
    expect(something).toBe(expected);
  });
});
```

## Test Coverage

Coverage reports are generated in the `coverage/` directory when running `npm run test:coverage`.

## Mocking

The test setup includes mocks for:
- `localStorage` - In-memory storage for tests
- `AudioContext` - Mock Web Audio API for sound tests

