import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * Flat config, composed from the arrays `eslint-config-next` 16 exports directly.
 *
 * No `FlatCompat` shim: that wrapper is for eslintrc-style configs, and passing
 * a config that is already flat through it fails on a circular plugin
 * reference. Verified against the package's own `exports` map rather than
 * assumed.
 *
 * The `no-restricted-globals` block below is the architectural rule: it stops
 * `fetch` being reintroduced ad hoc in feature or page code, which is how a
 * typed API layer quietly stops being the only way to reach the backend — and
 * with it the CSRF header, cookie forwarding and doc 58 error mapping.
 */
const config = [
  ...nextCoreWebVitals,
  ...nextTypescript,

  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },

  {
    // These files are intentionally CommonJS: they are the legacy static-site
    // server and Node CLI scripts, not code bundled by the Next.js app.
    files: ['server.js', 'dev-static-server.js', 'tools/build.js', 'tools/fetch-images.js', 'tools/build-favicons.js'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    // `debounce` preserves its caller's receiver with Function#apply.
    files: ['js/utils.js'],
    rules: {
      '@typescript-eslint/no-this-alias': 'off',
    },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'warn',
      eqeqeq: ['error', 'always'],
    },
  },

  {
    // Only lib/api may call fetch. Everything else goes through it.
    files: ['src/features/**/*.{ts,tsx}', 'src/ui/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Use lib/api instead — see lib/api/client.ts.' },
      ],
    },
  },
];

export default config;
