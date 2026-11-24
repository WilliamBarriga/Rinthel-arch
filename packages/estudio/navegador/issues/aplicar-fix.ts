/**
 * Aplicar `fix` contra `dev`: lo comparten el boton de un issue y "Aplicar N fix" del panel Issues y la accion en
 * linea del editor cuando el `fix` cae en otro archivo. Cada `fix` viaja como su `IssueFix` por la Escritura
 * (`escritura/escritura.ts`); varios van en una sola peticion (todo o nada, una entrada del Historial de archivos). Es el unico
 * pedido que reintenta: ante un 409 vuelve a elegir los `fix` sobre el estado recargado y reintenta una vez. Ante otro
 * rechazo (`overlapping-edits`, `invalid`...) no se escribio nada y el aviso da motivo y archivo.
 */
import type { EstadoDeDev, IssueDeDev } from '../../src/protocolo';
import type { ResultadoDeEnvio } from '../cliente';
import type { FixDeIssue } from '../editor/diagnosticos';
import type { ContextoDelEstudio } from '../marco/contexto';

/** Que `fix` aplicar sobre un estado (el visto o el recargado tras un 409); `descripcion` nombra la entrada del Historial de archivos. */
export type EleccionDeFix = (estado: EstadoDeDev) => { fixes: FixDeIssue[]; descripcion?: string };

/** Identidad de un issue que sobrevive a un cambio de posiciones: el 409 reubica el mismo issue en el estado nuevo. */
export const claveDeIssue = (issue: IssueDeDev): string => `${issue.file}\u0000${issue.code}\u0000${issue.message}`;

/** Elige el `fix` del issue con la misma identidad (para reintentar tras un 409). */
export const fixDelIssue =
  (issue: IssueDeDev): EleccionDeFix =>
  (estado) => ({ fixes: estado.issues.flatMap((i) => (i.fix !== undefined && claveDeIssue(i) === claveDeIssue(issue) ? [i.fix] : [])) });

export function aplicarFixes({ escribir }: Pick<ContextoDelEstudio, 'escribir'>, elegir: EleccionDeFix): Promise<ResultadoDeEnvio> {
  return escribir({
    ediciones: (estado) => {
      const { fixes, descripcion } = elegir(estado);
      return fixes.length === 0 ? undefined : { ediciones: fixes, ...(descripcion !== undefined && { descripcion }) };
    },
    fallo: 'No fix was applied',
    reintentar: true,
  });
}
