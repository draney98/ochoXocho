/**
 * Main game orchestrator - manages game loop, state, and all game systems
 */

import { Position, Shape, PlacedBlock, GameState, AnimatingCell, AnimatingShape, GameSettings } from './types';
import { Board } from './board';
import { generateShapes, generateEasyShapes, getShapeColor, getShapeIndex, getShapePointValue, updateColorScheme } from './shapes';
import { Renderer } from './renderer';
import { InputHandler } from './input';
import { calculateScore } from './scoring';
import { checkGameOver } from './gameOver';
import { SoundManager } from './sound';
import { recordScore } from './highScores';
import { getDeviceId } from './deviceId';
import { getLeaderboard, getScoreRank as getScoreRankAPI } from './api';
import { loadSettings, saveSettings } from './main';
import { GAMEPLAY_CONFIG, ANIMATION_CONFIG, GAME_OVER_CONFIG, DRAG_CONTROLLER_CONFIG, getExplosionThreshold, getPulseThreshold } from './config';
import { getUIColorForLevel, getButtonColors } from './colorConfig';
import { findOptimalPlacementOrder } from './boardUtils';
import { getQueueItemRect, BOARD_CELL_COUNT, DRAG_VISUAL_OFFSET_Y, CELL_SIZE, BOARD_OFFSET_X, BOARD_OFFSET_Y, CANVAS_WIDTH, BOARD_AREA_HEIGHT } from './constants';
import { DragController } from './dragController';

/**
 * Game class orchestrates all game systems and manages the game loop
 */
export class Game {
    private board: Board;
    private state: GameState;
    private renderer: Renderer;
    private inputHandler: InputHandler;
    private canvas: HTMLCanvasElement;
    private scoreElement: HTMLElement | null;
    private turnElement: HTMLElement | null;
    private linesElement: HTMLElement | null;
    private levelElement: HTMLElement | null;
    private levelProgressElement: HTMLElement | null;
    private emojiBoardElement: HTMLElement | null;
    private animationFrameId: number | null = null;
    private shapesPlacedThisTurn: number = 0;
    private animatingCells: AnimatingCell[] = [];
    private animatingShapes: AnimatingShape[] = [];
    private readonly ANIMATION_DURATION = ANIMATION_CONFIG.lineClearMs;
    private readonly SNAP_ANIMATION_DURATION = 200; // 200ms for snap animation
    private gameOverStartTime: number | null = null;
    private readonly GAME_OVER_ANIMATION_DURATION = ANIMATION_CONFIG.gameOverFadeMs;
    private gameOverPopComplete: boolean = false;
    private playerNamePromptShown: boolean = false; // Track if we've shown the player name prompt
    private levelUpStartTime: number | null = null;
    private leaderboardRanks: { today: number | null; week: number | null; ever: number | null; todayTotal: number; weekTotal: number; everTotal: number } = {
        today: null,
        week: null,
        ever: null,
        todayTotal: 0,
        weekTotal: 0,
        everTotal: 0
    }; // Ranks and total players for each period
    private readonly LEVEL_UP_ANIMATION_DURATION = ANIMATION_CONFIG.levelUpMs;
    private pointsAnimationStartTime: number | null = null;
    private pointsAnimationValue: number = 0;
    private comboAnimationStartTime: number | null = null;
    private comboAnimationType: 'continue' | 'break' | null = null;
    private comboAnimationMultiplier: number = 0;
    private isAutoPlacing: boolean = false; // Track if autoplace is in progress
    private onAutoPlaceStateChange?: (isPlacing: boolean) => void; // Callback for autoplace state changes
    private placementsSinceLastClear: number = 0; // Number of placements since last line clear (resets to 0 on clear)
    private comboMultiplier: number = 1.0; // Running combo multiplier (starts at 1.025 when combo begins, adds 0.025 per combo)
    private comboCount: number = 0; // Number of consecutive line clears within 3 placements (for display)
    private settings: GameSettings;
    private soundManager: SoundManager;
    private isNewHighScore: boolean = false; // Track if current score is a new high score
    private dragController: DragController; // Physics-based drag smoothing
    private smoothedDragPosition: { x: number; y: number } | null = null; // Cached smoothed position for rendering
    // Animation index is based on level, not cycling

    constructor(canvas: HTMLCanvasElement, initialSettings: GameSettings) {
        this.canvas = canvas;
        this.settings = { ...initialSettings };
        this.board = new Board();
        // Generate initial queue based on mode
        const initialQueue = this.settings.mode === 'easy' 
            ? generateEasyShapes(this.board)
            : generateShapes();
        
        this.state = {
            board: this.board.getGrid(),
            queue: initialQueue,
            placedBlocks: [],
            score: 0,
            gameOver: false,
            level: 1,
            levelProgress: 0,
            totalShapesPlaced: 0,
            turn: 0,
            linesCleared: 0,
        };

        this.renderer = new Renderer(canvas, this.settings);
        this.inputHandler = new InputHandler(
            canvas,
            this.board,
            this.state.queue,
            this.handlePlaceShape.bind(this),
            this.removeShapeFromQueue.bind(this),
            this.restoreShapeToQueue.bind(this),
            this.settings
        );

        this.scoreElement = document.getElementById('score-value');
        this.turnElement = document.getElementById('turn-value');
        this.linesElement = document.getElementById('lines-value');
        this.levelElement = null; // Level number removed, only progress bar shown
        this.levelProgressElement = null; // No longer using single progress bar element
        this.emojiBoardElement = null; // Emoji board is now only shown on game over screen
        this.soundManager = new SoundManager(initialSettings.soundEnabled);
        // Initialize DragController with config
        this.dragController = new DragController(DRAG_CONTROLLER_CONFIG);
        // Initialize color scheme for starting level
        updateColorScheme(this.state.level);
        this.updateScoreDisplay();
        this.updateTurnDisplay();
        this.updateLinesDisplay();
        this.updateLevelDisplay();
    }

    /**
     * Sets the callback for autoplace state changes
     * @param callback - Function to call when autoplace state changes
     */
    setAutoPlaceStateChangeCallback(callback: (isPlacing: boolean) => void): void {
        this.onAutoPlaceStateChange = callback;
    }

    /**
     * Notifies listeners about autoplace state changes
     * @param isPlacing - Whether autoplace is currently in progress
     */
    private notifyAutoPlaceStateChanged(isPlacing: boolean): void {
        if (this.onAutoPlaceStateChange) {
            this.onAutoPlaceStateChange(isPlacing);
        }
    }

    /**
     * Sets the callback function for prompting the user for player name
     * @param callback - Function that returns a Promise resolving to the player name
     */
    setPlayerNamePromptCallback(callback: () => Promise<string>): void {
        this.promptForPlayerNameCallback = callback;
    }

    /**
     * Prompts the user for player name if callback is set
     * @returns Promise resolving to the player name, or empty string if cancelled
     */
    private async promptForPlayerName(): Promise<string> {
        if (this.promptForPlayerNameCallback) {
            return await this.promptForPlayerNameCallback();
        }
        return '';
    }

    private promptForPlayerNameCallback?: () => Promise<string>;

    /**
     * Updates runtime settings originating from the UI panel
     * @param updatedSettings - latest settings selected by the player
     */
    updateSettings(updatedSettings: GameSettings): void {
        const modeChanged = this.settings.mode !== updatedSettings.mode;
        const themeChanged = this.settings.theme !== updatedSettings.theme;
        this.settings = { ...updatedSettings };
        this.renderer.updateSettings(this.settings);
        this.inputHandler.updateSettings(this.settings);
        this.soundManager.setEnabled(this.settings.soundEnabled);

        // Update UI colors if theme changed
        if (themeChanged) {
            this.updateUIColors();
        }

        if (!this.settings.enableAnimations) {
            // Immediately drop any active animations so the board stays in sync
            this.animatingCells = [];
        }
        
        // If mode changed and game is not over, regenerate queue with new mode
        if (modeChanged && !this.state.gameOver) {
            this.state.queue = this.settings.mode === 'easy'
                ? generateEasyShapes(this.board)
                : generateShapes();
            this.inputHandler.updateQueue(this.state.queue);
        }
    }

    /**
     * Starts the game loop
     */
    start(): void {
        this.gameLoop();
    }

