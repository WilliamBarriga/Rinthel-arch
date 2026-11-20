/**
 * Aplicar `fix` contra `dev`: lo comparten el boton de un issue y "Aplicar N fix" del panel Issues y la accion en
 * linea del editor cuando el `fix` cae en otro archivo. Cada `fix` viaja como su `IssueFix` por `POST /api/edit`
 * con la `version` del estado en que se vio; varios van en una sola peticion (todo o nada, una entrada del Historial).
 * Ante un 409 recarga el estado, vuelve a elegir los `fix` sobre el estado nuevo y reintenta una vez. Ante otro
 * rechazo (`ediciones-solapadas`, `invalida`...) no se escribio nada y avisa con motivo y archivo.
 */
import type { EstadoDeDev, IssueDeDev } from '../../src/protocolo';
import type { ResultadoDeEnvio } from '../cliente';
import type { FixDeIssue } from '../editor/diagnosticos';
import type { ContextoDelEstudio } from '../marco/contexto';

/** Que `fix` aplicar sobre un estado (el visto o el recargado tras un 409); `descripcion` nombra la entrada del Historial. */
export type EleccionDeFix = (estado: EstadoDeDev) => { fixes: FixDeIssue[]; descripcion?: string };

/** Identidad de un issue que sobrevive a un cambio de posiciones: el 409 reubica el mismo issue en el estado nuevo. */
export const claveDeIssue = (issue: IssueDeDev): string => `${issue.file}\u0000${issue.code}\u0000${issue.message}`;

/** Elige el `fix` del issue con la misma identidad (para reintentar tras un 409). */
export const fixDelIssue =
  (issue: IssueDeDev): EleccionDeFix =>
  (estado) => ({ fixes: estado.issues.flatMap((i) => (i.fix !== undefined && claveDeIssue(i) === claveDeIssue(issue) ? [i.fix] : [])) });

type Dependencias = Pick<ContextoDelEstudio, 'estado' | 'cliente' | 'avisar' | 'recargar'>;

export async function aplicarFixes(estudio: Dependencias, elegir: EleccionDeFix): Promise<ResultadoDeEnvio> {
  const { cliente, avisar } = estudio;
  const enviar = (estado: EstadoDeDev | undefined): Promise<ResultadoDeEnvio> | undefined => {
    if (estado === undefined) return undefined;
    const { fixes, descripcion } = elegir(estado);
    if (fixes.length === 0) return undefined;
    return cliente.editarTexto({ ediciones: fixes, version: estado.version, ...(descripcion !== undefined && { descripcion }) });
  };
  const sinFix: ResultadoDeEnvio = { ok: false, desactualizado: false, mensaje: 'No quedan fix que aplicar' };

  let r = (await enviar(estudio.estado)) ?? sinFix;
  if (!r.ok && r.desactualizado) {
    await estudio.recargar().catch(() => undefined);
    r = (await enviar(await cliente.estado())) ?? sinFix;
  }
  if (!r.ok) avisar(avisoDeRechazo(r));
  return r;
}

function avisoDeRechazo(r: Extract<ResultadoDeEnvio, { ok: false }>): string {
  const motivo = [r.motivo, r.file === undefined ? undefined : `en ${r.file}`].filter((x) => x !== undefined).join(' ');
  return `No se aplico ningun fix${motivo === '' ? '' : ` (${motivo})`}: ${r.mensaje}`;
}
