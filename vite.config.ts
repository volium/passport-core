import { defineConfig } from 'vite';
export default defineConfig({ publicDir: process.env.MAP_FIXTURE_DIR || 'tests/browser/public', server: {host:'127.0.0.1',port:4174} });