    /**
     * Stops the game loop
     */
    stop(): void {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    /**
     * Main game loop - updates and renders each frame
     */
    private gameLoop(): void {
        this.update();
        this.render();
        this.animationFrameId = requestAnimationFrame(() => this.gameLoop());
    }

    /**
     * Updates game state
     */
    private update(): void {
        // Update animation progress
        const currentTime = Date.now();
        this.animatingCells = this.animatingCells.filter(cell => {
            const elapsed = currentTime - cell.startTime;
            // Use different duration for explosions vs regular clears
            const baseExplosionMs = ANIMATION_CONFIG.explosionMs;
            const duration = cell.type === 'explosion' 
                ? baseExplosionMs 
                : this.ANIMATION_DURATION;
            cell.progress = Math.min(elapsed / duration, 1);
            return cell.progress < 1; // Remove completed animations
        });
        
        // Update shape snap animations
        this.animatingShapes = this.animatingShapes.filter(animShape => {
            const elapsed = currentTime - animShape.startTime;
            const progress = Math.min(elapsed / animShape.duration, 1);
            
            // When animation completes, actually place the shape (for place animations)
            if (progress >= 1 && animShape.type === 'place') {
                // Animation complete - shape is already placed on board, just remove from animation
                return false;
            }
            
            return progress < 1; // Keep animating shapes
        });
        
        // Update DragController - physics-based drag smoothing
        this.updateDragController();
        
        // Don't update game logic if game is over (freeze the board)
        if (this.state.gameOver) {
            // Still update game over animation
            if (this.gameOverStartTime === null) {
                this.gameOverStartTime = currentTime;
            }
            return;
        }
        
        // Update input handler references
        this.inputHandler.updateBoard(this.board);
        this.inputHandler.updateQueue(this.state.queue);
        
        // Reset game over animation start time if not game over
        if (!this.state.gameOver) {
            this.gameOverStartTime = null;
        }
    }

    /**
     * Updates the DragController with current drag state
     * Handles drag start/end and calculates smoothed position for rendering
     */
    private updateDragController(): void {
        const dragState = this.inputHandler.getDragState();
        
        if (dragState.isDragging && dragState.shape && dragState.anchorPoint) {
            // Calculate shape dimensions for centering
            const minX = Math.min(...dragState.shape.map(b => b.x));
            const minY = Math.min(...dragState.shape.map(b => b.y));
            const maxX = Math.max(...dragState.shape.map(b => b.x));
            const maxY = Math.max(...dragState.shape.map(b => b.y));
            const shapeWidth = (maxX - minX + 1) * CELL_SIZE;
            const shapeHeight = (maxY - minY + 1) * CELL_SIZE;
            
            // Calculate raw target position (floating position with visual offset)
            const basePosition = dragState.projectedBoardPosition || dragState.anchorPoint;
            let rawTarget = {
                x: basePosition.x,
                y: basePosition.y + DRAG_VISUAL_OFFSET_Y
            };
            
            // Clamp visual piece center to keep it within the board area (playing surface)
            // This prevents the piece from visually going off-screen, but doesn't return it to queue
            const minVisualX = shapeWidth / 2;
            const maxVisualX = CANVAS_WIDTH - shapeWidth / 2;
            const minVisualY = shapeHeight / 2;
            const maxVisualY = BOARD_AREA_HEIGHT - shapeHeight / 2;
            
            rawTarget = {
                x: Math.max(minVisualX, Math.min(maxVisualX, rawTarget.x)),
                y: Math.max(minVisualY, Math.min(maxVisualY, rawTarget.y))
            };
            
            // Start drag if not already active
            if (!this.dragController.isActive()) {
                this.dragController.beginDrag(rawTarget);
            }
            
            // Calculate snap target: grid-snapped position of shape's visual center
            // This is where the shape's CENTER would be when placed at mousePosition
            let snapTarget: { x: number; y: number } | null = null;
            if (dragState.hasBoardPosition) {
                const gridPixelX = BOARD_OFFSET_X + dragState.mousePosition.x * CELL_SIZE + shapeWidth / 2;
                const gridPixelY = BOARD_OFFSET_Y + dragState.mousePosition.y * CELL_SIZE + shapeHeight / 2;
                snapTarget = { x: gridPixelX, y: gridPixelY };
            }
            
            // Update drag controller - passes clamped raw target and snap target
            this.smoothedDragPosition = this.dragController.update(rawTarget, snapTarget);
        } else {
            // Drag ended - clear smoothed position and end drag
            if (this.dragController.isActive()) {
                this.dragController.endDrag();
            }
            this.smoothedDragPosition = null;
        }
    }

    /**
     * Renders the current game state
     */
    private render(): void {
        const dragState = this.inputHandler.getDragState();
        // Only show fade overlay after popping animation completes
        const gameOverProgress = (this.gameOverStartTime !== null && this.gameOverPopComplete)
            ? Math.min((Date.now() - this.gameOverStartTime) / this.GAME_OVER_ANIMATION_DURATION, 1)
            : 0;
        // Calculate level up animation progress
        const levelUpProgress = this.levelUpStartTime !== null
            ? Math.min((Date.now() - this.levelUpStartTime) / this.LEVEL_UP_ANIMATION_DURATION, 1)
            : 0;
        // Clear level up animation if it's complete
        if (levelUpProgress >= 1) {
            this.levelUpStartTime = null;
        }
        
        // Calculate points animation progress
        // Animation duration scales with points: base 2000ms, +200ms per 100 points over 200
        const pointsAnimationDuration = this.pointsAnimationStartTime !== null
            ? 2000 + Math.floor((this.pointsAnimationValue - 200) / 100) * 200
            : 2000;
        const pointsAnimationProgress = this.pointsAnimationStartTime !== null
            ? Math.min((Date.now() - this.pointsAnimationStartTime) / pointsAnimationDuration, 1)
            : 0;
        // Clear points animation if it's complete
        if (pointsAnimationProgress >= 1) {
            this.pointsAnimationStartTime = null;
            this.pointsAnimationValue = 0;
        }
        
        // Calculate combo animation progress
        const COMBO_ANIMATION_DURATION = 1500; // 1.5 seconds
        const comboAnimationProgress = this.comboAnimationStartTime !== null
            ? Math.min((Date.now() - this.comboAnimationStartTime) / COMBO_ANIMATION_DURATION, 1)
            : 0;
        // Clear combo animation if it's complete
        if (comboAnimationProgress >= 1) {
            this.comboAnimationStartTime = null;
            this.comboAnimationType = null;
            this.comboAnimationMultiplier = 0;
        }
        // Check if we should show the player name prompt (after game over screen is visible)
        // Only show if ALL of these conditions are met:
        // 1. Game is actually over
        // 2. Game over screen has started (gameOverStartTime is set)
        // 3. Popping animation is complete
        // 4. Game over screen is visible (progress > 0.1)
        // 5. We haven't shown the prompt yet
        // 6. Safety: game has actually been played (not at initial state)
        const shouldShowPrompt = this.state.gameOver && 
            this.gameOverStartTime !== null && 
            this.gameOverPopComplete && 
            gameOverProgress > 0.1 && 
            !this.playerNamePromptShown &&
            (this.state.score > 0 || this.state.turn > 0 || this.state.totalShapesPlaced > 0);
            
        if (shouldShowPrompt) {
            // Game over screen is visible, check if we need to prompt for player name
            const playerName = (this.settings.playerName || '').trim();
            if (!playerName || playerName === '' || playerName === '   ') {
                // Show prompt asynchronously (don't block render loop)
                this.playerNamePromptShown = true; // Set flag first to prevent multiple prompts
                this.promptForPlayerName().then((enteredName) => {
                    if (enteredName && enteredName.trim() !== '') {
                        const formattedName = enteredName.padEnd(3, ' ');
                        // Update settings with new player name
                        const updatedSettings = { ...this.settings, playerName: formattedName };
                        this.updateSettings(updatedSettings);
                        // Save to localStorage
                        try {
                            const currentSettings = loadSettings();
                            const savedSettings = { ...currentSettings, playerName: formattedName };
                            saveSettings(savedSettings);
                            
                            // Update the settings panel input field to reflect the change
                            const playerNameInput = document.getElementById('setting-player-name') as HTMLInputElement | null;
                            if (playerNameInput) {
                                playerNameInput.value = enteredName.substring(0, 3).toUpperCase();
                            }
                        } catch (e) {
                            console.warn('Failed to save player name:', e);
                        }
                    }
                });
            } else {
                // Player name already set, mark as shown to avoid checking again
                this.playerNamePromptShown = true;
            }
        }
        
        const hoverPosition = this.inputHandler.getHoverPosition();
        this.renderer.render(
            this.board,
            this.state.placedBlocks,
            this.state.queue,
            dragState,
            this.state.gameOver,
            this.animatingCells,
            gameOverProgress,
            this.state.totalShapesPlaced,
            levelUpProgress,
            this.state.level,
            this.state.score,
            this.state.linesCleared,
            this.leaderboardRanks,
            this.settings.mode,
            this.animatingShapes,
            pointsAnimationProgress,
            this.pointsAnimationValue,
            comboAnimationProgress,
            this.comboAnimationType,
            this.comboAnimationMultiplier,
            this.comboCount,
            hoverPosition,
            this.smoothedDragPosition ?? undefined
        );
    }

    /**
     * Forces an immediate redraw of the game
     * Useful for debugging or fixing rendering issues
     */
    forceRedraw(): void {
        this.render();
    }

    /**
     * Removes a shape from the queue when it's selected for dragging
     * @param shapeIndex - Index of the shape to remove
     */
    private removeShapeFromQueue(shapeIndex: number): void {
        if (shapeIndex < 0 || shapeIndex >= this.state.queue.length) {
            return;
        }
        // Leave a hole instead of shifting positions so queue slots stay fixed
        this.state.queue[shapeIndex] = null;
        this.inputHandler.updateQueue(this.state.queue);
    }

    /**
     * Restores a shape to the queue at the specified index (when drag is cancelled or invalid)
     * @param shapeIndex - Index where the shape should be restored
     * @param shape - The shape to restore
     */
    private restoreShapeToQueue(shapeIndex: number, shape: Shape): void {
        if (shapeIndex < 0) {
            return;
        }
        
        const dragState = this.inputHandler.getDragState();
        const startPosition = dragState.anchorPoint || { x: 0, y: 0 };
        const shapeIndexInPool = getShapeIndex(shape);
        const shapeColor = getShapeColor(shapeIndexInPool);
        
        // If animations are enabled, create restore animation
        if (this.settings.enableAnimations) {
            // Get queue item position for end position
            const queueRect = getQueueItemRect(shapeIndex, 3);
            const endPosition = {
                x: queueRect.x + queueRect.width / 2,
                y: queueRect.y + queueRect.height / 2
            };
            
            // Create restore animation
            // Store canvas coordinates in endPosition (will be handled specially in renderer)
            const animatingShape: AnimatingShape = {
                shape,
                startPosition,
                endPosition: { x: Math.floor(endPosition.x), y: Math.floor(endPosition.y) } as Position,
                color: shapeColor,
                startTime: Date.now(),
                duration: this.SNAP_ANIMATION_DURATION,
                type: 'restore',
                queueIndex: shapeIndex
            };
            this.animatingShapes.push(animatingShape);
        }
        
        // Ensure the queue has a slot at this index
        while (this.state.queue.length < 3) {
            this.state.queue.push(null);
        }
        this.state.queue[shapeIndex] = shape;
        this.inputHandler.updateQueue(this.state.queue);
    }

    /**
     * Handles placing a shape on the board
     * Called by the input handler when a shape is dropped
     * @param shapeIndex - Index of the shape that was in the queue (before removal)
     * @param position - Grid position where the shape is placed
     */
    private handlePlaceShape(shapeIndex: number, position: Position): void {
        if (this.state.gameOver) {
            return;
        }

        // Shape was already removed from queue when dragging started
        // We need to get the shape from the drag state instead
        const dragState = this.inputHandler.getDragState();
        if (!dragState.shape) {
            return;
        }

        const shape = dragState.shape;
        const shapeIndexInPool = getShapeIndex(shape);
        const shapeColor = getShapeColor(shapeIndexInPool);
        // Newly placed blocks start with base value (1-8) - store this value
        const basePointValue = getShapePointValue(shapeIndexInPool, 0);

        // Place shape on board immediately (snap animation removed per user request)
        this.board.placeShape(shape, position);
        
        // Add to placed blocks - store the base value
        const placedBlock: PlacedBlock = {
            shape,
            position,
            color: shapeColor,
            pointValue: basePointValue,  // Store base value (original, never modified)
            lineClearBonuses: 0,  // Track line clear bonuses separately
            totalShapesPlacedAtPlacement: this.state.totalShapesPlaced,
            shapeIndex: shapeIndexInPool,  // Store the original shape index
            darkness: 1.0,  // Start at full brightness
        };
        this.state.placedBlocks.push(placedBlock);
        // Resume AudioContext on first user interaction (fixes autoplay policy)
        this.soundManager.resumeContext();
        this.soundManager.playPlace();

        // Shape is removed from queue when dropped (for touch) or when drag started (for mouse)
        this.shapesPlacedThisTurn++;
        this.state.totalShapesPlaced++;
        this.state.turn++;
        this.updateTurnDisplay();

        // Increment placements since last clear
        this.placementsSinceLastClear++;

        // Color scheme updates are now handled when level changes (every 10 levels)

        // Check for full rows and columns
        // This will also handle combo logic based on whether lines were cleared
        this.checkAndClearLines();

        // If required number of shapes have been placed, generate new queue based on mode
        if (this.shapesPlacedThisTurn >= GAMEPLAY_CONFIG.shapesPerTurn) {
            this.shapesPlacedThisTurn = 0;
            this.state.queue = this.settings.mode === 'easy'
                ? generateEasyShapes(this.board)
                : generateShapes();
            
            // Validate that queue has 3 valid shapes (should never fail, but safety check)
            const activeQueue = this.state.queue.filter((q): q is Shape => !!q && Array.isArray(q) && q.length > 0);
            if (activeQueue.length !== 3) {
                console.error(`[GAME] Queue generation failed! Expected 3 shapes, got ${activeQueue.length}. Queue:`, this.state.queue);
                // This should never happen, but if it does, trigger game over
                this.triggerGameOver();
                return;
            }
            
            // Check for game over at the beginning of each new round (after queue regeneration)
            const isGameOver = checkGameOver(this.board, activeQueue);
            if (isGameOver) {
                this.triggerGameOver();
            }
        } else {
            // Check for game over after placing a shape (in case lines cleared made room)
            const activeQueue = this.state.queue.filter((q): q is Shape => !!q && Array.isArray(q) && q.length > 0);
            if (activeQueue.length > 0) {
                const isGameOver = checkGameOver(this.board, activeQueue);
                if (isGameOver) {
                    this.triggerGameOver();
                }
            } else {
                // If queue is empty mid-turn, this shouldn't happen but handle gracefully
                // Wait for next turn when new shapes will be generated
                this.state.gameOver = false;
                this.gameOverStartTime = null;
                this.inputHandler.updateGameOverState(false);
            }
        }

        this.updateScoreDisplay();
    }

    /**
     * Removes cells from shapes that are in cleared rows or columns
     * @param fullRows - Array of cleared row indices
     * @param fullColumns - Array of cleared column indices
     */
    private removeCellsFromShapes(fullRows: number[], fullColumns: number[], cellsToRemove?: Set<string>, cellFilledMap?: Map<string, boolean>): void {
        const beforeCount = this.state.placedBlocks.length;
        const beforeTotalCells = this.state.placedBlocks.reduce((sum, b) => sum + b.shape.length, 0);
        
        // Build cellFilledMap if not provided (for checking intersections)
        let filledMap = cellFilledMap;
        if (!filledMap) {
            filledMap = new Map<string, boolean>();
            for (const block of this.state.placedBlocks) {
                for (const cell of block.shape) {
                    const absoluteX = block.position.x + cell.x;
                    const absoluteY = block.position.y + cell.y;
                    const key = `${absoluteX},${absoluteY}`;
                    filledMap.set(key, true);
                }
            }
        }
        
        this.state.placedBlocks = this.state.placedBlocks.map(block => {
            // Filter out cells that are in cleared rows or columns, or in the cellsToRemove set
            const remainingCells = block.shape.filter(cell => {
                const absoluteX = block.position.x + cell.x;
                const absoluteY = block.position.y + cell.y;
                
                // Check if cell is in cleared row or column
                const inClearedRow = fullRows.includes(absoluteY);
                const inClearedColumn = fullColumns.includes(absoluteX);
                
                // Check if cell is marked for removal by explosion
                const key = `${absoluteX},${absoluteY}`;
                const removedByExplosion = cellsToRemove?.has(key) ?? false;
                
                // If block is explosion-only, it can be removed by explosion OR if in both a full row AND column
                // (even if those rows/columns aren't "clearable" due to other unexplodable blocks)
                if (block.explosionOnly) {
                    // Check if this cell is at the intersection of two full lines
                    // Build a quick check: is the row full? is the column full?
                    let rowIsFull = true;
                    let colIsFull = true;
                    for (let x = 0; x < BOARD_CELL_COUNT; x++) {
                        const rowKey = `${x},${absoluteY}`;
                        if (!filledMap.get(rowKey)) {
                            rowIsFull = false;
                            break;
                        }
                    }
                    for (let y = 0; y < BOARD_CELL_COUNT; y++) {
                        const colKey = `${absoluteX},${y}`;
                        if (!filledMap.get(colKey)) {
                            colIsFull = false;
                            break;
                        }
                    }
                    const atIntersection = rowIsFull && colIsFull;
                    const shouldRemove = removedByExplosion || (inClearedRow && inClearedColumn) || atIntersection;
                    if (this.settings.devMode && (inClearedRow || inClearedColumn || atIntersection)) {
                        console.log(`[LINE CLEAR DEBUG] Explosion-only block at (${absoluteX}, ${absoluteY}): inClearedRow=${inClearedRow}, inClearedColumn=${inClearedColumn}, rowIsFull=${rowIsFull}, colIsFull=${colIsFull}, atIntersection=${atIntersection}, removedByExplosion=${removedByExplosion}, shouldRemove=${shouldRemove}`);
                    }
                    return !shouldRemove; // Return true to keep, false to remove
                }
                
                // Normal blocks: remove if in cleared row/column OR removed by explosion
                return !inClearedRow && !inClearedColumn && !removedByExplosion;
            });
            
            // Return updated block with remaining cells, or null if all cells were removed
            if (remainingCells.length === 0) {
                return null;
            }
            
            return {
                ...block,
                shape: remainingCells
            };
        }).filter((block): block is PlacedBlock => block !== null);
        
        const afterCount = this.state.placedBlocks.length;
        const afterTotalCells = this.state.placedBlocks.reduce((sum, b) => sum + b.shape.length, 0);
        
        if (beforeCount !== afterCount || beforeTotalCells !== afterTotalCells) {
            if (this.settings.devMode) {
                console.log(`[CLEAR] Cleared rows: [${fullRows.join(', ')}], columns: [${fullColumns.join(', ')}]`);
            }
        }
    }

    /**
     * Cleans up shapes after animation completes
     * @param fullRows - Array of cleared row indices
     * @param fullColumns - Array of cleared column indices
     */
    private cleanupAfterAnimation(fullRows: number[], fullColumns: number[]): void {
        this.removeCellsFromShapes(fullRows, fullColumns, undefined, undefined);
    }

    /**
     * Rebuilds the board grid from placedBlocks to ensure synchronization
     * This ensures the board grid matches what's actually rendered
     */
    private rebuildBoardFromPlacedBlocks(): void {
        // Clear the entire board first
        for (let y = 0; y < 8; y++) {
            this.board.clearRow(y);
        }
        
        // Re-place all remaining blocks from placedBlocks
        for (const block of this.state.placedBlocks) {
            if (block.shape.length > 0) {
                // Place the shape (which will mark all its cells as filled)
                this.board.placeShape(block.shape, block.position);
            }
        }
    }

    /**
     * Gets rows that are full and can be cleared
     * Rows with explosion-only blocks are clearable if all explosion-only blocks are at intersections where both row and column are full
     * @returns Array of row indices that are full and clearable
     */
    private getClearableFullRows(): number[] {
        const BOARD_SIZE = BOARD_CELL_COUNT;
        const fullRows: number[] = [];
        
        // Build a map of cell positions from placedBlocks (source of truth, not board grid)
        const cellFilledMap = new Map<string, boolean>();
        const cellExplosionOnlyMap = new Map<string, boolean>();
        for (const block of this.state.placedBlocks) {
            const isExplosionOnly = block.explosionOnly ?? false;
            for (const cell of block.shape) {
                const absoluteX = block.position.x + cell.x;
                const absoluteY = block.position.y + cell.y;
                if (absoluteX >= 0 && absoluteX < BOARD_SIZE && absoluteY >= 0 && absoluteY < BOARD_SIZE) {
                    const key = `${absoluteX},${absoluteY}`;
                    cellFilledMap.set(key, true);
                    cellExplosionOnlyMap.set(key, isExplosionOnly);
                }
            }
        }
        
        // First, identify which rows and columns are full (based on placedBlocks, not board grid)
        const fullRowSet = new Set<number>();
        const fullColumnSet = new Set<number>();
        
        for (let row = 0; row < BOARD_SIZE; row++) {
            let isFull = true;
            for (let x = 0; x < BOARD_SIZE; x++) {
                const key = `${x},${row}`;
                if (!cellFilledMap.get(key)) {
                    isFull = false;
                    break;
                }
            }
            if (isFull) {
                fullRowSet.add(row);
            }
        }
        
        for (let col = 0; col < BOARD_SIZE; col++) {
            let isFull = true;
            for (let y = 0; y < BOARD_SIZE; y++) {
                const key = `${col},${y}`;
                if (!cellFilledMap.get(key)) {
                    isFull = false;
                    break;
                }
            }
            if (isFull) {
                fullColumnSet.add(col);
            }
        }
        
        // Check each full row to see if it's clearable
        for (const row of fullRowSet) {
            // Double-check that the row is actually full (safety check)
            let actuallyFull = true;
            for (let x = 0; x < BOARD_SIZE; x++) {
                const key = `${x},${row}`;
                if (!cellFilledMap.get(key)) {
                    actuallyFull = false;
                    if (this.settings.devMode) {
                        console.error(`[LINE CLEAR ERROR] Row ${row} in fullRowSet but cell (${x}, ${row}) is NOT in cellFilledMap!`);
                    }
                    break;
                }
            }
            
            if (!actuallyFull) {
                // Skip this row - it's not actually full
                if (this.settings.devMode) {
                    console.error(`[LINE CLEAR ERROR] Row ${row} was marked as full but verification failed! Skipping.`);
                }
                continue;
            }
            
            let hasExplosionOnly = false;
            let allExplosionOnlyAtIntersection = true;
            
            for (let x = 0; x < BOARD_SIZE; x++) {
                const key = `${x},${row}`;
                if (cellExplosionOnlyMap.get(key)) {
                    hasExplosionOnly = true;
                    // Check if this explosion-only block is at an intersection where both row and column are full
                    if (!fullColumnSet.has(x)) {
                        allExplosionOnlyAtIntersection = false;
                        break;
                    }
                }
            }
            
            // Row is clearable if it has no explosion-only blocks, OR all explosion-only blocks are at intersections
            if (!hasExplosionOnly || allExplosionOnlyAtIntersection) {
                fullRows.push(row);
            }
        }
        
        return fullRows;
    }

    /**
     * Gets columns that are full and can be cleared
     * Columns with explosion-only blocks are clearable if all explosion-only blocks are at intersections where both row and column are full
     * @returns Array of column indices that are full and clearable
     */
    private getClearableFullColumns(): number[] {
        const BOARD_SIZE = BOARD_CELL_COUNT;
        const fullColumns: number[] = [];
        
        // Build a map of cell positions from placedBlocks (source of truth, not board grid)
        const cellFilledMap = new Map<string, boolean>();
        const cellExplosionOnlyMap = new Map<string, boolean>();
        const cellToBlockCount = new Map<string, number>(); // Track how many blocks claim each cell
        for (const block of this.state.placedBlocks) {
            const isExplosionOnly = block.explosionOnly ?? false;
            for (const cell of block.shape) {
                const absoluteX = block.position.x + cell.x;
                const absoluteY = block.position.y + cell.y;
                if (absoluteX >= 0 && absoluteX < BOARD_SIZE && absoluteY >= 0 && absoluteY < BOARD_SIZE) {
                    const key = `${absoluteX},${absoluteY}`;
                    cellFilledMap.set(key, true);
                    cellExplosionOnlyMap.set(key, isExplosionOnly);
                    // Track if multiple blocks claim the same cell (shouldn't happen, but debug it)
                    const count = cellToBlockCount.get(key) || 0;
                    cellToBlockCount.set(key, count + 1);
                    if (count > 0 && this.settings.devMode) {
                        console.warn(`[LINE CLEAR DEBUG] Cell (${absoluteX}, ${absoluteY}) is claimed by ${count + 1} blocks! Block at (${block.position.x}, ${block.position.y})`);
                    }
                }
            }
        }
        
        // First, identify which rows and columns are full (based on placedBlocks, not board grid)
        const fullRowSet = new Set<number>();
        const fullColumnSet = new Set<number>();
        
        for (let row = 0; row < BOARD_SIZE; row++) {
            let isFull = true;
            const missingCells: string[] = [];
            for (let x = 0; x < BOARD_SIZE; x++) {
                const key = `${x},${row}`;
                if (!cellFilledMap.get(key)) {
                    isFull = false;
                    missingCells.push(key);
                }
            }
            if (isFull) {
                fullRowSet.add(row);
            } else if (this.settings.devMode && missingCells.length < 3) {
                // Log if row is almost full (missing < 3 cells) for debugging
                console.log(`[LINE CLEAR DEBUG] Row ${row} is NOT full. Missing cells: ${missingCells.join(', ')}`);
            }
        }
        
        for (let col = 0; col < BOARD_SIZE; col++) {
            let isFull = true;
            const missingCells: string[] = [];
            const filledCells: string[] = [];
            for (let y = 0; y < BOARD_SIZE; y++) {
                const key = `${col},${y}`;
                if (!cellFilledMap.get(key)) {
                    isFull = false;
                    missingCells.push(key);
                } else {
                    filledCells.push(key);
                }
            }
            if (isFull) {
                fullColumnSet.add(col);
                if (this.settings.devMode) {
                    console.log(`[LINE CLEAR DEBUG] Column ${col} detected as FULL. Total blocks: ${this.state.placedBlocks.length}, Total filled cells in map: ${cellFilledMap.size}, Filled cells in column: ${filledCells.join(', ')}`);
                    // Log all blocks that contribute to this column
                    const contributingBlocks = this.state.placedBlocks.filter(block => {
                        return block.shape.some(cell => {
                            const absoluteX = block.position.x + cell.x;
                            return absoluteX === col;
                        });
                    });
                    console.log(`[LINE CLEAR DEBUG] Blocks contributing to column ${col}:`, contributingBlocks.map(b => `(${b.position.x},${b.position.y}) shape=${b.shape.length} cells`));
                    // Check for overlapping cells in this column
                    const overlappingCells: string[] = [];
                    for (let y = 0; y < BOARD_SIZE; y++) {
                        const key = `${col},${y}`;
                        const count = cellToBlockCount.get(key) || 0;
                        if (count > 1) {
                            overlappingCells.push(`${key} (${count} blocks)`);
                        }
                    }
                    if (overlappingCells.length > 0) {
                        console.warn(`[LINE CLEAR DEBUG] Column ${col} has overlapping cells: ${overlappingCells.join(', ')}`);
                    }
                }
            } else if (this.settings.devMode && missingCells.length < 3) {
                // Log if column is almost full (missing < 3 cells) for debugging
                console.log(`[LINE CLEAR DEBUG] Column ${col} is NOT full. Missing cells: ${missingCells.join(', ')}, Filled: ${filledCells.length}/8`);
            }
        }
        
        // Check each full column to see if it's clearable
        for (const col of fullColumnSet) {
            // Double-check that the column is actually full (safety check)
            let actuallyFull = true;
            for (let y = 0; y < BOARD_SIZE; y++) {
                const key = `${col},${y}`;
                if (!cellFilledMap.get(key)) {
                    actuallyFull = false;
                    if (this.settings.devMode) {
                        console.error(`[LINE CLEAR ERROR] Column ${col} in fullColumnSet but cell (${col}, ${y}) is NOT in cellFilledMap!`);
                    }
                    break;
                }
            }
            
            if (!actuallyFull) {
                // Skip this column - it's not actually full
                if (this.settings.devMode) {
                    console.error(`[LINE CLEAR ERROR] Column ${col} was marked as full but verification failed! Skipping.`);
                }
                continue;
            }
            
            let hasExplosionOnly = false;
            let allExplosionOnlyAtIntersection = true;
            
            for (let y = 0; y < BOARD_SIZE; y++) {
                const key = `${col},${y}`;
                if (cellExplosionOnlyMap.get(key)) {
                    hasExplosionOnly = true;
                    // Check if this explosion-only block is at an intersection where both row and column are full
                    if (!fullRowSet.has(y)) {
                        allExplosionOnlyAtIntersection = false;
                        break;
                    }
                }
            }
            
            // Column is clearable if it has no explosion-only blocks, OR all explosion-only blocks are at intersections
            if (!hasExplosionOnly || allExplosionOnlyAtIntersection) {
                fullColumns.push(col);
            }
        }
        
        return fullColumns;
    }

    /**
     * Checks for full rows and columns, clears them, and awards points.
     * Handles explosion chain reactions, combo multipliers, and mode-specific behavior.
     * 
     * Combo System:
     * - Tracks placements since last line clear
     * - If lines are cleared within 3 placements, builds a combo multiplier (starts at 1.025, adds 0.025 per line)
     * - If 3 placements occur without a clear, applies multiplier to all remaining blocks and resets
     * 
     * Explosion System:
     * - Blocks with point value > 60 explode when cleared, removing adjacent cells in chain reactions
     * - In easy mode: explosion-removed blocks count toward score
     * - In hard mode: exploding blocks are replaced by explosion-only gray monominos
     *   that can only be cleared by explosions, not by normal line clears
     * 
     * Does NOT clear if game is over - board should remain visible.
     * 
     * @private
     */
    private checkAndClearLines(): void {
        // Never clear lines if game is over - board should stay visible
        if (this.state.gameOver) {
            return;
        }
        
        // Get mode-specific explosion threshold
        const explosionThreshold = getExplosionThreshold(this.settings.mode);
        
        // Use custom methods that exclude rows/columns with explosion-only blocks
        const fullRows = this.getClearableFullRows();
        const fullColumns = this.getClearableFullColumns();
        
        if (this.settings.devMode && (fullRows.length > 0 || fullColumns.length > 0)) {
            console.log(`[LINE CLEAR] About to clear - Rows: [${fullRows.join(', ')}], Columns: [${fullColumns.join(', ')}], Total blocks: ${this.state.placedBlocks.length}`);
            // Build cellFilledMap for verification (same source of truth as detection)
            const verificationMap = new Map<string, boolean>();
            for (const block of this.state.placedBlocks) {
                for (const cell of block.shape) {
                    const absoluteX = block.position.x + cell.x;
                    const absoluteY = block.position.y + cell.y;
                    if (absoluteX >= 0 && absoluteX < BOARD_CELL_COUNT && absoluteY >= 0 && absoluteY < BOARD_CELL_COUNT) {
                        const key = `${absoluteX},${absoluteY}`;
                        verificationMap.set(key, true);
                    }
                }
            }
            // Verify columns are actually full using the same source of truth
            for (const col of fullColumns) {
                let actuallyFull = true;
                const missingCells: string[] = [];
                for (let y = 0; y < BOARD_CELL_COUNT; y++) {
                    const key = `${col},${y}`;
                    if (!verificationMap.get(key)) {
                        actuallyFull = false;
                        missingCells.push(key);
                    }
                }
                if (!actuallyFull) {
                    console.error(`[LINE CLEAR ERROR] Column ${col} marked as clearable but is NOT full! Missing cells: ${missingCells.join(', ')}`);
                }
            }
            // Verify rows are actually full
            for (const row of fullRows) {
                let actuallyFull = true;
                const missingCells: string[] = [];
                for (let x = 0; x < BOARD_CELL_COUNT; x++) {
                    const key = `${x},${row}`;
                    if (!verificationMap.get(key)) {
                        actuallyFull = false;
                        missingCells.push(key);
                    }
                }
                if (!actuallyFull) {
                    console.error(`[LINE CLEAR ERROR] Row ${row} marked as clearable but is NOT full! Missing cells: ${missingCells.join(', ')}`);
                }
            }
        }
        const linesCleared = fullRows.length + fullColumns.length;

        // Check if combo broke (3rd placement WITHOUT a line clear)
        // This must happen BEFORE the early return, so we can check even when no lines are cleared
        if (linesCleared === 0) {
            if (this.comboMultiplier > 1.0 && this.placementsSinceLastClear >= 3) {
                // Combo broke on 3rd placement without line clear
                console.log(`[COMBO] Combo broke on ${this.placementsSinceLastClear}th placement! Resetting multiplier to 1.000x`);
                
                // Trigger combo break animation
                this.comboAnimationStartTime = Date.now();
                this.comboAnimationType = 'break';
                this.comboAnimationMultiplier = this.comboMultiplier;
                console.log(`[COMBO] Showing "COMBO BROKEN" message`);
                
                // Reset multiplier, placement counter, and combo count
                this.comboMultiplier = 1.0;
                this.placementsSinceLastClear = 0;
                this.comboCount = 0;
            }
            
            // Early return if no lines to clear (but combo break check already happened above)
            return;
        }

        const shouldAnimate = this.settings.enableAnimations;

        // Build a map of cell positions to blocks for explosion chain reaction
        const cellToBlockMap = new Map<string, { block: PlacedBlock; cell: Position; pointValue: number; explosionOnly: boolean }>();
        for (const block of this.state.placedBlocks) {
            // Calculate current point value for this block
            const placementLevel = Math.floor(block.totalShapesPlacedAtPlacement / GAMEPLAY_CONFIG.shapesPerValueTier);
            const currentLevel = Math.floor(this.state.totalShapesPlaced / GAMEPLAY_CONFIG.shapesPerValueTier);
            const levelIncrements = currentLevel - placementLevel;
            const currentPointValue = block.pointValue + block.lineClearBonuses + (levelIncrements * GAMEPLAY_CONFIG.pointsPerTier);
            const explosionOnly = block.explosionOnly ?? false;
            
            for (const cell of block.shape) {
                const absoluteX = block.position.x + cell.x;
                const absoluteY = block.position.y + cell.y;
                const key = `${absoluteX},${absoluteY}`;
                cellToBlockMap.set(key, { block, cell, pointValue: currentPointValue, explosionOnly });
            }
        }

        // Track cells that will be removed (from line clears and explosions)
        const cellsToRemove = new Set<string>();
        
        // Build cellFilledMap from cellToBlockMap (which we already built above)
        const cellFilledMap = new Map<string, boolean>();
        for (const key of cellToBlockMap.keys()) {
            cellFilledMap.set(key, true);
        }
        
        // Check which rows and columns are full (for intersection clearing of unexplodable blocks)
        const BOARD_SIZE = BOARD_CELL_COUNT;
        const fullRowSet = new Set<number>();
        const fullColumnSet = new Set<number>();
        for (let row = 0; row < BOARD_SIZE; row++) {
            let isFull = true;
            for (let x = 0; x < BOARD_SIZE; x++) {
                const key = `${x},${row}`;
                if (!cellFilledMap.get(key)) {
                    isFull = false;
                    break;
                }
            }
            if (isFull) {
                fullRowSet.add(row);
            }
        }
        for (let col = 0; col < BOARD_SIZE; col++) {
            let isFull = true;
            for (let y = 0; y < BOARD_SIZE; y++) {
                const key = `${col},${y}`;
                if (!cellFilledMap.get(key)) {
                    isFull = false;
                    break;
                }
            }
            if (isFull) {
                fullColumnSet.add(col);
            }
        }
        
        // First, add all cells in cleared rows/columns
        // Note: For explosion-only blocks, they will only be removed if in BOTH a full row AND column
        // (handled in removeCellsFromShapes), but we add them here for consistency
        for (const block of this.state.placedBlocks) {
            for (const cell of block.shape) {
                const absoluteX = block.position.x + cell.x;
                const absoluteY = block.position.y + cell.y;
                const inClearedRow = fullRows.includes(absoluteY);
                const inClearedColumn = fullColumns.includes(absoluteX);
                // Also check if this is an intersection of two full lines (even if not "clearable")
                const inFullRow = fullRowSet.has(absoluteY);
                const inFullColumn = fullColumnSet.has(absoluteX);
                if (inClearedRow || inClearedColumn) {
                    const key = `${absoluteX},${absoluteY}`;
                    cellsToRemove.add(key);
                    if (this.settings.devMode && block.explosionOnly) {
                        console.log(`[LINE CLEAR DEBUG] Explosion-only block at (${absoluteX}, ${absoluteY}) in cleared row=${inClearedRow} col=${inClearedColumn}, full row=${inFullRow} col=${inFullColumn} - will be removed if in BOTH full row AND column`);
                    }
                }
            }
        }

        // Helper function to get adjacent cells (8 directions)
        const getAdjacentCells = (x: number, y: number): Array<{ x: number; y: number }> => {
            const adjacent: Array<{ x: number; y: number }> = [];
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    if (dx === 0 && dy === 0) continue; // Skip the cell itself
                    const adjX = x + dx;
                    const adjY = y + dy;
                    if (adjX >= 0 && adjX < BOARD_CELL_COUNT && adjY >= 0 && adjY < BOARD_CELL_COUNT) {
                        adjacent.push({ x: adjX, y: adjY });
                    }
                }
            }
            return adjacent;
        };

