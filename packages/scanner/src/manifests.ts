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
    return { ...(name !== undefined && { name }), kind: 'package', declares: pyprojectDeclares(text), readable: true };
  },
};

/** Canonical package name: PEP 503 for `pypi` (case-insensitive, runs of `-_.` equal), unchanged elsewhere. */
export function normalizePackage(ecosystem: string, name: string): string {
  return ecosystem === 'pypi' ? name.toLowerCase().replace(/[-_.]+/g, '-') : name;
}

/** `project.dependencies` and optional-dependencies arrays (PEP 508 strings), plus Poetry's dependency tables. */
function pyprojectDeclares(text: string): string[] {
  const names: string[] = [];
  let section = '';
  let inArray = false;
  for (const line of text.split('\n')) {
    const header = /^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(?:#.*)?$/.exec(line);
    if (!inArray && header !== null) {
      section = header[1] as string;
      continue;
    }
    const wanted = section === 'project' || section === 'project.optional-dependencies';
    const start = /^\s*(?:dependencies|[\w.-]+)\s*=\s*\[(.*)$/.exec(line);
    if (wanted && !inArray && start !== null && (section === 'project.optional-dependencies' || /^\s*dependencies\b/.test(line))) {
      inArray = true;
      collect(start[1] as string);
    } else if (inArray) collect(line);
    if (inArray && line.includes(']')) inArray = false;
    if (/^tool\.poetry\.(?:group\.[\w-]+\.)?(?:dev-)?dependencies$/.test(section)) {
      const key = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)\s*=/.exec(line)?.[1];
      if (key !== undefined && key.toLowerCase() !== 'python') names.push(key);
    }
  }
  return names;

  function collect(fragment: string): void {
    for (const match of fragment.replace(/#.*/, '').matchAll(/["']\s*([A-Za-z0-9][A-Za-z0-9._-]*)/g)) names.push(match[1] as string);
  }
}

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
