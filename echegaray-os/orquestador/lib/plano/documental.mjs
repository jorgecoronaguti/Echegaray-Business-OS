// ABRIR TODA LA CARPETA DEL CLIENTE Y DEVOLVER UN SOLO PROYECTO. Es el borde de la ingesta.
//
// ═══ QUÉ HACE Y POR QUÉ ESTÁ SEPARADO DEL PIPELINE ═══
//
// `pipeline.mjs` orquesta el circuito entero —interpretar, computar, elegir partida, controlar—.
// Abrir los archivos es otra cosa: convertir un DWG, partir una lámina en vistas, recortar cada
// vista, sacar el texto de un pliego. Mezclarlo todo en un archivo produce el módulo que nadie
// puede tocar. Acá entra la carpeta como llega y sale la materia prima ya cruzada.
//
// ═══ EL CAD NO ES «UN PLANO MÁS» ═══
//
// Un DWG aporta lo que ninguna lámina impresa puede: la UNIDAD de dibujo declarada, las capas con
// su nombre, el conteo exacto de bloques insertados y las COTAS que el proyectista escribió a
// propósito. En el galpón de Quattropani son 966 cotas medidas. Eso entra al proyecto como hechos
// de clase CAD, que es la de mayor peso cuando algo se contradice.
//
// ═══ NADA SE PIERDE EN SILENCIO ═══
//
// Todo archivo que no se pudo abrir sale en `noLeidos` con su motivo. Es la respuesta a «¿leíste
// todo?», y sin esa lista la respuesta honesta sería «no sé».

import { leerPdf, renglones } from '../ingesta/pdf.mjs'
import { textoDeDxf, medirDxf } from '../ingesta/dxf.mjs'
import { abrirDwg } from '../ingesta/dwg.mjs'
import { segmentar } from '../ingesta/segmentar.mjs'
import { recortarRegiones, hashDe } from '../ingesta/recortes.mjs'
import { formatoDe, FORMATO } from '../ingesta/registro.mjs'
import { hechosDeCad, hechosDeTexto, CLASE_FUENTE } from './proyecto.mjs'

/** Qué clase de documento del proyecto es, para saber cuánto pesa lo que diga. El nombre es la
 *  única señal disponible antes de abrirlo, y por eso las reglas son explícitas y no una corazonada:
 *  «memoria» y «cálculo» pesan más que «pliego», y «pliego» más que una planilla del cliente. PURA. */
export function claseDocumental(nombre) {
  const n = String(nombre ?? '').toLowerCase()
  if (/memoria|calculo|cálculo/.test(n)) return CLASE_FUENTE.MEMORIA
  if (/pliego|especificacion|especificación|condiciones/.test(n)) return CLASE_FUENTE.PLIEGO
  if (/planilla|computo|cómputo|listado/.test(n)) return CLASE_FUENTE.PLANILLA
  return CLASE_FUENTE.PLIEGO
}

/** Los archivos CAD de un conjunto de insumos. Dejan de ser «no legibles»: son la mejor fuente
 *  geométrica del proyecto. PURA. */
export const cadDe = (insumos = []) => insumos.filter((d) => [FORMATO.DWG, FORMATO.DXF].includes(formatoDe({ nombre: d.name, mime: d.mime_type })))

/** Los documentos de texto que ESPECIFICAN: pliego, memoria, planilla. Se distinguen de los planos
 *  porque su lectura es texto y no geometría — y porque lo que dicen COMPLETA al plano. PURA. */
export const documentalesDe = (insumos = []) => insumos.filter((d) => {
  const f = formatoDe({ nombre: d.name, mime: d.mime_type })
  if (f === FORMATO.DOCUMENTO || f === FORMATO.PLANILLA) return true
  // Un PDF puede ser un plano o un pliego; se decide por el tipo que ya asignó `clasificarDocumento`.
  return f === FORMATO.PDF && !String(d.tipo ?? '').startsWith('plano')
})

/**
 * ABRIR UN CAD. Devuelve la medición o el motivo por el que no se pudo. No lanza.
 *
 * El `.dxf` se lee directo; el `.dwg` pasa por el conversor local, que cachea por hash. Las dos
 * ramas terminan en la MISMA medición, así que el resto del circuito no sabe —ni tiene que saber—
 * de qué formato vino la geometría.
 */
export async function abrirCad(doc, bytes) {
  const formato = formatoDe({ nombre: doc.name, mime: doc.mime_type })
  try {
    if (formato === FORMATO.DXF) {
      const { texto, codificacion } = textoDeDxf(bytes)
      return { ok: true, archivo: doc.name, formato, codificacion, medicion: medirDxf(texto) }
    }
    const r = await abrirDwg(bytes, { nombre: doc.name })
    return r.ok
      ? { ok: true, archivo: doc.name, formato, version: r.version, deCache: r.deCache, codificacion: r.codificacion, medicion: r.medicion }
      : { ok: false, archivo: doc.name, formato, version: r.version, porQue: r.porQue, comoSeResuelve: r.comoSeResuelve ?? null }
  } catch (e) {
    return { ok: false, archivo: doc.name, formato, porQue: String(e?.message ?? e).slice(0, 200) }
  }
}

/**
 * PARTIR UNA LÁMINA EN SUS VISTAS Y RECORTARLAS. Devuelve las regiones con su PNG.
 *
 * `rutaTemporal` hace falta porque el recortador trabaja sobre un archivo: los bytes vienen de
 * Drive y hay que dejarlos en disco una vez. El PNG resultante sí se cachea por contenido, así que
 * el archivo temporal se escribe una sola vez por corrida fría.
 */
