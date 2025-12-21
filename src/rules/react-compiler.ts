/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { ESLintUtils, TSESLint } from '@typescript-eslint/utils'
import {
  CompilerSuggestionOperation,
  PluginOptions,
} from 'babel-plugin-react-compiler'
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
    ignoreCategories?: string[]
    __devOverrideFilename?: string
    __devReturnErrorIfRun?: boolean
    advancedOptions?: Partial<PluginOptions>
  },
]

function getReactCompilerResult(
  sourceCode: { text: string },
  filename: string,
  babelParserPlugins: string[] | undefined,
  babelPlugins: (string | [string, unknown])[] | undefined,
  userOpts: Partial<PluginOptions>,
): RunCacheEntry {
  return runReactCompiler({
    sourceCode,
    filename,
    userOpts,
    babelParserPlugins,
    babelPlugins,
  })
}

type MessageIds = 'default' | 'suggestion'

// Loose match for PascalCase identifiers (potential React components)
const HAS_COMPONENT_REGEX = /\b[A-Z][a-zA-Z0-9]*\s*[=(]/

// Loose match for hook functions (useX pattern)
const HAS_HOOK_REGEX = /\buse[A-Z]/

function shouldProcessFile(sourceText: string): boolean {
  // Check for react imports
  if (sourceText.includes('react')) {
    return true
  }

  // Check for PascalCase function declarations (React components)
  // Matches: function ComponentName or (const|let|var) ComponentName =
  const hasPascalCaseFunction = HAS_COMPONENT_REGEX.test(sourceText)
  if (hasPascalCaseFunction) {
    return true
  }

  // Check for hook functions (useX pattern)
  // Matches: function useX or (const|let|var) useX =
  const hasHook = HAS_HOOK_REGEX.test(sourceText)
  if (hasHook) {
    return true
  }

  return false
}

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
    const filename = userOpts.__devOverrideFilename ?? context.filename

    if (!filename.endsWith('.tsx')) {
      const sourceCode = context.sourceCode ?? context.getSourceCode()
      if (!shouldProcessFile(sourceCode.getText())) {
        return {}
      }
    }

    if (userOpts.__devReturnErrorIfRun) {
      context.report({
        messageId: 'default',
        data: { message: '__devReturnErrorIfRun' },
        loc: { line: 1, column: 0 },
      })
      return {}
    }

    const ignoreReportLevels = new Set(userOpts.ignoreReportLevels ?? [])
    const ignoreCategories = new Set(userOpts.ignoreCategories ?? [])

    const result = getReactCompilerResult(
      context.sourceCode,
      filename,
      userOpts.babelParserPlugins,
      userOpts.babelPlugins,
      userOpts.advancedOptions ?? {},
    )

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

        if (ignoreCategories.has(detail.category)) {
          continue
        }

        context.report({
          messageId: 'default',
          data: {
            message: detail
              .printErrorMessage(result.sourceCode, {
                eslint: true,
              })
              .replace('Error:', `Error(${detail.category}):`),
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
