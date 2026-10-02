// LOS RECIBOS DE UN LOTE EN PDF — A4 horizontal, cuatro por hoja (2 × 2), con líneas de corte.
//
// Dueño, 01/10/2026: *«un formato horizontal para meter 4 en una hoja A4 y de manera masiva»*; y al rehacerlo, la
// vista previa ofrece «Guardar y descargar PDF» además de imprimir. Es el mismo papel que dibuja
// `HojasDeRecibosA4.tsx` para la impresora: mismo orden, mismos renglones, mismo logo, mismas tres firmas.
//
// ═══ SE DIBUJA LO GUARDADO, NO LO QUE LA PANTALLA TIENE EN MEMORIA ═══
//
// La ruta lee `recibo_liquidacion` por id y este módulo dibuja esos renglones: un PDF descargado es exactamente lo
// que quedó en el legajo. Acá no se calcula nada.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { aWinAnsi } from '../../obras/services/cierreObra.ts'
import { dibujarLogoPdf } from '../../../shared/exportar/logoPdf.ts'
import { pesos } from '../components/liquidacion/formato.ts'
import type { RenglonesSellados } from './reciboEmitido.ts'
import { rotuloDelNumero } from '../../../shared/recibo/codigoDeRecibo.ts'

export interface ReciboParaElPdf {
  nombre: string
  categoria: string | null
  quincenaDesde: string
  quincenaHasta: string
  total: number | null
  renglones: RenglonesSellados
  /** El número que le dio la base (RP-000123). El PDF sale de lo guardado, así que siempre lo trae. */
  codigo: string | null
}

export const RECIBOS_POR_HOJA_PDF = 4

const MM = 72 / 25.4
const A4_APAISADO: [number, number] = [841.89, 595.28]
const MARGEN = 8 * MM
const ANCHO = (A4_APAISADO[0] - 2 * MARGEN) / 2
const ALTO = (A4_APAISADO[1] - 2 * MARGEN) / 2
const AIRE_X = 6 * MM
const AIRE_Y = 4 * MM
const TINTA = rgb(0.12, 0.12, 0.12)
const GRIS = rgb(0.42, 0.42, 0.41)
const LINEA = rgb(0.85, 0.85, 0.83)
const CORTE = rgb(0.71, 0.71, 0.69)
const TAM = 8
const RENGLON = 11

const fecha = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const plata = (n: number | null): string => (n == null ? 'sin dato' : pesos(n))
const horasComoTexto = (h: number | null | undefined): string => (h == null ? 'sin dato' : `${String(h).replace('.', ',')} h`)

interface Lapiz { page: PDFPage; normal: PDFFont; negrita: PDFFont }

function texto(l: Lapiz, t: string, x: number, y: number, o: { f?: PDFFont; tam?: number; color?: ReturnType<typeof rgb>; ancho?: number; derecha?: boolean } = {}) {
  const f = o.f ?? l.normal
  const tam = o.tam ?? TAM
  let s = aWinAnsi(t)
  if (o.ancho) while (s.length > 1 && f.widthOfTextAtSize(s, tam) > o.ancho) s = `${s.slice(0, -2)}…`
  const dx = o.derecha && o.ancho ? o.ancho - f.widthOfTextAtSize(s, tam) : 0
  l.page.drawText(s, { x: x + dx, y, size: tam, font: f, color: o.color ?? TINTA })
}

/** Un renglón: rótulo a la izquierda, cifra a la derecha. Devuelve la `y` del siguiente. */
function renglon(l: Lapiz, x: number, y: number, ancho: number, rotulo: string, cifra: string, sub = false): number {
  const sangria = sub ? 8 : 0
  const color = sub ? GRIS : TINTA
  const anchoCifra = l.normal.widthOfTextAtSize(aWinAnsi(cifra), TAM)
  texto(l, rotulo, x + sangria, y, { color, ancho: ancho - sangria - anchoCifra - 8 })
  texto(l, cifra, x, y, { color, ancho, derecha: true })
  return y - (sub ? RENGLON - 1.5 : RENGLON)
}

