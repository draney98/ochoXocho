/**
 * PixiJS rendering system for the block puzzle game
 * Replaces Canvas2D renderer with sprite-based pixel art rendering
 */

import { Application, Container, Sprite, Graphics, Text, Texture, Ticker, Color, WebGLRenderer } from 'pixi.js';
import { Position, Shape, PlacedBlock, DragState, AnimatingCell, AnimatingShape, GameSettings } from './types';
import { Board } from './board';
import { getShapeColor, getShapeIndex } from './shapes';
import { getColorSet } from './colorConfig';
import { assetLoader, GameAssets } from './assetLoader';
import {
    BOARD_PIXEL_SIZE,
    BOARD_CELL_COUNT,
    CELL_SIZE,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    QUEUE_AREA_HEIGHT,
    QUEUE_ITEM_HEIGHT,
    BOARD_OFFSET_X,
    BOARD_OFFSET_Y,
    BOARD_AREA_HEIGHT,
    DRAG_VISUAL_OFFSET_Y,
    getQueueItemRect,
} from './constants';
import { GAMEPLAY_CONFIG, ANIMATION_CONFIG, getPulseThreshold, getExplosionThreshold } from './config';
import { SYSTEM_FONT_STACK } from './fontConfig';

/**
 * Sprite pool for block sprites (reuse sprites for performance)
 */
class BlockSpritePool {
    private pool: Sprite[] = [];
    private active: Set<Sprite> = new Set();
    private baseTexture: Texture;

    constructor(baseTexture: Texture) {
        this.baseTexture = baseTexture;
    }

    acquire(): Sprite {
        let sprite: Sprite;
        if (this.pool.length > 0) {
            sprite = this.pool.pop()!;
        } else {
            sprite = new Sprite(this.baseTexture);
            sprite.anchor.set(0.5, 0.5); // Center anchor for easier positioning
        }
        this.active.add(sprite);
        sprite.visible = true;
        sprite.alpha = 1.0;
        sprite.scale.set(1);
        sprite.rotation = 0;
        sprite.skew.set(0); // Reset skew to prevent angled appearance (from animations like Melt)
        sprite.anchor.set(0.5, 0.5); // Ensure anchor is centered (in case it was changed)
        sprite.tint = 0xffffff; // Reset tint to white (will be set by caller)
        return sprite;
    }

    release(sprite: Sprite): void {
        if (this.active.has(sprite)) {
            this.active.delete(sprite);
            sprite.visible = false;
            if (sprite.parent) {
                sprite.parent.removeChild(sprite);
            }
            this.pool.push(sprite);
        }
    }

    releaseAll(): void {
        for (const sprite of Array.from(this.active)) {
            this.release(sprite);
        }
    }
}

/**
 * PixiJS Renderer class - handles all rendering using PixiJS
 */
export class PixiRenderer {
    private app: Application;
    private assets: GameAssets | null = null;
    private settings: GameSettings;
    private initialized: boolean = false;
    private usedWebGLFallback: boolean = false; // true when we created WebGLRenderer after WebGPU failed (no ticker)
    
    // Layer containers
    private backgroundLayer: Container;
    private boardLayer: Container;
    private animationLayer: Container;
    private queueLayer: Container;
    private dragLayer: Container;
    private uiLayer: Container;
    
    // Sprite pools
    private blockSpritePool: BlockSpritePool | null = null;
    
    // State tracking
    private finalBoardState: PlacedBlock[] | null = null;
    private finalTotalShapesPlaced: number = 0;
    private finalScore: number = 0;
    private finalLinesCleared: number = 0;
    private finalLevel: number = 1;
    private finalMode: 'easy' | 'hard' = 'easy';
    private currentLevel: number = 1;
    private copyLinkBounds: { x: number; y: number; width: number; height: number } | null = null;
    
    // Active sprites (for cleanup)
    private activeBlockSprites: Map<string, Sprite> = new Map();
    private activeQueueSprites: Sprite[] = [];
    private activeAnimations: Map<string, Container> = new Map();
    private backgroundMask: Graphics | null = null;
    
    constructor(canvas: HTMLCanvasElement, settings: GameSettings) {
        this.settings = { ...settings };
        
        // Initialize PixiJS application
        this.app = new Application();
        
        // Initialize assets (will be loaded before first render)
        // Use try-catch to prevent crashes if assets aren't loaded yet
        try {
            this.assets = assetLoader.getAssets();
            // Create sprite pools only if assets are available
            if (this.assets) {
                this.blockSpritePool = new BlockSpritePool(this.assets.blockBase);
            }
        } catch (error) {
            // Assets not loaded yet - will be initialized in initialize() method
            console.warn('[PixiRenderer] Assets not loaded yet, will initialize later');
            this.assets = null;
        }
        
        // Create layer containers
        this.backgroundLayer = new Container();
        this.boardLayer = new Container();
        this.animationLayer = new Container();
        this.queueLayer = new Container();
        this.dragLayer = new Container();
        this.uiLayer = new Container();
        
        // Note: Layers will be added to stage after app.init() in initialize() method
        // Adding them before init can cause issues
    }

    /**
     * Initializes the PixiJS application
     * Must be called after assets are loaded
     */
    async initialize(canvas: HTMLCanvasElement): Promise<void> {
        const initOptions = {
            canvas,
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            backgroundColor: 0x000000, // Will be overridden by theme
            antialias: false, // Pixel art - no anti-aliasing
            resolution: window.devicePixelRatio || 1,
            autoDensity: true, // Automatically adjust for device pixel ratio
            preference: 'webgl' as const, // Prefer WebGL (WebGPU can fail on some drivers/systems)
        };

        try {
            await this.app.init(initOptions);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            // WebGPU can throw when context creation fails (e.g. unsupported or disabled);
            // fall back to creating a WebGL renderer directly so the game still runs
            if (errorMessage.includes('WebGPU') || errorMessage.includes('CanvasRenderer is not yet implemented')) {
                if (this.app.renderer && this.app.canvas) {
                    // App already has a working renderer despite the error
                } else if (errorMessage.includes('WebGPU')) {
                    try {
                        const webglRenderer = new WebGLRenderer();
                        await webglRenderer.init({
                            canvas: initOptions.canvas,
                            width: initOptions.width,
                            height: initOptions.height,
                            backgroundColor: initOptions.backgroundColor,
                            antialias: initOptions.antialias,
                            resolution: initOptions.resolution,
                            autoDensity: initOptions.autoDensity,
                        });
                        (this.app as { renderer: unknown }).renderer = webglRenderer;
                        this.usedWebGLFallback = true; // App ticker wasn't started; we must call app.render() in render()
                    } catch (webglError) {
                        console.error('[PixiRenderer] WebGL fallback also failed:', webglError);
                        throw error;
                    }
                } else {
                    throw error;
                }
            } else {
                throw error;
            }
        }
        
        // Add layers to stage AFTER app is initialized (required for proper rendering)
        this.app.stage.addChild(this.backgroundLayer);
        this.app.stage.addChild(this.boardLayer);
        this.app.stage.addChild(this.animationLayer);
        this.app.stage.addChild(this.queueLayer);
        this.app.stage.addChild(this.dragLayer);
        this.app.stage.addChild(this.uiLayer);
        
        // Set pixel-perfect scaling for all textures
        // Note: In PixiJS v8, texture default options are set differently
        // We'll set scaleMode on individual textures as they're loaded
        
        // Load assets and initialize sprite pools
        try {
            this.assets = assetLoader.getAssets();
            if (!this.blockSpritePool && this.assets) {
                this.blockSpritePool = new BlockSpritePool(this.assets.blockBase);
            }
        } catch (error) {
            console.error('[PixiRenderer] Failed to get assets during initialization:', error);
            throw error; // Re-throw to prevent silent failures
        }
        
        // Stop the Pixi ticker - we drive rendering manually from our game loop via app.render()
        // This prevents a race condition where:
        // 1. Our render() calls clear() removing all children
        // 2. Pixi ticker runs app.render() on empty stage
        // 3. Our render() adds children back
        // Result: flashing/blank canvas
        if (this.app.ticker) {
            this.app.ticker.stop();
        }
        
        this.initialized = true;
        console.log('[PixiRenderer] Initialized successfully');
    }

    /**
     * Updates settings
     */
    updateSettings(settings: GameSettings): void {
        this.settings = { ...settings };
    }

    /**
     * Checks if the renderer is initialized
     */
    isInitialized(): boolean {
        return this.initialized && this.assets !== null && this.app.canvas !== null;
    }

    /**
     * Clears all layers
     */
    private clear(): void {
        // Clear all layers by removing children
        this.backgroundLayer.removeChildren();
        this.boardLayer.removeChildren();
        this.animationLayer.removeChildren();
        this.queueLayer.removeChildren();
        this.dragLayer.removeChildren();
        this.uiLayer.removeChildren();
        
        // Release all sprites back to pools
        if (this.blockSpritePool) {
            this.blockSpritePool.releaseAll();
        }
        this.activeBlockSprites.clear();
        this.activeQueueSprites = [];
        this.activeAnimations.clear();
        // Reset background mask (but keep mask object for reuse)
        this.backgroundLayer.mask = null;
    }

