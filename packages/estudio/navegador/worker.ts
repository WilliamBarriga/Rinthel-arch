/** Entrada del Web Worker de layout de `dev`: sirve el layout (ELK) por el puerto `self`. */
import './preludio';

import { servirLayout } from 'shell';
import type { PuertoDeMensajes } from 'shell';

servirLayout(self as unknown as PuertoDeMensajes);
