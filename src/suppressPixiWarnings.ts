/**
 * Suppress PixiJS WebGPU/CanvasRenderer warnings
 * 
 * This module MUST be imported BEFORE pixi.js to intercept console.warn
 * before PixiJS captures a reference to it.
 * 
 * These warnings are informational - WebGL works fine as a fallback:
 * - "WebGPU is experimental on this platform..."
 * - "Failed to create WebGPU Context Provider"
 */

const originalWarn = console.warn;

console.warn = function(...args: unknown[]) {
    const message = String(args[0] || '');
    
    // Suppress PixiJS WebGPU warnings
    if (message.includes('WebGPU is experimental') ||
        message.includes('Failed to create WebGPU Context Provider')) {
        return; // Suppress
    }
    
    // Pass through all other warnings
    originalWarn.apply(console, args);
};

// Also handle console.error for CanvasRenderer messages
const originalError = console.error;

console.error = function(...args: unknown[]) {
    const message = String(args[0] || '');
    
    // Suppress PixiJS CanvasRenderer errors (auto-detection fallback)
    if (message.includes('CanvasRenderer is not yet implemented')) {
        return; // Suppress
    }
    
    // Pass through all other errors
    originalError.apply(console, args);
};

export {}; // Make this a module
