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
import { pedirTexto } from '../ia/cliente.mjs'
import { partirDocumentos, planosDe } from './documentos.mjs'
import { llaveDeCache } from './interpretar.mjs'
import { computarElementos } from './computo.mjs'
import { mapearPartidas } from './partidas.mjs'
import { seleccionarTodas, huella } from './seleccion.mjs'
import { procesosDeTodos } from './procesos.mjs'
import { controlar } from './control.mjs'
import { claseDocumental, ingerir } from './documental.mjs'
import { leerPdf, renglones } from '../ingesta/pdf.mjs'
import { armarProyecto } from './proyecto.mjs'
import { relacionar } from './relacion.mjs'
import { resolverConCad } from './medicion-cad.mjs'
import { piezaDe } from './atributos.mjs'
import { obraDesdeCotizacion } from './genealogia.mjs'
import { omisionesPotenciales } from '../circot/referencia.mjs'
import { evaluarChecklist } from '../circot/modelo-galpon.mjs'
import { VIA, medidor as nuevoMedidor } from '../conocimiento/metricas.mjs'
import { elegir } from './elector.mjs'
import { FUENTE, faltaDato, tieneNumero } from './fuente.mjs'
import { cacheDeLecturas } from './cache-lecturas.mjs'
import { CONCURRENCIA_POR_DEFECTO } from './paralelo.mjs'
import { leerLaminas, leerVistas } from './lectura.mjs'

// Lo que mira un dibujo vive en `lectura.mjs` desde que este archivo pasó las 900 líneas. Se
// re-exporta porque `DIR_CACHE`, `interpretarLamina`, `interpretarRegion` y `REGIONES_QUE_SE_MIRAN`
// eran parte de la superficie pública de este módulo y mover un símbolo no es motivo para romper a
// quien lo importa.
export { DIR_CACHE } from './cache-lecturas.mjs'
export { interpretarLamina, interpretarRegion, REGIONES_QUE_SE_MIRAN } from './lectura.mjs'

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
/** Cuánto texto se guarda para CLASIFICAR. `esPlanoAdjunto` mira los primeros 20k: más que eso
 *  es cargar memoria sin cambiar una sola decisión. */
export const TOPE_TEXTO_CLASIFICACION = 20_000

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
        // El TEXTO de la lectura que ya hizo quien recibió el archivo. Viaja con el documento
        // porque es lo que permite clasificar «E3 Techo P.Alta.pdf» —un plano cuyo NOMBRE no
        // dice que lo sea— sin volver a extraerlo. Una lectura, una fuente.
        _texto: typeof a?.texto === 'string' && a.texto ? a.texto.slice(0, TOPE_TEXTO_CLASIFICACION) : null,
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
 *
 * ═══ EL TOPE DE GASTO ES OTRA FORMA DE LA MISMA DEGRADACIÓN ═══
 *
 * `topeUsd` acumula el `usd` de cada respuesta y, cuando el acumulado lo supera, las llamadas que
 * faltan NO se hacen: se resuelven degradadas, igual que si el proveedor estuviera caído. No se
 * tira una excepción a propósito — una corrida que se cae por el tope pierde TODO lo que ya se
 * pagó, que es exactamente lo contrario de ahorrar. El motivo queda distinguible del apagado
 * (`tope de gasto alcanzado` contra `modelo apagado`) para que quien lea el resultado sepa si le
 * falta saldo o le falta presupuesto.
 *
 * Con concurrencia, varias llamadas ya en vuelo pueden cruzar el tope juntas: el tope frena las que
 * FALTAN, no las que ya se pagaron. Cortarlas a mitad sería pagarlas y tirarlas.
 */
