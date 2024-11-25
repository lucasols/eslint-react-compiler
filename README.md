# Fork of `eslint-plugin-react-compiler`

> [!WARNING]
> This is a fork of the original `eslint-plugin-react-compiler` package to allow custom babel plugins, prefer using the original package if you don't need custom plugins.

## Usage

Custom babel plugins can be passed to the rule using the `babelPlugins` and `babelParserPlugins` options:

```ts
export default {
  rules: {
    'react-compiler/react-compiler': [
      'error',
      {
        babelParserPlugins: ['explicitResourceManagement'],
        babelPlugins: ['@babel/plugin-proposal-explicit-resource-management'],
      },
    ],
  },
}
```