        // Find all exploding cells and trigger chain reactions
        const processedExplosions = new Set<string>();
        
        const processExplosion = (x: number, y: number): void => {
            const key = `${x},${y}`;
            if (processedExplosions.has(key)) return; // Already processed
            processedExplosions.add(key);
            
            const cellData = cellToBlockMap.get(key);
            if (!cellData) return; // Cell doesn't exist
            
            // Check if this cell should explode (must not be explosion-only and must exceed threshold)
            if (!cellData.explosionOnly && cellData.pointValue > explosionThreshold) {
                // Mark this cell for removal
                cellsToRemove.add(key);
                
                // Get all adjacent cells and recursively process them
                const adjacent = getAdjacentCells(x, y);
                for (const adj of adjacent) {
                    const adjKey = `${adj.x},${adj.y}`;
                    // Mark adjacent cell for removal
                    cellsToRemove.add(adjKey);
                    
                    // Recursively check if adjacent cell also explodes (must not be explosion-only)
                    const adjCellData = cellToBlockMap.get(adjKey);
                    if (adjCellData && !adjCellData.explosionOnly && adjCellData.pointValue > explosionThreshold) {
                        processExplosion(adj.x, adj.y);
                    }
                }
            }
        };

        // Process all cells that are in cleared rows/columns and might explode
        for (const block of this.state.placedBlocks) {
            const placementLevel = Math.floor(block.totalShapesPlacedAtPlacement / GAMEPLAY_CONFIG.shapesPerValueTier);
            const currentLevel = Math.floor(this.state.totalShapesPlaced / GAMEPLAY_CONFIG.shapesPerValueTier);
            const levelIncrements = currentLevel - placementLevel;
            const currentPointValue = block.pointValue + block.lineClearBonuses + (levelIncrements * GAMEPLAY_CONFIG.pointsPerTier);
            
            for (const cell of block.shape) {
                const absoluteX = block.position.x + cell.x;
                const absoluteY = block.position.y + cell.y;
                const inClearedRow = fullRows.includes(absoluteY);
                const inClearedColumn = fullColumns.includes(absoluteX);
                
                // If this cell is in a cleared row/column and should explode, trigger chain reaction
                // Skip explosion-only blocks
                const explosionOnly = block.explosionOnly ?? false;
                if ((inClearedRow || inClearedColumn) && !explosionOnly && currentPointValue > explosionThreshold) {
                    // Play explosion sound for each explosion (can overlap)
                    this.soundManager.playExplosion();
                    processExplosion(absoluteX, absoluteY);
                }
            }
        }

