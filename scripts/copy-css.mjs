import { copyFileSync } from 'node:fs';
copyFileSync('src/styles.css', 'dist/styles.css');
copyFileSync('src/map/worker.js', 'dist/map/worker.js');
copyFileSync('src/notices.txt', 'dist/notices.txt');
