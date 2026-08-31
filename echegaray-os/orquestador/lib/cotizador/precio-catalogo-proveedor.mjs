// EL ESCALÓN 4 DE LA JERARQUÍA: EL CATÁLOGO DEL PROVEEDOR, LEÍDO DIRECTO Y ESTRUCTURADO.
//
// ═══ POR QUÉ ESTE MÓDULO EXISTE, MEDIDO ═══
//
// La primera versión de la búsqueda autónoma iba a un buscador general. Corrida real del 31/08/2026
// sobre los cuatro recursos de la regresión:
//
//   · DuckDuckGo devolvió 202 (bloqueo) desde la segunda consulta.
//   · Bing devolvió resultados dos veces y después empezó a servir SIEMPRE las mismas diez páginas
//     —comprar.gob.ar, zonaprop, amazon— sin mirar la consulta: la página anti-bot.
//   · De las 32 páginas que sí se abrieron, CERO produjeron un precio citable. Los motivos reales,
//     contados: 17 SIN_MONTO (enciclopedias, sitios institucionales), 11 VARIOS_MONTOS (páginas de
//     listado con 20 a 75 precios distintos), 4 respuestas 403.
//
// Un buscador general es una fuente de nivel 5 y encima frágil. La jerarquía del programa pone en el
// nivel 4 al FABRICANTE / DISTRIBUIDOR / PROVEEDOR, que es más fuerte y —esto es lo que cambia
// todo— publica su catálogo en formato estructurado: un producto por registro, con su nombre, su
// unidad de venta, su precio y a veces hasta hasta cuándo vale. Ahí no existe el problema de
// «veinte precios en la página»: hay un precio por producto porque así lo publica el vendedor.
//
// ═══ LO QUE ESTE MÓDULO NO RESUELVE, Y HAY QUE DECIRLO ═══
//
// Ninguno de los catálogos alcanzables declara el tratamiento de IVA de sus precios. Suponer que un
// precio de lista minorista viene con IVA incluido le saca 17,4% al costo; suponer lo contrario se
// lo agrega. Las dos son plata que nadie decidió, así que las observaciones salen con
// `iva: NO_DECLARADO` y la governance las deja en INFORMAR. **Eso no es una falla del mecanismo: es
// una decisión de política que le falta al dueño**, y está anotada como tal en el informe.

import { TIPO_FUENTE, IVA, FLETE, observacion, especificacionNormalizada } from './precio-observacion.mjs'
import { normalizarUnidad, factorDePrecio, convertir } from './unidades.mjs'
import { presentacionDe } from './precio-web.mjs'
import { ESTADO } from './contrato.mjs'

/**
 * LOS CATÁLOGOS QUE SE PUEDEN LEER. Cada uno con lo que se MIDIÓ al probarlo, no con una expectativa.
 *
 * Es una lista corta a propósito: un registro de veinte proveedores que no responden es peor que uno
 * de dos que sí, porque hace parecer que se consultó el mercado. Crece cuando alguien prueba uno
 * nuevo y anota qué devolvió.
 */
export const PROVEEDORES = Object.freeze([
  Object.freeze({
    id: 'EASY', nombre: 'Easy Argentina (Cencosud)', dominio: 'www.easy.com.ar', plataforma: 'VTEX',
    jurisdiccion: 'AR', tipoFuente: TIPO_FUENTE.WEB, iva: IVA.NO_DECLARADO, flete: FLETE.NO_DECLARADO,
    verificadoEl: '2026-08-31',
    porQue: 'catálogo público VTEX: responde 206 con JSON estructurado, un producto por registro, con unidad de venta y PriceValidUntil. NO declara el tratamiento de IVA',
  }),
  Object.freeze({
    id: 'BLAISTEN', nombre: 'Blaisten', dominio: 'www.blaisten.com.ar', plataforma: 'VTEX',
    jurisdiccion: 'AR', tipoFuente: TIPO_FUENTE.WEB, iva: IVA.NO_DECLARADO, flete: FLETE.NO_DECLARADO,
    verificadoEl: '2026-08-31',
    porQue: 'catálogo público VTEX: responde 200. Su surtido es sanitarios y revestimientos, así que para estructura y hierro devuelve vacío — y eso es una respuesta, no un error',
  }),
])

/** Cuántos productos se piden por consulta. Más de veinte es traer el catálogo entero para elegir
 *  uno: el filtro de comparabilidad tiene que decidir sobre pocos y buenos. */
export const TOPE_PRODUCTOS = 20

/** Por qué un producto del catálogo no sirve para este recurso. Se cuentan: «no encontré» y
 *  «encontré diez y ninguno era esto» llevan a acciones distintas. */
