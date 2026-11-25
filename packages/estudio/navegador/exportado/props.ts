/** Props of `<Estudio>` in export mode from the embedded data (the page of the exported HTML and the jsdom tests). */
import type { DatosDeExportado } from '../../src/exportado';
import type { ClienteDeDev } from '../cliente';
import type { ModoDelEstudio } from '../marco/modo';
import { crearClienteDeSoloLectura } from './cliente-de-solo-lectura';

export interface PropsDeExportado {
  cliente: ClienteDeDev;
  modo: ModoDelEstudio;
  urlDeFuente: (ruta: string) => string;
  confirmar: (mensaje: string) => boolean;
}

/** A `data:` URL as a `blob:` URL (created once per path; the page never revokes them). */
function blobDe(dataUrl: string): string {
  const coma = dataUrl.indexOf(',');
  const tipo = /^data:([^;,]*)/.exec(dataUrl)?.[1] ?? '';
  const binario = atob(dataUrl.slice(coma + 1));
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: tipo }));
}

/**
 * Fonts go to the viewer as `blob:` URLs: the `@font-face` sheet of `render` percent-encodes the `;` of a
 * `data:...;base64,` URL, which the browser then cannot decode. A font that could not be embedded gives an empty URL
 * (the viewer keeps its fallback font).
 */
function urlsDeFuentes(fuentes: DatosDeExportado['fuentes']): (ruta: string) => string {
  const creadas = new Map<string, string>();
  return (ruta) => {
    const dataUrl = fuentes[ruta];
    if (dataUrl === undefined) return '';
    let url = creadas.get(ruta);
    if (url === undefined) creadas.set(ruta, (url = blobDe(dataUrl)));
    return url;
  };
}

export function propsDeExportado(datos: DatosDeExportado): PropsDeExportado {
  return {
    cliente: crearClienteDeSoloLectura(datos),
    modo: 'export',
    urlDeFuente: urlsDeFuentes(datos.fuentes),
    // The code of the Themes was trusted by whoever exported.
    confirmar: () => true,
  };
}
