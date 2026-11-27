import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(import.meta.dirname, '..');

/**
 * Spanish words that used to name files and scripts. A light guard, not a translator: it catches the old names
 * coming back, not every Spanish word. README.es.md and the Spanish guides (docs/guia/) are Spanish on purpose.
 */
const SPANISH = new Set(
  ('accesibilidad accesible actividad activa animacion antiguos arista aristas arquitectura arrastre avisos ayuda ayudas ' +
    'borde caja camara capas capturas catalogo codigo colapso comando compilar comun configuracion controlado contrato ' +
    'convenciones de del dependencias derivacion desplazamiento detalle diagramas disco diseno documentacion efectos ' +
    'ejecutar ejemplos elemento en escena escenario estado estados estilo estudio evaluar fila foco forma formas ' +
    'fragmentos fuentes galeria generador generar geometria grupo grupos hoja imagenes incorporados indice interaccion ' +
    'interactiva licencia lienzo limite medicion metricas mosaico navegacion notas orden ordenar pagina pasos pilas ' +
    'pintores posiciones prototipo puerto recarga rechazos referencia registro relleno reloj secuencia seleccion ' +
    'semantico senal servidores servir sesion sin teclado tema temas texto ubicador valores vista visor y')
    .split(' '),
);

/** Tracked paths whose names must be English; scan fixtures mimic foreign repos and keep their own names. */
function trackedPaths(): string[] {
  return execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' })
    .split('\n')
    .filter((path) => path !== '')
    .filter((path) => /^(packages\/[^/]+\/(src|test|browser|scripts)|scripts|tests|bench|docs\/img)\//.test(path))
    .filter((path) => !/\/fixtures\/scan-/.test(path) && !/\/src\/generated\//.test(path));
}

const spanishWords = (name: string) => name.split(/[^A-Za-z]+/).filter((word) => SPANISH.has(word.toLowerCase()));

describe('English names', () => {
  it('no file or folder under code, scripts, tests, bench or docs/img has a Spanish name', () => {
    const spanish = trackedPaths()
      .flatMap((path) => path.split('/').map((part) => part.replace(/\.[^.]*$/, '')))
      .filter((part, index, all) => all.indexOf(part) === index && spanishWords(part).length > 0);
    expect(spanish).toEqual([]);
  });

  it('no pnpm script has a Spanish name', () => {
    const scripts = Object.keys((JSON.parse(readFileSync(resolve(REPO, 'package.json'), 'utf8')) as { scripts: Record<string, string> }).scripts);
    expect(scripts.filter((name) => spanishWords(name).length > 0)).toEqual([]);
  });

  it('the guard recognizes an old name', () => {
    expect(spanishWords(basename('tests/ayudas/reloj.ts', '.ts'))).toEqual(['reloj']);
    expect(spanishWords('docs:capturas')).toEqual(['capturas']);
  });
});
