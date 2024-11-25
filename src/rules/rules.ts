import { LooseRuleDefinition } from '@typescript-eslint/utils/ts-eslint'
import { reactCompiler } from './react-compiler'

export const rules: Record<string, LooseRuleDefinition> = {
  [reactCompiler.name]: reactCompiler.rule,
}
