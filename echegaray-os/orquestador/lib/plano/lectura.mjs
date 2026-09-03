// LO ÚNICO QUE MIRA UN DIBUJO CON UN MODELO. Salió de `pipeline.mjs` cuando ese archivo pasó las
// 900 líneas y estas cuatro funciones —dos que miran una unidad y dos que las coordinan— dejaron de
// ser un detalle del pipeline para ser su parte cara: es acá donde se paga.

import fs from 'node:fs'
import crypto from 'node:crypto'
import { CAPACIDAD, pedirTexto } from '../ia/cliente.mjs'
import { bloqueAdjunto } from '../comprobantes/vision.mjs'
import { PROMPT, extraerJson, validarLamina, llaveDeCache } from './interpretar.mjs'
import { medir } from './conteo.mjs'
import { VIA } from '../conocimiento/metricas.mjs'
import { cacheDeLecturas } from './cache-lecturas.mjs'
import { enParalelo, CONCURRENCIA_POR_DEFECTO } from './paralelo.mjs'

/**
 * INTERPRETAR UNA LÁMINA. Una llamada de visión, o cero si ya estaba interpretada.
 *
 * `capacidad` es COMPLEX a propósito y no es negociable por parámetro barato: leer un plano es el
 * razonamiento técnico más difícil de todo el OS, y el modelo chico —medido en la lectura de
 * comprobantes— confunde dígitos en documentos mucho más simples que éste. Ahorrar acá es cotizar
 * mal una obra entera para ahorrar centavos.
 */
export async function interpretarLamina(doc, bytes, { pedir = pedirTexto, refrescar = false, logger = null, cache = null } = {}) {
  const cch = cache ?? cacheDeLecturas({ logger })
  const llave = llaveDeCache(bytes)
  if (!refrescar) {
    const cacheado = await cch.leer(llave)
    if (cacheado) return { ...validarLamina(cacheado.crudo, { archivo: doc.name, archivoId: doc.drive_file_id }), deCache: true, uso: null }
  }
  const bloque = bloqueAdjunto({ data: bytes.toString('base64'), mediaType: doc.mime_type || 'application/pdf' })
  if (!bloque) return { ...validarLamina({}, { archivo: doc.name, archivoId: doc.drive_file_id }), deCache: false, uso: null, error: `no hay forma de mirar un ${doc.mime_type}` }

  const r = await pedir({
    capacidad: CAPACIDAD.COMPLEX,
    sistema: 'Sos un ingeniero civil computando una obra. Devolvés SÓLO JSON válido, sin markdown.',
    mensajes: [{ role: 'user', content: [bloque, { type: 'text', text: PROMPT }] }],
    maxTokens: 16000,
    agente: 'xsas-ingenieria',
    funcion: 'interpretar-plano',
    logger,
  })
  const crudo = extraerJson(r.texto)
  // «el modelo no devolvió JSON» y «no había modelo» son dos cosas distintas, y decir la primera
  // cuando pasó la segunda esconde exactamente lo que hay que ver.
  if (!crudo) return { ...validarLamina({}, { archivo: doc.name, archivoId: doc.drive_file_id }), deCache: false, uso: r, degradado: r?.degradado ?? null, error: r?.degradado ? `no se pudo mirar la lámina: ${r.degradado}` : 'el modelo no devolvió JSON interpretable' }
  await cch.guardar(llave, { crudo, archivo: doc.name, cuando: new Date().toISOString() })
  return { ...validarLamina(crudo, { archivo: doc.name, archivoId: doc.drive_file_id }), deCache: false, uso: r }
}

/**
 * INTERPRETAR UNA REGIÓN RECORTADA. Una llamada de visión por VISTA, no por lámina.
 *
 * ═══ POR QUÉ VALE LA PENA PAGAR VARIAS EN VEZ DE UNA ═══
 *
 * La lámina entera llega al modelo a ~141 dpi: un símbolo de columna de 8 mm ocupa cuatro píxeles y
 * no se puede contar. La misma vista recortada llega a 226–400 dpi. Y además la respuesta deja de
 * mezclar: preguntar «qué elementos hay» sobre CORTE A-A no puede devolver cotas de la planta,
 * porque la planta no está en la imagen.
 *
 * El caché es por hash del PNG, así que el costo se paga una vez por contenido y una lámina que no
 * cambió no se vuelve a mirar nunca.
 */
