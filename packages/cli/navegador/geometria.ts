/**
 * Lectura de la Geometria que `dev` recibe de `/api/vista/<id>`: se valida con el esquema de `canonico`
 * (la unica declaracion de su forma) y una malformada se reporta como error en vez de dibujarse rota.
 */
import { geometriaCacheadaSchema } from 'canonico';
import type { GeometriaCacheada } from 'canonico';

export interface GeometriasLeidas {
  /** Presente solo si todas las Vistas validaron. */
  porVista?: Record<string, GeometriaCacheada>;
  errores: string[];
}

export function leerGeometriasDeDev(crudas: Readonly<Record<string, unknown>>): GeometriasLeidas {
  const porVista: Record<string, GeometriaCacheada> = {};
  const errores: string[] = [];
  for (const [id, cruda] of Object.entries(crudas)) {
    const leida = geometriaCacheadaSchema.safeParse(cruda);
    if (leida.success) {
      porVista[id] = leida.data;
    } else {
      const primero = leida.error.issues[0];
      errores.push(`Geometria malformada en la Vista ${id}: ${primero?.path.join('.') ?? ''} ${primero?.message ?? ''}`.trim());
    }
  }
  return errores.length === 0 ? { porVista, errores } : { errores };
}
