/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { transformFromAstSync } from '@babel/core'
import type { SourceLocation as BabelSourceLocation } from '@babel/types'
import { ESLintUtils, TSESTree } from '@typescript-eslint/utils'
import { ReportDescriptor } from '@typescript-eslint/utils/ts-eslint'
import BabelPluginReactCompiler, {
  CompilerErrorDetailOptions,
  CompilerSuggestionOperation,
  ErrorSeverity,
  OPT_OUT_DIRECTIVES,
  type PluginOptions,
  parsePluginOptions,
  validateEnvironmentConfig,
} from 'babel-plugin-react-compiler'
import { Logger } from 'babel-plugin-react-compiler/src/Entrypoint'
import type { Rule } from 'eslint'

type CompilerErrorDetailWithLoc = Omit<CompilerErrorDetailOptions, 'loc'> & {
  loc: BabelSourceLocation
}

function assertExhaustive(_: any, errorMsg: string): never {
  throw new Error(errorMsg)
}

const DEFAULT_REPORTABLE_LEVELS = new Set([
  ErrorSeverity.InvalidReact,
  ErrorSeverity.InvalidJS,
])
let reportableLevels = DEFAULT_REPORTABLE_LEVELS

function isReportableDiagnostic(
  detail: CompilerErrorDetailOptions,
): detail is CompilerErrorDetailWithLoc {
  return (
    reportableLevels.has(detail.severity) &&
    detail.loc != null &&
    typeof detail.loc !== 'symbol'
  )
}

function makeSuggestions(
  detail: CompilerErrorDetailOptions,
): Array<Rule.SuggestionReportDescriptor> {
  let suggest: Array<Rule.SuggestionReportDescriptor> = []
  if (Array.isArray(detail.suggestions)) {
    for (const suggestion of detail.suggestions) {
      switch (suggestion.op) {
        case CompilerSuggestionOperation.InsertBefore:
          suggest.push({
            desc: suggestion.description,
            fix(fixer) {
              return fixer.insertTextBeforeRange(
                suggestion.range,
                suggestion.text,
              )
            },
          })
          break
        case CompilerSuggestionOperation.InsertAfter:
          suggest.push({
            desc: suggestion.description,
            fix(fixer) {
              return fixer.insertTextAfterRange(
                suggestion.range,
                suggestion.text,
              )
            },
          })
          break
        case CompilerSuggestionOperation.Replace:
          suggest.push({
            desc: suggestion.description,
            fix(fixer) {
              return fixer.replaceTextRange(suggestion.range, suggestion.text)
            },
          })
          break
        case CompilerSuggestionOperation.Remove:
          suggest.push({
            desc: suggestion.description,
            fix(fixer) {
              return fixer.removeRange(suggestion.range)
            },
          })
          break
        default:
          assertExhaustive(suggestion, 'Unhandled suggestion operation')
      }
    }
  }
  return suggest
}

const COMPILER_OPTIONS: Partial<PluginOptions> = {
  noEmit: true,
  panicThreshold: 'none',
  // Don't emit errors on Flow suppressions--Flow already gave a signal
  flowSuppressions: false,
}

const createRule = ESLintUtils.RuleCreator(
  (name) => `https://github.com/lucasols/extended-lint#${name}`,
)

const name = 'react-compiler'

type Options = [
  {
    reportableLevels?: Set<ErrorSeverity>
    __unstable_donotuse_reportAllBailouts?: boolean
    babelPlugins?: (string | [string, any])[]
    babelParserPlugins?: string[]
  },
]

