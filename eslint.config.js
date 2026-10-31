import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        __APP_VERSION__: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
  {
    // La app lee y escribe Firestore por services/readMeter.js, que cuenta
    // cada petición en el registro de lecturas.
    files: ['src/**/*.{js,jsx}'],
    ignores: ['src/services/readMeter.js', 'src/**/*.test.js'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{
          name: 'firebase/firestore',
          importNames: [
            'getDocs', 'getDoc', 'getCountFromServer', 'getAggregateFromServer', 'getDocsFromServer',
            'getDocFromServer', 'onSnapshot', 'runTransaction', 'setDoc', 'updateDoc', 'addDoc',
            'deleteDoc', 'writeBatch',
          ],
          message: 'Se importa de services/readMeter.js, que la cuenta en el registro de lecturas.',
        }],
      }],
    },
  },
])
