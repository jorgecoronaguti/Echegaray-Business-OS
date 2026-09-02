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
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { CAPACIDAD, pedirTexto } from '../ia/cliente.mjs'
import { bloqueAdjunto } from '../comprobantes/vision.mjs'
import { partirDocumentos, planosDe } from './documentos.mjs'
import { PROMPT, extraerJson, validarLamina, llaveDeCache } from './interpretar.mjs'
import { computarElementos } from './computo.mjs'
import { mapearPartidas } from './partidas.mjs'
import { seleccionarTodas, huella } from './seleccion.mjs'
import { procesosDeTodos } from './procesos.mjs'
import { controlar } from './control.mjs'
import { claseDocumental, ingerir } from './documental.mjs'
import { armarProyecto } from './proyecto.mjs'
import { relacionar } from './relacion.mjs'
import { resolverConCad } from './medicion-cad.mjs'
import { piezaDe } from './atributos.mjs'
import { obraDesdeCotizacion } from './genealogia.mjs'
import { omisionesPotenciales } from '../circot/referencia.mjs'
import { evaluarChecklist } from '../circot/modelo-galpon.mjs'
import { VIA, medidor as nuevoMedidor } from '../conocimiento/metricas.mjs'
import { medir } from './conteo.mjs'
import { elegir } from './elector.mjs'
import { FUENTE, faltaDato, tieneNumero } from './fuente.mjs'

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

/**
 * LOS ADJUNTOS ENTRAN AL PIPELINE EN MEMORIA — XSAS NO ESCRIBE EN DRIVE POR SU CUENTA.
 *
 * Decisión del dueño (02/09/2026): un plano que llega adjunto al chat NO se sube a ninguna carpeta
 * de Drive. Se vuelve un documento con la MISMA forma que una fila de `drive_index`, identificado
 * por el hash de su contenido — la misma llave del caché de interpretación, así que genealogía y
 * costo no cambian. Su rastro persistente es `orq.xsas_adjunto` (bytes por actor+hash), no Drive.
 * Un adjunto sin nombre o sin contenido se ignora: no hay documento que afirmar. PURA.
 */
export function documentosEnMemoria(adjuntos = []) {
  return (adjuntos ?? [])
    .map((a) => {
      const base64 = a?.contenido_base64
        ?? (typeof a?.contenido === 'string' ? Buffer.from(a.contenido, 'utf8').toString('base64') : null)
      if (!a?.nombre || !base64) return null
      const bytes = Buffer.from(base64, 'base64')
      return {
        drive_file_id: `adjunto:${llaveDeCache(bytes)}`,
        name: a.nombre,
        path: `(adjunto)/${a.nombre}`,
        mime_type: null,
        is_folder: false,
        size_bytes: bytes.length,
        modified_time: null,
        _bytes: bytes,
      }
    })
    .filter(Boolean)
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
  // «el modelo no devolvió JSON» y «no había modelo» son dos cosas distintas, y decir la primera
  // cuando pasó la segunda esconde exactamente lo que hay que ver.
  if (!crudo) return { ...validarLamina({}, { archivo: doc.name, archivoId: doc.drive_file_id }), deCache: false, uso: r, degradado: r?.degradado ?? null, error: r?.degradado ? `no se pudo mirar la lámina: ${r.degradado}` : 'el modelo no devolvió JSON interpretable' }
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
/** Una fecha de Postgres a `YYYY-MM-DD`. PURA.
 *
 * `String(fecha).slice(0, 10)` daba «Fri May 01»: `pg` devuelve las columnas `date` como `Date` de
 * JavaScript, y su `toString()` es el formato largo en inglés. Ese string no se puede ordenar ni
 * restar, así que la vigencia del precio salía como `NaN` días y nadie lo notaba porque el campo
 * igual «tenía valor». Y no se usa `toISOString()` porque el `Date` viene en hora local: a las 00:00
 * de un huso negativo el ISO retrocede un día. */
export function isoFecha(v) {
  if (!v) return null
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  return String(v).slice(0, 10)
}

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
      fechaPrecio: isoFecha(x.fecha_precio),
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
/** La publicación del CIRCOT más reciente que haya en el repo. Es un archivo local: no cuesta nada
 *  y si no está, el control sale sin referencia externa y lo dice. */
export function cargarReferenciaCircot(dir = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'datos', 'circot')) {
  try {
    const archivos = fs.readdirSync(dir).filter((f) => f.startsWith('mano-de-obra-') && f.endsWith('.json')).sort()
    if (!archivos.length) return null
    return JSON.parse(fs.readFileSync(path.join(dir, archivos[archivos.length - 1]), 'utf8'))
  } catch { return null }
}

/** ¿La documentación dice que esto es un galpón industrial? El checklist del Modelo III se aplica
 *  sólo si alguien lo dijo — el plano o el usuario—, con su evidencia. PURA. */
export function tipoObraDe(laminas = [], declarado = null, nombresDeArchivo = []) {
  const ES_GALPON = /galp[oó]n|nave industrial/i
  if (declarado) return { tipo: String(declarado), esGalpon: ES_GALPON.test(String(declarado)), fuente: 'declarado por quien pidió el análisis' }
  for (const l of laminas) {
    const texto = [l?.proyecto?.destino, l?.proyecto?.nombre, l?.lamina?.titulo].filter(Boolean).join(' · ')
    if (ES_GALPON.test(texto)) return { tipo: 'GALPON_INDUSTRIAL', esGalpon: true, fuente: FUENTE.EXTRAIDO_PLANO, textoLiteral: texto.slice(0, 120), archivo: l?.archivo ?? null }
  }
  // EL NOMBRE DEL ARCHIVO ES LA ÚLTIMA SEÑAL Y LA MÁS DÉBIL: ya costó caro creerle a un nombre en
  // este repo. Se usa igual porque lo único que dispara es un CHECKLIST DE PREGUNTAS —no agrega
  // ninguna partida ni ningún peso— y se marca INFERIDO para que nadie la lea como un hecho.
  const archivo = nombresDeArchivo.find((n) => ES_GALPON.test(String(n)))
  if (archivo) return { tipo: 'GALPON_INDUSTRIAL', esGalpon: true, fuente: FUENTE.INFERIDO, textoLiteral: String(archivo), porQue: 'lo dice el NOMBRE de un archivo del proyecto, no su contenido: alcanza para hacer las preguntas del checklist y no para afirmar nada' }
  return { tipo: null, esGalpon: false, fuente: FUENTE.FALTA_DATO, porQue: 'la documentación no declara el tipo de obra, así que no se aplica ningún checklist tipológico' }
}

