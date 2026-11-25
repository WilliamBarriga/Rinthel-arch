/**
 * The per-agent manifests are thin: each one points at the single `skills/` tree at the repo root. Shapes follow each
 * agent's documented schema (consulted 2026-11-24):
 * - Claude Code: https://code.claude.com/docs/en/plugins-reference (`name` required, kebab-case, no reserved prefix;
 *   `skills/` is scanned by default) and https://code.claude.com/docs/en/plugin-marketplaces (`name`, `owner`, `plugins[]`
 *   with `name` + `source`; entry name equals the manifest name).
 * - Codex: https://developers.openai.com/codex/plugins/build (`.codex-plugin/plugin.json` keeps working as a
 *   compatibility fallback, with `skills: "./skills/"`; `.agents/plugins/marketplace.json` entries always carry
 *   `policy.installation`, `policy.authentication` and `category`; local sources are `./`-prefixed and stay inside the root).
 * - Pi: `docs/packages.md` of @earendil-works/pi-coding-agent 1.6.0 (`pi.skills` paths relative to the package root,
 *   keyword `pi-package`).
 * - OpenCode has no plugin format for skills: it reads `.agents/skills` and `.claude/skills` (https://opencode.ai/docs/skills/).
 * Clean-install verification in each agent is left to the launch checklist.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..');

function json<T = Record<string, unknown>>(path: string): T {
  return JSON.parse(readFileSync(join(REPO, path), 'utf8')) as T;
}

const skillNames = readdirSync(join(REPO, 'skills'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && existsSync(join(REPO, 'skills', entry.name, 'SKILL.md')))
  .map((entry) => entry.name)
  .sort();

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const RESERVED = /^(claude|anthropic|anthropics|cc-plugin)-|^(claude|anthropic|anthropics|claude-code|claude-mods)$/;

interface Skill {
  name: string;
  description: string;
}

interface ClaudePlugin extends Skill {
  version: string;
  skills?: unknown;
}

interface ClaudeMarketplace {
  name: string;
  owner: { name: string };
  plugins: { name: string; source: unknown }[];
}

interface CodexPlugin extends Skill {
  version: string;
  skills: string;
  interface: { displayName: string; category: string };
}

interface CodexMarketplace {
  name: string;
  plugins: {
    name: string;
    source: { source: string; path: string };
    policy: { installation: string; authentication: string };
    category: string;
  }[];
}

interface PiPackage {
  name: string;
  version: string;
  keywords: string[];
  files: string[];
  pi: { skills: string[] };
}

describe('the skills tree', () => {
  it('has the two skills, each named like its folder', () => {
    expect(skillNames).toEqual(['rinthel-diagramas', 'rinthel-temas']);
    for (const name of skillNames) expect(readFileSync(join(REPO, 'skills', name, 'SKILL.md'), 'utf8')).toMatch(new RegExp(`^---\\nname: ${name}\\n`));
  });
});

describe('Claude Code manifests', () => {
  const plugin = json<ClaudePlugin>('.claude-plugin/plugin.json');
  const marketplace = json<ClaudeMarketplace>('.claude-plugin/marketplace.json');

  it('plugin.json names the plugin in kebab-case, without a reserved Anthropic name', () => {
    expect(plugin.name).toMatch(KEBAB);
    expect(plugin.name).not.toMatch(RESERVED);
  });

  it('finds the skills in the default skills/ scan (no override that would hide them)', () => {
    expect(plugin.skills).toBeUndefined();
    expect(existsSync(join(REPO, 'skills'))).toBe(true);
  });

  it('marketplace.json lists the plugin from the repo root under the same name', () => {
    expect(marketplace.name).toMatch(KEBAB);
    expect(marketplace.owner.name).not.toBe('');
    expect(marketplace.plugins).toHaveLength(1);
    const entry = marketplace.plugins[0]!;
    expect(entry.name).toBe(plugin.name);
    expect(entry.source).toBe('./');
    expect(existsSync(join(REPO, '.claude-plugin', 'plugin.json'))).toBe(true);
  });
});

describe('Codex manifests', () => {
  const plugin = json<CodexPlugin>('.codex-plugin/plugin.json');
  const marketplace = json<CodexMarketplace>('.agents/plugins/marketplace.json');

  it('plugin.json points at the existing skills folder', () => {
    expect(plugin.skills).toBe('./skills/');
    expect(existsSync(join(REPO, plugin.skills))).toBe(true);
    expect(plugin.name).toMatch(KEBAB);
    expect(plugin.version).not.toBe('');
    expect(plugin.description).not.toBe('');
  });

  it('marketplace.json carries policy and category and a local source inside the repo root', () => {
    expect(marketplace.plugins).toHaveLength(1);
    const entry = marketplace.plugins[0]!;
    expect(entry.name).toBe(plugin.name);
    expect(entry.source).toEqual({ source: 'local', path: './' });
    expect(entry.policy.installation).toMatch(/^(AVAILABLE|INSTALLED_BY_DEFAULT|NOT_AVAILABLE)$/);
    expect(entry.policy.authentication).not.toBe('');
    expect(entry.category).not.toBe('');
    expect(existsSync(join(REPO, '.codex-plugin', 'plugin.json'))).toBe(true);
  });
});

describe('Pi package (npm/package.json)', () => {
  const pkg = json<PiPackage>('npm/package.json');

  it('declares the pi-package keyword and a pi.skills path that the package ships', () => {
    expect(pkg.keywords).toContain('pi-package');
    expect(pkg.pi.skills).toEqual(['./skills']);
    expect(pkg.files).toContain('skills');
  });
});

describe('versions and names', () => {
  it('move together across the Claude, Codex and npm manifests', () => {
    const versions = [json<ClaudePlugin>('.claude-plugin/plugin.json'), json<CodexPlugin>('.codex-plugin/plugin.json'), json<PiPackage>('npm/package.json')].map((m) => m.version);
    expect(new Set(versions).size).toBe(1);
  });

  it('are quoted in the skills as the CLI version to run through npx', () => {
    const version = json<PiPackage>('npm/package.json').version;
    for (const name of skillNames) expect(readFileSync(join(REPO, 'skills', name, 'SKILL.md'), 'utf8')).toContain(`npx -y -p rinthel-arch@${version} diagrams`);
  });
});

describe('install docs', () => {
  const docs = ['README.md', 'README.en.md', 'docs/guide/quick-start.md', 'docs/guia/quick-start.md'];

  it('give the install command of each agent', () => {
    for (const path of docs) {
      const text = readFileSync(join(REPO, path), 'utf8');
      expect(text, path).toContain('claude plugin install rinthel-arch --marketplace WilliamBarriga/Rinthel-arch');
      expect(text, path).toContain('codex plugin marketplace add WilliamBarriga/Rinthel-arch');
      expect(text, path).toContain('npx skills add WilliamBarriga/Rinthel-arch -a opencode -g');
      expect(text, path).toContain('pi install npm:rinthel-arch');
    }
  });

  it('never suggest `npx diagrams` (that npm name is an unrelated package)', () => {
    for (const path of [...docs, 'docs/guide/cli.md', 'docs/guia/cli.md', ...skillNames.map((n) => `skills/${n}/SKILL.md`)]) {
      expect(readFileSync(join(REPO, path), 'utf8'), path).not.toMatch(/npx\s+(-y\s+)?diagrams\b/);
    }
  });
});
