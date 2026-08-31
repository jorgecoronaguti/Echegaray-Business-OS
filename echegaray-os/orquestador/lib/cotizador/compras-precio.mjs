// LO QUE ECSAS PAGÓ DE VERDAD — el paso 2 de la cascada, y el único que no es una opinión.
//
// ═══ POR QUÉ ESTE MÓDULO EXISTE ═══
//
// La cascada de precios pregunta primero al catálogo interno. El catálogo interno de ECSAS es una
// ingesta de `Planilla para Cotizar (2).xlsm`: **389 recursos, cada uno con EXACTAMENTE UNA
// observación**, y 285 de ellas vencidas. O sea: el catálogo no sabe lo que cuestan las cosas hoy.
//
// La empresa sí lo sabe, y lo sabe de la manera más fuerte que existe: PAGÓ las facturas. Eso vive
// en `public.compra_sheet` (913 filas al 30/08/2026). `public.compras` está VACÍA —0 filas— así que
// el nombre obvio no es la fuente; la fuente es el espejo del Sheet de Compras.
//
// ═══ EL PROBLEMA: NADIE GUARDA LA CANTIDAD ═══
//
// `compra_sheet` tiene `importe` y no tiene `cantidad`. Un importe sin cantidad NO es un precio
// unitario y no se puede convertir en uno. Lo único que hay es lo que la persona escribió en
// `concepto`, y a veces ahí está: «10 M3 - RIPIO», «Arena 5m3», «100 m2 de Porcelanato SMOKE»,
// «Electrodos 2,5 - 20kg». Cuando está, el precio unitario pagado se puede DERIVAR y citar. Cuando
// no está, no se inventa: la fila queda como evidencia de que se le compró a ese proveedor en esa
// fecha, y nada más.
//
// ═══ LAS CUATRO TRAMPAS, TODAS MEDIDAS EN LAS FILAS REALES ═══
//
//   1. IMPORTE CERO. 192 de las 913 filas tienen `importe = 0` — «10 M3 - RIPIO $0» es un remito
//      cargado sin factura, no ripio gratis. Dividir 0 por 10 publica un precio de $0/m³, que es
//      exactamente el «SIN_PRECIO nunca es $0» del programa entrando por la puerta de atrás.
//   2. PAGO PARCIAL. «Hormigonado 600 m² — pago 2 de 4» son $2.700.000 de una obra de $10.800.000.
//      Dividir por 600 da $4.500/m² cuando el precio real es $18.000/m²: un precio unitario CUATRO
//      VECES más barato que el verdadero, y barato es la dirección en la que un error de costeo
//      hace perder la obra sin que nadie lo note.
//   3. VARIOS ÍTEMS EN UNA FILA. «Ripio común, cemento Loma Negra y flete · $102.479» no permite
//      atribuirle el importe a ninguno de los tres.
//   4. ANULADA. 6 filas tienen `anulada = true`. Una compra anulada no ocurrió.
//
// Ninguna de las cuatro se descarta en silencio: cada fila descartada sale con su motivo, porque
// «no encontré precio» y «encontré 40 filas y las cuatro reglas las voltearon» son diagnósticos
// distintos y llevan a acciones distintas.

import { numeroAR, normalizarUnidad, mismaDimension } from './unidades.mjs'

/** Lo que delata que el importe NO es el total de lo que se compró. Se busca en el concepto, en
 *  minúsculas y sin acentos. Cada patrón salió de una fila real de `compra_sheet`. */
export const PATRON_PARCIAL = /pago \d+ de \d+|a cuenta|anticipo|se[nñ]a|saldo|parcial|cuota \d+|entrega \d+|1er pago|2do pago/i

/** Lo que delata que la fila junta más de una cosa. El « y » con espacios y la coma son los dos
 *  separadores que la gente usa; « x » NO está acá a propósito, porque «Cemento Holcim x 25 kg» es
 *  UN ítem y su presentación.
 *
 *  La coma lleva `(?<!\d),(?!\d)`: en «Diesel 500 (combustible) 61,6740 u» la coma es el DECIMAL de
 *  la cantidad, y una coma decimal descartada como si separara dos productos tira a la basura la
 *  única fila del combustible que sí trae cantidad. */
export const PATRON_MULTIPLE = /\s+y\s+|\s\+\s|(?<!\d),(?!\d)/i

/** «Cemento Holcim **x 25 kg**» son bolsas de 25 kg, no 25 kg comprados: el importe de la fila cubre
 *  varias bolsas y dividirlo por 25 da un precio por kilo que multiplica el costo real. La `x`
 *  delante de la cantidad la convierte en PRESENTACIÓN, y una presentación no es una cantidad. */
export const PATRON_PRESENTACION = /\bx\s*\d/i

/** Las palabras que no identifican nada y sólo hacen ruido al comparar un nombre con un concepto. */
const RUIDO = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'para', 'con', 'sin', 'por', 'una', 'un', 'comun', 'tipo', 'obra', 'segun', 'lista', 'proveedor', 'historial', 'mano', 'nota'])

