declare module 'babel-plugin-react-compiler' {
  import type { SourceLocation as BabelSourceLocation } from '@babel/types'

  export interface CompilerErrorDetailOptions {
    severity: ErrorSeverity
    reason: string
    loc?: BabelSourceLocation | symbol
    suggestions?: Array<{
      op: CompilerSuggestionOperation
      description: string
      range: [number, number]
      text: string
    }>
  }

  export enum CompilerSuggestionOperation {
    InsertBefore = 'InsertBefore',
    InsertAfter = 'InsertAfter',
    Replace = 'Replace',
    Remove = 'Remove',
  }

  export enum ErrorSeverity {
    InvalidReact = 'InvalidReact',
    InvalidJS = 'InvalidJS',
    Todo = 'Todo',
  }

  export const OPT_OUT_DIRECTIVES: Set<string>

  export interface PluginOptions {
    noEmit?: boolean
    panicThreshold?: string
    flowSuppressions?: boolean
    environment?: Record<string, unknown>
    logger?: {
      logEvent: (filename: string, event: any) => void
    }
  }

  export function parsePluginOptions(
    options: Record<string, unknown>,
  ): PluginOptions
  export function validateEnvironmentConfig(
    config: Record<string, unknown>,
  ): Record<string, unknown>

  const babelPluginReactCompiler: any
  export default babelPluginReactCompiler
}

declare module 'babel-plugin-react-compiler/src/Entrypoint' {
  export interface Logger {
    logEvent: (filename: string, event: any) => void
  }
}
