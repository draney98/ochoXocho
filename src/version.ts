/**
 * Version information
 * Base version is manually set, build number auto-increments based on git commit count
 */

// Base version (manually updated)
export const BASE_VERSION = '0.5';

// Build number is injected at build time via Vite define
// In dev mode, it will be undefined, so we use a placeholder
export const BUILD_NUMBER = import.meta.env.VITE_BUILD_NUMBER || 'dev';

// Full version string
export const VERSION = `${BASE_VERSION}.${BUILD_NUMBER}`;