/** Sin acentos, sin puntuación, en minúsculas. Es la única normalización que se aplica: cualquier
 *  cosa más agresiva (singularizar, quitar sufijos) empieza a hacer coincidir cosas distintas. */
export const normalizar = (t) => String(t ?? '')
  .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  // El punto y la coma SE CONSERVAN: son los separadores de miles y de decimales del formato
  // argentino, y sin ellos «61,6740 u» se lee como «61» y «6740».
  .replace(/[^a-z0-9\s.,+·-]/g, ' ').replace(/\s+/g, ' ').trim()

const tokens = (t) => normalizar(t).split(/[\s,+·-]+/).filter((w) => w.length >= 4 && !RUIDO.has(w))

/**
 * BUSCAR UNA CANTIDAD CON UNIDAD EN CUALQUIER PARTE DEL TEXTO. PURA.
 *
 * `leerCantidad()` de `unidades.mjs` exige que el número esté al PRINCIPIO —«10 M3 - RIPIO» lo lee,
 * «Arena 5m3» no—. Acá se escanea todo el texto y se reusan sus dos piezas (`numeroAR` para el
 * número en formato argentino y `normalizarUnidad` para el diccionario de unidades), en vez de
 * escribir un segundo diccionario de unidades que después se desincroniza del primero.
 *
 * Si hay MÁS DE UNA cantidad con unidad, devuelve `null` con motivo: «Thinner 1L y pintura 4L» no
 * tiene una cantidad, tiene dos, y elegir una es elegir cuál de los dos productos costó todo.
 */
export function cantidadEnTexto(texto) {
  const t = normalizar(texto)
  const encontradas = []
  for (const m of t.matchAll(/(\d[\d.,]*)\s*([a-z]+\d?)/g)) {
    const n = numeroAR(m[1])
    const u = normalizarUnidad(m[2])
    if (n === null || n <= 0 || !u) continue
    if (PATRON_PRESENTACION.test(t.slice(Math.max(0, m.index - 3), m.index + m[1].length))) {
      return { cantidad: null, porQue: `«${texto}» dice «x ${m[1]} ${m[2]}»: eso es la PRESENTACIÓN del producto, no cuánto se compró` }
    }
    encontradas.push({ valor: n, unidad: u.canonica, dimension: u.dimension, comoSeLee: m[0] })
  }
  if (!encontradas.length) return { cantidad: null, porQue: `«${texto}» no declara ninguna cantidad con unidad: el importe no se puede dividir por nada` }
  const distintas = new Set(encontradas.map((e) => `${e.valor}|${e.unidad}`))
  if (distintas.size > 1) {
    return { cantidad: null, porQue: `«${texto}» declara ${distintas.size} cantidades distintas (${encontradas.map((e) => e.comoSeLee).join(', ')}): no se puede saber cuál se llevó el importe` }
  }
  return { cantidad: encontradas[0], porQue: null }
}

/**
 * UNA FILA DE COMPRA CONVERTIDA EN PRECIO UNITARIO PAGADO, O EN UN DESCARTE CON MOTIVO. PURA.
 *
 * `fila` es lo que devuelve la cáscara: `{fecha, proveedor, concepto, importe, anulada, familia}`.
 * Devuelve SIEMPRE la misma forma —`{sirve, precioUnitario, unidad, porQue, evidencia}`— porque el
 * que llama tiene que poder contar los descartes tanto como los aciertos.
 */
export function precioUnitarioPagado(fila = {}) {
  const concepto = String(fila.concepto ?? '')
  const no = (porQue, motivo) => Object.freeze({ sirve: false, precioUnitario: null, unidad: null, motivo, porQue, evidencia: evidenciaDe(fila) })

  if (fila.anulada === true) return no('la compra está marcada como anulada: no ocurrió', 'ANULADA')
  const importe = fila.importe === null || fila.importe === undefined ? null : Number(fila.importe)
  if (importe === null || !Number.isFinite(importe)) return no('la fila no tiene importe', 'SIN_IMPORTE')
  if (importe <= 0) return no(`el importe es ${importe}: un remito sin factura no es una compra a $0`, 'IMPORTE_CERO')
  if (PATRON_PARCIAL.test(concepto)) {
    return no(`«${concepto.slice(0, 70)}» es un pago PARCIAL: dividir una cuota por la cantidad total publica un precio unitario más barato que el real`, 'PAGO_PARCIAL')
  }
  if (PATRON_MULTIPLE.test(concepto.split('·')[0])) {
    return no(`«${concepto.slice(0, 70)}» junta más de un ítem: el importe no se le puede atribuir a ninguno`, 'VARIOS_ITEMS')
  }
  const { cantidad, porQue } = cantidadEnTexto(concepto)
  if (!cantidad) return no(porQue, 'SIN_CANTIDAD')

  return Object.freeze({
    sirve: true,
    precioUnitario: importe / cantidad.valor,
    unidad: cantidad.unidad,
    dimension: cantidad.dimension,
    cantidad: cantidad.valor,
    motivo: null,
    porQue: `$${importe.toLocaleString('es-AR')} ÷ ${cantidad.valor} ${cantidad.unidad} (leído de «${cantidad.comoSeLee}» en el concepto)`,
    evidencia: evidenciaDe(fila),
  })
}

