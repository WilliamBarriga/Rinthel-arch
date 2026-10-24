/**
 * Prototipo aprobado listo para capturar: extrae la rama `prototype/render-hibrido` a un directorio temporal
 * (`git archive`, sin registrar worktrees), lo instala y construye, y genera su HTML como lo hace el prototipo
 * (`node prototype-estetica/hibrido.ts`). El resultado se cachea por commit.
 *
 * Interfaz: `prepararPrototipo(raizDeCache)` -> `{ directorio, pagina }` (`pagina` es relativa a `directorio`).
 * Invariantes: no escribe dentro del repo. Modo de error: lanza con el comando que fallo; sin red solo
 * falla si faltan dependencias en la cache de pnpm.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/** Rama del prototipo aprobado. */
export const RAMA_DEL_PROTOTIPO = 'prototype/render-hibrido';

/** Variante del prototipo equivalente a cada Tema de la galeria (`T` en `prototype-estetica/hibrido.ts`). */
export const VARIANTE_DE_TEMA: Readonly<Record<string, string>> = {
  'soft-card': 'A',
  'glass-chip': 'D',
  neobrutalist: 'G',
  blueprint: 'H',
  'claro-suave': 'I',
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
  /** Raiz extraida del prototipo (cada commit tiene la suya). */
  directorio: string;
  /** Ruta relativa a `directorio` de la pagina generada. */
  pagina: string;
}

const PAGINA = 'prototype-estetica/out/hibrido.html';

function ejecutar(comando: string, args: string[], cwd: string, entrada?: Buffer): void {
  try {
    execFileSync(comando, args, { cwd, stdio: [entrada === undefined ? 'ignore' : 'pipe', 'ignore', 'pipe'], ...(entrada === undefined ? {} : { input: entrada }) });
  } catch (error) {
    const detalle = (error as { stderr?: Buffer }).stderr?.toString().trim() ?? String(error);
    throw new Error(`Fallo \`${comando} ${args.join(' ')}\` en ${cwd}:\n${detalle}`);
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
  // El prototipo lee la Fuente canonica del ejemplo; `build` la deja en `.diagrams/canonico.json`.
  ejecutar('node', ['packages/cli/dist/bin.js', 'build', '--workspace', 'examples/rinthel-arch'], directorio);
  ejecutar('node', ['prototype-estetica/hibrido.ts'], directorio);
  return { directorio, pagina: PAGINA };
}
