/**
 * Referencia del catalogo en Markdown, generada desde las mismas tablas que
 * validan (`CATALOGO`, `SLOTS`, `MOVIMIENTOS`...): la documentacion no se escribe
 * a mano y no puede desviarse del codigo. Pura y determinista; quien la escribe a
 * disco es `scripts/generar-referencia-catalogo.ts`.
 */
import { EASINGS, EFECTOS, MOVIMIENTOS, PROPIEDADES_ANIMABLES } from './animacion';
import { CATALOGO, DEFINICION_DE_SLOT, PROPIEDADES_DE_DESPLAZAMIENTO, SLOTS, ubicacionesDe } from './catalogo';
import type { DefinicionDePrimitiva, DefinicionDePropiedad, NombreDePrimitiva } from './catalogo';

const propiedad = (nombre: string, definicion: DefinicionDePropiedad): string => {
  switch (definicion.tipo) {
    case 'numero':
      return `\`${nombre}\` ${definicion.min} a ${definicion.max}${definicion.defecto !== undefined ? ` (${definicion.defecto})` : definicion.opcional === true ? ' (opcional)' : ''}`;
    case 'color':
      return `\`${nombre}\` color de Paleta${definicion.opcional === true ? ' (opcional)' : ''}`;
    case 'opcion':
      return `\`${nombre}\` ${definicion.valores.join('|')}${definicion.defecto !== undefined ? ` (${definicion.defecto})` : definicion.opcional === true ? ' (opcional)' : ''}`;
    case 'nombre':
      return `\`${nombre}\` nombre de Componente`;
  }
};

const tabla = (cabecera: readonly string[], filas: readonly (readonly string[])[]): string[] => [
  `| ${cabecera.join(' | ')} |`,
  `| ${cabecera.map(() => '---').join(' | ')} |`,
  ...filas.map((fila) => `| ${fila.join(' | ')} |`),
];

export function referenciaDelCatalogo(): string {
  const entradas = Object.entries(CATALOGO) as [string, DefinicionDePrimitiva][];
  const familias = [...new Set(entradas.map(([, definicion]) => definicion.familia))];
  const lineas: string[] = [
    '# Referencia del catalogo de Temas',
    '',
    'Generado por `pnpm docs:catalogo` desde el catalogo de `packages/tema`; no editar a mano. El contrato esta en `docs/adr/0008-sistema-de-temas-expresivo.md`.',
    '',
    'Un numero se escribe como `minimo a maximo (defecto)`; fuera de rango es un error, nunca se recorta. Los colores son siempre nombres de Paleta. "Metricas" dice si la Primitiva puede cambiar la caja o los Slots (por defecto solo pinta).',
    '',
    '## Primitivas',
  ];
  lineas.push(
    '',
    'Toda Capa de Nodo o Grupo (salvo `code`) acepta ademas, sin que la Primitiva las declare: `offset x y` (se escribe con dos valores y se guarda como `offset-x`/`offset-y`; admite negativos) y `grow`. Solo pintan: no cambian las Metricas ni provocan relayout, y un parche de estado puede cambiarlas con `transition`.',
    '',
    ...tabla(['Propiedad comun', 'Rango'], Object.entries(PROPIEDADES_DE_DESPLAZAMIENTO).map(([clave, valor]) => [`\`${clave}\``, `${valor.min} a ${valor.max}`])),
  );
  for (const familia of familias) {
    lineas.push('', `### Familia ${familia}`, '');
    const filas = entradas
      .filter(([, definicion]) => definicion.familia === familia)
      .map(([nombre, definicion]) => {
        const props = Object.entries(definicion.propiedades).map(([clave, valor]) => propiedad(clave, valor));
        if (definicion.abierta === true) props.push('parametros libres (numero o texto)');
        return [`\`${nombre}\``, ubicacionesDe(nombre as NombreDePrimitiva).join(', '), props.join('; ') || '-', definicion.afectaMetricas ? 'si' : 'no'];
      });
    lineas.push(...tabla(['Primitiva', 'Ubicacion', 'Propiedades', 'Metricas'], filas));
  }
  lineas.push('', '## Slots', '', ...tabla(['Slot', 'Estilo'], SLOTS.map((slot) => [`\`${slot}\``, `\`${DEFINICION_DE_SLOT[slot].estilo}\``])));
  lineas.push(
    '',
    '## Movimientos',
    '',
    ...tabla(
      ['Movimiento', 'Intensidad', 'Easing', 'Duracion (ms)'],
      Object.entries(MOVIMIENTOS).map(([nombre, movimiento]) => [`\`${nombre}\``, movimiento.intensidad ? 'si' : 'no', movimiento.easing, String(movimiento.duracionMs)]),
    ),
    '',
    `Easings: ${EASINGS.map((easing) => `\`${easing}\``).join(', ')}.`,
    '',
    '## Efectos de entrada y salida',
    '',
    ...tabla(['Efecto'], EFECTOS.map((efecto) => [`\`${efecto}\``])),
    '',
    '## Propiedades animables con keyframes',
    '',
    ...tabla(
      ['Propiedad', 'Rango'],
      Object.entries(PROPIEDADES_ANIMABLES).map(([nombre, rango]) => [`\`${nombre}\``, `${rango.min} a ${rango.max}`]),
    ),
    '',
  );
  return lineas.join('\n');
}
