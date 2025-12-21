/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ESLintUtils, TSESLint } from '@typescript-eslint/utils'
import { CompilerSuggestionOperation } from 'babel-plugin-react-compiler'
import { RunCacheEntry, runReactCompiler } from '../shared/runReactCompiler'

type RuleFixer = TSESLint.RuleFixer

function assertExhaustive(_: never, errorMsg: string): never {
  throw new Error(errorMsg)
}

function makeSuggestions(
  suggestions:
    | Array<{
        op: CompilerSuggestionOperation
        range: [number, number]
        description: string
        text?: string
      }>
    | null
    | undefined,
) {
  if (!Array.isArray(suggestions)) {
    return []
  }

  return suggestions.map((suggestion) => {
    switch (suggestion.op) {
      case CompilerSuggestionOperation.InsertBefore:
        return {
          messageId: 'suggestion' as const,
          data: { suggestion: suggestion.description },
          fix: (fixer: RuleFixer) =>
            fixer.insertTextBeforeRange(suggestion.range, suggestion.text!),
        }
      case CompilerSuggestionOperation.InsertAfter:
        return {
          messageId: 'suggestion' as const,
          data: { suggestion: suggestion.description },
          fix: (fixer: RuleFixer) =>
            fixer.insertTextAfterRange(suggestion.range, suggestion.text!),
        }
      case CompilerSuggestionOperation.Replace:
        return {
          messageId: 'suggestion' as const,
          data: { suggestion: suggestion.description },
          fix: (fixer: RuleFixer) =>
            fixer.replaceTextRange(suggestion.range, suggestion.text!),
        }
      case CompilerSuggestionOperation.Remove:
        return {
          messageId: 'suggestion' as const,
          data: { suggestion: suggestion.description },
          fix: (fixer: RuleFixer) => fixer.removeRange(suggestion.range),
        }
      default:
        assertExhaustive(suggestion.op, 'Unhandled suggestion operation')
    }
  })
}

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/lucasols/extended-lint#${name}`,
)

const name = 'react-compiler'

type Options = [
  {
    babelPlugins?: (string | [string, unknown])[]
    babelParserPlugins?: string[]
    /**
     * Which severity levels to ignore (not report).
     * Defaults to empty (report all levels).
     */
    ignoreReportLevels?: ('Error' | 'Warning' | 'Hint' | 'Off')[]
  },
]

function getReactCompilerResult(
  context: Parameters<
    ReturnType<typeof createRule<Options, MessageIds>>['create']
  >[0],
): RunCacheEntry {
  const sourceCode = context.sourceCode ?? context.getSourceCode()
  const filename = context.filename ?? context.getFilename()
  const opts = context.options[0] ?? {}
  // eslint rule options - not passed to the compiler
  const {
    babelParserPlugins,
    babelPlugins,
    ignoreReportLevels: _,
    ...userOpts
  } = opts

  return runReactCompiler({
    sourceCode,
    filename,
    userOpts,
    babelParserPlugins,
    babelPlugins,
  })
}

type MessageIds = 'default' | 'suggestion'

const rule = createRule<Options, MessageIds>({
  name,
  defaultOptions: [{}],
  meta: {
    type: 'problem',
    docs: {
      description: 'Surfaces diagnostics from React Compiler',
    },
    fixable: 'code',
    hasSuggestions: true,
    schema: [{ type: 'object', additionalProperties: true }],
    messages: {
      default: '{{message}}',
      suggestion: '{{suggestion}}',
    },
  },
  create(context) {
    const userOpts = context.options[0] ?? {}
    const ignoreReportLevels = new Set(userOpts.ignoreReportLevels ?? [])

    const result = getReactCompilerResult(context)

    for (const event of result.events) {
      if (event.kind === 'CompileError') {
        const detail = event.detail
        const loc = detail.primaryLocation()

        if (loc == null || typeof loc === 'symbol') {
          continue
        }

        // Skip ignored severity levels
        if (ignoreReportLevels.has(detail.severity)) {
          continue
        }

        context.report({
          messageId: 'default',
          data: {
            message: detail.printErrorMessage(result.sourceCode, {
              eslint: true,
            }),
          },
          loc,
          suggest: makeSuggestions(detail.suggestions),
        })
      }
    }

    return {}
  },
})

export const reactCompiler = {
  name,
  rule,
}
