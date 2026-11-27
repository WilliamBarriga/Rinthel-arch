/** Entry of the `dev` layout Web Worker: serves the layout (ELK) over the `self` port. */
import './prelude';

import { serveLayout } from 'shell';
import type { LayoutPort } from 'shell';

serveLayout(self as unknown as LayoutPort);