/** Deja los bytes de un archivo en disco UNA vez por contenido. El recortador trabaja sobre un
 *  archivo —MuPDF abre rutas, no buffers— y bajar el mismo plano dos veces sería pagar dos veces
 *  el mismo byte. */
export function escritorTemporal(dir = path.join(os.tmpdir(), 'xsas-fuentes')) {
  return async (bytes, nombre) => {
    fs.mkdirSync(dir, { recursive: true })
    const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 24)
    const ruta = path.join(dir, `${hash}${path.extname(String(nombre ?? '')) || '.pdf'}`)
    if (!fs.existsSync(ruta) || fs.statSync(ruta).size !== bytes.length) fs.writeFileSync(ruta, bytes)
    return ruta
  }
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
export async function interpretarRegion(recorte, { pedir = pedirTexto, refrescar = false, archivo = null, logger = null } = {}) {
  const bytes = fs.readFileSync(recorte.ruta)
  const llave = `v3region:${crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 32)}`
  const contexto = { archivo: `${archivo ?? 'lámina'} · ${recorte.region?.titulo ?? `región ${recorte.region?.n}`}`, archivoId: null }
  if (!refrescar) {
    const cacheado = leerCache(llave)
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
  guardarCache(llave, { crudo, region: recorte.region?.titulo ?? null, cuando: new Date().toISOString() })
  return { ...validarLamina(crudo, contexto), region: recorte.region, deCache: false, uso: r }
}

/**
 * ¿ESTO ES UN NÚMERO DE VERDAD? PURA.
 *
 * `Number(null)` es 0 y `Number.isFinite(0)` es `true`: preguntar sólo por `isFinite` contaba como
 * MEDIDO todo elemento cuya cantidad está explícitamente en `null`, que es justo el que NO se pudo
 * medir. Es el mismo `Number(null)` que ya había hecho que `horasNecesarias(null)` devolviera 0
 * horas en vez de un hueco. Lo encontró el test de regresión de `elementosComputados`.
 */
export { tieneNumero }

/**
 * POR QUÉ VÍA SE RESOLVIÓ UNA CANTIDAD. PURA — y exportada para poder probarla por la ruta real.
 *
 * El CAD es la única vía que nunca pasó por un modelo: cuenta INSERTs de un DXF. Todo lo demás
 * salió de una lectura del plano, y esa lectura la hizo el modelo — en esta corrida o la vez que
 * llenó el caché. Llamarla `REGLA` la sacaba del denominador del Claude Avoidance Rate y dejaba el
 * indicador sesgado hacia arriba por construcción.
 */
export function viaDeCantidad({ tieneCantidad, porCad, deCache }) {
  if (!tieneCantidad) return VIA.HUECO
  if (porCad) return VIA.DOCUMENTO_LOCAL
  // `undefined` es «no sé de dónde salió esta lectura» —pasa cuando la fusión une un elemento de
  // lámina cacheada con otro de una vista mirada de nuevo y el representante se queda con el id del
  // cacheado—. Y ante la duda NO se cuenta a favor: suponer caché sube el Claude Avoidance Rate sin
  // evidencia, que es la dirección exacta en la que este indicador ya estuvo mintiendo una vez.
  return deCache === true ? VIA.CACHE : VIA.MODELO
}

/** Por qué vía se resolvió una partida. PURA. Con `conVeto`, el modelo veta candidatas y eso cambia
 *  la elección: anotarla como BASE_MAESTRA contaba una decisión del modelo como propia. */
export const viaDePartida = ({ mapeada, vetadaPorModelo }) => (!mapeada ? VIA.HUECO : (vetadaPorModelo ? VIA.MODELO : VIA.BASE_MAESTRA))

/**
 * EL PROVEEDOR DE RAZONAMIENTO, ENVUELTO PARA QUE SU AUSENCIA SEA UN DATO Y NO UNA EXCEPCIÓN.
 *
 * Devuelve un `pedirSeguro` con la misma firma y un registro de `degradacion` que va creciendo. Un
 * fallo del modelo se convierte en `{ texto: null, degradado: <motivo> }`: los llamadores ya saben
 * qué hacer cuando no hay JSON, y ahora además saben POR QUÉ no lo hay.
 *
 * `permitirModelo: false` ni siquiera intenta — es el escenario que hay que poder probar sin
 * romperle el saldo a nadie.
 */
export function pedirConDegradacion(pedir, { permitirModelo = true } = {}) {
  const degradacion = { hubo: false, permitirModelo, intentos: 0, fallos: 0, motivos: [] }
  const anotar = (motivo, funcion) => {
    degradacion.hubo = true
    degradacion.fallos += 1
    const ya = degradacion.motivos.find((m) => m.motivo === motivo)
    if (ya) { ya.veces += 1; if (funcion && !ya.funciones.includes(funcion)) ya.funciones.push(funcion) }
    else degradacion.motivos.push({ motivo, veces: 1, funciones: funcion ? [funcion] : [] })
  }
  const pedirSeguro = async (args) => {
    if (!permitirModelo) {
      anotar('el proveedor de razonamiento está apagado para esta corrida', args?.funcion)
      return { texto: null, degradado: 'modelo apagado' }
    }
    degradacion.intentos += 1
    try {
      return await pedir(args)
    } catch (e) {
      const m = String(e?.message ?? e).slice(0, 160)
      anotar(`el proveedor de razonamiento falló: ${m}`, args?.funcion)
      return { texto: null, degradado: m }
    }
  }
  return { pedirSeguro, degradacion }
}

/**
 * FUSIONAR LO LEÍDO EN LA LÁMINA COMPLETA CON LO LEÍDO EN CADA VISTA. PURA.
 *
 * ═══ EL DEFECTO QUE ESTO ARREGLA, MEDIDO ═══
 *
 * La versión anterior deduplicaba por `String(e.id)` EXACTO, y el `id` lo escribe el modelo mirando
 * cada vista por separado. La misma pieza vuelve con otro nombre según la vista: `PUERTA_BLINDEX` y
 * `PUERTA-BLINDEX`, `TANQUE` y `TANQUE-RES`, `PORT-CORR` y `PORTON`, `CE-VE-VF` y `CE=VE=VF` —que
 * difieren en UN carácter—. Sobre la corrida real de Quattropani: 20 grupos con el mismo nombre y
 * distinto id sobrevivían a la fusión y CINCO llegaban a tener cantidad computada dos veces —cuatro
 * puertas blindex donde hay dos, dos tanques, dos rampas, dos portones, dos garitas—. Además
 * inflaban el denominador de la cobertura.
 *
 * Ahora la identidad se normaliza —sin tildes, sin signos, en minúsculas— y se compara también por
 * NOMBRE, que es lo que el modelo escribe igual aunque le cambie la marca.
 *
 * ═══ Y CUANDO LA COLISIÓN NO ES SEGURA, NO SE RESUELVE SOLA ═══
 *
 * Dos ids distintos que caen en el mismo nombre normalizado PUEDEN ser la misma pieza vista dos
 * veces, o dos piezas que el proyectista llamó parecido. Fusionar en silencio esconde el segundo
 * caso; contar las dos esconde el primero. Sale UNA sola —la lectura con más dimensiones
 * resueltas, que es la del dibujo donde mejor se veía— y la colisión queda DECLARADA para que la
 * mire una persona.
 */
/** Los números que aparecen en el id y el nombre de un elemento, deduplicados y ordenados. PURA. */
export const firmaNumerica = (e) => [...new Set(String(`${e?.id ?? ''} ${e?.nombre ?? ''}`).match(/\d+/g) ?? [])]
  .map(Number).sort((a, b) => a - b).join('-')

const numerosDe = (firma) => String(firma ?? '').split('-').filter(Boolean)

/**
 * ¿ESTAS DOS FIRMAS DISCRIMINAN UNA PIEZA DE OTRA? PURA.
 *
 * ═══ EL DEFECTO QUE ESTA FUNCIÓN EXISTE PARA IMPEDIR ═══
 *
 * Comparar firmas por igualdad exacta trataba un sufijo de serie que puso EL MODELO —`MAT1`,
 * `GAR-2`, `TQ1`— igual que una designación del proyectista —`C1` contra `C2`—. Medido:
 * `MATAFUEGO` (sin número, 4 unidades) contra `MAT1` (número «1», 3 unidades) salían como dos
 * piezas distintas, con el texto «el proyectista los separó a propósito» y un
 * `quienLoResuelve: 'nadie'`.
 *
 * Y el problema no es que cuente dos veces: es que EL SISTEMA DICE QUE SABE. Un elemento sin
 * número no puede haber sido separado a propósito de uno con número — no hay nada que separar—, y
 * afirmar lo contrario le dice al que revisa que no mire. Lo mismo cuando una firma está CONTENIDA
 * en la otra: `600` dentro de `1-600` no es una designación distinta, es la misma con un sufijo.
 *
 * Sólo discriminan dos conjuntos de números NO VACÍOS donde ninguno contiene al otro: «1» contra
 * «2», «VA1» contra «VA2». Todo lo demás es indecidible, y decir «no sé» es la respuesta correcta.
 */
export function firmasDiscriminan(a, b) {
  const na = numerosDe(a)
  const nb = numerosDe(b)
  if (!na.length || !nb.length) return false
  const contenida = (x, y) => x.every((n) => y.includes(n))
  if (contenida(na, nb) || contenida(nb, na)) return false
  return true
}

/** ¿Dos valores de la misma dimensión dicen lo mismo? Tolerancia relativa: una lectura de 3,50 y
 *  otra de 3,4999 son la misma medida; 0,1 y 0,8 no. PURA. */
export const mismaMedida = (a, b, tol = 0.01) => {
  const na = Number(a)
  const nb = Number(b)
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return String(a) === String(b)
  return Math.abs(na - nb) / Math.max(Math.abs(na), Math.abs(nb), 1e-9) <= tol
}

/**
 * EN QUÉ SE CONTRADICEN DOS LECTURAS DE LO QUE DEBERÍA SER LA MISMA PIEZA. PURA.
 *
 * Devuelve las dimensiones y la cantidad donde DOS miembros del grupo declaran valores distintos.
 * Sólo se mira donde los dos declaran: que uno tenga el largo y el otro no, no es contradicción —
 * es justamente lo que la fusión sirve para completar.
 */
export function contradiccionesDe(lista = []) {
  const dims = {}
  for (const e of lista) {
    for (const [k, d] of Object.entries(e?.dimensiones ?? {})) {
      if (d?.valor === null || d?.valor === undefined) continue
      const v = dims[k] ?? []
      v.push({ id: e.id, valor: d.valor, vista: e?.evidencia?.vista ?? null })
      dims[k] = v
    }
  }
  const geometria = []
  for (const [k, vs] of Object.entries(dims).sort()) {
    const distintos = vs.filter((x) => !mismaMedida(x.valor, vs[0].valor))
    if (distintos.length) geometria.push({ dimension: k, valores: vs })
  }
  const cants = lista
    .map((e) => ({ id: e.id, valor: e?.repeticion?.cantidad?.valor ?? e?.repeticion?.cantidad ?? null }))
    .filter((x) => x.valor !== null && x.valor !== undefined)
  const cantidad = cants.some((x) => !mismaMedida(x.valor, cants[0].valor)) ? cants : null
  return { geometria, cantidad }
}

export function fusionarElementos(elementos = []) {
  const normal = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '')
  const cuantasDimensiones = (e) => Object.values(e?.dimensiones ?? {}).filter((d) => d?.valor !== null && d?.valor !== undefined).length

  // DOS ELEMENTOS SON EL MISMO SI COMPARTEN EL ID NORMALIZADO **O** EL NOMBRE NORMALIZADO, y eso
  // se propaga: `CORREAS` ≡ `correas-C140` por nombre, y `correas-C140` ≡ `CORR140` por id, así que
  // los tres son uno. Con una sola clave no se propaga, y cambiar de clave sin unir las dos
  // ROMPE la fusión que ya funcionaba: probado — pasar de id a nombre subió los detectados de 143
  // a 162 porque dejaron de juntarse los que compartían id.
  const padre = new Map()
  const raizDe = (k) => { let x = k; while (padre.get(x) !== x) x = padre.get(x); return x }
  const unir = (a, b) => { const ra = raizDe(a); const rb = raizDe(b); if (ra !== rb) padre.set(ra, rb) }
  const conId = []
  for (const e of elementos) {
    const id = String(e?.id ?? '').trim()
    if (!id) continue
    const ki = `id:${normal(id)}`
    const kn = normal(e?.nombre) ? `nombre:${normal(e.nombre)}` : ki
    for (const k of [ki, kn]) if (!padre.has(k)) padre.set(k, k)
    unir(ki, kn)
    conId.push({ e, ki, kn })
  }

  const grupos = new Map()
  for (const { e, ki } of conId) {
    const g = raizDe(ki)
    const lista = grupos.get(g) ?? []
    lista.push(e)
    grupos.set(g, lista)
  }

  const salida = []
  const ambiguos = []
  for (const [clave, lista] of [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    // ═══ PRIMERO SE PARTE POR LA FIRMA NUMÉRICA, Y ESTO NO ES OPCIONAL ═══
    // Dos columnas que el proyectista llamó C1 y C2 con el mismo nombre genérico NO son la misma
    // pieza, y fusionarlas borraba una entera —su sección, su altura, sus unidades y su partida—.
    // Salen las DOS. Es la misma regla que `parecidosSinFusionar` ya aplicaba para no reportar.
    // Las firmas se agrupan por lo que DISCRIMINA, no por igualdad: una firma vacía o contenida en
    // otra no separa nada, así que sus elementos quedan en la MISMA clase y se resuelven por la vía
    // de la contradicción —que puede terminar en «no sé»— en vez de por una afirmación de certeza.
    const firmas = [...new Set(lista.map(firmaNumerica))]
    const padreF = new Map(firmas.map((f) => [f, f]))
    const raizF = (f) => { let x = f; while (padreF.get(x) !== x) x = padreF.get(x); return x }
    for (const a of firmas) {
      for (const b of firmas) {
        if (a === b || firmasDiscriminan(a, b)) continue
        const ra = raizF(a)
        const rb = raizF(b)
        if (ra !== rb) padreF.set(ra, rb)
      }
    }
    const porFirma = new Map()
    for (const e of lista) {
      const f = raizF(firmaNumerica(e))
      porFirma.set(f, [...(porFirma.get(f) ?? []), e])
    }
    if (porFirma.size > 1) {
      ambiguos.push({
        clave, tipo: 'PIEZAS_DISTINTAS', nombre: lista[0]?.nombre ?? clave,
        ids: [...new Set(lista.map((e) => String(e.id)))].sort(),
        vistas: [...new Set(lista.map((e) => e?.evidencia?.vista).filter(Boolean))].sort(),
        firmas: firmas.map((f) => f || '(sin número)').sort(),
        porQue: `«${lista[0]?.nombre ?? clave}» agrupa identificadores con NUMERACIÓN que discrimina (${[...porFirma.keys()].map((f) => f || '(sin número)').join(' vs ')}): ningún conjunto de números contiene al otro, así que son designaciones distintas del proyectista. NO se fusionan y salen todos`,
        quienLoResuelve: 'nadie — se computan por separado, que es lo correcto',
        fusionadas: false,
      })
    }

    for (const [firma, sub] of [...porFirma.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))) {
      const ordenados = [...sub].sort((a, b) => cuantasDimensiones(b) - cuantasDimensiones(a) || String(a.id).localeCompare(String(b.id)))
      const ganador = ordenados[0]
      const ids = [...new Set(sub.map((e) => String(e.id)))].sort()
      const vistas = [...new Set(sub.map((e) => e?.evidencia?.vista).filter(Boolean))].sort()
      const choque = contradiccionesDe(sub)

      const dimensiones = {}
      for (const e of [...ordenados].reverse()) {
        for (const [k, v] of Object.entries(e?.dimensiones ?? {})) if (v?.valor !== null && v?.valor !== undefined) dimensiones[k] = v
      }
      // ═══ LO QUE SE CONTRADICE NO SE ELIGE: SE ABRE ═══
      // `proyecto.mjs` lo dice para los hechos documentales —«elegir una en silencio es inventar el
      // resultado de una discusión que todavía no ocurrió»— y vale igual, o más, para las
      // dimensiones y la cantidad, que es donde está el precio. Una dimensión en la que dos
      // lecturas discrepan sale como HUECO con las dos versiones adentro; el elemento deja de
      // computar y aparece en las preguntas, en vez de computar con la mitad de la verdad.
      for (const g of choque.geometria) {
        dimensiones[g.dimension] = faltaDato({
          que: `${g.dimension} de ${ganador?.nombre ?? ids[0]}`,
          porque: `dos lecturas de la misma pieza dan valores distintos: ${g.valores.map((v) => `${v.id}=${v.valor}${v.vista ? ` (${v.vista})` : ''}`).join(' vs ')}`,
          quienLoTiene: 'dirección técnica — hay que mirar las dos vistas',
        })
      }
      const repeticion = choque.cantidad
        ? {
          ...(ganador?.repeticion ?? {}),
          modo: 'indeterminable',
          cantidad: null,
          textoLiteral: `dos lecturas dan cantidades distintas: ${choque.cantidad.map((c) => `${c.id}=${c.valor}`).join(' vs ')}`,
        }
        : ganador?.repeticion

      salida.push({ ...ganador, dimensiones, repeticion, vistoEn: vistas })

      if (ids.length > 1) {
        // Si la clase juntó firmas DISTINTAS —una vacía, o una contenida en la otra— el sistema no
        // sabe si eran una pieza o dos, y decirlo es la respuesta correcta. `SOLO_NOMBRE` afirmaría
        // que están resueltas, que es la certeza que no tenemos.
        const firmasDelSub = [...new Set(sub.map(firmaNumerica))]
        const tipo = choque.geometria.length ? 'GEOMETRIA_INCOMPATIBLE'
          : choque.cantidad ? 'CANTIDAD_DISTINTA'
            : firmasDelSub.length > 1 ? 'NUMERACION_INDECIDIBLE'
              : 'SOLO_NOMBRE'
        const detalle = choque.geometria.length
          ? `las lecturas se CONTRADICEN en ${choque.geometria.map((g) => `${g.dimension} (${g.valores.map((v) => v.valor).join(' vs ')})`).join(', ')}: esa(s) medida(s) salen como hueco y el elemento no computa hasta que alguien mire`
          : choque.cantidad
            ? `las lecturas se CONTRADICEN en la cantidad (${choque.cantidad.map((c) => c.valor).join(' vs ')}): la cantidad sale como hueco`
            : firmasDelSub.length > 1
              ? `sus numeraciones (${firmasDelSub.map((f) => f || '(sin número)').join(' vs ')}) NO discriminan —una está vacía o contenida en la otra, y eso es un sufijo de serie, no una designación del proyectista—, así que NO SE SABE si son una pieza o dos. Se computó UNA y las lecturas no se contradicen en ninguna medida`
              : 'las lecturas no se contradicen en ninguna medida: es el mismo objeto escrito de varias formas, y se computó una sola vez'
        ambiguos.push({
          clave: `${clave}#${firma}`, tipo, nombre: ganador?.nombre ?? ids[0], ids, vistas,
          porQue: `«${ganador?.nombre ?? ids[0]}» aparece con ${ids.length} identificadores (${ids.join(', ')}). ${detalle}`,
          quienLoResuelve: tipo === 'SOLO_NOMBRE'
            ? 'nadie — está resuelto'
            : tipo === 'NUMERACION_INDECIDIBLE'
              ? 'dirección técnica — sólo para confirmar que es una pieza y no dos; el cómputo no cambia si lo es'
              : 'dirección técnica — mirando las vistas donde aparece',
          fusionadas: true,
        })
      }
    }
  }
  const lista = salida.sort((a, b) => String(a.id).localeCompare(String(b.id)))
  // Se devuelve un OBJETO y no un array con una propiedad colgada: un `.map()` o un `.filter()`
  // entre medio borraba `ambiguos` en silencio y la cotización volvía a poder salir COMPLETA.
  return { elementos: lista, ambiguos: [...ambiguos, ...parecidosSinFusionar(lista)].sort((a, b) => a.clave.localeCompare(b.clave)) }
}

