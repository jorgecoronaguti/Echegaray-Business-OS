// EL BORDE DEL CIRCUITO PLANO → COTIZACIÓN. Lo único de esta carpeta que toca Drive, la base y el
// modelo. Todo lo demás —clasificar, interpretar, computar, mapear— es puro y se prueba sin red.
//
// ═══ QUÉ ORDEN SIGUE Y POR QUÉ ═══
//
//   1. drive_index          localizar (SQL sobre un índice que ya existe, 0 tokens)
//   2. partirDocumentos     separar insumos de lo que revela la respuesta  ← la validación ciega
//   3. interpretar          UNA llamada de visión por lámina, cacheada por hash de contenido
//   4. computar             puro, 0 tokens
//   5. Base Maestra         SQL: tarea_tipo + analisis vigente + recurso_precio vigente
//   6. armar la cotización  puro
//
// El modelo aparece UNA sola vez, en el paso 3, y sobre el único insumo que no se puede procesar
// de otra forma. Los pasos 4 a 6 son aritmética y SQL: pagarlos con tokens sería pagar por que
// alguien multiplique peor.

import fs from 'node:fs'
import path from 'node:path'
import { CAPACIDAD, pedirTexto } from '../ia/cliente.mjs'
import { bloqueAdjunto } from '../comprobantes/vision.mjs'
import { partirDocumentos, planosDe } from './documentos.mjs'
import { PROMPT, extraerJson, validarLamina, llaveDeCache } from './interpretar.mjs'
import { computarElementos } from './computo.mjs'
import { mapearPartidas } from './partidas.mjs'
import { seleccionarTodas, huella } from './seleccion.mjs'
import { procesosDeTodos } from './procesos.mjs'
import { medir } from './conteo.mjs'
import { elegir } from './elector.mjs'
import { FUENTE } from './fuente.mjs'

/** Dónde queda la interpretación de una lámina. Fuera del repo: es caché, no fuente. */
export const DIR_CACHE = process.env.ORQ_PLANO_CACHE || path.join(process.env.HOME || '/tmp', '.cache', 'echegaray-planos')

/** Los archivos de un proyecto en el índice de Drive. El término se busca en ruta Y nombre porque
 *  un plano puede no llevar el nombre del cliente y colgar de su carpeta, o al revés. */
export async function documentosDelProyecto({ query }, termino) {
  const t = `%${String(termino ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')}%`
  const r = await query(
    `select drive_file_id, name, path, mime_type, is_folder, size_bytes, modified_time
       from public.drive_index
      where path_norm like $1 or nombre_norm like $1
      order by path, name`, [t])
  return r.rows
}

/** La carpeta raíz del proyecto: el prefijo común de todo lo encontrado. Sirve para que la
 *  clasificación por carpeta no lea «PRESUPUESTOS - CLIENTES» como si describiera el documento. */
export function carpetaRaiz(filas = []) {
  const carpetas = filas.filter((f) => f.is_folder).map((f) => f.path).sort((a, b) => a.length - b.length)
  return carpetas[0] ?? ''
}

function leerCache(llave) {
  try { return JSON.parse(fs.readFileSync(path.join(DIR_CACHE, `${llave}.json`), 'utf8')) } catch { return null }
}
function guardarCache(llave, valor) {
  try {
    fs.mkdirSync(DIR_CACHE, { recursive: true })
    fs.writeFileSync(path.join(DIR_CACHE, `${llave}.json`), JSON.stringify(valor))
  } catch { /* el caché nunca decide si el pipeline funciona */ }
}

/**
 * INTERPRETAR UNA LÁMINA. Una llamada de visión, o cero si ya estaba interpretada.
 *
 * `capacidad` es COMPLEX a propósito y no es negociable por parámetro barato: leer un plano es el
 * razonamiento técnico más difícil de todo el OS, y el modelo chico —medido en la lectura de
 * comprobantes— confunde dígitos en documentos mucho más simples que éste. Ahorrar acá es cotizar
 * mal una obra entera para ahorrar centavos.
 */
