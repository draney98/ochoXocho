import { defineConfig } from 'vite';
import { execSync } from 'child_process';

function getBuildNumber(): string {
  // Try commit count first (works if full git history is available)
  try {
    const count = execSync('git rev-list --count HEAD', { encoding: 'utf-8' }).trim();
    if (count && !isNaN(parseInt(count)) && parseInt(count) > 0) {
      return count;
    }
  } catch {
    // Commit count failed, try SHA
  }
  
  // Use short commit SHA (works even with shallow clones on Render)
  // This will be unique for each deployment and change with each commit
  try {
    const sha = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim();
    if (sha) {
      return sha;
    }
  } catch {
    // Git not available
  }
  
  // Final fallback: timestamp (last 6 digits)
  return Date.now().toString().slice(-6);
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

