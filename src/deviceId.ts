/**
 * Device ID generation and storage
 * Generates a unique device ID on first visit and stores it in localStorage
 */

const DEVICE_ID_KEY = 'ochoXocho_deviceId';

/**
 * Generates a UUID v4 string
 * @returns A UUID v4 string
 */
function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

/**
 * Gets or creates a unique device ID for this browser/device
 * The ID is stored in localStorage and persists across sessions
 * @returns The device ID string
 */
export function getDeviceId(): string {
    try {
        const stored = localStorage.getItem(DEVICE_ID_KEY);
        if (stored) {
            return stored;
        }
        
        // Generate new device ID
        const newId = generateUUID();
        localStorage.setItem(DEVICE_ID_KEY, newId);
        return newId;
    } catch (e) {
        // Fallback if localStorage is unavailable
        console.warn('Failed to access localStorage for device ID:', e);
        // Generate a temporary ID that won't persist
        return `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }
}

