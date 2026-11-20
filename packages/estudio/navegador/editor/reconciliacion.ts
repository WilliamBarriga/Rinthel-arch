/**
 * Reconciliacion del buffer del editor con el disco (escrituras externas: el agente, un `fix`, otro editor). Pura, sin
 * DOM: trabaja con `ChangeSet` de CodeMirror para que el editor los despache tal cual y mapee cursor, seleccion y scroll.
 * - `diferenciaMinima(antes, despues)`: diff por lineas (Myers) afinado a caracteres dentro de cada tramo.
 * - `fusionarTresVias(base, disco, buffer)`: une lo que cambio el disco y lo que tecleo el usuario desde `base`. Si un
 *   tramo del buffer solapa uno del disco, gana el disco y el tramo del buffer (sus lineas enteras) queda en `perdidos`
 *   para ofrecer recuperarlo. Se solapa por lineas, como `git merge`: dos tramos que tocan la misma linea de la base, o
 *   dos bloques de lineas insertados en el mismo borde; lineas vecinas no.
 */
import { ChangeSet, Text } from '@codemirror/state';
import type { ChangeSpec } from '@codemirror/state';

/** Lineas con su salto final, para que el ultimo renglon sin `\n` difiera del mismo con `\n`. */
const lineasDe = (texto: string): string[] => texto.match(/[^\n]*\n|[^\n]+/g) ?? [];

/** Pares `[i, j]` de lineas iguales de una subsecuencia comun maxima (Myers, O((N+M)D)). */
function lineasComunes(a: readonly string[], b: readonly string[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const v = new Map<number, number>([[1, 0]]);
  const rastro: Map<number, number>[] = [];
  let fin = -1;
  for (let d = 0; d <= max && fin < 0; d++) {
    rastro.push(new Map(v));
    for (let k = -d; k <= d; k += 2) {
      const bajar = k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1));
      let x = bajar ? (v.get(k + 1) ?? 0) : (v.get(k - 1) ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v.set(k, x);
      if (x >= n && y >= m) {
        fin = d;
        break;
      }
    }
  }
  const pares: [number, number][] = [];
  let x = n;
  let y = m;
  for (let d = fin; d > 0; d--) {
    const previo = rastro[d] as Map<number, number>;
    const k = x - y;
    const bajar = k === -d || (k !== d && (previo.get(k - 1) ?? -1) < (previo.get(k + 1) ?? -1));
    const kPrevio = bajar ? k + 1 : k - 1;
    const xPrevio = previo.get(kPrevio) ?? 0;
    const yPrevio = xPrevio - kPrevio;
    while (x > xPrevio && y > yPrevio) {
      x--;
      y--;
      pares.push([x, y]);
    }
    x = xPrevio;
    y = yPrevio;
  }
  while (x > 0 && y > 0) {
    x--;
    y--;
    pares.push([x, y]);
  }
  return pares.reverse();
}

/** Cambios minimos que llevan `antes` a `despues`. */
export function diferenciaMinima(antes: string, despues: string): ChangeSet {
  if (antes === despues) return ChangeSet.empty(antes.length);
  const a = lineasDe(antes);
  const b = lineasDe(despues);
  const offsetsA = [0];
  for (const l of a) offsetsA.push((offsetsA.at(-1) as number) + l.length);
  const offsetsB = [0];
  for (const l of b) offsetsB.push((offsetsB.at(-1) as number) + l.length);
  const cambios: ChangeSpec[] = [];
  let i = 0;
  let j = 0;
  for (const [ci, cj] of [...lineasComunes(a, b), [a.length, b.length] as [number, number]]) {
    if (ci > i || cj > j) {
      const desde = offsetsA[i] as number;
      const hasta = offsetsA[ci] as number;
      const viejo = antes.slice(desde, hasta);
      const nuevo = despues.slice(offsetsB[j], offsetsB[cj]);
      let prefijo = 0;
      while (prefijo < viejo.length && prefijo < nuevo.length && viejo[prefijo] === nuevo[prefijo]) prefijo++;
      let sufijo = 0;
      while (sufijo < viejo.length - prefijo && sufijo < nuevo.length - prefijo && viejo[viejo.length - 1 - sufijo] === nuevo[nuevo.length - 1 - sufijo]) sufijo++;
      cambios.push({ from: desde + prefijo, to: hasta - sufijo, insert: nuevo.slice(prefijo, nuevo.length - sufijo) });
    }
    i = ci + 1;
    j = cj + 1;
  }
  return ChangeSet.of(cambios, antes.length);
}

