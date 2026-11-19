/** `inspect tema` y el formato de toda la salida de `inspect`. */
import { INSPECT_CONTRACT_VERSION, candidatosCercanos, salidaDeInspectSchema } from 'canonico';
import type { FuenteCanonica, SalidaDeInspect } from 'canonico';
import type { OrigenDeTema } from 'dsl';
import type { Respuesta, Sesion } from 'sesion';
import { CATALOGO, EFECTOS, ESTADOS, MOVIMIENTOS, TIPOS_DE_DIAGRAMA, alturaDeCabecera, cascada, componentesDeTema, describirDisposicion, elementosDeTema, metricasDeNodo, parsearEstado, resolverTema, tablaDeMetricas, temaParaDiagrama } from 'tema';
import type { CapaDeTema, CapaDescrita } from 'tema';

type Sitio = { file: string; line: number };

export const SUBCOMANDOS_DE_INSPECT = ['buscar', 'nodo', 'vista', 'interaccion', 'tema'] as const;
export type SubcomandoDeInspect = (typeof SUBCOMANDOS_DE_INSPECT)[number];

/** Una consulta de `inspect`; `tipo`, `estado`, `diagrama` y `catalogo` solo cuentan en `tema`. */
export interface ConsultaDeInspect {
  comando: SubcomandoDeInspect;
  argumento: string;
  tipo?: string;
  estado?: string;
  diagrama?: string;
  catalogo?: boolean;
}

/** Implementacion unica de `inspect` y de `GET /api/inspect`; `undefined` si la Sesion no tiene Fuente (errores). */
export function consultarInspect(sesion: Sesion, { comando, argumento, tipo, estado, diagrama, catalogo }: ConsultaDeInspect): Respuesta | undefined {
  if (sesion.fuente === undefined) return undefined;
  if (comando !== 'tema') return sesion.consultar({ comando, argumento });
  return consultarTema(sesion.fuente, sesion.origenesDeTema, { nombre: argumento, catalogo: catalogo === true, ...(tipo !== undefined && { tipo }), ...(estado !== undefined && { estado }), ...(diagrama !== undefined && { diagrama }) });
}

interface ConsultaDeTema {
  nombre: string;
  tipo?: string;
  estado?: string;
  diagrama?: string;
  catalogo: boolean;
}

const INCORPORADO: Sitio = { file: '(incorporado)', line: 1 };