    /**
     * Draws the board background using tiled grid texture
     */
    private drawBoardBackground(): void {
        if (!this.assets) return;
        
        // Tile the grid texture across the board area
        // The board is centered: BOARD_OFFSET_X centers it horizontally (30px on each side)
        const tileSize = 64; // grid-tile.png is 64x64
        const tilesX = Math.ceil(BOARD_PIXEL_SIZE / tileSize);
        const tilesY = Math.ceil(BOARD_PIXEL_SIZE / tileSize);
        
        for (let ty = 0; ty < tilesY; ty++) {
            for (let tx = 0; tx < tilesX; tx++) {
                const tile = new Sprite(this.assets.gridTile);
                tile.x = Math.round(BOARD_OFFSET_X + tx * tileSize);
                tile.y = Math.round(BOARD_OFFSET_Y + ty * tileSize);
                tile.width = tileSize;
                tile.height = tileSize;
                tile.anchor.set(0, 0);
                this.backgroundLayer.addChild(tile);
            }
        }
        
        // Add mask to clip background to exactly board bounds (prevents 36px overflow)
        // This ensures the background doesn't extend beyond the 540x540px board area
        if (!this.backgroundMask) {
            this.backgroundMask = new Graphics();
            this.backgroundMask.rect(BOARD_OFFSET_X, BOARD_OFFSET_Y, BOARD_PIXEL_SIZE, BOARD_PIXEL_SIZE);
            this.backgroundMask.fill(0xffffff);
            // Make mask invisible (it's only used for clipping, not rendering)
            this.backgroundMask.visible = false;
            // Add mask to stage so it's in the display tree (required for masks to work)
            this.app.stage.addChild(this.backgroundMask);
        }
        this.backgroundLayer.mask = this.backgroundMask;
    }

    /**
     * Draws the grid lines
     */
    private drawGrid(): void {
        const gridGraphics = new Graphics();
        gridGraphics.setStrokeStyle({ width: 1, color: 0xcccccc, alpha: 1.0 });
        
        // Draw vertical lines
        for (let x = 0; x <= BOARD_CELL_COUNT; x++) {
            const px = Math.round(BOARD_OFFSET_X + x * CELL_SIZE);
            gridGraphics.moveTo(px, BOARD_OFFSET_Y);
            gridGraphics.lineTo(px, BOARD_OFFSET_Y + BOARD_PIXEL_SIZE);
        }
        
        // Draw horizontal lines
        for (let y = 0; y <= BOARD_CELL_COUNT; y++) {
            const py = Math.round(BOARD_OFFSET_Y + y * CELL_SIZE);
            gridGraphics.moveTo(BOARD_OFFSET_X, py);
            gridGraphics.lineTo(BOARD_OFFSET_X + BOARD_PIXEL_SIZE, py);
        }
        
        // Ensure the lines are stroked
        gridGraphics.stroke();
        // Draw grid on boardLayer so it's on top of background and visible
        this.boardLayer.addChild(gridGraphics);
    }

    /**
     * Converts hex color string to number
     */
    private hexToNumber(hex: string): number {
        return parseInt(hex.replace('#', ''), 16);
    }

    /**
     * Darkens a color by blending towards dark red instead of just darkening
     * @param color - Original hex color string
     * @param darkness - Darkness factor (1.0 = original color, 0.0 = dark red)
     */
    private darkenColor(color: string, darkness: number): string {
        // Dark red color to blend towards
        const darkRed = '#8B0000'; // Dark red
        
        // Clamp darkness between 0 and 1
        const factor = Math.max(0, Math.min(1, darkness));
        
        // Blend towards dark red as darkness decreases
        // When darkness = 1.0, use original color
        // When darkness = 0.0, use dark red
        // In between, blend proportionally
        const blendFactor = 1.0 - factor; // Inverse: 0 when darkness=1.0, 1 when darkness=0.0
        
        return this.blendColors(color, darkRed, blendFactor);
    }

    /**
     * Blends two colors
     */
    private blendColors(color1: string, color2: string, factor: number): string {
        const num1 = this.hexToNumber(color1);
        const num2 = this.hexToNumber(color2);
        const r1 = (num1 >> 16) & 0xff;
        const g1 = (num1 >> 8) & 0xff;
        const b1 = num1 & 0xff;
        const r2 = (num2 >> 16) & 0xff;
        const g2 = (num2 >> 8) & 0xff;
        const b2 = num2 & 0xff;
        const r = Math.floor(r1 * (1 - factor) + r2 * factor);
        const g = Math.floor(g1 * (1 - factor) + g2 * factor);
        const b = Math.floor(b1 * (1 - factor) + b2 * factor);
        return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
    }

    /**
     * Gets contrasting text color (black or white)
     */
    private getContrastTextColor(backgroundColor: string): string {
        const num = this.hexToNumber(backgroundColor);
        const r = (num >> 16) & 0xff;
        const g = (num >> 8) & 0xff;
        const b = num & 0xff;
        // Calculate relative luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance > 0.5 ? '#000000' : '#ffffff';
    }

    /**
     * Draws a block sprite at the specified position
     */
    private drawBlockSprite(x: number, y: number, color: string, size: number = CELL_SIZE - 4): Sprite {
        if (!this.blockSpritePool || !this.assets) {
            // Try to initialize if not already done
            if (!this.assets) {
                try {
                    this.assets = assetLoader.getAssets();
                } catch (e) {
                    throw new Error('Renderer not initialized. Assets not loaded.');
                }
            }
            if (!this.blockSpritePool && this.assets) {
                this.blockSpritePool = new BlockSpritePool(this.assets.blockBase);
            }
            if (!this.blockSpritePool || !this.assets) {
                throw new Error('Renderer not initialized. Call initialize() first.');
            }
        }
        const sprite = this.blockSpritePool.acquire();
        // Round positions for pixel-perfect rendering
        sprite.x = Math.round(x + size / 2);
        sprite.y = Math.round(y + size / 2);
        
        // Use scale instead of width/height to maintain aspect ratio and prevent stretching
        // block-base.png is 32x32 pixels, so we scale based on that
        const textureSize = 32; // block-base.png is 32x32
        const scale = size / textureSize;
        sprite.scale.set(scale);
        
        // Apply color tint (multiplies with base texture color)
        // Convert hex color string to number (e.g., "#ff0000" -> 0xff0000)
        const colorNum = this.hexToNumber(color);
        sprite.tint = colorNum;
        sprite.alpha = 1.0; // Ensure fully opaque
        sprite.visible = true; // Ensure visible
        
        return sprite;
    }

    /**
     * Draws an X mark on a block (for explosion-only blocks)
     */
    private drawX(x: number, y: number, size: number, color: string): Graphics {
        const graphics = new Graphics();
        const centerX = x + size / 2;
        const centerY = y + size / 2;
        const xSize = size * 0.5;
        const lineWidth = Math.max(2, Math.floor(size * 0.1));
        
        const textColor = this.getContrastTextColor(color);
        const colorNum = this.hexToNumber(textColor);
        
        // Use setStrokeStyle instead of deprecated lineStyle
        graphics.setStrokeStyle({ width: lineWidth, color: colorNum, alpha: 1.0 });
        graphics.moveTo(centerX - xSize / 2, centerY - xSize / 2);
        graphics.lineTo(centerX + xSize / 2, centerY + xSize / 2);
        graphics.moveTo(centerX + xSize / 2, centerY - xSize / 2);
        graphics.lineTo(centerX - xSize / 2, centerY + xSize / 2);
        graphics.stroke();
        
        return graphics;
    }

