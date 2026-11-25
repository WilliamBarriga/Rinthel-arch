/**
 * Units: one per manifest folder, plus a root unit, plus `folder` sub-units when a leaf unit is large. Every file
 * belongs to exactly one unit, the deepest whose folder contains it.
 */
import type { ScanUnit } from './draft';
import { byCodeUnit, groupBy } from './collections';
import { languageOf } from './languages';
import { MANIFEST_READERS } from './manifests';
import type { Manifest } from './manifests';

/** A leaf unit owning at least this many files is split into `folder` sub-units up to `depth`. */
export const SPLIT_MIN_FILES = 30;

export interface UnitMap {
  units: ScanUnit[];
  /** Manifests by unit id, in reader priority order. */
  manifests: ReadonlyMap<string, readonly Manifest[]>;
  /** Unit id that owns a path (file or folder, relative to the root). */
  ownerOf(path: string): string;
}

const idOf = (folder: string): string => (folder === '' ? '.' : folder);
const folderOf = (path: string): string => path.slice(0, Math.max(path.lastIndexOf('/'), 0));

export function buildUnits(
  files: readonly string[],
  readText: (path: string) => string | undefined,
  rootName: string,
  depth: number,
): UnitMap {
  const manifests = findManifests(files, readText);
  const ids = new Set<string>(['.', ...manifests.keys()]);

  const ownerOf = (path: string): string => {
    for (let folder = path; ; folder = folderOf(folder)) {
      if (ids.has(idOf(folder))) return idOf(folder);
      if (folder === '') return '.';
    }
  };

  // Split leaf units that own many files into folder sub-units up to `depth` levels below the unit.
  const owned = groupBy(files, (file) => ownerOf(folderOf(file)));
  const leaves = [...ids].filter((id) => ![...ids].some((other) => other !== id && contains(id, other)));
  const folders = new Set<string>();
  for (const id of leaves) {
    const own = owned.get(id) ?? [];
    if (own.length < SPLIT_MIN_FILES || depth < 1) continue;
    const base = id === '.' ? 0 : id.split('/').length;
    for (const file of own) {
      const parts = file.split('/').slice(0, -1);
      for (let level = base + 1; level <= Math.min(base + depth, parts.length); level++) folders.add(parts.slice(0, level).join('/'));
    }
  }
  for (const folder of folders) ids.add(folder);

  const byOwner = groupBy(files, (file) => ownerOf(folderOf(file)));
  const units = [...ids].sort(byCodeUnit).map((id): ScanUnit => {
    const own = byOwner.get(id) ?? [];
    const languages = [...new Set(own.map(languageOf).filter((language) => language !== undefined))].sort(byCodeUnit);
    const parent = id === '.' ? null : ownerOf(folderOf(id));
    const manifest = manifests.get(id)?.[0];
    return {
      id,
      name: manifest?.name ?? unitName(id, rootName),
      kind: manifest?.kind ?? 'folder',
      parent,
      languages,
      files: own.length,
      source: manifest === undefined ? { file: id, line: 0 } : { file: manifest.file, line: 1 },
      confidence: manifest?.readable === true ? 'extracted' : 'inferred',
    };
  });
  return { units, manifests, ownerOf };
}

function findManifests(files: readonly string[], readText: (path: string) => string | undefined): Map<string, Manifest[]> {
  const byFolder = groupBy(files, folderOf);
  const found = new Map<string, Manifest[]>();
  for (const [folder, inFolder] of [...byFolder].sort(([a], [b]) => byCodeUnit(a, b))) {
    const siblings = new Set(inFolder.map((file) => file.slice(file.lastIndexOf('/') + 1)));
    for (const reader of MANIFEST_READERS) {
      if (!siblings.has(reader.file)) continue;
      const file = folder === '' ? reader.file : `${folder}/${reader.file}`;
      const text = readText(file);
      if (text === undefined) continue;
      const manifest: Manifest = { ...reader.read(text, siblings), folder, file, ecosystem: reader.ecosystem };
      found.set(idOf(folder), [...(found.get(idOf(folder)) ?? []), manifest]);
    }
  }
  return found;
}

/** Whether unit `outer` contains unit `inner`. */
function contains(outer: string, inner: string): boolean {
  return outer === '.' ? inner !== '.' : inner.startsWith(`${outer}/`);
}

/** A folder unit's name: its folder's name (the root's own for `.`). */
function unitName(id: string, rootName: string): string {
  return id === '.' ? rootName : id.slice(id.lastIndexOf('/') + 1);
}
