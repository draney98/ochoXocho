# Changelog

## 1.1.1 - 2025-12-04

- Code cleanup and refactoring:
  - Removed unused imports (`COLOR_SETS`, `QUEUE_CELL_SIZE`, `BOARD_PIXEL_SIZE`, `QUEUE_AREA_HEIGHT`)
  - Extracted duplicate shape dimension calculation logic into `calculateGridPositionFromEffectivePosition` helper method
  - Improved code maintainability by reducing duplication in drag-and-drop handlers

## 1.1.0 - 2025-12-04

- added Web Audio effects for placements, clears, and game over (with mute toggle)
- introduced the design selector with Classic, Midnight, and Sunset themes
- overhauled scoring with progressive multipliers, a 5× board-clear bonus, and per-block rewards at game over

## 1.0.1 - 2025-12-04

- removed unused tetromino letter helpers and animation metadata
- improved README instructions to reflect the under-board queue and settings panel
- documented the settings controls for future players

## 1.0.0 - Initial Release

- first playable version of the OchoXocho block placement puzzle

