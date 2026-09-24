import {defineConfig} from "oxlint"

export default defineConfig({
  plugins: ["typescript", "unicorn", "oxc", "import"],
  categories: {
    correctness: "error",
    suspicious: "warn",
    perf: "warn",
  },
  env: {
    builtin: true,
    browser: true,
    node: true,
  },
  ignorePatterns: [".astro/", ".pnpm-store/", "dist/", "node_modules/"],
  options: {
    typeAware: true,
  },
  rules: {
    "import/no-unassigned-import": ["warn", {allow: ["**/*.css"]}],
    "no-underscore-dangle": "off",
    "sort-imports": [
      "error",
      {
        ignoreCase: true,
        ignoreDeclarationSort: true,
      },
    ],
  },
})