/** Palabras que no distinguen nada al comparar dos nombres de elemento. */
const RUIDO_NOMBRE = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'con', 'para', 'por', 'metalico', 'metalica'])

/**
 * LOS QUE SE PARECEN DEMASIADO Y NO SE FUSIONAN. PURA.
 *
 * ═══ POR QUÉ NO ALCANZA NORMALIZAR ═══
 *
 * Normalizar caza `PUERTA_BLINDEX` con `PUERTA-BLINDEX`, que difieren en un signo. NO caza
 * «Tanque de reserva 600 litros» con «Tanque de agua 600 litros» con «2 tanques de 600 litros»:
 * son paráfrasis del mismo objeto y quedaron como CUATRO elementos con cantidad, cada uno contando
 * uno. El doble cómputo se fue de los cinco grupos medidos y quedó en éste.
 *
 * Y acá NO se fusiona, a propósito. Dos nombres parecidos pueden ser dos piezas distintas —«Viga
 * VA1» y «Viga VA2» comparten todo salvo un dígito— y fusionarlas borraría una partida entera. Lo
 * que corresponde es DECLARAR la duda: mismo tipo de pieza, misma unidad, y dos palabras
 * significativas en común es suficiente para que una persona mire; no es suficiente para que el
 * código decida.
 */
