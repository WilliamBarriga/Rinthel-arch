export function Aurora({ id, parametros }: { id: string; parametros: { hue: number } }) {
  return <i data-aurora={id} data-hue={parametros.hue} />;
}