    /**
     * Draws all placed blocks on the board
     */
    drawBoard(
        board: Board,
        placedBlocks: PlacedBlock[],
        animatingCells: AnimatingCell[] = [],
        totalShapesPlaced: number = 0,
        hoverPosition: Position | null = null
    ): void {
        // Draw placed blocks
        for (const block of placedBlocks) {
            const cellsToDraw = block.shape.filter(cell => {
                const absoluteX = block.position.x + cell.x;
                const absoluteY = block.position.y + cell.y;
                // Skip animating cells
                if (animatingCells.some(ac => ac.x === absoluteX && ac.y === absoluteY)) {
                    return false;
                }
                // Skip cleared cells
                if (board.isCellEmpty({ x: absoluteX, y: absoluteY })) {
                    return false;
                }
                return true;
            });
            
            if (cellsToDraw.length > 0) {
                // Calculate point value
                const placementLevel = Math.floor(block.totalShapesPlacedAtPlacement / GAMEPLAY_CONFIG.shapesPerValueTier);
                const currentLevel = Math.floor(totalShapesPlaced / GAMEPLAY_CONFIG.shapesPerValueTier);
                const levelIncrements = currentLevel - placementLevel;
                const displayValue = block.pointValue + block.lineClearBonuses + (levelIncrements * GAMEPLAY_CONFIG.pointsPerTier);
                
                // Apply darkness
                let darkenedColor = this.darkenColor(block.color, block.darkness);
                
                // Check for explosion-only
                const isExplosionOnly = block.explosionOnly ?? false;
                const pulseThreshold = getPulseThreshold(this.settings.mode);
                const explosionThreshold = getExplosionThreshold(this.settings.mode);
                const shouldPulse = !isExplosionOnly && displayValue >= pulseThreshold;
                const willExplode = !isExplosionOnly && displayValue >= explosionThreshold;
                
                // Apply pulsing
                if (shouldPulse) {
                    const pulseCycleMs = this.settings.mode === 'hard'
                        ? ANIMATION_CONFIG.pulseCycleMs / 2
                        : ANIMATION_CONFIG.pulseCycleMs;
                    const pulseProgress = (Date.now() % pulseCycleMs) / pulseCycleMs;
                    const pulseBrightness = 0.7 + (Math.sin(pulseProgress * Math.PI * 2) * 0.15 + 0.15);
                    const pulsedDarkness = block.darkness + (1.0 - block.darkness) * (pulseBrightness - 0.7) / 0.3;
                    darkenedColor = this.darkenColor(block.color, pulsedDarkness);
                    
                    if (willExplode) {
                        const redIntensity = (pulseBrightness - 0.7) / 0.3;
                        darkenedColor = this.blendColors(darkenedColor, '#ff0000', redIntensity * 0.5);
                    }
                }
                
                // Draw each cell
                for (const cell of cellsToDraw) {
                    const absoluteX = block.position.x + cell.x;
                    const absoluteY = block.position.y + cell.y;
                    // Round for pixel-perfect positioning to ensure consistent spacing
                    const canvasX = Math.round(BOARD_OFFSET_X + absoluteX * CELL_SIZE);
                    const canvasY = Math.round(BOARD_OFFSET_Y + absoluteY * CELL_SIZE);
                    
                    if (isExplosionOnly) {
                        // Draw explosion-only block: gray block with X mark
                        const blockX = Math.round(canvasX + 2);
                        const blockY = Math.round(canvasY + 2);
                        const blockSize = Math.round(CELL_SIZE - 4);
                        
                        // Draw gray block sprite (explosion-only blocks are gray)
                        const sprite = this.drawBlockSprite(blockX, blockY, '#808080', blockSize);
                        this.boardLayer.addChild(sprite);
                        
                        // Add outline around block
                        const outline = new Graphics();
                        outline.setStrokeStyle({ width: 1, color: 0x000000, alpha: 0.5 });
                        outline.rect(blockX + 0.5, blockY + 0.5, blockSize - 1, blockSize - 1);
                        outline.stroke();
                        this.boardLayer.addChild(outline);
                        
                        // Draw X mark on top (use white for contrast on gray)
                        const xGraphics = this.drawX(blockX, blockY, blockSize, '#808080');
                        this.boardLayer.addChild(xGraphics);
                        
                        // Store sprite for cleanup
                        const key = `${absoluteX},${absoluteY}`;
                        this.activeBlockSprites.set(key, sprite);
                    } else {
                        // Round positions for pixel-perfect rendering
                        const blockX = Math.round(canvasX + 2);
                        const blockY = Math.round(canvasY + 2);
                        const blockSize = Math.round(CELL_SIZE - 4);
                        
                        // Draw block sprite
                        const sprite = this.drawBlockSprite(blockX, blockY, darkenedColor, blockSize);
                        this.boardLayer.addChild(sprite);
                        
                        // Add outline around block (draw stroke inside bounds for consistent thickness)
                        const outline = new Graphics();
                        outline.setStrokeStyle({ width: 1, color: 0x000000, alpha: 0.5 });
                        // Offset by 0.5px to draw stroke inside the bounds, preventing overlap with adjacent blocks
                        outline.rect(blockX + 0.5, blockY + 0.5, blockSize - 1, blockSize - 1);
                        outline.stroke();
                        this.boardLayer.addChild(outline);
                        
                        // Store sprite for cleanup
                        const key = `${absoluteX},${absoluteY}`;
                        this.activeBlockSprites.set(key, sprite);
                        
                        // Apply pulse scale if needed (maintain square aspect ratio)
                        if (shouldPulse) {
                            const pulseCycleMs = this.settings.mode === 'hard'
                                ? ANIMATION_CONFIG.pulseCycleMs / 2
                                : ANIMATION_CONFIG.pulseCycleMs;
                            const pulseProgress = (Date.now() % pulseCycleMs) / pulseCycleMs;
                            const pulseScale = 0.95 + Math.sin(pulseProgress * Math.PI * 2) * 0.05;
                            // Get the base scale from the sprite and multiply by pulse scale to maintain square
                            const baseScale = sprite.scale.x; // Should be same as scale.y
                            sprite.scale.x = baseScale * pulseScale;
                            sprite.scale.y = baseScale * pulseScale;
                        }
                        
                        // Draw point value if enabled
                        if (this.settings.showPointValues) {
                            const text = new Text({
                                text: displayValue.toString(),
                                style: {
                                    fontFamily: SYSTEM_FONT_STACK,
                                    fontSize: Math.floor(CELL_SIZE * 0.65),
                                    fill: this.getContrastTextColor(darkenedColor),
                                    fontWeight: 'bold',
                                },
                            });
                            text.anchor.set(0.5, 0.5);
                            text.x = canvasX + CELL_SIZE / 2;
                            text.y = canvasY + CELL_SIZE / 2;
                            this.boardLayer.addChild(text);
                        }
                    }
                }
            }
        }
        
        // Draw animating cells
        for (const cell of animatingCells) {
            this.drawAnimatingCell(cell);
        }
        
        // Draw hover point value
        if (!this.settings.showPointValues && hoverPosition !== null) {
            for (const block of placedBlocks) {
                for (const cell of block.shape) {
                    const absoluteX = block.position.x + cell.x;
                    const absoluteY = block.position.y + cell.y;
                    if (absoluteX === hoverPosition.x && absoluteY === hoverPosition.y) {
                        if (animatingCells.some(ac => ac.x === absoluteX && ac.y === absoluteY)) continue;
                        if (board.isCellEmpty({ x: absoluteX, y: absoluteY })) continue;
                        
                        const placementLevel = Math.floor(block.totalShapesPlacedAtPlacement / GAMEPLAY_CONFIG.shapesPerValueTier);
                        const currentLevel = Math.floor(totalShapesPlaced / GAMEPLAY_CONFIG.shapesPerValueTier);
                        const levelIncrements = currentLevel - placementLevel;
                        const displayValue = block.pointValue + block.lineClearBonuses + (levelIncrements * GAMEPLAY_CONFIG.pointsPerTier);
                        
                        const canvasX = BOARD_OFFSET_X + absoluteX * CELL_SIZE;
                        const canvasY = BOARD_OFFSET_Y + absoluteY * CELL_SIZE;
                        
                        let darkenedColor = this.darkenColor(block.color, block.darkness);
                        const isExplosionOnly = block.explosionOnly ?? false;
                        
                        if (isExplosionOnly) {
                            const xGraphics = this.drawX(canvasX + 2, canvasY + 2, CELL_SIZE - 4, darkenedColor);
                            this.boardLayer.addChild(xGraphics);
                        } else {
                            const text = new Text({
                                text: displayValue.toString(),
                                style: {
                                    fontFamily: SYSTEM_FONT_STACK,
                                    fontSize: Math.floor(CELL_SIZE * 0.65),
                                    fill: this.getContrastTextColor(darkenedColor),
                                    fontWeight: 'bold',
                                },
                            });
                            text.anchor.set(0.5, 0.5);
                            text.x = canvasX + CELL_SIZE / 2;
                            text.y = canvasY + CELL_SIZE / 2;
                            this.boardLayer.addChild(text);
                        }
                        return;
                    }
                }
            }
        }
    }

    /**
     * Draws an animating cell
     */
    drawAnimatingCell(cell: AnimatingCell): void {
        const x = BOARD_OFFSET_X + cell.x * CELL_SIZE;
        const y = BOARD_OFFSET_Y + cell.y * CELL_SIZE;
        const isExplosion = cell.type === 'explosion';
        
        if (isExplosion) {
            // Explosion animation
            const easedProgress = 1 - Math.pow(1 - cell.progress, 3);
            const alpha = 1 - easedProgress;
            const scale = 1 + cell.progress * 2;
            
            const centerX = x + CELL_SIZE / 2;
            const centerY = y + CELL_SIZE / 2;
            const size = (CELL_SIZE - 4) * scale;
            
            // Calculate top-left position for the sprite
            const spriteTopLeftX = centerX - size / 2;
            const spriteTopLeftY = centerY - size / 2;
            const sprite = this.drawBlockSprite(spriteTopLeftX, spriteTopLeftY, cell.color, size);
            sprite.alpha = alpha * 0.8;
            this.animationLayer.addChild(sprite);
            
            // Draw particles
            const particleCount = 8;
            for (let i = 0; i < particleCount; i++) {
                const angle = (i / particleCount) * Math.PI * 2;
                const distance = cell.progress * CELL_SIZE * 1.5;
                const particleX = centerX + Math.cos(angle) * distance;
                const particleY = centerY + Math.sin(angle) * distance;
                const particleSize = (CELL_SIZE - 4) * 0.3 * (1 - cell.progress);
                
                const particle = new Sprite(this.assets!.particle);
                particle.anchor.set(0.5, 0.5);
                particle.x = particleX;
                particle.y = particleY;
                // Use uniform scale to maintain square aspect ratio
                const particleScale = particleSize / 8; // particle texture is 8x8
                particle.scale.x = particleScale;
                particle.scale.y = particleScale;
                particle.tint = this.hexToNumber(cell.color);
                particle.alpha = alpha;
                this.animationLayer.addChild(particle);
            }
        } else {
            // Line clear animation - delegate to animation system
            this.drawClearAnimation(cell, x, y);
        }
    }

