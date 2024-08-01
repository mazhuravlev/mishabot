// @ts-check

import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'
import parser from '@typescript-eslint/parser'

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    ...tseslint.configs.strict,
    ...tseslint.configs.stylistic,
    {
        rules: {
            'no-undef': 'off',
            "@typescript-eslint/no-misused-promises": ['error', {
                "checksVoidReturn": false,
            }]
        },
    },
    {
        ignores: [
            'eslint.config.mjs',
            '.lintstagedrc.cjs',
            'dist/',
            'node_modules/',
            'localStorage/',
            'files/',
            'bot-data/',
            '.vscode/'
        ],
    },
    {
        languageOptions: {
            parser,
            parserOptions: {
                project: true,
            }
        },
    },
)