// CONTESTAR ESCRIBIENDO — la puerta que faltaba. NÚCLEO PURO, CERO MODELO, CERO SQL.
//
// ═══ EL DEFECTO (04/08) ═══
//
// El mensaje del fajo termina con esta frase, textual:
//
//     «**No hay nada que cargar todavía.** Tocá la obra —o escribime otra— y lo cargo.»
//
// «Escribime otra» NUNCA funcionó. `especialistas/comprobantes.mjs` reclamaba **sólo** posts CON
// adjuntos; una respuesta de texto en el hilo no la reclamaba nadie, el Director no sabía a quién
// derivarla y el dueño recibía el catálogo de capacidades como respuesta a haber escrito "MESSINA".
// El bot pedía un dato, la persona lo daba, y el bot contestaba con un menú de otra cosa. Ese es
// exactamente el «la experiencia es confusa y no es certera» del pedido.
//
// Es la trampa número uno de este subsistema: **el Director decide antes que el router**. La
// capacidad de aplicar la obra existía y estaba bien (`aplicarOpcion`), pero el mensaje jamás le
// llegaba.
//
// ═══ QUÉ RECLAMA, Y POR QUÉ TAN POCO ═══
//
// Sólo la respuesta a lo que el bot MISMO dejó abierto, y sólo cuando el texto se resuelve contra
// **las opciones que él mismo ofreció**. Un especialista que se cree dueño de todo le roba mensajes a
// los demás: si alguien escribe "che, mañana pago a Barcelo" con un fajo abierto, acá no matchea
// nada y el mensaje sigue su camino intacto.
//
// ═══ NO SE ADIVINA ═══
//
// Un texto que empata con dos obras distintas NO elige una: devuelve `ambiguo` con las dos, y el bot
// repregunta nombrándolas. Imputar a la obra equivocada ensucia el margen de las dos obras, y es un
// error que después nadie encuentra.
//
// ═══ UNA RESPUESTA VALE PARA TODO EL FAJO ═══
//
// Cinco fotos del mismo proveedor, un solo "MESSINA": se aplica a los cinco. Preguntar cinco veces lo
// mismo es la definición de la experiencia que el dueño rechazó. Se aplica a todos los ítems donde
// esa opción ESTABA OFRECIDA — nunca a uno donde no se ofreció, que sería inventarle una imputación.

import { opcionesDe, opcionesDelDesplegable, imputacionPendiente, indiceDuplicadoAbierto, indiceClaseAbierta } from './fajo.mjs'
import { faltantesDe, MOTIVO, POLITICA } from './faltantes.mjs'

/** Techo de largo de la respuesta. Un nombre de obra es corto; un párrafo es otra conversación. */
export const MAX_LARGO = 120

export const RESPUESTA = Object.freeze({
  OPCION: 'opcion',
  AMBIGUO: 'ambiguo',
  DESCARTAR: 'descartar',
  DUPLICADO: 'duplicado',
  CLASE: 'clase',
  // 29/09/2026: el bot preguntó la fecha y «fecha de ayer» no la entendía nadie.
  FECHA: 'fecha',
  // Es una respuesta DENTRO del hilo de la pregunta que no se pudo interpretar: se repregunta.
  NO_ENTENDIDA: 'no_entendida',
  // 03/10/2026, el recibo del sereno: «¿a quién se le pagó?» y «¿de cuánto es?», contestados escribiendo.
  PROVEEDOR: 'proveedor',
  IMPORTE: 'importe',
})

// ═══ LA FECHA, CONTESTADA ESCRIBIENDO (29/09/2026) ═══
//
// El bot pregunta «no pude leer la fecha» y la respuesta natural es «de ayer», «28/09», «el 25 de
// septiembre». Se interpreta sólo cuando algún ítem tiene la fecha como faltante, contra el día de hoy
// en Argentina, y nunca devuelve una fecha futura o imposible: un dato inventado es peor que uno vacío.

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** Y/M/D de hoy en San Juan (UTC-3 fijo), sin depender de la zona de la máquina. */
function hoyAR(ahora) {
  const d = new Date((ahora instanceof Date ? ahora : new Date(ahora ?? Date.now())).getTime() - 3 * 3600_000)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() }
}
const utc = ({ y, m, d }) => Date.UTC(y, m - 1, d)
const dd = (n) => String(n).padStart(2, '0')

