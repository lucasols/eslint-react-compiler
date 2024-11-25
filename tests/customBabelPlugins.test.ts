import { RuleTester } from '@typescript-eslint/rule-tester'
import { fileURLToPath } from 'node:url'
import { reactCompiler } from '../src/rules/react-compiler'

/**
 * A string template tag that removes padding from the left side of multi-line strings
 * @param {Array} strings array of code strings (only one expected)
 */
function normalizeIndent(strings: TemplateStringsArray): string {
  const codeLines = strings[0]!.split('\n')
  const leftPadding = codeLines[1]!.match(/\s+/)![0]
  return codeLines.map((line) => line.slice(leftPadding.length)).join('\n')
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

eslintTester.run('react-compiler', reactCompiler.rule, {
  valid: [
    {
      code: normalizeIndent`
        function Button(props) {
          function onClick() {
            using x = foo();

            return x;
          }

          return <Button thing={onClick} />;
        }
      `,
      options: [
        {
          babelParserPlugins: ['explicitResourceManagement'],
          babelPlugins: ['@babel/plugin-proposal-explicit-resource-management'],
        },
      ],
    },
  ],
  invalid: [
    {
      name: 'Errors are not suppressed',
      code: normalizeIndent`
        function Component(props) {
          const ref = useRef(null);
          const value = ref.current;

          function onClick() {
            using x = foo();

            return x;
          }

          return <Button thing={onClick} value={value} />;
        }
      `,
      errors: [
        {
          message:
            'Ref values (the `current` property) may not be accessed during render. (https://react.dev/reference/react/useRef)',
        },
      ] as any,
      options: [
        {
          babelParserPlugins: ['explicitResourceManagement'],
          babelPlugins: ['@babel/plugin-proposal-explicit-resource-management'],
        },
      ],
    },
  ],
})
