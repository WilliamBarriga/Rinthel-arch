/** La consulta de `inspect` sobre una Sesion y el formato de toda su salida (JSON y legible). */
import { inspectOutputSchema } from 'canonical';
import type { InspectCommand, InspectOutput } from 'canonical';
import type { QueryAnswer, Session } from 'session';

type Sitio = { file: string; line: number };


/** Una consulta de `inspect`; `tipo`, `estado`, `diagrama` y `catalogo` solo cuentan en `tema`. */
export interface ConsultaDeInspect {
  comando: InspectCommand;
  argumento: string;
  tipo?: string;
  estado?: string;
  diagrama?: string;
  catalogo?: boolean;
}

/** `inspect` de la terminal (la consulta vive en `Sesion.consultar`; `GET /api/inspect` la hace el Workspace vivo); `undefined` si la Sesion no tiene Fuente (errores). */
export function consultarInspect(sesion: Session, { comando, argumento, tipo, estado, diagrama, catalogo }: ConsultaDeInspect): QueryAnswer | undefined {
  if (comando !== 'theme') return sesion.query({ command: comando, argument: argumento });
  return sesion.query({ command: comando, argument: argumento, catalog: catalogo === true, ...(tipo !== undefined && { kind: tipo }), ...(estado !== undefined && { state: estado }), ...(diagrama !== undefined && { diagram: diagrama }) });
}

/** La salida tal como la da `inspect --json` (validada y normalizada por el esquema). */
export const comoSalidaDeInspect = (salida: InspectOutput): InspectOutput => inspectOutputSchema.parse(salida);

export const comoJson = (salida: InspectOutput): string => `${JSON.stringify(comoSalidaDeInspect(salida), null, 2)}\n`;

const sitio = ({ file, line }: Sitio): string => `${file}:${line}`;
const titulo = (t: string): string => (t === '' ? '' : ` "${t}"`);

