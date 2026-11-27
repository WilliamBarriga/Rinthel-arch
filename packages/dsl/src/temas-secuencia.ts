/** Bloques de secuencia de un Tema; lo que admite cada Elemento lo dice `SEQUENCE_SPEC` de `theme`. */
import { CODES } from 'canonical';
import { SEQUENCE_BLOCKS, SEQUENCE_SPEC, STATES, applyOps, parseState } from 'theme';
import type { SequenceBlock, ResolvedLayer, LayerOp, Primitive, ResolvedTheme } from 'theme';

import type { SequenceItem, ThemeMarker, ThemeSequence } from './generated/ast';
import { aRango, baseDeErrorDeEstado, issueConSugerencia, rangoDe } from './posiciones';
import { compilarBloque } from './temas-capas';
import { primitivaSuelta } from './temas-comun';
import type { Contexto } from './temas-comun';

type Bloque = NonNullable<NonNullable<ResolvedTheme['secuencia']>[SequenceBlock]>;
type Marcadores = { origen?: Primitive; fin?: Primitive };

const vacio = (): Bloque => ({ capas: [], textos: {}, parches: {}, estados: {}, metricas: {} });

/** Aplica los bloques sobre `tema.secuencia` (heredada del padre). */
export function compilarSecuencia(bloques: readonly ThemeSequence[], tema: ResolvedTheme, ctx: Contexto): void {
  for (const nombre of SEQUENCE_BLOCKS) {
    const delNombre = bloques.filter((b) => b.element === nombre);
    if (delNombre.length === 0) continue;
    const bloque = tema.secuencia?.[nombre] ?? vacio();
    tema.secuencia = { ...tema.secuencia, [nombre]: bloque };
    compilarBloqueDeSecuencia(nombre, delNombre.flatMap((b) => b.items), bloque, tema, ctx);
  }
}

