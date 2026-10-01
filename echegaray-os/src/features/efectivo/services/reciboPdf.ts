// EL PDF «RECIBO» DE UN GASTO MANUAL — una hoja A5 apaisada, pdf-lib, Helvetica, todo en negro sobre blanco
// (se imprime en blanco y negro y se firma a mano). Dibuja lo que `armarRecibo` armó: no calcula ni decide.
// Lo que no se sabe es un renglón con raya para completar a mano. Logo por el helper compartido (regla 30/09).

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { aWinAnsi } from '../../obras/services/cierreObra.ts'
import { dibujarLogoPdf } from '../../../shared/exportar/logoPdf.ts'
import { RAZON_SOCIAL_RECIBO, type ReciboParaFirmar } from '../logica/recibo.ts'

const A5_APAISADO: [number, number] = [595.28, 419.53]
const M = 36
const NEGRO = rgb(0, 0, 0)
const GRIS = rgb(0.35, 0.35, 0.35)
const ANCHO_UTIL = A5_APAISADO[0] - 2 * M

/** Corte por palabras al ancho dado. */
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

export async function pdfDeRecibo(r: ReciboParaFirmar): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  doc.setTitle(aWinAnsi(`Recibo ${r.entrega} - $ ${r.montoTexto}`))
  doc.setAuthor('Echegaray Construcciones · Business OS')
  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold)
  const page: PDFPage = doc.addPage(A5_APAISADO)
  const alto = A5_APAISADO[1]

  const texto = (t: string, x: number, y: number, f: PDFFont, tam: number, color = NEGRO) =>
    page.drawText(aWinAnsi(t), { x, y, size: tam, font: f, color })
  const raya = (x1: number, x2: number, y: number) => page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color: NEGRO })
  /** «Rótulo: ____» — con valor lo escribe sobre la raya; sin valor deja la raya vacía. */
  const campo = (rotulo: string, valor: string | null, x: number, y: number, hasta: number) => {
    texto(rotulo, x, y, negrita, 10)
    const xv = x + negrita.widthOfTextAtSize(aWinAnsi(rotulo), 10) + 6
    raya(xv, hasta, y - 2)
    if (valor) texto(valor, xv + 3, y, normal, 10.5)
  }

  // Encabezado: logo + razón social a la izquierda, «RECIBO» y el importe a la derecha.
  const anchoLogo = await dibujarLogoPdf(doc, page, M, alto - M + 4, 40)
  texto(RAZON_SOCIAL_RECIBO, M + anchoLogo + 12, alto - M - 18, negrita, 11)
  const titulo = 'RECIBO'
  texto(titulo, A5_APAISADO[0] - M - negrita.widthOfTextAtSize(titulo, 20), alto - M - 8, negrita, 20)
  const imp = `$ ${r.montoTexto}`
  const caja = { w: negrita.widthOfTextAtSize(imp, 13) + 20, h: 24 }
  page.drawRectangle({ x: A5_APAISADO[0] - M - caja.w, y: alto - M - 44, width: caja.w, height: caja.h, borderColor: NEGRO, borderWidth: 1 })
  texto(imp, A5_APAISADO[0] - M - caja.w + 10, alto - M - 36, negrita, 13)

  let y = alto - M - 70
  raya(M, A5_APAISADO[0] - M, y)
  y -= 22
  campo('Fecha:', r.fecha, M, y, M + 190)

  // El cuerpo: la frase del recibo con el importe en letras y en números.
  y -= 26
  const cuerpo = `Recibí de ${RAZON_SOCIAL_RECIBO} la suma de pesos ${r.montoEnLetras} ($\u00A0${r.montoTexto}).`
  for (const l of partir(cuerpo, ANCHO_UTIL, normal, 11.5)) { texto(l, M, y, normal, 11.5); y -= 16 }

  y -= 6
  texto('En concepto de', M, y, negrita, 10)
  const xc = M + negrita.widthOfTextAtSize('En concepto de', 10) + 6
  const lineasConcepto = r.concepto ? partir(r.concepto, A5_APAISADO[0] - M - xc, normal, 10.5).slice(0, 2) : []
  raya(xc, A5_APAISADO[0] - M, y - 2)
  if (lineasConcepto[0]) texto(lineasConcepto[0], xc + 3, y, normal, 10.5)
  y -= 18
  // Segundo renglón: continuación del concepto, o raya libre para completar a mano.
  raya(M, A5_APAISADO[0] - M, y - 2)
  if (lineasConcepto[1]) texto(lineasConcepto[1], M + 3, y, normal, 10.5)

  y -= 24
  campo('Obra:', r.obra, M, y, M + 330)
  texto('Forma de pago: efectivo', M + 350, y, negrita, 10)
  y -= 22
  campo('Proveedor / quien recibe:', r.proveedor, M, y, A5_APAISADO[0] - M)

  // Firma, aclaración y DNI/CUIT: siempre en blanco, es lo que firma quien cobra.
  y -= 46
  const tercio = (ANCHO_UTIL - 2 * 20) / 3
  const cols: [string, number][] = [['Firma', 0], ['Aclaración', 1], ['DNI / CUIT', 2]]
  for (const [rotulo, i] of cols) {
    const x = M + i * (tercio + 20)
    raya(x, x + tercio, y)
    texto(rotulo, x, y - 12, normal, 9, GRIS)
  }

  // Pie chico: de dónde salió y que no es una factura.
  const pie = [`Entrega ${r.entrega}`, r.pagador ? `pagó ${r.pagador}` : null, 'Documento no válido como factura'].filter(Boolean).join(' · ')
  texto(pie, M, M - 4, normal, 8, GRIS)
  return doc.save()
}
