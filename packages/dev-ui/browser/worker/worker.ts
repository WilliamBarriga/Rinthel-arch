/** Entry of the `dev` layout Web Worker: serves the layout (ELK) over the `self` port. */
import './prelude';

import { servirLayout } from 'shell';
import type { PuertoDeMensajes } from 'shell';

servirLayout(self as unknown as PuertoDeMensajes);
