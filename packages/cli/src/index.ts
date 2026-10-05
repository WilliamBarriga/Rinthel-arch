/**
 * `cli` — comandos `validate`, `build` y `export`.
 *
 * Interfaz: `run(argv, dependencias?) -> { exitCode, stdout, stderr }`. No
 * escribe en el proceso: el binario (`bin.ts`) imprime el resultado.
 *
 * Invariantes: unico paquete con I/O de disco (lee Workspace, escribe en
 * `<workspace>/.diagrams/`); `validate` nunca reescribe y devuelve todos los
 * issues en una pasada, ordenados (archivo, linea, columna, codigo).
 * `validate --workspace <ruta> [--json] [--max-issues N] [--strict]`:
 * - `--json`: stdout es exactamente un objeto `salidaDeValidateSchema`
 *   (ADR 0008), sin texto extra; `summary` cuenta todos los issues y
 *   `truncated` indica que `issues` se corto en `--max-issues` (100 por defecto).
 * - Codigos de salida: 0 sin errores, 1 hay errores (con `--strict`, tambien
 *   avisos), 2 fallo de uso o interno (mensaje en stderr, stdout vacio).
 * Modos de error: issues como datos; fallo de uso -> stderr + codigo 2.
 * Configuracion requerida: `--workspace <ruta>`. Solo importa paquetes
 * anteriores en la cadena `canonico -> dsl -> layout -> render -> shell / cli`.
 */
import { salidaDeValidateSchema } from 'canonico';
import { compile } from 'dsl';
import type { ResultadoDeCompilacion } from 'dsl';
import { parseArgs } from 'node:util';

import { informe, textoLegible } from './validate';
import { leerWorkspace } from './workspace';

export const paquete = 'cli';

export interface ResultadoDeEjecucion {
  exitCode: 0 | 1 | 2;
  stdout: string;
  stderr: string;
}

/** Dependencias que entran como argumento; por defecto, las reales. */
export interface Dependencias {
  compilar?: (workspace: Record<string, string>) => ResultadoDeCompilacion;
  leer?: (raiz: string) => Record<string, string>;
}

const MAX_ISSUES_POR_DEFECTO = 100;

function uso(mensaje: string): ResultadoDeEjecucion {
  return { exitCode: 2, stdout: '', stderr: `${mensaje}\n` };
}

export async function run(
  argv: readonly string[],
  { compilar = compile, leer = leerWorkspace }: Dependencias = {},
): Promise<ResultadoDeEjecucion> {
  const [comando, ...resto] = argv;
  if (comando !== 'validate') {
    return uso(`Comando desconocido '${comando ?? ''}'. Uso: diagrams validate --workspace <ruta>`);
  }

  let opciones;
  try {
    opciones = parseArgs({
      args: resto,
      options: {
        workspace: { type: 'string' },
        json: { type: 'boolean', default: false },
        strict: { type: 'boolean', default: false },
        'max-issues': { type: 'string' },
      },
      strict: true,
    }).values;
  } catch (error) {
    return uso((error as Error).message);
  }
  if (opciones.workspace === undefined) return uso('Falta --workspace <ruta>');
  const maxIssues = Number(opciones['max-issues'] ?? MAX_ISSUES_POR_DEFECTO);
  if (!Number.isInteger(maxIssues) || maxIssues < 1) return uso('--max-issues debe ser un entero >= 1');

  let resultado: ResultadoDeCompilacion;
  try {
    resultado = compilar(leer(opciones.workspace));
  } catch (error) {
    return uso(`No se pudo leer el Workspace: ${(error as Error).message}`);
  }

  const salida = salidaDeValidateSchema.parse(
    informe(resultado.issues, { maxIssues, strict: opciones.strict }),
  );
  return {
    exitCode: salida.ok ? 0 : 1,
    stdout: opciones.json ? `${JSON.stringify(salida, null, 2)}\n` : textoLegible(salida),
    stderr: '',
  };
}
