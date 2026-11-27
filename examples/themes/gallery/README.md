# Example Theme gallery

The Themes of the hybrid prototype (ADR 0008) as a Workspace: the Themes live in `examples/rinthel-arch/themes/` (a single copy, which the gallery takes with `--theme-path`), a common Model (`model.dg`) and one View per Theme (`views.dg`). Everything that changes between Views comes from the Theme.

```
node packages/cli/dist/bin.js dev --workspace examples/themes/gallery --theme-path examples/rinthel-arch/themes
```

Switch Views to compare. Each Theme also has a sequence View (`<theme>-sequence`, the `charge` Interaction with a Fragment and a Note) and an ER View (`<theme>-er`, the tables of the `data` Group); the architecture Views exclude `data`. The Model covers every Node kind, an expanded Group (`platform`) and a collapsed one (`persistence`), Edges with and without a label, Attributes and one Node per state (group `states`: hover, select, navigate with the keyboard).

## Comparing with the prototype (internal use by maintainers)

This section is for whoever maintains the Themes: it needs the repo's `prototype/*` branches and is not required to use the gallery. To see the gallery or capture a Theme, `dev` (above) and `pnpm docs:capturas` are enough.

Each Theme has a reference View, `<theme>-reference`, equivalent to the `open` View of the approved prototype (branch `prototype/render-hibrido`): same Nodes, expanded Groups (`render`, `session`, `layout`), collapsed Groups and Edges. Its Model lives in `reference.dg`, with the prototype's Node kinds (`package`, `module`, `artifact`, plus `actor` and `external`), under the `reference` Group, and the coverage Views exclude it.

```
pnpm build                          # once; the script uses the built CLI
pnpm capturas soft-card             # one Theme: reference View against the prototype `open` View
pnpm capturas --all                 # all Themes
pnpm capturas soft-card glass-chip  # several Themes on a single page
pnpm capturas soft-card coverage    # only the gallery, coverage Model
pnpm capturas --workspace examples/rinthel-arch --view open --prototype A neutral neutral-dark
                                    # another Workspace: its View with each Theme (from the Workspace or built-in), next to a prototype variant
```

The script extracts the prototype to a temporary directory (cached by commit), starts `dev` on this gallery, captures both with Chromium (it waits for the fonts and the shell's `data-layout="listo"` signal) and serves a side-by-side comparison page. It prints `http://localhost:<port>/salida/`; the server stays alive and the next `pnpm capturas` replaces the previous one. The output goes to `$CAPTURAS_DIR` (default `/tmp/rinthel-capturas`, outside the repo). Chromium comes from `$CHROMIUM_PATH` or the Playwright cache. It does not run in `pnpm test`.

## Contents

Themes: `soft-card`, `glass-chip`, `neobrutalist`, `blueprint`, `soft-light`, `crt-terminal`, `synthwave`, `editorial`, `bauhaus`, `sticky-notes`, `keycaps`, `metro-map`, `pcb`, `pixel-art`. The first line of each file, `// Contrast: ...`, lists the Node kinds with a deliberate contrast warning (`none` if there are none) and, if needed, `// Color only: a/b, ...` the pairs of Node kinds the Theme tells apart by color only (`theme-color-only`, like the prototype in glass-chip and metro-map); a test requires these to be the only warnings of each Theme, in its two Views.

## Fonts

`examples/rinthel-arch/themes/fonts/` ships, as `woff2`, every family the prototype uses across all Themes, self-hosted and with no CDN (ADR 0008): Caveat (400, 500, 700), Press Start 2P (400), JetBrains Mono (400, 700), Space Mono (400, 700), Outfit (400, 700), Nunito (600, 800) and Inter (400, 500, 600, 800), plus Gelasio (400, 400 italic, 600, 700) in place of Georgia. Georgia is a system font with a proprietary license that cannot be included; Gelasio (by Eben Sorkin) is its free substitute with compatible metrics, and it is the one `editorial` uses. Futura, Helvetica, SF Pro and the other prototype fonts are system fonts: a Theme expresses them with a generic family (`serif`, `sans-serif`...) or with `fallback`.

Origin: `latin` files from [Fontsource](https://fontsource.org) 5.3.0 (`@fontsource/<family>`, OFL-1.1 license), as is, without subsetting or renaming the font; downloaded on 2026-10-23 (Gelasio, on 2026-10-24) from `https://cdn.jsdelivr.net/fontsource/fonts/<family>@latest/latin-<weight>-normal.woff2`, which serves the same files as the npm package. Each family ships its license, copied from `@fontsource/<family>/LICENSE`, as `OFL-<family>.txt` (copyright of their authors: Caveat, Press Start 2P, JetBrains Mono, Space Mono, Outfit, Nunito, Inter, Gelasio). Authors' repos: [googlefonts/caveat](https://github.com/googlefonts/caveat), [JetBrains/JetBrainsMono](https://github.com/JetBrains/JetBrainsMono), [googlefonts/spacemono](https://github.com/googlefonts/spacemono), [Outfitio/Outfit-Fonts](https://github.com/Outfitio/Outfit-Fonts), [googlefonts/nunito](https://github.com/googlefonts/nunito), [rsms/inter](https://github.com/rsms/inter), [SorkinType/Gelasio](https://github.com/SorkinType/Gelasio); Press Start 2P is by Cody "CodeMan38" Boisclair (Reserved Font Name "Press Start 2P").

A Theme names them in `fonts` and declares the reserve with `fallback`:

```
fonts { body "Caveat"  mono "Caveat"  fallback "cursive" }
```

A family's file is found by name, with the Fontsource convention: `<family-in-kebab>-<subset>-<weight>-<style>.<ext>` (`caveat-latin-700-normal.woff2`; `<Family>.<ext>` also works as weight 400). A non-generic family without a file in the Workspace is the `theme-font-missing` error, located on the Theme, with "did you mean". `dev` serves the files at `/fonts/<path>` (only fonts of the Workspace and of `--theme-path`) and the viewer declares the `@font-face` and measures with the font already loaded. The gallery Themes that use these fonts are `sticky-notes` (Caveat), `pixel-art` (Press Start 2P), `blueprint`, `crt-terminal` and `pcb` (JetBrains Mono), `soft-card`, `glass-chip`, `neobrutalist`, `soft-light` and `metro-map` (Inter), `neobrutalist` (Space Mono), `synthwave` (Outfit), `keycaps` (Nunito) and `editorial` (Gelasio). Where the prototype falls back to a system font (Futura in `bauhaus`, Helvetica in `metro-map`) the Theme names what the browser ends up using: the generic family or the next one in the stack that is in `fonts/`.
