# Sound Files Directory

Place your audio files here to replace the synthesized sounds.

## Supported Formats
- MP3 (`.mp3`) - Recommended for best browser compatibility
- OGG (`.ogg`) - Good compression, good browser support
- WAV (`.wav`) - Uncompressed, larger file size

## File Naming
Update the `file` properties in `src/config.ts` to use your audio files:

- **Place sound**: Set `place.file` to your filename (e.g., `'place.mp3'`)
- **Clear sound**: Set `clear.baseFile` to your filename (e.g., `'clear.mp3'`)
- **Board cleared sound**: Set `clear.boardClearedFile` to your filename (e.g., `'board-cleared.mp3'`)
- **Game over sound**: Set `gameOver.file` to your filename (e.g., `'game-over.mp3'`)
- **Pop sound**: Set `pop.file` to your filename (e.g., `'pop.mp3'`)

## Example
If you have a file named `place.mp3` in this directory, update `src/config.ts`:

```typescript
place: {
    // ... other config
    file: 'place.mp3', // Add this line
},
```

## Fallback Behavior
If an audio file fails to load or is not specified, the game will automatically fall back to the synthesized sound. This ensures the game always has sound effects even if files are missing.

## Recommended Resources
- **Freesound.org**: https://freesound.org (CC0/public domain sounds)
- **OpenGameArt.org**: https://opengameart.org (Free game assets)
- **Kenney.nl**: https://kenney.nl/assets (Free game assets)
- **Mixkit**: https://mixkit.co/free-sound-effects/game/ (Free sound effects)