        if (shouldAnimate) {
            // Start animations for cells being removed
            const currentTime = Date.now();
            
            for (const block of this.state.placedBlocks) {
                // Calculate current point value for this block
                const placementLevel = Math.floor(block.totalShapesPlacedAtPlacement / GAMEPLAY_CONFIG.shapesPerValueTier);
                const currentLevel = Math.floor(this.state.totalShapesPlaced / GAMEPLAY_CONFIG.shapesPerValueTier);
                const levelIncrements = currentLevel - placementLevel;
                const currentPointValue = block.pointValue + block.lineClearBonuses + (levelIncrements * GAMEPLAY_CONFIG.pointsPerTier);
                
                for (const cell of block.shape) {
                    const absoluteX = block.position.x + cell.x;
                    const absoluteY = block.position.y + cell.y;
                    const key = `${absoluteX},${absoluteY}`;
                    
                    // Check if this cell should be removed (line clear or explosion)
                    if (cellsToRemove.has(key)) {
                        const inClearedRow = fullRows.includes(absoluteY);
                        const inClearedColumn = fullColumns.includes(absoluteX);
                        
                        // Add staggered delay based on position for more varied animations
                        let staggerDelay = 0;
                        if (inClearedRow) {
                            staggerDelay = absoluteX * 15; // 15ms per cell
                        } else if (inClearedColumn) {
                            staggerDelay = absoluteY * 15; // 15ms per cell
                        }
                        
                        // Use one animation per level (level-based, not cycling)
                        const animationIndex = (this.state.level - 1) % 17;
                        
                        // Determine animation type: explosion if point value > threshold, otherwise clear
                        const animationType = currentPointValue > explosionThreshold ? 'explosion' : 'clear';
                        
                        // Add to animating cells with animation index and staggered start time
                        this.animatingCells.push({
                            x: absoluteX,
                            y: absoluteY,
                            color: block.color,
                            startTime: currentTime + staggerDelay,
                            progress: 0,
                            type: animationType,
                            animationIndex: animationIndex
                        });
                    }
                }
            }
        } else {
            this.animatingCells = [];
        }

