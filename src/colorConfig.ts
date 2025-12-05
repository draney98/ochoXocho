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
    // Set 0: Level 1 - Blue tones
    {
        colors: [
            '#1e3a8a', '#1e40af', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe', '#eff6ff',
            '#1e40af', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe', '#eff6ff', '#1e3a8a',
            '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe', '#eff6ff', '#1e3a8a', '#1e40af',
        ],
    },
    // Set 1: Level 2 - Green tones
    {
        colors: [
            '#14532d', '#166534', '#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0', '#dcfce7',
            '#166534', '#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0', '#dcfce7', '#14532d',
            '#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0', '#dcfce7', '#14532d', '#166534',
        ],
    },
    // Set 2: Level 3 - Purple tones
    {
        colors: [
            '#581c87', '#6b21a8', '#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe',
            '#6b21a8', '#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe', '#581c87',
            '#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe', '#581c87', '#6b21a8',
        ],
    },
    // Set 3: Level 4 - Red tones
    {
        colors: [
            '#7f1d1d', '#991b1b', '#dc2626', '#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fee2e2',
            '#991b1b', '#dc2626', '#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fee2e2', '#7f1d1d',
            '#dc2626', '#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fee2e2', '#7f1d1d', '#991b1b',
        ],
    },
    // Set 4: Level 5 - Orange tones
    {
        colors: [
            '#7c2d12', '#9a3412', '#ea580c', '#f97316', '#fb923c', '#fdba74', '#fed7aa', '#ffedd5',
            '#9a3412', '#ea580c', '#f97316', '#fb923c', '#fdba74', '#fed7aa', '#ffedd5', '#7c2d12',
            '#ea580c', '#f97316', '#fb923c', '#fdba74', '#fed7aa', '#ffedd5', '#7c2d12', '#9a3412',
        ],
    },
    // Set 5: Level 6 - Yellow tones
    {
        colors: [
            '#713f12', '#854d0e', '#ca8a04', '#eab308', '#facc15', '#fde047', '#fef08a', '#fef9c3',
            '#854d0e', '#ca8a04', '#eab308', '#facc15', '#fde047', '#fef08a', '#fef9c3', '#713f12',
            '#ca8a04', '#eab308', '#facc15', '#fde047', '#fef08a', '#fef9c3', '#713f12', '#854d0e',
        ],
    },
    // Set 6: Level 7 - Cyan tones
    {
        colors: [
            '#164e63', '#155e75', '#0891b2', '#06b6d4', '#22d3ee', '#67e8f9', '#a7f3f0', '#ccfbf1',
            '#155e75', '#0891b2', '#06b6d4', '#22d3ee', '#67e8f9', '#a7f3f0', '#ccfbf1', '#164e63',
            '#0891b2', '#06b6d4', '#22d3ee', '#67e8f9', '#a7f3f0', '#ccfbf1', '#164e63', '#155e75',
        ],
    },
    // Set 7: Level 8 - Pink tones
    {
        colors: [
            '#831843', '#9f1239', '#db2777', '#ec4899', '#f472b6', '#f9a8d4', '#fbcfe8', '#fce7f3',
            '#9f1239', '#db2777', '#ec4899', '#f472b6', '#f9a8d4', '#fbcfe8', '#fce7f3', '#831843',
            '#db2777', '#ec4899', '#f472b6', '#f9a8d4', '#fbcfe8', '#fce7f3', '#831843', '#9f1239',
        ],
    },
    // Set 8: Level 9 - Teal tones
    {
        colors: [
            '#134e4a', '#0f766e', '#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4', '#ccfbf1', '#f0fdfa',
            '#0f766e', '#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4', '#ccfbf1', '#f0fdfa', '#134e4a',
            '#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4', '#ccfbf1', '#f0fdfa', '#134e4a', '#0f766e',
        ],
    },
    // Set 9: Level 10+ - Indigo tones (final set, used for level 10+)
    {
        colors: [
            '#312e81', '#3730a3', '#4338ca', '#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe',
            '#3730a3', '#4338ca', '#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#312e81',
            '#4338ca', '#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#312e81', '#3730a3',
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

