/**
 * The UI names the View in the URL as `#view=<id>`; the shell stores it as `p` (drill-down path). This adapter
 * translates only that key and leaves the rest (`s`, `t`, `cam`, `e`, `c`) as is.
 */
import type { HashAdapter } from 'shell';

const rename = (hash: string, labelsOf: string, a: string): string => {
  const entry = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
  const output = new URLSearchParams();
  for (const [key, value] of entry) output.append(key === labelsOf ? a : key, value);
  return output.toString();
};

/** Shell hash (without `#`) -> UI hash. */
export const toDevUiHash = (hash: string): string => rename(hash, 'p', 'view');

/** UI hash (with or without `#`) -> shell hash. */
export const fromDevUiHash = (hash: string): string => rename(hash, 'view', 'p');

export function devUiHash(base: HashAdapter): HashAdapter {
  return {
    read: () => fromDevUiHash(base.read()),
    write: (hash, options) => base.write(toDevUiHash(hash), options),
    subscribe: (notice) => base.subscribe(notice),
  };
}
