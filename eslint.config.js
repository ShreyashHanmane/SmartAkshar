import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'coverage',
      'node_modules',
      '.npm-cache',
      'data',
      '.tmp-test',
      'playwright-report',
      'test-results',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Leading underscore marks parameters kept for a stable signature.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Render untrusted content as text, or sanitize it with DOMPurify first (CLAUDE.md §7.4).',
        },
        {
          selector: 'AssignmentExpression[left.property.name=/^(innerHTML|outerHTML)$/]',
          message: 'Do not assign innerHTML/outerHTML (CLAUDE.md §7.4).',
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Talk to the server through src/data only (CLAUDE.md §8).' },
        { name: 'XMLHttpRequest', message: 'Talk to the server through src/data only (CLAUDE.md §8).' },
        { name: 'EventSource', message: 'Talk to the server through src/data only (CLAUDE.md §8).' },
      ],
    },
  },
  {
    files: ['src/data/**/*.ts', 'tests/**/*.ts', 'server/**/*.ts', 'scripts/**/*.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
);
