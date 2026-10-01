// EL PDF DEL RECIBO FIRMADO DE UN GASTO MANUAL — una hoja A5 apaisada, pdf-lib, Helvetica, en negro sobre blanco.
//
// Ya NO es un modelo para imprimir y firmar a mano (dueño, 01/10/2026: «quiero q sea algo digital como la firma
// de conformidad»): es el comprobante de lo que el proveedor firmó en la pantalla. Por eso sólo se genera con la
// firma: sin trazo legible no hay PDF (se lanza, no se dibuja un renglón vacío). La frase es la MISMA que vio
// quien firmó (`fraseDelRecibo`). Logo por el helper compartido (regla 30/09).

import { LineCapStyle, PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { aWinAnsi } from '../../obras/services/cierreObra.ts'
import { dibujarLogoPdf } from '../../../shared/exportar/logoPdf.ts'
import { RAZON_SOCIAL_RECIBO, type ReciboParaFirmar } from '../logica/recibo.ts'
import { fechaHoraDeFirma, fraseDelRecibo, trazoParaPdf, type FirmaDelRecibo } from '../logica/reciboFirma.ts'

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

export async function pdfDeReciboFirmado(r: ReciboParaFirmar, firma: FirmaDelRecibo): Promise<Uint8Array> {
  const trazo = trazoParaPdf(firma.trazo)
  if (!trazo) throw new Error('La firma guardada no se puede dibujar: el recibo no se entrega como firmado')
  const doc = await PDFDocument.create()
  doc.setTitle(aWinAnsi(`Recibo firmado ${r.entrega} - $ ${r.montoTexto}`))
  doc.setAuthor('Echegaray Construcciones · Business OS')
  const normal = await doc.embedFont(StandardFonts.Helvetica)
  const negrita = await doc.embedFont(StandardFonts.HelveticaBold)
  const page: PDFPage = doc.addPage(A5_APAISADO)
  const alto = A5_APAISADO[1]

  const texto = (t: string, x: number, y: number, f: PDFFont, tam: number, color = NEGRO) =>
    page.drawText(aWinAnsi(t), { x, y, size: tam, font: f, color })
  const raya = (x1: number, x2: number, y: number) => page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: 0.6, color: NEGRO })

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

  // El cuerpo: la frase que firmó quien cobra, tal cual la vio en pantalla.
  y -= 26
  for (const l of partir(fraseDelRecibo(r), ANCHO_UTIL, normal, 11.5)) { texto(l, M, y, normal, 11.5); y -= 16 }

  y -= 8
  texto('Forma de pago: efectivo', M, y, negrita, 10)
  if (r.proveedor) {
    y -= 16
    texto(`Proveedor: ${r.proveedor}`, M, y, normal, 10)
  }

  // La firma: el trazo estampado sobre la raya, con quién firma y cuándo. Se achica a la caja sin deformarse.
  const cajaFirma = { w: 200, h: 64 }
  const escala = Math.min(cajaFirma.w / trazo.ancho, cajaFirma.h / trazo.alto)
  const base = M + 60
  page.drawSvgPath(trazo.d, {
    x: M, y: base + cajaFirma.h - (cajaFirma.h - trazo.alto * escala) / 2, scale: escala,
    borderColor: NEGRO, borderWidth: 1.4, borderLineCap: LineCapStyle.Round,
  })
  raya(M, M + cajaFirma.w + 40, base)
  texto('Firma', M, base - 12, normal, 9, GRIS)
  texto(`Aclaración: ${firma.aclaracion}`, M + cajaFirma.w + 60, base + 30, normal, 10.5)
  if (firma.dni) texto(`DNI: ${firma.dni}`, M + cajaFirma.w + 60, base + 12, normal, 10.5)
  texto(`Firmado en pantalla el ${fechaHoraDeFirma(firma.firmado_en)}`, M, base - 30, normal, 9, GRIS)

  // Pie chico: de dónde salió y que no es una factura.
  const pie = [`Entrega ${r.entrega}`, r.pagador ? `pagó ${r.pagador}` : null, 'Documento no válido como factura'].filter(Boolean).join(' · ')
  texto(pie, M, M - 4, normal, 8, GRIS)
  return doc.save()
}
