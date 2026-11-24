/**
 * Manifest readers: each turns one manifest file into the facts of a unit (name, kind, what it declares). Static text
 * reading only; a manifest is never executed or installed. A new ecosystem is one more entry in `MANIFEST_READERS`.
 */
import type { UnitKind } from './draft';

export interface ManifestFacts {
  /** Undefined when the manifest has no name or cannot be read; the unit then takes its folder's name. */
  name?: string;
  kind: UnitKind;
  /** Package names the manifest declares as dependencies, in the reader's ecosystem. */
  declares: string[];
  /** `false` when the manifest could not be parsed. */
  readable: boolean;
}

export interface ManifestReader {
  /** File name the reader recognizes, for example `package.json`. */
  file: string;
  /** Ecosystem whose package names the manifest declares, for example `npm`. */
  ecosystem: string;
  /** `siblings`: file names next to the manifest. */
  read(text: string, siblings: ReadonlySet<string>): ManifestFacts;
}

/** A manifest found in the repo. */
export interface Manifest extends ManifestFacts {
  /** Folder relative to the root (`''` for the root). */
  folder: string;
  /** Manifest path relative to the root. */
  file: string;
  ecosystem: string;
}

const packageJson: ManifestReader = {
  file: 'package.json',
  ecosystem: 'npm',
  read(text, siblings) {
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { kind: 'package', declares: [], readable: false };
    }
    const declares = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].flatMap((key) => {
      const section = manifest[key];
      return typeof section === 'object' && section !== null ? Object.keys(section) : [];
    });
    const groups = manifest['workspaces'] !== undefined || siblings.has('pnpm-workspace.yaml');
    const exposes = ['exports', 'main', 'module', 'types'].some((key) => manifest[key] !== undefined);
    return {
      ...(typeof manifest['name'] === 'string' && { name: manifest['name'] }),
      kind: groups ? 'module' : exposes ? 'package' : 'app',
      declares,
      readable: true,
    };
  },
};

const pyproject: ManifestReader = {
  file: 'pyproject.toml',
  ecosystem: 'pypi',
  read(text) {
    const sections = tomlSections(text);
    const name = sections.get('project')?.get('name') ?? sections.get('tool.poetry')?.get('name');
    return { ...(name !== undefined && { name }), kind: 'package', declares: [], readable: true };
  },
};

const goMod: ManifestReader = {
  file: 'go.mod',
  ecosystem: 'go',
  read(text) {
    const name = /^\s*module\s+(\S+)/m.exec(text)?.[1];
    return { ...(name !== undefined && { name }), kind: 'module', declares: [], readable: true };
  },
};

const cargoToml: ManifestReader = {
  file: 'Cargo.toml',
  ecosystem: 'crates',
  read(text) {
    const sections = tomlSections(text);
    const name = sections.get('package')?.get('name');
    const kind: UnitKind = name === undefined && sections.has('workspace') ? 'module' : sections.has('bin') ? 'app' : 'package';
    return { ...(name !== undefined && { name }), kind, declares: [], readable: true };
  },
};

/** In priority order: when a folder has several manifests, the first one names the unit. */
export const MANIFEST_READERS: readonly ManifestReader[] = [packageJson, pyproject, goMod, cargoToml];

/**
 * Flat TOML reading, enough for names: `[section]` and `[[section]]` headers, and `key = "string"` lines.
 * Values that are not single-line strings are skipped.
 */
function tomlSections(text: string): Map<string, Map<string, string>> {
  const sections = new Map<string, Map<string, string>>([['', new Map()]]);
  let current = sections.get('') as Map<string, string>;
  for (const line of text.split('\n')) {
    const header = /^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(?:#.*)?$/.exec(line);
    if (header !== null) {
      const name = header[1] as string;
      current = sections.get(name) ?? new Map();
      sections.set(name, current);
      continue;
    }
    const pair = /^\s*([A-Za-z0-9_.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(line);
    if (pair !== null && !current.has(pair[1] as string)) current.set(pair[1] as string, (pair[2] ?? pair[3]) as string);
  }
  return sections;
}
