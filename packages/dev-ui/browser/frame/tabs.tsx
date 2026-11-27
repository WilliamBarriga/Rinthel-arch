/**
 * Registry of the island tabs. Each panel is a component without props that reads `useDevUi()`; the order of the
 * array is the order of the tabs. A ticket that fills a panel replaces its `Content` here (or adds an entry); the
 * frame does not change. Stable ids: `openTab(side, id)` and the command registry use them. `devOnly` leaves them
 * out of the read-only export (`mode.ts`).
 */
import { lazy } from 'react';
import type { ComponentType } from 'react';

import { AgentPanel } from '../agent/agent-panel';
import { FollowAgent, AgentLastLine } from '../agent/pills';
import { Detail } from '../detail/detail';
import { HistoryPanel } from '../history/history-panel';
import { IssuesPanel } from '../issues/issues-panel';
import { ThemeGallery } from '../themes/theme-gallery';
import { ViewsPanel } from '../views/views-panel';
import type { WithMode } from './mode';

/** The editor (CodeMirror) is a separate chunk: it loads the first time Code opens. */
const CodePanel = lazy(() => import('../editor/code-panel').then((m) => ({ default: m.CodePanel })));

export interface PanelTab extends WithMode {
  id: string;
  name: string;
  Content: ComponentType;
  /** Stays mounted (hidden) while another tab is active: the editor keeps its state and fine-grained history (story 26). */
  keep?: boolean;
  /** On activation, the island widens up to this width (if it is narrower and the canvas allows it). */
  minimumWidth?: number;
}

/** Width at which the editor shows typical DSL lines without wrapping them. */
const EDITOR_WIDTH = 560;

export const LEFT_TABS: readonly PanelTab[] = [
  { id: 'vistas', name: 'Views', Content: ViewsPanel },
  { id: 'codigo', name: 'Code', Content: CodePanel, keep: true, minimumWidth: EDITOR_WIDTH, devOnly: true },
];

export const RIGHT_TABS: readonly PanelTab[] = [
  { id: 'detalle', name: 'Details', Content: Detail, devOnly: true },
  { id: 'issues', name: 'Issues', Content: IssuesPanel, devOnly: true },
  { id: 'temas', name: 'Themes', Content: ThemeGallery },
  { id: 'historial', name: 'Undo history', Content: HistoryPanel, devOnly: true },
  { id: 'agente', name: 'Agent', Content: AgentPanel, devOnly: true },
];

/**
 * Top bar pills after the brand and the breadcrumbs (Finder, agent last line, "follow the agent"). Same contract as
 * the panels: components without props that read `useDevUi()`.
 */
export const TOP_BAR_PILLS: readonly ({ id: string; Content: ComponentType } & WithMode)[] = [
  { id: 'ultima-linea-del-agente', Content: AgentLastLine, devOnly: true },
  { id: 'seguir-al-agente', Content: FollowAgent, devOnly: true },
];