export async function interpretarLamina(doc, bytes, { pedir = pedirTexto, refrescar = false, logger = null } = {}) {
  const llave = llaveDeCache(bytes)
  if (!refrescar) {
    const cacheado = leerCache(llave)
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
  if (!crudo) return { ...validarLamina({}, { archivo: doc.name, archivoId: doc.drive_file_id }), deCache: false, uso: r, error: 'el modelo no devolvió JSON interpretable' }
  guardarCache(llave, { crudo, archivo: doc.name, cuando: new Date().toISOString() })
  return { ...validarLamina(crudo, { archivo: doc.name, archivoId: doc.drive_file_id }), deCache: false, uso: r }
}

/** El catálogo de la Base Maestra con análisis vigente. Sólo las tareas que tienen composición
 *  sirven para cotizar: una tarea sin APU es un nombre, no un precio. */
export async function baseMaestra({ query }) {
  const r = await query(
    `select tt.id, tt.codigo, tt.nombre, tt.unidad
       from public.tarea_tipo tt
      where tt.activo is not false
        and exists (select 1 from public.analisis a where a.tarea_tipo_id = tt.id and a.vigente)
      order by tt.codigo`)
  return r.rows
}

/** La composición unitaria de un conjunto de tareas, con el precio VIGENTE de cada recurso.
 *  Un recurso sin precio vigente sale con `costoUnitario: null` y hace que la partida entera salga
 *  sin costo — la regla ya está en `cadenaDeCosto` y no se repite acá. */
export async function composiciones({ query }, tareaIds = []) {
  if (!tareaIds.length) return new Map()
  const r = await query(
    `select a.tarea_tipo_id, al.orden, rc.codigo, rc.nombre, rc.tipo, rc.unidad, rc.desperdicio,
            al.cantidad, rp.costo, rp.fecha_precio, rp.moneda, rp.fuente
       from public.analisis a
       join public.analisis_linea al on al.analisis_id = a.id
       join public.recurso rc on rc.id = al.recurso_id
       left join public.recurso_precio rp on rp.recurso_id = rc.id and rp.vigente
      where a.vigente and a.tarea_tipo_id = any($1::uuid[])
      order by a.tarea_tipo_id, al.orden`, [tareaIds])
  const mapa = new Map()
  for (const x of r.rows) {
    const lista = mapa.get(x.tarea_tipo_id) ?? []
    lista.push({
      codigo: x.codigo, nombre: x.nombre, tipo: x.tipo, unidad: x.unidad,
      cantidad: Number(x.cantidad), desperdicio: Number(x.desperdicio ?? 0),
      costoUnitario: x.costo === null ? null : Number(x.costo),
      fechaPrecio: x.fecha_precio ? String(x.fecha_precio).slice(0, 10) : null,
      moneda: x.moneda ?? 'ARS', fuentePrecio: x.fuente ?? null,
    })
    mapa.set(x.tarea_tipo_id, lista)
  }
  return mapa
}

/**
 * EL PIPELINE ENTERO. Devuelve el resultado estructurado; no escribe nada y no imprime nada.
 * Quien lo llama decide qué hacer con eso —persistirlo, resumirlo para Mattermost, exportarlo—.
 */
export async function correr({ query, google, termino, pedir = pedirTexto, refrescar = false, conVeto = false, logger = null } = {}) {
  const t0 = Date.now()
  const filas = await documentosDelProyecto({ query }, termino)
  const raiz = carpetaRaiz(filas)
  const { insumos, reservados } = partirDocumentos(filas, { carpetaObra: raiz })
  const planos = planosDe(insumos)

  const laminas = []
  const usos = []
  const anotar = (u) => { if (u) usos.push({ modelo: u.modelo, tokensIn: u.tokens?.in ?? null, tokensOut: u.tokens?.out ?? null, usd: u.usd, ms: u.ms }) }
  for (const doc of planos.legibles) {
    const bytes = await google.descargarBytes(doc.drive_file_id)
    const lam = await interpretarLamina(doc, bytes, { pedir, refrescar, logger })
    anotar(lam.uso)
    // LA SEGUNDA PASADA VA SOBRE LA MISMA LÁMINA Y SÓLO SI QUEDÓ ALGO SIN MEDIR. Su resultado se
    // cachea junto al inventario: dos pasadas se pagan una vez por contenido, no una por corrida.
    const llave = `${llaveDeCache(bytes)}:medicion`
    const guardado = refrescar ? null : leerCache(llave)
    if (guardado) {
      laminas.push({ ...lam, elementos: guardado.elementos, medicion: { ...guardado.medicion, deCache: true } })
      continue
    }
    const m = await medir({ pedir, bloque: bloqueAdjunto({ data: bytes.toString('base64'), mediaType: doc.mime_type || 'application/pdf' }), elementos: lam.elementos, logger })
    anotar(m.uso)
    const medicion = { pendientes: m.pendientes, resueltos: m.resueltos, cambios: m.cambios, deCache: false }
    if (m.uso) guardarCache(llave, { elementos: m.elementos, medicion })
    laminas.push({ ...lam, elementos: m.elementos, medicion })
  }

  const elementos = laminas.flatMap((l) => l.elementos)
  const computo = computarElementos(elementos)
  const catalogo = await baseMaestra({ query })
  // ═══ LA PARTIDA LA DECIDE EL CÓDIGO ═══
  //
  // Acá estaba el defecto que hacía que dos corridas idénticas dieran partidas distintas: `elegir`
  // podía CAMBIAR la elección del código («T1023 → T1075: …»), y una llamada al modelo no devuelve
  // lo mismo dos veces. Ahora la decisión es `seleccionarTodas`, que es pura, y el criterio técnico
  // del modelo entra sólo si se lo pide y SÓLO PUEDE VETAR: cuando descarta todas las candidatas de
  // un elemento, se veta la que iba primera. Si en cambio propone OTRA, eso no promueve nada —
  // queda anotado como desacuerdo para que lo mire una persona.
  const vetos = {}
  const desacuerdos = []
  let correcciones = []
  if (conVeto) {
    const bruto = mapearPartidas(computo.items, catalogo)
    const revision = await elegir({ pedir, mapeos: bruto.mapeos, logger })
    anotar(revision.uso)
    correcciones = revision.cambios ?? []
    for (const m of revision.mapeos) {
      const primera = m.candidatos?.[0]?.codigo
      if (!primera) continue
      if (m.estado !== 'MAPEADA') vetos[m.elemento] = [primera]
      else if (m.tarea?.codigo && m.tarea.codigo !== primera) desacuerdos.push({ elemento: m.elemento, codigo: primera, propuso: m.tarea.codigo, porQue: m.porQue })
    }
  }
  const seleccion = seleccionarTodas(computo.items, catalogo, { vetos })
  const mapeo = { ...seleccion, correcciones, desacuerdos }
  const procesos = procesosDeTodos(computo.items)
  const ids = [...new Set(mapeo.mapeos.filter((m) => m.tarea).map((m) => m.tarea.id))]
  const comps = await composiciones({ query }, ids)

  return {
    termino, carpeta: raiz, ms: Date.now() - t0,
    documentos: { total: filas.filter((f) => !f.is_folder).length, insumos, reservados, planos },
    laminas, computo, catalogo: catalogo.length, mapeo, composiciones: comps, procesos,
    // La huella es lo que se compara entre dos corridas para decir si dieron lo mismo. Va en el
    // resultado y no en un script aparte porque una reproducibilidad que hay que reconstruir a mano
    // no se verifica nunca.
    huella: huella(seleccion),
    ia: { llamadas: usos.length, usos, deCache: laminas.filter((l) => l.deCache).length },
    fuentePrecios: FUENTE.BASE_MAESTRA,
  }
}
