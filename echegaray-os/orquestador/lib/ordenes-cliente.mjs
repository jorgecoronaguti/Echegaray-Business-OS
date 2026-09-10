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

/**
 * EL MAPA CONTRA EL QUE SE HEREDA: clave → obra, armado sólo con los documentos que YA tienen obra.
 *
 * Cada documento entra por su número canónico («2-2173») y, si es una factura nuestra, por su
 * comprobante («A-1-225»). Y entra TAMBIÉN por su número corto («2173»), porque el papel se cita
 * como se habla: la OC 2256 dice «ADICIONAL OC 2173, CONSTRUCCION DEL TERCER MURO» y sin la clave
 * corta esa cita se leía como «no está en el OS» — un motivo falso, que es peor que no atribuir.
 *
 * LA CLAVE CORTA SE CAE SOLA CUANDO ES AMBIGUA: si dos órdenes de puntos de venta distintos
 * terminan en el mismo número y apuntan a obras distintas, «2173» deja de significar algo y se
 * borra. Heredar por una clave ambigua es exactamente la adivinanza que esto no hace.
 */
export function mapaDeEvidencia(docs) {
  const mapa = new Map()
  const cortas = new Map()
  for (const d of docs ?? []) {
    if (!d.obra_id) continue
    const canon = numeroCanonico(d.numero)
    if (canon) {
      mapa.set(canon, d.obra_id)
      const corta = canon.split('-').pop()
      if (corta !== canon) cortas.set(corta, cortas.has(corta) && cortas.get(corta) !== d.obra_id ? null : d.obra_id)
    }
    if (d.comprobante) mapa.set(d.comprobante, d.obra_id)
  }
  for (const [corta, obraId] of cortas) if (obraId && !mapa.has(corta)) mapa.set(corta, obraId)
  return mapa
}

/**
 * LA FECHA DE LA ORDEN, que no es la primera fecha del papel.
 *
 * MEDIDO el 10/09/2026 contra las cinco OC del bucket: las cinco quedaron fechadas «22/08/86». El
 * encabezado de Messina trae «Fecha Inicio Act. 22-08-86» —cuándo abrió la empresa— antes que la
 * fecha de la orden, que además viene con espacios adentro («Mendoza - 11 /08 /2026»). La primera
 * fecha que encontraba `extraerFecha` era la del año 1986 leído como 2086.
 *
 * Por eso se busca por ETIQUETA primero y sólo después a ciegas, y toda fecha fuera de una ventana
 * razonable se descarta: un documento administrativo de esta empresa no es de 2086 ni de 1986.
 */
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

// ── LA FACTURA NUESTRA NO ES UNA ORDEN DE COMPRA ────────────────────────────────────────────────
//
// MEDIDO el 10/09/2026: seis de las dieciséis filas de `cliente_orden` estaban guardadas como
// `orden_compra` y son FACTURAS A EMITIDAS POR NOSOTROS. Se colaron porque la regla de tipo mira el
// nombre del archivo («OC 02-00002162.pdf») y el detalle de la factura cita la OC que factura. El
// resultado era una pantalla que dibujaba dos órdenes de compra donde el cliente emitió una sola, y
// le atribuía a Messina un papel que Messina no firmó.
//
// LA EVIDENCIA QUE MANDA ES EL ENCABEZADO DEL PROPIO PDF, no el nombre ni la cita: si el documento
// dice «FACTURA A» y trae su «Comp. Nro», ES esa factura. Sigue siendo evidencia de la obra —cita
// la OC y describe el trabajo—, por eso no se descarta: cambia de clase.
export const TIPOS = Object.freeze(['orden_compra', 'orden_pago', 'retencion', 'factura', 'otro'])

/**
 * Qué es REALMENTE este documento, con el PDF ya leído. Devuelve `{ tipo, numero, cita }`:
 *   · `numero` de una factura es SU comprobante («A-1-225»), no el de la OC que cita — guardar ahí
 *     el número ajeno es lo que hacía que dos papeles distintos parecieran la misma orden;
 *   · `cita` es la OC que la factura nombra, en canónico. Es lo que deja el rótulo «Factura 225 ·
 *     cita OC 2162» y lo que ata la factura a la orden sin fingir que la reemplaza.
 * `null` cuando el PDF no se declara factura: no se fuerza nada y el tipo previo queda como está.
 */
export function facturaPropiaDe(texto) {
  const comprobante = comprobantePropio(texto)
  if (!comprobante) return null
  const citadas = ocsCitadas(texto)
  return { tipo: 'factura', numero: comprobante, cita: citadas.length === 1 ? citadas[0] : null }
}

/**
 * EL CAMINO INVERSO DE LA HERENCIA: clave de OC → obra, según los documentos que la CITAN.
 *
 * `mapaDeEvidencia` responde «¿qué obra tiene la OC que yo cito?». Ésta responde la otra mitad: la
 * factura nuestra describe el trabajo («Construccion de platea... PLAYON DE AZUFRE») y por eso el
 * OS le encuentra obra; la OC del cliente, en cambio, a veces sólo trae el código de centro de
 * costo. Sin este mapa, la obra que la factura ya probó no llegaba nunca a la OC que factura.
 *
 * Hasta el 10/09 esa herencia existía por accidente: la factura quedaba guardada con el número de
 * la OC y `agruparPorNumero` las juntaba como si fueran el mismo papel. Al separar los tipos eso
 * desaparece, y lo que era un efecto colateral pasa a ser una regla escrita y probada.
 *
 * DOS OBRAS PARA LA MISMA OC ⇒ LA CLAVE SE CAE. Dos facturas de obras distintas citando la misma OC
 * significa que la cita no distingue nada: heredar ahí sería sortear.
 */
export function mapaDeCitas(docs) {
  const mapa = new Map()
  for (const d of docs ?? []) {
    if (!d.obra_id) continue
    for (const c of d.citadas ?? []) {
      if (!/^\d/.test(c)) continue // los comprobantes («A-1-225») no son OC: no dan obra a nadie
      mapa.set(c, mapa.has(c) && mapa.get(c) !== d.obra_id ? null : d.obra_id)
    }
  }
  for (const [c, obraId] of [...mapa]) if (!obraId) mapa.delete(c)
  return mapa
}
