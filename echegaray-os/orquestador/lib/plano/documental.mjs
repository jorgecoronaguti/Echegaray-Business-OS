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
import { leerWord } from '../ingesta/word.mjs'
import { leerPlanilla, filaDe, filasDe } from '../ingesta/planilla.mjs'
import { takeoffDeHoja, libroDe } from '../cotizador/takeoff.mjs'
import { hechosDeCad, hechosDeTexto, CLASE_FUENTE } from './proyecto.mjs'

/** Las filas de una hoja como texto, con el mismo formato que producía `google.readExcel` para que
 *  los extractores de hechos que ya existen no vean un cambio de forma. PURA. */
const textoDeHoja = (h) => filasDe(h).map((f) => [...filaDe(h, f).values()].map((c) => c.texto).filter(Boolean).join(' | ')).filter(Boolean)

/** Qué clase de documento del proyecto es, para saber cuánto pesa lo que diga. El nombre es la
 *  única señal disponible antes de abrirlo, y por eso las reglas son explícitas y no una corazonada:
 *  «memoria» y «cálculo» pesan más que «pliego», y «pliego» más que una planilla del cliente. PURA. */
export function claseDocumental(nombre) {
  const n = String(nombre ?? '').toLowerCase()
  // Lo INTERNO se aparta primero, y antes que «memoria»: un archivo puede llamarse «memoria» y ser
  // un borrador. Los nombres salen de los que hay: «Charlar de diagrama de GANT», «Diagrama IA».
  if (/charlar|borrador|apunte|minuta|diagrama|whatsapp/.test(n)) return CLASE_FUENTE.NOTA_INTERNA
  if (/memoria|calculo|cálculo/.test(n)) return CLASE_FUENTE.MEMORIA
  // El contrato define el ALCANCE y es lo que se puede oponer al cliente. Antes llegaba a PLIEGO
  // por el `return` final —o sea, por descarte—: si mañana alguien cambia el default, el contrato
  // se movía con él sin que nadie lo decidiera. Va escrito.
  if (/contrato|convenio|acuerdo|adenda|locacion de obra|locación de obra/.test(n)) return CLASE_FUENTE.PLIEGO
  if (/pliego|especificacion|especificación|condiciones/.test(n)) return CLASE_FUENTE.PLIEGO
  if (/planilla|computo|cómputo|listado/.test(n)) return CLASE_FUENTE.PLANILLA
  // NO es PLIEGO. Que el nombre no diga qué es no lo convierte en la especificación del proyecto:
  // el borrador que no se llame «borrador» entraba con peso 4 y le ganaba a la planilla del cliente.
  return CLASE_FUENTE.SIN_CLASIFICAR
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
    // ═══ UNA PLANILLA TIENE MÁS DE UNA HOJA, Y ESO NO ERA UN DETALLE ═══
    // Hasta acá esta rama era `google.readExcel`, que lee `SheetNames[0]` y descarta el resto en
    // silencio. En el COMPUTO.xlsx de Quattropani la primera hoja es «Real» —lo ejecutado— y la que
    // originó la cotización es «Presupuestado»: el circuito venía leyendo la hoja equivocada sin que
    // nada lo dijera. Además aplanaba todo a texto, así que ninguna cantidad podía citar su celda.
    // `leerPlanilla` trabaja sobre los MISMOS bytes que ya se descargaron —una llamada menos a
    // Drive— y devuelve el modelo con hoja, celda, fórmula e inputs.
    if (formato === FORMATO.PLANILLA) {
      const p = leerPlanilla(bytes, { nombre: doc.name })
      if (p.ok) {
        const texto = p.hojas.map((h) => [`## hoja: ${h.nombre}`, ...textoDeHoja(h)].join('\n')).join('\n')
        return { ok: true, texto, formato, planilla: p, pestanas: p.hojas.map((h) => h.nombre) }
      }
      // El formato viejo (.xls OLE2) y el .csv no los abre el lector nuevo. Antes de declararlos sin
      // leer se intenta el camino de Drive, que sí los convierte — pero se conserva el motivo por el
      // que el lector con celdas no pudo, porque eso es lo que explica por qué esas cantidades no
      // van a poder citar su origen.
      if (!google?.readExcel) return { ok: false, formato, porQue: p.porQue }
      // ═══ EL SEGUNDO INTENTO TAMPOCO PUEDE TUMBAR LA CORRIDA (mismo criterio que `bytesDe`) ═══
      // Este camino sale a Drive por el archivo: un adjunto en memoria («adjunto:<hash>») da 404
      // seguro, y un archivo del índice puede haberse movido. Sin esta guarda, la excepción subía
      // al catch general y el motivo quedaba en «Requested entity was not found» — que no dice
      // cuál de los dos lectores falló ni por qué. Se declara, no se adivina.
      try {
        const x = await google.readExcel(doc.drive_file_id, { maxRows: 300 })
        const texto = (x.rows ?? []).map((f) => (Array.isArray(f) ? f.filter(Boolean).join(' | ') : String(f))).join('\n')
        return { ok: true, texto, formato, pestana: x.sheet, sinCeldas: p.porQue }
      } catch (e) {
        return { ok: false, formato, porQue: `${p.porQue} · y Drive tampoco lo pudo convertir: ${String(e?.message ?? e).slice(0, 80)}` }
      }
    }
    // ═══ EL DOCUMENTO DE WORD ES DONDE VIVE EL ALCANCE ═══
    // Hasta acá este `return` decía «todavía no hay lector de texto para DOCUMENTO» y con esa frase
    // quedó afuera del proyecto de QUATTROPANI el CONTRATO DE OBRA con su memoria descriptiva —el
    // único papel que dice qué está EXCLUIDO (entrepiso y escalera), quién contrata la estructura
    // metálica y qué muros no llevan revoque—. El motor computaba el plano sin saber nada de eso.
    if (formato === FORMATO.DOCUMENTO) {
      const w = leerWord(bytes, { nombre: doc.name })
      return w.ok
        ? { ok: true, texto: w.texto, formato, variante: w.variante, tablas: w.bloques?.filter((b) => b.tipo === 'tabla') ?? [] }
        : { ok: false, formato, porQue: w.porQue }
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
  const takeoffs = []
  const noLeidos = []

  // ═══ LOS BYTES PUEDEN NO LLEGAR, Y ESO NO TUMBA LA CORRIDA (dueño, 02/09: «google download 404») ═══
  //
  // Dos causas reales, mismo síntoma: (1) un ADJUNTO viaja en memoria con id «adjunto:<hash>» —
  // pedírselo a Drive es un 404 seguro; el primer tramo del pipeline ya usaba `_bytes` y este tramo
  // no, así que cotizar con un plano adjunto moría acá con el plano en la mano. (2) un archivo del
  // índice que ya no existe en Drive (borrado, movido, sin permiso). En ambos casos la respuesta
  // honesta es la de siempre en este archivo: el documento queda DECLARADO como no leído con su
  // motivo, y la corrida sigue con lo que sí se pudo abrir.
  const bytesDe = async (doc) => {
    if (doc._bytes) return { ok: true, bytes: doc._bytes }
    try { return { ok: true, bytes: await google.descargarBytes(doc.drive_file_id) } }
    catch (e) {
      const porQue = `no se pudo descargar de Drive: ${String(e?.message ?? e).slice(0, 80)}`
      logger?.warn?.('xsas: documento no descargable', { archivo: doc.name, porQue })
      return { ok: false, porQue }
    }
  }

  for (const doc of cadDe(insumos)) {
    const b = await bytesDe(doc)
    if (!b.ok) { noLeidos.push({ archivo: doc.name, porQue: b.porQue }); continue }
    const r = await abrirCad(doc, b.bytes)
    if (!r.ok) { noLeidos.push({ archivo: doc.name, porQue: r.porQue, comoSeResuelve: r.comoSeResuelve ?? null }); logger?.warn?.('xsas: CAD no legible', { archivo: doc.name }); continue }
    cad.push(r)
    hechos.push(...hechosDeCad(r.medicion, { documento: doc.name }))
  }

  for (const doc of documentalesDe(insumos)) {
    const b = await bytesDe(doc)
    if (!b.ok) { noLeidos.push({ archivo: doc.name, porQue: b.porQue }); continue }
    const t = await textoDe(doc, b.bytes, { google })
    if (!t.ok) { noLeidos.push({ archivo: doc.name, porQue: t.porQue }); continue }
    const clase = claseDocumental(doc.name)
    documentales.push({ archivo: doc.name, clase: clase.id, caracteres: t.texto.length, clasePdf: t.clasePdf ?? null, pestanas: t.pestanas ?? null, sinCeldas: t.sinCeldas ?? null })
    hechos.push(...hechosDeTexto(t.texto, { documento: doc.name, clase }))
    // ═══ LA PLANILLA NO ES SÓLO TEXTO ═══
    // Un pliego se lee y se convierten sus frases en hechos. Una planilla de cómputo YA TIENE la
    // cantidad, la unidad y la fórmula en celdas separadas: convertirla a texto para volver a sacar
    // el número con una expresión regular pierde la fórmula y la dirección de la celda, que es
    // justo lo que hace falta para poder defender la cantidad después.
    if (t.planilla?.ok) {
      const libro = libroDe(t.planilla)
      for (const h of t.planilla.hojas) {
        const tk = takeoffDeHoja(h, { documento: doc.name, driveId: doc.drive_file_id ?? null, libro })
        takeoffs.push({ archivo: doc.name, ...tk })
      }
    }
  }

  for (const doc of planosLegibles) {
    if (!/pdf$/i.test(String(doc.name))) continue
    const b = await bytesDe(doc)
    if (!b.ok) { noLeidos.push({ archivo: doc.name, porQue: b.porQue }); continue }
    segmentaciones.push(await segmentarLamina(doc, b.bytes, { escribirTemporal, limite }))
  }

  const cantidadesDePlanilla = takeoffs.reduce((a, t) => a + t.cantidades.length, 0)
  return {
    cad,
    documentales,
    segmentaciones,
    hechos,
    takeoffs,
    noLeidos,
    resumen: `${cad.length} CAD abierto(s) · ${documentales.length} documento(s) de especificación · ${segmentaciones.reduce((a, s) => a + s.laminas.reduce((b, l) => b + l.regiones.length, 0), 0)} región(es) segmentadas · ${hechos.length} hecho(s) técnicos · ${cantidadesDePlanilla} cantidad(es) de planilla con celda y fórmula · ${noLeidos.length} sin leer`,
  }
}
