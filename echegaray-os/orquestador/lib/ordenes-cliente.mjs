// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LAS ÓRDENES QUE MANDA EL CLIENTE — el núcleo PURO. Sin Gmail, sin base, sin bucket.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// Una orden de compra del cliente es el documento que convierte un presupuesto en trabajo
// comprometido, y una orden de pago es la promesa de que ese trabajo se cobra. Hoy las dos viven
// como un adjunto en la casilla del dueño: nadie más las ve y nadie puede contar cuántas hay.
//
// Todo lo que decide algo —qué clase de documento es, de qué cliente vino, a qué obra pertenece,
// qué número y qué importe declara— vive ACÁ y es una función pura. El script que baja los mails
// sólo hace entrada/salida. El motivo es el de siempre: lo que decide tiene que poder dar rojo en
// `node --test` sin una casilla de correo del otro lado.

// ── QUIÉN ES CLIENTE, Y POR QUÉ NO ALCANZA EL DOMINIO ───────────────────────────────────────────
//
// El remitente NO identifica al cliente por sí solo: la mayoría de estas órdenes llegan REENVIADAS
// desde adentro (rodrigo@ecsas.com.ar reenvía la notificación de Messina). Por eso la resolución
// mira, en orden: el dominio del remitente, y si ese dominio es de la propia empresa, el texto del
// asunto/cuerpo. Un reenvío interno sin ninguna marca de cliente queda SIN CLIENTE, no adivinado.
export const CLIENTES = Object.freeze([
  { clave: 'messina', nombre: 'Messina', dominios: ['juanmessina.com.ar'], textos: ['messina', 'juan messina', 'bsa'] },
  { clave: 'arcor', nombre: 'ARCOR', dominios: ['arcor.com', 'arcor.com.ar'], textos: ['arcor'] },
  { clave: 'quattropani', nombre: 'Franco Quattropani', dominios: [], textos: ['quattropani'] },
  { clave: 'la-estrella', nombre: 'La Estrella', dominios: ['alimentosdelsur.com.ar'], textos: ['la estrella', 'alimentos del sur', 'palitos'] },
  { clave: 'san-francisco', nombre: 'Javier Sánchez - San Francisco - IMOTOR', dominios: ['imotor.com.ar'], textos: ['imotor', 'san francisco', 'javier sanchez', 'javier sánchez'] },
  { clave: 'mb', nombre: 'MB Emprendimientos', dominios: [], textos: ['mb emprendimientos'] },
])

/** Dominios propios: un remitente de acá NO es el cliente, es quien reenvió. */
export const DOMINIOS_PROPIOS = Object.freeze(['ecsas.com.ar'])

/** Minúsculas, sin tildes, espacios colapsados. La normalización de todo lo que se compara acá. */
export function norm(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
}

/** El mail pelado de un header From ("Isabel <i@x.com>" → "i@x.com"). '' si no hay. */
export function mailDe(from) {
  const m = String(from ?? '').match(/<([^>]+)>/)
  return norm(m ? m[1] : from).replace(/[<>]/g, '')
}

export function dominioDe(from) {
  const mail = mailDe(from)
  const i = mail.lastIndexOf('@')
  return i < 0 ? '' : mail.slice(i + 1)
}

/**
 * De qué CLIENTE es este mail. `{ clave, nombre, via }` o null.
 * `via` dice de dónde salió la atribución: 'remitente' (el dominio lo prueba) o 'texto' (se dedujo
 * del asunto/cuerpo de un reenvío interno). No es cosmético: un reenvío mal titulado es la única
 * forma de que esto se equivoque, y quien lea la tabla tiene que poder distinguirlo.
 */
export function clienteDelMail({ from = '', asunto = '', cuerpo = '' } = {}) {
  const dom = dominioDe(from)
  if (dom) {
    for (const c of CLIENTES) {
      if (c.dominios.some((d) => dom === d || dom.endsWith('.' + d))) return { clave: c.clave, nombre: c.nombre, via: 'remitente' }
    }
  }
  const propio = DOMINIOS_PROPIOS.some((d) => dom === d || dom.endsWith('.' + d))
  const heno = norm(`${asunto} ${cuerpo}`)
  // Sólo se cae al texto cuando el remitente es de casa o desconocido. Si el dominio es de un
  // tercero identificado (un proveedor), que el cuerpo nombre a Messina no lo vuelve de Messina.
  if (propio || !dom) {
    for (const c of CLIENTES) {
      if (c.textos.some((t) => heno.includes(norm(t)))) return { clave: c.clave, nombre: c.nombre, via: 'texto' }
    }
  }
  return null
}

