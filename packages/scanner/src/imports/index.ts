import type { ImportExtractor } from './extractor';
import { typescriptImports } from './typescript';

export type { FoundImport, ImportContext, ImportExtractor, ImportTarget, ReadImports } from './extractor';

/** Languages not covered here yield units without import dependencies and show in `limits.languagesWithoutImports`. */
export const IMPORT_EXTRACTORS: readonly ImportExtractor[] = [typescriptImports];
