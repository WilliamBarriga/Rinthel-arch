/**
 * `prepararPrototipo(raizDeCache) -> { directorio, pagina }`: extrae la rama del prototipo con `git archive` (sin
 * worktrees), la construye y genera su HTML; se cachea por commit y nunca escribe dentro del repo.
 * Errores: lanza con el comando que fallo; sin red solo falla si faltan dependencias en la cache de pnpm.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const RAMA_DEL_PROTOTIPO = 'prototype/render-hibrido';

/** Variante del prototipo equivalente a cada Tema de la galeria. */
export const VARIANTE_DE_TEMA: Readonly<Record<string, string>> = {
  'soft-card': 'A',
  'glass-chip': 'D',
  neobrutalist: 'G',
  blueprint: 'H',
  'soft-light': 'I',
  'crt-terminal': 'J',
  synthwave: 'K',
  editorial: 'L',
  bauhaus: 'M',
  'sticky-notes': 'N',
  keycaps: 'O',
  'metro-map': 'P',
  pcb: 'Q',
  'pixel-art': 'R',
};

export interface PrototipoPreparado {
  /** Una por commit. */
  directorio: string;
  /** Relativa a `directorio`. */
  pagina: string;
}

const PAGINA = 'prototype-estetica/out/hibrido.html';

function ejecutar(comando: string, args: string[], cwd: string, entrada?: Buffer): void {
  try {
    execFileSync(comando, args, { cwd, stdio: [entrada === undefined ? 'ignore' : 'pipe', 'ignore', 'pipe'], ...(entrada === undefined ? {} : { input: entrada }) });
  } catch (error) {
    const detalle = (error as { stderr?: Buffer }).stderr?.toString().trim() ?? String(error);
    throw new Error(`Fallo \`${comando} ${args.join(' ')}\` en ${cwd}:\n${detalle}`, { cause: error });
  }
}

export function prepararPrototipo(raizDeCache: string, repo: string): PrototipoPreparado {
  const commit = execFileSync('git', ['rev-parse', '--verify', RAMA_DEL_PROTOTIPO], { cwd: repo }).toString().trim();
  const directorio = join(raizDeCache, `prototipo-${commit.slice(0, 12)}`);
  if (existsSync(join(directorio, PAGINA))) return { directorio, pagina: PAGINA };

  mkdirSync(directorio, { recursive: true });
  const tar = execFileSync('git', ['archive', commit], { cwd: repo, maxBuffer: 1 << 30 });
  ejecutar('tar', ['-x', '-C', directorio], repo, tar);
  ejecutar('pnpm', ['install', '--frozen-lockfile', '--ignore-scripts', '--prefer-offline'], directorio);
  ejecutar('pnpm', ['-r', 'build'], directorio);
  // El prototipo lee la Fuente canonica de `.diagrams/canonico.json`.
  ejecutar('node', ['packages/cli/dist/bin.js', 'build', '--workspace', 'examples/rinthel-arch'], directorio);
  ejecutar('node', ['prototype-estetica/hibrido.ts'], directorio);
  return { directorio, pagina: PAGINA };
}
