# rinthel-arch

Write large, detailed diagrams of any project as text (`.dg`) and render them as navigable Views, styled by Themes. Four diagram types: `architecture`, `flow`, `sequence` and `er`.

## Usage

Requires Node 24 or later.

```
npx rinthel-arch dev --workspace .
```

Installed globally (`npm i -g rinthel-arch`), the same CLI answers to `diagrams` and `rinthel-arch`. Do not run `npx diagrams`: that name on npm belongs to an unrelated package.

- `validate`, `build`, `inspect`, `edit`: compile, check and query a Workspace of `.dg` files.
- `dev`: the Dev UI on `http://127.0.0.1:4173/` (canvas, DSL editor, Issues, Themes, History, Activity Log).
- `scan`: read a codebase without running it into a Scan draft for an agent to diagram.

`diagrams <command> --help` lists the options. npm may warn that the `esbuild` install script was not approved; the CLI works without it.

## Links

Documentation, examples and issues: https://github.com/WilliamBarriga/Rinthel-arch

## License

MIT. Third-party notices, including LikeC4 (`LICENSE-LIKEC4`) and elkjs (EPL-2.0), are in `THIRD-PARTY-NOTICES.md`.
