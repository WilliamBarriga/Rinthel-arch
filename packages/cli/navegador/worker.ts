/**
 * Entrada del Web Worker del HTML autocontenido: sirve el layout (ELK) por el
 * puerto `self`. `html.ts` la empaqueta aparte de la pagina y la incrusta como texto; la pagina la
 * ejecuta en un Worker (via Blob) o, si no puede, en el hilo principal con un puerto en memoria.
 */
import './preludio';

import { servirLayout } from 'shell';
import type { PuertoDeMensajes } from 'shell';

servirLayout(self as unknown as PuertoDeMensajes);
