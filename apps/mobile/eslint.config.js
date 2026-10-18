// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'dist-check/*'],
  },
  {
    // The shared package and web app use Array<T> for complex element types; keep one style.
    rules: { '@typescript-eslint/array-type': 'off' },
  },
]);