/** Cadena `extends`, `part` usadas, pila de Capas para un Tipo y estado (con el sitio que fijo cada Capa), Metricas y uso de codigo. */
export function consultarTema(fuente: FuenteCanonica, origenes: Readonly<Record<string, OrigenDeTema>>, { nombre, tipo, estado, diagrama, catalogo }: ConsultaDeTema): Respuesta {
  const declarado = fuente.themes.find((t) => t.name === nombre);
  if (declarado === undefined) {
    const cerca = candidatosCercanos(nombre, fuente.themes.map((t) => t.name));
    return { noEncontrado: `No existe el Tema '${nombre}'${cerca.length === 0 ? '' : `. Quiza: ${cerca.join(', ')}`}`, cercanos: cerca };
  }
  const tipos = fuente.specification.nodeTypes.map((t) => t.name);
  if (tipo !== undefined && !tipos.includes(tipo)) {
    const cerca = candidatosCercanos(tipo, tipos);
    return { noEncontrado: `No existe el Tipo de nodo '${tipo}'${cerca.length === 0 ? '' : `. Quiza: ${cerca.join(', ')}`}`, cercanos: cerca };
  }
  const parseado = estado === undefined ? undefined : parsearEstado(estado);
  if (parseado !== undefined && 'error' in parseado) {
    const { candidatos } = parseado.error;
    return { noEncontrado: `No existe el estado '${estado}'${candidatos.length === 0 ? '' : `. Quiza: ${candidatos.join(', ')}`}. Estados: ${ESTADOS.join(', ')}`, cercanos: [...candidatos] };
  }
  const tipoDeDiagrama = diagrama === undefined ? undefined : TIPOS_DE_DIAGRAMA.find((t) => t === diagrama);
  if (diagrama !== undefined && tipoDeDiagrama === undefined) {
    const cerca = candidatosCercanos(diagrama, TIPOS_DE_DIAGRAMA);
    return { noEncontrado: `No existe el Tipo de diagrama '${diagrama}'${cerca.length === 0 ? '' : `. Quiza: ${cerca.join(', ')}`}. Tipos: ${TIPOS_DE_DIAGRAMA.join(', ')}`, cercanos: cerca };
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

/** La salida tal como la da `inspect --json` (validada y normalizada por el esquema). */
export const comoSalidaDeInspect = (salida: SalidaDeInspect): SalidaDeInspect => salidaDeInspectSchema.parse(salida);

export const comoJson = (salida: SalidaDeInspect): string => `${JSON.stringify(comoSalidaDeInspect(salida), null, 2)}\n`;

const sitio = ({ file, line }: Sitio): string => `${file}:${line}`;
const titulo = (t: string): string => (t === '' ? '' : ` "${t}"`);

/** Una linea por resultado. */
export function textoLegible(salida: SalidaDeInspect): string {
  const lineas: string[] = [];
  if (salida.comando === 'buscar') {
    for (const r of salida.resultados) lineas.push(r.kind === 'vista' ? `vista ${r.id} ${r.type} ${sitio(r)}` : r.kind === 'interaccion' ? `interaccion ${r.id}${titulo(r.title)} ${sitio(r)}` : `nodo ${r.id} ${r.type}${titulo(r.title)} ${sitio(r)}`);
    lineas.push(`${salida.resultados.length} ${salida.resultados.length === 1 ? 'resultado' : 'resultados'}`);
  } else if (salida.comando === 'nodo') {
    const { nodo } = salida;
    lineas.push(`${nodo.id} ${nodo.type}${titulo(nodo.title)} ${sitio(nodo)}`);
    if (nodo.description !== '') lineas.push(`  ${nodo.description}`);
    if (nodo.parent !== undefined) lineas.push(`Padre: ${nodo.parent}`);
    if (nodo.children.length > 0) lineas.push(`Hijos: ${nodo.children.join(', ')}`);
    if (nodo.attributes.length > 0) lineas.push(`Atributos: ${nodo.attributes.map((a) => `${a.name}: ${a.type}`).join(', ')}`);
    lineas.push('Aristas:');
    for (const a of salida.aristas) {
      const otro = a.direction === 'out' ? a.to : a.from;
      lineas.push(`  ${a.direction === 'out' ? '->' : '<-'} ${otro}${a.label === undefined ? '' : ` "${a.label}"`} ${sitio(a)}`);
    }
    lineas.push('Vistas:');
    for (const v of salida.vistas) lineas.push(`  ${v.id} ${sitio(v)}`);
  } else if (salida.comando === 'interaccion') {
    const { interaccion: i } = salida;
    lineas.push(`${i.id}${titulo(i.title)} ${i.items} items ${sitio(i)}`);
    if (i.description !== '') lineas.push(`  ${i.description}`);
    lineas.push(`Mensajes: ${i.mensajes}`);
    lineas.push(`Lifelines: ${i.lifelines.join(', ')}`);
    lineas.push('Vistas:');
    for (const v of i.vistas) lineas.push(`  ${v.id} ${sitio(v)}`);
  } else if (salida.comando === 'tema') {
    const { tema } = salida;
    lineas.push(`${tema.name} ${tema.file}:${tema.line}${tema.tipo === undefined ? '' : ` tipo=${tema.tipo}`}${tema.estado === undefined ? '' : ` estado=${tema.estado}`}${tema.diagrama === undefined ? '' : ` diagrama=${tema.diagrama}`}`);
    lineas.push(`extends: ${tema.extends.length === 0 ? '(ninguno)' : tema.extends.join(' > ')}`);
    lineas.push(`partes: ${tema.partes.length === 0 ? '(ninguna)' : tema.partes.join(', ')}`);
    lineas.push('Capas:');
    for (const c of tema.capas) {
      const props = Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ');
      lineas.push(`  ${c.nombre} ${c.primitiva}${props === '' ? '' : ` ${props}`}${c.encima ? ' [encima]' : ''}${c.animada ? ' [animada]' : ''} ${sitio(c.origen)}`);
    }
    lineas.push(`Pagina:${tema.pagina.capas.length === 0 ? ' (solo el color background)' : tema.pagina.fijo ? ' (fija al visor)' : ' (se mueve con la camara)'}`);
    for (const c of tema.pagina.capas) {
      const props = Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ');
      lineas.push(`  ${c.nombre} ${c.primitiva}${props === '' ? '' : ` ${props}`} ${sitio(c.origen)}`);
    }
    const { grupo } = tema;
    lineas.push(`Grupo:${grupo.propio ? '' : ' (sin group: pila sobria derivada de los tokens del Tema, no las Capas del Nodo)'}`);
    lineas.push(`  cabecera: ${grupo.cabecera} (alto ${grupo.alturaDeCabecera}) ${sitio(grupo.origenDeCabecera)}`);
    lineas.push(`  padding: ${grupo.padding.top} ${grupo.padding.right} ${grupo.padding.bottom} ${grupo.padding.left}`);
    for (const [titulo, capas] of [['abierto', grupo.capas], ['colapsado', grupo.colapsado.capas]] as const) {
      if (capas.length > 0) lineas.push(`  ${titulo}:`);
      for (const c of capas) {
        const props = Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ');
        lineas.push(`    ${c.nombre} ${c.primitiva}${props === '' ? '' : ` ${props}`}${c.encima ? ' [encima]' : ''}${c.animada ? ' [animada]' : ''} ${sitio(c.origen)}`);
      }
    }
    lineas.push(`  colapsado cabecera: ${grupo.colapsado.slots} ${sitio(grupo.colapsado.origenDeSlots)}`);
    const { elementos } = tema;
    if (elementos?.secuencia !== undefined) {
      lineas.push('Secuencia:');
      for (const [nombre, bloque] of Object.entries(elementos.secuencia)) {
        const marcadores = Object.entries(bloque.marcadores).map(([lado, tipo]) => ` ${lado}=${tipo}`).join('');
        const metricas = Object.entries(bloque.metricas).map(([clave, valor]) => ` ${clave}=${valor}`).join('');
        lineas.push(`  ${nombre}${bloque.derivado === true ? ' (derivado)' : ''}:${marcadores}${metricas}`);
        for (const c of bloque.capas) lineas.push(`    ${c.nombre} ${c.primitiva} ${Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ')}`.trimEnd());
        for (const [variante, capas] of Object.entries(bloque.parches)) {
          lineas.push(`    kind/op ${variante}:`);
          for (const c of capas) lineas.push(`      ${c.nombre} ${c.primitiva} ${Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ')}`.trimEnd());
        }
      }
    }
    if (elementos?.fila !== undefined) {
      lineas.push(`Fila${elementos.fila.derivado === true ? ' (derivado)' : ''}: alto ${elementos.fila.alto ?? '(defecto)'}`);
      for (const c of elementos.fila.capas) lineas.push(`  ${c.nombre} ${c.primitiva} ${Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ')}`.trimEnd());
    }
    lineas.push(`Slots: ${tema.slots} ${sitio(tema.origenDeSlots)}`);
    lineas.push('Metricas:');
    for (const [clave, valor] of Object.entries(tema.metricas)) if (clave !== 'disposicion') lineas.push(`  ${clave}: ${typeof valor === 'object' ? JSON.stringify(valor) : String(valor)}`);
    lineas.push(tema.temaConCodigo ? `con codigo: ${tema.componentes.join(', ')}` : 'sin codigo');
    if (tema.catalogo !== undefined) {
      lineas.push(`Primitivas: ${tema.catalogo.primitivas.join(', ')}`);
      lineas.push(`Movimientos: ${tema.catalogo.movimientos.join(', ')}`);
      lineas.push(`Efectos: ${tema.catalogo.efectos.join(', ')}`);
    }
  } else {
    const { vista } = salida;
    lineas.push(`${vista.id} ${vista.type}${vista.interaction === undefined ? '' : ` (interaccion ${vista.interaction})`} ${sitio(vista)}`);
    lineas.push('Nodos:');
    for (const n of vista.nodos) lineas.push(`  ${n.id} ${n.type}${titulo(n.title)} ${sitio(n)}`);
    lineas.push('Aristas:');
    for (const a of vista.aristas) lineas.push(`  ${a.from} -> ${a.to}${a.label === undefined ? '' : ` "${a.label}"`}${a.count > 1 ? ` (x${a.count})` : ''} ${sitio(a)}`);
  }
  return `${lineas.join('\n')}\n`;
}