function armar(y, m, d, hoy) {
  const t = new Date(Date.UTC(y, m - 1, d))
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null   // 31/02
  if (y < 2000 || t.getTime() > utc(hoy)) return null                                                 // futura
  return `${dd(d)}/${dd(m)}/${y}`
}

/** «DD/MM/AAAA» o null. `t` ya viene en `plano`. */
export function interpretarFecha(t, { ahora } = {}) {
  const hoy = hoyAR(ahora)
  const s = String(t ?? '').replace(/^((la|es|fue|era|del|de|el|dia|fecha|factura|emitida|emitio|seria)\s+)+/, '').trim()
  const rel = (dias) => { const x = new Date(utc(hoy) - dias * 86400_000); return armar(x.getUTCFullYear(), x.getUTCMonth() + 1, x.getUTCDate(), hoy) }
  if (s === 'hoy') return rel(0)
  if (s === 'ayer') return rel(1)
  if (s === 'anteayer' || s === 'antes de ayer' || s === 'antesdeayer') return rel(2)
  let m = s.match(/^(\d{1,2})[ /-](\d{1,2})(?:[ /-](\d{2}|\d{4}))?$/)
  if (m) {
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : hoy.y
    return armar(y, Number(m[2]), Number(m[1]), hoy)
  }
  m = s.match(/^(\d{1,2}) de ([a-z]+)(?: de (\d{4}))?$/)
  if (m) {
    const mes = MESES.indexOf(m[2] === 'setiembre' ? 'septiembre' : m[2]) + 1
    if (mes) return armar(m[3] ? Number(m[3]) : hoy.y, mes, Number(m[1]), hoy)
  }
  m = s.match(/^(\d{1,2})$/)   // «el 25»: ese día de este mes, o del anterior si todavía no llegó
  if (m && t.startsWith('el ')) {
    const d = Number(m[1])
    return armar(hoy.y, hoy.m, d, hoy) ?? (hoy.m === 1 ? armar(hoy.y - 1, 12, d, hoy) : armar(hoy.y, hoy.m - 1, d, hoy))
  }
  return null
}

/** Índices de los ítems a los que les falta alguno de estos códigos de faltante (política del chat). */
function indicesQueLesFalta(items = [], codigos = []) {
  const out = []
  items.forEach((it, i) => {
    let f = []
    try { f = faltantesDe(it, POLITICA.CHAT) } catch { f = [] }
    if (f.some((x) => codigos.includes(x.codigo))) out.push(i)
  })
  return out
}

// ═══ «¿A QUIÉN SE LE PAGÓ?» Y «¿DE CUÁNTO ES?», CONTESTADOS EN EL HILO (03/10/2026) ═══
//
// El recibo manuscrito del sereno de Quattropani: la firma no se lee, y el bot mandaba a tocar Corregir —un
// botón que no está—. La respuesta natural es el nombre («Juan Pérez», «se le pagó a Juan Pérez») o el monto
// («1.540.000», «de $1.540.000»). Un nombre suelto se toma SÓLO dentro del hilo de la pregunta: fuera de él,
// cualquier palabra parecería un nombre y se le robaría el mensaje a otro especialista.
const RE_PREFIJO_QUIEN = /^(?:(?:se )?le (?:pague|pagamos|pagaron|pago) a|(?:se )?(?:lo )?(?:pague|pago|pagamos|pagaron) a|lo cobro|cobro|se llama|es de|es|era|a)\s+/
const RE_NO_ES_NOMBRE = /\d|^(si|no|ok|dale|listo|gracias|hola|ayuda|que|cual|como|donde|cuando|ninguno|nadie|no se)$/

/** El nombre escrito, sin el «se le pagó a» de adelante, con las mayúsculas como las escribió la persona. */
export function nombreDe(texto) {
  const crudo = String(texto ?? '').replace(/\s+/g, ' ').trim().replace(/[.!¡?¿]+$/g, '')
  const t = plano(crudo)
  if (!t || t.length > 60 || RE_NO_ES_NOMBRE.test(t) || /\?/.test(String(texto))) return null
  const m = t.match(RE_PREFIJO_QUIEN)
  // Se corta del original la misma cantidad de PALABRAS que tenía el prefijo: así se conservan acentos y mayúsculas.
  const palabras = crudo.split(' ')
  const nombre = (m ? palabras.slice(m[0].trim().split(' ').length) : palabras).join(' ').trim()
  if (!nombre || nombre.split(' ').length > 6 || !/[a-záéíóúñ]/i.test(nombre)) return null
  return nombre
}

