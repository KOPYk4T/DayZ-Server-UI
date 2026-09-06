import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'src-tauri/target']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // React Hooks 7 introduced this rule; it flags the "reset local state
      // when a prop changes" pattern we use in detail drawers and wizards.
      // Those effects are intentional and keyed on specific props, not cascading.
      'react-hooks/set-state-in-effect': 'off',
      // TanStack Table + React Hook Form return functions that can't be
      // safely memoized by the React Compiler. The libraries are aware;
      // treat as warn, not error, so builds pass.
      'react-hooks/incompatible-library': 'warn',
    },
  },
  // shadcn/ui primitives are copy-paste components that legitimately
  // export helpers (cva variants, context hooks) alongside components.
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
