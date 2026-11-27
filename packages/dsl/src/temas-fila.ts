/** Bloque `row` de un Tema (fila de tabla ER). Un parche de fila solo pinta; las reglas son del catalogo de `tema`. */
import { CODES } from 'canonical';
import { ALTO_DE_FILA, CLAVES_DE_FILA, ESTADOS, NOMBRES_DE_TEXTO_DE_FILA, TEXTOS_DE_FILA, aplicarOps, opTocaMetricas, parsearEstado, validarPropiedades } from 'tema';
import type { CapaDeTema, OpDeCapa, TemaResuelto, TextoDeFila } from 'tema';

import type { RowItem, ThemeLayer, ThemeUse } from './generated/ast';
import { aRango, baseDeErrorDeEstado, issueConSugerencia, rangoDe } from './posiciones';
import { compilarBloque } from './temas-capas';
import { aIssue, primitivaSuelta } from './temas-comun';
import type { Contexto } from './temas-comun';

type Fila = NonNullable<TemaResuelto['fila']>;

/** Aplica los `row { ... }` sobre `tema.fila` (heredada del padre o vacia). */
export function compilarFila(items: readonly RowItem[], tema: TemaResuelto, ctx: Contexto): void {
  if (items.length === 0) return;
  const fila: Fila = tema.fila ?? { capas: [], alterna: [], textos: {}, claves: {}, opcional: [], estados: {} };
  tema.fila = fila;

  const delBloque = items.filter((item): item is ThemeLayer | ThemeUse => item.$type === 'ThemeLayer' || item.$type === 'ThemeUse');
  const modo = fila.capas.length === 0 ? 'definir' : 'parchear';
  const ops = compilarBloque(delBloque, { ...ctx, modo, candidatas: [fila.capas as CapaDeTema[]], origenes: new Map() });
  fila.capas = aplicarOps(fila.capas as CapaDeTema[], ops, tema.palette, modo).pila;

  /** Se valida contra la pila base de la fila; no puede cambiar la caja. */
  const parche = (hijos: readonly (ThemeLayer | ThemeUse)[], donde: { $cstNode?: { range: Parameters<typeof aRango>[0] } }): OpDeCapa[] => {
    const propios = compilarBloque(hijos, { ...ctx, modo: 'parchear', candidatas: [fila.capas as CapaDeTema[]], origenes: new Map() });
    for (const op of propios) {
      const razon = opTocaMetricas(op, [fila.capas as CapaDeTema[]]);
      if (razon !== undefined) {
        ctx.issues.push({ code: CODES.E_THEME_STATE_TOUCHES_METRICS, severity: 'error', file: ctx.archivo, ...aRango(donde.$cstNode?.range).start, message: `A row patch cannot touch Metrics: ${razon}` });
      }
    }
    return propios;
  };

  for (const item of items) {
    switch (item.$type) {
      case 'RowHeight': {
        const { propiedades, errores } = validarPropiedades(
          { sujeto: "The 'row' block", nombre: "'row'", propiedades: { height: { tipo: 'numero', min: ALTO_DE_FILA.min, max: ALTO_DE_FILA.max } } },
          [{ clave: 'height', valor: item.value }],
          tema.palette,
        );
        for (const error of errores) ctx.issues.push(aIssue(ctx.archivo, error, rangoDe(item, 'value').start));
        if (errores.length === 0) fila.alto = Number(propiedades['height']);
        break;
      }
      case 'RowAlternate':
        fila.alterna = [...fila.alterna, ...parche(item.items, item)];
        break;
      case 'RowOptional':
        fila.opcional = [...fila.opcional, ...parche(item.items, item)];
        break;
      case 'RowKeyPatch': {
        const clave = CLAVES_DE_FILA.find((k) => k === item.name);
        if (clave === undefined) {
          ctx.issues.push(
            issueConSugerencia(
              { code: CODES.E_THEME_INVALID_VALUE, message: `Unknown key mark '${item.name}' in 'row'; available: ${CLAVES_DE_FILA.join(', ')}` },
              ctx.archivo, item, 'name', CLAVES_DE_FILA,
            ),
          );
          break;
        }
        fila.claves = { ...fila.claves, [clave]: [...(fila.claves[clave] ?? []), ...parche(item.items, item)] };
        break;
      }
      case 'RowState': {
        const resultado = parsearEstado(item.name);
        if ('error' in resultado) {
          ctx.issues.push(issueConSugerencia(baseDeErrorDeEstado(resultado.error), ctx.archivo, item, 'name', ESTADOS));
          break;
        }
        fila.estados = { ...fila.estados, [resultado.estado]: [...(fila.estados[resultado.estado] ?? []), ...parche(item.items, item)] };
        break;
      }
      case 'RowText': {
        const nombre = NOMBRES_DE_TEXTO_DE_FILA.find((n) => n === item.slot);
        if (nombre === undefined) {
          ctx.issues.push(
            issueConSugerencia(
              { code: CODES.E_THEME_INVALID_VALUE, message: `'${item.slot}' is neither a row text nor a 'row' patch; available: ${NOMBRES_DE_TEXTO_DE_FILA.join(', ')}, layer, use, height, alternate, key, optional` },
              ctx.archivo, item, 'slot', NOMBRES_DE_TEXTO_DE_FILA,
            ),
          );
          break;
        }
        const estilo = primitivaSuelta(TEXTOS_DE_FILA[nombre as TextoDeFila], item.props, 'texto-slot', ctx, rangoDe(item, 'slot').start);
        if (estilo !== undefined) fila.textos = { ...fila.textos, [nombre]: estilo };
        break;
      }
      default:
        break;
    }
  }
}
