/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { transformFromAstSync } from '@babel/core'
// @ts-expect-error: no types available
import { parse as babelParse } from '@babel/parser'
import { File } from '@babel/types'
import BabelPluginReactCompiler, {
  LoggerEvent,
  parsePluginOptions,
  validateEnvironmentConfig,
  type PluginOptions,
} from 'babel-plugin-react-compiler'
// @ts-expect-error: no types available
import type { ParseResult } from '@babel/parser'

const COMPILER_OPTIONS: PluginOptions = {
  noEmit: true,
  panicThreshold: 'none',
  environment: validateEnvironmentConfig({
    validateRefAccessDuringRender: true,
    validateNoSetStateInRender: true,
    validateNoSetStateInEffects: true,
    validateNoJSXInTryStatements: true,
    validateNoImpureFunctionsInRender: true,
    validateStaticComponents: true,
    validateNoFreezingKnownMutableFunctions: true,
    validateNoVoidUseMemo: true,
    // TODO: remove, this should be in the type system
    validateNoCapitalizedCalls: [],
    validateHooksUsage: true,
    validateNoDerivedComputationsInEffects: true,
  }),
}

export type RunCacheEntry = {
  sourceCode: string
  filename: string
  userOpts: Partial<PluginOptions>
  events: Array<LoggerEvent>
}

type RunParams = {
  sourceCode: { text: string }
  filename: string
  userOpts: Partial<PluginOptions>
  babelParserPlugins?: string[]
  babelPlugins?: (string | [string, unknown])[]
}

export function runReactCompiler({
  sourceCode,
  filename,
  userOpts,
  babelParserPlugins,
  babelPlugins,
}: RunParams): RunCacheEntry {
  const options: PluginOptions = parsePluginOptions({
    ...COMPILER_OPTIONS,
    ...userOpts,
    environment: {
      ...COMPILER_OPTIONS.environment,
      ...(userOpts.environment ?? {}),
    },
  })
  const results: RunCacheEntry = {
    sourceCode: sourceCode.text,
    filename,
    userOpts,
    events: [],
  }
  const userLogger = options.logger
  options.logger = {
    logEvent: (eventFilename, event): void => {
      userLogger?.logEvent(eventFilename, event)
      results.events.push(event)
    },
  }

  try {
    options.environment = validateEnvironmentConfig(options.environment ?? {})
  } catch (err: unknown) {
    options.logger?.logEvent(filename, err as LoggerEvent)
  }

  let babelAST: ParseResult<File> | null = null
  if (filename.endsWith('.tsx') || filename.endsWith('.ts')) {
    try {
      babelAST = babelParse(sourceCode.text, {
        sourceFilename: filename,
        sourceType: 'unambiguous',
        plugins: [...(babelParserPlugins ?? []), 'typescript', 'jsx'],
      })
    } catch {
      /* empty */
    }
  }

  if (babelAST != null) {
    try {
      transformFromAstSync(babelAST, sourceCode.text, {
        filename,
        highlightCode: false,
        retainLines: true,
        plugins: [
          ...(babelPlugins ?? []),
          [BabelPluginReactCompiler, options],
        ],
        sourceType: 'module',
        configFile: false,
        babelrc: false,
      })
    } catch (err) {
      /* errors handled by injected logger */
    }
  }

  return results
}
