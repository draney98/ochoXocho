/**
 * Version information
 * Version is read from package.json at build time, build number auto-increments based on git commit count
 */

// Package version is injected at build time via Vite define from package.json
// In dev mode, it will be undefined, so we use a fallback
const PACKAGE_VERSION = import.meta.env.VITE_PACKAGE_VERSION || '1.1.2';

// Build number is injected at build time via Vite define
// In dev mode, it will be undefined, so we use a placeholder
const BUILD_NUMBER = import.meta.env.VITE_BUILD_NUMBER || 'dev';

// Full version string: PACKAGE_VERSION.BUILD
// Example: "1.1.2.123" or "1.1.2.dev" in dev mode
// This ensures the version always matches package.json
export const VERSION = `${PACKAGE_VERSION}.${BUILD_NUMBER}`;

// Export base version (without build number) for backwards compatibility if needed
export const BASE_VERSION = PACKAGE_VERSION;
