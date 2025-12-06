/**
 * Shape definitions and generator for tetromino pieces (4 blocks each)
 */

import { Shape } from './types';
import { Board } from './board';
import { getValidPositions } from './validator';
import { getColorSet, getColorSetIndex } from './colorConfig';
import { EASY_MODE_CONFIG, GAMEPLAY_CONFIG } from './config';

/**
 * Monomino shape (1 block)
 */
const MONOMINO: Shape[] = [
    // Single block (X)
    [{ x: 0, y: 0 }],
];

/**
 * Domino shape (2 blocks)
 */
const DOMINO: Shape[] = [
    // Horizontal domino
    [{ x: 0, y: 0 }, { x: 1, y: 0 }],
];

/**
 * Tromino shapes (3 blocks)
 */
const TROMINOES: Shape[] = [
    // Three block horizontal line (XXX)
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
    // L-shape (XX/X)
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }],
];

/**
 * Nonomino shapes (9 blocks)
 */
const NONOMINOES: Shape[] = [
    // Three block box (3x3 square)
    [
        { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
        { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 },
        { x: 0, y: 2 }, { x: 1, y: 2 }, { x: 2, y: 2 },
    ],
];

/**
 * Tetromino shapes (4 blocks each)
 * Standard Tetris pieces: I, O, T, S, Z, J, L
 */
const TETROMINOES: Shape[] = [
    // I-piece (line)
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
    
    // O-piece (square)
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
    
    // T-piece
    [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    
    // S-piece
    [{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }],
    
    // Z-piece
    [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    
    // J-piece
    [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
    
    // L-piece
    [{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }],
];

/**
 * Combined pool of all available shapes (monomino + domino + trominoes + tetrominoes + nonominoes)
 * Note: Monomino (index 0) always scores 0 points
 */
const ALL_SHAPES: Shape[] = [...MONOMINO, ...DOMINO, ...TROMINOES, ...TETROMINOES, ...NONOMINOES];

/**
 * Pool of shapes excluding the monomino (single dot piece)
 * Used for normal random generation - monomino only appears in easy mode fallback
 */
const SHAPES_WITHOUT_MONOMINO: Shape[] = [...DOMINO, ...TROMINOES, ...TETROMINOES, ...NONOMINOES];

/**
 * Point values for each shape (0 for single block, 1-8 for others, randomly assigned at module load)
 * Maps shape index to point value per cell
 * Note: Index 0 (single block) always scores 0 points
 */
const SHAPE_POINT_VALUES: number[] = (() => {
    // Single block (index 0) always scores 0, others get 1-8
    const values = Array.from({ length: ALL_SHAPES.length }, (_, i) => i === 0 ? 0 : i);
    // Shuffle the array to randomize point assignments (but keep index 0 as 0)
    for (let i = values.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [values[i], values[j]] = [values[j], values[i]];
    }
    // Ensure index 0 is always 0 (single block)
    const zeroIndex = values.indexOf(0);
    if (zeroIndex !== 0) {
        [values[0], values[zeroIndex]] = [values[zeroIndex], values[0]];
    }
    return values;
})();

/**
 * Keeps all colors within a narrow hue band (same general color family) while
 * varying saturation/lightness to maintain distinguishability.
 */
function generateMonochromaticColorScheme(): string[] {
    const colors: string[] = [];
    const baseHue = Math.random() * 360;
    const hueJitterRange = 8; // degrees
    const shapeCount = ALL_SHAPES.length;

    for (let i = 0; i < shapeCount; i++) {
        const progress = shapeCount > 1 ? i / (shapeCount - 1) : 0;
        const hue =
            (baseHue +
                (Math.random() * hueJitterRange - hueJitterRange / 2) +
                360) %
            360;
        const saturation = clamp(60 + progress * 25 + Math.random() * 5, 55, 95);
        const lightnessBase = 35 + progress * 30;
        const lightness = clamp(
            lightnessBase + (Math.random() * 6 - 3),
            30,
            70
        );
        colors.push(hslToHex(hue, saturation, lightness));
    }

    return colors;
}

/**
 * Converts HSL color to hex
 * @param h - Hue (0-360)
 * @param s - Saturation (0-100)
 * @param l - Lightness (0-100)
 * @returns Hex color string
 */
function hslToHex(h: number, s: number, l: number): string {
    s /= 100;
    l /= 100;
    
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    
    if (0 <= h && h < 60) {
        r = c; g = x; b = 0;
    } else if (60 <= h && h < 120) {
        r = x; g = c; b = 0;
    } else if (120 <= h && h < 180) {
        r = 0; g = c; b = x;
    } else if (180 <= h && h < 240) {
        r = 0; g = x; b = c;
    } else if (240 <= h && h < 300) {
        r = x; g = 0; b = c;
    } else if (300 <= h && h < 360) {
        r = c; g = 0; b = x;
    }
    
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);
    
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

/**
 * Color palette for shapes - uses predefined color sets based on level
 * Colors change every 10 levels, stopping at level 100
 */
let SHAPE_COLORS: string[] = [];

/**
 * Updates the color palette based on the current level
 * @param level - Current game level
 */
export function updateColorScheme(level: number): void {
    const colorSet = getColorSet(level);
    const setIndex = getColorSetIndex(level);
    console.log(`[COLOR] Updating color scheme for level ${level}, using set ${setIndex}, colors:`, colorSet.colors.slice(0, 3));
    SHAPE_COLORS = colorSet.colors;
}

/**
 * Rotates a shape by 90, 180, or 270 degrees clockwise
 * Rotates around the center of the shape's bounding box
 * @param shape - The shape to rotate
 * @param rotations - Number of 90-degree clockwise rotations (0-3)
 * @returns A new rotated shape
 */
function rotateShape(shape: Shape, rotations: number): Shape {
    if (rotations === 0 || shape.length === 0) {
        return shape.map(cell => ({ ...cell }));
    }
    
    // Find the center of the shape's bounding box
    const minX = Math.min(...shape.map(cell => cell.x));
    const maxX = Math.max(...shape.map(cell => cell.x));
    const minY = Math.min(...shape.map(cell => cell.y));
    const maxY = Math.max(...shape.map(cell => cell.y));
    
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    
    // Rotate each cell around the center
    const rotated = shape.map(cell => {
        // Translate to center
        let x = cell.x - centerX;
        let y = cell.y - centerY;
        
        // Apply rotation (90 degrees clockwise each time)
        for (let i = 0; i < rotations; i++) {
            const newX = y;
            const newY = -x;
            x = newX;
            y = newY;
        }
        
        // Translate back and round to nearest integer
        return {
            x: Math.round(x + centerX),
            y: Math.round(y + centerY)
        };
    });
    
    // Normalize the rotated shape so it starts at (0, 0)
    // This ensures shapes with negative coordinates after rotation can be placed at (0, 0)
    const normalizedMinX = Math.min(...rotated.map(cell => cell.x));
    const normalizedMinY = Math.min(...rotated.map(cell => cell.y));
    
    return rotated.map(cell => ({
        x: cell.x - normalizedMinX,
        y: cell.y - normalizedMinY
    }));
}

/**
 * Gets the size (number of blocks) of a shape
 * @param shape - The shape to measure
 * @returns Number of blocks in the shape
 */
function getShapeSize(shape: Shape): number {
    return shape.length;
}

/**
 * Generates a random shape from the pool with random rotation
 * Excludes monomino (single dot piece) - it only appears in easy mode fallback
 * @param weightedForEasy - If true, smaller shapes are more likely to appear
 * @returns A random shape with random rotation applied
 */
function getRandomShape(weightedForEasy: boolean = false): Shape {
    if (!weightedForEasy) {
        // Normal random selection
        const index = Math.floor(Math.random() * SHAPES_WITHOUT_MONOMINO.length);
        const baseShape = SHAPES_WITHOUT_MONOMINO[index];
    
    // Apply random rotation (0, 90, 180, or 270 degrees)
    const rotations = Math.floor(Math.random() * 4);
    
        return rotateShape(baseShape, rotations);
    }
    
    // Weighted selection for easy mode: smaller shapes are more likely
    // Weight inversely proportional to size (smaller = higher weight)
    const weights: Array<{ shape: Shape; weight: number }> = [];
    
    for (const shape of SHAPES_WITHOUT_MONOMINO) {
        const size = getShapeSize(shape);
        // Weight = 1/size, so smaller shapes get higher weights
        // For example: 2 blocks = 0.5, 3 blocks = 0.33, 4 blocks = 0.25, 9 blocks = 0.11
        const weight = 1 / size;
        weights.push({ shape, weight });
    }
    
    // Calculate total weight
    const totalWeight = weights.reduce((sum, w) => sum + w.weight, 0);
    
    // Select a random value between 0 and totalWeight
    let random = Math.random() * totalWeight;
    
    // Find which shape this random value corresponds to
    for (const { shape, weight } of weights) {
        random -= weight;
        if (random <= 0) {
            // Apply random rotation (0, 90, 180, or 270 degrees)
            const rotations = Math.floor(Math.random() * 4);
            return rotateShape(shape, rotations);
        }
    }
    
    // Fallback (shouldn't happen)
    const index = Math.floor(Math.random() * SHAPES_WITHOUT_MONOMINO.length);
    const baseShape = SHAPES_WITHOUT_MONOMINO[index];
    const rotations = Math.floor(Math.random() * 4);
    return rotateShape(baseShape, rotations);
}

/**
 * Generates three random shapes for the player's queue
 * Each shape is randomly rotated
 * @returns An array of 3 shapes
 */
export function generateShapes(): Shape[] {
    return [getRandomShape(), getRandomShape(), getRandomShape()];
}

/**
 * Generates shapes for easy mode - tries to find shapes that fit on the board
 * @param board - The game board to check against
 * @returns An array of 3 shapes, with at least 2 that can be placed if possible
 */
export function generateEasyShapes(board: Board): Shape[] {
    // Try up to configured number of times to find a good combination
    for (let attempt = 0; attempt < EASY_MODE_CONFIG.maxOptimisticAttempts; attempt++) {
        const shapes = [getRandomShape(true), getRandomShape(true), getRandomShape(true)];
        
        // Check if all three fit
        let allFit = true;
        for (const shape of shapes) {
            const validPositions = getValidPositions(board, shape);
            if (validPositions.length === 0) {
                allFit = false;
                break;
            }
        }
        
        if (allFit) {
            return shapes;
        }
        
        // Check if at least two fit
        let fitCount = 0;
        for (const shape of shapes) {
            const validPositions = getValidPositions(board, shape);
            if (validPositions.length > 0) {
                fitCount++;
            }
        }
        
        if (fitCount >= 2) {
            return shapes;
        }
    }
    
    // Fallback: Try to find at least one shape that fits
    // Try up to configured number of times to find a shape that fits
    for (let attempt = 0; attempt < EASY_MODE_CONFIG.fallbackAttempts; attempt++) {
        const testShape = getRandomShape(true);
        const validPositions = getValidPositions(board, testShape);
        if (validPositions.length > 0) {
            // Found a shape that fits, return it with 2 random shapes (weighted for easy mode)
            return [testShape, getRandomShape(true), getRandomShape(true)];
        }
    }
    
    // Final fallback: If no shape can fit, use a single block (X) which scores 0 points
    // The single block is at index 0 in ALL_SHAPES (MONOMINO)
    const singleBlock: Shape = [{ x: 0, y: 0 }];
    return [singleBlock, getRandomShape(true), getRandomShape(true)];
}

/**
 * Gets a color for a shape based on its index in the shape pool
 * @param shapeIndex - Index of the shape in ALL_SHAPES array
 * @returns A hex color string
 */
export function getShapeColor(shapeIndex: number): string {
    return SHAPE_COLORS[shapeIndex % SHAPE_COLORS.length];
}

/**
 * Normalizes a shape by translating it to start at (0,0) or the minimum coordinates
 * This helps with shape comparison regardless of position
 * @param shape - The shape to normalize
 * @returns A normalized shape
 */
function normalizeShape(shape: Shape): Shape {
    if (shape.length === 0) return shape;
    
    const minX = Math.min(...shape.map(cell => cell.x));
    const minY = Math.min(...shape.map(cell => cell.y));
    
    return shape.map(cell => ({
        x: cell.x - minX,
        y: cell.y - minY
    }));
}

/**
 * Checks if two shapes are the same (ignoring position and rotation)
 * @param shape1 - First shape
 * @param shape2 - Second shape
 * @returns True if shapes match
 */
function shapesMatch(shape1: Shape, shape2: Shape): boolean {
    if (shape1.length !== shape2.length) return false;
    
    const normalized1 = normalizeShape(shape1);
    const normalized2 = normalizeShape(shape2);
    
    // Check if all cells match
    return normalized1.every(cell1 => 
        normalized2.some(cell2 => cell1.x === cell2.x && cell1.y === cell2.y)
    ) && normalized2.every(cell2 =>
        normalized1.some(cell1 => cell1.x === cell2.x && cell1.y === cell2.y)
    );
}

/**
 * Gets the index of a shape in the ALL_SHAPES array
 * Tries all rotations to find a match, since shapes may be rotated
 * @param shape - The shape to find (may be rotated)
 * @returns The index of the base shape, or -1 if not found
 */
export function getShapeIndex(shape: Shape): number {
    // Try to find exact match first
    for (let i = 0; i < ALL_SHAPES.length; i++) {
        const baseShape = ALL_SHAPES[i];
        
        // Try all 4 rotations (0, 90, 180, 270 degrees)
        for (let rot = 0; rot < 4; rot++) {
            const rotated = rotateShape(baseShape, rot);
            if (shapesMatch(shape, rotated)) {
                return i;
            }
        }
    }
    
    return -1;
}

/**
 * Gets the point value per cell for a shape based on its index and level
 * @param shapeIndex - Index of the shape in ALL_SHAPES array
 * @param level - Current game level (adds 10 points per level, every 10 levels)
 * @returns Point value per cell
 */
export function getShapePointValue(shapeIndex: number, level: number = 0): number {
    // Single block (index 0) always scores 0 points
    if (shapeIndex === 0) {
        return 0;
    }
    if (shapeIndex < 0 || shapeIndex >= SHAPE_POINT_VALUES.length) {
        return 1; // Default to 1 if shape not found
    }
    const baseValue = SHAPE_POINT_VALUES[shapeIndex];
    // Level is already Math.floor(totalShapesPlaced / shapesPerValueTier), so multiply by pointsPerTier to get the bonus
    // Every tier of shapes placed = +pointsPerTier points
    const levelBonus = level * GAMEPLAY_CONFIG.pointsPerTier;
    return baseValue + levelBonus;
}

