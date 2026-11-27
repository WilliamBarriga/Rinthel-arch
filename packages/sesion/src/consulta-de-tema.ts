/** `inspect theme`: la consulta de un Tema (cadena `extends`, Capas, Grupo, Elementos, Slots y Metricas). Pura. */
import { INSPECT_CONTRACT_VERSION, nearestCandidates } from 'canonical';
import type { CanonicalForm } from 'canonical';
import type { OrigenDeTema } from 'dsl';
import { CATALOGO, EFECTOS, ESTADOS, MOVIMIENTOS, TIPOS_DE_DIAGRAMA, alturaDeCabecera, cascada, componentesDeTema, describirDisposicion, elementosDeTema, metricasDeNodo, parsearEstado, resolverTema, tablaDeMetricas, temaParaDiagrama } from 'tema';
import type { CapaDeTema, CapaDescrita } from 'tema';

import type { Respuesta } from './consultas';

type Sitio = { file: string; line: number };

/** Opciones de `inspect theme`: Tipo de nodo, estado y Tipo de diagrama de la cascada, y si se adjunta el catalogo. */
export interface OpcionesDeConsultaDeTema {
  tipo?: string;
  estado?: string;
  diagrama?: string;
  catalogo?: boolean;
}

const INCORPORADO: Sitio = { file: '(incorporado)', line: 1 };

