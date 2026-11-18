/**
 * Workspaces sinteticos para los umbrales del ADR 0003. `generarWorkspace` da exactamente `nodos` Nodos en un bosque
 * casi completo (10k Nodos son 4-5 niveles), Aristas entre hojas y una Vista `todo` con el Modelo entero.
 * Determinista: misma entrada, mismos archivos (PRNG con semilla, sin reloj).
 */
export interface OpcionesDeGenerador {
  /** Grupos y hojas, al menos 1. */
  nodos: number;
  /** Por defecto 1.5. */
  aristasPorNodo?: number;
  /** Hijos por Grupo; por defecto 8. */
  ramas?: number;
  /** Por defecto 10; nunca mas que `nodos`. */
  raices?: number;
  /** Por defecto 1. */
  semilla?: number;
}

/** mulberry32. */
function prng(semilla: number): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SANGRIA = '  ';

export function generarWorkspace(opciones: OpcionesDeGenerador): Record<string, string> {
  const { nodos, aristasPorNodo = 1.5, ramas = 8, semilla = 1 } = opciones;
  const raices = Math.min(opciones.raices ?? 10, nodos);
  const azar = prng(semilla);

  // Nodo i >= raices cuelga de floor((i - raices) / ramas): el padre siempre es anterior.
  const hijos: number[][] = Array.from({ length: nodos }, () => []);
  for (let i = raices; i < nodos; i++) hijos[Math.floor((i - raices) / ramas)]!.push(i);

  const ids: string[] = Array.from({ length: nodos });
  const lineas: string[] = [];
  const emitir = (i: number, prefijo: string, nivel: number): void => {
    const local = `n${i}`;
    ids[i] = prefijo === '' ? local : `${prefijo}.${local}`;
    const sangria = SANGRIA.repeat(nivel);
    if (hijos[i]!.length === 0) {
      lineas.push(`${sangria}servicio ${local} "Servicio ${i}"`);
      return;
    }
    lineas.push(`${sangria}modulo ${local} "Modulo ${i}" {`);
    for (const hijo of hijos[i]!) emitir(hijo, ids[i]!, nivel + 1);
    lineas.push(`${sangria}}`);
  };
  for (let i = 0; i < raices; i++) emitir(i, '', 1);

  const hojas = hijos.flatMap((h, i) => (h.length === 0 ? [i] : []));
  const objetivo = Math.min(Math.round(nodos * aristasPorNodo), hojas.length * (hojas.length - 1));
  const vistas = new Set<string>();
  const aristas: string[] = [];
  while (aristas.length < objetivo) {
    const a = Math.floor(azar() * hojas.length);
    // 80% de las Aristas son locales (hojas vecinas); el resto cruza el grafo.
    const b = azar() < 0.8 ? a + 1 + Math.floor(azar() * 8) : Math.floor(azar() * hojas.length);
    if (b >= hojas.length || b === a || vistas.has(`${a}>${b}`)) continue;
    vistas.add(`${a}>${b}`);
    aristas.push(`${SANGRIA}${ids[hojas[a]!]} -> ${ids[hojas[b]!]}`);
  }

  const texto = [
    'specification {',
    `${SANGRIA}node servicio`,
    `${SANGRIA}node modulo`,
    '}',
    '',
    'model {',
    ...lineas,
    ...aristas,
    '}',
    '',
    'view todo {',
    `${SANGRIA}type architecture`,
    `${SANGRIA}include **`,
    '}',
    '',
  ].join('\n');
  return { 'main.dg': texto };
}

export interface OpcionesDeSecuencia {
  /** Al menos 1. */
  mensajes: number;
  /** Por defecto 50, al menos 2. */
  lifelines?: number;
  /** Anidamiento maximo de Fragmentos; por defecto 3. */
  profundidad?: number;
  /** Por defecto 1. */
  semilla?: number;
}

/** Una Vista `sequence` de la Interaccion `grande` con Fragmentos (opt, loop, alt, par) anidados. Determinista. */
export function generarSecuencia(opciones: OpcionesDeSecuencia): Record<string, string> {
  const { mensajes, lifelines = 50, profundidad = 3, semilla = 1 } = opciones;
  const azar = prng(semilla);
  const lineas: string[] = [];
  let restantes = mensajes;
  const entero = (n: number): number => Math.floor(azar() * n);
  const mensaje = (nivel: number): void => {
    const de = entero(lifelines);
    const a = (de + 1 + entero(lifelines - 1)) % lifelines;
    lineas.push(`${SANGRIA.repeat(nivel)}l${de} -> l${a} "m${mensajes - restantes}"`);
    restantes--;
  };
  const fragmento = (nivel: number, nivelFragmento: number): void => {
    const sangria = SANGRIA.repeat(nivel);
    const operador = ['opt', 'loop', 'alt', 'par'][entero(4)]!;
    const separador = operador === 'par' ? 'and' : 'else';
    const operandos = operador === 'alt' || operador === 'par' ? 2 : 1;
    for (let k = 0; k < operandos; k++) {
      lineas.push(k === 0 ? `${sangria}${operador} "g${restantes}" {` : `${sangria}} ${separador} "g${restantes}" {`);
      const propios = 2 + entero(3);
      for (let i = 0; i < propios && restantes > 0; i++) mensaje(nivel + 1);
      if (nivelFragmento < profundidad && restantes > 0) fragmento(nivel + 1, nivelFragmento + 1);
      if (restantes > 0) mensaje(nivel + 1);
    }
    lineas.push(`${sangria}}`);
  };
  while (restantes > 0) {
    for (let i = 0; i < 4 && restantes > 0; i++) mensaje(2);
    if (restantes > 0) fragmento(2, 1);
  }

  const texto = [
    'specification {',
    `${SANGRIA}node servicio`,
    '}',
    '',
    'model {',
    ...Array.from({ length: lifelines }, (_, i) => `${SANGRIA}servicio l${i} "Servicio ${i}"`),
    `${SANGRIA}interaction grande {`,
    ...lineas,
    `${SANGRIA}}`,
    '}',
    '',
    'view secuencia {',
    `${SANGRIA}type sequence`,
    `${SANGRIA}interaction grande`,
    '}',
    '',
  ].join('\n');
  return { 'main.dg': texto };
}