/**
 * Lo que el buffer tenia en un tramo que gano el disco: sus lineas enteras, la linea (1-based) donde cae en `texto` y
 * cuantas lineas de `texto` (desde `linea`) son la version del disco de ese tramo; 0 si el buffer solo inserto lineas.
 * Recuperarlo es poner `texto` en lugar de esas `reemplaza` lineas.
 */
export interface FragmentoPerdido {
  texto: string;
  linea: number;
  reemplaza: number;
}

export interface Fusion {
  /** Texto unido. */
  texto: string;
  /** Cambios que llevan el buffer a `texto` (se despachan anotados `desdeElDisco`). */
  alBuffer: ChangeSet;
  /** Teclas pendientes rebasadas sobre el disco: llevan `disco` a `texto` (lo que queda por guardar). */
  pendiente: ChangeSet;
  perdidos: FragmentoPerdido[];
}

interface Tramo {
  desde: number;
  hasta: number;
  desdeB: number;
  hastaB: number;
  inserta: string;
}

const tramosDe = (cambios: ChangeSet): Tramo[] => {
  const tramos: Tramo[] = [];
  cambios.iterChanges((desde, hasta, desdeB, hastaB, inserta) => tramos.push({ desde, hasta, desdeB, hastaB, inserta: inserta.toString() }));
  return tramos;
};

/**
 * Lineas de la base que toca un tramo, como intervalo cerrado: `2n` es el contenido de la linea `n` y `2n - 1` el borde
 * antes de ella (donde caen las lineas enteras insertadas). Dos tramos solapan si sus intervalos se cortan.
 */
const lineasQueToca = (t: Tramo, base: Text): [number, number] => {
  const linea = (pos: number): number => base.lineAt(pos).number;
  if (t.desde === t.hasta) {
    const borde = base.lineAt(t.desde).from === t.desde && t.inserta.endsWith('\n');
    return borde ? [2 * linea(t.desde) - 1, 2 * linea(t.desde) - 1] : [2 * linea(t.desde), 2 * linea(t.desde)];
  }
  const fin = base.lineAt(t.hasta).from === t.hasta ? t.hasta - 1 : t.hasta;
  return [2 * linea(t.desde), 2 * linea(fin)];
};

const doc = (texto: string): Text => Text.of(texto.split('\n'));

export function fusionarTresVias(base: string, disco: string, buffer: string): Fusion {
  const delDisco = diferenciaMinima(base, disco);
  const tramosDelDisco = tramosDe(delDisco);
  const delBuffer = tramosDe(diferenciaMinima(base, buffer));
  const docBase = doc(base);
  const ocupadas = tramosDelDisco.map((d) => lineasQueToca(d, docBase));
  const conservados = delBuffer.filter((t) => {
    const [desde, hasta] = lineasQueToca(t, docBase);
    return !ocupadas.some(([d, h]) => desde <= h && d <= hasta);
  });
  const pendiente = ChangeSet.of(
    conservados.map((t) => ({ from: t.desde, to: t.hasta, insert: t.inserta })),
    base.length,
  ).map(delDisco);
  const unido = pendiente.apply(doc(disco));
  const texto = unido.toString();
  const docDelBuffer = doc(buffer);
  const perdidos = delBuffer
    .filter((t) => !conservados.includes(t))
    .map((t): FragmentoPerdido => {
      const primera = docDelBuffer.lineAt(t.desdeB);
      const ultima = docDelBuffer.lineAt(t.hastaB > t.desdeB && docDelBuffer.lineAt(t.hastaB).from === t.hastaB ? t.hastaB - 1 : t.hastaB);
      const enUnido = pendiente.mapPos(delDisco.mapPos(t.desde, -1), -1);
      const linea = unido.lineAt(enUnido).number;
      const [desde, hasta] = lineasQueToca(t, docBase);
      // Un intervalo impar es un borde entre lineas: el buffer solo inserto lineas enteras, no hay version del disco que quitar.
      if (desde % 2 === 1) return { texto: docDelBuffer.sliceString(primera.from, ultima.to), linea, reemplaza: 0 };
      const finEnBase = docBase.line(hasta / 2).to;
      const finEnUnido = pendiente.mapPos(delDisco.mapPos(finEnBase, 1), 1);
      return { texto: docDelBuffer.sliceString(primera.from, ultima.to), linea, reemplaza: unido.lineAt(finEnUnido).number - linea + 1 };
    });
  return { texto, alBuffer: diferenciaMinima(buffer, texto), pendiente, perdidos };
}
