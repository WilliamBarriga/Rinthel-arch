/**
 * Lector incremental de `text/event-stream`: recibe trozos de texto y llama `alEvento(nombre, datos)` por evento
 * completo. Sin `event:` el nombre es `message`; varias lineas `data:` se unen con `\n`; los comentarios (`:`) se ignoran.
 * Lo usa el transporte de eventos sobre `fetch` (pruebas de contrato contra el `dev` real); el navegador usa `EventSource`.
 */
export function crearLectorSse(alEvento: (nombre: string, datos: string) => void): (trozo: string) => void {
  let resto = '';
  let nombre: string | undefined;
  let datos: string[] = [];
  const linea = (texto: string): void => {
    if (texto === '') {
      if (datos.length > 0) alEvento(nombre ?? 'message', datos.join('\n'));
      nombre = undefined;
      datos = [];
      return;
    }
    if (texto.startsWith(':')) return;
    const dosPuntos = texto.indexOf(':');
    const campo = dosPuntos < 0 ? texto : texto.slice(0, dosPuntos);
    const valor = dosPuntos < 0 ? '' : texto.slice(dosPuntos + 1).replace(/^ /, '');
    if (campo === 'event') nombre = valor;
    else if (campo === 'data') datos.push(valor);
  };
  return (trozo) => {
    resto += trozo;
    const lineas = resto.split(/\r\n|\n|\r/);
    resto = lineas.pop() ?? '';
    for (const l of lineas) linea(l);
  };
}