const evidenciaDe = (fila) => Object.freeze({
  tabla: 'public.compra_sheet',
  fila: fila.fila ?? null,
  fecha: fila.fecha ?? null,
  proveedor: fila.proveedor ?? null,
  concepto: String(fila.concepto ?? '').slice(0, 200),
  importe: fila.importe ?? null,
  comprobante: fila.comprobante ?? null,
})

/**
 * ¿ESTA COMPRA ES DE ESTE RECURSO? PURA. Devuelve `{casa, confianza, tokens, porQue}`.
 *
 * ═══ POR QUÉ EL LISTÓN ESTÁ ALTO ═══
 *
 * Este cruce decide de qué recurso es un precio. Equivocarlo no deja un hueco —deja un NÚMERO
 * PLAUSIBLE en el recurso equivocado, que es peor: el hueco se ve y el número equivocado no. Por eso
 * se exige que TODOS los tokens significativos del nombre del recurso aparezcan en el concepto, y no
 * que aparezca alguno. «CEMENTO PORTLAND» no casa con «Cemento Holcim x 25 kg» —falta «portland»— y
 * eso es correcto: son dos productos y pueden valer distinto.
 *
 * `confianza` es la fracción de tokens del CONCEPTO que el nombre explica: sirve para ordenar entre
 * varias compras que casan, no para bajar el listón.
 */
export function casaConRecurso({ nombreRecurso, concepto } = {}) {
  const delRecurso = tokens(nombreRecurso)
  const delConcepto = tokens(concepto)
  if (!delRecurso.length) return { casa: false, confianza: 0, tokens: [], porQue: `«${nombreRecurso}» no deja ningún token significativo con el que buscar` }
  if (!delConcepto.length) return { casa: false, confianza: 0, tokens: [], porQue: `«${concepto}» no deja ningún token significativo` }
  const texto = ` ${delConcepto.join(' ')} `
  const faltan = delRecurso.filter((w) => !texto.includes(` ${w} `))
  if (faltan.length) {
    return { casa: false, confianza: 0, tokens: delRecurso.filter((w) => !faltan.includes(w)), porQue: `el concepto no menciona ${faltan.map((f) => `«${f}»`).join(' ni ')}: puede ser otro producto` }
  }
  return {
    casa: true,
    confianza: delRecurso.length / delConcepto.length,
    tokens: delRecurso,
    porQue: `el concepto menciona ${delRecurso.map((t) => `«${t}»`).join(', ')} — los ${delRecurso.length} tokens del nombre del recurso`,
  }
}

/**
 * TODAS LAS COMPRAS DE UN RECURSO, CONVERTIDAS EN OBSERVACIONES DE PRECIO. PURA.
 *
 * Devuelve `{observaciones, descartes}`. Las observaciones vienen ordenadas de la más reciente a la
 * más vieja y sólo incluyen las que casan por nombre Y por dimensión de unidad: un precio por metro
 * cuadrado no se le puede aplicar a un recurso que se cotiza por metro cúbico, y convertir no existe.
 */
export function comprasDeRecurso({ recurso, filas = [] } = {}) {
  const observaciones = []
  const descartes = []
  for (const fila of filas) {
    const cruce = casaConRecurso({ nombreRecurso: recurso?.nombre, concepto: fila.concepto })
    if (!cruce.casa) continue   // no casa: no es un descarte de ESTE recurso, es otra compra
    const p = precioUnitarioPagado(fila)
    if (!p.sirve) { descartes.push({ motivo: p.motivo, porQue: p.porQue, evidencia: p.evidencia }); continue }
    if (recurso?.unidad && !mismaDimension(p.unidad, recurso.unidad)) {
      descartes.push({ motivo: 'UNIDAD_INCOMPATIBLE', porQue: `la compra está en ${p.unidad} y el recurso se cotiza en ${recurso.unidad}: miden cosas distintas`, evidencia: p.evidencia })
      continue
    }
    observaciones.push({
      precio: p.precioUnitario, unidad: p.unidad, observadoEn: String(fila.fecha ?? '').slice(0, 10),
      proveedor: fila.proveedor ?? null, confianza: cruce.confianza,
      porQue: `${p.porQue} · ${cruce.porQue}`, evidencia: p.evidencia,
    })
  }
  observaciones.sort((a, b) => String(b.observadoEn).localeCompare(String(a.observadoEn)) || b.confianza - a.confianza)
  return { observaciones, descartes }
}
