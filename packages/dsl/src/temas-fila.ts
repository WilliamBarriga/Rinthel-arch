/** Bloque `row` de un Tema (fila de tabla ER). Un parche de fila solo pinta; las reglas son del catalogo de `tema`. */
import { CODES } from 'canonical';
import { ROW_HEIGHT, ROW_KEYS, STATES, ROW_TEXT_NAMES, ROW_TEXTS, applyOps, opTouchesMetrics, parseState, validateProperties } from 'theme';
import type { ResolvedLayer, LayerOp, ResolvedTheme, RowTextName } from 'theme';

import type { RowItem, ThemeLayer, ThemeUse } from './generated/ast';
import { aRango, baseDeErrorDeEstado, issueConSugerencia, rangoDe } from './posiciones';
import { compilarBloque } from './temas-capas';
import { aIssue, primitivaSuelta } from './temas-comun';
import type { Contexto } from './temas-comun';

type Fila = NonNullable<ResolvedTheme['fila']>;

/** Aplica los `row { ... }` sobre `tema.fila` (heredada del padre o vacia). */
export function compilarFila(items: readonly RowItem[], tema: ResolvedTheme, ctx: Contexto): void {
  if (items.length === 0) return;
  const fila: Fila = tema.fila ?? { capas: [], alterna: [], textos: {}, claves: {}, opcional: [], estados: {} };
  tema.fila = fila;

  const delBloque = items.filter((item): item is ThemeLayer | ThemeUse => item.$type === 'ThemeLayer' || item.$type === 'ThemeUse');
  const modo = fila.capas.length === 0 ? 'definir' : 'parchear';
  const ops = compilarBloque(delBloque, { ...ctx, modo, candidatas: [fila.capas as ResolvedLayer[]], origenes: new Map() });
  fila.capas = applyOps(fila.capas as ResolvedLayer[], ops, tema.palette, modo).pila;

  /** Se valida contra la pila base de la fila; no puede cambiar la caja. */
  const parche = (hijos: readonly (ThemeLayer | ThemeUse)[], donde: { $cstNode?: { range: Parameters<typeof aRango>[0] } }): LayerOp[] => {
    const propios = compilarBloque(hijos, { ...ctx, modo: 'parchear', candidatas: [fila.capas as ResolvedLayer[]], origenes: new Map() });
    for (const op of propios) {
      const razon = opTouchesMetrics(op, [fila.capas as ResolvedLayer[]]);
      if (razon !== undefined) {
        ctx.issues.push({ code: CODES.E_THEME_STATE_TOUCHES_METRICS, severity: 'error', file: ctx.archivo, ...aRango(donde.$cstNode?.range).start, message: `A row patch cannot touch Metrics: ${razon}` });
      }
    }
    return propios;
  };

  for (const item of items) {
    switch (item.$type) {
      case 'RowHeight': {
        const { propiedades, errores } = validateProperties(
          { sujeto: "The 'row' block", nombre: "'row'", propiedades: { height: { tipo: 'numero', min: ROW_HEIGHT.min, max: ROW_HEIGHT.max } } },
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
        const clave = ROW_KEYS.find((k) => k === item.name);
        if (clave === undefined) {
          ctx.issues.push(
            issueConSugerencia(
              { code: CODES.E_THEME_INVALID_VALUE, message: `Unknown key mark '${item.name}' in 'row'; available: ${ROW_KEYS.join(', ')}` },
              ctx.archivo, item, 'name', ROW_KEYS,
            ),
          );
          break;
        }
        fila.claves = { ...fila.claves, [clave]: [...(fila.claves[clave] ?? []), ...parche(item.items, item)] };
        break;
      }
      case 'RowState': {
        const resultado = parseState(item.name);
        if ('error' in resultado) {
          ctx.issues.push(issueConSugerencia(baseDeErrorDeEstado(resultado.error), ctx.archivo, item, 'name', STATES));
          break;
        }
        fila.estados = { ...fila.estados, [resultado.estado]: [...(fila.estados[resultado.estado] ?? []), ...parche(item.items, item)] };
        break;
      }
      case 'RowText': {
        const nombre = ROW_TEXT_NAMES.find((n) => n === item.slot);
        if (nombre === undefined) {
          ctx.issues.push(
            issueConSugerencia(
              { code: CODES.E_THEME_INVALID_VALUE, message: `'${item.slot}' is neither a row text nor a 'row' patch; available: ${ROW_TEXT_NAMES.join(', ')}, layer, use, height, alternate, key, optional` },
              ctx.archivo, item, 'slot', ROW_TEXT_NAMES,
            ),
          );
          break;
        }
        const estilo = primitivaSuelta(ROW_TEXTS[nombre as RowTextName], item.props, 'texto-slot', ctx, rangoDe(item, 'slot').start);
        if (estilo !== undefined) fila.textos = { ...fila.textos, [nombre]: estilo };
        break;
      }
      default:
        break;
    }
  }
}