/** «1.540.000», «$ 1.540.000,50», «de 1540000», «1,54 millones» → número; si no, null. */
export function importeDe(texto) {
  const t = plano(String(texto ?? '').replace(/\$/g, ' ')).replace(/^(?:es |son |de |por |fueron )+/, '').trim()
  let m = t.match(/^(\d+(?: \d+)?)(?: (?:m|millon|millones|palo|palos))$/)
  if (m) return Number(m[1].replace(' ', '.')) * 1_000_000
  // `plano` convierte «.» y «,» en espacios: «1.540.000» llega como «1 540 000», «1.540.000,50» como «1 540 000 50».
  m = t.match(/^(\d{1,3}(?: \d{3})+)(?: (\d{2}))?$/) ?? t.match(/^(\d+)(?: (\d{2}))?$/)
  if (!m) return null
  const n = Number(m[1].replace(/ /g, '')) + (m[2] ? Number(m[2]) / 100 : 0)
  return n > 0 ? n : null
}

/** Índices de los ítems a los que les falta la fecha (hueco o ilegible). */
export function indicesSinFecha(items = []) {
  const out = []
  items.forEach((it, i) => {
    let f = []
    try { f = faltantesDe(it, POLITICA.CHAT) } catch { f = [] }
    if (f.some((x) => x.codigo === MOTIVO.FECHA || x.codigo === MOTIVO.FECHA_IMPOSIBLE)) out.push(i)
  })
  return out
}