export async function interpretarRegion(recorte, { pedir = pedirTexto, refrescar = false, archivo = null, logger = null, cache = null } = {}) {
  const cch = cache ?? cacheDeLecturas({ logger })
  const bytes = fs.readFileSync(recorte.ruta)
  const llave = `v3region:${crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32)}`
  const contexto = { archivo: `${archivo ?? 'lámina'} · ${recorte.region?.titulo ?? `región ${recorte.region?.n}`}`, archivoId: null }
  if (!refrescar) {
    const cacheado = await cch.leer(llave)
    if (cacheado) return { ...validarLamina(cacheado.crudo, contexto), region: recorte.region, deCache: true, uso: null }
  }
  const bloque = bloqueAdjunto({ data: bytes.toString('base64'), mediaType: 'image/png' })
  const r = await pedir({
    capacidad: CAPACIDAD.COMPLEX,
    sistema: 'Sos un ingeniero civil computando una obra. Devolvés SÓLO JSON válido, sin markdown.',
    mensajes: [{ role: 'user', content: [bloque, { type: 'text', text: `${PROMPT}\n\nESTA IMAGEN ES UNA SOLA VISTA de la lámina, recortada y ampliada: «${recorte.region?.titulo ?? ''}» (${recorte.region?.tipo ?? 'vista'}). Computá SÓLO lo que se ve acá. Si un dato está en otra vista, anotalo en "referencias_a_otras_laminas" y dejalo en null.` }] }],
    maxTokens: 12000,
    agente: 'xsas-ingenieria',
    funcion: 'interpretar-region',
    logger,
  })
  const crudo = extraerJson(r.texto)
  if (!crudo) return { ...validarLamina({}, contexto), region: recorte.region, deCache: false, uso: r, degradado: r?.degradado ?? null, error: r?.degradado ? `no se pudo mirar la vista: ${r.degradado}` : 'el modelo no devolvió JSON interpretable' }
  await cch.guardar(llave, { crudo, region: recorte.region?.titulo ?? null, cuando: new Date().toISOString() })
  return { ...validarLamina(crudo, contexto), region: recorte.region, deCache: false, uso: r }
}

/** Las regiones que vale la pena mirar. La carátula no tiene elementos que computar y el croquis de
 *  ubicación tampoco: gastar una llamada de visión en ellas es gastar por gastar. PURA. */
export const REGIONES_QUE_SE_MIRAN = Object.freeze(['planta', 'corte', 'vista', 'detalle', 'cuadro', 'indeterminado'])

/**
 * ¿QUÉ HAY QUE HACER CON UNA LÁMINA? Bajarla si no vino adjunta, interpretarla, y medir lo que
 * quedó sin medir. Es la unidad que se paraleliza: NO toca ningún acumulador compartido, devuelve
 * un registro y quien lo llama lo aplica en orden.
 */
async function trabajarLamina(doc, { google, pedir, refrescar, logger, cache }) {
  let bytes = doc._bytes ?? null
  if (!bytes) {
    // Un archivo del índice que Drive ya no tiene (404, movido, sin permiso) se DECLARA y se
    // sigue: con el plano adjunto en la mano, morir acá era regalar la corrida entera.
    try { bytes = await google.descargarBytes(doc.drive_file_id) }
    catch (e) { return { doc, noDescargable: String(e?.message ?? e).slice(0, 80) } }
  }
  const lam = await interpretarLamina(doc, bytes, { pedir, refrescar, logger, cache })
  // LA SEGUNDA PASADA VA SOBRE LA MISMA LÁMINA Y SÓLO SI QUEDÓ ALGO SIN MEDIR. Su resultado se
  // cachea junto al inventario: dos pasadas se pagan una vez por contenido, no una por corrida.
  const llave = `${llaveDeCache(bytes)}:medicion`
  const guardado = refrescar ? null : await cache.leer(llave)
  if (guardado) return { doc, lam, guardado }
  const m = await medir({ pedir, bloque: bloqueAdjunto({ data: bytes.toString('base64'), mediaType: doc.mime_type || 'application/pdf' }), elementos: lam.elementos, logger })
  const medicion = { pendientes: m.pendientes, resueltos: m.resueltos, cambios: m.cambios, deCache: false }
  if (m.uso) await cache.guardar(llave, { elementos: m.elementos, medicion })
  return { doc, lam, m, medicion }
}

/**
 * TODAS LAS LÁMINAS, EN PARALELO, CON LA SALIDA EN EL ORDEN DE ENTRADA.
 *
 * Las métricas y los usos se anotan DESPUÉS, recorriendo los resultados por índice. Anotarlos
 * dentro de cada trabajo los dejaría en orden de llegada: `ia.usos` cambiaría de orden entre dos
 * corridas idénticas y la evidencia de reproducibilidad se volvería ruido.
 */
