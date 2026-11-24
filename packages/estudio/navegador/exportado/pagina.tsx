/**
 * Entry of an exported Dev UI (`diagrams export`): reads the embedded data and the layout Worker code from the
 * document and mounts `<Estudio>` in export mode over the read-only client. No request leaves the file.
 */
import { createRoot } from 'react-dom/client';

import { hashDelNavegador } from 'shell';

import { datosDeExportadoSchema } from '../../src/exportado';
import { ID_DE_LOS_DATOS, ID_DEL_WORKER } from '../../src/rutas';
import { Estudio } from '../estudio';
import { layoutExportado } from './layout';
import { propsDeExportado } from './props';

const texto = (id: string): string => document.getElementById(id)?.textContent ?? '';

const datos = datosDeExportadoSchema.parse(JSON.parse(texto(ID_DE_LOS_DATOS)));
createRoot(document.getElementById('raiz') as HTMLElement).render(<Estudio {...propsDeExportado(datos)} hash={hashDelNavegador(window)} layout={layoutExportado(texto(ID_DEL_WORKER))} />);
