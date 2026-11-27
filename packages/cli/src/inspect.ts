/** The `inspect` query over a Session and the format of all its output (JSON and readable). */
import { inspectOutputSchema } from 'canonical';
import type { InspectCommand, InspectOutput } from 'canonical';
import type { QueryAnswer, Session } from 'session';

type Site = { file: string; line: number };


/** An `inspect` query; `type`, `status`, `diagram` and `catalog` only count for `theme`. */
export interface InspectQuery {
  command: InspectCommand;
  argument: string;
  type?: string;
  status?: string;
  diagram?: string;
  catalog?: boolean;
}

/** Terminal `inspect` (the query lives in `Session.query`; `GET /api/inspect` is run by the live Workspace); `undefined` if the Session has no source (errors). */
export function queryInspect(session: Session, { command, argument, type, status, diagram, catalog }: InspectQuery): QueryAnswer | undefined {
  if (command !== 'theme') return session.query({ command, argument });
  return session.query({ command, argument, catalog: catalog === true, ...(type !== undefined && { kind: type }), ...(status !== undefined && { state: status }), ...(diagram !== undefined && { diagram }) });
}

/** The output as `inspect --json` gives it (validated and normalized by the schema). */
export const asInspectOutput = (output: InspectOutput): InspectOutput => inspectOutputSchema.parse(output);

export const asJson = (output: InspectOutput): string => `${JSON.stringify(asInspectOutput(output), null, 2)}\n`;

const site = ({ file, line }: Site): string => `${file}:${line}`;
const title = (t: string): string => (t === '' ? '' : ` "${t}"`);