export function parecidosSinFusionar(elementos = []) {
  const sig = (t) => [...new Set(String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w.length > 2 && !RUIDO_NOMBRE.has(w)))]
  const conCantidad = elementos.filter((e) => e?.nombre)
  const salida = []
  for (let i = 0; i < conCantidad.length; i++) {
    for (let j = i + 1; j < conCantidad.length; j++) {
      const a = conCantidad[i]
      const b = conCantidad[j]
      if ((a.forma ?? null) !== (b.forma ?? null)) continue
      const pa = piezaDe(a.nombre)?.valor ?? null
      const pb = piezaDe(b.nombre)?.valor ?? null
      if (!pa || pa !== pb) continue
      const wa = sig(a.nombre)
      const wb = sig(b.nombre)
      const comunes = wa.filter((w) => wb.includes(w))
      if (comunes.length < 2) continue
      // Si además difieren en algún NÚMERO propio (VA1 vs VA2, C1 vs C2), son piezas distintas y
      // no hay nada que dudar: el proyectista las separó a propósito.
      const nums = (t) => (String(t).match(/\d+/g) ?? []).join('-')
      if (nums(a.nombre) !== nums(b.nombre)) continue
      // El PARECIDO se reporta como número para que quien mire empiece por los que casi seguro son
      // el mismo objeto. Este balde tiene falsos positivos a propósito: «Base de hormigón escalera»
      // y «Muerto de hormigón escalera» comparten dos palabras y son piezas distintas. Preferimos
      // que sobre una pregunta a que falte una partida contada dos veces.
      const parecido = Math.round((comunes.length / Math.min(wa.length, wb.length)) * 100) / 100
      salida.push({
        clave: `parecidos:${[a.id, b.id].sort().join('~')}`,
        parecido,
        nombre: a.nombre, ids: [a.id, b.id].sort(),
        vistas: [...new Set([a.evidencia?.vista, b.evidencia?.vista].filter(Boolean))].sort(),
        porQue: `«${a.nombre}» (${a.id}) y «${b.nombre}» (${b.id}) son la misma pieza (${pa}), en la misma unidad, y comparten ${comunes.join(', ')}: pueden ser el mismo objeto nombrado distinto en dos vistas. NO se fusionaron —fusionar dos piezas parecidas borra una partida— y las dos se computaron`,
        quienLoResuelve: 'dirección técnica — si son el mismo objeto, hay que borrar uno',
        fusionadas: false,
      })
    }
  }
  return salida.sort((x, y) => (y.parecido ?? 0) - (x.parecido ?? 0) || x.clave.localeCompare(y.clave))
}

