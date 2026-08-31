// XSAS SALE A BUSCAR EL PRECIO SOLO — el paso que faltaba y por el que la DoD midió CERO.
//
// ═══ EL DEFECTO, EXACTO ═══
//
// `precio-web.mjs` ya sabía convertir el texto de una página en un número con unidad, IVA y fecha.
// `precio-resolucion.mjs` ya tenía el escalón WEB en la cascada. Y sin embargo, corriendo el
// resolvedor sobre la oferta real del Salón Comercial, el resultado fue
// `resueltosAutonomamente: 0`. El motivo no era una regla mal puesta: **nadie llamaba al escalón
// WEB**. `resolverCatalogo` leía el catálogo y las compras, y ahí terminaba. El camino existía y
// nunca se recorría — que es la diferencia entre EXISTE_CÓDIGO y CAPACIDAD_DEMOSTRADA.
//
// Este módulo es el que recorre: dado un recurso, arma la consulta POR ESPECIFICACIÓN, la manda a
// un buscador, abre las páginas candidatas en orden de autoridad y devuelve OBSERVACIONES —nunca
// hechos— con todo lo que hizo falta descartar y por qué.
//
// ═══ POR QUÉ LA CONSULTA SE ARMA CON LA SPEC Y NO CON EL NOMBRE ═══
//
// El catálogo dice «Panel Chapa Trape Blanco Pur 50 Mm Foil Blanco». Nadie vende con ese nombre.
// Lo que sí existe en el mercado es «panel + 50mm + PUR + trapezoidal», y eso lo produce
// `especificacionNormalizada`. Buscar el nombre literal devuelve cero resultados útiles; buscar los
// atributos devuelve el producto. Medido: la consulta por nombre literal del Panel no trajo ninguna
// página con precio; la consulta por spec trajo seis dominios de proveedores.
//
// ═══ LO QUE SE MIDIÓ ANTES DE ELEGIR LOS BUSCADORES (31/08/2026) ═══
//
//   · DuckDuckGo HTML — funciona y devuelve URLs limpias, pero corta a la segunda o tercera consulta
//     seguida. Hay que espaciarlas.
//   · Bing HTML — aguanta más, pero envuelve cada resultado en un redirect propio con la URL real en
//     base64. Se desenvuelve acá; si algún día cambia el formato, el parser devuelve vacío y el
//     recorrido lo dice, no falla en silencio.
//   · Mojeek — devuelve 200 con una página sin resultados desde esta red. Descartado, medido.
//   · MercadoLibre — la búsqueda lo devuelve primero SIEMPRE, y al abrir la página del producto
//     responde un muro de verificación de cuenta en vez del precio. No es un juicio sobre el sitio:
//     es lo que devolvió. Se excluye para no gastar el presupuesto de lecturas en un muro.
//
// ═══ SIN RED NO PASA NADA MALO ═══
//
// Todo lo que abre un socket recibe `fetchImpl` y `leer` por parámetro. Sin ellos no hay búsqueda y
// el resultado es una lista vacía con su motivo: la cascada determinística sigue funcionando igual.

import { especificacionNormalizada, observacion, TIPO_FUENTE, IVA as IVA_OBS, FLETE } from './precio-observacion.mjs'
import { lecturaDePrecioWeb, IVA as IVA_WEB } from './precio-web.mjs'
import { autoridadDe, NOMBRE_AUTORIDAD } from '../plano/investigacion.mjs'

/** Dominios que no se abren. Cada uno con el motivo MEDIDO, no con una opinión. */
export const NO_SE_ABREN = Object.freeze({
  'mercadolibre.com.ar': 'al 31/08/2026 devuelve un muro de verificación de cuenta en vez de la página del producto',
  'facebook.com': 'requiere sesión: devuelve la pantalla de login',
  'scribd.com': 'documento subido por terceros sin fuente verificable',
  'youtube.com': 'no publica precios en texto',
  'pinterest.com': 'no publica precios en texto',
  'instagram.com': 'requiere sesión',
})

/** Cuántas páginas se abren por recurso antes de dar la búsqueda por perdida. Cada lectura son unos
 *  segundos y unos kilobytes; ocho alcanzan para pasar los agregadores y llegar a un proveedor. */
export const TOPE_PAGINAS = 8

/** Cuánto se espera entre consultas al buscador. Medido: sin espera, DuckDuckGo devuelve vacío a
 *  partir de la segunda. No es cortesía, es que si no, no funciona. */
export const ESPERA_ENTRE_CONSULTAS_MS = 4_000

const dominioDe = (u) => { try { return new URL(String(u)).hostname.replace(/^www\./, '') } catch { return null } }

