import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
import { logicalClasses, isolateText } from './tools/rtl-rules.mjs';

export default tseslint.config(
  { ignores: ['node_modules/**', 'src/generated/**', 'public/**', 'tests/**', 'scripts/**', 'tools/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks, rtl: { rules: { 'logical-classes': logicalClasses, 'isolate-text': isolateText } } },
    rules: { ...hooks.configs.recommended.rules, 'rtl/logical-classes': 'error', 'rtl/isolate-text': 'error' },
  },
);
