import { build } from "esbuild";

const tanstackRouterStubPlugin = {
  name: "stub-tanstack-router",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^@tanstack\/react-router$/ }, () => ({
      path: "@tanstack/react-router",
      namespace: "stub-tanstack-router",
    }));
    pluginBuild.onLoad({ filter: /.*/, namespace: "stub-tanstack-router" }, () => ({
      contents: "export function createFileRoute() { return (opts) => opts; }",
      loader: "js",
    }));
  },
};

await build({
  entryPoints: ["src/vercel-entry.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  minify: true,
  outfile: "api/_handlers.mjs",
  banner: {
    js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);',
  },
  plugins: [tanstackRouterStubPlugin],
});

console.log("Built self-contained Vercel API bundle: api/_handlers.mjs");
