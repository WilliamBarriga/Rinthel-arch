/** `inspect tema`: la consulta de un Tema (cadena `extends`, Capas, Grupo, Elementos, Slots y Metricas). Pura. */
import { INSPECT_CONTRACT_VERSION, candidatosCercanos } from 'canonico';
import type { FuenteCanonica } from 'canonico';
import type { OrigenDeTema } from 'dsl';
import { CATALOGO, EFECTOS, ESTADOS, MOVIMIENTOS, TIPOS_DE_DIAGRAMA, alturaDeCabecera, cascada, componentesDeTema, describirDisposicion, elementosDeTema, metricasDeNodo, parsearEstado, resolverTema, tablaDeMetricas, temaParaDiagrama } from 'tema';
import type { CapaDeTema, CapaDescrita } from 'tema';

import type { Respuesta } from './consultas';

type Sitio = { file: string; line: number };

/** Opciones de `inspect tema`: Tipo de nodo, estado y Tipo de diagrama de la cascada, y si se adjunta el catalogo. */
export interface OpcionesDeConsultaDeTema {
  tipo?: string;
  estado?: string;
  diagrama?: string;
  catalogo?: boolean;
}

const INCORPORADO: Sitio = { file: '(incorporado)', line: 1 };

/** Cadena `extends`, `part` usadas, pila de Capas para un Tipo y estado (con el sitio que fijo cada Capa), Metricas y uso de codigo. */
export function consultarTema(fuente: FuenteCanonica, origenes: Readonly<Record<string, OrigenDeTema>>, nombre: string, { tipo, estado, diagrama, catalogo = false }: OpcionesDeConsultaDeTema = {}): Respuesta {
  const declarado = fuente.themes.find((t) => t.name === nombre);
  if (declarado === undefined) {
    const cerca = candidatosCercanos(nombre, fuente.themes.map((t) => t.name));
    return { noEncontrado: `No such Theme '${nombre}'${cerca.length === 0 ? '' : `. Did you mean: ${cerca.join(', ')}`}`, cercanos: cerca };
  }
  const tipos = fuente.specification.nodeTypes.map((t) => t.name);
  if (tipo !== undefined && !tipos.includes(tipo)) {
    const cerca = candidatosCercanos(tipo, tipos);
    return { noEncontrado: `No such Node kind '${tipo}'${cerca.length === 0 ? '' : `. Did you mean: ${cerca.join(', ')}`}`, cercanos: cerca };
  }
  const parseado = estado === undefined ? undefined : parsearEstado(estado);
  if (parseado !== undefined && 'error' in parseado) {
    const { candidatos } = parseado.error;
    return { noEncontrado: `No such state '${estado}'${candidatos.length === 0 ? '' : `. Did you mean: ${candidatos.join(', ')}`}. States: ${ESTADOS.join(', ')}`, cercanos: [...candidatos] };
  }
  const tipoDeDiagrama = diagrama === undefined ? undefined : TIPOS_DE_DIAGRAMA.find((t) => t === diagrama);
  if (diagrama !== undefined && tipoDeDiagrama === undefined) {
    const cerca = candidatosCercanos(diagrama, TIPOS_DE_DIAGRAMA);
    return { noEncontrado: `No such Diagram type '${diagrama}'${cerca.length === 0 ? '' : `. Did you mean: ${cerca.join(', ')}`}. Types: ${TIPOS_DE_DIAGRAMA.join(', ')}`, cercanos: cerca };
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
    nombre: capa.nombre,
    primitiva: capa.primitiva.tipo,
    props: capa.primitiva.props,
    encima: capa.encima === true,
    animada: capa.animacion !== undefined,
    origen: sitio,
  });
  const capas = cascada(tema, { ...(tipo !== undefined && { tipo }), ...(estadoValido !== undefined && { estado: estadoValido }) }).map((capa: CapaDeTema) => aCapa(capa, sitioDe(capa.nombre)));
  const sitioDelTema = origen?.sitio ?? INCORPORADO;
  const situar = (capas: readonly CapaDescrita[]) => capas.map((capa) => ({ ...capa, origen: sitioDelTema }));
  const descritos = elementosDeTema(declarado, tipoDeDiagrama, tipo);
  const secuencia = Object.fromEntries(
    Object.entries(descritos.secuencia ?? {}).map(([nombre, e]) => [nombre, { ...e, capas: situar(e.capas), parches: Object.fromEntries(Object.entries(e.parches).map(([v, capas]) => [v, situar(capas)])) }]),
  );
  const elementos = {
    ...(descritos.secuencia !== undefined && { secuencia }),
    ...(descritos.fila !== undefined && { fila: { ...descritos.fila, capas: situar(descritos.fila.capas) } }),
  };
  const pagina = {
    fijo: tema.pagina.fijo,
    capas: (tema.pagina.capas as CapaDeTema[]).map((capa) => {
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
    propio: tema.grupo.capas.length > 0,
    cabecera: describirDisposicion(tabla.grupoAbierto.disposicion),
    origenDeCabecera: sitioDeSlots(origen?.slots.grupo),
    alturaDeCabecera: alturaDeCabecera(tabla.grupoAbierto),
    padding: tema.grupo.padding,
    capas: pilaDeGrupo(false),
    colapsado: { slots: describirDisposicion(tabla.grupoColapsado.disposicion), origenDeSlots: sitioDeSlots(origen?.slots.colapsado ?? origen?.slots.nodo), capas: pilaDeGrupo(true) },
  };
  return {
    salida: {
      contractVersion: INSPECT_CONTRACT_VERSION,
      comando: 'tema',
      tema: {
        name: nombre,
        ...(origen === undefined ? INCORPORADO : { file: origen.sitio.file, line: origen.sitio.line }),
        extends: origen?.extends ?? [],
        partes: origen?.partes ?? [],
        ...(tipo !== undefined && { tipo }),
        ...(estadoValido !== undefined && { estado: estadoValido }),
        ...(tipoDeDiagrama !== undefined && { diagrama: tipoDeDiagrama }),
        capas,
        pagina,
        grupo,
        ...(Object.keys(elementos).length > 0 && { elementos }),
        slots: describirDisposicion(delNodo.disposicion),
        origenDeSlots: sitioDeSlots(origen?.slots.nodo),
        // `paddingGrupo` es del Grupo: la tabla del Nodo trae el valor por defecto, que no dice nada de este Tema.
        metricas: JSON.parse(JSON.stringify({ ...delNodo, paddingGrupo: tabla.grupoAbierto.paddingGrupo })) as never,
        temaConCodigo: componentes.length > 0,
        componentes,
        ...(catalogo && { catalogo: { primitivas: Object.keys(CATALOGO), movimientos: Object.keys(MOVIMIENTOS), efectos: [...EFECTOS] } }),
      },
    },
  };
}
