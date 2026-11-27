/**
 * Entry of an exported Dev UI (`diagrams export`): reads the embedded data and the layout Worker code from the
 * document and mounts `<DevUi>` in export mode over the read-only client. No request leaves the file.
 */
import { createRoot } from 'react-dom/client';

import { browserHash } from 'shell';

import { exportDataSchema } from '../../src/export';
import { DATA_ID, WORKER_ID } from '../../src/routes';
import { DevUi } from '../dev-ui';
import { exportedLayout } from './layout';
import { exportProps } from './props';

const text = (id: string): string => document.getElementById(id)?.textContent ?? '';

const data = exportDataSchema.parse(JSON.parse(text(DATA_ID)));
createRoot(document.getElementById('raiz') as HTMLElement).render(<DevUi {...exportProps(data)} hash={browserHash(window)} layout={exportedLayout(text(WORKER_ID))} />);
