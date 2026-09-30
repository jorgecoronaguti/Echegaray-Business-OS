// «NOVEDADES PARA EL ESTUDIO» EN PDF — A4 apaisado, pdf-lib, Helvetica.
//
// Dos SECCIONES (OBREROS y OFICINA) con las MISMAS columnas que el Excel (`novedadesColumnas.ts`), partidas para que entren en la hoja:
// 1) el resumen (quién, qué días y horas, subtotales y neto estimado) y 2) el detalle de cada concepto del
// recibo, en tandas de columnas, siempre con el apellido a la izquierda. La leyenda de «importes estimados» va
// en la primera hoja y el pie de cada hoja repite que no es la liquidación. No calcula: escribe lo armado.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { aWinAnsi } from '../../obras/services/cierreObra.ts'
import { dibujarLogoPdf } from '../../../shared/exportar/logoPdf.ts'
import { columnasDeSalida, lineaDelPeriodo, totalDeColumna, type ColumnaDeSalida } from './novedadesColumnas.ts'
import type { FilaDeNovedades, ReporteDeNovedades } from './novedadesParaElEstudio.ts'

const A4_APAISADO: [number, number] = [841.89, 595.28]
const MARGEN = 24
const TINTA = rgb(0.12, 0.12, 0.12)
const SUAVE = rgb(0.42, 0.42, 0.4)
const LINEA = rgb(0.88, 0.88, 0.85)
const MARCA = rgb(0.99, 0.79, 0)
const FONDO = rgb(0.96, 0.95, 0.9)
const ALTO_LOGO = 46
const ALTO_LOGO_CHICO = 22
const TAM = 6.8
const ALTO_FILA = 11.5

const ANCHO_TEXTO: Record<string, number> = { 'Legajo N.º': 34, 'Apellido y nombre': 112, 'CUIL': 62, 'Categoría': 74, 'Obra': 74, 'Presentismo': 44, 'Origen del importe': 46 }

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
  c.tipo === 'texto' ? (ANCHO_TEXTO[c.titulo] ?? 60) : c.tipo === 'plata' ? (c.titulo === 'Valor hora' ? 44 : 56) : c.titulo.startsWith('Total hs') ? 42 : 34

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

  const cabecera = async () => {
    const ancho = await dibujarLogoPdf(doc, page, MARGEN, y + 8, ALTO_LOGO)
    const x = MARGEN + ancho + 12
    page.drawRectangle({ x, y: y - 24, width: 4, height: 28, color: MARCA })
    texto(r.titulo, x + 10, y - 6, negrita, 12)
    texto(`${r.empleador.razonSocial} · CUIT ${r.empleador.cuit}`, x + 10, y - 17, normal, 8)
    texto(lineaDelPeriodo(r), x + 10, y - 28, normal, 8)
    y -= ALTO_LOGO + 2
    // La leyenda es larga (explica origen y presentismo): se parte en renglones, no se trunca.
    for (const l of partir(r.leyenda, A4_APAISADO[0] - 2 * MARGEN, negrita, 7)) { texto(l, MARGEN, y, negrita, 7, undefined, false, SUAVE); y -= 9 }
    y -= 7
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

  const barra = (t: string) => {
    if (y - 90 < MARGEN + 22) nueva()
    page.drawRectangle({ x: MARGEN, y: y - 4, width: A4_APAISADO[0] - 2 * MARGEN, height: 15, color: FONDO })
    page.drawRectangle({ x: MARGEN, y: y - 4, width: 4, height: 15, color: MARCA })
    texto(t, MARGEN + 10, y, negrita, 9)
    y -= 20
  }

  /** `pies`: una o más filas en negrita al final (subtotal de sección, total general). */
  const tabla = (cols: ColTabla[], filas: string[][], pies: string[][]) => {
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
    pies.forEach((p) => {
      page.drawLine({ start: { x: MARGEN, y: y + 1 }, end: { x: A4_APAISADO[0] - MARGEN, y: y + 1 }, thickness: 0.8, color: TINTA })
      fila(p, negrita, false)
    })
    y -= 12
  }

  await cabecera()
  const todas = columnasDeSalida(r)
  const resumen = todas.filter((c) => c.resumen)
  const nombre = todas.find((c) => c.titulo === 'Apellido y nombre')!
  for (const s of r.secciones) {
    barra(`${s.titulo} · ${s.filas.length} ${s.filas.length === 1 ? 'persona' : 'personas'}`)
    tabla(colsDe(resumen), s.filas.map((f) => celdasDe(resumen, f)), [pieDe(`Subtotal ${s.titulo}`, s.filas, resumen)])
  }
  barra('TOTAL GENERAL')
  tabla(colsDe(resumen), [], [pieDe('TOTAL', r.filas, resumen)])

  // Detalle de cada concepto del recibo, por sección, sólo con los conceptos que esa sección tiene.
  for (const s of r.secciones) {
    const presentes = todas.filter((c) => c.concepto && s.filas.some((f) => c.valor(f) != null))
    if (presentes.length === 0) continue
    barra(`Detalle por concepto (estimado) · ${s.titulo}`)
    for (let i = 0; i < presentes.length; i += 8) {
      const grupo = [nombre, ...presentes.slice(i, i + 8)]
      const cols = grupo.map((c) => ({ titulo: c.titulo, ancho: c === nombre ? 150 : 78, derecha: c !== nombre }))
      tabla(cols, s.filas.map((f) => celdasDe(grupo, f)), [pieDe(`Subtotal ${s.titulo}`, s.filas, grupo)])
    }
  }
  const paginas = doc.getPages()
  for (let i = 1; i < paginas.length; i++) await dibujarLogoPdf(doc, paginas[i], MARGEN, A4_APAISADO[1] - MARGEN + 8, ALTO_LOGO_CHICO)
  pieDePagina(doc, normal, r)
  return doc.save()
}

const colsDe = (cs: ColumnaDeSalida[]): ColTabla[] => cs.map((c) => ({ titulo: c.titulo, ancho: anchoDe(c), derecha: c.tipo !== 'texto' }))
const celdasDe = (cs: ColumnaDeSalida[], f: FilaDeNovedades): string[] => cs.map((c) => comoTexto(c, c.valor(f)))
/** Fila de totales: el rótulo bajo el nombre (la columna de Legajo es muy angosta), la cuenta de personas bajo el CUIL y la suma de cada columna sumable. */
const pieDe = (rotulo: string, filas: readonly FilaDeNovedades[], cs: ColumnaDeSalida[]): string[] =>
  cs.map((c) => {
    if (c.titulo === 'Apellido y nombre') return rotulo
    if (c.titulo === 'CUIL') return `${filas.length} ${filas.length === 1 ? 'persona' : 'personas'}`
    const t = totalDeColumna(filas, c)
    return t == null ? '' : comoTexto(c, t)
  })

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