/** One line per result. */
export function readableText(output: InspectOutput): string {
  const lines: string[] = [];
  if (output.command === 'search') {
    for (const r of output.results) lines.push(r.kind === 'view' ? `view ${r.id} ${r.type} ${site(r)}` : r.kind === 'interaction' ? `interaction ${r.id}${title(r.title)} ${site(r)}` : `node ${r.id} ${r.type}${title(r.title)} ${site(r)}`);
    lines.push(`${output.results.length} ${output.results.length === 1 ? 'result' : 'results'}`);
  } else if (output.command === 'node') {
    const { node } = output;
    lines.push(`${node.id} ${node.type}${title(node.title)} ${site(node)}`);
    if (node.description !== '') lines.push(`  ${node.description}`);
    if (node.parent !== undefined) lines.push(`Parent: ${node.parent}`);
    if (node.children.length > 0) lines.push(`Children: ${node.children.join(', ')}`);
    if (node.attributes.length > 0) lines.push(`Attributes: ${node.attributes.map((a) => `${a.name}: ${a.type}`).join(', ')}`);
    lines.push('Edges:');
    for (const a of output.edges) {
      const another = a.direction === 'out' ? a.to : a.from;
      lines.push(`  ${a.direction === 'out' ? '->' : '<-'} ${another}${a.label === undefined ? '' : ` "${a.label}"`} ${site(a)}`);
    }
    lines.push('Views:');
    for (const v of output.views) lines.push(`  ${v.id} ${site(v)}`);
  } else if (output.command === 'interaction') {
    const { interaction: i } = output;
    lines.push(`${i.id}${title(i.title)} ${i.items} items ${site(i)}`);
    if (i.description !== '') lines.push(`  ${i.description}`);
    lines.push(`Messages: ${i.messages}`);
    lines.push(`Lifelines: ${i.lifelines.join(', ')}`);
    lines.push('Views:');
    for (const v of i.views) lines.push(`  ${v.id} ${site(v)}`);
  } else if (output.command === 'planned') {
    const { nodes, attributes, edges, interactions } = output.planned;
    for (const n of nodes) lines.push(`node ${n.id} ${n.type}${title(n.title)} ${site(n)}${n.inherited ? ' (inherited)' : ''}${n.spec.length === 0 ? '' : ` spec ${n.spec.join(', ')}`}`);
    for (const a of attributes) lines.push(`attribute ${a.node}#${a.name} ${site(a)}`);
    for (const e of edges) lines.push(`edge ${e.from} -> ${e.to}${e.label === undefined ? '' : ` "${e.label}"`} ${site(e)}${e.inherited ? ' (inherited)' : ''}`);
    for (const i of interactions) lines.push(`interaction ${i.id}${title(i.title)} ${site(i)}`);
    lines.push(`${nodes.length + attributes.length + edges.length + interactions.length} planned`);
  } else if (output.command === 'theme') {
    const { theme } = output;
    lines.push(`${theme.name} ${theme.file}:${theme.line}${theme.kind === undefined ? '' : ` kind=${theme.kind}`}${theme.state === undefined ? '' : ` state=${theme.state}`}${theme.diagram === undefined ? '' : ` diagram=${theme.diagram}`}`);
    lines.push(`extends: ${theme.extends.length === 0 ? '(none)' : theme.extends.join(' > ')}`);
    lines.push(`parts: ${theme.parts.length === 0 ? '(none)' : theme.parts.join(', ')}`);
    lines.push('Layers:');
    for (const c of theme.layers) {
      const props = Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ');
      lines.push(`  ${c.name} ${c.primitive}${props === '' ? '' : ` ${props}`}${c.above ? ' [above]' : ''}${c.animated ? ' [animated]' : ''} ${site(c.origin)}`);
    }
    lines.push(`Page:${theme.page.layers.length === 0 ? ' (only the background color)' : theme.page.fixed ? ' (fixed to the viewer)' : ' (moves with the camera)'}`);
    for (const c of theme.page.layers) {
      const props = Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ');
      lines.push(`  ${c.name} ${c.primitive}${props === '' ? '' : ` ${props}`} ${site(c.origin)}`);
    }
    const { group } = theme;
    lines.push(`Group:${group.own ? '' : ' (no group: sober stack derived from the Theme tokens, not the Node Layers)'}`);
    lines.push(`  header: ${group.header} (height ${group.headerHeight}) ${site(group.headerOrigin)}`);
    lines.push(`  padding: ${group.padding.top} ${group.padding.right} ${group.padding.bottom} ${group.padding.left}`);
    for (const [titulo, layers] of [['open', group.layers], ['collapsed', group.collapsed.layers]] as const) {
      if (layers.length > 0) lines.push(`  ${titulo}:`);
      for (const c of layers) {
        const props = Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ');
        lines.push(`    ${c.name} ${c.primitive}${props === '' ? '' : ` ${props}`}${c.above ? ' [above]' : ''}${c.animated ? ' [animated]' : ''} ${site(c.origin)}`);
      }
    }
    lines.push(`  collapsed header: ${group.collapsed.slots} ${site(group.collapsed.slotsOrigin)}`);
    const { elements } = theme;
    if (elements?.sequence !== undefined) {
      lines.push('Sequence:');
      for (const [name, block] of Object.entries(elements.sequence)) {
        const markerList = Object.entries(block.markers).map(([side, type]) => ` ${side}=${type}`).join('');
        const metrics = Object.entries(block.metrics).map(([key, value]) => ` ${key}=${value}`).join('');
        lines.push(`  ${name}${block.derived === true ? ' (derived)' : ''}:${markerList}${metrics}`);
        for (const c of block.layers) lines.push(`    ${c.name} ${c.primitive} ${Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ')}`.trimEnd());
        for (const [variantName, layers] of Object.entries(block.patches)) {
          lines.push(`    patch ${variantName}:`);
          for (const c of layers) lines.push(`      ${c.name} ${c.primitive} ${Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ')}`.trimEnd());
        }
      }
    }
    if (elements?.row !== undefined) {
      lines.push(`Row${elements.row.derived === true ? ' (derived)' : ''}: height ${elements.row.height ?? '(default)'}`);
      for (const c of elements.row.layers) lines.push(`  ${c.name} ${c.primitive} ${Object.entries(c.props).map(([k, v]) => `${k}=${v}`).join(' ')}`.trimEnd());
    }
    lines.push(`Slots: ${theme.slots} ${site(theme.slotsOrigin)}`);
    lines.push('Metrics:');
    for (const [key, value] of Object.entries(theme.metrics)) if (key !== 'disposicion') lines.push(`  ${key}: ${typeof value === 'object' ? JSON.stringify(value) : String(value)}`);
    lines.push(theme.hasCode ? `with code: ${theme.components.join(', ')}` : 'no code');
    if (theme.catalog !== undefined) {
      lines.push(`Primitives: ${theme.catalog.primitives.join(', ')}`);
      lines.push(`Motions: ${theme.catalog.motions.join(', ')}`);
      lines.push(`Effects: ${theme.catalog.effects.join(', ')}`);
    }
  } else {
    const { view } = output;
    lines.push(`${view.id} ${view.type}${view.interaction === undefined ? '' : ` (interaction ${view.interaction})`} ${site(view)}`);
    lines.push('Nodes:');
    for (const n of view.nodes) lines.push(`  ${n.id} ${n.type}${title(n.title)} ${site(n)}`);
    lines.push('Edges:');
    for (const a of view.edges) lines.push(`  ${a.from} -> ${a.to}${a.label === undefined ? '' : ` "${a.label}"`}${a.count > 1 ? ` (x${a.count})` : ''} ${site(a)}`);
  }
  return `${lines.join('\n')}\n`;
}