export async function segmentarLamina(doc, bytes, { escribirTemporal, limite = 12 } = {}) {
  const doc_ = await leerPdf(bytes)
  const hash = hashDe(bytes)
  const salida = []
  for (const pg of doc_.leidas) {
    const s = segmentar({ ancho: pg.ancho, alto: pg.alto, trazos: pg.trazos, textos: pg.textos })
    const ruta = await escribirTemporal(bytes, doc.name)
    const rec = await recortarRegiones(ruta, s.regiones, { hashArchivo: hash, pagina: pg.numero, limite })
    // Los tres recuentos viajan con la lámina porque son la EVIDENCIA de que se pudo parsear algo:
    // una hoja escaneada abre bien, devuelve una página y trae cero trazos y cero caracteres. Sin
    // estos números, «se abrió el PDF» y «salió estructura» se confunden, y ahí es donde un plano
    // raster se declara soportado.
    salida.push({ pagina: pg.numero, clase: pg.clase, rotacion: pg.rotacion, ancho: pg.ancho, alto: pg.alto, caracteres: pg.caracteres, trazos: pg.trazos.length, imagenes: pg.imagenes.length, ...s, ...rec })
  }
  return { archivo: doc.name, hash, paginas: doc_.paginas, laminas: salida }
}

/** El texto de un documento que especifica. Devuelve `{ ok, texto }` o el motivo. */
export async function textoDe(doc, bytes, { google } = {}) {
  const formato = formatoDe({ nombre: doc.name, mime: doc.mime_type })
  try {
    if (formato === FORMATO.PDF) {
      const d = await leerPdf(bytes, { conGeometria: false })
      const texto = d.leidas.map((p) => renglones(p.textos).map((r) => r.texto).join('\n')).join('\n')
      // ═══ CERO CARACTERES NO ES «NO TIENE TEXTO»: PUEDE SER UN ESCANEO ═══
      // La lectura de un documento de especificación apaga la geometría porque recorrer los
      // operadores de un PDF grande cuesta y a nadie le importa el dibujo de un pliego. Pero cuando
      // NO SALE UN SOLO CARÁCTER, la diferencia entre «pliego vacío» y «pliego escaneado» es
      // exactamente el dato que hay que reportar, y sin geometría no se puede distinguir. Se vuelve
      // a leer sólo en ese caso, que es el único donde la respuesta cambia.
      const clasePdf = texto.trim() ? d.clase : (await leerPdf(bytes, { conGeometria: true, hasta: 1 })).clase
      return { ok: true, texto, formato, clasePdf }
    }
    if (formato === FORMATO.PLANILLA && google?.readExcel) {
      const x = await google.readExcel(doc.drive_file_id, { maxRows: 300 })
      const texto = (x.rows ?? []).map((f) => (Array.isArray(f) ? f.filter(Boolean).join(' | ') : String(f))).join('\n')
      return { ok: true, texto, formato, pestana: x.sheet }
    }
    return { ok: false, formato, porQue: `todavía no hay lector de texto para ${formato}: el archivo queda declarado, no ignorado` }
  } catch (e) {
    return { ok: false, formato, porQue: String(e?.message ?? e).slice(0, 200) }
  }
}

/**
 * LA CARPETA ENTERA, ABIERTA. Devuelve el material con el que se arma el proyecto documental.
 *
 * Las tres ramas —CAD, láminas y documentos de texto— producen HECHOS de clases distintas que
 * después consolida `armarProyecto`. Acá no se resuelve ningún conflicto: se juntan las
 * afirmaciones con su procedencia, que es lo único que permite detectarlos después.
 */
export async function ingerir({ google, insumos = [], planosLegibles = [], escribirTemporal, limite = 12, logger = null } = {}) {
  const cad = []
  const documentales = []
  const segmentaciones = []
  const hechos = []
  const noLeidos = []

  for (const doc of cadDe(insumos)) {
    const bytes = await google.descargarBytes(doc.drive_file_id)
    const r = await abrirCad(doc, bytes)
    if (!r.ok) { noLeidos.push({ archivo: doc.name, porQue: r.porQue, comoSeResuelve: r.comoSeResuelve ?? null }); logger?.warn?.('xsas: CAD no legible', { archivo: doc.name }); continue }
    cad.push(r)
    hechos.push(...hechosDeCad(r.medicion, { documento: doc.name }))
  }

  for (const doc of documentalesDe(insumos)) {
    const bytes = await google.descargarBytes(doc.drive_file_id)
    const t = await textoDe(doc, bytes, { google })
    if (!t.ok) { noLeidos.push({ archivo: doc.name, porQue: t.porQue }); continue }
    const clase = claseDocumental(doc.name)
    documentales.push({ archivo: doc.name, clase: clase.id, caracteres: t.texto.length, clasePdf: t.clasePdf ?? null })
    hechos.push(...hechosDeTexto(t.texto, { documento: doc.name, clase }))
  }

  for (const doc of planosLegibles) {
    if (!/pdf$/i.test(String(doc.name))) continue
    const bytes = await google.descargarBytes(doc.drive_file_id)
    segmentaciones.push(await segmentarLamina(doc, bytes, { escribirTemporal, limite }))
  }

  return {
    cad,
    documentales,
    segmentaciones,
    hechos,
    noLeidos,
    resumen: `${cad.length} CAD abierto(s) · ${documentales.length} documento(s) de especificación · ${segmentaciones.reduce((a, s) => a + s.laminas.reduce((b, l) => b + l.regiones.length, 0), 0)} región(es) segmentadas · ${hechos.length} hecho(s) técnicos · ${noLeidos.length} sin leer`,
  }
}