export function pedirConDegradacion(pedir, { permitirModelo = true, topeUsd = null } = {}) {
  // `Number(null)` es 0 y `Number.isFinite(0)` es true: preguntar sólo por `isFinite` convertía el
  // DEFAULT —sin tope— en un tope de USD 0, y toda corrida sin `topeUsd` salía degradada entera.
  // Es la misma trampa que ya documenta `tieneNumero` veinte líneas más arriba, y la encontraron
  // los tests de degradación que ya existían.
  const tope = tieneNumero(topeUsd) && Number(topeUsd) >= 0 ? Number(topeUsd) : null
  const degradacion = { hubo: false, permitirModelo, intentos: 0, fallos: 0, motivos: [], topeUsd: tope, usd: 0 }
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
    if (tope !== null && degradacion.usd >= tope) {
      anotar(`el tope de gasto de la corrida está alcanzado: USD ${degradacion.usd.toFixed(4)} de USD ${tope.toFixed(4)}`, args?.funcion)
      return { texto: null, degradado: 'tope de gasto alcanzado' }
    }
    degradacion.intentos += 1
    try {
      const r = await pedir(args)
      degradacion.usd += Number.isFinite(Number(r?.usd)) ? Number(r.usd) : 0
      return r
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

/**
 * DE DÓNDE SALEN LOS DOCUMENTOS DE UNA CORRIDA — Y CUÁNDO DRIVE NO ENTRA.
 *
 * ═══ MODO SÓLO-ADJUNTOS (dueño, 02/09/2026: «google download 404») ═══
 *
 * Cuando el pedido trae PLANOS ADJUNTOS, esos planos SON la documentación de la corrida: el
 * `termino` deja de ser un término de búsqueda y pasa a ser el RÓTULO de la obra. Salir igual al
 * índice de Drive traía archivos que nadie mandó, los bajaba de a uno y bastaba un 404 para
 * degradar —o tumbar— una cotización que tenía el plano en la mano. Peor: el rótulo inferido del
 * nombre del archivo («San Francisco del Monte») como patrón `%...%` puede traer la carpeta de
 * OTRA obra del mismo cliente y mezclar dos proyectos en un solo cómputo.
 *
 * Sumar Drive a una corrida con adjuntos vuelve a ser posible, pero SÓLO pedido explícitamente
 * (`conDrive: true`). Sin adjuntos, la conducta es la de siempre: se busca por término.
 *
 * @returns {Promise<{filas:Array, conIndice:boolean}>} `conIndice` declara si se consultó Drive.
 */
/**
 * EL TEXTO QUE FALTA SE EXTRAE ACÁ, GRATIS Y SIN RED.
 *
 * Quien manda el adjunto puede traer el texto ya leído (el gateway lo tiene) o no traerlo (un
 * script, otra cara). Sin texto, la clasificación queda atada al nombre, y hay planos reales cuyo
 * nombre no declara nada: «GOP-153479.pdf», «E3 Techo P.Alta.pdf». El lector local de PDF es el
 * mismo que usa `documental.mjs`, no cuesta una llamada paga y no sale a Drive.
 *
 * Un PDF ESCANEADO sigue sin texto y sin señal en el nombre: ése queda declarado como no-plano y
 * hay que nombrar la obra a mano — es el límite conocido, no un silencio.
 */
export async function conTextoParaClasificar(filas = []) {
  for (const f of filas) {
    if (f._texto || !f._bytes) continue
    // La firma se mira antes de llamar al lector: pasarle un .txt a un parser de PDF funciona
    // —falla y se captura— pero imprime warnings y cuesta cien veces más que comparar 5 bytes.
    if (f._bytes.subarray(0, 5).toString('latin1') === '%PDF-') {
      try {
        const d = await leerPdf(f._bytes, { conGeometria: false })
        const texto = d.leidas.map((pg) => renglones(pg.textos).map((r) => r.texto).join('\n')).join('\n')
        f._texto = texto.slice(0, TOPE_TEXTO_CLASIFICACION)
      } catch { f._texto = null /* PDF que no abre: el nombre decide solo, y se sabe */ }
      continue
    }
    const crudo = f._bytes.toString('utf8')
    f._texto = crudo.slice(0, 1000).includes('\u0000') ? null : crudo.slice(0, TOPE_TEXTO_CLASIFICACION)
  }
  return filas
}

export async function fuentesDe({ query }, { termino, adjuntos = [], conDrive = null } = {}) {
  const enMemoria = await conTextoParaClasificar(documentosEnMemoria(adjuntos))
  const conIndice = conDrive === true || (conDrive !== false && enMemoria.length === 0)
  const filas = conIndice ? await documentosDelProyecto({ query }, termino) : []
  filas.push(...enMemoria)
  return { filas, conIndice }
}

/**
 * @param {object} o
 * @param {((p:{fase:string,hecho:number,total:number,que:string|null})=>Promise<void>)|null} [o.onProgreso]
 *   se llama al TERMINAR cada lámina y cada vista, con el conteo real. Es informativo: su orden lo
 *   decide la latencia, no el resultado.
 * @param {(()=>Promise<boolean>)|null} [o.cancelado]
 *   se consulta ENTRE unidades. Si da `true`, `correr()` devuelve normalmente lo que alcanzó a
 *   hacer con `cancelada: true` — no tira. Nunca se corta una llamada de visión ya empezada: ésa
 *   ya se pagó, y tirarla es pagarla dos veces.
 * @param {number} [o.concurrencia] llamadas de visión simultáneas.
 * @param {number|null} [o.topeUsd] al superarlo la corrida se DEGRADA, no se cae.
 */
export async function correr({ query, google, termino, pedir = pedirTexto, refrescar = false, conVeto = false, tipoObra = null, porRegiones = true, limiteRegiones = 12, logger = null, permitirModelo = true, adjuntos = [], conDrive = null, onProgreso = null, cancelado = null, concurrencia = CONCURRENCIA_POR_DEFECTO, topeUsd = null } = {}) {
  const t0 = Date.now()
  // ═══ CLAUDE = 0 ═══
  // El proveedor de razonamiento puede no estar: sin saldo, sin API key, caído, o apagado a mano
  // con `permitirModelo: false`. Eso NO puede tirar la corrida: lo que está cacheado se sirve igual,
  // lo determinístico corre igual, y lo que necesitaba mirar una lámina queda DECLARADO como no
  // leído con su motivo. Una cotización que sale igual de completa sin el modelo estaría mintiendo;
  // una que se cae no sirve para nada. La tercera opción —degradar y decirlo— es la única honesta.
  const { pedirSeguro, degradacion } = pedirConDegradacion(pedir, { permitirModelo, topeUsd })
  // El caché de lecturas vive en Postgres y cae al disco cuando la base no está. Se arma UNA vez
  // por corrida y viaja: si cada llamada armara el suyo, la promoción disco→base se repetiría.
  const cache = cacheDeLecturas({ query, logger })
  // ═══ LAS MÉTRICAS SE TOMAN ADENTRO, NO SE DEDUCEN AL FINAL ═══
  // Un resumen calculado sobre el resultado puede quedar coherente y ser falso: mide lo que quedó,
  // no lo que pasó. Cada decisión se anota EN EL MOMENTO en que se resuelve, con la vía que la
  // resolvió — que es la única forma de que «lo resolvió el caché» no se pueda confundir con
  // «lo resolvió el modelo y el resultado dio igual».
  const met = nuevoMedidor()
  const { filas, conIndice } = await fuentesDe({ query }, { termino, adjuntos, conDrive })
  const raiz = carpetaRaiz(filas)
  const { insumos, reservados } = partirDocumentos(filas, { carpetaObra: raiz })
  const planos = planosDe(insumos)
  // ═══ LOS DOCUMENTOS NO SE ANALIZAN COMO ISLAS ═══
  // El grafo se arma ANTES de leer nada porque no necesita leer nada: sale del nombre y de la ruta.
  // Es lo que después le permite a `armarProyecto` no confundir dos obras del mismo cliente con una
  // contradicción, y no tratar a una revisión superada como una fuente viva.
  const relaciones = relacionar(insumos.map((d) => ({ ...d, clase: claseDocumental(d.name).id })), { carpetaObra: raiz })

  const usos = []
  // Una respuesta DEGRADADA no es una llamada al modelo: es una llamada que no se hizo. Contarla
  // como llamada publicaba «20 llamadas · USD 0,0000» en una corrida donde el modelo estaba
  // apagado — un número que se lee como «llamó y no cobró» cuando la verdad es «no llamó».
  const anotar = (u) => { if (u && !u.degradado) usos.push({ modelo: u.modelo, tokensIn: u.tokens?.in ?? null, tokensOut: u.tokens?.out ?? null, usd: u.usd, ms: u.ms }) }
  // ═══ LAS LÁMINAS SON INDEPENDIENTES Y SE LEEN A LA VEZ ═══
  // Nada de lo que dice la lámina 3 cambia lo que se le pregunta a la 4. Lo que NO cambia es el
  // orden: `laminas` y `usos` salen en el orden de `planos.legibles`, no en el de llegada, porque
  // `huella()` compara dos corridas y una lista que se reordena sola convierte esa comparación en
  // ruido. El detalle está en `lectura.mjs`.
  const lectura = await leerLaminas({
    docs: planos.legibles, google, pedir: pedirSeguro, refrescar, logger, cache, met, anotar,
    concurrencia, cancelado, onProgreso,
  })
  const laminas = lectura.laminas
  const noDescargables = lectura.noDescargables
  let cancelada = lectura.cancelada
  if (noDescargables.length) {
    // Del lado de la respuesta son NO LEGIBLES con motivo — y la ingesta documental no los reintenta.
    planos.legibles = planos.legibles.filter((d) => !noDescargables.includes(d))
    planos.noLegibles = [...planos.noLegibles, ...noDescargables]
  }

  // ═══ LA CARPETA ENTERA, ABIERTA COMO UN SOLO PROYECTO ═══
  // El CAD deja de ser «un archivo que no puedo abrir» y pasa a ser la mejor fuente geométrica; el
  // pliego y la memoria dejan de ser documentos sueltos y pasan a COMPLETAR lo que el plano no dice.
  const escribirTemporal = escritorTemporal()
  const documental = await ingerir({ google, insumos, planosLegibles: planos.legibles, escribirTemporal, limite: limiteRegiones, logger })

  // ═══ UNA MIRADA POR VISTA, NO UNA POR LÁMINA — Y TODAS A LA VEZ ═══
  // Mismo criterio y mismo cuidado con el orden que las láminas. Y si ya se canceló, no se empieza:
  // cancelar es dejar de gastar, no gastar el resto más rápido.
  let porRegion = []
  if (porRegiones && !cancelada) {
    const vistas = await leerVistas({
      segmentaciones: documental.segmentaciones, pedir: pedirSeguro, refrescar, logger, cache, met, anotar,
      concurrencia, cancelado, onProgreso,
    })
    porRegion = vistas.porRegion
    cancelada = cancelada || vistas.cancelada
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
    // ═══ UNA CORRIDA CANCELADA DEVUELVE, NO TIRA ═══
    // Lo que se leyó antes de cancelar ya se pagó y ya está en el caché: descartarlo sería tirar
    // plata. Sale entero, con `cancelada: true` para que nadie lea este resultado como completo.
    cancelada,
    // `soloAdjuntos` es lo que le permite a la respuesta no decir «busqué en Drive» cuando no buscó.
    soloAdjuntos: !conIndice,
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