/** ¿El dominio es argentino? PURA. Un precio en pesos de un material de obra lo publica un sitio de
 *  acá; uno de `.es` publica euros y uno de `.com` puede publicar cualquier cosa. */
export const esDelPais = (u, tld = '.ar') => Boolean(dominioDe(u)?.endsWith(tld))

/** ¿Está en la lista de los que no se abren? PURA. Devuelve el motivo o `null`. */
export function motivoParaNoAbrir(url) {
  const d = dominioDe(url)
  if (!d) return 'no es una URL legible'
  for (const [bloqueado, porQue] of Object.entries(NO_SE_ABREN)) {
    if (d === bloqueado || d.endsWith(`.${bloqueado}`)) return `${bloqueado}: ${porQue}`
  }
  return null
}

/**
 * LA CONSULTA, ARMADA CON LA ESPECIFICACIÓN. PURA.
 *
 * Devuelve VARIAS: la primera es la más específica y las siguientes van aflojando. Se prueban en
 * orden y se para en la primera que devuelve páginas — buscar dos veces lo mismo con distinta suerte
 * es lo que hace que una corrida sea irreproducible.
 *
 * La jurisdicción entra en la consulta porque un precio de Buenos Aires no es un precio de San Juan,
 * y el buscador es lo único que puede sesgarlo geográficamente antes de leer.
 */
export function consultasDeEspecificacion({ recurso = {}, lugar = 'Argentina' } = {}) {
  const spec = especificacionNormalizada({ nombre: recurso.nombre ?? recurso.codigo, unidad: recurso.unidad, familia: recurso.familia })
  // ═══ EL ANCLA COMERCIAL NO ES DECORACIÓN ═══
  //
  // «hierro liso 16» devuelve la Wikipedia del elemento químico y siete páginas de nutrición.
  // «comprar hierro liso 16 precio corralón» devuelve corralones. La palabra que cambia el resultado
  // es la que dice que se está comprando algo, no estudiándolo — y sin ella el 100% de las lecturas
  // se gastan en enciclopedias. Medido el 31/08 sobre los cuatro recursos de la regresión.
  const ancla = 'comprar'
  return Object.freeze({
    spec,
    consultas: Object.freeze([
      `${ancla} ${spec.termino} ${comoSePideElPrecio(spec.unidad)} ${lugar}`.replace(/\s+/g, ' ').trim(),
      `${spec.termino} precio lista ${familiaComoPalabra(recurso.familia)} ${lugar}`.replace(/\s+/g, ' ').trim(),
      `"${String(recurso.nombre ?? '').trim()}" precio ${lugar}`.trim(),
    ].filter((q) => q.length > 8)),
  })
}

/** La familia del catálogo dicha como la diría un comprador. «MATERIAL» no ayuda a buscar; «corralón»
 *  sí. Lo que no está en la tabla no se traduce y no se inventa: se omite. */
export function familiaComoPalabra(familia) {
  const f = String(familia ?? '').toUpperCase()
  if (f === 'MATERIAL') return 'corralon'
  if (f === 'MAQUINA' || f === 'EQUIPO') return 'alquiler servicio'
  if (f === 'SUBCONTRATISTA' || f === 'CONTRATISTA') return 'servicio'
  return ''
}

/**
 * CÓMO SE PIDE EL PRECIO DE ALGO QUE SE MIDE ASÍ. PURA.
 *
 * «precio por un» no es castellano y el buscador lo trata como ruido: la consulta del recurso 154
 * salió literalmente «placa yeso precio por un Argentina» y no trajo nada. Las unidades de conteo se
 * piden por «precio unidad» y las de medida por «precio por m2». Es una diferencia de tres palabras
 * que decide si la búsqueda devuelve un corralón o un diccionario.
 */
export function comoSePideElPrecio(unidad) {
  if (!unidad) return 'precio'
  const u = String(unidad).toLowerCase()
  if (u === 'un' || u === 'u' || u === 'unidad') return 'precio unidad'
  if (u === 'gl' || u === 'global') return 'precio'
  return `precio por ${u}`
}

