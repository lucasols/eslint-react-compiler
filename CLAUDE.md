# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a fork of `eslint-plugin-react-compiler` that adds support for custom Babel plugins. The package is published as `@ls-stack/eprc` on npm.

The main difference from the original is the ability to pass `babelPlugins` and `babelParserPlugins` options to the ESLint rule for handling unsupported syntax.

## Commands

- **Run tests**: `pnpm test`
- **Run tests with UI**: `pnpm test:ui`
- **Run single test**: `pnpm vitest run tests/reactCompiler.test.ts` (or use `.only` in test file)
- **Build**: `pnpm build` (runs tests first)
- **Build without tests**: `pnpm build:no-test`
- **Pre-publish check**: `pnpm pre-publish`

## Architecture

### Entry Point
- `src/main.ts` - Exports `reactCompilerPlugin` as a flat ESLint plugin

### Rule Implementation
- `src/rules/react-compiler.ts` - Main ESLint rule that wraps `babel-plugin-react-compiler`
  - Uses `@babel/parser` to parse TypeScript/TSX files
  - Transforms AST using `babel-plugin-react-compiler` to collect diagnostics
  - Converts compiler diagnostics to ESLint errors with suggestions/fixes
  - Custom options: `babelPlugins`, `babelParserPlugins`, `reportableLevels`, `__unstable_donotuse_reportAllBailouts`

- `src/rules/rules.ts` - Rule registry exporting all rules

### Test Structure
- Tests use `@typescript-eslint/rule-tester` with vitest
- Test files are in `tests/` directory
- Test fixtures in `tests/fixture/`

## Upstream Tracking

When updating from upstream, check: https://github.com/facebook/react/blob/main/compiler/packages/eslint-plugin-react-compiler/src/rules/ReactCompilerRule.ts
