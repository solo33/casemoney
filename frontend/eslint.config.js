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
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Загрузка API-данных при монтировании — принятый паттерн приложения.
      // Новое compiler-oriented правило ошибочно считает такие эффекты каскадными.
      'react-hooks/set-state-in-effect': 'off',
      // Несколько модулей намеренно экспортируют компонент вместе с константой
      // или хелпером; это безопасно, но ограничивает только Fast Refresh в dev.
      'react-refresh/only-export-components': 'off',
    },
  },
])
