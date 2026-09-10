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

// EL CATÁLOGO DE CLIENTES (dominios, textos, patrones de archivo) y la resolución de «de quién es
// este papel» VIVEN EN `ordenes-atribucion.mjs`. Acá quedó lo que el documento DICE de sí mismo.
//
// Y lo que relaciona VARIOS papeles entre sí —número canónico, citas, herencia de obra— vive en
// `ordenes-identidad.mjs`.
import { numeroCanonico } from './ordenes-identidad.mjs'

/** Minúsculas, sin tildes, espacios colapsados. La normalización de todo lo que se compara acá. */
export function norm(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * El mail pelado de un header From ("Isabel <i@x.com>" → "i@x.com"). '' si no hay.
 *
 * EL PRIMER `<…>` NO ES SIEMPRE LA DIRECCIÓN. MEDIDO el 10/09/2026 sobre 68 mensajes de
 * Saint-Gobain: el header es `"Saint-Gobain <No-Reply>" <SG.AR.SAP@saint-gobain.com>` — el nombre
 * para mostrar TRAE ángulos adentro de las comillas. Tomando el primero salía `no-reply`, sin
 * arroba, y el dominio quedaba vacío: 68 órdenes de compra de un cliente conocido caían en «sin
 * cliente identificable», que se lee igual que «no hay nada de este emisor».
 *
 * Se exige la arroba y se toma el ÚLTIMO paréntesis angular que la tenga, que es donde la pone
 * cualquier cliente de correo.
 */
export function mailDe(from) {
  const crudo = String(from ?? '')
  const conArroba = [...crudo.matchAll(/<([^<>]*@[^<>]*)>/g)]
  if (conArroba.length) return norm(conArroba[conArroba.length - 1][1])
  return norm(crudo).replace(/[<>]/g, '')
}

export function dominioDe(from) {
  const mail = mailDe(from)
  const i = mail.lastIndexOf('@')
  return i < 0 ? '' : mail.slice(i + 1)
}

// ── QUÉ CLASE DE PAPEL ES ───────────────────────────────────────────────────────────────────────
//
// El orden importa y no es alfabético: «orden de pago» gana sobre «orden de compra» porque la
// notificación de pago de Messina cita la OC que está pagando, y clasificarla como OC duplicaría
// la compra. Y las dos ganan sobre la sigla suelta: «OC» aparece dentro de palabras y de números
// de comprobante, así que la sigla exige borde de palabra y un dígito cerca.
//
// ═══ LA RETENCIÓN NO ES UNA ORDEN DE PAGO, Y POR ESO VA PRIMERA ═══
//
// MEDIDO el 10/09/2026 sobre `cliente_orden`: la OP 4865 y la OP 5156 tienen DOS filas cada una. La
// segunda de cada par es el certificado de retención que Messina manda junto con el pago
// (`O_P_0000000004865_G00002208.pdf`): cita el número de la orden, no trae importe propio, y la
// clasificación lo leía como la misma orden de pago. El resultado era una cartera que declaraba dos
// pagos donde hubo uno — un error sobre plata cobrada, no un detalle de archivo.
//
// Un certificado de retención es un comprobante FISCAL (SICORE, ganancias, IVA, IIBB): prueba un
// impuesto retenido, no una promesa de cobro. Tiene su propio tipo, su propio número, y nunca suma
// en la columna de lo que el cliente ordenó pagar.
//
// LAS SEÑALES SON FUERTES A PROPÓSITO. Una orden de pago LISTA sus retenciones en el detalle, así
// que la palabra «retención» suelta no alcanza y clasificarla por ella daría vuelta el error: todas
// las OP pasarían a ser retenciones. Se exige el rótulo del certificado, el régimen, o la marca
// `_G<número>` del nombre con que el sistema de Messina los emite.
const REGLAS_TIPO = Object.freeze([
  { tipo: 'retencion', re: /_g\d{5,}(?:\.[a-z0-9]+)?$/, fuentes: ['nombre'] },
  { tipo: 'retencion', re: /(?:certificado|constancia|comprobante)\s+(?:de\s+)?retencion|\bsicore\b|regimen de retencion|retenciones? sufridas?/ },
  { tipo: 'orden_pago', re: /orden(?:es)? de pago|\bo\/p\b|notificacion de pago|payment order/ },
  { tipo: 'orden_compra', re: /orden(?:es)? de compra|\bo\/c\b|purchase order|purchase_order|generacion oc/ },
  // Los dos nombres de archivo con los que ARCOR emite. No traen ninguna palabra: «6A_50123456.PDF»
  // es una orden de compra y «00001_5000123_OP.PDF» una orden de pago, y sin esto quedaban en
  // `otro` aunque el asunto del mail lo dijera en otro idioma.
  { tipo: 'orden_compra', re: /^6a_\d{6,}\.pdf$/, fuentes: ['nombre'] },
  { tipo: 'orden_pago', re: /^\d{4,6}_\d{3,}_op\.pdf$/, fuentes: ['nombre'] },
  { tipo: 'orden_pago', re: /\bop[\s._#:-]{0,2}\d{2,}/ },
  { tipo: 'orden_compra', re: /\boc[\s._#:-]{0,2}\d{2,}/ },
])

/**
 * Clasifica UN adjunto. Devuelve { tipo, señal } donde señal dice qué texto lo decidió.
 * `otro` es una respuesta legítima: un adjunto que llegó en el mismo mail y no es ninguna de las
 * dos cosas (el plano, la factura) no se fuerza a una categoría para que la tabla quede llena.
 *
 * Una regla puede acotar de qué FUENTES acepta evidencia. Las que miran la forma del nombre de
 * archivo lo hacen: `_G00002208` dentro del texto de un PDF cualquiera no prueba nada.
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
  for (const regla of REGLAS_TIPO) {
    for (const [fuente, texto] of fuentes) {
      if (regla.fuentes && !regla.fuentes.includes(fuente)) continue
      if (texto && regla.re.test(texto)) return { tipo: regla.tipo, senal: fuente }
    }
  }
  return { tipo: 'otro', senal: null }
}

/**
 * EL NÚMERO DE UN CERTIFICADO DE RETENCIÓN ES EL SUYO, NO EL DE LA ORDEN QUE ACOMPAÑA.
 *
 * `O_P_0000000004865_G00002208.pdf` nombra dos cosas: la orden de pago 4865 y el certificado
 * G00002208. `extraerNumero` devolvía la primera, y por eso el certificado quedaba guardado con el
 * número de la orden y la pantalla mostraba la OP 4865 dos veces. El certificado se identifica por
 * su propio comprobante; sin él, dos papeles distintos comparten identidad.
 *
 * Devuelve `null` cuando el papel no declara su número: el tipo sigue siendo `retencion` y la fila
 * queda sin número, que es la verdad.
 */
export function numeroDeRetencion({ nombreArchivo = '', textoPdf = '' } = {}) {
  const delNombre = String(nombreArchivo).match(/_g(\d{5,})(?:\.[a-z0-9]+)?$/i)
  if (delNombre) return `G${delNombre[1]}`
  const delTexto = String(textoPdf).match(/(?:certificado|comprobante|constancia)\s*(?:n[°ºro.]*)?\s*[:#-]?\s*(\d{6,})/i)
  return delTexto ? delTexto[1] : null
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

/**
 * EL NÚMERO QUE EL EMISOR PUSO EN EL NOMBRE DEL ARCHIVO. null si el nombre no lo declara.
 *
 * MEDIDO el 10/09/2026 sobre las órdenes de ARCOR: `6A_53049655.PDF` quedó guardada con el número
 * 53031073 —el de OTRA orden, citada adentro del PDF como antecedente— y `00001_966878_OP.PDF`
 * quedó sin número. Los dos son peores que un hueco: un número ajeno hace que dos órdenes distintas
 * se vean como la misma, y sin número la orden no se puede identificar ni deduplicar.
 *
 * El sistema que emite escribe SU número en el nombre, y eso es una declaración del emisor sobre el
 * documento — más fuerte que rastrear dígitos en el cuerpo, donde conviven el número propio, los
 * ajenos y los códigos de artículo. Sólo se aceptan las formas que un emisor conocido produce:
 *
 *   6A_53049655.PDF              orden de compra de ARCOR
 *   00001_966878_OP.PDF          orden de pago de ARCOR
 *   00001_24034724_$I.PDF        certificado de retención de ARCOR ($G ganancias, $I IVA, $B IIBB)
 *
 * Messina NO está: escribe `OC_32_0000200002097.pdf`, donde el punto de venta y el número van
 * pegados y partirlos sería adivinar dónde termina uno. Ahí manda el PDF, que los separa.
 */
const NUMERO_EN_NOMBRE = Object.freeze([
  /^6[a-z]_(\d{6,})\.pdf$/i,
  /^\d{4,6}_(\d{4,})_op\.pdf$/i,
  /^\d{4,6}_(\d{4,})_\$[a-z](?:_[\w-]+)*\.pdf$/i,
])

export function numeroDeNombreArchivo(nombreArchivo) {
  const n = String(nombreArchivo ?? '')
  for (const re of NUMERO_EN_NOMBRE) {
    const m = n.match(re)
    if (m) return m[1]
  }
  return null
}

/**
 * ¿ESTE ARCHIVO ES UN COMPROBANTE QUE EMITIMOS NOSOTROS? Devuelve su número o null.
 *
 * `30716304643_201_00001_00000006.pdf`: CUIT del emisor, tipo de comprobante, punto de venta,
 * número. Es el nombre con que ARCA entrega todo comprobante electrónico, y el mismo patrón que
 * `src/app/portal/papeles.ts` ya usa para reconocer una factura nuestra.
 *
 * MEDIDO: ese archivo entró como `orden_compra` de ARCOR con el número de la OC que factura, porque
 * el encabezado dice «FACTURA DE CREDITO ELECTRONICA MiPyME» y `comprobantePropio` sólo reconoce
 * «FACTURA A». Una factura nuestra publicada como orden del cliente le atribuye a ARCOR un
 * compromiso que ARCOR no firmó.
 *
 * `cuitPropio` se recibe —no se cablea— porque quién es «nosotros» ya está definido en el OS.
 */
export function comprobanteDelNombre(nombreArchivo, cuitPropio) {
  const m = String(nombreArchivo ?? '').match(/^(\d{11})_(\d{3})_(\d{4,5})_(\d{6,8})\./)
  if (!m || m[1] !== String(cuitPropio ?? '').replace(/\D/g, '')) return null
  return `${Number(m[3])}-${Number(m[4])}`
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
 * EN QUÉ LOCALE ESTÁ ESCRITO EL DINERO DE ESTE DOCUMENTO: 'US' o 'AR'.
 *
 * MEDIDO el 10/09/2026 sobre las cinco OC de Messina en el bucket: el sistema que las emite imprime
 * en formato norteamericano —«Total :$ 78,650,000.00», y el precio unitario como «$ 000000.0000»—
 * mientras que el resto de los papeles de la empresa (nuestras facturas A) vienen en es_AR. Leer
 * los dos con la misma regla es lo que dejó la OC 2173 guardada por $ 78,65: el patrón `\d+,\d{2}`
 * de es_AR agarró «78,65» de «78,650,000.00» y lo llamó importe.
 *
 * NO SE MIRA EL EMISOR NI EL NOMBRE DEL ARCHIVO: se mira el PATRÓN, que es lo que el documento
 * declara de sí mismo. Un token con LOS DOS separadores prueba el locale solo —el último que
 * aparece es el decimal—, y cuatro decimales detrás de un punto también, porque un separador de
 * miles agrupa de a tres exactos y nunca de a cuatro.
 *
 * Ante un documento sin ninguna evidencia (una cifra sin separadores, o ninguna cifra) devuelve
 * 'AR': es el locale de la empresa y el que esta función tenía cableado antes de existir.
 */
export function formatoNumerico(texto) {
  const t = String(texto ?? '')
  const us = (t.match(/\d{1,3}(?:,\d{3})+\.\d+/g) ?? []).length + (t.match(/\d+\.\d{4}(?!\d)/g) ?? []).length
  const ar = (t.match(/\d{1,3}(?:\.\d{3})+,\d+/g) ?? []).length + (t.match(/\d+,\d{4}(?!\d)/g) ?? []).length
  return us > ar ? 'US' : 'AR'
}

/**
 * El importe MAYOR que declara el documento, y su moneda. El mayor y no el primero: una OC lista
 * ítems y el total es lo que compromete. El locale lo decide `formatoNumerico` sobre el MISMO
 * texto, salvo que se lo fuercen: nunca se asume es_AR porque la empresa sea argentina.
 *
 * Devuelve { importe, moneda } con importe null si el texto no trae ninguna cifra con formato de
 * dinero — un número suelto (un CUIT, un teléfono) no es un importe.
 */
export function extraerImporte(texto, { formato } = {}) {
  const t = String(texto ?? '')
  const loc = formato ?? formatoNumerico(t)
  const moneda = /u\$s|usd|dolar|dólar/i.test(t) && !/\bars\b|\$\s*\d/.test(t.replace(/u\$s/gi, '')) ? 'USD' : 'ARS'
  // Exige separador de miles O decimales: así una cifra tiene que PARECER dinero. Las dos ramas son
  // simétricas — sólo se intercambian el punto y la coma — y por eso van armadas del mismo molde:
  // dos expresiones escritas a mano se habrían separado en el primer arreglo.
  const [miles, dec] = loc === 'US' ? [',', '.'] : ['.', ',']
  const esc = (c) => (c === '.' ? '\\.' : c)
  const re = new RegExp(
    `(?:\\$|u\\$s|ars|usd)?\\s*(\\d{1,3}(?:${esc(miles)}\\d{3})+(?:${esc(dec)}\\d{1,4})?|\\d+${esc(dec)}\\d{2,4})`, 'gi',
  )
  let mejor = null
  for (const m of t.matchAll(re)) {
    const crudo = m[1].split(miles).join('').replace(dec, '.')
    const v = Number(crudo)
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
/**
 * ¿ESTE TOKEN ESTÁ EN EL TEXTO? Con el plural, que es la MISMA palabra.
 *
 * MEDIDO el 10/09/2026 sobre `OC_32_0000200002226.pdf`: la orden dice «Observaciones: RAMPA PARA
 * PISO 120 M2» y también «C.COSTO: 010109 DETALLE: PLAYON AZUFRE». La obra «ME - PISOS 120 M² Y
 * RAMPA» aportaba los tokens `pisos`, `120` y `rampa`, y `pisos` no está en «PISO 120»: la obra
 * quedaba con CERO puntos y la orden se fue a «ME - PLAYÓN DE AZUFRE», que sí tenía sus dos.
 *
 * El nombre de la obra dice «PISOS» y el papel dice «PISO». Es la misma palabra, y tratarlas como
 * distintas convirtió una coincidencia de tres tokens en una de ninguno. Se acepta la forma sin la
 * «s» final, y sólo desde cuatro caracteres: con menos, quitar una letra empareja cualquier cosa.
 */
function presente(token, heno) {
  if (heno.includes(token)) return true
  return token.length >= 4 && token.endsWith('s') && heno.includes(token.slice(0, -1))
}

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
    const hits = toks.filter((t) => presente(t, heno)).length
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

/**
 * ¿EL DOCUMENTO ROTULA SU FECHA, Y ESE RÓTULO SE PUDO LEER?
 * `'entera'` · `'truncada'` (el año quedó en un dígito al extraer el texto) · `null` (no rotula).
 */
export function fechaRotulada(texto) {
  const t = String(texto ?? '').replace(/\s*([/-])\s*/g, '$1')
  const m = t.match(/\bfecha\s*:?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{1,4})/i)
  if (!m) return null
  return /[/-]\d{2,4}$/.test(m[1]) ? 'entera' : 'truncada'
}

/**
 * QUÉ ORDEN DE PAGO PRUEBA ESTE CERTIFICADO DE RETENCIÓN. Número canónico, o null.
 *
 * El certificado lo dice dos veces y las dos sirven: en su texto («O/P : 0000000000730») y en el
 * nombre con que Messina lo emite (`O_P_0000000000730_G00000347.pdf`). Es el eslabón que le devuelve
 * la fecha a una orden de pago cuyo rótulo vino roto — la misma fecha, escrita entera, en el papel
 * que el cliente emitió por el mismo pago.
 */
export function ordenDePagoDeLaRetencion({ nombreArchivo = '', textoPdf = '' } = {}) {
  const delNombre = String(nombreArchivo).match(/^o_?p_?(\d{5,})_g\d+/i)
  if (delNombre) return numeroCanonico(delNombre[1])
  const delTexto = String(textoPdf).match(/\bo\s*\/\s*p\s*:?\s*(\d{5,})/i)
  return delTexto ? numeroCanonico(delTexto[1]) : null
}

export function extraerFechaDeOrden(texto, { hoy = new Date() } = {}) {
  const t = String(texto ?? '')
  const FECHA = String.raw`(\d{1,2}\s*[/-]\s*\d{1,2}\s*[/-]\s*\d{2,4})`
  const etiquetadas = [
    new RegExp(String.raw`fecha\s+de\s+emisi[oó]n\s*:?\s*${FECHA}`, 'i'),
    new RegExp(String.raw`orden\s+de\s+(?:compra|pago)[^\n]{0,60}?-\s*${FECHA}`, 'i'),
    new RegExp(String.raw`\bfecha\s*:?\s*${FECHA}`, 'i'),
  ]
  const candidatas = []
  for (const re of etiquetadas) {
    const m = t.match(re)
    if (m) candidatas.push(m[1])
  }
  // ═══ LA ETIQUETA ROTA NO SE REEMPLAZA POR OTRA FECHA ═══
  //
  // MEDIDO el 10/09/2026 sobre `O_P_0000000000730.pdf`: la capa de texto trae «Fecha : 25/09/2» —
  // el año se cortó al extraer. El papel además contiene «24/09/2024» (vencimiento de la factura
  // que paga) y «27/09/2024» (fecha del cheque). El rastreo a ciegas devolvía el 24, y el 24 no es
  // la fecha de la orden de pago: es la de OTRO hecho. Un dato equivocado con cara de dato es peor
  // que un hueco declarado, así que acá se corta: si el documento SÍ rotula su fecha y ese rótulo
  // vino roto, la función contesta null y el llamador la busca donde está escrita entera —el
  // certificado de retención de la misma O/P—.
  if (!candidatas.length && fechaRotulada(t) === 'truncada') return null
  // A CIEGAS, PERO TODAS LAS FECHAS DEL PAPEL Y EN ORDEN, no sólo la primera.
  //
  // Hasta el 10/09/2026 acá se empujaba el texto entero y `extraerFecha` devolvía su PRIMER match:
  // si esa fecha caía fuera de la ventana —«Fecha Inicio Act. 22-08-86»— la función devolvía null
  // aunque la fecha buena estuviera tres palabras más adelante. Que las cinco OC del bucket se
  // salvaran era un accidente del orden en que ese PDF derrama el encabezado, y el orden en que un
  // PDF derrama su encabezado no es un criterio: el mismo emisor con otra plantilla dejaba la orden
  // sin fecha. Los espacios se sacan antes porque Messina imprime «11 /08 /2026».
  const plano = t.replace(/\s*([/-])\s*/g, '$1')
  for (const m of plano.matchAll(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g)) candidatas.push(m[0])
  const anio = hoy.getFullYear()
  for (const c of candidatas) {
    const iso = extraerFecha(String(c).replace(/\s*([/-])\s*/g, '$1'))
    if (!iso) continue
    const a = Number(iso.slice(0, 4))
    if (a >= 2015 && a <= anio + 1) return iso
  }
  return null
}

/** `true` cuando la fecha guardada no puede ser de este documento: fuera de la ventana razonable.
 *  Es lo único que el re-atribuidor tiene derecho a PISAR — no corrige lo que una persona eligió,
 *  corrige lo que un parser leyó mal y quedó escrito como si fuera un hecho. */
export function fechaImposible(fecha, { hoy = new Date() } = {}) {
  if (!fecha) return false
  const a = Number(String(fecha).slice(0, 4))
  return !Number.isFinite(a) || a < 2015 || a > hoy.getFullYear() + 1
}
