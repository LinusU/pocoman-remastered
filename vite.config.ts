import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

/** The commit being built, so the menus can show which version is running. */
function commit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig(({ command }) => ({
  // Relative paths, so the build works wherever it's hosted, such as under
  // /pocoman-remastered/ on GitHub Pages.
  base: './',
  define: {
    __BUILD__: JSON.stringify(command === 'build' ? { commit: commit(), time: Date.now() } : { commit: 'dev', time: 0 }),
  },
}));
