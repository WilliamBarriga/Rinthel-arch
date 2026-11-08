/**
 * Referencia del catalogo en Markdown, generada desde las mismas tablas que
 * validan (`CATALOGO`, `SLOTS`, `MOVIMIENTOS`...): la documentacion no se escribe
 * a mano y no puede desviarse del codigo. Pura y determinista; quien la escribe a
 * disco es `scripts/generar-referencia-catalogo.ts`.
 */
import { EASINGS, EFECTOS, MOVIMIENTOS, PROPIEDADES_ANIMABLES } from './animacion';
import { BLOQUES_DE_SECUENCIA, ESPECIFICACION_DE_SECUENCIA } from './secuencia';
import { ALTO_DE_FILA, CLAVES_DE_FILA, NOMBRES_DE_TEXTO_DE_FILA, TEXTOS_DE_FILA } from './fila';
import { CATALOGO, DEFINICION_DE_SLOT, PROPIEDADES_DE_DESPLAZAMIENTO, PROPIEDAD_DE_ZONA, SLOTS, ubicacionesDe } from './catalogo';
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
    case 'texto':
      return `\`${nombre}\` texto de hasta ${definicion.largo} caracteres${definicion.opcional === true ? ' (opcional)' : ''}`;
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
    '',
    `Y \`zone\` (${PROPIEDAD_DE_ZONA.zone.valores.map((v) => `\`${v}\``).join(', ')}; sin ella, \`all\`): que parte de la caja pinta la Capa. \`header\` es la zona de los Slots anteriores a \`attrs\` (sin \`attrs\` equivale a \`all\`) y \`body\` la de \`attrs\`. Solo pinta, y se reparte aparte de la caja: un parche de estado no la cambia.`,
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
    '## Fila de tabla ER (`row`)',
    '',
    `Bloque del Tema que estiliza las filas de una Vista \`er\`. \`height\` (${ALTO_DE_FILA.min} a ${ALTO_DE_FILA.max}) y el \`size\` de \`name\`, \`type\` y \`key\` (multiplo del tamano de texto del Tema, como en los Slots) cambian el tamano medido; el resto solo pinta.`,
    '',
    ...tabla(
      ['Elemento', 'Contenido'],
      [
        ['`layer`, `use`', 'Pila de Capas de cada fila (Primitivas de Nodo)'],
        ['`alternate { ... }`', 'Parche de las filas impares'],
        [`\`key ${CLAVES_DE_FILA.join('|')} { ... }\``, 'Parche de las filas con esa marca de clave, en ese orden'],
        ['`optional { ... }`', 'Parche de los Atributos opcionales, tras las claves'],
        ...NOMBRES_DE_TEXTO_DE_FILA.map((nombre) => [`\`${nombre} { ... }\``, `Estilo de texto con la Primitiva \`${TEXTOS_DE_FILA[nombre]}\`${nombre === 'key' ? ' (el chip de cada marca de clave)' : ''}`]),
      ],
    ),
    '',
    '## Elementos de secuencia',
    '',
    'Bloques del Tema para una Vista `sequence`; sin ellos el nucleo los deriva de `edge` y `node`. Cada uno admite `layer`, `use` y `state`; las Metricas son las separaciones de secuencia (px, con su rango y defecto del nucleo).',
    '',
    ...tabla(
      ['Bloque', 'Capas', 'Marcadores', 'Estilos', 'Parches', 'Metricas'],
      BLOQUES_DE_SECUENCIA.map((nombre) => {
        const e = ESPECIFICACION_DE_SECUENCIA[nombre];
        const metricas = Object.entries(e.metricas).map(([clave, m]) => `\`${clave}\` ${m.min} a ${m.max} (${m.defecto})`);
        return [
          `\`${nombre}\``,
          e.capas === 'capa-arista' ? 'trazos' : 'de Nodo',
          e.marcadores.map((m) => `\`${m}\``).join(', ') || '-',
          Object.entries(e.textos).map(([clave, t]) => `\`${clave}\` (\`${t.primitiva}\`)`).join(', ') || '-',
          e.parches === undefined ? '-' : `\`${e.parches.palabra} <${e.parches.palabra === 'kind' ? 'tipo' : 'operador'}>\`: ${e.parches.nombres.join(', ')}`,
          metricas.join('; ') || '-',
        ];
      }),
    ),
    '',
    'El parche `identifying { ... }` del bloque `edge` cambia el trazo de las Aristas identificantes de una Vista ER.',
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
