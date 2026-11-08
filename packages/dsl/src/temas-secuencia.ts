/**
 * Compilacion de los bloques de secuencia de un Tema (ADR 0009): `lifeline`, `activation`, `message`, `fragment` y
 * `note`. Un solo traductor para los cinco: lo que cada uno admite (Capas, marcadores, estilos de texto, variantes
 * `kind`/`op`, Metricas) lo dice `ESPECIFICACION_DE_SECUENCIA` de `tema`; las Capas reutilizan los parches de Capa
 * (`compilarBloque`). Aqui solo se traduce el AST y se situan los errores.
 */
import { CODIGOS } from 'canonico';
import { BLOQUES_DE_SECUENCIA, ESPECIFICACION_DE_SECUENCIA, aplicarOps, parsearEstado } from 'tema';
import type { BloqueDeSecuencia, CapaDeTema, OpDeCapa, Primitiva, TemaResuelto } from 'tema';

import type { SequenceItem, ThemeMarker, ThemeSequence } from './generated/ast';
import { aRango, issueConSugerencia, rangoDe } from './posiciones';
import { compilarBloque } from './temas-capas';
import { primitivaSuelta } from './temas-comun';
import type { Contexto } from './temas-comun';

type Bloque = NonNullable<NonNullable<TemaResuelto['secuencia']>[BloqueDeSecuencia]>;
type Marcadores = { origen?: Primitiva; fin?: Primitiva };

const vacio = (): Bloque => ({ capas: [], textos: {}, parches: {}, estados: {}, metricas: {} });

/** Aplica los bloques de secuencia de un Tema sobre `tema.secuencia` (heredada del padre). Sin bloques, no hace nada. */
export function compilarSecuencia(bloques: readonly ThemeSequence[], tema: TemaResuelto, ctx: Contexto): void {
  for (const nombre of BLOQUES_DE_SECUENCIA) {
    const delNombre = bloques.filter((b) => b.element === nombre);
    if (delNombre.length === 0) continue;
    const bloque = tema.secuencia?.[nombre] ?? vacio();
    tema.secuencia = { ...tema.secuencia, [nombre]: bloque };
    compilarBloqueDeSecuencia(nombre, delNombre.flatMap((b) => b.items), bloque, tema, ctx);
  }
}

