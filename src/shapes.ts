/**
 * Shape definitions and generator for tetromino pieces (4 blocks each)
 */

import { Shape } from './types';

/**
 * Domino shape (2 blocks)
 */
const DOMINO: Shape[] = [
    // Horizontal domino
    [{ x: 0, y: 0 }, { x: 1, y: 0 }],
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
 * Combined pool of all available shapes (domino + tetrominoes)
 */
const ALL_SHAPES: Shape[] = [...DOMINO, ...TETROMINOES];

/**
 * Tetromino letters in order: I, O, T, S, Z, J, L
 */
const TETROMINO_LETTERS: string[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

/**
 * Generates a random monochromatic color scheme
 * Creates colors using variations of a single hue with different saturations and lightness
 * @returns Array of hex color strings
 */
function generateComplementaryColorScheme(): string[] {
    // Start with a random base hue (0-360)
    const baseHue = Math.random() * 360;
    
    // Generate 7 colors (one for each tetromino)
    // All colors use the same hue (monochromatic)
    const colors: string[] = [];
    
    for (let i = 0; i < 7; i++) {
        // Use the same hue for all colors (monochromatic)
        const hue = baseHue;
        
        // Vary saturation and lightness for visual distinction
        // Saturation: 50-90% for vibrant colors
        const saturation = 50 + (i * 5) + Math.random() * 5;
        
        // Lightness: vary from 30% to 70% for good contrast
        // Distribute lightness values across the range
        const lightness = 30 + (i * 6) + Math.random() * 4;
        
        // Convert HSL to RGB then to hex
        const color = hslToHex(hue, saturation, lightness);
        colors.push(color);
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

/**
 * Color palette for shapes - generated once at module load
 * Uses a monochromatic color scheme (variations of a single hue)
 * Each shape gets a distinct color based on its index
 */
const SHAPE_COLORS: string[] = generateComplementaryColorScheme();

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
 * Generates a random shape from the pool with random rotation
 * @returns A random shape with random rotation applied
 */
function getRandomShape(): Shape {
    const index = Math.floor(Math.random() * ALL_SHAPES.length);
    const baseShape = ALL_SHAPES[index];
    
    // Apply random rotation (0, 90, 180, or 270 degrees)
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
 * Gets the letter for a tetromino shape
 * @param shape - The shape to get the letter for
 * @returns The letter (I, O, T, S, Z, J, L) for tetrominoes
 */
export function getShapeLetter(shape: Shape): string {
    const index = getShapeIndex(shape);
    // All shapes are tetrominoes (indices 0-6)
    if (index >= 0 && index < TETROMINOES.length) {
        return TETROMINO_LETTERS[index];
    }
    return '';
}