/** Las regiones que vale la pena mirar. La carátula no tiene elementos que computar y el croquis de
 *  ubicación tampoco: gastar una llamada de visión en ellas es gastar por gastar. PURA. */
export const REGIONES_QUE_SE_MIRAN = Object.freeze(['planta', 'corte', 'vista', 'detalle', 'cuadro', 'indeterminado'])

export async function correr({ query, google, termino, pedir = pedirTexto, refrescar = false, conVeto = false, tipoObra = null, porRegiones = true, limiteRegiones = 12, logger = null, permitirModelo = true, adjuntos = [] } = {}) {
  const t0 = Date.now()
  // ═══ CLAUDE = 0 ═══
  // El proveedor de razonamiento puede no estar: sin saldo, sin API key, caído, o apagado a mano
  // con `permitirModelo: false`. Eso NO puede tirar la corrida: lo que está cacheado se sirve igual,
  // lo determinístico corre igual, y lo que necesitaba mirar una lámina queda DECLARADO como no
  // leído con su motivo. Una cotización que sale igual de completa sin el modelo estaría mintiendo;
  // una que se cae no sirve para nada. La tercera opción —degradar y decirlo— es la única honesta.
  const { pedirSeguro, degradacion } = pedirConDegradacion(pedir, { permitirModelo })
  // ═══ LAS MÉTRICAS SE TOMAN ADENTRO, NO SE DEDUCEN AL FINAL ═══
  // Un resumen calculado sobre el resultado puede quedar coherente y ser falso: mide lo que quedó,
  // no lo que pasó. Cada decisión se anota EN EL MOMENTO en que se resuelve, con la vía que la
  // resolvió — que es la única forma de que «lo resolvió el caché» no se pueda confundir con
  // «lo resolvió el modelo y el resultado dio igual».
  const met = nuevoMedidor()
  const filas = await documentosDelProyecto({ query }, termino)
  filas.push(...documentosEnMemoria(adjuntos))
  const raiz = carpetaRaiz(filas)
  const { insumos, reservados } = partirDocumentos(filas, { carpetaObra: raiz })
  const planos = planosDe(insumos)
  // ═══ LOS DOCUMENTOS NO SE ANALIZAN COMO ISLAS ═══
  // El grafo se arma ANTES de leer nada porque no necesita leer nada: sale del nombre y de la ruta.
  // Es lo que después le permite a `armarProyecto` no confundir dos obras del mismo cliente con una
  // contradicción, y no tratar a una revisión superada como una fuente viva.
  const relaciones = relacionar(insumos.map((d) => ({ ...d, clase: claseDocumental(d.name).id })), { carpetaObra: raiz })

  const laminas = []
  const usos = []
  // Una respuesta DEGRADADA no es una llamada al modelo: es una llamada que no se hizo. Contarla
  // como llamada publicaba «20 llamadas · USD 0,0000» en una corrida donde el modelo estaba
  // apagado — un número que se lee como «llamó y no cobró» cuando la verdad es «no llamó».
  const anotar = (u) => { if (u && !u.degradado) usos.push({ modelo: u.modelo, tokensIn: u.tokens?.in ?? null, tokensOut: u.tokens?.out ?? null, usd: u.usd, ms: u.ms }) }
  for (const doc of planos.legibles) {
    const bytes = doc._bytes ?? await google.descargarBytes(doc.drive_file_id)
    const lam = await interpretarLamina(doc, bytes, { pedir: pedirSeguro, refrescar, logger })
    anotar(lam.uso)
    met.decidio({ que: `lámina ${doc.name}`, via: lam.deCache ? VIA.CACHE : (lam.error ? VIA.HUECO : VIA.MODELO) })
    if (lam.uso && !lam.uso.degradado) met.llamo({ proveedor: 'ia', modelo: lam.uso.modelo, tokensIn: lam.uso.tokens?.in ?? null, tokensOut: lam.uso.tokens?.out ?? null, usd: lam.uso.usd, ms: lam.uso.ms, funcion: 'interpretar-plano' })
    // LA SEGUNDA PASADA VA SOBRE LA MISMA LÁMINA Y SÓLO SI QUEDÓ ALGO SIN MEDIR. Su resultado se
    // cachea junto al inventario: dos pasadas se pagan una vez por contenido, no una por corrida.
    const llave = `${llaveDeCache(bytes)}:medicion`
    const guardado = refrescar ? null : leerCache(llave)
    if (guardado) {
      laminas.push({ ...lam, elementos: guardado.elementos, medicion: { ...guardado.medicion, deCache: true } })
      continue
    }
    const m = await medir({ pedir: pedirSeguro, bloque: bloqueAdjunto({ data: bytes.toString('base64'), mediaType: doc.mime_type || 'application/pdf' }), elementos: lam.elementos, logger })
    anotar(m.uso)
    if (m.uso && !m.uso.degradado) met.llamo({ proveedor: 'ia', modelo: m.uso.modelo, tokensIn: m.uso.tokens?.in ?? null, tokensOut: m.uso.tokens?.out ?? null, usd: m.uso.usd, ms: m.uso.ms, funcion: 'medir' })
    const medicion = { pendientes: m.pendientes, resueltos: m.resueltos, cambios: m.cambios, deCache: false }
    if (m.uso) guardarCache(llave, { elementos: m.elementos, medicion })
    laminas.push({ ...lam, elementos: m.elementos, medicion })
  }

  // ═══ LA CARPETA ENTERA, ABIERTA COMO UN SOLO PROYECTO ═══
  // El CAD deja de ser «un archivo que no puedo abrir» y pasa a ser la mejor fuente geométrica; el
  // pliego y la memoria dejan de ser documentos sueltos y pasan a COMPLETAR lo que el plano no dice.
  const escribirTemporal = escritorTemporal()
  const documental = await ingerir({ google, insumos, planosLegibles: planos.legibles, escribirTemporal, limite: limiteRegiones, logger })

  // ═══ UNA MIRADA POR VISTA, NO UNA POR LÁMINA ═══
  const porRegion = []
  if (porRegiones) {
    for (const seg of documental.segmentaciones) {
      for (const lam of seg.laminas) {
        for (const rec of lam.recortes) {
          if (!rec.ok || !REGIONES_QUE_SE_MIRAN.includes(rec.region?.tipo)) continue
          const r = await interpretarRegion(rec, { pedir: pedirSeguro, refrescar, archivo: seg.archivo, logger })
          anotar(r.uso)
          met.decidio({ que: `vista ${rec.region?.titulo ?? rec.region?.n}`, via: r.deCache ? VIA.CACHE : (r.error ? VIA.HUECO : VIA.MODELO) })
          if (r.uso && !r.uso.degradado) met.llamo({ proveedor: 'ia', modelo: r.uso.modelo, tokensIn: r.uso.tokens?.in ?? null, tokensOut: r.uso.tokens?.out ?? null, usd: r.uso.usd, ms: r.uso.ms, funcion: 'interpretar-region' })
          porRegion.push({ archivo: seg.archivo, ...r })
        }
      }
    }
  }

  // Los elementos de las vistas recortadas se SUMAN a los de la lámina completa y se deduplican por
  // id: una columna vista en la planta y en el corte es UNA columna, no dos. Gana la lectura con
  // más dimensiones resueltas, que es la que vio el dibujo más grande.
  // ═══ DE DÓNDE SALIÓ CADA LECTURA, ANTES DE FUSIONARLAS ═══
  //
  // Una cantidad que existe porque el modelo miró la lámina NO es aritmética, y contarla como
  // `REGLA` la sacaba del denominador del Claude Avoidance Rate — el indicador quedaba sesgado
  // hacia arriba por construcción. Acá se guarda, POR ELEMENTO, si la lectura que lo trajo salió
  // del caché o de una mirada nueva. Si un id llegó por las dos vías, gana «mirada nueva»: lo que
  // se mide es si esta corrida pudo evitar el modelo, y si lo llamó, no lo evitó.
  const vinoDeCache = new Map()
  for (const l of laminas) for (const e of l.elementos ?? []) if (!vinoDeCache.has(e.id) || vinoDeCache.get(e.id)) vinoDeCache.set(e.id, Boolean(l.deCache))
  for (const r of porRegion) for (const e of r.elementos ?? []) if (!vinoDeCache.has(e.id) || vinoDeCache.get(e.id)) vinoDeCache.set(e.id, Boolean(r.deCache))

  const { elementos: fusionados, ambiguos: identidadesAmbiguas } = fusionarElementos([...laminas.flatMap((l) => l.elementos), ...porRegion.flatMap((r) => r.elementos)])
  // EL CAD LLENA LO QUE LA VISTA NO PUDO CONTAR, y sólo eso: un elemento que ya tenía cantidad no
  // se toca. Contar INSERT es exacto y no cuesta un token.
  const medidoConCad = resolverConCad(fusionados, documental.cad)
  const computo = computarElementos(medidoConCad.elementos)
  // Una cantidad la resolvió el CAD (conteo exacto de bloques), la resolvió la cita del plano, o no
  // la resolvió nadie. Las tres son decisiones y las tres se cuentan.
  //
  // OJO CON EL «TIENE»: estar en `computo.items` NO es tener cantidad. Todos los elementos entran a
  // la lista; los que quedaron sin medir entran con `cantidad` en null. Preguntar por la presencia
  // en la lista daba 111 cantidades resueltas donde hay 28 — un contador incapaz de decir «no».
  const idsPorCad = new Set((medidoConCad.resueltos ?? []).map((x) => x?.id ?? x))
  const conCantidad = new Set(computo.items.filter((i) => tieneNumero(i?.cantidad?.valor)).map((i) => i.id))
  for (const e of medidoConCad.elementos ?? []) {
    // El CAD es la única vía que nunca pasó por un modelo: cuenta INSERTs. Lo demás salió de una
    // lectura del plano, y esa lectura la hizo el modelo — hoy o la vez que llenó el caché.
    met.decidio({ que: `cantidad ${e.id}`, via: viaDeCantidad({ tieneCantidad: conCantidad.has(e.id), porCad: idsPorCad.has(e.id), deCache: vinoDeCache.get(e.id) }) })
  }
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
    const revision = await elegir({ pedir: pedirSeguro, mapeos: bruto.mapeos, logger })
    anotar(revision.uso)
    if (revision.uso && !revision.uso.degradado) met.llamo({ proveedor: 'ia', modelo: revision.uso.modelo, tokensIn: revision.uso.tokens?.in ?? null, tokensOut: revision.uso.tokens?.out ?? null, usd: revision.uso.usd, ms: revision.uso.ms, funcion: 'elegir-partida' })
    correcciones = revision.cambios ?? []
    for (const m of revision.mapeos) {
      const primera = m.candidatos?.[0]?.codigo
      if (!primera) continue
      if (m.estado !== 'MAPEADA') vetos[m.elemento] = [primera]
      else if (m.tarea?.codigo && m.tarea.codigo !== primera) desacuerdos.push({ elemento: m.elemento, codigo: primera, propuso: m.tarea.codigo, porQue: m.porQue })
    }
  }
  const seleccion = seleccionarTodas(computo.items, catalogo, { vetos })
  // Con `conVeto`, el modelo veta candidatas y esos vetos cambian la partida elegida. Anotar esas
  // como BASE_MAESTRA contaba una decisión del modelo como resuelta sin modelo.
  const vetadosPorModelo = new Set(Object.keys(vetos))
  for (const m of seleccion.mapeos ?? []) {
    const id = m.computo?.id ?? m.elemento ?? '?'
    met.decidio({ que: `partida ${id}`, via: viaDePartida({ mapeada: m.estado === 'MAPEADA', vetadaPorModelo: vetadosPorModelo.has(id) }) })
  }
  const mapeo = { ...seleccion, correcciones, desacuerdos }
  const procesos = procesosDeTodos(computo.items)

  // ═══ EL CONTROL VA ANTES QUE EL TOTAL ═══
  // El CIRCOT y el checklist del Modelo III entran como CONTROL ADVERSARIAL: proponen lo que
  // falta, no lo agregan. Y el checklist sólo se aplica si la documentación DICE que es un galpón:
  // aplicarlo por las dudas convierte una verificación en ruido.
  const referenciaCircot = cargarReferenciaCircot()
  const tipo = tipoObraDe(laminas, tipoObra, filas.filter((f) => !f.is_folder).map((f) => f.name))
  const checklist = tipo.esGalpon ? evaluarChecklist({ computadas: computo.items.map((i) => ({ nombre: i.nombre, unidad: i.unidad })) }) : []
  const partidasParaControl = mapeo.mapeos.filter((m) => m.tarea).map((m) => ({ nombre: m.tarea.nombre, unidad: m.tarea.unidad }))
  const omisionesCircot = referenciaCircot ? omisionesPotenciales(partidasParaControl, referenciaCircot) : []
  const proyecto = armarProyecto({
    documentos: filas.filter((f) => !f.is_folder),
    hechos: documental.hechos,
    laminas,
    cad: documental.cad,
    relaciones,
  })
  const control = controlar({ computo, mapeo, procesos, checklist, omisionesCircot, conflictos: proyecto.conflictos, identidadesAmbiguas })
  const ids = [...new Set(mapeo.mapeos.filter((m) => m.tarea).map((m) => m.tarea.id))]
  const comps = await composiciones({ query }, ids)

  return {
    termino, carpeta: raiz, ms: Date.now() - t0,
    documentos: { total: filas.filter((f) => !f.is_folder).length, insumos, reservados, planos },
    relaciones,
    laminas, computo, catalogo: catalogo.length, mapeo, composiciones: comps, procesos,
    control, checklist, tipoObra: tipo,
    documental: { ...documental, segmentaciones: documental.segmentaciones },
    identidadesAmbiguas,
    medicionCad: { resueltos: medidoConCad.resueltos, ambiguos: medidoConCad.ambiguos, bloquesDisponibles: medidoConCad.bloquesDisponibles, cotas: medidoConCad.cotas, porQueLasCotasNoSeUsan: medidoConCad.porQueLasCotasNoSeUsan },
    proyecto,
    porRegion: porRegion.map((r) => ({ archivo: r.archivo, region: r.region?.titulo ?? null, tipo: r.region?.tipo ?? null, elementos: r.elementos.length, deCache: r.deCache, error: r.error ?? null })),
    referenciaCircot: referenciaCircot ? { periodo: referenciaCircot.periodo, items: referenciaCircot.total } : null,
    // La huella es lo que se compara entre dos corridas para decir si dieron lo mismo. Va en el
    // resultado y no en un script aparte porque una reproducibilidad que hay que reconstruir a mano
    // no se verifica nunca.
    huella: huella(seleccion),
    /** La obra que esta cotización puede crear, con el origen de cada cantidad. Se calcula a pedido
     *  porque recorre todos los elementos y casi ningún consumidor la necesita. */
    obraDesdeCotizacion() { return obraDesdeCotizacion({ termino, computo, mapeo, procesos, composiciones: comps }) },
    ia: { llamadas: usos.length, usos, deCache: laminas.filter((l) => l.deCache).length },
    // El Claude Avoidance Rate y sus hermanos, medidos y no estimados. `null` cuando no hubo
    // ninguna decisión comparable: una corrida vacía no es 100% de autonomía.
    metricas: met.resumen(),
    // ═══ EL CONTRATO DE DEGRADACIÓN ═══
    // `hubo: false` significa que NADA se resolvió con el modelo apagado o roto. `hubo: true` dice
    // qué falló, cuántas veces y en qué función, y qué láminas quedaron sin leer por eso. Una
    // corrida degradada que devuelve un resultado de aspecto normal es la que este repo no acepta.
    degradacion: {
      ...degradacion,
      laminasNoLeidas: laminas.filter((l) => l.error).map((l) => ({ archivo: l.archivo ?? null, porQue: l.error })),
      regionesNoLeidas: porRegion.filter((r) => r.error).length,
      // Con el modelo apagado, lo que igual salió: caché, CAD, Base Maestra, cómputo y control.
      loQueSalioIgual: {
        laminasDeCache: laminas.filter((l) => l.deCache).length,
        cadMedido: documental.cad.length,
        catalogo: catalogo.length,
        // `computo.items.length` son TODOS los elementos, medidos o no — el mismo «ojo con el
        // tiene» que se corrigió veinte líneas más arriba, repetido acá. Publicaba 111 donde hay 28.
        elementosComputados: computo.computados ?? computo.items.filter((i) => tieneNumero(i?.cantidad?.valor)).length,
        partidasMapeadas: mapeo.mapeadas,
      },
    },
    fuentePrecios: FUENTE.BASE_MAESTRA,
  }
}
