# Block Placement Puzzle Game

A complete block placement puzzle game built with TypeScript, HTML Canvas, and standard web technologies. The game features an 8x8 grid where players place tetromino and pentomino shapes to clear rows and columns.

## Features

- **8x8 Game Board**: Strategic placement on a compact grid
- **Shape Queue**: Receive 3 random shapes per turn from a pool of tetrominoes and pentominoes
- **Drag and Drop**: Intuitive mouse-based placement system
- **Line Clearing**: Clear full rows or columns to score points
- **Consecutive Bonuses**: Earn multiplier bonuses for consecutive clears
- **Game Over Detection**: Game ends when no shapes can be placed

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser and navigate to the URL shown in the terminal (typically `http://localhost:5173`)

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Project Structure

```
ochoXocho/
├── src/
│   ├── main.ts          # Application entry point
│   ├── game.ts          # Main game loop and state management
│   ├── board.ts         # 8x8 grid board logic
│   ├── shapes.ts        # Shape definitions and generator
│   ├── renderer.ts      # Canvas rendering system
│   ├── input.ts         # Mouse drag-and-drop input handling
│   ├── validator.ts     # Placement validation logic
│   ├── scoring.ts       # Scoring system with bonuses
│   ├── gameOver.ts      # Game over detection
│   └── types.ts         # Shared TypeScript types
├── styles/
│   └── main.css         # Basic styling
└── index.html           # HTML entry point
```

## How to Play

1. **Receive Shapes**: You start with 3 random shapes displayed beneath the board
2. **Drag to Place**: Click and drag a shape from the queue onto the game board
3. **Valid Placement**: Shapes can only be placed where all blocks fit in empty cells
4. **Clear Lines**: When a row or column is completely filled, it clears automatically
5. **Score Points**: Earn 100 points per cleared line with progressive multipliers when you clear several lines at once
6. **New Shapes**: After placing 3 shapes, you receive 3 new ones
7. **Game Over**: The game ends when no available shapes can be placed
8. **Adjust Settings**: Use the gear icon in the top-right corner to toggle the grid, ghost preview, clear animations, change the visual design, or mute sound effects at any time

## Settings

The floating gear button opens a lightweight settings panel that lets you:

- Hide or show the board grid lines
- Hide or show the ghost placement preview
- Toggle clear animations for a faster, distraction-free experience
- Switch between the **Classic**, **Midnight**, and **Sunset** visual designs
- Enable or disable sound effects

Changes apply instantly and persist until you refresh the page.

## Scoring System

- **Base Points**: Each cleared row or column starts at 100 points.
- **Simultaneous Clear Bonus**: When you clear multiple lines in the same move, the second line is worth 2× its base value, the third line 3×, etc.
- **Board Clear Multiplier**: If that clear empties the entire board, the total for that move is multiplied by 5.
- **Game Over Cleanup**: When no more moves are available, every remaining block disappears and awards 1 bonus point, so you’re rewarded for keeping the board tidy all game long.

## Mobile Porting Guide

This game is designed with mobile porting in mind. The codebase separates concerns to make migration straightforward:

### Architecture for Portability

1. **Game Logic** (`game.ts`, `board.ts`, `shapes.ts`, `validator.ts`, `scoring.ts`, `gameOver.ts`):
   - Pure TypeScript with no DOM dependencies
   - Framework-agnostic
   - Can be used as-is in any JavaScript/TypeScript environment

2. **Rendering** (`renderer.ts`):
   - Uses standard HTML Canvas API
   - Canvas is available in all major mobile frameworks (React Native, Flutter, etc.)
   - Only needs canvas context, no other dependencies

3. **Input Handling** (`input.ts`):
   - Currently uses mouse events
   - This is the main module that needs adaptation for mobile

### Porting Steps

#### For React Native