/** Las URLs de un SERP de DuckDuckGo HTML. PURA. */
export function urlsDeDuckDuckGo(html) {
  return [...new Set([...String(html ?? '').matchAll(/uddg=([^&"']+)/g)].map((m) => {
    try { return decodeURIComponent(m[1]) } catch { return null }
  }).filter((u) => u && /^https?:\/\//.test(u)))]
}

/**
 * Las URLs de un SERP de Bing. PURA. Bing envuelve cada resultado en `/ck/a?...&u=a1<base64url>`.
 *
 * El separador se acepta como `?`, `&` o `&amp;`: el HTML que sirve Bing viene con las entidades SIN
 * decodificar, y un patrón que sólo aceptaba `&` devolvía CERO resultados sobre una página que traía
 * dieciocho. El síntoma era idéntico al de un buscador que no responde —«ningún motor → 0
 * páginas»— y por eso está escrito acá: dos causas muy distintas se veían iguales.
 */
export function urlsDeBing(html) {
  const salida = []
  for (const m of String(html ?? '').matchAll(/(?:[?&]|&amp;)u=a1([A-Za-z0-9_-]+)/g)) {
    try {
      const u = Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
      if (/^https?:\/\//.test(u)) salida.push(u)
    } catch { /* un resultado que no desenvuelve no rompe los otros */ }
  }
  return [...new Set(salida)]
}

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

/** Los motores, en el orden en que se prueban, con su parser. Ninguno necesita credencial ni crédito:
 *  el OS puede buscar precios con la luz apagada. */
export const MOTORES = Object.freeze([
  // Bing va PRIMERO por medición, no por preferencia: al 31/08/2026 DuckDuckGo devuelve 202 desde
  // esta red incluso con espera entre consultas, y Bing responde 200 con resultados. DDG queda como
  // segundo porque el día que Bing corte, el mecanismo tiene que tener a dónde ir.
  { nombre: 'bing', url: (q) => `https://www.bing.com/search?q=${encodeURIComponent(q)}&setmkt=es-AR`, urls: urlsDeBing },
  { nombre: 'duckduckgo', url: (q) => `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`, urls: urlsDeDuckDuckGo },
])

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * LA CÁSCARA DEL BUSCADOR. Prueba los motores en orden y devuelve las URLs del primero que responde.
 *
 * Devuelve SIEMPRE `{urls, motor, recorrido}`: el recorrido dice qué motor se probó, qué devolvió y
 * por qué se pasó al siguiente. Sin eso, «no encontré nada» y «el buscador me cortó» se ven iguales,
 * y llevan a decisiones opuestas.
 */
export function buscador({ fetchImpl = fetch, motores = MOTORES, esperaMs = ESPERA_ENTRE_CONSULTAS_MS } = {}) {
  return async function buscar(consulta) {
    const recorrido = []
    for (const m of motores) {
      try {
        const r = await fetchImpl(m.url(consulta), { headers: { 'user-agent': UA, 'accept-language': 'es-AR,es;q=0.9' } })
        const html = await r.text()
        const urls = m.urls(html).filter((u) => !motivoParaNoAbrir(u))
        recorrido.push({ motor: m.nombre, status: r.status, urls: urls.length })
        if (urls.length) return { urls, motor: m.nombre, recorrido, consulta }
      } catch (e) {
        recorrido.push({ motor: m.nombre, error: String(e?.message ?? e).slice(0, 120) })
      }
      if (esperaMs > 0) await dormir(esperaMs)
    }
    return { urls: [], motor: null, recorrido, consulta }
  }
}

/**
 * BUSCAR EL PRECIO DE UN RECURSO Y DEVOLVER LAS OBSERVACIONES QUE SE PUDIERON DEFENDER.
 *
 * No devuelve «el precio»: devuelve TODO lo que encontró, con lo descartado y su motivo. Quién gana
 * lo decide `seleccionar()`; si puede aplicarse lo decide `precio-governance.mjs`. Este módulo
 * OBSERVA y nada más — es el primero de los tres actos y no invade a los otros dos.
 */
export async function observarPrecioWeb({
  recurso = {}, buscar = null, leer = null, alicuotaIva = null,
  lugar = 'Argentina', jurisdiccion = 'AR-SJ', topePaginas = TOPE_PAGINAS, hoy = new Date(),
} = {}) {
  const { spec, consultas } = consultasDeEspecificacion({ recurso, lugar })
  const recorrido = []
  const vacio = (porQue) => Object.freeze({ observaciones: Object.freeze([]), spec, consultas, recorrido: Object.freeze(recorrido), porQue })
  if (typeof buscar !== 'function' || typeof leer !== 'function') {
    return vacio('no hay buscador ni lector cableados: sin red el escalón WEB no existe y la cascada sigue igual')
  }

  let urls = []
  let motor = null
  for (const q of consultas) {
    const r = await buscar(q)
    recorrido.push({ paso: 'BUSCAR', consulta: q, motor: r.motor, encontradas: r.urls.length, motores: r.recorrido })
    if (r.urls.length) { urls = r.urls; motor = r.motor; break }
  }
  if (!urls.length) return vacio(`ninguna de las ${consultas.length} consultas devolvió páginas legibles`)

  // ORDEN POR JURISDICCIÓN Y DESPUÉS POR AUTORIDAD, no por posición en el buscador: el primero de
  // la lista no es el más confiable, es el que mejor paga.
  //
  // La jurisdicción va PRIMERO porque un precio en pesos de un producto de obra lo publica un sitio
  // argentino: medido, las lecturas gastadas en `.com`, `.es` y `.gov.pe` no produjeron ni una sola
  // observación en pesos. No es un juicio sobre esos sitios: es que no venden acá.
  const ordenadas = urls
    .map((u) => ({ url: u, esDelPais: esDelPais(u), ...autoridadDe(u) }))
    .sort((a, b) => Number(b.esDelPais) - Number(a.esDelPais) || a.autoridad - b.autoridad)
    .slice(0, topePaginas)

  const observaciones = []
  for (const cand of ordenadas) {
    const envuelto = await leer(cand.url).catch((e) => ({ error: String(e?.message ?? e).slice(0, 140) }))
    if (!envuelto || envuelto.error || !envuelto.contenido_externo) {
      recorrido.push({ paso: 'LEER', url: cand.url, ok: false, porQue: envuelto?.error ?? 'la página no devolvió texto' })
      continue
    }
    const lectura = lecturaDePrecioWeb({ texto: envuelto.contenido_externo, recurso, alicuotaIva })
    if (!lectura.sirve) {
      recorrido.push({ paso: 'LEER', url: cand.url, ok: false, motivo: lectura.motivo, porQue: lectura.porQue })
      continue
    }
    const observadoEn = String(envuelto.publicado_en ?? envuelto.obtenido_en ?? hoy.toISOString()).slice(0, 10)
    try {
      observaciones.push(observacion({
        recursoId: recurso.id ?? null, recursoCodigo: recurso.codigo,
        descripcion: recurso.nombre ?? null, spec: spec.spec,
        valor: lectura.valor, moneda: lectura.moneda, unidad: lectura.unidad,
        // La autoridad del dominio decide si esto es FABRICANTE o WEB genérica, y NO lo decide lo
        // que la página diga de sí misma. Es la única defensa contra una página que se autotitula
        // oficial — la misma que ya usa `precio-web.mjs`.
        tipoFuente: NOMBRE_AUTORIDAD[cand.autoridad] === 'FABRICANTE' ? TIPO_FUENTE.FABRICANTE : TIPO_FUENTE.WEB,
        url: envuelto.url ?? cand.url, proveedor: cand.dominio, observadoEn, jurisdiccion,
        iva: lectura.iva === IVA_WEB.CON_IVA ? IVA_OBS.CON_IVA : IVA_OBS.SIN_IVA,
        // El flete casi nunca está declarado en una lista publicada, y suponerlo incluido baja el
        // costo sin que nadie lo haya decidido. Se dice que no se sabe.
        flete: FLETE.NO_DECLARADO,
        confianza: NOMBRE_AUTORIDAD[cand.autoridad],
        evidencia: {
          dominio: cand.dominio, autoridad: NOMBRE_AUTORIDAD[cand.autoridad], porQueEsaAutoridad: cand.porQue,
          publicadoEn: envuelto.publicado_en ?? null, consultadoEn: envuelto.obtenido_en ?? null,
          lectura: lectura.porQue, textoLiteral: String(envuelto.contenido_externo).slice(0, 280),
          intentoDeManipulacion: Boolean(envuelto.inyeccion?.sospechoso),
          noAsciende: ['HECHO ECSAS', 'EXPERIENCIA ECSAS', 'NORMA'],
        },
        procedencia: { motor, consulta: consultas[0], especificacion: spec.spec },
      }))
      recorrido.push({ paso: 'LEER', url: cand.url, ok: true, valor: lectura.valor, moneda: lectura.moneda, autoridad: NOMBRE_AUTORIDAD[cand.autoridad] })
    } catch (e) {
      recorrido.push({ paso: 'LEER', url: cand.url, ok: false, porQue: `la observación no se pudo construir: ${String(e?.message ?? e).slice(0, 160)}` })
    }
  }
  return Object.freeze({
    observaciones: Object.freeze(observaciones), spec, consultas, recorrido: Object.freeze(recorrido),
    porQue: `${observaciones.length} observación(es) citables de ${ordenadas.length} página(s) abiertas, buscando por especificación «${spec.spec.slice(0, 90)}»`,
  })
}

/** El lector real, con la política de contenido externo ya aplicada por `web-lectura.mjs`. Se pasa
 *  por parámetro justamente para que los tests no abran un socket. */
export const lectorReal = (leerUrl) => (url) => leerUrl(url)