export const DESCARTE = Object.freeze({
  NO_COMPARABLE: 'NO_COMPARABLE',
  UNIDAD_INCOMPATIBLE: 'UNIDAD_INCOMPATIBLE',
  SIN_PRECIO: 'SIN_PRECIO',
  SIN_STOCK: 'SIN_STOCK',
})

/** La URL de búsqueda del catálogo VTEX. PURA — se expone para poder pegarla en un informe y que
 *  cualquiera repita la consulta a mano. */
export const urlDeBusquedaVtex = (proveedor, termino, tope = TOPE_PRODUCTOS) =>
  `https://${proveedor.dominio}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(termino)}&_from=0&_to=${tope - 1}`

/**
 * LEER EL CATÁLOGO DE UN PROVEEDOR. Cáscara: recibe `fetchImpl`.
 *
 * Devuelve productos NORMALIZADOS —los mismos campos vengan de la plataforma que vengan— y nunca
 * tira: un proveedor caído se informa y los otros siguen.
 */
export async function leerCatalogo({ proveedor, termino, fetchImpl = fetch, tope = TOPE_PRODUCTOS, timeoutMs = 15_000 } = {}) {
  const url = urlDeBusquedaVtex(proveedor, termino, tope)
  try {
    const r = await fetchImpl(url, {
      headers: { 'user-agent': 'EchegarayOS/1.0 (+https://app.ecsas.com.ar)', accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!r.ok && r.status !== 206) return { productos: [], url, porQue: `${proveedor.id} respondió ${r.status}` }
    const crudo = JSON.parse(await r.text())
    if (!Array.isArray(crudo)) return { productos: [], url, porQue: `${proveedor.id} no devolvió una lista de productos` }
    return { productos: crudo.map((p) => normalizarProductoVtex(p, proveedor)).filter(Boolean), url, porQue: `${crudo.length} producto(s) del catálogo de ${proveedor.nombre}` }
  } catch (e) {
    return { productos: [], url, porQue: `${proveedor.id} no se pudo leer: ${String(e?.message ?? e).slice(0, 120)}` }
  }
}

/** Un producto VTEX pasado a la forma común. PURA. `PriceValidUntil` es el ÚNICO `valido_hasta` que
 *  este módulo puede afirmar: lo declara el vendedor, no lo estima nadie. */
export function normalizarProductoVtex(p, proveedor) {
  const item = p?.items?.[0]
  const oferta = item?.sellers?.[0]?.commertialOffer
  if (!item || !oferta) return null
  const precio = Number(oferta.Price ?? oferta.ListPrice ?? 0)
  return Object.freeze({
    nombre: String(p.productName ?? '').trim(),
    marca: p.brand && p.brand !== '-' ? String(p.brand) : null,
    url: p.link ?? (p.linkText ? `https://${proveedor.dominio}/${p.linkText}/p` : null),
    sku: item.itemId ?? p.productId ?? null,
    precio: Number.isFinite(precio) && precio > 0 ? precio : null,
    moneda: 'ARS',
    unidad: item.measurementUnit ?? 'un',
    multiplicador: Number(item.unitMultiplier ?? 1) || 1,
    disponible: oferta.IsAvailable !== false && Number(oferta.AvailableQuantity ?? 0) > 0,
    validoHasta: oferta.PriceValidUntil ? String(oferta.PriceValidUntil).slice(0, 10) : null,
    proveedor: proveedor.id,
  })
}

/**
 * ¿ESTE PRODUCTO ES ESTE RECURSO? PURA. La pregunta del §3: comparabilidad, no parecido.
 *
 * Dos condiciones y ninguna se puede saltear:
 *
 *   1. TODAS LAS PALABRAS DEL RECURSO, no la mayoría. Con el 50% alcanzaba para aceptar «Cemento De
 *      Albañilería 25 Kg Loma Negra» como si fuera «CEMENTO PORTLAND LOMA NEGRA»: comparten
 *      cemento, loma y negra, y les falta la única palabra que dice qué producto es. La palabra que
 *      falta suele ser exactamente la que distingue —portland, liso, trapezoidal—, así que exigir
 *      todas no es rigor decorativo: es la diferencia entre el material y su primo.
 *   2. LOS ATRIBUTOS MEDIBLES, TODOS. Si el recurso especifica 12,5 y 2,4 y 1,2, un producto que no
 *      menciona alguna de esas medidas no es ese producto: es otro del mismo rubro. Un catálogo
 *      lleno de placas de yeso de todas las medidas hace que «parecido» sea inútil.
 *
 * Una palabra que denuncia otra cosa —«instalación», «colocación», «service»— descalifica sola: el
 * precio de instalar una placa no es el precio de la placa, y confundirlos mete mano de obra dentro
 * de un costo de material que después vuelve a sumar la cuadrilla.
 */
export const PALABRAS_QUE_DESCALIFICAN = Object.freeze(['instalacion', 'colocacion', 'mano', 'obra', 'service', 'servicio', 'medicion', 'garantia', 'combo', 'kit'])

export function comparabilidad({ recurso = {}, producto = {}, minCobertura = 1 } = {}) {
  const spec = especificacionNormalizada({ nombre: recurso.nombre ?? '', unidad: recurso.unidad })
  const delProducto = especificacionNormalizada({ nombre: producto.nombre ?? '', unidad: producto.unidad })
  const nombreProd = delProducto.palabras
  const descalifica = PALABRAS_QUE_DESCALIFICAN.filter((w) => nombreProd.includes(w) && !spec.palabras.includes(w))
  if (descalifica.length) {
    return { comparable: false, cobertura: null, porQue: `«${producto.nombre}» dice «${descalifica.join('», «')}»: es otra cosa que se vende junto al material, no el material` }
  }
  const comunes = spec.palabras.filter((w) => nombreProd.some((x) => x.startsWith(w) || w.startsWith(x)))
  const cobertura = spec.palabras.length ? comunes.length / spec.palabras.length : 0
  if (cobertura < minCobertura) {
    return { comparable: false, cobertura, porQue: `«${producto.nombre}» comparte ${comunes.length} de ${spec.palabras.length} palabras del recurso (${(cobertura * 100).toFixed(0)}%, hace falta ${minCobertura * 100}%)` }
  }
  const medidas = [...new Set([...spec.atributos.map((a) => a.replace(/^d/, '').replace(/[a-z]+$/, '')), ...spec.numeros])]
    .map(Number).filter((n) => Number.isFinite(n) && n > 0)
  if (medidas.length) {
    const enElProducto = numerosDe(producto.nombre)
    const faltan = medidas.filter((m) => !enElProducto.some((n) => Math.abs(n - m) < 1e-9))
    // ═══ TODAS LAS MEDIDAS, NO ALGUNA ═══
    //
    // Con «alguna» alcanza para equivocarse: la primera corrida real aceptó «Placa Yeso 9.5 Mm X
    // 1.20 X 2.40» para el recurso «PLACA DE YESO 12,5 X 2,4 X 1,2» porque coincidían el ancho y el
    // largo. Son la misma placa de otro espesor —un 24% menos de material— y el precio no es
    // comparable. La medida que distingue el producto es justamente la que faltaba.
    if (faltan.length) {
      return { comparable: false, cobertura, porQue: `«${producto.nombre}» no menciona ${faltan.join(', ')}: el recurso especifica ${medidas.join(' × ')} y falta la medida que lo distingue` }
    }
    return { comparable: true, cobertura, porQue: `${comunes.length}/${spec.palabras.length} palabras y TODAS las medidas (${medidas.join(' × ')}) coinciden` }
  }
  return { comparable: true, cobertura, porQue: `${comunes.length}/${spec.palabras.length} palabras del recurso están en «${producto.nombre}» y el recurso no especifica medidas` }
}

/**
 * LOS NÚMEROS DE UN TEXTO, COMO NÚMEROS. PURA.
 *
 * Se comparan por VALOR y no por subcadena. La primera corrida real aceptó un tornillo
 * «3.5x41.2 Mm» como si fuera la placa de «1,2» porque «41.2» contiene «1.2»: comparar medidas con
 * `includes` hace que cualquier número largo contenga a cualquier número corto.
 */
export const numerosDe = (texto) => [...String(texto ?? '').replace(/,/g, '.').matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]))

