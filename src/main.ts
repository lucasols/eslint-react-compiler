import { TSESLint } from '@typescript-eslint/utils'
import { rules } from './rules/rules'

export const reactCompilerPlugin: TSESLint.FlatConfig.Plugin = {
  rules,
}

export default reactCompilerPlugin
