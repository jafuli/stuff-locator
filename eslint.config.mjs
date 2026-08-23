import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";
import jsxA11y from "eslint-plugin-jsx-a11y";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // eslint-config-next already registers the jsx-a11y plugin and enables a
  // handful of its rules; pulling in flatConfigs.recommended wholesale
  // re-registers the same plugin instance and errors. Layer in just the
  // rules jsx-a11y's recommended preset adds beyond Next's subset — the repo's
  // Definition of Done (keyboard nav, semantic HTML) wants the fuller set.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access -- eslint-plugin-jsx-a11y ships no type declarations
  { rules: jsxA11y.flatConfigs.recommended.rules },
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          // Root-level *.config.mjs files aren't part of tsconfig.json's
          // `include` (and shouldn't be — they run under Node, not the app's
          // DOM lib). Let typescript-eslint lint them without type info
          // instead of erroring that they're outside the project.
          allowDefaultProject: ["*.config.mjs"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // src/lib/database.types.ts mirrors `supabase gen types typescript`
    // output, which doesn't follow (and shouldn't be hand-edited to follow)
    // this repo's stylistic rules. Real generated output gets the same
    // treatment once it replaces this placeholder.
    files: ["src/lib/database.types.ts"],
    rules: {
      "@typescript-eslint/consistent-type-definitions": "off",
      "@typescript-eslint/consistent-indexed-object-style": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