/**
 * EL PRECIO DEL PRODUCTO LLEVADO A LA UNIDAD DEL RECURSO. PURA.
 *
 * NO se compara bolsa con kg ni chapa con m² sin conversión defendible: si las dimensiones no
 * coinciden, no hay precio — hay un motivo escrito. La unidad va en el DENOMINADOR, así que un
 * precio por tonelada pasa a precio por kilo dividiendo: por eso va `factorDePrecio` y no `convertir`.
 */
export function precioEnLaUnidadDelRecurso({ recurso = {}, producto = {} } = {}) {
  const ur = normalizarUnidad(recurso.unidad)
  const up = normalizarUnidad(producto.unidad)
  if (!ur) return { sirve: false, motivo: DESCARTE.UNIDAD_INCOMPATIBLE, porQue: `el recurso se mide en «${recurso.unidad}», que no está en el diccionario de unidades` }
  if (!up) return { sirve: false, motivo: DESCARTE.UNIDAD_INCOMPATIBLE, porQue: `el producto se vende en «${producto.unidad}», que no está en el diccionario de unidades` }
  if (up.canonica === ur.canonica) return { sirve: true, valor: producto.precio, unidad: ur.canonica, porQue: `el catálogo lo vende por ${ur.canonica}, la misma unidad del recurso` }
  if (up.dimension !== ur.dimension) {
    // ═══ LA PRESENTACIÓN ES EL PUENTE, CUANDO LA DECLARA EL PRODUCTO ═══
    //
    // «Cemento 25 Kg Avellaneda» se vende POR UNIDAD y el recurso se cotiza POR KILO: las
    // dimensiones no coinciden (CONTEO vs MASA) y sin embargo la conversión existe y es exacta,
    // porque el propio título dice cuánto trae el envase. Es el mismo dato que `presentacionDe` ya
    // sabe leer en una página web. Sin esa declaración NO se divide: dividir a ojo publica un costo
    // con una cifra de más o de menos.
    const pres = presentacionDelTitulo(producto.nombre, ur.dimension)
    if (pres && pres.dimension === ur.dimension) {
      const c = convertir(pres.valor, pres.unidad, ur.canonica)
      if (c.estado === ESTADO.CALCULADO && c.valor > 0) {
        return { sirve: true, valor: producto.precio / c.valor, unidad: ur.canonica, porQue: `el catálogo lo vende por ${up.canonica} y el título declara «${pres.literal}» = ${c.valor} ${ur.canonica}: el unitario es el precio ÷ ${c.valor}` }
      }
    }
    return { sirve: false, motivo: DESCARTE.UNIDAD_INCOMPATIBLE, porQue: `el catálogo lo vende por ${up.canonica} (${up.dimension}) y el recurso se cotiza en ${ur.canonica} (${ur.dimension}); el título tampoco declara la presentación: no hay conversión defendible` }
  }
  const f = factorDePrecio(up.canonica, ur.canonica)
  if (f.estado !== ESTADO.CALCULADO) return { sirve: false, motivo: DESCARTE.UNIDAD_INCOMPATIBLE, porQue: f.porQue }
  return { sirve: true, valor: producto.precio * f.factor, unidad: ur.canonica, porQue: `publicado por ${up.canonica} → ${ur.canonica}: ${f.porQue}` }
}

