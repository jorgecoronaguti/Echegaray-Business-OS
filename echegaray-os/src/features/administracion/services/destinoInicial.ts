/**
 * QUÉ OBRA PROPONE EL PANEL DE CORRECCIÓN AL ABRIRSE.
 *
 * El `<select>` de obra sólo lista obras ACTIVAS (a una cerrada no se le cargan horas). Con la fila
 * por persona, las horas del día pueden estar en una obra que ya no está activa: si el valor inicial
 * fuera ese id, no existiría entre las opciones y el navegador pintaría la primera — la pantalla
 * nombraría un destino distinto del que manda (hallazgo del auditor, 08/09/2026). Por eso el valor
 * inicial sólo es la obra del tramo cuando ESTÁ entre las elegibles; si no, queda vacío y el panel
 * pide elegir.
 */
export function obraDestinoInicial(
  obraDelTramo: string | null | undefined,
  obraPorDefecto: string | null | undefined,
  elegibles: readonly { id: string }[],
): string {
  const ids = new Set(elegibles.map((o) => o.id))
  if (obraDelTramo && ids.has(obraDelTramo)) return obraDelTramo
  if (obraPorDefecto && ids.has(obraPorDefecto)) return obraPorDefecto
  return ''
}
