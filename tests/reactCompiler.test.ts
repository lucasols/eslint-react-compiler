import { reactCompiler } from '../src/rules/react-compiler'
import { createTester } from './utils/createTester'

// Helper function to normalize indentation
function normalizeIndent(strings: TemplateStringsArray, ...values: any[]) {
  const raw = String.raw({ raw: strings }, ...values)
  const lines = raw.split('\n')
  const firstNonEmptyLine = lines.find((line) => line.trim().length > 0)
  if (!firstNonEmptyLine) return raw

  const indent = firstNonEmptyLine.match(/^\s*/)?.[0].length || 0
  return lines
    .map((line) => line.slice(indent))
    .join('\n')
    .trim()
}

const tests = createTester(reactCompiler, {
  defaultErrorId: 'default',
})

// Valid test cases
tests.addValid(
  'Basic example',
  normalizeIndent`
    function foo(x, y) {
      if (x) {
        return foo(false, y);
      }
      return [y * 10];
    }
  `,
)

tests.addValid(
  'Violation with Flow suppression',
  `
    // Valid since error already suppressed with flow.
    function useHookWithHook() {
      if (cond) {
        // $FlowFixMe[react-rule-hook]
        useConditionalHook();
      }
    }
  `,
)

tests.addValid(
  'Basic example with component syntax',
  normalizeIndent`
    export default component HelloWorld(
      text: string = 'Hello!',
      onClick: () => void,
    ) {
      return <div onClick={onClick}>{text}</div>;
    }
  `,
)

// Add remaining valid test cases...
tests.addValid(
  'Unsupported syntax',
  normalizeIndent`
    function foo(x) {
      var y = 1;
      return y * x;
    }
  `,
)

tests.addValid(
  '[Invariant] Defined after use',
  normalizeIndent`
    function Component(props) {
      let y = function () {
        m(x);
      };

      let x = { a };
      m(x);
      return y;
    }
  `,
)

tests.addValid(
  "Classes don't throw",
  normalizeIndent`
    class Foo {
      #bar() {}
    }
  `,
)

tests.addValid(
  '[InvalidInput] Ref access during render with Flow suppression',
  normalizeIndent`
    function Component(props) {
      const ref = useRef(null);
      // $FlowFixMe[react-rule-unsafe-ref]
      const value = ref.current;
      return value;
    }
  `,
)

// Invalid test cases
tests.addInvalid(
  '[InvalidInput] Ref access during render',
  normalizeIndent`
    function Component(props) {
      const ref = useRef(null);
      const value = ref.current;
      return value;
    }
  `,
  [
    {
      message:
        'Ref values (the `current` property) may not be accessed during render. (https://react.dev/reference/react/useRef)',
    },
  ],
)

tests.addInvalid(
  'Reportable levels can be configured',
  normalizeIndent`
    function Foo(x) {
      var y = 1;
      return <div>{y * x}</div>;
    }
  `,
  [
    {
      message:
        '(BuildHIR::lowerStatement) Handle var kinds in VariableDeclaration',
    },
  ],
  {
    options: [{ reportableLevels: new Set(['Todo']) }],
  },
)

// Add remaining invalid test cases...
tests.addInvalid(
  '[InvalidReact] ESlint suppression',
  normalizeIndent`
    function Component(props) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
      return <div>{props.foo}</div>;
    }
  `,
  [
    {
      message:
        'React Compiler has skipped optimizing this component because one or more React ESLint rules were disabled. React Compiler only works when your components follow all the rules of React, disabling them may result in unexpected or incorrect behavior',
    },
    {
      message:
        "Definition for rule 'react-hooks/rules-of-hooks' was not found.",
    },
  ],
)

tests.addInvalid(
  'Multiple diagnostics are surfaced',
  normalizeIndent`
    function Foo(x) {
      var y = 1;
      return <div>{y * x}</div>;
    }
    function Bar(props) {
      props.a.b = 2;
      return <div>{props.c}</div>
    }
  `,
  [
    {
      message:
        '(BuildHIR::lowerStatement) Handle var kinds in VariableDeclaration',
    },
    {
      message:
        'Mutating component props or hook arguments is not allowed. Consider using a local variable instead',
    },
  ],
  {
    options: [
      {
        reportableLevels: new Set(['Todo', 'InvalidReact']),
      },
    ],
  },
)

// Add remaining invalid test cases...
tests.addInvalid(
  "'use no forget' does not disable eslint rule",
  normalizeIndent`
    let count = 0;
    function Component() {
      'use no forget';
      count = count + 1;
      return <div>Hello world {count}</div>
    }
  `,
  [
    {
      message:
        'Unexpected reassignment of a variable which was defined outside of the component. Components and hooks should be pure and side-effect free, but variable reassignment is a form of side-effect. If this variable is used in rendering, use useState instead. (https://react.dev/reference/rules/components-and-hooks-must-be-pure#side-effects-must-run-outside-of-render)',
    },
  ],
)

tests.run()