/** Dibuja un recibo dentro de su cuadrante. (x, yArriba) es la esquina superior izquierda del cuadrante. */
async function dibujarRecibo(doc: PDFDocument, l: Lapiz, r: ReciboParaElPdf, x0: number, yArriba: number): Promise<void> {
  const x = x0 + AIRE_X
  const ancho = ANCHO - 2 * AIRE_X
  let y = yArriba - AIRE_Y
  await dibujarLogoPdf(doc, l.page, x - 4, y + 2, 34)
  texto(l, 'Recibo de pago', x, y - 12, { f: l.negrita, tam: 9, ancho, derecha: true })
  texto(l, `Quincena ${fecha(r.quincenaDesde)} al ${fecha(r.quincenaHasta)}`, x, y - 23, { color: GRIS, ancho, derecha: true })
  texto(l, rotuloDelNumero(r.codigo), x, y - 33, { color: GRIS, tam: 7.5, ancho, derecha: true })
  y -= 46
  const rotuloNombre = 'Nombre '
  texto(l, rotuloNombre, x, y, { color: GRIS })
  texto(l, r.nombre, x + l.normal.widthOfTextAtSize(rotuloNombre, TAM), y, { f: l.negrita, tam: 9, ancho: ancho - 40 })
  y -= RENGLON
  if (r.categoria) {
    const rotuloCat = 'Categoría '
    texto(l, rotuloCat, x, y, { color: GRIS })
    texto(l, r.categoria, x + l.normal.widthOfTextAtSize(aWinAnsi(rotuloCat), TAM), y, { ancho: ancho - 50 })
    y -= RENGLON
  }
  l.page.drawLine({ start: { x, y: y + 3 }, end: { x: x + ancho, y: y + 3 }, thickness: 0.6, color: LINEA })
  y -= 8
  for (const h of r.renglones.horas) y = renglon(l, x, y, ancho, h.rotulo, horasComoTexto(h.horas))
  for (const m of r.renglones.medios) y = renglon(l, x, y, ancho, m.rotulo, plata(m.importe), m.sub === true)
  if (r.renglones.medios.some((m) => !m.sub)) {
    l.page.drawLine({ start: { x, y: y + 4 }, end: { x: x + ancho, y: y + 4 }, thickness: 1.1, color: TINTA })
    y -= 7
    texto(l, 'Total', x, y, { f: l.negrita, tam: 9.5 })
    texto(l, plata(r.total), x, y, { f: l.negrita, tam: 9.5, ancho, derecha: true })
  }
  // LAS FIRMAS AL PIE DEL CUADRANTE, siempre en el mismo lugar del papel.
  const yFirma = yArriba - ALTO + AIRE_Y + 10
  const columnas = [1.3, 1.3, 1]
  const unidad = (ancho - 2 * 8) / columnas.reduce((a, b) => a + b, 0)
  let xf = x
  for (const [i, rotulo] of ['Firma', 'Aclaración', 'DNI'].entries()) {
    const w = columnas[i] * unidad
    l.page.drawLine({ start: { x: xf, y: yFirma }, end: { x: xf + w, y: yFirma }, thickness: 0.7, color: TINTA })
    texto(l, rotulo, xf, yFirma - 9, { color: GRIS, tam: 7 })
    xf += w + 8
  }
}

/** Las líneas de corte de una hoja: la vertical si hay columna derecha, la horizontal si hay fila de abajo. */
function lineasDeCorte(page: PDFPage, cuantos: number): void {
  const medioX = MARGEN + ANCHO
  const medioY = A4_APAISADO[1] - MARGEN - ALTO
  const raya = { thickness: 0.6, color: CORTE, dashArray: [3, 3] }
  page.drawLine({ start: { x: medioX, y: A4_APAISADO[1] - MARGEN }, end: { x: medioX, y: cuantos > 2 ? MARGEN : medioY }, ...raya })
  page.drawLine({ start: { x: MARGEN, y: medioY }, end: { x: A4_APAISADO[0] - MARGEN, y: medioY }, ...raya })
}

export async function pdfDeRecibos(recibos: readonly ReciboParaElPdf[], titulo: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(aWinAnsi(titulo))
  doc.setAuthor('Echegaray Construcciones S.A.S.')
  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold)
  for (let i = 0; i < recibos.length; i += RECIBOS_POR_HOJA_PDF) {
    const page = doc.addPage(A4_APAISADO)
    const cuatro = recibos.slice(i, i + RECIBOS_POR_HOJA_PDF)
    lineasDeCorte(page, cuatro.length)
    for (const [j, r] of cuatro.entries()) {
      const x0 = MARGEN + (j % 2) * ANCHO
      const yArriba = A4_APAISADO[1] - MARGEN - Math.floor(j / 2) * ALTO
      await dibujarRecibo(doc, { page, normal, negrita }, r, x0, yArriba)
    }
  }
  return doc.save()
}
