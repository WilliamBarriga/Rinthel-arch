import { afterEach, describe, expect, it } from 'vitest';

import { iniciarDev } from 'cli';
import type { ServidorDev } from 'cli';

const MODELO = `specification {
  node servicio
}

model {
  servicio api "API"
  servicio db "Base de datos"
  api -> db
}

view general {
  type architecture
  include **
  theme t
}
`;

const tema = (relleno: string, slots = 'title attrs') => `theme t {
  palette { papel "#fefce8"  tinta "#1f2937"  rojo "#dc2626" }
  node {
    layer forma rect { radius 8 }
    layer relleno solid { color ${relleno} }
    layer borde border { color tinta width 1 }
    slots { ${slots} }
  }
}
`;

interface EstadoConCambio {
  version: number;
  cambio?: 'pintura' | 'estructura' | 'codigo';
  fuente?: { themes: { name: string; nodo: { capas: { nombre: string; primitiva: { props: Record<string, unknown> } }[] } }[] };
  issues: { code: string }[];
}

/** Workspace en memoria: `.dg` y recursos (`.tsx`, fuentes) con un observador que se dispara a mano. */
function entorno(inicial: Record<string, string>, recursos: Record<string, string> = {}) {
  let archivos = { ...inicial };
  let hashes = { ...recursos };
  let avisar: (() => void) | undefined;
  return {
    leer: () => ({ ...archivos }),
    leerRecursos: () => ({ ...hashes }),
    observar: (_raiz: string, alCambiar: () => void) => {
      avisar = alCambiar;
      return () => {
        avisar = undefined;
      };
    },
    escribir(ruta: string, texto: string) {
      archivos = { ...archivos, [ruta]: texto };
      avisar?.();
    },
    tocarRecurso(ruta: string, hash: string) {
      hashes = { ...hashes, [ruta]: hash };
      avisar?.();
    },
  };
}

const shell = async () => ({ pagina: '', worker: '' });
const abiertos: ServidorDev[] = [];
afterEach(async () => {
  await Promise.all(abiertos.splice(0).map((s) => s.cerrar()));
});
async function arrancar(env: ReturnType<typeof entorno>): Promise<ServidorDev> {
  const servidor = await iniciarDev({ workspace: '/ws', leer: env.leer, leerRecursos: env.leerRecursos, observar: env.observar, shell, debounceMs: 5, puerto: 0 });
  abiertos.push(servidor);
  return servidor;
}
const estado = async (s: ServidorDev): Promise<EstadoConCambio> => (await fetch(`${s.url}api/estado`)).json() as Promise<EstadoConCambio>;
const geometria = async (s: ServidorDev): Promise<unknown> => (await fetch(`${s.url}api/vista/general`)).json();

/** Dispara `cambiar` y espera al siguiente estado empujado por SSE. */
async function siguiente(servidor: ServidorDev, cambiar: () => void): Promise<EstadoConCambio> {
  const respuesta = await fetch(`${servidor.url}eventos`);
  const lector = respuesta.body!.getReader();
  const decodificador = new TextDecoder();
  const datos: EstadoConCambio[] = [];
  let buffer = '';
  let disparado = false;
  while (datos.length < 2) {
    const { value, done } = await lector.read();
    if (done) break;
    buffer += decodificador.decode(value);
    const bloques = buffer.split('\n\n');
    buffer = bloques.pop() ?? '';
    for (const bloque of bloques) {
      const linea = bloque.split('\n').find((l) => l.startsWith('data: '));
      if (linea !== undefined) datos.push(JSON.parse(linea.slice(6)) as EstadoConCambio);
    }
    if (!disparado) {
      disparado = true;
      cambiar();
    }
  }
  await lector.cancel();
  return datos[1] as EstadoConCambio;
}

describe('dev: recarga clasificada por tipo de cambio', () => {
  it('un cambio solo de pintura se empuja como pintura y no cambia la Geometria vigente', async () => {
    const env = entorno({ 'main.dg': MODELO + tema('papel') });
    const servidor = await arrancar(env);
    const antes = await geometria(servidor);
    expect((await estado(servidor)).cambio).toBeUndefined();

    const empujado = await siguiente(servidor, () => env.escribir('main.dg', MODELO + tema('rojo')));

    expect(empujado.cambio).toBe('pintura');
    expect(empujado.fuente?.themes.find((t) => t.name === 't')?.nodo.capas.find((c) => c.nombre === 'relleno')?.primitiva.props).toEqual({ color: 'rojo' });
    expect(await geometria(servidor)).toEqual(antes);
  });

  it('un cambio de Metricas (Slots) se empuja como estructura', async () => {
    const env = entorno({ 'main.dg': MODELO + tema('papel') });
    const servidor = await arrancar(env);

    const empujado = await siguiente(servidor, () => env.escribir('main.dg', MODELO + tema('papel', 'title')));

    expect(empujado.cambio).toBe('estructura');
  });

  it('un cambio del Modelo es estructura', async () => {
    const env = entorno({ 'main.dg': MODELO + tema('papel') });
    const servidor = await arrancar(env);

    const empujado = await siguiente(servidor, () => env.escribir('main.dg', (MODELO + tema('papel')).replace('servicio db "Base de datos"', 'servicio db "Base"')));

    expect(empujado.cambio).toBe('estructura');
  });

  it('un cambio de un .tsx es codigo y una fuente nueva es estructura', async () => {
    const env = entorno({ 'main.dg': MODELO + tema('papel') }, { 'componentes/Rayo.tsx': 'a', 'fuentes/Erica.ttf': 'f1' });
    const servidor = await arrancar(env);

    expect((await siguiente(servidor, () => env.tocarRecurso('componentes/Rayo.tsx', 'b'))).cambio).toBe('codigo');
    expect((await siguiente(servidor, () => env.tocarRecurso('fuentes/Erica.ttf', 'f2'))).cambio).toBe('estructura');
  });

  it('si el DSL falla, conserva el ultimo dibujo bueno y no empuja un cambio de dibujo', async () => {
    const env = entorno({ 'main.dg': MODELO + tema('papel') });
    const servidor = await arrancar(env);

    const roto = await siguiente(servidor, () => env.escribir('main.dg', MODELO + tema('papel').replace('rect', 'rectangulo')));

    expect(roto.issues.map((i) => i.code)).toContain('E_THEME_UNKNOWN_PRIMITIVE');
    expect(roto.cambio).toBeUndefined();
    expect(roto.fuente?.themes.find((t) => t.name === 't')).toBeDefined();
    // Al corregirlo, la comparacion parte de lo ultimo bueno: sigue siendo solo pintura.
    const arreglado = await siguiente(servidor, () => env.escribir('main.dg', MODELO + tema('rojo')));
    expect(arreglado.cambio).toBe('pintura');
  });
});
