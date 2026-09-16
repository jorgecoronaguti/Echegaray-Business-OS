// LO PURO DE LA MARCA «PAGADA» — sin JSX ni alias, para que `node --test` lo ejecute. El componente está en
// `MarcaDePago.tsx`; el color lo pone la grilla con `V.posSuave` cuando esto dice que la fila está pagada.

/** ¿La fila lleva la marca? Un sello vacío o inválido no la lleva. */
export const filaPagada = (pagadaEn: string | null | undefined): boolean =>
  typeof pagadaEn === 'string' && pagadaEn !== '' && !Number.isNaN(new Date(pagadaEn).getTime())

/** «16/09» del sello, en la hora de la máquina que lo mira. */
export function diaDelSello(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}