    /**
     * Draws one of 17 clear animations
     */
    private drawClearAnimation(cell: AnimatingCell, x: number, y: number): void {
        const animIndex = cell.animationIndex ?? 0;
        const centerX = x + CELL_SIZE / 2;
        const centerY = y + CELL_SIZE / 2;
        const baseSize = CELL_SIZE - 4;
        const progress = cell.progress;
        
        // Create animation container positioned at cell center
        const animContainer = new Container();
        animContainer.x = centerX;
        animContainer.y = centerY;
        
        // Sprite should be centered at (0,0) relative to container
        // drawBlockSprite centers the sprite, so we pass (-baseSize/2, -baseSize/2) to get it centered at (0,0)
        const sprite = this.drawBlockSprite(-baseSize / 2, -baseSize / 2, cell.color, baseSize);
        // Reset position to (0,0) relative to container (drawBlockSprite already positioned it, but we want it at container origin)
        sprite.x = 0;
        sprite.y = 0;
        animContainer.addChild(sprite);
        
        // Apply animation based on index
        switch (animIndex % 17) {
            case 0: // Fade + Scale Down
                sprite.alpha = 1 - progress;
                const fadeScale = 1 - progress * 0.5;
                sprite.scale.x = fadeScale;
                sprite.scale.y = fadeScale;
                break;
            case 1: // Spin + Fade
                sprite.alpha = 1 - progress;
                animContainer.rotation = progress * Math.PI * 2;
                break;
            case 2: // Shatter (4 pieces)
                sprite.visible = false;
                for (let i = 0; i < 4; i++) {
                    const piece = new Sprite(this.assets!.blockBase);
                    piece.anchor.set(0.5, 0.5);
                    // Use uniform scale to maintain square aspect ratio
                    const pieceSize = baseSize / 2;
                    const pieceScale = pieceSize / 32; // texture is 32x32
                    piece.scale.x = pieceScale;
                    piece.scale.y = pieceScale;
                    piece.tint = this.hexToNumber(cell.color);
                    const angle = (i / 4) * Math.PI * 2;
                    const distance = progress * CELL_SIZE;
                    piece.x = Math.cos(angle) * distance;
                    piece.y = Math.sin(angle) * distance;
                    piece.alpha = 1 - progress;
                    animContainer.addChild(piece);
                }
                break;
            case 3: // Ripple
                const rippleScale = 1 + Math.sin(progress * Math.PI * 4) * 0.2;
                sprite.scale.x = rippleScale;
                sprite.scale.y = rippleScale;
                sprite.alpha = 1 - progress;
                break;
            case 4: // Spiral Out
                const spiralAngle = progress * Math.PI * 4;
                const spiralDist = progress * CELL_SIZE;
                sprite.x = Math.cos(spiralAngle) * spiralDist; // Relative to container
                sprite.y = Math.sin(spiralAngle) * spiralDist; // Relative to container
                sprite.alpha = 1 - progress;
                break;
            case 5: // Pixelate (simplified - just scale)
                const pixelScale = 1 + (1 - progress) * 2;
                sprite.scale.set(pixelScale);
                sprite.alpha = 1 - progress;
                break;
            case 6: // Bounce
                const bounceScale = 1 + Math.sin(progress * Math.PI) * 0.3;
                sprite.scale.x = bounceScale;
                sprite.scale.y = bounceScale;
                sprite.alpha = 1 - progress;
                break;
            case 7: // Melt
                sprite.skew.x = progress * 0.5;
                sprite.y = centerY + progress * CELL_SIZE;
                sprite.alpha = 1 - progress;
                break;
            case 8: // Flash + Disappear
                const flashAlpha = progress < 0.3 ? 1 : (1 - (progress - 0.3) / 0.7);
                sprite.alpha = flashAlpha;
                break;
            case 9: // Vortex
                const vortexAngle = progress * Math.PI * 6;
                const vortexDist = progress * CELL_SIZE * 0.5;
                sprite.x = Math.cos(vortexAngle) * vortexDist; // Relative to container
                sprite.y = Math.sin(vortexAngle) * vortexDist; // Relative to container
                sprite.scale.set(1 - progress);
                sprite.alpha = 1 - progress;
                break;
            case 10: // Shockwave
                const shockwave = new Sprite(this.assets!.shockwave);
                shockwave.anchor.set(0.5, 0.5);
                // Use uniform scale to maintain square aspect ratio
                const shockwaveSize = baseSize * (1 + progress * 2);
                const shockwaveScale = shockwaveSize / 64; // shockwave texture is 64x64
                shockwave.scale.x = shockwaveScale;
                shockwave.scale.y = shockwaveScale;
                shockwave.alpha = 1 - progress;
                animContainer.addChild(shockwave);
                sprite.alpha = 1 - progress;
                break;
            case 11: // Crumble (particles)
                sprite.visible = false;
                const crumbleCount = 6;
                for (let i = 0; i < crumbleCount; i++) {
                    const particle = new Sprite(this.assets!.particle);
                    particle.anchor.set(0.5, 0.5);
                    // Use uniform scale to maintain square aspect ratio
                    const particleSize = baseSize / 3;
                    const particleScale = particleSize / 8; // particle texture is 8x8
                    particle.scale.x = particleScale;
                    particle.scale.y = particleScale;
                    particle.tint = this.hexToNumber(cell.color);
                    const angle = (i / crumbleCount) * Math.PI * 2;
                    const dist = progress * CELL_SIZE;
                    particle.x = Math.cos(angle) * dist;
                    particle.y = Math.sin(angle) * dist;
                    particle.alpha = 1 - progress;
                    animContainer.addChild(particle);
                }
                break;
            case 12: // Rainbow Flash
                const hue = (progress * 360) % 360;
                // Convert HSV to RGB (simplified)
                const c = 1;
                const x_hue = 1 - Math.abs(((hue / 60) % 2) - 1);
                let r = 0, g = 0, b = 0;
                if (hue < 60) { r = c; g = x_hue; }
                else if (hue < 120) { r = x_hue; g = c; }
                else if (hue < 180) { g = c; b = x_hue; }
                else if (hue < 240) { g = x_hue; b = c; }
                else if (hue < 300) { r = x_hue; b = c; }
                else { r = c; b = x_hue; }
                const rainbowColor = `#${Math.floor(r * 255).toString(16).padStart(2, '0')}${Math.floor(g * 255).toString(16).padStart(2, '0')}${Math.floor(b * 255).toString(16).padStart(2, '0')}`;
                sprite.tint = this.hexToNumber(rainbowColor);
                sprite.alpha = 1 - progress;
                break;
            case 13: // Glitch
                const glitchX = (Math.random() - 0.5) * progress * 10;
                const glitchY = (Math.random() - 0.5) * progress * 10;
                sprite.x = centerX + glitchX;
                sprite.y = centerY + glitchY;
                sprite.alpha = 1 - progress;
                break;
            case 14: // Dissolve
                sprite.alpha = 1 - progress;
                // Add particle effect
                for (let i = 0; i < 8; i++) {
                    const particle = new Sprite(this.assets!.particle);
                    particle.anchor.set(0.5, 0.5);
                    // Use uniform scale to maintain square aspect ratio
                    const dissolveParticleSize = baseSize / 4;
                    const dissolveParticleScale = dissolveParticleSize / 8; // particle texture is 8x8
                    particle.scale.x = dissolveParticleScale;
                    particle.scale.y = dissolveParticleScale;
                    particle.tint = this.hexToNumber(cell.color);
                    const angle = (i / 8) * Math.PI * 2;
                    const dist = progress * CELL_SIZE * 0.8;
                    particle.x = Math.cos(angle) * dist;
                    particle.y = Math.sin(angle) * dist;
                    particle.alpha = (1 - progress) * 0.5;
                    animContainer.addChild(particle);
                }
                break;
            case 15: // Pop
                const popScale = progress < 0.5 ? 1 + progress * 0.5 : 1.5 - (progress - 0.5) * 1.5;
                sprite.scale.x = popScale;
                sprite.scale.y = popScale;
                sprite.alpha = 1 - progress;
                break;
            case 16: // Sweep
                sprite.x = -(1 - progress) * CELL_SIZE; // Relative to container (sweeps from left)
                sprite.alpha = 1 - progress;
                break;
        }
        
        this.animationLayer.addChild(animContainer);
        const key = `${cell.x},${cell.y}`;
        this.activeAnimations.set(key, animContainer);
    }

