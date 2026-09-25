// Z01 · EL PDF DE CIERRE — dibuja las secciones de `cierreObra.ts` con pdf-lib (A4, Helvetica). No
// calcula nada: si una cifra falta, la sección ya trae «sin dato».

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { aWinAnsi, type SeccionCierre } from './cierreObra.ts'

const A4: [number, number] = [595.28, 841.89]
const MARGEN = 48
const TINTA = rgb(0.12, 0.12, 0.12)
const SUAVE = rgb(0.42, 0.42, 0.4)
const LINEA = rgb(0.9, 0.9, 0.88)
const MARCA = rgb(0.99, 0.79, 0)

export async function pdfDeCierre(titulo: string, subtitulo: string, secciones: SeccionCierre[], generado: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(aWinAnsi(`Cierre de obra · ${titulo}`))
  doc.setAuthor('Echegaray Construcciones · Business OS')
  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold)
  let page: PDFPage = doc.addPage(A4)
  let y = A4[1] - MARGEN

  const texto = (t: string, x: number, yy: number, f: PDFFont, tam: number, color = TINTA, ancho?: number) => {
    let s = aWinAnsi(t)
    if (ancho) while (s.length > 1 && f.widthOfTextAtSize(s, tam) > ancho) s = `${s.slice(0, -2)}…`
    page.drawText(s, { x, y: yy, size: tam, font: f, color })
  }
  const nuevaPagina = () => { page = doc.addPage(A4); y = A4[1] - MARGEN }
  const espacio = (h: number) => { if (y - h < MARGEN + 20) nuevaPagina() }

  page.drawRectangle({ x: MARGEN, y: y - 4, width: 36, height: 4, color: MARCA })
  y -= 22
  texto('ECHEGARAY CONSTRUCCIONES · CIERRE DE OBRA', MARGEN, y, negrita, 9, SUAVE)
  y -= 24
  texto(titulo, MARGEN, y, negrita, 18, TINTA, A4[0] - 2 * MARGEN)
  y -= 18
  texto(subtitulo, MARGEN, y, normal, 10, SUAVE, A4[0] - 2 * MARGEN)
  y -= 26

  for (const s of secciones) {
    espacio(40)
    texto(s.titulo.toUpperCase(), MARGEN, y, negrita, 9, SUAVE)
    y -= 8
    page.drawLine({ start: { x: MARGEN, y }, end: { x: A4[0] - MARGEN, y }, thickness: 0.6, color: LINEA })
    y -= 16
    for (const [rotulo, valor] of s.filas) {
      espacio(18)
      texto(rotulo, MARGEN, y, normal, 10, SUAVE, 170)
      texto(valor, MARGEN + 180, y, valor === 'sin dato' ? normal : negrita, 10, valor === 'sin dato' ? SUAVE : TINTA, A4[0] - 2 * MARGEN - 180)
      y -= 16
    }
    if (s.nota) { espacio(18); texto(s.nota, MARGEN, y, normal, 9, SUAVE, A4[0] - 2 * MARGEN); y -= 16 }
    y -= 12
  }
  for (const p of doc.getPages()) {
    p.drawText(aWinAnsi(`Generado ${generado} desde app.ecsas.com.ar · lo que no tiene dato dice «sin dato»`), { x: MARGEN, y: 28, size: 8, font: normal, color: SUAVE })
  }
  return doc.save()
}