const ORDINALES = { primera: 1, primero: 1, segunda: 2, segundo: 2, tercera: 3, tercero: 3, cuarta: 4, cuarto: 4, quinta: 5, quinto: 5 }
/** «2», «la 2», «opcion 2», «la segunda» → 2. Sólo esa forma: un número dentro de una frase no cuenta. */
function ordinalDe(t) {
  const m = t.match(/^(?:(?:la|el|opcion|numero|nro|n|#)\s*)*(\d{1,2}|primera|primero|segunda|segundo|tercera|tercero|cuarta|cuarto|quinta|quinto)$/)
  if (!m) return null
  return ORDINALES[m[1]] ?? Number(m[1])
}

/** Minúsculas, sin acentos, sin puntuación de borde, espacios colapsados. */
export function plano(texto) {
  return String(texto ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[.,;:!¡?¿"'`]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Cancelar en palabras. Deliberadamente CORTA y explícita: "no" solo no cancela nada — es lo que
 * alguien contesta a media docena de preguntas distintas, y cerrar un fajo por error tira al tacho
 * comprobantes ya leídos (o sea, plata que no queda registrada en ningún lado).
 */
const RE_DESCARTAR = /^(descartalo|descartar|descarta|cancelalo|cancelar|cancela|dejalo|olvidalo|no va|no cargues|no lo cargues|anulalo|anular)$/

// ═══ CONTESTAR UN DUPLICADO ESCRIBIENDO — EL AGUJERO DEL 25/08 ═══
//
// `faltantesDe` frena todo comprobante con un `posibleDuplicado` sin contestar, y ese freno estaba
// bien puesto: dos facturas consecutivas del mismo proveedor el mismo día difieren en un dígito y
// son dos compras distintas y legítimas, así que no se decide solo.
//
// Lo que faltaba era la SALIDA. Los botones (`botonesFajo`) son la única forma que existía de
// contestarlo, y en producción están APAGADOS: `ORQ_COMPROBANTES_BOTONES` no está puesto en
// `~/.config/echegaray-orq/comunicacion.env`. Medido el 25/08: el fajo `de1c9a7a` quedó `abierto`
// con la factura 0004-00003745 de Corralón Progreso ($304.515,98) adentro, sin error, sin aviso
// publicado y sin ninguna respuesta posible. Un control con un freno y sin salida no es un control:
// es un gasto que no entra a ningún lado y del que nadie se entera.
//
// Las dos regex están ANCLADAS enteras a propósito, igual que `RE_DESCARTAR`: se interpretan sólo
// cuando el fajo tiene un duplicado abierto, y aun así una frase larga no las dispara. Robarle un
// mensaje a otro especialista cuesta más que pedir que lo escriba corto.
//
// El sufijo opcional existe porque la respuesta natural viene con la acción pegada: el botón se
// llamaba «Es otro, cargalo» y eso es literalmente lo que la persona escribe.
const RE_DUP_MISMO = /^(si )?(es |era )?(el mismo|mismo|ese|esa|este|esta|repetido|duplicado|ya esta|ya esta cargado|ya estaba|ya estaba cargado|esta repetido|es repetido)( no lo cargues| no lo cargue| no cargues| no)?$/
const RE_DUP_OTRO = /^((no )?(es |era )?(otro|otra|distinto|distinta|distintos|distintas|uno nuevo|el mismo|ese|esa)( cargalo| cargala| igual| cargalo igual| cargala igual)?|cargalo|cargala|cargalo igual|cargala igual|son distintos|son distintas)$/

// ═══ «SÍ, ES UNA FACTURA» — EL MISMO AGUJERO, OTRA PREGUNTA (31/08) ═══
//
// El freno de presupuesto/remito ofrecía como única salida un botón apagado. Hoy la orden de entrega
// de Cerrajería SAN MIGUEL por $23.000 se mandó dos veces y quedó trabada las dos.
//
// Anclada entera y CORTA por la misma razón que las de arriba, y sin `cargalo` pelado: eso ya lo
// reclama `RE_DUP_OTRO` y dos regex peleándose por la misma palabra es cómo se contesta la pregunta
// equivocada. Acá la persona tiene que decir de qué papel habla.
const RE_ES_FACTURA = /^(si )?(es |era )?(una |la )?(factura|factura de verdad|factura real|si es factura|es factura)( cargalo| cargala| igual| cargalo igual| cargala igual)?$/

/**
 * Las opciones que ESTE ítem tiene ofrecidas ahora mismo, por campo.
 *
 * Sale de las mismas dos fuentes que valida `aplicarOpcion` —la historia de Compras y el desplegable
 * estricto de la columna—: lo que se acepta escrito tiene que ser exactamente lo que se acepta con un
 * click, o habría dos criterios y uno se quedaría viejo.
 */
export function ofrecidasDe(item = {}) {
  const out = []
  for (const campo of imputacionPendiente(item)) {
    const vistos = new Set()
    for (const o of opcionesDe(item?.sugerencia?.[campo])) {
      if (o?.valor && !vistos.has(o.valor)) { vistos.add(o.valor); out.push({ campo, valor: o.valor }) }
    }
    for (const v of opcionesDelDesplegable(item, campo)) {
      const s = String(v ?? '').trim()
      if (s && !vistos.has(s)) { vistos.add(s); out.push({ campo, valor: s }) }
    }
  }
  return out
}

/** ¿La palabra `aguja` aparece entera adentro de `pajar`? Sin regex construida con datos del usuario. */
function contienePalabra(pajar, aguja) {
  if (!aguja) return false
  let desde = 0
  for (;;) {
    const i = pajar.indexOf(aguja, desde)
    if (i < 0) return false
    const antes = i === 0 ? ' ' : pajar[i - 1]
    const desp = i + aguja.length >= pajar.length ? ' ' : pajar[i + aguja.length]
    if (!/[a-z0-9]/.test(antes) && !/[a-z0-9]/.test(desp)) return true
    desde = i + 1
  }
}

/**
 * Interpreta un texto contra un fajo abierto.
 *
 * @param {{items?:Array}} fajo
 * @param {string} texto
 * @returns {null|{que:string, campo?:string, valor?:string, indices?:number[], candidatas?:Array}}
 *   `null` = ESTO NO ES PARA MÍ. Es la respuesta más importante de la función: devolver algo cuando
 *   no se entendió sería robarle el mensaje a otro especialista.
 */
export function interpretarRespuesta(fajo, texto, { ahora, enHilo = false } = {}) {
  const t = plano(texto)
  if (!t || t.length > MAX_LARGO) return null
  const items = Array.isArray(fajo?.items) ? fajo.items : []
  if (!items.length) return null

  if (RE_DESCARTAR.test(t)) return { que: RESPUESTA.DESCARTAR }

  // EL DUPLICADO SE CONTESTA ANTES QUE NADA, igual que en los botones: mientras haya uno abierto no
  // se ofrece cargar, así que una respuesta de imputación no tendría dónde aplicarse todavía.
  const dup = indiceDuplicadoAbierto(items)
  if (dup >= 0) {
    if (RE_DUP_MISMO.test(t)) return { que: RESPUESTA.DUPLICADO, valor: 'mismo', indices: [dup] }
    if (RE_DUP_OTRO.test(t)) return { que: RESPUESTA.DUPLICADO, valor: 'otro', indices: [dup] }
  }

  // Y la clase del papel, que frena antes que la imputación por la misma razón: si no es una
  // factura no hay nada que imputar.
  const clase = indiceClaseAbierta(items)
  if (clase >= 0 && RE_ES_FACTURA.test(t)) return { que: RESPUESTA.CLASE, valor: 'factura', indices: [clase] }

  // La FECHA, sólo si la pregunta abierta es la fecha.
  const sinFecha = indicesSinFecha(items)
  if (sinFecha.length) {
    const f = interpretarFecha(t, { ahora })
    if (f) return { que: RESPUESTA.FECHA, valor: f, indices: sinFecha }
  }

  // EL IMPORTE, sólo si alguno no tiene importe leído. Va antes que el ordinal: «2» no es un importe creíble
  // (`importeDe` lo devolvería), así que con opciones abiertas manda el ordinal — se exige un monto de 3 cifras.
  // Y sólo en el hilo: en el canal Efectivo un número suelto puede ser una línea de la libreta o un pago.
  const sinImporte = enHilo ? indicesQueLesFalta(items, [MOTIVO.IMPORTE, MOTIVO.TOTAL]) : []
  if (sinImporte.length) {
    const v = importeDe(texto)
    if (v != null && v >= 100) return { que: RESPUESTA.IMPORTE, valor: v, indices: sinImporte }
  }

  // Un NÚMERO contesta la opción de esa posición, en el orden en que se le ofrecieron (el mismo de
  // la tarjeta y de la repregunta). Sólo con un único campo pendiente: si hay dos no se sabe de cuál.
  const n = ordinalDe(t)
  if (n) {
    const porCampo = new Map()
    items.forEach((it, i) => {
      for (const { campo, valor } of ofrecidasDe(it)) {
        const e = porCampo.get(campo) ?? new Map()
        const idx = e.get(valor) ?? { valor, indices: [] }
        idx.indices.push(i); e.set(valor, idx); porCampo.set(campo, e)
      }
    })
    if (porCampo.size === 1) {
      const [[campo, mapa]] = porCampo
      const lista = [...mapa.values()]
      if (lista[n - 1]) return { que: RESPUESTA.OPCION, campo, valor: lista[n - 1].valor, indices: lista[n - 1].indices }
    }
  }

  // Se junta TODO lo ofrecido, con el índice del ítem que lo ofreció, y se busca el texto ahí.
  const exactos = new Map()   // "campo valor" -> {campo, valor, indices:Set}
  const parciales = new Map()
  items.forEach((it, i) => {
    for (const { campo, valor } of ofrecidasDe(it)) {
      const v = plano(valor)
      if (!v) continue
      const k = `${campo} ${valor}`
      const destino = v === t ? exactos : (contienePalabra(t, v) || contienePalabra(v, t) ? parciales : null)
      if (!destino) continue
      const e = destino.get(k) ?? { campo, valor, indices: new Set() }
      e.indices.add(i)
      destino.set(k, e)
    }
  })

  // EL EXACTO GANA SIEMPRE. "Messina" escrito tal cual no puede quedar ambiguo porque además exista
  // "Messina 2": el que escribió el nombre completo ya desambiguó.
  const elegidos = exactos.size ? exactos : parciales
  if (!elegidos.size) {
    // A QUIÉN SE LE PAGÓ: lo último que se prueba, y sólo dentro del hilo. Una opción ofrecida (una obra) gana.
    const sinQuien = enHilo ? indicesQueLesFalta(items, [MOTIVO.PROVEEDOR]) : []
    const nombre = sinQuien.length ? nombreDe(texto) : null
    if (nombre) return { que: RESPUESTA.PROVEEDOR, valor: nombre, indices: sinQuien }
    return null
  }
  const lista = [...elegidos.values()].map((e) => ({ campo: e.campo, valor: e.valor, indices: [...e.indices].sort((a, b) => a - b) }))
  if (lista.length > 1) return { que: RESPUESTA.AMBIGUO, candidatas: lista }
  const [u] = lista
  return { que: RESPUESTA.OPCION, campo: u.campo, valor: u.valor, indices: u.indices }
}
