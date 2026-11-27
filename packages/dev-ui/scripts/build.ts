/**
 * `pnpm --filter dev-ui build` (after tsup): regenerates the editor keywords from the grammar and leaves the app
 * static assets in `dist/dev-ui/`.
 */
import { fileURLToPath } from 'node:url';

import { buildDevUi } from '../src/build.ts';
import { generateKeywords } from './keywords.ts';

generateKeywords();
await buildDevUi({ output: fileURLToPath(new URL('../dist/dev-ui/', import.meta.url)) });
