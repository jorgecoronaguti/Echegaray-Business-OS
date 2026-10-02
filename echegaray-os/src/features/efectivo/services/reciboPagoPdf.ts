// EL PDF DEL RECIBO DE PAGO EN EFECTIVO A UN TERCERO — una hoja A4, ORIGINAL arriba y DUPLICADO abajo.
//
// A diferencia del recibo del gasto manual (`reciboPdf.ts`, firmado en pantalla), éste SE IMPRIME Y SE FIRMA
// EN PAPEL: el dueño le paga a un subcontratista en la obra y necesita la firma ahí. Por eso lleva renglones
// de Firma / Aclaración / DNI en blanco, y dos copias: una queda en la empresa, la otra se la lleva quien cobra.
// Cada mitad de un A4 vertical mide exactamente un A5 apaisado, que es el formato del otro recibo: mismo
// estilo, misma librería, cortado por la línea punteada. Logo por el helper compartido (regla 30/09).
// Un recibo anulado se imprime igual —es lo que se pidió ver— pero cruzado por «ANULADO»: no sirve para firmar.

import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { aWinAnsi } from '../../obras/services/cierreObra.ts'
import { dibujarLogoPdf } from '../../../shared/exportar/logoPdf.ts'
import { rotuloDelNumero } from '../../../shared/recibo/codigoDeRecibo.ts'
import { RAZON_SOCIAL_RECIBO, montoComoSeImprime } from '../logica/recibo.ts'
import { fechaImpresa, fraseDelReciboPago, type ReciboPagoImpreso } from '../logica/reciboPago.ts'

const A4: [number, number] = [595.28, 841.89]
const M = 36
const NEGRO = rgb(0, 0, 0)
const GRIS = rgb(0.35, 0.35, 0.35)
const ANCHO_UTIL = A4[0] - 2 * M
const MITAD = A4[1] / 2

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

interface Lienzo { doc: PDFDocument; page: PDFPage; normal: PDFFont; negrita: PDFFont }

/** Una copia en la mitad cuyo borde de arriba es `techo`. */
async function copia(l: Lienzo, r: ReciboPagoImpreso, techo: number, cual: 'ORIGINAL' | 'DUPLICADO') {
  const { page, normal, negrita } = l
  const texto = (t: string, x: number, y: number, f: PDFFont, tam: number, color = NEGRO) =>
    page.drawText(aWinAnsi(t), { x, y, size: tam, font: f, color })
  const derecha = (t: string, y: number, f: PDFFont, tam: number, color = NEGRO) =>
    texto(t, A4[0] - M - f.widthOfTextAtSize(aWinAnsi(t), tam), y, f, tam, color)
  const raya = (x1: number, x2: number, y: number) =>
    page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color: NEGRO })

  // Encabezado: logo + razón social a la izquierda; «RECIBO», el importe y el número a la derecha.
  const anchoLogo = await dibujarLogoPdf(l.doc, page, M, techo - M + 4, 40)
  texto(RAZON_SOCIAL_RECIBO, M + anchoLogo + 12, techo - M - 18, negrita, 11)
  texto(cual, M + anchoLogo + 12, techo - M - 32, normal, 8, GRIS)
  derecha('RECIBO', techo - M - 8, negrita, 20)
  const imp = `$ ${montoComoSeImprime(r.importe)}`
  const caja = { w: negrita.widthOfTextAtSize(imp, 13) + 20, h: 24 }
  page.drawRectangle({ x: A4[0] - M - caja.w, y: techo - M - 44, width: caja.w, height: caja.h, borderColor: NEGRO, borderWidth: 1 })
  texto(imp, A4[0] - M - caja.w + 10, techo - M - 36, negrita, 13)
  derecha(`${rotuloDelNumero(r.codigo)} · ${fechaImpresa(r.fecha)}`, techo - M - 60, normal, 9, GRIS)

  let y = techo - M - 70
  raya(M, A4[0] - M, y)
  y -= 24
  for (const linea of partir(fraseDelReciboPago(r), ANCHO_UTIL, normal, 11.5)) { texto(linea, M, y, normal, 11.5); y -= 16 }
  y -= 6
  if (r.obra) { texto(`Obra: ${r.obra}`, M, y, normal, 10); y -= 15 }
  texto('Forma de pago: Efectivo', M, y, negrita, 10)
  y -= 15
  texto(`San Juan, ${fechaImpresa(r.fecha)}`, M, y, normal, 10)

  // Firma, aclaración y DNI de quien cobra: tres renglones en blanco. El nombre y el documento del padrón van
  // debajo, chicos, como referencia: la aclaración la escribe quien firma, de su puño.
  const base = techo - MITAD + M + 52
  const col = (ANCHO_UTIL - 40) / 3
  const renglones: [string, string | null][] = [
    ['Firma', null],
    ['Aclaración', r.aNombreDe],
    ['DNI / CUIT', r.documento],
  ]
  renglones.forEach(([rotulo, ref], i) => {
    const x = M + i * (col + 20)
    raya(x, x + col, base)
    texto(rotulo, x, base - 12, normal, 9, GRIS)
    if (ref) texto(ref, x, base - 24, normal, 8, GRIS)
  })
  texto('Documento no válido como factura', M, techo - MITAD + M - 4, normal, 8, GRIS)

  if (r.anulado) {
    const t = 'ANULADO'
    page.drawText(t, {
      x: A4[0] / 2 - negrita.widthOfTextAtSize(t, 64) / 2 * Math.cos(Math.PI / 9), y: techo - MITAD / 2 - 40,
      size: 64, font: negrita, color: rgb(0.75, 0.1, 0.1), opacity: 0.35, rotate: degrees(20),
    })
  }
}

export async function pdfDeReciboPago(r: ReciboPagoImpreso): Promise<Uint8Array> {
  if (!Number.isFinite(r.importe) || r.importe <= 0) throw new Error('El recibo no tiene un importe válido')
  const doc = await PDFDocument.create()
  doc.setTitle(aWinAnsi(`Recibo ${r.codigo} - ${r.aNombreDe} - $ ${montoComoSeImprime(r.importe)}`))
  doc.setAuthor('Echegaray Construcciones · Business OS')
  const page = doc.addPage(A4)
  const l: Lienzo = { doc, page, normal: await doc.embedFont(StandardFonts.Helvetica), negrita: await doc.embedFont(StandardFonts.HelveticaBold) }
  await copia(l, r, A4[1], 'ORIGINAL')
  // La línea de corte, punteada, entre las dos copias.
  page.drawLine({ start: { x: 14, y: MITAD }, end: { x: A4[0] - 14, y: MITAD }, thickness: 0.5, color: GRIS, dashArray: [4, 4] })
  await copia(l, r, MITAD, 'DUPLICADO')
  return doc.save()
}
