/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { RuleTester } from '@typescript-eslint/rule-tester'
import { RuleTester as ESLintTester } from 'eslint'
import { fileURLToPath } from 'node:url'
import { reactCompiler } from '../src/rules/react-compiler'

declare global {
  interface RegExpConstructor {
    escape(str: string): string
  }
}

/**
 * A string template tag that removes padding from the left side of multi-line strings
 * @param {Array} strings array of code strings (only one expected)
 */
function normalizeIndent(strings: TemplateStringsArray): string {
  const codeLines = strings[0]!.split('\n')
  const leftPadding = codeLines[1]!.match(/\s+/)![0]
  return codeLines.map((line) => line.slice(leftPadding.length)).join('\n')
}

type CompilerTestCases = {
  valid: ESLintTester.ValidTestCase[]
  invalid: ESLintTester.InvalidTestCase[]
}

const tests: CompilerTestCases = {
  valid: [
    {
      name: 'Basic example',
      code: normalizeIndent`
        function foo(x, y) {
          if (x) {
            return foo(false, y);
          }
          return [y * 10];
        }
      `,
    },
    // Removed: Violation with Flow suppression - the new compiler version no longer suppresses errors based on Flow comments
    {
      name: 'Unsupported syntax',
      code: normalizeIndent`
        function foo(x) {
          var y = 1;
          return y * x;
        }
      `,
    },
    {
      // OK because invariants are only meant for the compiler team's consumption
      name: '[Invariant] Defined after use',
      code: normalizeIndent`
        function Component(props) {
          let y = function () {
            m(x);
          };

          let x = { a };
          m(x);
          return y;
        }
      `,
    },
    {
      name: "Classes don't throw",
      code: normalizeIndent`
        class Foo {
          #bar() {}
        }
      `,
    },
    // Removed: Flow suppression test - the new compiler version no longer suppresses errors based on Flow comments

    // from ReactCompilerRuleTypescript-test.ts
    {
      name: 'Basic example',
      code: normalizeIndent`
        function Button(props) {
          return null;
        }
      `,
    },
    {
      name: 'Repro for hooks as normal values',
      code: normalizeIndent`
        function Button(props) {
          const scrollview = React.useRef<ScrollView>(null);
          return <Button thing={scrollview} />;
        }
      `,
    },
  ],
  invalid: [
    {
      name: '[InvalidInput] Ref access during render',
      code: normalizeIndent`
        function Component(props) {
          const ref = useRef(null);
          const value = ref.current;
          return value;
        }
      `,
      errors: [
        {
          message: new RegExp(
            RegExp.escape('Cannot access ref value during render'),
          ),
        },
      ],
    },
    {
      name: '[InvalidReact] ESlint suppression',
      // Indentation is intentionally weird so it doesn't add extra whitespace
      code: normalizeIndent`
  function Component(props) {
  // eslint-disable-next-line react-hooks/rules-of-hooks
    return <div>{props.foo}</div>;
  }`,
      errors: [
        {
          message:
            "Definition for rule 'react-hooks/rules-of-hooks' was not found.",
        },
        {
          message: new RegExp(
            RegExp.escape(
              'React Compiler has skipped optimizing this component because one or more React ESLint rules were disabled',
            ),
          ),
          suggestions: [
            {
              desc: 'Remove the ESLint suppression and address the React error',
              output: normalizeIndent`
  function Component(props) {

    return <div>{props.foo}</div>;
  }`,
            },
          ],
        },
      ],
    },
    {
      name: 'Multiple diagnostics are surfaced',
      code: normalizeIndent`
        function Bar(props) {
          props.a.b = 2;
          return <div>{props.c}</div>
        }`,
      errors: [
        {
          message: new RegExp(
            RegExp.escape(
              'Modifying component props or hook arguments is not allowed',
            ),
          ),
        },
      ],
    },
    {
      name: "'use no memo' does not disable eslint rule",
      code: normalizeIndent`
        let count = 0;
        function Component() {
          'use no memo';
          count = count + 1;
          return <div>Hello world {count}</div>
        }
      `,
      errors: [
        {
          message: new RegExp(
            RegExp.escape('`count` cannot be reassigned'),
          ),
        },
      ],
    },

    // from ReactCompilerRuleTypescript-test.ts
    {
      name: 'Mutating useState value',
      code: `
        import { useState } from 'react';
        function Component(props) {
          // typescript syntax that hermes-parser doesn't understand yet
          const x: \`foo\${1}\` = 'foo1';
          const [state, setState] = useState({a: 0});
          state.a = 1;
          return <div>{props.foo}</div>;
        }
      `,
      errors: [
        {
          message: new RegExp(
            RegExp.escape(
              "Modifying a value returned from 'useState()', which should not be modified directly",
            ),
          ),
          line: 7,
        },
      ],
    },
  ],
}

const eslintTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      tsconfigRootDir: fileURLToPath(new URL('./fixture', import.meta.url)),
      project: './tsconfig.json',
      ecmaFeatures: {
        jsx: true,
      },
      ecmaVersion: 2020,
      sourceType: 'module',
    },
  },
})

eslintTester.run('react-compiler', reactCompiler.rule, tests as any)