        // Clear full rows and columns on the board immediately
        for (const row of fullRows) {
            this.board.clearRow(row);
        }

        for (const col of fullColumns) {
            this.board.clearColumn(col);
        }

        const boardCleared = this.willBoardBeCleared(fullRows, fullColumns);
        
        // Track explosion-removed cells for scoring (easy mode) and creating explosion-only blocks (hard mode)
        const explosionRemovedCells = new Set<string>();
        
        // Handle explosion-removed cells based on mode
        if (cellsToRemove && cellsToRemove.size > 0) {
            for (const key of cellsToRemove) {
                const [x, y] = key.split(',').map(Number);
                // Only process if not already cleared by row/column
                const inClearedRow = fullRows.includes(y);
                const inClearedColumn = fullColumns.includes(x);
                if (!inClearedRow && !inClearedColumn) {
                    // This cell was removed by explosion
                    explosionRemovedCells.add(key);
                    
                    let shouldCreateExplosionOnlyBlock = false;
                    
                    if (this.settings.mode === 'hard') {
                        // In hard mode, create an explosion-only block (pointValue 0) in place of the exploding block
                        // Find the original block that was at this position
                        let foundBlock = false;
                        for (const block of this.state.placedBlocks) {
                            for (const cell of block.shape) {
                                const absoluteX = block.position.x + cell.x;
                                const absoluteY = block.position.y + cell.y;
                                if (absoluteX === x && absoluteY === y) {
                                    foundBlock = true;
                                    
                                    // If this was already an explosion-only block, it's being removed by the explosion
                                    // (which is correct - explosion-only blocks can be cleared by explosions)
                                    // Don't create a new explosion-only block in this case
                                    if (block.explosionOnly) {
                                        break; // Skip creating a new explosion-only block
                                    }
                                    
                                    // Check if this was an exploding block (point value > threshold)
                                    const placementLevel = Math.floor(block.totalShapesPlacedAtPlacement / GAMEPLAY_CONFIG.shapesPerValueTier);
                                    const currentLevel = Math.floor(this.state.totalShapesPlaced / GAMEPLAY_CONFIG.shapesPerValueTier);
                                    const levelIncrements = currentLevel - placementLevel;
                                    const currentPointValue = block.pointValue + block.lineClearBonuses + (levelIncrements * GAMEPLAY_CONFIG.pointsPerTier);
                                    
                                    if (currentPointValue > explosionThreshold) {
                                        shouldCreateExplosionOnlyBlock = true;
                                        break;
                                    }
                                    break;
                                }
                            }
                            if (foundBlock) break;
                        }
                    }
                    
                    // Clear the cell from the board (will be removed from placedBlocks later)
                    this.board.clearCell(x, y);
                    
                    // If we're creating an explosion-only block, do it after clearing the cell
                    if (shouldCreateExplosionOnlyBlock) {
                        // Create a new explosion-only block (monomino with pointValue 0)
                        // These blocks can only be cleared by explosions, not by normal line clears
                        const explosionOnlyBlock: PlacedBlock = {
                            shape: [{ x: 0, y: 0 }], // Monomino
                            position: { x, y },
                            color: '#808080', // Gray color for explosion-only blocks
                            pointValue: 0, // Cannot explode (pointValue 0)
                            lineClearBonuses: 0,
                            totalShapesPlacedAtPlacement: this.state.totalShapesPlaced,
                            shapeIndex: -1, // Special index for explosion-only blocks
                            darkness: 1.0,
                            explosionOnly: true, // Can only be cleared by explosions
                        };
                        this.state.placedBlocks.push(explosionOnlyBlock);
                        // Place it on the board
                        this.board.placeShape(explosionOnlyBlock.shape, explosionOnlyBlock.position);
                        // Remove this cell from cellsToRemove so the explosion-only block doesn't get removed
                        cellsToRemove.delete(key);
                    }
                }
            }
        }
        