// ── QUÉ CLASE DE PAPEL ES ───────────────────────────────────────────────────────────────────────
//
// El orden importa y no es alfabético: «orden de pago» gana sobre «orden de compra» porque la
// notificación de pago de Messina cita la OC que está pagando, y clasificarla como OC duplicaría
// la compra. Y las dos ganan sobre la sigla suelta: «OC» aparece dentro de palabras y de números
// de comprobante, así que la sigla exige borde de palabra y un dígito cerca.
const REGLAS_TIPO = Object.freeze([
  { tipo: 'orden_pago', re: /orden(?:es)? de pago|\bo\/p\b|notificacion de pago|payment order/ },
  { tipo: 'orden_compra', re: /orden(?:es)? de compra|\bo\/c\b|purchase order|purchase_order/ },
  { tipo: 'orden_pago', re: /\bop[\s._#:-]{0,2}\d{2,}/ },
  { tipo: 'orden_compra', re: /\boc[\s._#:-]{0,2}\d{2,}/ },
])

/**
 * Clasifica UN adjunto. Devuelve { tipo, señal } donde señal dice qué texto lo decidió.
 * `otro` es una respuesta legítima: un adjunto que llegó en el mismo mail y no es ninguna de las
 * dos cosas (el plano, la factura) no se fuerza a una categoría para que la tabla quede llena.
 */
export function clasificarAdjunto({ asunto = '', nombreArchivo = '', cuerpo = '', textoPdf = '' } = {}) {
  // El nombre del archivo y el asunto pesan más que el cuerpo: el cuerpo de un reenvío arrastra
  // toda la conversación anterior y ahí aparece cualquier palabra.
  const fuentes = [
    ['nombre', norm(nombreArchivo)],
    ['asunto', norm(asunto)],
    ['pdf', norm(textoPdf).slice(0, 1200)],
    ['cuerpo', norm(cuerpo).slice(0, 1200)],
  ]
  for (const { tipo, re } of REGLAS_TIPO) {
    for (const [fuente, texto] of fuentes) {
      if (texto && re.test(texto)) return { tipo, senal: fuente }
    }
  }
  return { tipo: 'otro', senal: null }
}

// ── EL NÚMERO, LA FECHA Y EL IMPORTE ────────────────────────────────────────────────────────────
//
// Se leen del PDF cuando el PDF los dice, y valen null cuando no. NUNCA se estima un importe: una
// orden con un importe inventado es peor que una orden sin importe.

/** Número de la orden: lo que sigue a la etiqueta. null si el texto no lo trae. */
export function extraerNumero(texto) {
  const t = String(texto ?? '')
  const patrones = [
    /orden\s+de\s+(?:compra|pago)\s*(?:n[°ºo.]*\s*)?[:#]?\s*([0-9][0-9._/-]{3,})/i,
    /\bo\/[cp]\s*(?:n[°ºo.]*\s*)?[:#]?\s*([0-9][0-9._/-]{3,})/i,
    /\b(?:oc|op)\s*[:#-]?\s*([0-9]{3,}[0-9._/-]*)/i,
  ]
  for (const re of patrones) {
    const m = t.match(re)
    if (m) return m[1].replace(/[._/-]+$/, '')
  }
  return null
}

/** Fecha en ISO (YYYY-MM-DD) leída como DD/MM/AAAA — locale es_AR, nunca MM/DD. null si no hay. */
export function extraerFecha(texto) {
  const m = String(texto ?? '').match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/)
  if (!m) return null
  const d = Number(m[1]); const mes = Number(m[2])
  let a = Number(m[3]); if (a < 100) a += 2000
  if (d < 1 || d > 31 || mes < 1 || mes > 12 || a < 2000 || a > 2100) return null
  return `${a}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * El importe MAYOR que declara el documento, y su moneda. El mayor y no el primero: una OC lista
 * ítems y el total es lo que compromete. Formato es_AR: el punto separa miles y la coma decimales.
 * Devuelve { importe, moneda } con importe null si el texto no trae ninguna cifra con formato de
 * dinero — un número suelto (un CUIT, un teléfono) no es un importe.
 */
export function extraerImporte(texto) {
  const t = String(texto ?? '')
  const moneda = /u\$s|usd|dolar|dólar/i.test(t) && !/\bars\b|\$\s*\d/.test(t.replace(/u\$s/gi, '')) ? 'USD' : 'ARS'
  let mejor = null
  // Exige separador de miles O decimales con coma: así una cifra tiene que PARECER dinero.
  for (const m of t.matchAll(/(?:\$|u\$s|ars|usd)?\s*(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{2})/gi)) {
    const v = Number(m[1].replace(/\./g, '').replace(',', '.'))
    if (Number.isFinite(v) && (mejor === null || v > mejor)) mejor = v
  }
  return { importe: mejor, moneda: mejor === null ? null : moneda }
}

// ── A QUÉ OBRA PERTENECE ────────────────────────────────────────────────────────────────────────

// Palabras que aparecen en casi toda obra y no distinguen ninguna. Sin esta lista, «ME - PISOS
// 120 M² Y RAMPA» y «SF - PISOS INDUSTRIALES» empatan por «pisos» y la orden va a la obra
// equivocada del cliente equivocado.
const VACIAS = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'y', 'para', 'con', 'obra', 'adicional', 'sf', 'me'])

/**
 * Los tokens que de verdad distinguen a una obra dentro de la cartera de su cliente.
 *
 * `nombreCliente` no es un adorno: en `obra_canonica` hay una obra llamada literalmente «Messina»,
 * y su único token es el nombre del cliente. Sin sacarlo, CUALQUIER mail de Messina caía en esa
 * obra —medido: la orden de «Clasificación de Escombros» y la de «Pisos Industriales» se fueron las
 * dos ahí— y la ficha mostraba órdenes bajo una obra que no las produjo. Una obra cuyo nombre es el
 * del cliente no distingue nada y queda sin tokens: no puede ganar.
 */
export function tokensDeObra(nombre, nombreCliente = '') {
  const delCliente = new Set(norm(nombreCliente).replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter(Boolean))
  return norm(nombre).replace(/[^a-z0-9² ]+/g, ' ').split(' ')
    .filter((w) => w.length >= 3 && !VACIAS.has(w) && !delCliente.has(w))
}

/**
 * A qué obra del cliente apunta este texto. `obras` es [{ id, nombre }] YA filtradas por cliente:
 * atribuir a una obra de otro cliente sería un error mayor que no atribuir.
 *
 * Gana la obra con MÁS tokens distintivos presentes en el texto, y sólo si gana sola. Un empate
 * devuelve null a propósito: entre dos obras posibles, la orden queda a nivel CLIENTE y una persona
 * decide. Ésa es la diferencia entre un dato y una adivinanza.
 */
export function resolverObraDeTexto(obras, texto, { nombreCliente = '' } = {}) {
  const heno = norm(texto).replace(/[^a-z0-9² ]+/g, ' ')
  const puntuadas = (obras ?? []).map((o) => {
    const toks = tokensDeObra(o.nombre, nombreCliente)
    if (!toks.length) return { obra: o, puntos: 0 }
    const hits = toks.filter((t) => heno.includes(t)).length
    // Se exige que estén TODOS los tokens distintivos, no la mayoría. «PLAYÓN DE AZUFRE» y
    // «PLAYÓN DILUCIÓN DE ÁCIDO» comparten «playon»: con mayoría, un mail que sólo dice «playón»
    // se lleva una de las dos por sorteo.
    return { obra: o, puntos: hits === toks.length ? toks.length : 0 }
  }).filter((x) => x.puntos > 0)
  if (!puntuadas.length) return null
  const max = Math.max(...puntuadas.map((x) => x.puntos))
  const ganadoras = puntuadas.filter((x) => x.puntos === max)
  if (ganadoras.length !== 1) return null
  return ganadoras[0].obra
}

// ── IDENTIDAD DEL DOCUMENTO ─────────────────────────────────────────────────────────────────────

/**
 * La clave con la que este adjunto es ÉL MISMO y no otro. Correr el script diez veces tiene que
 * dejar el mismo documento una vez: el par (mensaje, adjunto) es lo único estable que da Gmail —el
 * nombre del archivo se repite («OC.pdf») y el asunto también.
 *
 * OJO con `attachmentId`: Gmail lo regenera entre lecturas del mismo mensaje. Por eso la clave que
 * la base hace única es (message_id, nombre_archivo, tamano_bytes) y el attachment_id se guarda
 * sólo como rastro. Sin esto, la segunda corrida duplicaría todo sin violar ninguna restricción.
 */
export function claveDocumento({ messageId, nombreArchivo, tamanoBytes }) {
  return `${messageId}::${norm(nombreArchivo)}::${tamanoBytes ?? 0}`
}

/** Extensión segura para el nombre del objeto en el bucket. Sin extensión ⇒ 'bin'. */
export function extensionDe(nombreArchivo) {
  const m = String(nombreArchivo ?? '').match(/\.([a-z0-9]{1,8})$/i)
  return m ? m[1].toLowerCase() : 'bin'
}
