/**
 * Color configuration for 10 level-based color schemes
 * Each color set contains colors for all shapes in the game
 */

export interface ColorSet {
    colors: string[];
}

/**
 * 10 predefined color sets, one for each level
 * Level 1 uses set 0, Level 2 uses set 1, ..., Level 10 uses set 9
 * Level 10+ continues using set 9
 */
export const COLOR_SETS: ColorSet[] = [
    // Set 0: Level 1 - Blue tones (medium brightness for visibility in both light and dark themes)
    {
        colors: [
            '#3b82f6', '#60a5fa', '#2563eb', '#93c5fd', '#3b82f6', '#60a5fa', '#2563eb', '#93c5fd',
            '#60a5fa', '#3b82f6', '#93c5fd', '#2563eb', '#60a5fa', '#3b82f6', '#93c5fd', '#2563eb',
            '#3b82f6', '#60a5fa', '#2563eb', '#93c5fd', '#3b82f6', '#60a5fa', '#2563eb', '#93c5fd',
        ],
    },
    // Set 1: Level 2 - Green tones (medium brightness for visibility in both light and dark themes)
    {
        colors: [
            '#22c55e', '#4ade80', '#16a34a', '#86efac', '#22c55e', '#4ade80', '#16a34a', '#86efac',
            '#4ade80', '#22c55e', '#86efac', '#16a34a', '#4ade80', '#22c55e', '#86efac', '#16a34a',
            '#22c55e', '#4ade80', '#16a34a', '#86efac', '#22c55e', '#4ade80', '#16a34a', '#86efac',
        ],
    },
    // Set 2: Level 3 - Purple tones (medium brightness for visibility in both light and dark themes)
    {
        colors: [
            '#8b5cf6', '#a78bfa', '#7c3aed', '#c4b5fd', '#8b5cf6', '#a78bfa', '#7c3aed', '#c4b5fd',
            '#a78bfa', '#8b5cf6', '#c4b5fd', '#7c3aed', '#a78bfa', '#8b5cf6', '#c4b5fd', '#7c3aed',
            '#8b5cf6', '#a78bfa', '#7c3aed', '#c4b5fd', '#8b5cf6', '#a78bfa', '#7c3aed', '#c4b5fd',
        ],
    },
    // Set 3: Level 4 - Red tones (medium brightness for visibility in both light and dark themes)
    {
        colors: [
            '#ef4444', '#f87171', '#dc2626', '#fca5a5', '#ef4444', '#f87171', '#dc2626', '#fca5a5',
            '#f87171', '#ef4444', '#fca5a5', '#dc2626', '#f87171', '#ef4444', '#fca5a5', '#dc2626',
            '#ef4444', '#f87171', '#dc2626', '#fca5a5', '#ef4444', '#f87171', '#dc2626', '#fca5a5',
        ],
    },
    // Set 4: Level 5 - Orange tones (medium brightness for visibility in both light and dark themes)
    {
        colors: [
            '#f97316', '#fb923c', '#ea580c', '#fdba74', '#f97316', '#fb923c', '#ea580c', '#fdba74',
            '#fb923c', '#f97316', '#fdba74', '#ea580c', '#fb923c', '#f97316', '#fdba74', '#ea580c',
            '#f97316', '#fb923c', '#ea580c', '#fdba74', '#f97316', '#fb923c', '#ea580c', '#fdba74',
        ],
    },
    // Set 5: Level 6 - Yellow tones (medium brightness for visibility in both light and dark themes)
    {
        colors: [
            '#eab308', '#facc15', '#ca8a04', '#fde047', '#eab308', '#facc15', '#ca8a04', '#fde047',
            '#facc15', '#eab308', '#fde047', '#ca8a04', '#facc15', '#eab308', '#fde047', '#ca8a04',
            '#eab308', '#facc15', '#ca8a04', '#fde047', '#eab308', '#facc15', '#ca8a04', '#fde047',
        ],
    },
    // Set 6: Level 7 - Cyan tones (medium brightness for visibility in both light and dark themes)
    {
        colors: [
            '#06b6d4', '#22d3ee', '#0891b2', '#67e8f9', '#06b6d4', '#22d3ee', '#0891b2', '#67e8f9',
            '#22d3ee', '#06b6d4', '#67e8f9', '#0891b2', '#22d3ee', '#06b6d4', '#67e8f9', '#0891b2',
            '#06b6d4', '#22d3ee', '#0891b2', '#67e8f9', '#06b6d4', '#22d3ee', '#0891b2', '#67e8f9',
        ],
    },
    // Set 7: Level 8 - Pink tones (medium brightness for visibility in both light and dark themes)
    {
        colors: [
            '#ec4899', '#f472b6', '#db2777', '#f9a8d4', '#ec4899', '#f472b6', '#db2777', '#f9a8d4',
            '#f472b6', '#ec4899', '#f9a8d4', '#db2777', '#f472b6', '#ec4899', '#f9a8d4', '#db2777',
            '#ec4899', '#f472b6', '#db2777', '#f9a8d4', '#ec4899', '#f472b6', '#db2777', '#f9a8d4',
        ],
    },
    // Set 8: Level 9 - Teal tones (medium brightness for visibility in both light and dark themes)
    {
        colors: [
            '#14b8a6', '#2dd4bf', '#0f766e', '#5eead4', '#14b8a6', '#2dd4bf', '#0f766e', '#5eead4',
            '#2dd4bf', '#14b8a6', '#5eead4', '#0f766e', '#2dd4bf', '#14b8a6', '#5eead4', '#0f766e',
            '#14b8a6', '#2dd4bf', '#0f766e', '#5eead4', '#14b8a6', '#2dd4bf', '#0f766e', '#5eead4',
        ],
    },
    // Set 9: Level 10+ - Indigo tones (medium brightness for visibility in both light and dark themes)
    {
        colors: [
            '#6366f1', '#818cf8', '#4f46e5', '#a5b4fc', '#6366f1', '#818cf8', '#4f46e5', '#a5b4fc',
            '#818cf8', '#6366f1', '#a5b4fc', '#4f46e5', '#818cf8', '#6366f1', '#a5b4fc', '#4f46e5',
            '#6366f1', '#818cf8', '#4f46e5', '#a5b4fc', '#6366f1', '#818cf8', '#4f46e5', '#a5b4fc',
        ],
    },
];