        const points = calculateScore(
            fullRows,
            fullColumns,
            this.state.placedBlocks,
            this.state.totalShapesPlaced,
            explosionRemovedCells,
            this.settings.mode
        );
        this.state.score += points;
        this.updateScoreDisplay();
        
        // Trigger points animation if points > 200
        if (points > 200) {
            this.pointsAnimationStartTime = Date.now();
            this.pointsAnimationValue = points;
        }
        
        // Check leaderboard after score update to see if this is a new high score
        this.checkHighScore();
        
        this.soundManager.playClear(linesCleared, boardCleared);

        // Vibrate on mobile when line/column is completed
        if (linesCleared > 0 && 'vibrate' in navigator) {
            // Short vibration pattern: vibrate for 50ms
            navigator.vibrate(50);
        }

        // Update lines cleared counter
        this.state.linesCleared += linesCleared;
        this.updateLinesDisplay();

        // If lines were cleared, check if this is a combo (cleared lines within 3 placements of last clear)
        if (linesCleared > 0) {
            // Lines were cleared - check if this is a combo (cleared lines within 3 placements of last clear)
            // placementsSinceLastClear was just incremented before this placement, so we check if it's <= 3
            const isCombo = this.placementsSinceLastClear <= 3;
            
            // If this is a combo, increase the multiplier by 0.025 for each line cleared
            if (isCombo) {
                if (this.comboMultiplier === 1.0) {
                    // Starting a new combo - start at 1.025, then add 0.025 for each additional line
                    this.comboMultiplier = 1.025 + (linesCleared - 1) * 0.025;
                    this.comboCount = 1; // First clear in combo
                    console.log(`[COMBO] Combo started! Multiplier: ${this.comboMultiplier.toFixed(3)}x (${linesCleared} line${linesCleared > 1 ? 's' : ''} cleared)`);
                    // Don't show animation for first combo
                } else {
                    // Continuing combo - add 0.025 for each line cleared
                    const previousMultiplier = this.comboMultiplier;
                    this.comboMultiplier += linesCleared * 0.025;
                    this.comboCount++; // Increment combo count
                    console.log(`[COMBO] Combo continues! Count: x${this.comboCount}, Multiplier: ${previousMultiplier.toFixed(3)}x → ${this.comboMultiplier.toFixed(3)}x (${linesCleared} line${linesCleared > 1 ? 's' : ''} cleared)`);
                    
                    // Apply multiplier increment to all blocks currently on the screen
                    // Multiply by the ratio of new to old multiplier to avoid compounding
                    const multiplierIncrement = this.comboMultiplier / previousMultiplier;
                    this.state.placedBlocks.forEach(block => {
                        const oldValue = block.pointValue;
                        block.pointValue = Math.round(block.pointValue * multiplierIncrement);
                        if (this.settings.devMode && block.pointValue !== oldValue) {
                            console.log(`[BLOCK VALUE] Block at (${block.position.x}, ${block.position.y}) increased: ${oldValue} → ${block.pointValue} (combo multiplier: ${multiplierIncrement.toFixed(3)}x)`);
                        }
                    });
                    
                    // Trigger combo continue animation (only when continuing, not starting)
                    this.comboAnimationStartTime = Date.now();
                    this.comboAnimationType = 'continue';
                    this.comboAnimationMultiplier = this.comboMultiplier;
                    console.log(`[COMBO] Showing "COMBO x${this.comboCount}!" message`);
                }
            } else {
                // Not a combo (more than 3 placements since last clear) - reset combo count
                this.comboCount = 0;
            }
            
            // Reset placements counter when lines are cleared (combo continues)
            this.placementsSinceLastClear = 0;
        }
        
        // Darken all remaining blocks and increment their line clear bonuses
        this.state.placedBlocks.forEach(block => {
            block.darkness = Math.max(0, block.darkness - GAMEPLAY_CONFIG.darknessReduction);
            const oldBonus = block.lineClearBonuses;
            block.lineClearBonuses += linesCleared; // Increment line clear bonuses by 1 for each line/column cleared
            if (this.settings.devMode && block.lineClearBonuses !== oldBonus) {
                console.log(`[BLOCK VALUE] Block at (${block.position.x}, ${block.position.y}) line clear bonus increased: ${oldBonus} → ${block.lineClearBonuses} (${linesCleared} line${linesCleared > 1 ? 's' : ''} cleared)`);
            }
        });

        // Update level progress
        this.state.levelProgress += linesCleared * GAMEPLAY_CONFIG.levelProgressPerLine;
        // Check for level up
        const previousLevel = this.state.level;
        
        while (this.state.levelProgress >= GAMEPLAY_CONFIG.levelProgressThreshold) {
            this.state.levelProgress -= GAMEPLAY_CONFIG.levelProgressThreshold;
            this.state.level++;
        }
        
        // Update color scheme if level changed (colors change every level up to level 10)
        if (this.state.level !== previousLevel) {
            if (this.settings.devMode) {
                console.log(`[COLOR] Level changed from ${previousLevel} to ${this.state.level}`);
            }
            updateColorScheme(this.state.level);
            // Don't update colors for existing blocks - they keep their original colors
            // Only newly placed blocks will use the new color scheme
            // Update UI colors to match new level
            this.updateUIColors();
            // Start level up animation
            this.levelUpStartTime = Date.now();
            // Force a re-render to show new colors in queue
            this.render();
        }
        
        this.updateLevelDisplay();