    /**
     * Draws the queue of upcoming shapes
     */
    drawQueue(queue: (Shape | null)[]): void {
        // Clear previous queue sprites
        for (const sprite of this.activeQueueSprites) {
            this.queueLayer.removeChild(sprite);
            if (this.blockSpritePool) {
                this.blockSpritePool.release(sprite);
            }
        }
        this.activeQueueSprites = [];
        
        const QUEUE_SIZE = 3;
        
        // Calculate a single scale factor based on 4x4 blocks (largest possible piece) fitting in queue slot
        // This ensures all pieces are rendered at the same scale
        const rect = getQueueItemRect(0, QUEUE_SIZE); // Use first slot for scale calculation
        const padding = 8; // Padding around shape in queue slot
        const availableWidth = rect.width - padding * 2;
        const availableHeight = rect.height - padding * 2;
        const maxBlockSize = 4; // 4x4 is the largest possible piece
        const scaleX = availableWidth / (maxBlockSize * CELL_SIZE);
        const scaleY = availableHeight / (maxBlockSize * CELL_SIZE);
        const queueScale = Math.min(scaleX, scaleY, 1.0); // Don't scale up, only down
        
        // Calculate scaled cell size (same for all pieces)
        const scaledCellSize = CELL_SIZE * queueScale;
        
        for (let i = 0; i < QUEUE_SIZE; i++) {
            if (i < queue.length && queue[i]) {
                const shape = queue[i]!;
                const rect = getQueueItemRect(i, QUEUE_SIZE);
                const shapeIndex = getShapeIndex(shape);
                const color = getShapeColor(shapeIndex);
                
                // Calculate shape bounds in cells
                const minX = Math.min(...shape.map(b => b.x));
                const minY = Math.min(...shape.map(b => b.y));
                const maxX = Math.max(...shape.map(b => b.x));
                const maxY = Math.max(...shape.map(b => b.y));
                const shapeWidth = maxX - minX + 1;
                const shapeHeight = maxY - minY + 1;
                
                // Use the same scaled cell size for all pieces
                const scaledShapeWidth = shapeWidth * scaledCellSize;
                const scaledShapeHeight = shapeHeight * scaledCellSize;
                
                // Center shape in queue slot
                const centerX = rect.x + rect.width / 2;
                const centerY = rect.y + rect.height / 2;
                const startX = centerX - scaledShapeWidth / 2;
                const startY = centerY - scaledShapeHeight / 2;
                
                // Draw each cell of the shape
                for (const cell of shape) {
                    const cellX = Math.round(startX + (cell.x - minX) * scaledCellSize);
                    const cellY = Math.round(startY + (cell.y - minY) * scaledCellSize);
                    const sprite = this.drawBlockSprite(cellX, cellY, color, scaledCellSize - 4);
                    this.queueLayer.addChild(sprite);
                    this.activeQueueSprites.push(sprite);
                }
            }
        }
    }

    /**
     * Draws the drag preview
     */
    drawDragPreview(dragState: DragState, smoothedPosition?: { x: number; y: number }): void {
        // Clear previous drag preview
        this.dragLayer.removeChildren();
        
        if (!dragState.isDragging || !dragState.shape || !dragState.anchorPoint) {
            return;
        }
        
        const shapeIndex = getShapeIndex(dragState.shape);
        const color = getShapeColor(shapeIndex);
        
        // Use smoothed position if provided, otherwise calculate
        let visualCenter: { x: number; y: number };
        if (smoothedPosition) {
            visualCenter = smoothedPosition;
        } else {
            const basePosition = dragState.projectedBoardPosition || dragState.anchorPoint;
            visualCenter = {
                x: basePosition.x,
                y: basePosition.y + DRAG_VISUAL_OFFSET_Y
            };
        }
        
        // Calculate shape dimensions
        const minX = Math.min(...dragState.shape.map(b => b.x));
        const minY = Math.min(...dragState.shape.map(b => b.y));
        const maxX = Math.max(...dragState.shape.map(b => b.x));
        const maxY = Math.max(...dragState.shape.map(b => b.y));
        const shapeWidth = (maxX - minX + 1) * CELL_SIZE;
        const shapeHeight = (maxY - minY + 1) * CELL_SIZE;
        
        const startX = visualCenter.x - shapeWidth / 2;
        const startY = visualCenter.y - shapeHeight / 2;
        
        // Draw actual shape if position is valid
        if (dragState.hasBoardPosition && dragState.isValidPosition) {
            // Valid position - show blocks in white
            for (const cell of dragState.shape) {
                const cellX = startX + (cell.x - minX) * CELL_SIZE;
                const cellY = startY + (cell.y - minY) * CELL_SIZE;
                const sprite = this.drawBlockSprite(cellX, cellY, '#ffffff', CELL_SIZE - 4);
                sprite.alpha = 0.7;
                this.dragLayer.addChild(sprite);
            }
        } else {
            // Invalid position - show in red
            for (const cell of dragState.shape) {
                const cellX = startX + (cell.x - minX) * CELL_SIZE;
                const cellY = startY + (cell.y - minY) * CELL_SIZE;
                const sprite = this.drawBlockSprite(cellX, cellY, '#ff0000', CELL_SIZE - 4);
                sprite.alpha = 0.7;
                this.dragLayer.addChild(sprite);
            }
        }
    }

    /**
     * Draws preview line highlights
     */
    drawPreviewLineHighlights(
        previewLinesCleared: { rows: number[]; columns: number[] },
        placedBlocks: PlacedBlock[]
    ): void {
        if (previewLinesCleared.rows.length === 0 && previewLinesCleared.columns.length === 0) {
            return;
        }
        
        const pulseProgress = (Date.now() % 800) / 800;
        const pulseAlpha = 0.5 + Math.sin(pulseProgress * Math.PI * 2) * 0.2;
        
        // Create cell color map
        const cellColorMap = new Map<string, string>();
        for (const block of placedBlocks) {
            for (const cell of block.shape) {
                const absoluteX = block.position.x + cell.x;
                const absoluteY = block.position.y + cell.y;
                const key = `${absoluteX},${absoluteY}`;
                cellColorMap.set(key, block.color);
            }
        }
        
        // Draw highlights for rows
        for (const row of previewLinesCleared.rows) {
            for (let x = 0; x < BOARD_CELL_COUNT; x++) {
                const key = `${x},${row}`;
                const blockColor = cellColorMap.get(key);
                if (blockColor) {
                    const cellX = BOARD_OFFSET_X + x * CELL_SIZE;
                    const cellY = BOARD_OFFSET_Y + row * CELL_SIZE;
                    const highlight = new Graphics();
                    highlight.rect(cellX + 2, cellY + 2, CELL_SIZE - 4, CELL_SIZE - 4);
                    highlight.fill({ color: this.hexToNumber(blockColor), alpha: pulseAlpha * 0.5 });
                    highlight.stroke({ color: 0xffffff, width: 2, alpha: pulseAlpha });
                    this.boardLayer.addChild(highlight);
                }
            }
        }
        
        // Draw highlights for columns
        for (const col of previewLinesCleared.columns) {
            for (let y = 0; y < BOARD_CELL_COUNT; y++) {
                const key = `${col},${y}`;
                const blockColor = cellColorMap.get(key);
                if (blockColor) {
                    const cellX = BOARD_OFFSET_X + col * CELL_SIZE;
                    const cellY = BOARD_OFFSET_Y + y * CELL_SIZE;
                    const highlight = new Graphics();
                    highlight.rect(cellX + 2, cellY + 2, CELL_SIZE - 4, CELL_SIZE - 4);
                    highlight.fill({ color: this.hexToNumber(blockColor), alpha: pulseAlpha * 0.5 });
                    highlight.stroke({ color: 0xffffff, width: 2, alpha: pulseAlpha });
                    this.boardLayer.addChild(highlight);
                }
            }
        }
    }

    /**
     * Draws animating shape (snap animation)
     */
    drawAnimatingShape(animShape: AnimatingShape): void {
        const currentTime = Date.now();
        const elapsed = currentTime - animShape.startTime;
        const progress = Math.min(elapsed / animShape.duration, 1);
        
        const easeOut = (t: number): number => 1 - Math.pow(1 - t, 3);
        const easedProgress = easeOut(progress);
        
        const shapeIndex = getShapeIndex(animShape.shape);
        const color = getShapeColor(shapeIndex);
        
        if (animShape.type === 'place') {
            const startX = animShape.startPosition.x;
            const startY = animShape.startPosition.y;
            
            const minX = Math.min(...animShape.shape.map(b => b.x));
            const minY = Math.min(...animShape.shape.map(b => b.y));
            const endX = BOARD_OFFSET_X + (animShape.endPosition.x + minX) * CELL_SIZE + CELL_SIZE / 2;
            const endY = BOARD_OFFSET_Y + (animShape.endPosition.y + minY) * CELL_SIZE + CELL_SIZE / 2;
            
            const currentX = startX + (endX - startX) * easedProgress;
            const currentY = startY + (endY - startY) * easedProgress;
            
            const maxX = Math.max(...animShape.shape.map(b => b.x));
            const maxY = Math.max(...animShape.shape.map(b => b.y));
            const shapeWidth = (maxX - minX + 1) * CELL_SIZE;
            const shapeHeight = (maxY - minY + 1) * CELL_SIZE;
            
            const container = new Container();
            container.x = currentX;
            container.y = currentY;
            container.alpha = 0.7 + (0.3 * (1 - easedProgress));
            
            for (const block of animShape.shape) {
                const cellX = (block.x - minX) * CELL_SIZE - shapeWidth / 2;
                const cellY = (block.y - minY) * CELL_SIZE - shapeHeight / 2;
                const sprite = this.drawBlockSprite(cellX, cellY, color, CELL_SIZE - 4);
                container.addChild(sprite);
            }
            
            this.animationLayer.addChild(container);
        } else if (animShape.type === 'restore') {
            const startX = animShape.startPosition.x;
            const startY = animShape.startPosition.y;
            const endX = animShape.endPosition.x;
            const endY = animShape.endPosition.y;
            
            const currentX = startX + (endX - startX) * easedProgress;
            const currentY = startY + (endY - startY) * easedProgress;
            
            const minX = Math.min(...animShape.shape.map(b => b.x));
            const minY = Math.min(...animShape.shape.map(b => b.y));
            const maxX = Math.max(...animShape.shape.map(b => b.x));
            const maxY = Math.max(...animShape.shape.map(b => b.y));
            const shapeWidth = (maxX - minX + 1) * CELL_SIZE;
            const shapeHeight = (maxY - minY + 1) * CELL_SIZE;
            
            const container = new Container();
            container.x = currentX;
            container.y = currentY;
            container.alpha = 0.7 + (0.3 * (1 - easedProgress));
            
            for (const block of animShape.shape) {
                const cellX = (block.x - minX) * CELL_SIZE - shapeWidth / 2;
                const cellY = (block.y - minY) * CELL_SIZE - shapeHeight / 2;
                const sprite = this.drawBlockSprite(cellX, cellY, color, CELL_SIZE - 4);
                container.addChild(sprite);
            }
            
            this.animationLayer.addChild(container);
        }
    }