export async function leerLaminas({
  docs = [], google, pedir, refrescar = false, logger = null, cache = null, met, anotar,
  concurrencia = CONCURRENCIA_POR_DEFECTO, cancelado = null, onProgreso = null,
  trabajar = trabajarLamina,
} = {}) {
  const cch = cache ?? cacheDeLecturas({ logger })
  const { resultados, cancelada } = await enParalelo(
    docs,
    (doc) => trabajar(doc, { google, pedir, refrescar, logger, cache: cch }),
    { concurrencia, cancelado, onProgreso, fase: 'laminas', que: (d) => d?.name ?? null })

  const laminas = []
  const noDescargables = []
  for (const r of resultados) {
    const { doc, noDescargable, lam, m, guardado, medicion } = r
    if (noDescargable) {
      noDescargables.push(doc)
      met?.decidio?.({ que: `lámina ${doc.name}`, via: VIA.HUECO })
      logger?.warn?.('xsas: lámina no descargable', { archivo: doc.name, porQue: noDescargable })
      continue
    }
    anotar?.(lam.uso)
    met?.decidio?.({ que: `lámina ${doc.name}`, via: lam.deCache ? VIA.CACHE : (lam.error ? VIA.HUECO : VIA.MODELO) })
    if (lam.uso && !lam.uso.degradado) met?.llamo?.({ proveedor: 'ia', modelo: lam.uso.modelo, tokensIn: lam.uso.tokens?.in ?? null, tokensOut: lam.uso.tokens?.out ?? null, usd: lam.uso.usd, ms: lam.uso.ms, funcion: 'interpretar-plano' })
    if (guardado) {
      laminas.push({ ...lam, elementos: guardado.elementos, medicion: { ...guardado.medicion, deCache: true } })
      continue
    }
    anotar?.(m.uso)
    if (m.uso && !m.uso.degradado) met?.llamo?.({ proveedor: 'ia', modelo: m.uso.modelo, tokensIn: m.uso.tokens?.in ?? null, tokensOut: m.uso.tokens?.out ?? null, usd: m.uso.usd, ms: m.uso.ms, funcion: 'medir' })
    laminas.push({ ...lam, elementos: m.elementos, medicion })
  }
  return { laminas, noDescargables, cancelada }
}

/** Las vistas que se van a mirar, aplanadas en un orden fijo: el de las segmentaciones, el de sus
 *  láminas y el de sus recortes. PURA — y separada para poder probar el orden sin llamar a nadie. */
export function vistasAMirar(segmentaciones = []) {
  const unidades = []
  for (const seg of segmentaciones) {
    for (const lam of seg.laminas ?? []) {
      for (const rec of lam.recortes ?? []) {
        if (!rec.ok || !REGIONES_QUE_SE_MIRAN.includes(rec.region?.tipo)) continue
        unidades.push({ archivo: seg.archivo, recorte: rec })
      }
    }
  }
  return unidades
}

/** UNA MIRADA POR VISTA, NO UNA POR LÁMINA — y todas a la vez. Mismo contrato de orden que
 *  `leerLaminas`: el paralelismo cambia cuándo, nunca en qué orden queda `porRegion`. */
export async function leerVistas({
  segmentaciones = [], pedir, refrescar = false, logger = null, cache = null, met, anotar,
  concurrencia = CONCURRENCIA_POR_DEFECTO, cancelado = null, onProgreso = null,
  interpretar = interpretarRegion,
} = {}) {
  const cch = cache ?? cacheDeLecturas({ logger })
  const unidades = vistasAMirar(segmentaciones)
  const { resultados, cancelada } = await enParalelo(
    unidades,
    async ({ archivo, recorte }) => ({ archivo, r: await interpretar(recorte, { pedir, refrescar, archivo, logger, cache: cch }) }),
    { concurrencia, cancelado, onProgreso, fase: 'vistas', que: (u) => u?.recorte?.region?.titulo ?? null })

  const porRegion = []
  for (const { archivo, r } of resultados) {
    anotar?.(r.uso)
    met?.decidio?.({ que: `vista ${r.region?.titulo ?? r.region?.n}`, via: r.deCache ? VIA.CACHE : (r.error ? VIA.HUECO : VIA.MODELO) })
    if (r.uso && !r.uso.degradado) met?.llamo?.({ proveedor: 'ia', modelo: r.uso.modelo, tokensIn: r.uso.tokens?.in ?? null, tokensOut: r.uso.tokens?.out ?? null, usd: r.uso.usd, ms: r.uso.ms, funcion: 'interpretar-region' })
    porRegion.push({ archivo, ...r })
  }
  return { porRegion, cancelada }
}
