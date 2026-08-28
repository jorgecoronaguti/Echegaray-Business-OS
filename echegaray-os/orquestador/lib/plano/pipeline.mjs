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
import { ingerir } from './documental.mjs'
import { armarProyecto } from './proyecto.mjs'
import { resolverConCad } from './medicion-cad.mjs'
import { piezaDe } from './atributos.mjs'
import { obraDesdeCotizacion } from './genealogia.mjs'
import { omisionesPotenciales } from '../circot/referencia.mjs'
import { evaluarChecklist } from '../circot/modelo-galpon.mjs'
import { medir } from './conteo.mjs'
import { elegir } from './elector.mjs'
import { FUENTE, faltaDato } from './fuente.mjs'

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
  if (!crudo) return { ...validarLamina({}, contexto), region: recorte.region, deCache: false, uso: r, error: 'el modelo no devolvió JSON interpretable' }
  guardarCache(llave, { crudo, region: recorte.region?.titulo ?? null, cuando: new Date().toISOString() })
  return { ...validarLamina(crudo, contexto), region: recorte.region, deCache: false, uso: r }
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
/** Los números que DISCRIMINAN una pieza de otra dentro de su id y su nombre: «C1» contra «C2»,
 *  «2C200» contra «C200» —un 2C200 son DOS perfiles C200—, «VA1» contra «VA2». Es el mismo guard
 *  que `parecidosSinFusionar` ya aplicaba para no reportar, y que faltaba para no FUSIONAR. PURA. */
export const firmaNumerica = (e) => [...new Set(String(`${e?.id ?? ''} ${e?.nombre ?? ''}`).match(/\d+/g) ?? [])]
  .map(Number).sort((a, b) => a - b).join('-')

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
    const porFirma = new Map()
    for (const e of lista) {
      const f = firmaNumerica(e)
      porFirma.set(f, [...(porFirma.get(f) ?? []), e])
    }
    if (porFirma.size > 1) {
      ambiguos.push({
        clave, tipo: 'PIEZAS_DISTINTAS', nombre: lista[0]?.nombre ?? clave,
        ids: [...new Set(lista.map((e) => String(e.id)))].sort(),
        vistas: [...new Set(lista.map((e) => e?.evidencia?.vista).filter(Boolean))].sort(),
        firmas: [...porFirma.keys()].sort(),
        porQue: `«${lista[0]?.nombre ?? clave}» agrupa identificadores con NUMERACIÓN distinta (${[...porFirma.keys()].map((f) => f || '(sin número)').join(' vs ')}): el proyectista los separó a propósito, así que NO se fusionan y salen todos`,
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
        const tipo = choque.geometria.length ? 'GEOMETRIA_INCOMPATIBLE' : choque.cantidad ? 'CANTIDAD_DISTINTA' : 'SOLO_NOMBRE'
        const detalle = choque.geometria.length
          ? `las lecturas se CONTRADICEN en ${choque.geometria.map((g) => `${g.dimension} (${g.valores.map((v) => v.valor).join(' vs ')})`).join(', ')}: esa(s) medida(s) salen como hueco y el elemento no computa hasta que alguien mire`
          : choque.cantidad
            ? `las lecturas se CONTRADICEN en la cantidad (${choque.cantidad.map((c) => c.valor).join(' vs ')}): la cantidad sale como hueco`
            : 'las lecturas no se contradicen en ninguna medida: es el mismo objeto escrito de varias formas, y se computó una sola vez'
        ambiguos.push({
          clave: `${clave}#${firma}`, tipo, nombre: ganador?.nombre ?? ids[0], ids, vistas,
          porQue: `«${ganador?.nombre ?? ids[0]}» aparece con ${ids.length} identificadores (${ids.join(', ')}). ${detalle}`,
          quienLoResuelve: tipo === 'SOLO_NOMBRE' ? 'nadie — está resuelto' : 'dirección técnica — mirando las vistas donde aparece',
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

export async function correr({ query, google, termino, pedir = pedirTexto, refrescar = false, conVeto = false, tipoObra = null, porRegiones = true, limiteRegiones = 12, logger = null } = {}) {
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
          const r = await interpretarRegion(rec, { pedir, refrescar, archivo: seg.archivo, logger })
          anotar(r.uso)
          porRegion.push({ archivo: seg.archivo, ...r })
        }
      }
    }
  }

  // Los elementos de las vistas recortadas se SUMAN a los de la lámina completa y se deduplican por
  // id: una columna vista en la planta y en el corte es UNA columna, no dos. Gana la lectura con
  // más dimensiones resueltas, que es la que vio el dibujo más grande.
  const { elementos: fusionados, ambiguos: identidadesAmbiguas } = fusionarElementos([...laminas.flatMap((l) => l.elementos), ...porRegion.flatMap((r) => r.elementos)])
  // EL CAD LLENA LO QUE LA VISTA NO PUDO CONTAR, y sólo eso: un elemento que ya tenía cantidad no
  // se toca. Contar INSERT es exacto y no cuesta un token.
  const medidoConCad = resolverConCad(fusionados, documental.cad)
  const computo = computarElementos(medidoConCad.elementos)
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
  })
  const control = controlar({ computo, mapeo, procesos, checklist, omisionesCircot, conflictos: proyecto.conflictos, identidadesAmbiguas })
  const ids = [...new Set(mapeo.mapeos.filter((m) => m.tarea).map((m) => m.tarea.id))]
  const comps = await composiciones({ query }, ids)

  return {
    termino, carpeta: raiz, ms: Date.now() - t0,
    documentos: { total: filas.filter((f) => !f.is_folder).length, insumos, reservados, planos },
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
    fuentePrecios: FUENTE.BASE_MAESTRA,
  }
}
