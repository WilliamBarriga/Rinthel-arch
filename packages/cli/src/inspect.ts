/** La consulta de `inspect` sobre una Sesion y el formato de toda su salida (JSON y legible). */
import { salidaDeInspectSchema } from 'canonico';
import type { ComandoDeInspect, SalidaDeInspect } from 'canonico';
import type { Respuesta, Sesion } from 'sesion';

type Sitio = { file: string; line: number };


/** Una consulta de `inspect`; `tipo`, `estado`, `diagrama` y `catalogo` solo cuentan en `tema`. */
export interface ConsultaDeInspect {
  comando: ComandoDeInspect;
  argumento: string;
  tipo?: string;
  estado?: string;
  diagrama?: string;
  catalogo?: boolean;
}

/** `inspect` de la terminal (la consulta vive en `Sesion.consultar`; `GET /api/inspect` la hace el Workspace vivo); `undefined` si la Sesion no tiene Fuente (errores). */
export function consultarInspect(sesion: Sesion, { comando, argumento, tipo, estado, diagrama, catalogo }: ConsultaDeInspect): Respuesta | undefined {
  if (comando !== 'theme') return sesion.consultar({ comando, argumento });
  return sesion.consultar({ comando, argumento, catalogo: catalogo === true, ...(tipo !== undefined && { tipo }), ...(estado !== undefined && { estado }), ...(diagrama !== undefined && { diagrama }) });
}

/** La salida tal como la da `inspect --json` (validada y normalizada por el esquema). */
export const comoSalidaDeInspect = (salida: SalidaDeInspect): SalidaDeInspect => salidaDeInspectSchema.parse(salida);

export const comoJson = (salida: SalidaDeInspect): string => `${JSON.stringify(comoSalidaDeInspect(salida), null, 2)}\n`;

const sitio = ({ file, line }: Sitio): string => `${file}:${line}`;
const titulo = (t: string): string => (t === '' ? '' : ` "${t}"`);

