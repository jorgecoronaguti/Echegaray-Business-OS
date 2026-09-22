// EL PDF DEL RECIBO DE PAGO FIRMADO — lo arma la VM (`recibos-a-drive.mjs`) para el legajo en Drive.
//
// Puro: recibe la fila de `recibo_pago` y, si hay, los bytes del papel firmado; devuelve los bytes del
// PDF. Sin base, sin red: lo prueba `recibo-pago-pdf.test.mjs`. Los textos y el formato de los números
// son los de `src/features/recibos/logica.ts`, los mismos que ve la pantalla.

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { diaHora, leerTrazo, miles, periodoLargo } from '../../src/features/recibos/logica.ts'

// Helvetica estándar codifica WinAnsi: el signo menos tipográfico (U+2212) no existe ahí.
const txt = (s) => String(s ?? '').replace(/−/g, '-')

/** Un `date` de pg llega como Date a la medianoche LOCAL: se lee con los componentes locales, no en UTC. */
export const diaDe = (d) => (typeof d === 'string' ? d.slice(0, 10)
  : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
const instante = (t) => (t instanceof Date ? t.toISOString() : String(t))

/** `r` es una fila de `recibo_pago` tal como la devuelve pg; `papel`, los bytes de la foto o `null`. */
export async function pdfDelRecibo(r, papel) {
  const doc = await PDFDocument.create()
  const [normal, negrita] = await Promise.all([doc.embedFont(StandardFonts.Helvetica), doc.embedFont(StandardFonts.HelveticaBold)])
  const hoja = doc.addPage([595, 842])
  const gris = rgb(0.42, 0.42, 0.4)
  let y = 790
  const escribir = (t, { x = 56, tam = 11, fuente = normal, color = rgb(0.12, 0.12, 0.12) } = {}) => hoja.drawText(txt(t), { x, y, size: tam, font: fuente, color })
  escribir('ECHEGARAY CONSTRUCCIONES', { fuente: negrita, tam: 12 }); escribir(`RECIBO ${r.codigo}`, { x: 380, fuente: negrita })
  y -= 16; escribir('San Juan · Argentina', { tam: 9, color: gris })
  y -= 40
  for (const [rot, val] of [['Recibí de', 'Echegaray Construcciones'], ['Período', periodoLargo(diaDe(r.desde), diaDe(r.hasta))],
    ['Nombre', r.persona_nombre], ['Obra', r.obra ?? 'sin horas imputadas a una obra']]) {
    escribir(rot.toUpperCase(), { tam: 8, color: gris }); y -= 14; escribir(val); y -= 24
  }
  const renglon = (t, v, f = normal) => { escribir(t, { fuente: f }); escribir(v, { x: 440, fuente: f }); y -= 22 }
  y -= 6
  renglon(`Quincena${r.horas == null ? '' : ` · ${String(Number(r.horas)).replace('.', ',')} hs`}`, miles(Number(r.bruto)))
  if (Number(r.adelanto) > 0) renglon('Adelantos', `- ${miles(Number(r.adelanto))}`)
  if (Number(r.ya_transferido) > 0) renglon('Ya transferido', `- ${miles(Number(r.ya_transferido))}`)
  renglon('Total a pagar', `$ ${miles(Number(r.total))}`, negrita)
  escribir(`Por banco ${miles(Number(r.por_banco))} · en efectivo ${miles(Number(r.en_efectivo))}`, { tam: 9, color: gris })
  y -= 90
  const trazo = leerTrazo(r.trazo)
  if (trazo) {
    const escala = Math.min(220 / trazo.ancho, 70 / trazo.alto)
    hoja.drawSvgPath(trazo.d, { x: 56, y: y + 70, scale: escala, borderColor: rgb(0.12, 0.12, 0.12), borderWidth: 1.4 })
  }
  hoja.drawLine({ start: { x: 56, y }, end: { x: 276, y }, thickness: 0.6, color: gris })
  hoja.drawLine({ start: { x: 320, y }, end: { x: 540, y }, thickness: 0.6, color: gris })
  y -= 14; escribir('Firma del trabajador', { tam: 9, color: gris }); escribir('Por la empresa · aclaración', { x: 320, tam: 9, color: gris })
  y -= 30
  if (r.firmado_en) { escribir(`Firmado con el dedo el ${diaHora(instante(r.firmado_en))} (conformidad interna).`, { tam: 8, color: gris }); y -= 12 }
  if (r.archivado_en) escribir(`Verificado y archivado el ${diaHora(instante(r.archivado_en))}.`, { tam: 8, color: gris })
  if (papel) await anexarPapel(doc, papel, r.papel_path)
  return doc.save()
}

/** La foto del papel en la hoja siguiente (JPG/PNG), o sus páginas si es un PDF. HEIC/WEBP no se embeben. */
export async function anexarPapel(doc, bytes, path) {
  const ext = path.split('.').pop()
  if (ext === 'pdf') {
    const otro = await PDFDocument.load(bytes, { ignoreEncryption: true })
    for (const p of await doc.copyPages(otro, otro.getPageIndices())) doc.addPage(p)
    return
  }
  if (ext !== 'jpg' && ext !== 'png') throw new Error(`la foto del papel es .${ext}: pdf-lib no la embebe (sólo JPG, PNG o PDF)`)
  const img = ext === 'jpg' ? await doc.embedJpg(bytes) : await doc.embedPng(bytes)
  const hoja = doc.addPage([595, 842])
  const escala = Math.min(515 / img.width, 762 / img.height, 1)
  hoja.drawImage(img, { x: 40, y: 842 - 40 - img.height * escala, width: img.width * escala, height: img.height * escala })
}