        // Remove cells from shapes after animation completes
        if (shouldAnimate && this.animatingCells.length > 0) {
            // Wait for the longest animation to complete (explosions take longer than regular clears)
            const baseExplosionMs = ANIMATION_CONFIG.explosionMs;
            const maxAnimationDuration = Math.max(this.ANIMATION_DURATION, baseExplosionMs);
            setTimeout(() => {
                this.removeCellsFromShapes(fullRows, fullColumns, cellsToRemove, cellFilledMap);
                // CRITICAL: Rebuild board grid from placedBlocks to ensure synchronization
                this.rebuildBoardFromPlacedBlocks();
                // Ensure board state is synchronized after cleanup
                this.inputHandler.updateBoard(this.board);
            }, maxAnimationDuration);
        } else {
            // No animations, clean up immediately
            this.removeCellsFromShapes(fullRows, fullColumns, cellsToRemove, cellFilledMap);
            // CRITICAL: Rebuild board grid from placedBlocks to ensure synchronization
            this.rebuildBoardFromPlacedBlocks();
            // Ensure board state is synchronized after cleanup
            this.inputHandler.updateBoard(this.board);
        }
    }

    /**
     * Updates the score display in the UI
     */
    /**
     * Formats a number with commas (e.g., 1234 -> "1,234")
     */
    private formatNumber(num: number): string {
        return num.toLocaleString('en-US');
    }

    private updateScoreDisplay(): void {
        if (this.scoreElement) {
            let displayText = this.formatNumber(this.state.score);
            
            // Show combo multiplier if showPointValues is enabled
            if (this.settings.showPointValues && this.comboMultiplier > 1.0) {
                displayText += ` (${this.comboMultiplier.toFixed(3)}x)`;
            }
            
            this.scoreElement.textContent = displayText;
            // Change color if this is a new high score
            if (this.isNewHighScore) {
                this.scoreElement.style.color = '#FFD700'; // Gold color for new high score
            } else {
                this.scoreElement.style.color = ''; // Reset to default
            }
        }
    }
    
    /**
     * Checks if the current score is a new high score by fetching fresh leaderboard data
     */
    private async checkHighScore(): Promise<void> {
        try {
            // Fetch fresh leaderboard data (no caching)
            const leaderboard = await getLeaderboard(this.settings.mode, 'ever', 1);
            const currentHighScore = leaderboard.length > 0 ? leaderboard[0].score : 0;
            
            // Check if current score beats the high score
            if (this.state.score > currentHighScore) {
                this.isNewHighScore = true;
                this.updateScoreDisplay(); // Update display to show gold color
            } else {
                this.isNewHighScore = false;
                this.updateScoreDisplay(); // Reset color if not a high score
            }
        } catch (error) {
            // Silently fail - don't block gameplay if leaderboard check fails
            if (this.settings.devMode) {
                console.warn('[GAME] Failed to check high score:', error);
            }
        }
    }

    /**
     * Updates the turn display in the UI
     */
    private updateTurnDisplay(): void {
        if (this.turnElement) {
            this.turnElement.textContent = this.formatNumber(this.state.turn);
        }
    }

    /**
     * Updates the lines cleared display in the UI
     */
    private updateLinesDisplay(): void {
        if (this.linesElement) {
            this.linesElement.textContent = this.formatNumber(this.state.linesCleared);
        }
    }

    /**
     * Updates UI colors (buttons, score displays, high scores) to match the current level's color scheme
     */
    private updateUIColors(): void {
        const uiColor = getUIColorForLevel(this.state.level, this.settings.theme);
        const buttonColors = getButtonColors(uiColor, this.settings.theme);

        // Update CSS variables on body element (where theme is applied)
        // This ensures our dynamic values override the theme-specific CSS rules
        const body = document.body;
        if (body) {
            body.style.setProperty('--accent-color', buttonColors.base);
            body.style.setProperty('--button-hover', buttonColors.hover);
            body.style.setProperty('--button-active', buttonColors.active);
            body.style.setProperty('--accent-color-contrast', buttonColors.contrast);
            body.style.setProperty('--settings-button-color', buttonColors.base);
        }
    }

    /**
     * Updates the level display in the UI
     */
    private updateLevelDisplay(): void {
        // Calculate number of boxes (one per line to complete level)
        const linesPerLevel = Math.ceil(GAMEPLAY_CONFIG.levelProgressThreshold / GAMEPLAY_CONFIG.levelProgressPerLine);
        const progressBoxes = document.querySelectorAll('.progress-box');
        const filledCount = Math.floor((this.state.levelProgress / GAMEPLAY_CONFIG.levelProgressThreshold) * linesPerLevel);
        
        progressBoxes.forEach((box, index) => {
            if (index < filledCount) {
                box.classList.add('filled');
            } else {
                box.classList.remove('filled');
            }
        });
    }


    /**
     * Debug method: Resets input handler state to fix validation issues
     * Called after autoplace operations
     */
    debugResetInputHandler(): void {
        // Reconstruct board state from placedBlocks to match what's actually rendered
        // This ensures the debug output matches the visual state
        const visualGrid: boolean[][] = Array(8).fill(null).map(() => Array(8).fill(false));
        const boardGrid = this.board.getGrid();
        
        for (const block of this.state.placedBlocks) {
            for (const cell of block.shape) {
                const x = block.position.x + cell.x;
                const y = block.position.y + cell.y;
                if (x >= 0 && x < 8 && y >= 0 && y < 8) {
                    // Only mark as filled if the board also says it's filled (handles cleared cells)
                    if (!this.board.isCellEmpty({ x, y })) {
                        visualGrid[y][x] = true;
                    }
                }
            }
        }
        
        if (this.settings.devMode) {
            console.log('[DEBUG] Current board state (reconstructed from placedBlocks):');
            console.log('  O = empty, X = filled');
            console.log('  ' + '-'.repeat(8));
            for (let y = 0; y < 8; y++) {
                let row = '  ';
                for (let x = 0; x < 8; x++) {
                    row += visualGrid[y][x] ? 'X' : 'O';
                }
                console.log(row);
            }
            console.log('  ' + '-'.repeat(8));
            
            // Also show the actual board grid state for comparison
            console.log('[DEBUG] Board grid state (from board.getGrid()):');
            console.log('  O = empty, X = filled');
            console.log('  ' + '-'.repeat(8));
            for (let y = 0; y < 8; y++) {
                let row = '  ';
                for (let x = 0; x < 8; x++) {
                    row += boardGrid[y][x] ? 'X' : 'O';
                }
                console.log(row);
            }
            console.log('  ' + '-'.repeat(8));
            
            // Check for discrepancies
            let hasDiscrepancy = false;
            for (let y = 0; y < 8; y++) {
                for (let x = 0; x < 8; x++) {
                    if (visualGrid[y][x] !== boardGrid[y][x]) {
                        if (!hasDiscrepancy) {
                            console.log('[DEBUG] DISCREPANCY DETECTED between visual and board grid:');
                            hasDiscrepancy = true;
                        }
                        console.log(`  Cell (${x}, ${y}): visual=${visualGrid[y][x] ? 'X' : 'O'}, board=${boardGrid[y][x] ? 'X' : 'O'}`);
                    }
                }
            }
            if (!hasDiscrepancy) {
                console.log('[DEBUG] Visual grid and board grid match.');
            }
        }
        
        // Also reset input handler state
        this.inputHandler.debugReset();
        // Force board synchronization
        this.inputHandler.updateBoard(this.board);
        this.inputHandler.updateQueue(this.state.queue);
    }

    /**
     * Automatically places all three pieces in the queue using optimal placement order
     */
    autoPlacePieces(): void {
        if (this.state.gameOver || this.isAutoPlacing) {
            return; // Don't allow autoplace if already in progress or game is over
        }

        // Set flag to prevent double-clicking
        this.isAutoPlacing = true;
        this.notifyAutoPlaceStateChanged(true);

        // Find optimal placement order
        const placementOrder = findOptimalPlacementOrder(this.board, this.state.queue);
        
        if (!placementOrder || placementOrder.length === 0) {
            if (this.settings.devMode) {
                console.warn('[AUTO-PLACE] No valid placement order found');
            }
            
            // Check if there are still pieces left in the queue
            const activeQueue = this.state.queue.filter((q): q is Shape => !!q && Array.isArray(q) && q.length > 0);
            if (activeQueue.length > 0) {
                // Force a render to ensure the queue area is redrawn at least once
                // This ensures the visual state matches the actual queue state
                this.render();
            }
            
            // Re-enable button
            this.isAutoPlacing = false;
            this.notifyAutoPlaceStateChanged(false);
            return;
        }

        // Place each shape sequentially, ensuring board state is synchronized after each placement
        // Use a recursive function to ensure each placement completes before starting the next
        const placeNext = (index: number): void => {
            if (index >= placementOrder.length || this.state.gameOver) {
                // All placements complete - re-enable button
                this.isAutoPlacing = false;
                this.notifyAutoPlaceStateChanged(false);
                return;
            }

            const { shapeIndex, position } = placementOrder[index];
            const shape = this.state.queue[shapeIndex];
            
            if (!shape) {
                // Skip to next if shape is missing
                placeNext(index + 1);
                return;
            }

            // Temporarily restore the shape to queue if it was removed
            this.state.queue[shapeIndex] = shape;
            this.inputHandler.updateQueue(this.state.queue);

            // Place the shape directly
            this.placeShapeDirectly(shape, position, shapeIndex);

            // Wait for line clearing animations to complete before placing next shape
            // This ensures board state is fully synchronized
            const delay = this.settings.enableAnimations ? 800 : 200; // Longer delay to ensure cleanup completes
            setTimeout(() => {
                // CRITICAL: Force board synchronization after each autoplace operation
                // The board instance is the same, but we need to ensure the input handler
                // has the latest state. Call updateBoard to trigger re-validation.
                this.inputHandler.updateBoard(this.board);
                this.inputHandler.debugReset(); // Reset any cached validation state
                
                // Force a render to ensure visual state matches board state
                this.render();
                
                placeNext(index + 1);
            }, delay);
        };

        // Start placing shapes
        placeNext(0);
    }

    /**
     * Directly places a shape on the board (used by auto-place)
     */
    private placeShapeDirectly(shape: Shape, position: Position, queueIndex: number): void {
        if (this.state.gameOver) {
            return;
        }

        // Remove shape from queue
        this.state.queue[queueIndex] = null;
        this.inputHandler.updateQueue(this.state.queue);

        const shapeIndexInPool = getShapeIndex(shape);
        const shapeColor = getShapeColor(shapeIndexInPool);
        const basePointValue = getShapePointValue(shapeIndexInPool, 0);

        // Place the shape on the board
        this.board.placeShape(shape, position);

        // Add to placed blocks
        const placedBlock: PlacedBlock = {
            shape,
            position,
            color: shapeColor,
            pointValue: basePointValue,
            lineClearBonuses: 0,
            totalShapesPlacedAtPlacement: this.state.totalShapesPlaced,
            shapeIndex: shapeIndexInPool,
            darkness: 1.0,
        };
        this.state.placedBlocks.push(placedBlock);
        this.soundManager.resumeContext();
        this.soundManager.playPlace();

        this.shapesPlacedThisTurn++;
        this.state.totalShapesPlaced++;
        this.state.turn++;
        this.updateTurnDisplay();

        // Check for full rows and columns
        this.checkAndClearLines();
        
        // Update input handler with current board state (critical for validation after auto-place)
        this.inputHandler.updateBoard(this.board);

        // If required number of shapes have been placed, generate new queue
        if (this.shapesPlacedThisTurn >= GAMEPLAY_CONFIG.shapesPerTurn) {
            this.shapesPlacedThisTurn = 0;
            this.state.queue = this.settings.mode === 'easy'
                ? generateEasyShapes(this.board)
                : generateShapes();
            
            // Validate that queue has 3 valid shapes (should never fail, but safety check)
            const activeQueue = this.state.queue.filter((q): q is Shape => !!q && Array.isArray(q) && q.length > 0);
            if (activeQueue.length !== 3) {
                console.error(`[GAME] Queue generation failed! Expected 3 shapes, got ${activeQueue.length}. Queue:`, this.state.queue);
                // This should never happen, but if it does, trigger game over
                this.triggerGameOver();
                return;
            }
            
            // Update input handler with new queue
            this.inputHandler.updateQueue(this.state.queue);
            
            // Check for game over with the new queue
            const isGameOver = checkGameOver(this.board, activeQueue);
            if (isGameOver) {
                this.triggerGameOver();
            }
        } else {
            // Update input handler with current queue state
            this.inputHandler.updateQueue(this.state.queue);
            
            const activeQueue = this.state.queue.filter((q): q is Shape => !!q && Array.isArray(q) && q.length > 0);
            if (activeQueue.length > 0) {
                const isGameOver = checkGameOver(this.board, activeQueue);
                if (isGameOver) {
                    this.triggerGameOver();
                }
            } else {
                // If queue is empty mid-turn, this shouldn't happen but handle gracefully
                // Wait for next turn when new shapes will be generated
                this.state.gameOver = false;
                this.gameOverStartTime = null;
                this.inputHandler.updateGameOverState(false);
            }
        }

        this.updateScoreDisplay();
    }

    /**
     * Awards bonus points for remaining cells when the game ends, animating them one at a time.
     */
    private awardGameOverBonus(): void {
        // Collect all cells with their positions, point values, and whether they should explode
        const cellsToClear: Array<{
            x: number;
            y: number;
            color: string;
            pointValue: number;
            shouldExplode: boolean;
        }> = [];

        const pulseThreshold = getPulseThreshold(this.settings.mode);

        for (const block of this.state.placedBlocks) {
            // Skip explosion-only blocks - they don't contribute to score
            if (block.explosionOnly) {
                continue;
            }
            
            // Calculate point value for game over bonus: base value + line clear bonuses + increments since placement
            const placementLevel = Math.floor(block.totalShapesPlacedAtPlacement / GAMEPLAY_CONFIG.shapesPerValueTier);
            const currentLevel = Math.floor(this.state.totalShapesPlaced / GAMEPLAY_CONFIG.shapesPerValueTier);
            
            // Each block increments by points per tier for every tier of shapes placed after it was placed
            const levelIncrements = currentLevel - placementLevel;
            const currentPointValue = block.pointValue + block.lineClearBonuses + (levelIncrements * GAMEPLAY_CONFIG.pointsPerTier);
            
            // Check if this block should explode (only blocks OVER pulse threshold explode on game over)
            // Note: Using pulse threshold, not explosion threshold, so only pulsing blocks explode
            const shouldExplode = currentPointValue > pulseThreshold;
            
            if (this.settings.devMode) {
                console.log(`[GAME OVER] Block at (${block.position.x}, ${block.position.y}): pointValue=${block.pointValue}, lineClearBonuses=${block.lineClearBonuses}, levelIncrements=${levelIncrements}, currentPointValue=${currentPointValue}, pulseThreshold=${pulseThreshold}, shouldExplode=${shouldExplode}`);
            }
            
            for (const cell of block.shape) {
                const absoluteX = block.position.x + cell.x;
                const absoluteY = block.position.y + cell.y;
                cellsToClear.push({
                    x: absoluteX,
                    y: absoluteY,
                    color: block.color,
                    pointValue: currentPointValue,
                    shouldExplode: shouldExplode,
                });
            }
        }

        if (cellsToClear.length === 0) {
            this.board.reset();
            this.state.placedBlocks = [];
            this.animatingCells = [];
            return;
        }

        // Shuffle for random order
        for (let i = cellsToClear.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [cellsToClear[i], cellsToClear[j]] = [cellsToClear[j], cellsToClear[i]];
        }

        // Animate and clear cells one at a time
        const POP_DELAY = GAME_OVER_CONFIG.popDelayMs;
        const POP_ANIMATION_DURATION = GAME_OVER_CONFIG.popAnimationDurationMs;
        const EXPLOSION_ANIMATION_DURATION = ANIMATION_CONFIG.explosionMs;

        cellsToClear.forEach((cell, index) => {
            setTimeout(() => {
                // Determine animation type: explosion for pulsing blocks, clear for others
                const animationType = cell.shouldExplode ? 'explosion' : 'clear';
                const animationDuration = cell.shouldExplode ? EXPLOSION_ANIMATION_DURATION : POP_ANIMATION_DURATION;
                
                // Add to animating cells with random animation index (0-9)
                const randomAnimIndex = Math.floor(Math.random() * 10);
                this.animatingCells.push({
                    x: cell.x,
                    y: cell.y,
                    color: cell.color,
                    startTime: Date.now(),
                    progress: 0,
                    type: animationType,
                    animationIndex: randomAnimIndex,
                });

                // Play appropriate sound
                if (cell.shouldExplode) {
                    // Play explosion sound for each explosion (can overlap)
                    this.soundManager.playExplosion();
                } else {
                    // Play pop sound for regular clears
                    this.soundManager.playPop();
                }

                // Add points
                this.state.score += cell.pointValue;
                this.updateScoreDisplay();

                // Remove from board
                this.board.clearCell(cell.x, cell.y);

                // Remove from placed blocks
                this.removeCellFromPlacedBlocks(cell.x, cell.y);

                // Clean up animation after it completes
                setTimeout(() => {
                    this.animatingCells = this.animatingCells.filter(
                        ac => !(ac.x === cell.x && ac.y === cell.y)
                    );
                }, animationDuration);
            }, index * POP_DELAY);
        });

        // Mark popping complete and start fade animation after all pops finish
        // Use the maximum animation duration (explosions take longer)
        const maxAnimationDuration = Math.max(POP_ANIMATION_DURATION, EXPLOSION_ANIMATION_DURATION);
        const totalPopDuration = cellsToClear.length * POP_DELAY + maxAnimationDuration;
        setTimeout(() => {
            this.gameOverPopComplete = true;
            // Start the fade overlay animation now
            this.gameOverStartTime = Date.now();
        }, totalPopDuration);

        // Final cleanup after all animations
        setTimeout(() => {
            // Record the final score for the current mode
            const deviceId = getDeviceId();
            const playerName = (this.settings.playerName || '   ').substring(0, 3).toUpperCase().padEnd(3, ' ');
            const finalScore = this.state.score;
            const mode = this.settings.mode;
            
            recordScore(finalScore, mode, playerName, deviceId).catch((error) => {
                console.warn('Failed to record score:', error);
            });
            
            // Fetch leaderboard ranks for today/week/ever using the rank API
            Promise.all([
                getScoreRankAPI(mode, 'today', finalScore),
                getScoreRankAPI(mode, 'week', finalScore),
                getScoreRankAPI(mode, 'ever', finalScore)
            ]).then(([todayResult, weekResult, everResult]) => {
                this.leaderboardRanks = {
                    today: todayResult?.rank ?? null,
                    week: weekResult?.rank ?? null,
                    ever: everResult?.rank ?? null,
                    todayTotal: todayResult?.total ?? 0,
                    weekTotal: weekResult?.total ?? 0,
                    everTotal: everResult?.total ?? 0
                };
            }).catch((error) => {
                console.warn('Failed to fetch leaderboard ranks:', error);
                this.leaderboardRanks = {
                    today: null,
                    week: null,
                    ever: null,
                    todayTotal: 0,
                    weekTotal: 0,
                    everTotal: 0
                };
            });
            
            this.board.reset();
            this.state.placedBlocks = [];
            this.animatingCells = [];
        }, totalPopDuration);
    }

    /**
     * Removes a specific cell from placed blocks.
     */
    private removeCellFromPlacedBlocks(x: number, y: number): void {
        this.state.placedBlocks = this.state.placedBlocks
            .map(block => {
                const remainingCells = block.shape.filter(cell => {
                    const absoluteX = block.position.x + cell.x;
                    const absoluteY = block.position.y + cell.y;
                    return !(absoluteX === x && absoluteY === y);
                });

                if (remainingCells.length === 0) {
                    return null;
                }

                return {
                    ...block,
                    shape: remainingCells,
                };
            })
            .filter((block): block is PlacedBlock => block !== null);
    }

    /**
     * Transitions the game into the game-over state with audio/visual feedback.
     * If showGameOverDialog is enabled, shows a dialog first before proceeding.
     */
    private triggerGameOver(): void {
        if (this.state.gameOver) {
            return;
        }

        // If dialog is enabled, show it first
        if (this.settings.showGameOverDialog) {
            this.showGameOverDialog();
        } else {
            // Proceed directly with game over
            this.proceedWithGameOver();
        }
    }

    /**
     * Shows the game over dialog and waits for user to press OK
     */
    private showGameOverDialog(): void {
        const dialog = document.getElementById('game-over-dialog');
        const backdrop = document.getElementById('game-over-dialog-backdrop');
        
        if (dialog && backdrop) {
            dialog.setAttribute('aria-hidden', 'false');
            backdrop.setAttribute('aria-hidden', 'false');
            dialog.style.display = 'block';
            backdrop.style.display = 'block';
            
            // Play disappointment sound
            this.soundManager.playDisappointment();
            
            // Fade in the OK button with a delay
            const okButton = document.getElementById('game-over-dialog-ok');
            if (okButton) {
                // Start with opacity 0
                okButton.style.opacity = '0';
                okButton.style.transition = 'opacity 0.5s ease-in';
                
                // Fade in after a brief delay
                setTimeout(() => {
                    okButton.style.opacity = '1';
                    // Focus after fade-in completes
                    setTimeout(() => {
                        okButton.focus();
                    }, 500);
                }, 300);
            }
        }
    }

    /**
     * Hides the game over dialog
     */
    private hideGameOverDialog(): void {
        const dialog = document.getElementById('game-over-dialog');
        const backdrop = document.getElementById('game-over-dialog-backdrop');
        
        if (dialog && backdrop) {
            dialog.setAttribute('aria-hidden', 'true');
            backdrop.setAttribute('aria-hidden', 'true');
            dialog.style.display = 'none';
            backdrop.style.display = 'none';
        }
    }

    /**
     * Proceeds with the actual game over sequence (after dialog is dismissed)
     * Public method so it can be called from main.ts when OK button is clicked
     */
    public proceedWithGameOver(): void {
        // Hide the dialog first
        this.hideGameOverDialog();
        
        this.state.gameOver = true;
        this.gameOverPopComplete = false;
        this.gameOverStartTime = null; // Will be set after popping completes
        
        // Keep the queue visible even during game over (pieces will still be shown but dragging will be prevented)
        // The input handler and placeShapeDirectly will prevent actual placement during game over
        this.inputHandler.updateQueue(this.state.queue);
        this.inputHandler.updateGameOverState(true);
        
        // Reset the player name prompt flag so it can be shown when game over screen appears
        this.playerNamePromptShown = false;
        
        this.soundManager.playGameOver();
        // Start the bonus animation after a brief delay
        setTimeout(() => {
            this.awardGameOverBonus();
        }, GAME_OVER_CONFIG.restartDelayMs);
    }

    /**
     * Determines whether the current clear will remove every remaining block.
     */
    private willBoardBeCleared(fullRows: number[], fullColumns: number[]): boolean {
        if (this.state.placedBlocks.length === 0) {
            return true;
        }

        const clearedRows = new Set(fullRows);
        const clearedCols = new Set(fullColumns);

        for (const block of this.state.placedBlocks) {
            for (const cell of block.shape) {
                const absoluteX = block.position.x + cell.x;
                const absoluteY = block.position.y + cell.y;
                const cleared = clearedRows.has(absoluteY) || clearedCols.has(absoluteX);
                if (!cleared) {
                    return false;
                }
            }
        }

        return true;
    }

    /**
     * Resets the game to initial state
     * Can be forced via UI button even if the round is mid-progress
     */
    reset(force: boolean = false): void {
        if (!force && !this.state.gameOver) {
            if (this.settings.devMode) {
                console.warn('[RESET] Reset called but game is not over - ignoring');
            }
            return;
        }
        
        const context = this.state.gameOver ? 'game over' : 'manual restart';
        if (this.settings.devMode) {
            console.log(`[RESET] Resetting game (${context}). Previous blocks: ${this.state.placedBlocks.length}`);
        }
        this.stop();
        
        // This is the ONLY place where board.reset() should be called
        this.board.reset();
        
        this.state = {
            board: this.board.getGrid(),
            queue: generateShapes(),
            placedBlocks: [],
            score: 0,
            gameOver: false,
            level: 1,
            levelProgress: 0,
            totalShapesPlaced: 0,
            turn: 0,
            linesCleared: 0,
        };
        this.shapesPlacedThisTurn = 0;
        this.inputHandler.updateGameOverState(false);
        this.animatingCells = [];
        this.animatingShapes = [];
        this.gameOverStartTime = null;
        this.gameOverPopComplete = false; // Reset game over pop complete flag
        this.playerNamePromptShown = false; // Reset prompt flag on game reset
        this.isNewHighScore = false;
        this.placementsSinceLastClear = 0; // Reset combo tracking
        this.comboMultiplier = 1.0; // Reset combo multiplier
        this.comboAnimationStartTime = null; // Reset combo animation
        this.comboAnimationType = null;
        this.comboAnimationMultiplier = 0;
        this.comboCount = 0; // Reset combo count
        this.inputHandler.updateBoard(this.board);
        this.inputHandler.updateQueue(this.state.queue);
        this.renderer.updateSettings(this.settings);
        // Reset final board snapshot when game resets
        this.renderer.resetFinalBoardSnapshot();
        // Initialize color scheme for starting level
        updateColorScheme(this.state.level);
        // Initialize UI colors for starting level
        this.updateUIColors();
        this.updateScoreDisplay();
        this.updateTurnDisplay();
        this.updateLinesDisplay();
        this.updateLevelDisplay();
        this.start();
        if (this.settings.devMode) {
            console.log('[RESET] Game reset complete');
        }
    }

    /**
     * Gets the current game state (for debugging or external access)
     * @returns A copy of the current game state
     */
    getState(): GameState {
        return { ...this.state };
    }

    /**
     * Resumes the sound context (for autoplay policy)
     */
    resumeSoundContext(): void {
        this.soundManager.resumeContext();
    }

    /**
     * Checks if a game is currently in session (not game over and has started)
     * @returns true if game is active and in progress
     */
    isGameInSession(): boolean {
        return !this.state.gameOver && (this.state.placedBlocks.length > 0 || this.state.turn > 0);
    }
}
