import type { WorkspaceFiles } from 'dsl';

import type { WorkspacePort } from './apply';

export interface InMemoryWorkspace extends WorkspacePort {
  /** Removes an own file; a missing one is not an error. */
  remove(path: string): void;
  /** Current text of an own file (`undefined` if it does not exist). */
  text(path: string): string | undefined;
  /** Foreign write to a `--theme-path` file (for tests); `undefined` removes it. `applyToWorkspace` never uses it. */
  writeTheme(path: string, text: string | undefined): void;
}

export interface InMemoryContent {
  own: WorkspaceFiles;
  /** Themes from `--theme-path`: merged before the own files (which win on repeated paths). */
  themes?: WorkspaceFiles;
}

/** `write` and `remove` only touch the own files. */
export function inMemoryWorkspace({ own, themes: initialThemes = {} }: InMemoryContent): InMemoryWorkspace {
  let files: Record<string, string> = { ...own };
  let themes: Record<string, string> = { ...initialThemes };
  return {
    read: () => ({ disk: { ...themes, ...files }, own: { ...files } }),
    write(path, text) {
      files = { ...files, [path]: text };
    },
    remove(path) {
      const { [path]: _removed, ...rest } = files;
      files = rest;
    },
    text: (path) => files[path],
    writeTheme(path, text) {
      const { [path]: _previous, ...rest } = themes;
      themes = text === undefined ? rest : { ...rest, [path]: text };
    },
  };
}
