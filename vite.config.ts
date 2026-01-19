import { defineConfig } from 'vite';
import { execSync } from 'child_process';

function getBuildNumber(): string {
  try {
    // Get git commit count (or use timestamp as fallback)
    const count = execSync('git rev-list --count HEAD', { encoding: 'utf-8' }).trim();
    return count || Date.now().toString().slice(-6);
  } catch {
    // Fallback to timestamp if git is not available
    return Date.now().toString().slice(-6);
  }
}

export default defineConfig({
  root: '.',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
  define: {
    'import.meta.env.VITE_BUILD_NUMBER': JSON.stringify(getBuildNumber()),
  },
});

