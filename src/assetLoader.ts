/**
 * Asset loader for PixiJS textures and sprites
 * Manages loading of all game assets including blocks, effects, and UI elements
 */

import { Assets, Texture, Spritesheet } from 'pixi.js';

export interface GameAssets {
    // Block textures
    blockBase: Texture;
    blockExplosion: Texture;
    blockGhost: Texture;
    
    // Effect textures
    particle: Texture;
    flashLine: Texture;
    shockwave: Texture;
    
    // UI textures
    levelUp: Texture;
    gameOver: Texture;
    
    // Background textures
    gridTile: Texture;
}

/**
 * Asset paths configuration
 */
const ASSET_PATHS = {
    blocks: {
        base: '/sprites/blocks/block-base.svg',
        explosion: '/sprites/blocks/block-explosion.svg',
        ghost: '/sprites/blocks/block-ghost.svg',
    },
    effects: {
        particle: '/sprites/effects/particle.svg',
        flashLine: '/sprites/effects/flash-line.svg',
        shockwave: '/sprites/effects/shockwave.svg',
    },
    ui: {
        levelUp: '/sprites/ui/level-up.svg',
        gameOver: '/sprites/ui/game-over.svg',
    },
    background: {
        gridTile: '/sprites/background/grid-tile.svg',
    },
} as const;

/**
 * Asset loader class
 */
export class AssetLoader {
    private assets: GameAssets | null = null;
    private loadingPromise: Promise<GameAssets> | null = null;

    /**
     * Loads all game assets
     * @returns Promise that resolves when all assets are loaded
     */
    async load(): Promise<GameAssets> {
        if (this.assets) {
            return this.assets;
        }

        if (this.loadingPromise) {
            return this.loadingPromise;
        }

        this.loadingPromise = this.loadAssets();
        this.assets = await this.loadingPromise;
        return this.assets;
    }

    /**
     * Internal method to load all assets
     */
    private async loadAssets(): Promise<GameAssets> {
        // Collect all asset paths
        const assetPaths: string[] = [];
        Object.values(ASSET_PATHS).forEach(category => {
            Object.values(category).forEach(path => {
                assetPaths.push(path);
            });
        });

        // Load all assets
        const loadedAssets = await Assets.load(assetPaths);

        // Build assets object
        const assets: GameAssets = {
            blockBase: loadedAssets[ASSET_PATHS.blocks.base],
            blockExplosion: loadedAssets[ASSET_PATHS.blocks.explosion],
            blockGhost: loadedAssets[ASSET_PATHS.blocks.ghost],
            particle: loadedAssets[ASSET_PATHS.effects.particle],
            flashLine: loadedAssets[ASSET_PATHS.effects.flashLine],
            shockwave: loadedAssets[ASSET_PATHS.effects.shockwave],
            levelUp: loadedAssets[ASSET_PATHS.ui.levelUp],
            gameOver: loadedAssets[ASSET_PATHS.ui.gameOver],
            gridTile: loadedAssets[ASSET_PATHS.background.gridTile],
        };

        // Set pixel-perfect scaling for all textures (nearest neighbor)
        Object.values(assets).forEach(texture => {
            texture.source.scaleMode = 'nearest';
        });

        return assets;
    }

    /**
     * Gets loaded assets (throws if not loaded)
     */
    getAssets(): GameAssets {
        if (!this.assets) {
            throw new Error('Assets not loaded. Call load() first.');
        }
        return this.assets;
    }

    /**
     * Checks if assets are loaded
     */
    isLoaded(): boolean {
        return this.assets !== null;
    }
}

/**
 * Singleton instance
 */
export const assetLoader = new AssetLoader();
