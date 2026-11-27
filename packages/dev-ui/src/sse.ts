/**
 * Incremental `text/event-stream` reader: receives text chunks and calls `onEvent(name, data)` per complete event.
 * Without `event:` the name is `message`; several `data:` lines are joined with `\n`; comments (`:`) are ignored.
 * The event transport over `fetch` uses it (contract tests against the real `dev`); the browser uses `EventSource`.
 */
export function createSseReader(onEvent: (name: string, data: string) => void): (chunk: string) => void {
  let rest = '';
  let name: string | undefined;
  let data: string[] = [];
  const line = (text: string): void => {
    if (text === '') {
      if (data.length > 0) onEvent(name ?? 'message', data.join('\n'));
      name = undefined;
      data = [];
      return;
    }
    if (text.startsWith(':')) return;
    const colon = text.indexOf(':');
    const field = colon < 0 ? text : text.slice(0, colon);
    const value = colon < 0 ? '' : text.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') name = value;
    else if (field === 'data') data.push(value);
  };
  return (chunk) => {
    rest += chunk;
    const lines = rest.split(/\r\n|\n|\r/);
    rest = lines.pop() ?? '';
    for (const l of lines) line(l);
  };
}
