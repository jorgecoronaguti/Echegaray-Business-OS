// «NOVEDADES PARA EL ESTUDIO» EN PDF — A4 apaisado, pdf-lib, Helvetica.
//
// Un bloque por grupo pedido (OBREROS, OFICINA) con las MISMAS columnas que el Excel (`novedadesColumnas.ts`).
// Las celdas de texto se PARTEN en renglones, no se truncan: el detalle del presentismo («perdido: llegó tarde
// 24/09…») y las observaciones son justamente lo que el estudio tiene que leer entero. No calcula: escribe lo armado.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { aWinAnsi } from '../../obras/services/cierreObra.ts'
import { dibujarLogoPdf } from '../../../shared/exportar/logoPdf.ts'
import { columnasDe, lineasDelEncabezado, type ColumnaDeSalida } from './novedadesColumnas.ts'
import type { FilaDeNovedades, ReporteDeNovedades } from './novedadesParaElEstudio.ts'

const A4_APAISADO: [number, number] = [841.89, 595.28]
const MARGEN = 24
const UTIL = A4_APAISADO[0] - 2 * MARGEN
const TINTA = rgb(0.12, 0.12, 0.12)
const SUAVE = rgb(0.42, 0.42, 0.4)
const LINEA = rgb(0.88, 0.88, 0.85)
const MARCA = rgb(0.99, 0.79, 0)
const FONDO = rgb(0.96, 0.95, 0.9)
const ALTO_LOGO = 46
const ALTO_LOGO_CHICO = 22
const TAM = 7.5
const RENGLON = 9.5

const numeroAR = (n: number): string => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** El valor como se imprime: números con separador es-AR. `null` = «—». */
export function comoTexto(v: string | number | null): string {
  if (v == null || v === '') return '—'
  return typeof v === 'string' ? v : numeroAR(v)
}

interface ColTabla { titulo: string; ancho: number; derecha: boolean }
const colsDe = (cs: readonly ColumnaDeSalida[]): ColTabla[] => {
  const total = cs.reduce((a, c) => a + c.peso, 0)
  return cs.map((c) => ({ titulo: c.titulo, ancho: (UTIL * c.peso) / total, derecha: c.tipo !== 'texto' }))
}

/** Corte por palabras al ancho dado; una palabra sola más ancha que la columna se trunca al dibujarla. */
function partir(t: string, ancho: number, f: PDFFont, tam: number): string[] {
  const out: string[] = []
  let actual = ''
  for (const w of aWinAnsi(t).split(' ')) {
    const prueba = actual ? `${actual} ${w}` : w
    if (actual && f.widthOfTextAtSize(prueba, tam) > ancho) { out.push(actual); actual = w } else actual = prueba
  }
  if (actual) out.push(actual)
  return out
}

export async function pdfDeNovedades(r: ReporteDeNovedades): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(aWinAnsi(r.titulo))
  doc.setAuthor('Echegaray Construcciones · Business OS')
  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold)
  let page = doc.addPage(A4_APAISADO)
  let y = A4_APAISADO[1] - MARGEN

  const texto = (t: string, x: number, yy: number, f: PDFFont, tam: number, ancho?: number, derecha = false, color = TINTA) => {
    let s = aWinAnsi(t)
    if (ancho) while (s.length > 1 && f.widthOfTextAtSize(s, tam) > ancho) s = `${s.slice(0, -2)}…`
    const dx = derecha && ancho ? ancho - f.widthOfTextAtSize(s, tam) : 0
    page.drawText(s, { x: x + dx, y: yy, size: tam, font: f, color })
  }
  // Las hojas siguientes reservan arriba el lugar del logo compacto (se dibuja al final, cuando ya se sabe cuántas hay).
  const nueva = () => { page = doc.addPage(A4_APAISADO); y = A4_APAISADO[1] - MARGEN - ALTO_LOGO_CHICO - 8 }
  const necesita = (n: number) => y - n < MARGEN + 22

  const ancho = await dibujarLogoPdf(doc, page, MARGEN, y + 8, ALTO_LOGO)
  const x0 = MARGEN + ancho + 12
  page.drawRectangle({ x: x0, y: y - 35, width: 4, height: 39, color: MARCA })
  texto(r.titulo, x0 + 10, y - 6, negrita, 12)
  lineasDelEncabezado(r).forEach((l, i) => texto(l, x0 + 10, y - 17 - i * 10, normal, 8))
  y -= ALTO_LOGO + 8
  for (const l of partir(r.leyenda, UTIL, normal, 7)) { texto(l, MARGEN, y, normal, 7, undefined, false, SUAVE); y -= 9 }
  y -= 7

  const titulos = (cols: ColTabla[]) => {
    cols.reduce((x, c) => {
      partir(c.titulo, c.ancho - 4, negrita, 7).slice(0, 2).forEach((l, i) => texto(l, x, y - 7 - i * 8.5, negrita, 7, c.ancho - 4, c.derecha))
      return x + c.ancho
    }, MARGEN)
    y -= 20
    page.drawLine({ start: { x: MARGEN, y }, end: { x: A4_APAISADO[0] - MARGEN, y }, thickness: 0.8, color: TINTA })
    y -= 2
  }

  const fila = (cols: ColTabla[], celdas: string[]) => {
    const lineas = celdas.map((t, i) => (cols[i].derecha ? [t] : partir(t, cols[i].ancho - 4, normal, TAM)))
    const alto = Math.max(1, ...lineas.map((l) => l.length)) * RENGLON + 3
    if (necesita(alto)) { nueva(); titulos(cols) }
    lineas.reduce((x, ls, i) => {
      ls.forEach((l, k) => texto(l, x, y - 8 - k * RENGLON, normal, TAM, cols[i].ancho - 4, cols[i].derecha))
      return x + cols[i].ancho
    }, MARGEN)
    y -= alto
    page.drawLine({ start: { x: MARGEN, y: y + 1 }, end: { x: A4_APAISADO[0] - MARGEN, y: y + 1 }, thickness: 0.3, color: LINEA })
  }

  for (const s of r.secciones) {
    if (necesita(90)) nueva()
    page.drawRectangle({ x: MARGEN, y: y - 4, width: UTIL, height: 15, color: FONDO })
    page.drawRectangle({ x: MARGEN, y: y - 4, width: 4, height: 15, color: MARCA })
    texto(`${s.titulo} · ${s.filas.length} ${s.filas.length === 1 ? 'persona' : 'personas'}`, MARGEN + 10, y, negrita, 9)
    y -= 20
    const cs = columnasDe(s.grupo)
    const cols = colsDe(cs)
    titulos(cols)
    s.filas.forEach((f: FilaDeNovedades) => fila(cols, cs.map((c) => comoTexto(c.valor(f)))))
    y -= 14
  }
  const paginas = doc.getPages()
  for (let i = 1; i < paginas.length; i++) await dibujarLogoPdf(doc, paginas[i], MARGEN, A4_APAISADO[1] - MARGEN + 8, ALTO_LOGO_CHICO)
  pieDePagina(doc, normal, r)
  return doc.save()
}

function pieDePagina(doc: PDFDocument, f: PDFFont, r: ReporteDeNovedades): void {
  const paginas = doc.getPages()
  paginas.forEach((p: PDFPage, i) => {
    p.drawText(aWinAnsi(`${r.periodo.texto} · novedades, no es la liquidación · pág. ${i + 1}/${paginas.length}`), { x: MARGEN, y: 14, size: 7, font: f, color: SUAVE })
  })
}
