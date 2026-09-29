// «NOVEDADES PARA EL ESTUDIO» EN PDF — A4 apaisado, pdf-lib, Helvetica.
//
// Dos tablas con las MISMAS columnas que el Excel (`novedadesColumnas.ts`), partidas para que entren en la hoja:
// 1) el resumen (quién, qué días y horas, subtotales y neto estimado) y 2) el detalle de cada concepto del
// recibo, en tandas de columnas, siempre con el apellido a la izquierda. La leyenda de «importes estimados» va
// en la primera hoja y el pie de cada hoja repite que no es la liquidación. No calcula: escribe lo armado.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { aWinAnsi } from '../../obras/services/cierreObra.ts'
import { columnasDeSalida, lineaDelPeriodo, totalDeColumna, type ColumnaDeSalida } from './novedadesColumnas.ts'
import type { FilaDeNovedades, ReporteDeNovedades } from './novedadesParaElEstudio.ts'

const A4_APAISADO: [number, number] = [841.89, 595.28]
const MARGEN = 24
const TINTA = rgb(0.12, 0.12, 0.12)
const SUAVE = rgb(0.42, 0.42, 0.4)
const LINEA = rgb(0.88, 0.88, 0.85)
const MARCA = rgb(0.99, 0.79, 0)
const TAM = 6.8
const ALTO_FILA = 11.5

const ANCHO_TEXTO: Record<string, number> = { 'Legajo': 28, 'Apellido y nombre': 118, 'CUIL': 62, 'Categoría': 62, 'Obra': 74, 'Origen del importe': 46 }

export const enPesos = (n: number): string =>
  n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** El valor como se imprime: horas con dos decimales, días enteros, plata con separador es-AR. `null` = «—». */
export function comoTexto(c: ColumnaDeSalida, v: string | number | null): string {
  if (v == null || v === '') return '—'
  if (typeof v === 'string') return v
  return c.tipo === 'dias' ? String(v) : enPesos(v)
}

interface ColTabla { titulo: string; ancho: number; derecha: boolean }
const anchoDe = (c: ColumnaDeSalida): number =>
  c.tipo === 'texto' ? (ANCHO_TEXTO[c.titulo] ?? 60) : c.tipo === 'plata' ? 56 : 30

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
  const nueva = () => { page = doc.addPage(A4_APAISADO); y = A4_APAISADO[1] - MARGEN }

  const cabecera = () => {
    page.drawRectangle({ x: MARGEN, y: y - 3, width: 4, height: 24, color: MARCA })
    texto(r.titulo, MARGEN + 10, y + 10, negrita, 12)
    texto(`${r.empleador.razonSocial} · CUIT ${r.empleador.cuit}`, MARGEN + 10, y - 1, normal, 8)
    y -= 16
    texto(lineaDelPeriodo(r), MARGEN, y, normal, 8)
    y -= 11
    texto(r.leyenda, MARGEN, y, negrita, 7, A4_APAISADO[0] - 2 * MARGEN, false, SUAVE)
    y -= 16
  }

  /** Títulos en hasta tres renglones: «Rem. 0401 Jornal normal» no entra en 56 pt en uno. */
  const titulos = (cols: ColTabla[]) => {
    const alto = 3 * 8
    let x = MARGEN
    for (const c of cols) {
      const lineas = partir(c.titulo, c.ancho - 3, negrita, 6.3).slice(0, 3)
      lineas.forEach((l, i) => texto(l, x, y - 6 - i * 8, negrita, 6.3, c.ancho - 2, c.derecha))
      x += c.ancho
    }
    y -= alto + 2
    page.drawLine({ start: { x: MARGEN, y }, end: { x: A4_APAISADO[0] - MARGEN, y }, thickness: 0.8, color: TINTA })
    y -= 2
  }

  const tabla = (cols: ColTabla[], filas: string[][], pie: string[] | null) => {
    const necesita = (n: number) => y - n < MARGEN + 22
    if (necesita(60)) nueva()
    titulos(cols)
    const fila = (celdas: string[], f: PDFFont, linea: boolean) => {
      if (necesita(ALTO_FILA)) { nueva(); titulos(cols) }
      let x = MARGEN
      celdas.forEach((t, i) => { texto(t, x, y - 8, f, TAM, cols[i].ancho - 3, cols[i].derecha); x += cols[i].ancho })
      y -= ALTO_FILA
      if (linea) page.drawLine({ start: { x: MARGEN, y: y + 1 }, end: { x: A4_APAISADO[0] - MARGEN, y: y + 1 }, thickness: 0.3, color: LINEA })
    }
    filas.forEach((f) => fila(f, normal, true))
    if (pie) {
      page.drawLine({ start: { x: MARGEN, y: y + 1 }, end: { x: A4_APAISADO[0] - MARGEN, y: y + 1 }, thickness: 0.8, color: TINTA })
      fila(pie, negrita, false)
    }
    y -= 12
  }

  cabecera()
  const todas = columnasDeSalida(r)
  const resumen = todas.filter((c) => c.resumen)
  tabla(colsDe(resumen), r.filas.map((f) => celdasDe(resumen, f)), pieDe(r, resumen))
  const conceptos = todas.filter((c) => c.concepto)
  if (conceptos.length > 0) {
    texto('Detalle por concepto (estimado)', MARGEN, y, negrita, 9)
    y -= 14
    const nombre = todas.find((c) => c.titulo === 'Apellido y nombre')!
    for (let i = 0; i < conceptos.length; i += 8) {
      const grupo = [nombre, ...conceptos.slice(i, i + 8)]
      const cols = grupo.map((c) => ({ titulo: c.titulo, ancho: c === nombre ? 150 : 78, derecha: c !== nombre }))
      tabla(cols, r.filas.map((f) => celdasDe(grupo, f)), pieDe(r, grupo))
    }
  }
  pieDePagina(doc, normal, r)
  return doc.save()
}

const colsDe = (cs: ColumnaDeSalida[]): ColTabla[] => cs.map((c) => ({ titulo: c.titulo, ancho: anchoDe(c), derecha: c.tipo !== 'texto' }))
const celdasDe = (cs: ColumnaDeSalida[], f: FilaDeNovedades): string[] => cs.map((c) => comoTexto(c, c.valor(f)))
const pieDe = (r: ReporteDeNovedades, cs: ColumnaDeSalida[]): string[] =>
  cs.map((c, i) => (i === 0 ? 'TOTALES' : c.titulo === 'Apellido y nombre' ? `${r.filas.length} personas` : (() => { const t = totalDeColumna(r, c); return t == null ? '' : comoTexto(c, t) })()))

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

function pieDePagina(doc: PDFDocument, f: PDFFont, r: ReporteDeNovedades): void {
  const paginas = doc.getPages()
  paginas.forEach((p: PDFPage, i) => {
    p.drawText(aWinAnsi(`${r.periodo.texto} · importes estimados, no es la liquidación · pág. ${i + 1}/${paginas.length}`), { x: MARGEN, y: 14, size: 7, font: f, color: SUAVE })
  })
}