/**
 * CUÁNTO TRAE EL ENVASE, SEGÚN EL TÍTULO DEL PRODUCTO. PURA.
 *
 * `presentacionDe` de `precio-web.mjs` busca la forma explícita: «bolsa de 50 kg», «x 25 kg».
 * Los títulos de catálogo no la escriben: dicen «Cemento Portland Loma Negra 50 Kg» y listo. Acá se
 * agrega esa segunda forma, y con una condición dura:
 *
 * **TIENE QUE HABER EXACTAMENTE UNA medida de la dimensión que se busca.** Un título con «25 Kg» y
 * «50 Kg» no dice cuánto trae: dice dos cosas, y elegir una es elegir al azar. Con dos o más, no hay
 * presentación — hay una ambigüedad, y se declara.
 *
 * La dimensión filtra sola los falsos amigos: para un recurso en kg, el «12.5 Mm» de una placa es
 * LONGITUD y ni se mira.
 */
export function presentacionDelTitulo(titulo, dimensionBuscada) {
  const explicita = presentacionDe(titulo)
  if (explicita && explicita.dimension === dimensionBuscada) return explicita
  const candidatas = []
  for (const m of String(titulo ?? '').replace(/,/g, '.').matchAll(/(\d+(?:\.\d+)?)\s*([a-zA-Z]+\d?)\b/g)) {
    const u = normalizarUnidad(m[2])
    if (u && u.dimension === dimensionBuscada && Number(m[1]) > 0) {
      candidatas.push({ valor: Number(m[1]), unidad: u.canonica, dimension: u.dimension, literal: m[0].trim() })
    }
  }
  if (candidatas.length !== 1) return null
  return Object.freeze(candidatas[0])
}

/**
 * DE LOS PRODUCTOS DEL CATÁLOGO A OBSERVACIONES DE PRECIO. PURA.
 *
 * Devuelve `{observaciones, descartes}`. Los descartes van con su motivo porque «no encontré el
 * panel» y «encontré cuatro paneles y ninguno de 50 mm» son dos diagnósticos distintos y llevan a
 * dos acciones distintas.
 */
