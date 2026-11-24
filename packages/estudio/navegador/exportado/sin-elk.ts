/**
 * Stands in for `elkjs/lib/elk.bundled.js` in the export page (`src/construir.ts`): ELK goes once in the file, inside
 * the layout Worker code, and the page always lays out through it (`layout.ts`).
 */
export default class SinElk {
  constructor() {
    throw new Error('The export page lays out through the layout Worker code');
  }
}
