/**
 * Font configuration module for consistent text rendering across DOM and Canvas
 */

/**
 * System font stack matching CSS body font-family
 * Used for all text rendering to ensure visual consistency
 */
export const SYSTEM_FONT_STACK = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif";

/**
 * Waits for system fonts to be ready before rendering
 * Uses document.fonts.ready with a fallback timeout
 * @param timeoutMs - Maximum time to wait for fonts (default 2000ms)
 * @param devMode - Whether to log debug information
 * @returns Promise that resolves when fonts are ready or timeout expires
 */
export async function waitForFonts(timeoutMs: number = 2000, devMode: boolean = false): Promise<boolean> {
    try {
        // Create a timeout promise
        const timeout = new Promise<boolean>((resolve) => {
            setTimeout(() => {
                if (devMode) {
                    console.warn('[FONTS] Font loading timed out after', timeoutMs, 'ms');
                }
                resolve(false);
            }, timeoutMs);
        });

        // Wait for fonts to be ready
        const fontsReady = document.fonts.ready.then(() => {
            if (devMode) {
                console.log('[FONTS] System fonts ready');
            }
            return true;
        });

        // Race between fonts loading and timeout
        return await Promise.race([fontsReady, timeout]);
    } catch (e) {
        if (devMode) {
            console.warn('[FONTS] Font loading check failed:', e);
        }
        return false;
    }
}

/**
 * Checks if the required fonts are available
 * @param devMode - Whether to log debug information
 * @returns Whether fonts appear to be loaded
 */
export function checkFontsLoaded(devMode: boolean = false): boolean {
    try {
        // Check if document.fonts API is available
        if (!document.fonts || !document.fonts.check) {
            if (devMode) {
                console.warn('[FONTS] document.fonts API not available');
            }
            return true; // Assume fonts are available
        }

        // Check for system UI font (most platforms support this)
        const testFont = '16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const isLoaded = document.fonts.check(testFont);
        
        if (devMode) {
            console.log('[FONTS] Font check result:', isLoaded);
        }
        
        return isLoaded;
    } catch (e) {
        if (devMode) {
            console.warn('[FONTS] Font check failed:', e);
        }
        return true; // Assume fonts are available on error
    }
}

