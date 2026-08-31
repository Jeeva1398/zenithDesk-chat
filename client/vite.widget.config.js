import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Library-mode build for the embeddable widget: a single IIFE script that
// mounts itself into a Shadow DOM root (styles are injected via
// `widget.css?inline` in widget-entry.jsx, not linked separately, since a
// shadow root doesn't pick up page-linked stylesheets on its own).
export default defineConfig({
  plugins: [react()],
  // React's production build reads process.env.NODE_ENV; an IIFE lib build
  // has no Node `process` global at runtime, so it must be inlined at build
  // time or the bundle throws "process is not defined" in the browser.
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: 'src/widget-entry.jsx',
      name: 'ZenithDeskChatWidget',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
  },
});
