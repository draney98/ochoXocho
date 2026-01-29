# AI Image Generator Prompts for Pixel Art Assets

Use these prompts with an AI image generator (DALL-E, Midjourney, Stable Diffusion, etc.) to create the pixel art sprites needed for the PixiJS migration.

## Block Sprites

### Base Block (White - for tinting)
**File:** `public/sprites/blocks/block-base.png`  
**Size:** 32x32 pixels  
**Prompt:**
```
Pixel art game block tile, 32x32 pixels, flat 2D brick square viewed from above, solid white fill, subtle lighter highlight on top-left edge only (not 3D), dark black outline (2px), retro 8-bit style, transparent background, no anti-aliasing, crisp pixel edges, completely flat top-down view, no perspective, no isometric angles, like a flat brick tile
```

### Explosion-Only Block
**File:** `public/sprites/blocks/block-explosion.png`  
**Size:** 32x32 pixels  
**Prompt:**
```
Pixel art game block tile, 32x32 pixels, gray stone block with bold pixel X mark carved into it, dark black border (2px), retro 8-bit style, looks indestructible and permanent, transparent background, no anti-aliasing, crisp pixel edges
```

### Ghost/Preview Block
**File:** `public/sprites/blocks/block-ghost.png`  
**Size:** 32x32 pixels  
**Prompt:**
```
Pixel art ghost block outline, 32x32 pixels, flat square outline viewed from above, white dashed border only (2px dashed border), no fill, no 3D effects, retro 8-bit style, transparent background, used for piece preview, no anti-aliasing, crisp pixel edges, completely flat 2D appearance
```

## Effect Sprites

### Particle
**File:** `public/sprites/effects/particle.png`  
**Size:** 8x8 pixels  
**Prompt:**
```
Pixel art particle sprite, 8x8 pixels, small white square with soft glow, retro 8-bit style, transparent background, no anti-aliasing, crisp pixel edges
```

### Flash Line
**File:** `public/sprites/effects/flash-line.png`  
**Size:** 256x32 pixels  
**Prompt:**
```
Pixel art horizontal light beam, 256x32 pixels, white to transparent gradient flash effect, retro game line clear celebration, scanline aesthetic, transparent background, no anti-aliasing
```

### Shockwave
**File:** `public/sprites/effects/shockwave.png`  
**Size:** 64x64 pixels  
**Prompt:**
```
Pixel art circular shockwave ring, 64x64 pixels, expanding white ring with transparent center, retro 8-bit game effect, transparent background, no anti-aliasing, crisp pixel edges
```

## UI Sprites

### Level Up Banner
**File:** `public/sprites/ui/level-up.png`  
**Size:** 200x60 pixels  
**Prompt:**
```
Pixel art 'LEVEL UP' text banner, 200x60 pixels, golden yellow pixel font with black outline, retro arcade style, stars around text, transparent background, bold chunky pixels, no anti-aliasing
```

### Game Over Text
**File:** `public/sprites/ui/game-over.png`  
**Size:** 240x80 pixels  
**Prompt:**
```
Pixel art 'GAME OVER' text, 240x80 pixels, red pixel font with white outline, retro arcade style, dramatic, transparent background, bold chunky pixels, no anti-aliasing
```

## Background Sprites

### Grid Tile (Board Background)
**File:** `public/sprites/background/grid-tile.png`  
**Size:** 64x64 pixels (tileable)  
**Prompt:**
```
Pixel art subtle dark grid background texture, 64x64 pixels, tileable, very subtle pattern, retro game board style, dark blue-gray color scheme, transparent or very dark background, no anti-aliasing. This texture will be tiled to fill the entire game board area.
```

**Note:** Combo multiplier messages (x2, x3, x4, x5) are rendered as text in the game, not as sprite images.

## Notes

- All sprites should use **nearest neighbor scaling** (no anti-aliasing)
- Use **transparent backgrounds** (PNG with alpha channel)
- Maintain **crisp pixel edges** - no smoothing
- Colors should match the existing color scheme from the game
- For block-base.png: Make it white so we can tint it to different colors in code
- **IMPORTANT**: All block sprites must be **completely flat 2D** - viewed from directly above (top-down), like flat brick tiles. **NO 3D perspective, NO isometric angles, NO cube corners**. They should look like flat squares/bricks, not 3D cubes.
- All sprites should have a retro 8-bit aesthetic consistent with classic arcade games