/** Una linea por resultado. */
export function textoLegible(salida: SalidaDeInspect): string {
  const lineas: string[] = [];
  if (salida.comando === 'search') {
    for (const r of salida.resultados) lineas.push(r.kind === 'view' ? `view ${r.id} ${r.type} ${sitio(r)}` : r.kind === 'interaction' ? `interaction ${r.id}${titulo(r.title)} ${sitio(r)}` : `node ${r.id} ${r.type}${titulo(r.title)} ${sitio(r)}`);
    lineas.push(`${salida.resultados.length} ${salida.resultados.length === 1 ? 'result' : 'results'}`);
  } else if (salida.comando === 'node') {
    const { nodo } = salida;
    lineas.push(`${nodo.id} ${nodo.type}${titulo(nodo.title)} ${sitio(nodo)}`);
    if (nodo.description !== '') lineas.push(`  ${nodo.description}`);
    if (nodo.parent !== undefined) lineas.push(`Parent: ${nodo.parent}`);
    if (nodo.children.length > 0) lineas.push(`Children: ${nodo.children.join(', ')}`);
    if (nodo.attributes.length > 0) lineas.push(`Attributes: ${nodo.attributes.map((a) => `${a.name}: ${a.type}`).join(', ')}`);
    lineas.push('Edges:');
    for (const a of salida.aristas) {
      const otro = a.direction === 'out' ? a.to : a.from;
      lineas.push(`  ${a.direction === 'out' ? '->' : '<-'} ${otro}${a.label === undefined ? '' : ` "${a.label}"`} ${sitio(a)}`);
    }
    lineas.push('Views:');
    for (const v of salida.vistas) lineas.push(`  ${v.id} ${sitio(v)}`);
  } else if (salida.comando === 'interaction') {
    const { interaccion: i } = salida;
    lineas.push(`${i.id}${titulo(i.title)} ${i.items} items ${sitio(i)}`);
    if (i.description !== '') lineas.push(`  ${i.description}`);
    lineas.push(`Messages: ${i.mensajes}`);
    lineas.push(`Lifelines: ${i.lifelines.join(', ')}`);
    lineas.push('Views:');
    for (const v of i.vistas) lineas.push(`  ${v.id} ${sitio(v)}`);
  } else if (salida.comando === 'theme') {
    const { tema } = salida;
    lineas.push(`${tema.name} ${tema.file}:${tema.line}${tema.tipo === undefined ? '' : ` kind=${tema.tipo}`}${tema.estado === undefined ? '' : ` state=${tema.estado}`}${tema.diagrama === undefined ? '' : ` diagram=${tema.diagrama}`}`);
    lineas.push(`extends: ${tema.extends.length === 0 ? '(none)' : tema.extends.join(' > ')}`);
    lineas.push(`parts: ${tema.partes.length === 0 ? '(none)' : tema.partes.join(', ')}`);
    lineas.push('Layers:');
    for (const c of tema.capas) {
      const props = Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ');
      lineas.push(`  ${c.nombre} ${c.primitiva}${props === '' ? '' : ` ${props}`}${c.encima ? ' [above]' : ''}${c.animada ? ' [animated]' : ''} ${sitio(c.origen)}`);
    }
    lineas.push(`Page:${tema.pagina.capas.length === 0 ? ' (only the background color)' : tema.pagina.fijo ? ' (fixed to the viewer)' : ' (moves with the camera)'}`);
    for (const c of tema.pagina.capas) {
      const props = Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ');
      lineas.push(`  ${c.nombre} ${c.primitiva}${props === '' ? '' : ` ${props}`} ${sitio(c.origen)}`);
    }
    const { grupo } = tema;
    lineas.push(`Group:${grupo.propio ? '' : ' (no group: sober stack derived from the Theme tokens, not the Node Layers)'}`);
    lineas.push(`  header: ${grupo.cabecera} (height ${grupo.alturaDeCabecera}) ${sitio(grupo.origenDeCabecera)}`);
    lineas.push(`  padding: ${grupo.padding.top} ${grupo.padding.right} ${grupo.padding.bottom} ${grupo.padding.left}`);
    for (const [titulo, capas] of [['abierto', grupo.capas], ['colapsado', grupo.colapsado.capas]] as const) {
      if (capas.length > 0) lineas.push(`  ${titulo}:`);
      for (const c of capas) {
        const props = Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ');
        lineas.push(`    ${c.nombre} ${c.primitiva}${props === '' ? '' : ` ${props}`}${c.encima ? ' [above]' : ''}${c.animada ? ' [animated]' : ''} ${sitio(c.origen)}`);
      }
    }
    lineas.push(`  collapsed header: ${grupo.colapsado.slots} ${sitio(grupo.colapsado.origenDeSlots)}`);
    const { elementos } = tema;
    if (elementos?.secuencia !== undefined) {
      lineas.push('Sequence:');
      for (const [nombre, bloque] of Object.entries(elementos.secuencia)) {
        const marcadores = Object.entries(bloque.marcadores).map(([lado, tipo]) => ` ${lado}=${tipo}`).join('');
        const metricas = Object.entries(bloque.metricas).map(([clave, valor]) => ` ${clave}=${valor}`).join('');
        lineas.push(`  ${nombre}${bloque.derivado === true ? ' (derived)' : ''}:${marcadores}${metricas}`);
        for (const c of bloque.capas) lineas.push(`    ${c.nombre} ${c.primitiva} ${Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ')}`.trimEnd());
        for (const [variante, capas] of Object.entries(bloque.parches)) {
          lineas.push(`    kind/op ${variante}:`);
          for (const c of capas) lineas.push(`      ${c.nombre} ${c.primitiva} ${Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ')}`.trimEnd());
        }
      }
    }
    if (elementos?.fila !== undefined) {
      lineas.push(`Row${elementos.fila.derivado === true ? ' (derived)' : ''}: height ${elementos.fila.alto ?? '(default)'}`);
      for (const c of elementos.fila.capas) lineas.push(`  ${c.nombre} ${c.primitiva} ${Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ')}`.trimEnd());
    }
    lineas.push(`Slots: ${tema.slots} ${sitio(tema.origenDeSlots)}`);
    lineas.push('Metrics:');
    for (const [clave, valor] of Object.entries(tema.metricas)) if (clave !== 'disposicion') lineas.push(`  ${clave}: ${typeof valor === 'object' ? JSON.stringify(valor) : String(valor)}`);
    lineas.push(tema.temaConCodigo ? `with code: ${tema.componentes.join(', ')}` : 'no code');
    if (tema.catalogo !== undefined) {
      lineas.push(`Primitives: ${tema.catalogo.primitivas.join(', ')}`);
      lineas.push(`Motions: ${tema.catalogo.movimientos.join(', ')}`);
      lineas.push(`Effects: ${tema.catalogo.efectos.join(', ')}`);
    }
  } else {
    const { vista } = salida;
    lineas.push(`${vista.id} ${vista.type}${vista.interaction === undefined ? '' : ` (interaction ${vista.interaction})`} ${sitio(vista)}`);
    lineas.push('Nodes:');
    for (const n of vista.nodos) lineas.push(`  ${n.id} ${n.type}${titulo(n.title)} ${sitio(n)}`);
    lineas.push('Edges:');
    for (const a of vista.aristas) lineas.push(`  ${a.from} -> ${a.to}${a.label === undefined ? '' : ` "${a.label}"`}${a.count > 1 ? ` (x${a.count})` : ''} ${sitio(a)}`);
  }
  return `${lineas.join('\n')}\n`;
}