const rule = createRule<Options, 'default'>({
  name,
  defaultOptions: [{}],
  meta: {
    type: 'problem',
    docs: {
      description: 'Surfaces diagnostics from React Forget',
    },
    fixable: 'code',
    hasSuggestions: true,
    // validation is done at runtime with zod
    schema: [{ type: 'object', additionalProperties: true }],
    messages: {
      default: '{{message}}',
    },
  },
  create(context) {
    function report(params: {
      message: string
      loc: NonNullable<ReportDescriptor<'default'>['loc']>
      fix?: ReportDescriptor<'default'>['fix']
      suggest?: Rule.SuggestionReportDescriptor[]
    }) {
      const { message, loc, fix, suggest } = params
      context.report({
        messageId: 'default',
        data: { message },
        loc,
        fix,
        suggest: suggest as any,
      })
    }

    // Compat with older versions of eslint
    const sourceCode = context.sourceCode?.text ?? context.getSourceCode().text
    const filename = context.filename ?? context.getFilename()
    const userOpts = context.options[0] ?? {}
    if (
      userOpts['reportableLevels'] != null &&
      userOpts['reportableLevels'] instanceof Set
    ) {
      reportableLevels = userOpts['reportableLevels']
    } else {
      reportableLevels = DEFAULT_REPORTABLE_LEVELS
    }
    /**
     * Experimental setting to report all compilation bailouts on the compilation
     * unit (e.g. function or hook) instead of the offensive line.
     * Intended to be used when a codebase is 100% reliant on the compiler for
     * memoization (i.e. deleted all manual memo) and needs compilation success
     * signals for perf debugging.
     */
    let __unstable_donotuse_reportAllBailouts: boolean = false
    if (
      userOpts['__unstable_donotuse_reportAllBailouts'] != null &&
      typeof userOpts['__unstable_donotuse_reportAllBailouts'] === 'boolean'
    ) {
      __unstable_donotuse_reportAllBailouts =
        userOpts['__unstable_donotuse_reportAllBailouts']
    }

    let shouldReportUnusedOptOutDirective = true
    const options: PluginOptions = {
      ...parsePluginOptions(userOpts),
      ...COMPILER_OPTIONS,
    }
    const userLogger: Logger | null = options.logger ?? null
    options.logger = {
      logEvent: (filename: string, event: any): void => {
        userLogger?.logEvent(filename, event)
        if (event.kind === 'CompileError') {
          shouldReportUnusedOptOutDirective = false
          const detail = event.detail
          const suggest = makeSuggestions(detail)
          if (__unstable_donotuse_reportAllBailouts && event.fnLoc != null) {
            const locStr =
              detail.loc != null && typeof detail.loc !== 'symbol'
                ? ` (@:${detail.loc.start.line}:${detail.loc.start.column})`
                : ''
            /**
             * Report bailouts with a smaller span (just the first line).
             * Compiler bailout lints only serve to flag that a react function
             * has not been optimized by the compiler for codebases which depend
             * on compiler memo heavily for perf. These lints are also often not
             * actionable.
             */
            let endLoc
            if (event.fnLoc.end.line === event.fnLoc.start.line) {
              endLoc = event.fnLoc.end
            } else {
              endLoc = {
                line: event.fnLoc.start.line,
                // Babel loc line numbers are 1-indexed
                column: sourceCode.split(
                  /\r?\n|\r|\n/g,
                  event.fnLoc.start.line,
                )[event.fnLoc.start.line - 1]!.length,
              }
            }
            const firstLineLoc = {
              start: event.fnLoc.start,
              end: endLoc,
            }
            report({
              message: `[ReactCompilerBailout] ${detail.reason}${locStr}`,
              loc: firstLineLoc,
              suggest,
            })
          }

          if (!isReportableDiagnostic(detail)) {
            return
          }
          if (
            hasFlowSuppression(detail.loc, 'react-rule-hook') ||
            hasFlowSuppression(detail.loc, 'react-rule-unsafe-ref')
          ) {
            // If Flow already caught this error, we don't need to report it again.
            return
          }
          const loc =
            detail.loc == null || typeof detail.loc == 'symbol'
              ? event.fnLoc
              : detail.loc
          if (loc != null) {
            report({
              message: detail.reason,
              loc,
              suggest,
            })
          }
        }
      },
    }

    try {
      options.environment = validateEnvironmentConfig(options.environment ?? {})
    } catch (err) {
      options.logger?.logEvent('', err)
    }

    function hasFlowSuppression(
      nodeLoc: BabelSourceLocation,
      suppression: string,
    ): boolean {
      const sourceCode = context.getSourceCode()
      const comments = sourceCode.getAllComments()
      const flowSuppressionRegex = new RegExp(
        '\\$FlowFixMe\\[' + suppression + '\\]',
      )
      for (const commentNode of comments) {
        if (
          flowSuppressionRegex.test(commentNode.value) &&
          commentNode.loc!.end.line === nodeLoc.start.line - 1
        ) {
          return true
        }
      }
      return false
    }

    let babelAST
    if (filename.endsWith('.tsx') || filename.endsWith('.ts')) {
      try {
        const { parse: babelParse } = require('@babel/parser')
        babelAST = babelParse(sourceCode, {
          filename,
          sourceType: 'unambiguous',
          plugins: [
            ...(context.options[0]?.babelParserPlugins ?? []),
            'typescript',
            'jsx',
          ],
        })
      } catch (err) {
        report({
          message: `Failed to parse file: ${
            err instanceof Error ? err.message : err
          }`,
          loc: {
            start: { line: 0, column: 0 },
            end: { line: 0, column: 0 },
          },
        })
      }
    }

    if (babelAST != null) {
      try {
        transformFromAstSync(babelAST, sourceCode, {
          filename,
          highlightCode: false,
          retainLines: true,
          plugins: [
            ...(context.options[0]?.babelPlugins ?? []),
            [BabelPluginReactCompiler, options],
          ],
          sourceType: 'module',
          configFile: false,
          babelrc: false,
        })
      } catch (err) {
        report({
          message: `Babel failed to parse file: ${
            err instanceof Error ? err.message : err
          }`,
          loc: {
            start: { line: 0, column: 0 },
            end: { line: 0, column: 0 },
          },
        })
      }
    }

    function reportUnusedOptOutDirective(stmt: TSESTree.Statement) {
      if (
        stmt.type === 'ExpressionStatement' &&
        stmt.expression.type === 'Literal' &&
        typeof stmt.expression.value === 'string' &&
        OPT_OUT_DIRECTIVES.has(stmt.expression.value) &&
        stmt.loc != null
      ) {
        report({
          message: `Unused '${stmt.expression.value}' directive`,
          loc: stmt.loc,
          suggest: [
            {
              desc: 'Remove the directive',
              fix(fixer) {
                return fixer.remove(stmt as any)
              },
            },
          ],
        })
      }
    }
    if (shouldReportUnusedOptOutDirective) {
      return {
        FunctionDeclaration(fnDecl) {
          for (const stmt of fnDecl.body.body) {
            reportUnusedOptOutDirective(stmt)
          }
        },
        ArrowFunctionExpression(fnExpr) {
          if (fnExpr.body.type === 'BlockStatement') {
            for (const stmt of fnExpr.body.body) {
              reportUnusedOptOutDirective(stmt)
            }
          }
        },
        FunctionExpression(fnExpr) {
          for (const stmt of fnExpr.body.body) {
            reportUnusedOptOutDirective(stmt)
          }
        },
      }
    } else {
      return {}
    }
  },
})

export const reactCompiler = {
  name,
  rule,
}