    /**
     * Gets a CSS variable value from the document body (where theme is applied)
     */
    private getCSSVariable(name: string): string {
        const body = document.body;
        if (body) {
            const value = getComputedStyle(body).getPropertyValue(name).trim();
            if (value) return value;
        }
        const root = document.documentElement;
        let value = getComputedStyle(root).getPropertyValue(name).trim();
        if (value) return value;
        if (body) {
            void body.offsetHeight; // Force reflow
            value = getComputedStyle(body).getPropertyValue(name).trim();
            if (value) return value;
        }
        return '';
    }

    /**
     * Returns the toolbar button text color as a hex number for Pixi.
     * Uses the same color as restart/auto/leaders/settings (respects theme e.g. midnight).
     */
    private getButtonTextColorHex(): number {
        const btn = document.getElementById('restart-button');
        if (!btn) return 0xffffff;
        const cssColor = getComputedStyle(btn).color;
        if (!cssColor) return 0xffffff;
        // Parse "rgb(r, g, b)" or "rgba(r, g, b, a)"
        const rgb = cssColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgb) {
            const r = parseInt(rgb[1], 10) & 0xff;
            const g = parseInt(rgb[2], 10) & 0xff;
            const b = parseInt(rgb[3], 10) & 0xff;
            return (r << 16) | (g << 8) | b;
        }
        // Parse "#RRGGBB" or "#RGB"
        if (cssColor.startsWith('#')) {
            const hex = cssColor.slice(1);
            if (hex.length === 6) return parseInt(hex, 16);
            if (hex.length === 3) {
                const r = parseInt(hex[0] + hex[0], 16);
                const g = parseInt(hex[1] + hex[1], 16);
                const b = parseInt(hex[2] + hex[2], 16);
                return (r << 16) | (g << 8) | b;
            }
        }
        return 0xffffff;
    }

    /**
     * Converts 8x8 board state to 4x4 grid representation
     * Each 4x4 cell represents a 2x2 block from the original board
     */
    private convertTo4x4Grid(): Array<Array<{ color: string; darkness: number; fillCount: number }>> {
        if (!this.finalBoardState || this.finalBoardState.length === 0) {
            return Array(4).fill(null).map(() => Array(4).fill({ color: '#ffffff', darkness: 1.0, fillCount: 0 }));
        }

        // Create an 8x8 boolean grid to track filled cells
        const grid8x8: Array<Array<{ filled: boolean; color: string }>> = Array(BOARD_CELL_COUNT)
            .fill(null)
            .map(() => Array(BOARD_CELL_COUNT).fill({ filled: false, color: '#ffffff' }));

        // Fill the 8x8 grid with blocks from final board state
        for (const block of this.finalBoardState) {
            for (const cell of block.shape) {
                const x = block.position.x + cell.x;
                const y = block.position.y + cell.y;
                if (x >= 0 && x < BOARD_CELL_COUNT && y >= 0 && y < BOARD_CELL_COUNT) {
                    grid8x8[y][x] = { filled: true, color: block.color };
                }
            }
        }

        // Convert to 4x4 grid
        const grid4x4: Array<Array<{ color: string; darkness: number; fillCount: number }>> = Array(4)
            .fill(null)
            .map(() => Array(4).fill({ color: '#ffffff', darkness: 1.0, fillCount: 0 }));

        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                const startY = r * 2;
                const startX = c * 2;

                let filledCount = 0;
                let representativeColor = '#ffffff';
                const colorsInBlock: string[] = [];

                for (let dy = 0; dy < 2; dy++) {
                    for (let dx = 0; dx < 2; dx++) {
                        const y = startY + dy;
                        const x = startX + dx;
                        if (grid8x8[y][x].filled) {
                            filledCount++;
                            colorsInBlock.push(grid8x8[y][x].color);
                        }
                    }
                }

                let darkness: number;
                if (filledCount === 0) {
                    darkness = 1.0;
                } else if (filledCount === 1) {
                    darkness = 0.7;
                } else if (filledCount === 2) {
                    darkness = 0.5;
                } else {
                    darkness = 0.3;
                }

                if (colorsInBlock.length > 0) {
                    const colorCounts = new Map<string, number>();
                    for (const color of colorsInBlock) {
                        colorCounts.set(color, (colorCounts.get(color) || 0) + 1);
                    }
                    let maxCount = 0;
                    for (const [color, count] of colorCounts.entries()) {
                        if (count > maxCount) {
                            maxCount = count;
                            representativeColor = color;
                        }
                    }
                }

                grid4x4[r][c] = { color: representativeColor, darkness, fillCount: filledCount };
            }
        }

        return grid4x4;
    }

    /**
     * Generates a 4x4 emoji representation of the final board state
     */
    generateEmojiBoard(): string {
        if (!this.finalBoardState || this.finalBoardState.length === 0) {
            return '';
        }

        const grid4x4 = this.convertTo4x4Grid();
        const colorSet = getColorSet(this.finalLevel);

        const getBrightness = (hex: string): number => {
            const r = parseInt(hex.substring(1, 3), 16);
            const g = parseInt(hex.substring(3, 5), 16);
            const b = parseInt(hex.substring(5, 7), 16);
            return (r * 299 + g * 587 + b * 114) / 1000;
        };

        let darkestColor = colorSet.colors[0];
        let darkestBrightness = getBrightness(darkestColor);
        for (const color of colorSet.colors) {
            const brightness = getBrightness(color);
            if (brightness < darkestBrightness) {
                darkestBrightness = brightness;
                darkestColor = color;
            }
        }

        const hex = darkestColor.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16) / 255;
        const g = parseInt(hex.substring(2, 4), 16) / 255;
        const b = parseInt(hex.substring(4, 6), 16) / 255;

        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const delta = max - min;

        let h = 0;
        if (delta !== 0) {
            if (max === r) {
                h = ((g - b) / delta) % 6;
            } else if (max === g) {
                h = (b - r) / delta + 2;
            } else {
                h = (r - g) / delta + 4;
            }
        }
        h = Math.round(h * 60);
        if (h < 0) h += 360;

        let levelEmoji: string;
        if ((h >= 0 && h < 30) || (h >= 330 && h <= 360)) {
            levelEmoji = '🟥';
        } else if (h >= 30 && h < 60) {
            levelEmoji = '🟧';
        } else if (h >= 60 && h < 90) {
            levelEmoji = '🟨';
        } else if (h >= 90 && h < 150) {
            levelEmoji = '🟩';
        } else if (h >= 150 && h < 250) {
            levelEmoji = '🟦';
        } else {
            levelEmoji = '🟪';
        }

        const getEmojiForFillCount = (fillCount: number): string => {
            if (fillCount === 0 || fillCount === 1) {
                return '⬜';
            } else if (fillCount === 2 || fillCount === 3) {
                return '⬛';
            } else {
                return levelEmoji;
            }
        };

        let emojiString = '';
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 4; c++) {
                const cell = grid4x4[r][c];
                emojiString += getEmojiForFillCount(cell.fillCount);
            }
            emojiString += '\n';
        }

        emojiString += `\nScore: ${this.finalScore.toLocaleString()}\n`;
        emojiString += `Lines: ${this.finalLinesCleared.toLocaleString()}\n`;
        emojiString += `Level: ${this.finalLevel}\n`;
        emojiString += `Mode: ${this.finalMode.charAt(0).toUpperCase() + this.finalMode.slice(1)}`;

        return emojiString;
    }

    /**
     * Copies the emoji board representation to clipboard
     */
    async copyEmojiBoard(): Promise<boolean> {
        const emojiString = this.generateEmojiBoard();
        if (!emojiString) return false;

        try {
            await navigator.clipboard.writeText(emojiString);
            return true;
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
            const textArea = document.createElement('textarea');
            textArea.value = emojiString;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                document.body.removeChild(textArea);
                return true;
            } catch (fallbackErr) {
                document.body.removeChild(textArea);
                return false;
            }
        }
    }

    /**
     * Shares the emoji board representation using Web Share API or clipboard
     */
    async shareEmojiBoard(): Promise<boolean> {
        const emojiString = this.generateEmojiBoard();
        if (!emojiString) return false;

        if (navigator.share) {
            try {
                await navigator.share({
                    text: emojiString
                });
                return true;
            } catch (err) {
                if ((err as Error).name !== 'AbortError') {
                    console.error('Share failed:', err);
                }
            }
        }

        return this.copyEmojiBoard();
    }

    /**
     * Checks if a point is within the copy link bounds
     */
    isPointInCopyLink(x: number, y: number): boolean {
        if (!this.copyLinkBounds) return false;
        return x >= this.copyLinkBounds.x &&
               x <= this.copyLinkBounds.x + this.copyLinkBounds.width &&
               y >= this.copyLinkBounds.y &&
               y <= this.copyLinkBounds.y + this.copyLinkBounds.height;
    }
    /**
     * Draws game over overlay
     */
    drawGameOver(
        progress: number = 1,
        placedBlocks: PlacedBlock[] = [],
        leaderboardRank: number | null = null,
        leaderboardRanks: { today: number | null; week: number | null; ever: number | null; todayTotal: number; weekTotal: number; everTotal: number } | null = null,
        mode: 'easy' | 'hard' = 'easy'
    ): void {
        if (!this.assets) return;

        // Draw fade overlay - cover board and queue area
        // When progress is 0, overlay is fully transparent (alpha = 0) so board/pops remain visible
        const totalOverlayHeight = BOARD_PIXEL_SIZE + QUEUE_AREA_HEIGHT;
        const overlay = new Graphics();
        overlay.rect(BOARD_OFFSET_X, BOARD_OFFSET_Y, BOARD_PIXEL_SIZE, totalOverlayHeight);
        overlay.fill({ color: 0x000000, alpha: 0.8 * progress });
        this.uiLayer.addChild(overlay);
        
        const textAlpha = progress;
        const centerX = Math.round(BOARD_OFFSET_X + BOARD_PIXEL_SIZE / 2);
        const baseFont = SYSTEM_FONT_STACK;
        const gameOverFontSize = 20;    // Same as today/week/ever line
        // Calculate total content height for vertical centering
        // Center content within BOARD area only (above the queue)
        const boardAreaHeight = BOARD_PIXEL_SIZE;
        const gameOverTextHeight = gameOverFontSize;
        const gameOverSpacing = 36;     // Increased spacing for visual hierarchy
        let emojiBoardHeight = 0;
        if (progress > 0 && this.finalBoardState && this.finalBoardState.length > 0) {
            const emojiText = this.generateEmojiBoard();
            const lines = emojiText.split('\n').filter(line => line.trim() !== '' && !line.includes('Score:') && !line.includes('Lines:') && !line.includes('Level:') && !line.includes('Mode:') && !line.includes('Rank') && !line.includes('Leaderboard'));
            emojiBoardHeight = lines.length * 26 + 20; // Reduced line height for 20px font
        }
        const statLineHeight = gameOverFontSize + 14;
        const scoreHeight = gameOverFontSize + 14;   // Score + reduced spacing
        const linesLevelHeight = statLineHeight;
        const modeHeight = statLineHeight;
        let rankingsHeight = 0;
        if (leaderboardRanks) {
            const periods = [
                { rank: leaderboardRanks.today, total: leaderboardRanks.todayTotal },
                { rank: leaderboardRanks.week, total: leaderboardRanks.weekTotal },
                { rank: leaderboardRanks.ever, total: leaderboardRanks.everTotal }
            ];
            const visibleRankings = periods.filter(p => p.rank !== null && p.total > 0).length;
            rankingsHeight = visibleRankings * statLineHeight + 5;
        }
        const buttonHeight = 44 + 15;
        const totalContentHeight = gameOverTextHeight + gameOverSpacing + emojiBoardHeight + scoreHeight + linesLevelHeight + modeHeight + rankingsHeight + buttonHeight;
        
        // Center vertically within board area only (not including queue)
        const contentStartY = Math.round(BOARD_OFFSET_Y + (boardAreaHeight - totalContentHeight) / 2);
        let currentY = contentStartY;
        
        // Draw "GAME OVER" text - same size as today/week/ever line
        const gameOverText = new Text({
            text: 'GAME OVER',
            style: {
                fontFamily: baseFont,
                fontSize: gameOverFontSize,
                fill: 0xffffff,
                fontWeight: 'bold',
            },
        });
        gameOverText.anchor.set(0.5, 0);
        gameOverText.x = centerX;
        gameOverText.y = currentY;
        gameOverText.alpha = textAlpha;
        this.uiLayer.addChild(gameOverText);
        
        currentY += gameOverTextHeight + gameOverSpacing;
        
        // Draw emoji board
        if (progress > 0 && this.finalBoardState && this.finalBoardState.length > 0) {
            const emojiText = this.generateEmojiBoard();
            const lines = emojiText.split('\n').filter(line => line.trim() !== '' && !line.includes('Score:') && !line.includes('Lines:') && !line.includes('Level:') && !line.includes('Mode:') && !line.includes('Rank') && !line.includes('Leaderboard'));
            
            const lineHeight = 26; // Reduced for 20px font
            lines.forEach((line, index) => {
                const emojiLine = new Text({
                    text: line,
                    style: {
                        fontFamily: baseFont,
                        fontSize: 20,
                        fill: 0xffffff,
                    },
                });
                emojiLine.anchor.set(0.5, 0);
                emojiLine.x = centerX;
                emojiLine.y = Math.round(currentY + index * lineHeight);
                emojiLine.alpha = progress;
                this.uiLayer.addChild(emojiLine);
            });
            
            currentY += lines.length * lineHeight + 20; // Reduced spacing
        }
        
        // Draw stats
        currentY = Math.round(currentY);
        
        // Score - bold weight for emphasis
        const scoreText = new Text({
            text: `Score: ${this.finalScore.toLocaleString()}`,
            style: {
                fontFamily: baseFont,
                fontSize: 20,
                fill: 0xffffff,
                fontWeight: 'bold',
            },
        });
        scoreText.anchor.set(0.5, 0);
        scoreText.x = centerX;
        scoreText.y = currentY;
        scoreText.alpha = textAlpha;
        this.uiLayer.addChild(scoreText);
        currentY += gameOverFontSize + 14;
        
        // Lines / Level
        const linesText = new Text({
            text: `Lines: ${this.finalLinesCleared} / Level ${this.finalLevel}`,
            style: {
                fontFamily: baseFont,
                fontSize: gameOverFontSize,
                fill: 0xffffff,
            },
        });
        linesText.anchor.set(0.5, 0);
        linesText.x = centerX;
        linesText.y = currentY;
        linesText.alpha = textAlpha;
        this.uiLayer.addChild(linesText);
        currentY += statLineHeight;
        
        // Mode
        const modeText = mode.charAt(0).toUpperCase() + mode.slice(1);
        const modeTextObj = new Text({
            text: `Mode: ${modeText}`,
            style: {
                fontFamily: baseFont,
                fontSize: gameOverFontSize,
                fill: 0xffffff,
            },
        });
        modeTextObj.anchor.set(0.5, 0);
        modeTextObj.x = centerX;
        modeTextObj.y = currentY;
        modeTextObj.alpha = textAlpha;
        this.uiLayer.addChild(modeTextObj);
        currentY += statLineHeight;
        
        // Rankings
        if (leaderboardRanks) {
            const periods = [
                { key: 'today' as const, label: 'Today', rank: leaderboardRanks.today, total: leaderboardRanks.todayTotal },
                { key: 'week' as const, label: 'Week', rank: leaderboardRanks.week, total: leaderboardRanks.weekTotal },
                { key: 'ever' as const, label: 'Ever', rank: leaderboardRanks.ever, total: leaderboardRanks.everTotal }
            ];
            
            for (const period of periods) {
                if (period.rank !== null && period.total > 0) {
                    const isTop10 = period.rank <= 10;
                    const rankText = `${period.label}: ${period.rank} of ${period.total}`;
                    const rankTextObj = new Text({
                        text: rankText,
                        style: {
                            fontFamily: baseFont,
                            fontSize: 18,
                            fill: isTop10 ? 0xffd700 : 0xffffff,
                        },
                    });
                    rankTextObj.anchor.set(0.5, 0);
                    rankTextObj.x = centerX;
                    rankTextObj.y = currentY;
                    rankTextObj.alpha = textAlpha;
                    this.uiLayer.addChild(rankTextObj);
                    currentY += 18 + 14; // Reduced spacing
                }
            }
        }
        
        currentY += 5;
        
        // Draw Share button - same font and style as restart/auto/leaders/settings buttons
        if (progress > 0 && this.finalBoardState && this.finalBoardState.length > 0) {
            const radiusMd = this.getCSSVariable('--radius-md') || '10px';
            const borderRadius = parseInt(radiusMd, 10) || 10;
            const buttonWidth = 140;
            const buttonHeight = 44;
            const buttonX = Math.round(centerX - buttonWidth / 2);
            const buttonY = Math.round(currentY);
            
            const accentColor = this.getCSSVariable('--accent-color') || '#4b5563';
            const hex = accentColor.replace('#', '');
            const buttonColor = parseInt(hex, 16);
            // Use same text color as toolbar buttons (respects theme e.g. midnight -> dark text)
            const buttonTextColor = this.getButtonTextColorHex();
            
            // Draw button background
            const buttonBg = new Graphics();
            buttonBg.roundRect(buttonX, buttonY, buttonWidth, buttonHeight, borderRadius);
            buttonBg.fill({ color: buttonColor, alpha: progress });
            this.uiLayer.addChild(buttonBg);
            
            // Draw button text - same font size and weight as toolbar buttons (--font-lg, 500)
            const buttonText = new Text({
                text: 'Share',
                style: {
                    fontFamily: baseFont,
                    fontSize: gameOverFontSize,
                    fill: buttonTextColor,
                    fontWeight: '500',
                },
            });
            buttonText.anchor.set(0.5, 0.5);
            buttonText.x = Math.round(buttonX + buttonWidth / 2);
            buttonText.y = Math.round(buttonY + buttonHeight / 2);
            buttonText.alpha = progress;
            this.uiLayer.addChild(buttonText);
            
            // Store bounds for click detection
            this.copyLinkBounds = {
                x: buttonX,
                y: buttonY,
                width: buttonWidth,
                height: buttonHeight
            };
        } else {
            this.copyLinkBounds = null;
        }
    }

    /**
     * Draws level up animation
     */
    drawLevelUp(progress: number): void {
        if (progress <= 0 || progress >= 1) return;
        
        const levelUpSprite = new Sprite(this.assets!.levelUp);
        levelUpSprite.anchor.set(0.5, 0.5);
        // Dynamically calculate center of board area
        const boardCenterX = BOARD_OFFSET_X + BOARD_PIXEL_SIZE / 2;
        const boardCenterY = BOARD_OFFSET_Y + BOARD_PIXEL_SIZE / 2;
        levelUpSprite.x = boardCenterX;
        levelUpSprite.y = boardCenterY;
        levelUpSprite.y = CANVAS_HEIGHT / 2;
        
        // Scale animation
        let scale = 1.0;
        if (progress <= 0.2) {
            scale = 0.5 + (progress / 0.2) * 0.7;
        } else if (progress <= 0.4) {
            scale = 1.2 - ((progress - 0.2) / 0.2) * 0.2;
        } else {
            scale = 1.0;
        }
        levelUpSprite.scale.set(scale);
        levelUpSprite.alpha = 1 - progress;
        
        this.uiLayer.addChild(levelUpSprite);
    }

    /**
     * Draws points animation
     */
    drawPointsAnimation(progress: number, points: number): void {
        if (progress <= 0 || progress >= 1) return;
        
        const text = new Text({
            text: `+${points.toLocaleString()}`,
            style: {
                fontFamily: SYSTEM_FONT_STACK,
                fontSize: 48 + Math.floor((points - 200) / 100) * 8,
                fill: 0xffff00,
                fontWeight: 'bold',
            },
        });
        text.anchor.set(0.5, 0.5);
        // Dynamically calculate center of board area
        const boardCenterX = BOARD_OFFSET_X + BOARD_PIXEL_SIZE / 2;
        const boardCenterY = BOARD_OFFSET_Y + BOARD_PIXEL_SIZE / 2;
        text.x = boardCenterX;
        text.y = boardCenterY - 50; // Slightly above center
        text.alpha = 1 - progress;
        text.scale.set(1 + progress * 0.5);
        this.uiLayer.addChild(text);
    }

    /**
     * Draws combo animation
     */
    drawComboAnimation(
        progress: number,
        type: 'continue' | 'break',
        multiplier: number,
        comboCount: number
    ): void {
        if (progress <= 0 || progress >= 1) return;
        
        let text: Text;
        if (type === 'continue') {
            // Use text for combo multipliers - scale font size based on combo count
            const comboText = `x${comboCount}`;
            // Base font size 48, increases by 8px per combo level (min 48, scales up)
            const baseFontSize = 48;
            const fontSize = baseFontSize + Math.min((comboCount - 1) * 8, 40); // Cap at +40px (max 88px)
            text = new Text({
                text: comboText,
                style: {
                    fontFamily: SYSTEM_FONT_STACK,
                    fontSize: fontSize,
                    fill: 0xffd700, // Gold color
                    fontWeight: 'bold',
                    stroke: { color: 0x000000, width: 3 }, // Black outline
                },
            });
        } else {
            // Combo break - use same base font size as combo multipliers
            const baseFontSize = 48;
            text = new Text('COMBO BROKEN', {
                fontFamily: SYSTEM_FONT_STACK,
                fontSize: baseFontSize, // Same base size as combo multipliers
                fill: 0xff0000,
                fontWeight: 'bold',
                stroke: { color: 0x000000, width: 3 }, // Black outline for consistency
            });
        }
        
        text.anchor.set(0.5, 0.5);
        // Dynamically calculate center of board area
        const boardCenterX = BOARD_OFFSET_X + BOARD_PIXEL_SIZE / 2;
        const boardCenterY = BOARD_OFFSET_Y + BOARD_PIXEL_SIZE / 2;
        text.x = boardCenterX;
        text.y = boardCenterY;
        text.alpha = 1 - progress;
        if (type === 'continue') {
            // Additional scale animation on top of size scaling
            text.scale.set(1 + progress * 0.3);
        }
        this.uiLayer.addChild(text);
    }

    /**
     * Main render method
     */
    render(
        board: Board,
        placedBlocks: PlacedBlock[],
        queue: (Shape | null)[],
        dragState: DragState,
        gameOver: boolean,
        animatingCells: AnimatingCell[] = [],
        gameOverProgress: number = 0,
        totalShapesPlaced: number = 0,
        levelUpProgress: number = 0,
        level: number = 1,
        score: number = 0,
        linesCleared: number = 0,
        leaderboardRanks: { today: number | null; week: number | null; ever: number | null; todayTotal: number; weekTotal: number; everTotal: number } | null = null,
        mode: 'easy' | 'hard' = 'easy',
        animatingShapes: AnimatingShape[] = [],
        pointsAnimationProgress: number = 0,
        pointsAnimationValue: number = 0,
        comboAnimationProgress: number = 0,
        comboAnimationType: 'continue' | 'break' | null = null,
        comboAnimationMultiplier: number = 0,
        comboCount: number = 0,
        hoverPosition: Position | null = null,
        smoothedDragPosition?: { x: number; y: number }
    ): void {
        // Check if renderer is initialized
        if (!this.initialized) {
            console.warn('[PixiRenderer] Render called before initialization - skipping');
            return;
        }
        
        if (!this.assets) {
            console.warn('[PixiRenderer] Assets not loaded - skipping render');
            return;
        }
        
        if (!this.app.canvas) {
            console.warn('[PixiRenderer] App canvas not set - skipping render');
            return;
        }
        
        this.currentLevel = level;
        this.clear();
        
        // Draw board background using tiled grid texture
        this.drawBoardBackground();
        
        // Draw board blocks first
        this.drawBoard(board, placedBlocks, animatingCells, totalShapesPlaced, hoverPosition);
        
        // Draw grid lines on top (so they're visible in empty cells)
        if (this.settings.showGrid) {
            this.drawGrid();
        }
        
        if (dragState.isDragging && dragState.isValidPosition && dragState.previewLinesCleared) {
            this.drawPreviewLineHighlights(dragState.previewLinesCleared, placedBlocks);
        }
        
        for (const animShape of animatingShapes) {
            this.drawAnimatingShape(animShape);
        }
        
        this.drawQueue(queue);
        this.drawDragPreview(dragState, smoothedDragPosition);
        
        if (gameOver && animatingCells.length === 0 && this.finalBoardState === null) {
            this.finalBoardState = placedBlocks.map(block => ({
                ...block,
                shape: block.shape.map(cell => ({ ...cell })),
                position: { ...block.position }
            }));
            this.finalTotalShapesPlaced = totalShapesPlaced;
            this.finalLinesCleared = linesCleared;
            this.finalLevel = level;
            this.finalMode = mode;
        }
        
        // Always update finalScore when gameOver is true (score may change due to game over bonus)
        if (gameOver) {
            this.finalScore = score;
        }

        if (gameOver) {
            this.drawGameOver(gameOverProgress, placedBlocks, null, leaderboardRanks, mode);
        }
        
        if (levelUpProgress > 0 && levelUpProgress < 1) {
            this.drawLevelUp(levelUpProgress);
        }
        
        if (pointsAnimationProgress > 0 && pointsAnimationProgress < 1 && pointsAnimationValue > 200) {
            this.drawPointsAnimation(pointsAnimationProgress, pointsAnimationValue);
        }
        
        if (comboAnimationProgress > 0 && comboAnimationProgress < 1 && comboAnimationType !== null) {
            this.drawComboAnimation(comboAnimationProgress, comboAnimationType, comboAnimationMultiplier, comboCount);
        }

        // Always drive the canvas paint from our game loop so board + pops + overlay appear reliably
        this.app.render();
    }

    /**
     * Resets final board snapshot
     */
    resetFinalBoardSnapshot(): void {
        this.finalBoardState = null;
        this.finalTotalShapesPlaced = 0;
        this.finalScore = 0;
        this.finalLinesCleared = 0;
        this.finalLevel = 1;
        this.finalMode = 'easy';
        this.copyLinkBounds = null;
    }

    /**
     * Gets the PixiJS application (for input handler)
     */
    getApp(): Application {
        return this.app;
    }
}