/**
 * Gets the color set index based on the current level
 * @param level - Current game level
 * @returns Color set index (0-9)
 */
export function getColorSetIndex(level: number): number {
    // Each level uses a different color set (1-10)
    // Level 10+ uses the last color set (index 9)
    const setIndex = Math.min(level - 1, 9);
    return setIndex;
}

/**
 * Gets the color set for a given level
 * @param level - Current game level
 * @returns Color set for that level
 */
export function getColorSet(level: number): ColorSet {
    const index = getColorSetIndex(level);
    return COLOR_SETS[index];
}

/**
 * Converts hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
        ? {
              r: parseInt(result[1], 16),
              g: parseInt(result[2], 16),
              b: parseInt(result[3], 16),
          }
        : null;
}

/**
 * Calculates the relative luminance of a color (for contrast checking)
 * Based on WCAG 2.0 formula
 */
function getLuminance(hex: string): number {
    const rgb = hexToRgb(hex);
    if (!rgb) return 0;

    const [r, g, b] = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map((val) => {
        return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Gets a contrasting color from the level's color set that works well with the theme
 * For light themes: picks the darkest/most saturated color
 * For dark themes: picks the lightest/most saturated color
 * @param level - Current game level
 * @param theme - Current theme name
 * @returns A hex color string that contrasts well with the theme background
 */
export function getUIColorForLevel(level: number, theme: 'classic' | 'midnight' | 'sunset'): string {
    const colorSet = getColorSet(level);
    const isDarkTheme = theme === 'midnight';

    if (isDarkTheme) {
        // For dark themes, pick the lightest/most saturated color
        // Find the color with the highest luminance
        let bestColor = colorSet.colors[0];
        let maxLuminance = getLuminance(bestColor);

        for (const color of colorSet.colors) {
            const luminance = getLuminance(color);
            if (luminance > maxLuminance) {
                maxLuminance = luminance;
                bestColor = color;
            }
        }
        return bestColor;
    } else {
        // For light themes, pick the darkest/most saturated color
        // Find the color with the lowest luminance
        let bestColor = colorSet.colors[0];
        let minLuminance = getLuminance(bestColor);

        for (const color of colorSet.colors) {
            const luminance = getLuminance(color);
            if (luminance < minLuminance) {
                minLuminance = luminance;
                bestColor = color;
            }
        }
        return bestColor;
    }
}

/**
 * Gets a darker version of a color for hover states
 */
function darkenColor(hex: string, amount: number = 0.2): string {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;

    return `#${[rgb.r, rgb.g, rgb.b]
        .map((val) => Math.max(0, Math.floor(val * (1 - amount))))
        .map((val) => val.toString(16).padStart(2, '0'))
        .join('')}`;
}

/**
 * Gets a lighter version of a color for hover states (for dark themes)
 */
function lightenColor(hex: string, amount: number = 0.2): string {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;

    return `#${[rgb.r, rgb.g, rgb.b]
        .map((val) => Math.min(255, Math.floor(val + (255 - val) * amount)))
        .map((val) => val.toString(16).padStart(2, '0'))
        .join('')}`;
}

/**
 * Gets hover and active colors for buttons based on the base color and theme
 */
export function getButtonColors(baseColor: string, theme: 'classic' | 'midnight' | 'sunset'): {
    base: string;
    hover: string;
    active: string;
    contrast: string;
} {
    const isDarkTheme = theme === 'midnight';
    const hover = isDarkTheme ? lightenColor(baseColor, 0.15) : darkenColor(baseColor, 0.15);
    const active = isDarkTheme ? lightenColor(baseColor, 0.25) : darkenColor(baseColor, 0.25);

    // Determine contrast color (white or black) based on luminance
    const luminance = getLuminance(baseColor);
    const contrast = luminance > 0.5 ? '#000000' : '#ffffff';

    return {
        base: baseColor,
        hover,
        active,
        contrast,
    };
}