1. **Replace Canvas**: Use `react-native-canvas` or `react-native-svg` for rendering
2. **Update Input Handler**: Replace mouse events with `PanResponder` or `GestureHandler`
3. **Coordinate Conversion**: Adjust touch coordinate handling (React Native uses different coordinate system)
4. **Keep Game Logic**: All game logic files remain unchanged

Example input handler modification:
```typescript
// Replace mouse events with PanResponder
import { PanResponder } from 'react-native';

const panResponder = PanResponder.create({
  onStartShouldSetPanResponder: () => true,
  onMoveShouldSetPanResponder: () => true,
  onPanResponderGrant: (evt) => {
    // Handle touch start (equivalent to mousedown)
  },
  onPanResponderMove: (evt) => {
    // Handle touch move (equivalent to mousemove)
  },
  onPanResponderRelease: (evt) => {
    // Handle touch end (equivalent to mouseup)
  },
});
```

#### For Flutter

1. **Replace Canvas**: Use Flutter's `CustomPaint` widget with `Canvas` API
2. **Update Input Handler**: Use `GestureDetector` with `onPanStart`, `onPanUpdate`, `onPanEnd`
3. **Coordinate Conversion**: Flutter uses a different coordinate system, adjust accordingly
4. **Keep Game Logic**: Port TypeScript to Dart (or use a bridge), but logic structure remains the same

#### For Web Mobile (PWA)

1. **Touch Events**: Update `input.ts` to handle `touchstart`, `touchmove`, `touchend` events
2. **Viewport Meta**: Ensure proper viewport settings in `index.html`
3. **Responsive Canvas**: Adjust canvas size based on screen dimensions
4. **CSS Updates**: Use media queries for mobile layouts (already included in `main.css`)

Example touch event modification:
```typescript
// Add touch event listeners alongside mouse events
canvas.addEventListener('touchstart', (event) => {
  event.preventDefault();
  const touch = event.touches[0];
  // Convert touch coordinates to canvas coordinates
  // Use same logic as mouse events
});
```

### Key Porting Points

1. **Input System** (`src/input.ts`):
   - Replace `mousedown` → `touchstart` or platform-specific gesture handler
   - Replace `mousemove` → `touchmove` or drag handler
   - Replace `mouseup` → `touchend` or release handler
   - Handle touch coordinate conversion (account for viewport, scaling, etc.)

2. **Rendering** (`src/renderer.ts`):
   - Canvas API is universal, but context acquisition differs
   - React Native: Use `react-native-canvas` or similar
   - Flutter: Use `CustomPaint` with `Canvas`
   - Web Mobile: Standard canvas works, just ensure proper sizing

3. **Entry Point** (`src/main.ts`):
   - Adapt to framework's lifecycle (React `useEffect`, Flutter `initState`, etc.)
   - Replace DOM queries with framework-specific element access

4. **Styling** (`styles/main.css`):
   - Convert to framework's styling system (StyleSheet for React Native, etc.)
   - Maintain responsive design principles

### Testing Mobile Port

1. Test touch responsiveness and drag smoothness
2. Verify coordinate conversion accuracy
3. Test on different screen sizes and orientations
4. Ensure proper scaling of canvas and UI elements
5. Test game logic remains consistent across platforms

## Development

### Code Organization

The codebase is organized into clean, modular components:

- **Types**: Shared interfaces in `types.ts`
- **Game Logic**: Pure functions and classes with no side effects
- **Rendering**: Isolated canvas drawing operations
- **Input**: Event handling separated from game logic
- **State Management**: Centralized in `Game` class

### Adding Features

To add new features:

1. **New Shapes**: Add to `ALL_SHAPES` array in `shapes.ts`
2. **New Scoring Rules**: Modify `calculateScore()` in `scoring.ts`
3. **New Visual Effects**: Extend `Renderer` class in `renderer.ts`
4. **New Input Methods**: Extend `InputHandler` class in `input.ts`

## License

This project is open source and available for use.

## Credits

Built with TypeScript, Vite, and HTML5 Canvas. Designed for easy porting to mobile platforms.

