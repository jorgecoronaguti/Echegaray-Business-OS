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
  // `n[°ºor.]*` incluye la r de «Nro.»: la orden de pago de Messina se rotula «ORDEN DE PAGO Nro.:
  // 0000000004865» y sin esa letra el PDF que trae el número quedaba sin número.
  // El primer grupo alternativo admite el ESPACIO adentro del número («OC 02- 00002162»): así lo
  // parte el PDF de nuestra propia factura, y comparar sin él daba dos órdenes donde hay una.
  const NUM = '(\\d{1,5}\\s*-\\s*\\d{3,10}|\\d{3,})'
  const patrones = [
    new RegExp(`orden\\s+de\\s+(?:compra|pago)\\s*(?:n[°ºor.]*\\s*)?[:#]?\\s*${NUM}`, 'i'),
    new RegExp(`\\bo\\/[cp]\\s*(?:n[°ºor.]*\\s*)?[:#]?\\s*${NUM}`, 'i'),
    new RegExp(`\\b(?:oc|op)\\s*(?:n[°ºor.]*\\s*)?[:#-]?\\s*${NUM}`, 'i'),
  ]
  for (const re of patrones) {
    const m = t.match(re)
    if (m) return m[1].replace(/\s+/g, '').replace(/[._/-]+$/, '')
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

// ── IDENTIDAD DE LA ORDEN: EL NÚMERO CANÓNICO ───────────────────────────────────────────────────
//
// El mismo número de orden se escribe de tres formas según quién lo teclee: Messina emite
// «00002-00002162», su propia notificación de pago cita «OC 02- 00002162» (con el espacio adentro)
// y la factura que le mandamos dice «OC: 02-00002097». Comparar los tres como cadenas da tres
// órdenes distintas, y por eso la OC 2162 entró dos veces en `cliente_orden`: llegó en dos mails.
//
// El canónico tira los ceros a la izquierda de cada tramo y se queda con los dígitos: «2-2162».
// No sirve para mostrar —eso es `numeroCorto`— sino para decir «esto ya lo tengo».
export function numeroCanonico(numero) {
  const tramos = String(numero ?? '').match(/\d+/g)
  if (!tramos) return null
  const limpios = tramos.map((t) => t.replace(/^0+/, '') || '0').filter((t) => t !== '0')
  return limpios.length ? limpios.join('-') : null
}

/** Lo que se DIBUJA: el último tramo sin ceros. «00002-00002162» → «2162». La fila de una obra
 *  tiene 80px para esto y «00002-00002162» los gasta sin decir nada que el 2162 no diga. */
export function numeroCorto(numero) {
  const canon = numeroCanonico(numero)
  return canon ? canon.split('-').pop() : null
}

/** Todos los números de OC que este texto CITA, en canónico y sin repetir. Es lo que convierte una
 *  factura nuestra («Limpieza de Escombros Embolsado OC 02- 00002162») en evidencia de qué obra es
 *  esa OC, y lo que deja a una orden de pago colgada de la OC que paga. */
export function ocsCitadas(texto) {
  const t = String(texto ?? '')
  const salida = new Set()
  for (const m of t.matchAll(/\bo\/?c\s*(?:n[°ºo.]*)?\s*[:#-]?\s*(\d{1,5}\s*-\s*\d{3,10}|\d{4,10})/gi)) {
    const canon = numeroCanonico(m[1])
    if (canon) salida.add(canon)
  }
  return [...salida]
}

/**
 * El comprobante que este PDF ES (una factura nuestra) o los que CITA (una orden de pago).
 *
 * Messina no cita la OC en su orden de pago: cita la FACTURA («FAC A0000100000225»). La cadena
 * completa es entonces OP → factura → OC → obra, y sin este eslabón la OP se queda sin obra aunque
 * la evidencia esté escrita. Devuelve claves «A-1-225».
 */
export function comprobantesCitados(texto) {
  const salida = new Set()
  for (const m of String(texto ?? '').matchAll(/\bfac\.?\s*([abcm])\s*(\d{4,5})(\d{8})\b/gi)) {
    salida.add(`${m[1].toUpperCase()}-${Number(m[2])}-${Number(m[3])}`)
  }
  return [...salida]
}

/** El comprobante que este PDF es, leído de su propio encabezado. null si no es una factura. */
export function comprobantePropio(texto) {
  const t = String(texto ?? '')
  const letra = t.match(/factura\s+([abcm])\b/i)
  const nro = t.match(/comp\.?\s*n(?:ro|°|º)\.?:?\s*(\d{4,5})\s+(\d{6,8})/i)
  if (!letra || !nro) return null
  return `${letra[1].toUpperCase()}-${Number(nro[1])}-${Number(nro[2])}`
}

// ── ATRIBUIR SIN ADIVINAR ───────────────────────────────────────────────────────────────────────

/**
 * A qué obra pertenece un documento que no la nombra, según los DEMÁS documentos ya atribuidos.
 *
 * `citadas` son las claves que este documento cita (números de OC canónicos o comprobantes) y
 * `obraPorClave` el mapa que arman los documentos que sí tienen obra. Devuelve
 * `{ obraId, porque }` o `{ obraId: null, porque }` — el motivo se escribe SIEMPRE, también cuando
 * no se pudo: una lista de nueve órdenes sin obra y sin motivo no le sirve a nadie para decidir.
 *
 * DOS OBRAS DISTINTAS ⇒ NADA. Una orden de pago que cancela tres facturas de tres obras no
 * pertenece a una de las tres: repartirla sería inventar. Queda a nivel cliente y se dice por qué.
 */
export function obraPorReferencia(citadas, obraPorClave) {
  const halladas = new Map()
  const sinRastro = []
  for (const c of citadas ?? []) {
    const obra = obraPorClave.get(c)
    if (obra) halladas.set(obra, [...(halladas.get(obra) ?? []), c])
    else sinRastro.push(c)
  }
  if (!citadas?.length) return { obraId: null, porque: 'el PDF no cita ninguna OC ni comprobante' }
  if (halladas.size === 1) {
    const [obraId, claves] = [...halladas.entries()][0]
    return { obraId, porque: `hereda la obra de ${claves.join(', ')}` }
  }
  if (halladas.size > 1) {
    return { obraId: null, porque: `cita ${citadas.join(', ')} y caen en ${halladas.size} obras distintas` }
  }
  return { obraId: null, porque: `cita ${sinRastro.join(', ')}, que no está en el OS` }
}

/**
 * UNA SOLA FILA POR ORDEN. Agrupa por (tipo, número canónico) y devuelve un grupo por orden real,
 * con todas sus filas adentro: la OC 2162 llegó dos veces —la orden que emitió Messina y la
 * factura nuestra que la cita— y son dos papeles de UNA orden, no dos órdenes.
 *
 * Las filas SIN número no se agrupan entre sí: dos documentos sin número no son el mismo documento,
 * y unirlos por «ninguno de los dos tiene número» sería el peor de los inventos.
 */
export function agruparPorNumero(filas) {
  const grupos = new Map()
  const salida = []
  for (const f of filas ?? []) {
    const canon = numeroCanonico(f.numero)
    const clave = canon ? `${f.tipo}::${canon}` : null
    if (clave && grupos.has(clave)) { grupos.get(clave).filas.push(f); continue }
    const g = { clave: clave ?? `sola::${f.id}`, tipo: f.tipo, numero: f.numero, filas: [f] }
    if (clave) grupos.set(clave, g)
    salida.push(g)
  }
  return salida
}