/** Una linea por resultado. */
export function textoLegible(salida: InspectOutput): string {
  const lineas: string[] = [];
  if (salida.command === 'search') {
    for (const r of salida.results) lineas.push(r.kind === 'view' ? `view ${r.id} ${r.type} ${sitio(r)}` : r.kind === 'interaction' ? `interaction ${r.id}${titulo(r.title)} ${sitio(r)}` : `node ${r.id} ${r.type}${titulo(r.title)} ${sitio(r)}`);
    lineas.push(`${salida.results.length} ${salida.results.length === 1 ? 'result' : 'results'}`);
  } else if (salida.command === 'node') {
    const { node: nodo } = salida;
    lineas.push(`${nodo.id} ${nodo.type}${titulo(nodo.title)} ${sitio(nodo)}`);
    if (nodo.description !== '') lineas.push(`  ${nodo.description}`);
    if (nodo.parent !== undefined) lineas.push(`Parent: ${nodo.parent}`);
    if (nodo.children.length > 0) lineas.push(`Children: ${nodo.children.join(', ')}`);
    if (nodo.attributes.length > 0) lineas.push(`Attributes: ${nodo.attributes.map((a) => `${a.name}: ${a.type}`).join(', ')}`);
    lineas.push('Edges:');
    for (const a of salida.edges) {
      const otro = a.direction === 'out' ? a.to : a.from;
      lineas.push(`  ${a.direction === 'out' ? '->' : '<-'} ${otro}${a.label === undefined ? '' : ` "${a.label}"`} ${sitio(a)}`);
    }
    lineas.push('Views:');
    for (const v of salida.views) lineas.push(`  ${v.id} ${sitio(v)}`);
  } else if (salida.command === 'interaction') {
    const { interaction: i } = salida;
    lineas.push(`${i.id}${titulo(i.title)} ${i.items} items ${sitio(i)}`);
    if (i.description !== '') lineas.push(`  ${i.description}`);
    lineas.push(`Messages: ${i.messages}`);
    lineas.push(`Lifelines: ${i.lifelines.join(', ')}`);
    lineas.push('Views:');
    for (const v of i.views) lineas.push(`  ${v.id} ${sitio(v)}`);
  } else if (salida.command === 'planned') {
    const { nodes, attributes, edges, interactions } = salida.planned;
    for (const n of nodes) lineas.push(`node ${n.id} ${n.type}${titulo(n.title)} ${sitio(n)}${n.inherited ? ' (inherited)' : ''}${n.spec.length === 0 ? '' : ` spec ${n.spec.join(', ')}`}`);
    for (const a of attributes) lineas.push(`attribute ${a.node}#${a.name} ${sitio(a)}`);
    for (const e of edges) lineas.push(`edge ${e.from} -> ${e.to}${e.label === undefined ? '' : ` "${e.label}"`} ${sitio(e)}${e.inherited ? ' (inherited)' : ''}`);
    for (const i of interactions) lineas.push(`interaction ${i.id}${titulo(i.title)} ${sitio(i)}`);
    lineas.push(`${nodes.length + attributes.length + edges.length + interactions.length} planned`);
  } else if (salida.command === 'theme') {
    const { theme: tema } = salida;
    lineas.push(`${tema.name} ${tema.file}:${tema.line}${tema.kind === undefined ? '' : ` kind=${tema.kind}`}${tema.state === undefined ? '' : ` state=${tema.state}`}${tema.diagram === undefined ? '' : ` diagram=${tema.diagram}`}`);
    lineas.push(`extends: ${tema.extends.length === 0 ? '(none)' : tema.extends.join(' > ')}`);
    lineas.push(`parts: ${tema.parts.length === 0 ? '(none)' : tema.parts.join(', ')}`);
    lineas.push('Layers:');
    for (const c of tema.layers) {
      const props = Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ');
      lineas.push(`  ${c.name} ${c.primitive}${props === '' ? '' : ` ${props}`}${c.above ? ' [above]' : ''}${c.animated ? ' [animated]' : ''} ${sitio(c.origin)}`);
    }
    lineas.push(`Page:${tema.page.layers.length === 0 ? ' (only the background color)' : tema.page.fixed ? ' (fixed to the viewer)' : ' (moves with the camera)'}`);
    for (const c of tema.page.layers) {
      const props = Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ');
      lineas.push(`  ${c.name} ${c.primitive}${props === '' ? '' : ` ${props}`} ${sitio(c.origin)}`);
    }
    const { group: grupo } = tema;
    lineas.push(`Group:${grupo.own ? '' : ' (no group: sober stack derived from the Theme tokens, not the Node Layers)'}`);
    lineas.push(`  header: ${grupo.header} (height ${grupo.headerHeight}) ${sitio(grupo.headerOrigin)}`);
    lineas.push(`  padding: ${grupo.padding.top} ${grupo.padding.right} ${grupo.padding.bottom} ${grupo.padding.left}`);
    for (const [titulo, capas] of [['open', grupo.layers], ['collapsed', grupo.collapsed.layers]] as const) {
      if (capas.length > 0) lineas.push(`  ${titulo}:`);
      for (const c of capas) {
        const props = Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ');
        lineas.push(`    ${c.name} ${c.primitive}${props === '' ? '' : ` ${props}`}${c.above ? ' [above]' : ''}${c.animated ? ' [animated]' : ''} ${sitio(c.origin)}`);
      }
    }
    lineas.push(`  collapsed header: ${grupo.collapsed.slots} ${sitio(grupo.collapsed.slotsOrigin)}`);
    const { elements: elementos } = tema;
    if (elementos?.sequence !== undefined) {
      lineas.push('Sequence:');
      for (const [nombre, bloque] of Object.entries(elementos.sequence)) {
        const marcadores = Object.entries(bloque.markers).map(([lado, tipo]) => ` ${lado}=${tipo}`).join('');
        const metricas = Object.entries(bloque.metrics).map(([clave, valor]) => ` ${clave}=${valor}`).join('');
        lineas.push(`  ${nombre}${bloque.derived === true ? ' (derived)' : ''}:${marcadores}${metricas}`);
        for (const c of bloque.layers) lineas.push(`    ${c.name} ${c.primitive} ${Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ')}`.trimEnd());
        for (const [variante, capas] of Object.entries(bloque.patches)) {
          lineas.push(`    patch ${variante}:`);
          for (const c of capas) lineas.push(`      ${c.name} ${c.primitive} ${Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ')}`.trimEnd());
        }
      }
    }
    if (elementos?.row !== undefined) {
      lineas.push(`Row${elementos.row.derived === true ? ' (derived)' : ''}: height ${elementos.row.height ?? '(default)'}`);
      for (const c of elementos.row.layers) lineas.push(`  ${c.name} ${c.primitive} ${Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ')}`.trimEnd());
    }
    lineas.push(`Slots: ${tema.slots} ${sitio(tema.slotsOrigin)}`);
    lineas.push('Metrics:');
    for (const [clave, valor] of Object.entries(tema.metrics)) if (clave !== 'disposicion') lineas.push(`  ${clave}: ${typeof valor === 'object' ? JSON.stringify(valor) : String(valor)}`);
    lineas.push(tema.hasCode ? `with code: ${tema.components.join(', ')}` : 'no code');
    if (tema.catalog !== undefined) {
      lineas.push(`Primitives: ${tema.catalog.primitives.join(', ')}`);
      lineas.push(`Motions: ${tema.catalog.motions.join(', ')}`);
      lineas.push(`Effects: ${tema.catalog.effects.join(', ')}`);
    }
  } else {
    const { view: vista } = salida;
    lineas.push(`${vista.id} ${vista.type}${vista.interaction === undefined ? '' : ` (interaction ${vista.interaction})`} ${sitio(vista)}`);
    lineas.push('Nodes:');
    for (const n of vista.nodes) lineas.push(`  ${n.id} ${n.type}${titulo(n.title)} ${sitio(n)}`);
    lineas.push('Edges:');
    for (const a of vista.edges) lineas.push(`  ${a.from} -> ${a.to}${a.label === undefined ? '' : ` "${a.label}"`}${a.count > 1 ? ` (x${a.count})` : ''} ${sitio(a)}`);
  }
  return `${lineas.join('\n')}\n`;
}
