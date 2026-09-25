import { defineConfig } from 'vite';

export default defineConfig({
  // Relative output paths make the same build work at
  // https://USER.github.io/REPOSITORY/ and at a custom domain.
  base: './',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsDir: 'build-assets',
    sourcemap: false,
    target: 'es2020'
  }
});
