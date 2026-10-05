/**
 * Candidatos cercanos a un nombre mal escrito (typos), para `hint` y `fix`.
 * Puro: sin dependencias del resto del compilador.
 */

/** Distancia de edicion de Levenshtein. */
function distancia(a: string, b: string): number {
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const actual = [i];
    for (let j = 1; j <= b.length; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(
        (anterior[j] as number) + 1,
        (actual[j - 1] as number) + 1,
        (anterior[j - 1] as number) + costo,
      );
    }
    anterior = actual;
  }
  return anterior[b.length] as number;
}

/**
 * Nombres de `existentes` a distancia razonable de `escrito` (hasta un tercio
 * de su longitud, minimo 1), ordenados. Un unico resultado es un candidato
 * inequivoco; varios son ambiguos.
 */
export function candidatosCercanos(escrito: string, existentes: Iterable<string>): string[] {
  const maximo = Math.max(1, Math.floor(escrito.length / 3));
  return [...existentes].filter((nombre) => distancia(escrito, nombre) <= maximo).sort();
}