export function observacionesDeCatalogo({ recurso = {}, proveedor = null, productos = [], hoy = new Date() } = {}) {
  const observaciones = []
  const descartes = []
  const spec = especificacionNormalizada({ nombre: recurso.nombre ?? '', unidad: recurso.unidad })
  for (const p of productos) {
    if (!p.precio) { descartes.push({ producto: p.nombre, motivo: DESCARTE.SIN_PRECIO, porQue: 'el catálogo lo lista sin precio' }); continue }
    if (!p.disponible) { descartes.push({ producto: p.nombre, motivo: DESCARTE.SIN_STOCK, porQue: 'sin stock: un precio de algo que no se puede comprar no es un precio de compra' }); continue }
    const comp = comparabilidad({ recurso, producto: p })
    if (!comp.comparable) { descartes.push({ producto: p.nombre, motivo: DESCARTE.NO_COMPARABLE, porQue: comp.porQue }); continue }
    const conv = precioEnLaUnidadDelRecurso({ recurso, producto: p })
    if (!conv.sirve) { descartes.push({ producto: p.nombre, motivo: conv.motivo, porQue: conv.porQue }); continue }
    try {
      observaciones.push(observacion({
        recursoId: recurso.id ?? null, recursoCodigo: recurso.codigo,
        descripcion: p.nombre, spec: spec.spec,
        valor: conv.valor, moneda: p.moneda, unidad: conv.unidad,
        baseDeCantidad: { valor: p.multiplicador, unidad: p.unidad, porQue: 'unitMultiplier del catálogo' },
        tipoFuente: proveedor.tipoFuente, fuenteId: `${proveedor.id}:${p.sku}`,
        proveedor: proveedor.nombre, fabricante: p.marca, url: p.url,
        observadoEn: hoy.toISOString().slice(0, 10),
        // EL ÚNICO `valido_hasta` QUE SE PUEDE AFIRMAR: lo declara el vendedor en su propio catálogo.
        validoHasta: p.validoHasta, validoHastaLoDiceLaFuente: Boolean(p.validoHasta),
        jurisdiccion: proveedor.jurisdiccion, iva: proveedor.iva, flete: proveedor.flete,
        confianza: `catálogo ${proveedor.plataforma} de ${proveedor.nombre}`,
        evidencia: {
          catalogo: proveedor.id, plataforma: proveedor.plataforma, sku: p.sku,
          productoPublicado: p.nombre, unidadPublicada: p.unidad, precioPublicado: p.precio,
          comparabilidad: comp.porQue, conversion: conv.porQue,
          porQueNoDeclaraIva: proveedor.iva === IVA.NO_DECLARADO ? 'el catálogo publica el precio sin decir cómo trata el IVA' : null,
          noAsciende: ['HECHO ECSAS', 'EXPERIENCIA ECSAS', 'NORMA'],
        },
        procedencia: { via: 'CATALOGO_PROVEEDOR', proveedor: proveedor.id, especificacion: spec.spec },
      }))
    } catch (e) {
      descartes.push({ producto: p.nombre, motivo: 'NO_CONSTRUIBLE', porQue: String(e?.message ?? e).slice(0, 160) })
    }
  }
  return { observaciones, descartes }
}

/**
 * BUSCAR UN RECURSO EN TODOS LOS CATÁLOGOS. Cáscara.
 *
 * `termino` lo arma quien llama —normalmente `consultasDeEspecificacion`— y se prueba tal cual y
 * después acortado: un catálogo hace coincidencia literal y «Panel Chapa Trape Blanco Pur 50 Mm Foil
 * Blanco» entero no está en ningún título de producto.
 */
export async function observarEnCatalogos({ recurso = {}, terminos = [], proveedores = PROVEEDORES, fetchImpl = fetch, hoy = new Date() } = {}) {
  const observaciones = []
  const recorrido = []
  for (const prov of proveedores) {
    for (const t of terminos) {
      const { productos, url, porQue } = await leerCatalogo({ proveedor: prov, termino: t, fetchImpl })
      const { observaciones: obs, descartes } = observacionesDeCatalogo({ recurso, proveedor: prov, productos, hoy })
      recorrido.push({ proveedor: prov.id, termino: t, url, productos: productos.length, observaciones: obs.length, descartes, porQue })
      observaciones.push(...obs)
      if (obs.length) break   // este proveedor ya contestó: no se le insiste con términos más flojos
    }
  }
  return { observaciones, recorrido, porQue: `${observaciones.length} observación(es) de ${proveedores.length} catálogo(s) de proveedor` }
}