function compilarBloqueDeSecuencia(nombre: SequenceBlock, items: readonly SequenceItem[], bloque: Bloque, tema: ResolvedTheme, ctx: Contexto): void {
  const espec = SEQUENCE_SPEC[nombre];
  const error = (donde: { $cstNode?: { range: Parameters<typeof aRango>[0] } }, message: string): void => {
    ctx.issues.push({ code: CODES.E_THEME_INVALID_VALUE, severity: 'error', file: ctx.archivo, ...aRango(donde.$cstNode?.range).start, message });
  };
  const capasDe = (hijos: readonly SequenceItem[]) => hijos.filter((item): item is Extract<SequenceItem, { $type: 'ThemeLayer' | 'ThemeUse' }> => item.$type === 'ThemeLayer' || item.$type === 'ThemeUse');
  const marcador = (item: ThemeMarker, destino: Marcadores, enParche: boolean): void => {
    const lado = item.side === 'start' ? 'origen' : 'fin';
    if (!espec.marcadores.includes(item.side)) {
      error(item, `'${nombre}' does not accept marker '${item.side}'${espec.marcadores.length > 0 ? `; accepts ${espec.marcadores.join(', ')}` : ''}`);
      return;
    }
    if (item.remove === true) {
      if (enParche) error(item, `'${item.side} none' is not valid in a patch: removing a marker is done in the base block`);
      else delete destino[lado];
      return;
    }
    const primitiva = primitivaSuelta(item.kind ?? '', item.props, 'marcador', ctx, rangoDe(item, 'kind').start);
    if (primitiva !== undefined) destino[lado] = primitiva;
  };

  const modo = bloque.capas.length === 0 ? 'definir' : 'parchear';
  const ops = compilarBloque(capasDe(items), { ...ctx, modo, ubicacion: espec.capas, candidatas: [bloque.capas as ResolvedLayer[]], origenes: new Map() });
  bloque.capas = applyOps(bloque.capas as ResolvedLayer[], ops, tema.palette, modo, espec.capas).pila;

  const parche = (hijos: readonly SequenceItem[]): LayerOp[] => compilarBloque(capasDe(hijos), { ...ctx, modo: 'parchear', ubicacion: espec.capas, candidatas: [bloque.capas as ResolvedLayer[]], origenes: new Map() });

  for (const item of items) {
    switch (item.$type) {
      case 'ThemeMarker':
        marcador(item, bloque, false);
        break;
      case 'ThemeState': {
        const resultado = parseState(item.name);
        if ('error' in resultado) {
          ctx.issues.push(issueConSugerencia(baseDeErrorDeEstado(resultado.error), ctx.archivo, item, 'name', STATES));
          break;
        }
        for (const hijo of item.items) {
          if (hijo.$type === 'ThemeSlots') error(hijo, `'slots' is not valid in a state of '${nombre}'`);
        }
        bloque.estados = { ...bloque.estados, [resultado.estado]: [...(bloque.estados[resultado.estado] ?? []), ...parche(item.items as SequenceItem[])] };
        break;
      }
      case 'SequencePatch': {
        if (espec.parches === undefined || espec.parches.palabra !== item.word) {
          error(item, espec.parches === undefined ? `'${nombre}' has no per-variant patches` : `In '${nombre}' the per-variant patch is written '${espec.parches.palabra} <name> { ... }'`);
          break;
        }
        if (!espec.parches.nombres.includes(item.name)) {
          ctx.issues.push(
            issueConSugerencia(
              { code: CODES.E_THEME_INVALID_VALUE, message: `'${item.name}' is not a variant of '${nombre}'; available: ${espec.parches.nombres.join(', ')}` },
              ctx.archivo, item, 'name', espec.parches.nombres,
            ),
          );
          break;
        }
        const previo = bloque.parches[item.name] ?? { ops: [] };
        const propio: { ops: LayerOp[] } & Marcadores = { ...previo, ops: [...previo.ops, ...parche(item.items)] };
        for (const hijo of item.items) if (hijo.$type === 'ThemeMarker') marcador(hijo, propio, true);
        bloque.parches = { ...bloque.parches, [item.name]: propio };
        break;
      }
      case 'SequenceMetric': {
        const rango = espec.metricas[item.key];
        if (rango === undefined) {
          const disponibles = Object.keys(espec.metricas);
          ctx.issues.push(
            issueConSugerencia(
              { code: CODES.E_THEME_INVALID_VALUE, message: `'${item.key}' is not a Metric of '${nombre}'${disponibles.length > 0 ? `; available: ${disponibles.join(', ')}` : ''}` },
              ctx.archivo, item, 'key', disponibles,
            ),
          );
          break;
        }
        const valor = Number(item.value);
        if (!Number.isFinite(valor) || valor < rango.min || valor > rango.max) {
          ctx.issues.push({ code: CODES.E_THEME_INVALID_VALUE, severity: 'error', file: ctx.archivo, ...rangoDe(item, 'value').start, message: `'${item.key}' of '${nombre}' ranges from ${rango.min} to ${rango.max}, not ${item.value}` });
        } else bloque.metricas = { ...bloque.metricas, [item.key]: valor };
        break;
      }
      case 'SequenceText': {
        const permitido = espec.textos[item.slot];
        if (permitido === undefined) {
          const disponibles = Object.keys(espec.textos);
          ctx.issues.push(
            issueConSugerencia(
              { code: CODES.E_THEME_INVALID_VALUE, message: `'${item.slot}' is not a style of '${nombre}'${disponibles.length > 0 ? `; available: ${disponibles.join(', ')}` : ''}` },
              ctx.archivo, item, 'slot', disponibles,
            ),
          );
          break;
        }
        const texto = primitivaSuelta(permitido.primitiva, item.props, permitido.ubicacion, ctx, rangoDe(item, 'slot').start);
        if (texto !== undefined) bloque.textos = { ...bloque.textos, [item.slot]: texto };
        break;
      }
      default:
        break;
    }
  }
}