/** Cadena `extends`, `part` usadas, pila de Capas para un Tipo y estado (con el sitio que fijo cada Capa), Metricas y uso de codigo. */
export function consultarTema(fuente: CanonicalForm, origenes: Readonly<Record<string, OrigenDeTema>>, nombre: string, { tipo, estado, diagrama, catalogo = false }: OpcionesDeConsultaDeTema = {}): Respuesta {
  const declarado = fuente.themes.find((t) => t.name === nombre);
  if (declarado === undefined) {
    const cerca = nearestCandidates(nombre, fuente.themes.map((t) => t.name));
    return { noEncontrado: `No such Theme '${nombre}'${cerca.length === 0 ? '' : `. Did you mean: ${cerca.join(', ')}`}`, suggestions: cerca };
  }
  const tipos = fuente.specification.nodeTypes.map((t) => t.name);
  if (tipo !== undefined && !tipos.includes(tipo)) {
    const cerca = nearestCandidates(tipo, tipos);
    return { noEncontrado: `No such Node kind '${tipo}'${cerca.length === 0 ? '' : `. Did you mean: ${cerca.join(', ')}`}`, suggestions: cerca };
  }
  const parseado = estado === undefined ? undefined : parsearEstado(estado);
  if (parseado !== undefined && 'error' in parseado) {
    const { candidatos } = parseado.error;
    return { noEncontrado: `No such state '${estado}'${candidatos.length === 0 ? '' : `. Did you mean: ${candidatos.join(', ')}`}. States: ${ESTADOS.join(', ')}`, suggestions: [...candidatos] };
  }
  const tipoDeDiagrama = diagrama === undefined ? undefined : TIPOS_DE_DIAGRAMA.find((t) => t === diagrama);
  if (diagrama !== undefined && tipoDeDiagrama === undefined) {
    const cerca = nearestCandidates(diagrama, TIPOS_DE_DIAGRAMA);
    return { noEncontrado: `No such Diagram type '${diagrama}'${cerca.length === 0 ? '' : `. Did you mean: ${cerca.join(', ')}`}. Types: ${TIPOS_DE_DIAGRAMA.join(', ')}`, suggestions: cerca };
  }
  const estadoValido = parseado === undefined || 'error' in parseado ? undefined : parseado.estado;

  const tema = temaParaDiagrama(resolverTema(declarado), tipoDeDiagrama);
  const componentes = componentesDeTema(declarado);
  const origen = origenes[nombre];
  const sitioDe = (capa: string): Sitio => {
    // Gana el nivel mas especifico de la cascada que fijo la Capa: estado, Tipo, base.
    const sitio = (estadoValido === undefined ? undefined : origen?.estados[estadoValido]?.[capa]) ?? (tipo === undefined ? undefined : origen?.tipos[tipo]?.[capa]) ?? origen?.base[capa];
    return sitio === undefined ? (origen?.sitio ?? INCORPORADO) : { file: sitio.file, line: sitio.line };
  };
  const aCapa = (capa: CapaDeTema, sitio: Sitio) => ({
    name: capa.nombre,
    primitive: capa.primitiva.tipo,
    props: capa.primitiva.props,
    above: capa.encima === true,
    animated: capa.animacion !== undefined,
    origin: sitio,
  });
  const capas = cascada(tema, { ...(tipo !== undefined && { tipo }), ...(estadoValido !== undefined && { estado: estadoValido }) }).map((capa: CapaDeTema) => aCapa(capa, sitioDe(capa.nombre)));
  const sitioDelTema = origen?.sitio ?? INCORPORADO;
  const situar = (capas: readonly CapaDescrita[]) => capas.map((capa) => ({ name: capa.nombre, primitive: capa.primitiva, props: capa.props, above: capa.encima, animated: capa.animada, origin: sitioDelTema }));
  const descritos = elementosDeTema(declarado, tipoDeDiagrama, tipo);
  const secuencia = Object.fromEntries(
    Object.entries(descritos.secuencia ?? {}).map(([nombre, e]) => [nombre, { layers: situar(e.capas), markers: e.marcadores, patches: Object.fromEntries(Object.entries(e.parches).map(([v, capas]) => [v, situar(capas)])), metrics: e.metricas, ...(e.derivado === true && { derived: true as const }) }]),
  );
  const elementos = {
    ...(descritos.secuencia !== undefined && { sequence: secuencia }),
    ...(descritos.fila !== undefined && { row: { ...(descritos.fila.alto !== undefined && { height: descritos.fila.alto }), layers: situar(descritos.fila.capas), ...(descritos.fila.derivado === true && { derived: true as const }) } }),
  };
  const pagina = {
    fixed: tema.pagina.fijo,
    layers: (tema.pagina.capas as CapaDeTema[]).map((capa) => {
      const sitio = origen?.pagina[capa.nombre];
      return aCapa(capa, sitio === undefined ? (origen?.sitio ?? INCORPORADO) : { file: sitio.file, line: sitio.line });
    }),
  };
  // Si ningun bloque escribe la disposicion de Slots, vale la del Tema (o el nucleo).
  const sitioDeSlots = (sitio: Sitio | undefined): Sitio => sitio ?? origen?.sitio ?? INCORPORADO;
  const tabla = tablaDeMetricas(declarado, tipoDeDiagrama);
  const delNodo = metricasDeNodo(tabla, tipo);
  const delGrupo = origen?.grupo;
  const sitioDeGrupo = (capa: string, colapsado: boolean): Sitio => {
    // Cascada: estado, colapsado, Tipo, base.
    const sitio =
      (estadoValido === undefined ? undefined : delGrupo?.estados[estadoValido]?.[capa]) ??
      (colapsado ? delGrupo?.colapsado[capa] : undefined) ??
      (tipo === undefined ? undefined : delGrupo?.tipos[tipo]?.[capa]) ??
      delGrupo?.base[capa];
    return sitio === undefined ? (origen?.sitio ?? INCORPORADO) : { file: sitio.file, line: sitio.line };
  };
  const pilaDeGrupo = (colapsado: boolean) =>
    cascada(tema, { ...(tipo !== undefined && { tipo }), ...(estadoValido !== undefined && { estado: estadoValido }), ...(colapsado && { colapsado }) }, 'grupo').map((capa: CapaDeTema) => aCapa(capa, sitioDeGrupo(capa.nombre, colapsado)));
  const grupo = {
    own: tema.grupo.capas.length > 0,
    header: describirDisposicion(tabla.grupoAbierto.disposicion),
    headerOrigin: sitioDeSlots(origen?.slots.grupo),
    headerHeight: alturaDeCabecera(tabla.grupoAbierto),
    padding: tema.grupo.padding,
    layers: pilaDeGrupo(false),
    collapsed: { slots: describirDisposicion(tabla.grupoColapsado.disposicion), slotsOrigin: sitioDeSlots(origen?.slots.colapsado ?? origen?.slots.nodo), layers: pilaDeGrupo(true) },
  };
  return {
    salida: {
      contractVersion: INSPECT_CONTRACT_VERSION,
      command: 'theme',
      theme: {
        name: nombre,
        ...(origen === undefined ? INCORPORADO : { file: origen.sitio.file, line: origen.sitio.line }),
        extends: origen?.extends ?? [],
        parts: origen?.partes ?? [],
        ...(tipo !== undefined && { kind: tipo }),
        ...(estadoValido !== undefined && { state: estadoValido }),
        ...(tipoDeDiagrama !== undefined && { diagram: tipoDeDiagrama }),
        layers: capas,
        page: pagina,
        group: grupo,
        ...(Object.keys(elementos).length > 0 && { elements: elementos }),
        slots: describirDisposicion(delNodo.disposicion),
        slotsOrigin: sitioDeSlots(origen?.slots.nodo),
        // `paddingGrupo` es del Grupo: la tabla del Nodo trae el valor por defecto, que no dice nada de este Tema.
        metrics: JSON.parse(JSON.stringify({ ...delNodo, paddingGrupo: tabla.grupoAbierto.paddingGrupo })) as never,
        hasCode: componentes.length > 0,
        components: componentes,
        ...(catalogo && { catalog: { primitives: Object.keys(CATALOGO), motions: Object.keys(MOVIMIENTOS), effects: [...EFECTOS] } }),
      },
    },
  };
}
