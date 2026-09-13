import tseslint from 'typescript-eslint';
export default tseslint.config({ ignores: ['src/map/worker.js'] }, ...tseslint.configs.recommended);
