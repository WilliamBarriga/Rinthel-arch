# Scanner dependencies: web-tree-sitter, grammars and ignore

Research for ticket #236 (Scanner tracer bullet, spec #226). Question: which third-party packages does the `scanner` package adopt to read TS/JS imports and honor `.gitignore`, do the published grammars work with the chosen `web-tree-sitter`, and how does WASM compare with the native binding on a large repo. Builds on `research/escaner-codebases`, which already chose `web-tree-sitter` over graphify, codegraph, dependency-cruiser and ast-grep.

Date: 2026-11-24. Metadata from `npm view <package>` and `gh api repos/<repo>` that day. Measurements on this machine (Linux, Node 24.20.0).

## Conclusion

- Adopt `web-tree-sitter` 0.27.2 (MIT, 0 dependencies, WASM, no native build) and take only the `.wasm` files of `tree-sitter-typescript` 0.23.2 (MIT): `tree-sitter-typescript.wasm` for `.ts/.mts/.cts` and `tree-sitter-tsx.wasm` for `.tsx` and every JS extension. No separate JavaScript grammar: the TSX grammar reads plain JS and JSX without errors.
- The grammar packages carry native install scripts (`node-gyp-build`) and a peer on the native `tree-sitter`; the scanner never loads them natively, so `pnpm-workspace.yaml` sets `allowBuilds: false` for `tree-sitter-typescript` and `tree-sitter-javascript` (its transitive dependency). pnpm did not auto-install the native peer.
- ABI: verified. `web-tree-sitter` 0.27.2 loads the TS and TSX grammars (ABI 14, published 2024-11) and `tree-sitter-javascript` 0.25.0 and `tree-sitter-python` 0.25.0 (ABI 15). Python (#237) can use `tree-sitter-python` 0.25.0 the same way.
- WASM vs native on a large repo: within about 10% in time and with less than half the memory, so WASM is the choice (it also ships one artifact for every platform).
- Adopt `ignore` 7.0.16 (MIT, 0 dependencies, 134 KB unpacked) for `.gitignore` semantics; the same matcher serves `.rinthel/scan-ignore` in #240. Hand-written matching was rejected: gitignore rules (anchoring, `**`, directory-only patterns, escapes) are easy to get subtly wrong.
- No TOML parser: the scanner only needs `name` from `pyproject.toml` and `Cargo.toml`, read with a flat line reader. Revisit (for example `smol-toml`, BSD-3-Clause) if #237 needs dependency arrays.

## Candidates

| Package | Version | License | Dependencies | Last publish | Notes |
|---|---|---|---|---|---|
| `web-tree-sitter` | 0.27.2 | MIT | none | 2026-11-07 | 4.7 MB unpacked, 206 KB runtime `.wasm`; repo `tree-sitter/tree-sitter`, push 2026-11-24, ~27.6k stars |
| `tree-sitter-typescript` | 0.23.2 | MIT | `node-addon-api`, `node-gyp-build`, `tree-sitter-javascript` | 2024-11-11 | ships `tree-sitter-typescript.wasm` (1.41 MB) and `tree-sitter-tsx.wasm` (1.45 MB); 43 MB unpacked with native prebuilds |
| `tree-sitter-javascript` | 0.25.0 | MIT | native as above | 2026-05-18 | `.wasm` 412 KB; not needed (TSX grammar covers JS) |
| `tree-sitter-python` | 0.25.0 | MIT | native as above | - | `.wasm` 458 KB; for #237 |
| `tree-sitter` (native) | 0.25.1 | MIT | `node-addon-api`, `node-gyp-build` | - | prebuilt binaries; 0.25.0 failed to build here without a toolchain |
| `ignore` | 7.0.16 | MIT (npm; GitHub reports NOASSERTION, the repo has `LICENSE-MIT`) | none | 2026-11-17 | used by ESLint and Prettier; repo push 2026-11-17 |

## Measurements

Benchmark repo: a local clone of `likec4/likec4` (TS monorepo, commit `33dbc2d`), 6758 TS/JS files (19.2 MB, `.d.ts` excluded) out of 7459 tracked files.

Parse plus import query over every TS/JS file (same query, same files, two runs each):

| Runtime | Grammar load | Parse + query | RSS |
|---|---|---|---|
| `web-tree-sitter` 0.27.2 (WASM) | 46 ms | 2.13 s / 2.15 s | 165 MB |
| `tree-sitter` 0.25.1 (native) | 39 ms | 1.93 s / 1.91 s | 422 MB |

Both found the same 18491 import captures.

Whole `scan` (listing with `.gitignore`, manifests, parsing, aggregation), three runs on the same repo: 3.3-4.0 s, ~165 MB RSS, 7433 files listed, 174 units, 488 dependencies, 162 externals, a 462 KB draft; two runs byte-identical. On this repo (661 files): 1.2 s, 111 MB.

## Sources

- `npm view web-tree-sitter`, `npm view tree-sitter-typescript`, `npm view tree-sitter-javascript`, `npm view tree-sitter-python`, `npm view tree-sitter versions`, `npm view ignore` (2026-11-24).
- `gh api repos/tree-sitter/tree-sitter`, `gh api repos/tree-sitter/tree-sitter-typescript`, `gh api repos/kaelzhang/node-ignore`.
- Own scripts: grammar load and parse check per `.wasm`, and a parse benchmark over `git ls-files` of the benchmark repo, WASM and native in separate processes.