function compilarBloqueDeSecuencia(nombre: BloqueDeSecuencia, items: readonly SequenceItem[], bloque: Bloque, tema: TemaResuelto, ctx: Contexto): void {
  const espec = ESPECIFICACION_DE_SECUENCIA[nombre];
  const error = (donde: { $cstNode?: { range: Parameters<typeof aRango>[0] } }, message: string): void => {
    ctx.issues.push({ code: CODIGOS.E_THEME_INVALID_VALUE, severity: 'error', file: ctx.archivo, ...aRango(donde.$cstNode?.range).start, message });
  };
  const capasDe = (hijos: readonly SequenceItem[]) => hijos.filter((item): item is Extract<SequenceItem, { $type: 'ThemeLayer' | 'ThemeUse' }> => item.$type === 'ThemeLayer' || item.$type === 'ThemeUse');
  const marcador = (item: ThemeMarker, destino: Marcadores, enParche: boolean): void => {
    const lado = item.side === 'start' ? 'origen' : 'fin';
    if (!espec.marcadores.includes(item.side)) {
      error(item, `'${nombre}' no admite el marcador '${item.side}'${espec.marcadores.length > 0 ? `; admite ${espec.marcadores.join(', ')}` : ''}`);
      return;
    }
    if (item.remove === true) {
      if (enParche) error(item, `'${item.side} none' no vale en un parche: quitar un marcador se hace en el bloque base`);
      else delete destino[lado];
      return;
    }
    const primitiva = primitivaSuelta(item.kind ?? '', item.props, 'marcador', ctx, rangoDe(item, 'kind').start);
    if (primitiva !== undefined) destino[lado] = primitiva;
  };

  // Pila base: el primer bloque la define; los siguientes (y los de un Tema hijo) la parchean.
  const modo = bloque.capas.length === 0 ? 'definir' : 'parchear';
  const ops = compilarBloque(capasDe(items), { ...ctx, modo, ubicacion: espec.capas, candidatas: [bloque.capas as CapaDeTema[]], origenes: new Map() });
  bloque.capas = aplicarOps(bloque.capas as CapaDeTema[], ops, tema.palette, modo, espec.capas).pila;

  const parche = (hijos: readonly SequenceItem[]): OpDeCapa[] => compilarBloque(capasDe(hijos), { ...ctx, modo: 'parchear', ubicacion: espec.capas, candidatas: [bloque.capas as CapaDeTema[]], origenes: new Map() });

  for (const item of items) {
    switch (item.$type) {
      case 'ThemeMarker':
        marcador(item, bloque, false);
        break;
      case 'ThemeState': {
        const resultado = parsearEstado(item.name);
        if ('error' in resultado) {
          ctx.issues.push(issueConSugerencia({ code: resultado.error.code, message: resultado.error.message }, ctx.archivo, item, 'name', ['hover', 'seleccionado', 'fantasma', 'en-ruta', 'atenuado', 'foco']));
          break;
        }
        for (const hijo of item.items) {
          if (hijo.$type === 'ThemeSlots') error(hijo, `'slots' no vale en un estado de '${nombre}'`);
        }
        bloque.estados = { ...bloque.estados, [resultado.estado]: [...(bloque.estados[resultado.estado] ?? []), ...parche(item.items as SequenceItem[])] };
        break;
      }
      case 'SequencePatch': {
        if (espec.parches === undefined || espec.parches.palabra !== item.word) {
          error(item, espec.parches === undefined ? `'${nombre}' no tiene parches por variante` : `En '${nombre}' el parche por variante se escribe '${espec.parches.palabra} <nombre> { ... }'`);
          break;
        }
        if (!espec.parches.nombres.includes(item.name)) {
          ctx.issues.push(
            issueConSugerencia(
              { code: CODIGOS.E_THEME_INVALID_VALUE, message: `'${item.name}' no es una variante de '${nombre}'; disponibles: ${espec.parches.nombres.join(', ')}` },
              ctx.archivo, item, 'name', espec.parches.nombres,
            ),
          );
          break;
        }
        const previo = bloque.parches[item.name] ?? { ops: [] };
        const propio: { ops: OpDeCapa[] } & Marcadores = { ...previo, ops: [...previo.ops, ...parche(item.items)] };
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
              { code: CODIGOS.E_THEME_INVALID_VALUE, message: `'${item.key}' no es una Metrica de '${nombre}'${disponibles.length > 0 ? `; disponibles: ${disponibles.join(', ')}` : ''}` },
              ctx.archivo, item, 'key', disponibles,
            ),
          );
          break;
        }
        const valor = Number(item.value);
        if (!Number.isFinite(valor) || valor < rango.min || valor > rango.max) {
          ctx.issues.push({ code: CODIGOS.E_THEME_INVALID_VALUE, severity: 'error', file: ctx.archivo, ...rangoDe(item, 'value').start, message: `'${item.key}' de '${nombre}' va de ${rango.min} a ${rango.max}, no ${item.value}` });
        } else bloque.metricas = { ...bloque.metricas, [item.key]: valor };
        break;
      }
      case 'SequenceText': {
        const permitido = espec.textos[item.slot];
        if (permitido === undefined) {
          const disponibles = Object.keys(espec.textos);
          ctx.issues.push(
            issueConSugerencia(
              { code: CODIGOS.E_THEME_INVALID_VALUE, message: `'${item.slot}' no es un estilo de '${nombre}'${disponibles.length > 0 ? `; disponibles: ${disponibles.join(', ')}` : ''}` },
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
