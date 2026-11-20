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
  if (comando !== 'tema') return sesion.consultar({ comando, argumento });
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
