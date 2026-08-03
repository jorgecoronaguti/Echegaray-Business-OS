// EL FAJO — varios comprobantes que se confirman de una sola vez, y el mensaje que los muestra.
//
// ═══ POR QUÉ EXISTE UN "FAJO" Y NO SIMPLEMENTE "UN POST" ═══
//
// El dueño saca las fotos como salen: a veces cuatro facturas en un post, a veces cuatro posts
// seguidos de una foto cada uno. Son la misma tanda de gastos. Si cada post abriera su propia
// confirmación, el canal se llenaría de cuatro mensajes con cuatro botones y él tendría que apretar
// cuatro veces lo mismo.
//
// LA DECISIÓN, y su justificación: **un fajo se abre con el primer post con adjuntos y se mantiene
// ABIERTO mientras la misma persona siga mandando adjuntos al mismo canal dentro de una ventana
// corta (por defecto 5 minutos). Cada post nuevo se AGREGA al fajo abierto y el mensaje de
// confirmación se reescribe.** Un solo Confirmar carga todo.
//
// Lo que NO se hace, y por qué: no se espera. No hay un temporizador que retenga el primer post "por
// si viene otro". El bot contesta enseguida con lo que leyó y va sumando; esperar convertiría el
// silencio del bot en la experiencia normal, y este repo ya aprendió que un bot que calla se lee
// como un bot colgado. La ventana agrupa hacia adelante, nunca hacia atrás.
//
// Y lo que hace que la ventana no sea la defensa importante: **la ventana es comodidad, la
// idempotencia es la garantía.** Dos fotos del mismo comprobante —en el mismo post, en posts
// distintos o la semana que viene— colapsan por (CUIT, tipo, número), no por tiempo. Una ventana de
// agrupación que se usara como control de duplicados sería un control que depende del reloj.

import { claveComprobante } from './lectura.mjs'

/** Ventana de agrupación, en minutos. Corta a propósito: agrupa una tanda, no una jornada. */
export const VENTANA_FAJO_MIN = Number(process.env.ORQ_COMPROBANTES_VENTANA_MIN || 5)

export const ESTADO = Object.freeze({
  ABIERTO: 'abierto', // esperando Confirmar / Corregir / Descartar
  CONFIRMADO: 'confirmado', // el dueño apretó Confirmar; se está escribiendo o ya se escribió
  CARGADO: 'cargado',
  ENCOLADO: 'encolado', // confirmado con el freno de mano puesto: se escribe cuando se levante
  DESCARTADO: 'descartado',
  ERROR: 'error',
})

/**
 * ¿Este post nuevo entra en el fajo abierto que ya existe?
 *
 * Deliberadamente estricto: misma persona, mismo canal, fajo todavía abierto y dentro de la ventana.
 * Un fajo ya confirmado NUNCA recibe nada — si llegara un adjunto tarde, abre uno nuevo. Agregarle
 * un comprobante a un fajo que ya se está escribiendo es la forma de cargar algo que nadie confirmó.
 *
 * @param {{plataforma_user_id:string, channel_id:string, estado:string, ultimo_at:Date|string}|null} abierto
 * @param {{userId:string, channelId:string, ahora:Date}} post
 * @param {{ventanaMin?:number}} [o]
 */
export function entraEnElFajo(abierto, post, { ventanaMin = VENTANA_FAJO_MIN } = {}) {
  if (!abierto || abierto.estado !== ESTADO.ABIERTO) return false
  if (!post?.userId || !post?.channelId) return false
  if (abierto.plataforma_user_id !== post.userId) return false
  if (abierto.channel_id !== post.channelId) return false
  const ultimo = new Date(abierto.ultimo_at ?? abierto.creado_at ?? 0).getTime()
  const ahora = new Date(post.ahora ?? Date.now()).getTime()
  if (!Number.isFinite(ultimo) || !Number.isFinite(ahora)) return false
  const dt = ahora - ultimo
  // Hacia atrás no se agrupa: un reloj corrido no puede meter un comprobante en un fajo viejo.
  return dt >= 0 && dt <= ventanaMin * 60_000
}

/**
 * Colapsa los comprobantes repetidos DENTRO de un mismo fajo.
 *
 * El caso real: la misma factura fotografiada dos veces (o el frente y el dorso, donde el dorso
 * también trae el encabezado). Sin esto, el fajo mostraría dos líneas idénticas y la idempotencia
 * recién lo atajaría al escribir — o sea, después de que el dueño ya confirmó algo que estaba mal
 * contado. Se colapsa por la MISMA clave con la que se deduplica contra lo ya cargado.
 *
 * Los que no tienen clave (sin número, sin CUIT y sin proveedor) NO se colapsan entre sí: sin clave
 * no se puede afirmar que sean el mismo, y unir dos gastos distintos es peor que mostrar dos veces
 * el mismo.
 *
 * @returns {{items:Array, repetidos:Array}}
 */
export function colapsarRepetidos(items = []) {
  const vistos = new Map()
  const out = []
  const repetidos = []
  for (const it of items) {
    const k = claveComprobante(it?.comprobante ?? {})
    if (!k) { out.push(it); continue }
    if (vistos.has(k.clave)) { repetidos.push({ item: it, clave: k.clave }); continue }
    vistos.set(k.clave, it)
    out.push(it)
  }
  return { items: out, repetidos }
}

/**
 * Etiqueta corta del comprobante: "F A 0113-00010489" · "N C 0001-00000042".
 *
 * Sin tipo va SÓLO el número. De un tique la visión no siempre saca la letra, y la etiqueta decía
 * "comprobante 00113-00014219", que en una tabla cuyo rótulo ya dice "Comprobante" se leía como un
 * tartamudeo. Que falte la letra no impide cargar ni buscar el duplicado: no se anuncia como falla.
 */
export function etiquetaComprobante(c = {}) {
  const t = c.esNotaCredito ? 'N C' : (c.tipo ? `F ${c.tipo}` : null)
  const n = c.numero ?? 's/n'
  return t ? `${t} ${n}` : n
}

/**
 * Qué le falta a un comprobante para poder cargarse, en castellano y como PREGUNTA.
 *
 * La regla del OS es no inventar; la consecuencia operativa es que hay que preguntar. Un comprobante
 * con preguntas abiertas se muestra igual —para que el dueño vea que llegó— pero no se carga hasta
 * que estén contestadas.
 */
/**
 * La pregunta de la obra, como constante y no como literal repetido: `mensaje.mjs` la reemplaza por
 * el bloque con las opciones del historial y necesita reconocerla sin acoplarse a una redacción.
 */
export const PREGUNTA_OBRA = 'no dice a qué obra va — ¿cuál es?'

export function preguntasDe(item = {}) {
  const c = item.comprobante ?? {}
  const p = []
  if (item.proveedorNuevo) {
    p.push(`el proveedor **${c.proveedor ?? '(ilegible)'}** no está en la lista de Compras — ¿lo agrego?`)
  }
  // UN PROBABLE DUPLICADO ES UNA PREGUNTA, NO UNA DECISIÓN. Ni cargar ni descartar solo: mismo
  // proveedor, mismo día y mismo importe con otro número puede ser el mismo comprobante con un
  // dígito mal leído —lo que ya pasó— o dos compras distintas. Las dos salidas son caras y ninguna
  // se elige sin el dueño.
  // El detalle de la fila candidata lo muestra el mensaje (`avisoDuplicado`), arriba y con formato:
  // acá sólo queda la razón por la que este comprobante NO está listo para cargarse.
  if (item.posibleDuplicado && !item.duplicadoResuelto) {
    p.push(`puede que ya esté cargado en la **fila ${item.posibleDuplicado.fila ?? '?'}** — ¿es el mismo?`)
  }
  if (!c.obra) p.push(PREGUNTA_OBRA)
  if (c.total == null) p.push('no pude leer el total')
  if (!c.fecha) p.push('no pude leer la fecha')
  if (!c.numero) p.push('no pude leer el número de comprobante')
  return p
}

/** ¿Este ítem se puede escribir sin preguntarle nada a nadie? */
export function estaCompleto(item = {}) {
  if (item.duplicadoResuelto === 'mismo') return false // el dueño dijo que ya estaba: no se carga
  return preguntasDe(item).length === 0 && !item.yaCargado
}

/** ¿Queda algún duplicado sin contestar? Mientras lo haya, no se ofrece Confirmar. */
export function indiceDuplicadoAbierto(items = []) {
  return items.findIndex((it) => it?.posibleDuplicado && !it.duplicadoResuelto)
}

// EL MENSAJE VIVE EN `mensaje.mjs`, AL LADO. Está separado a propósito desde el 03/08: acá quedó lo
// que DECIDE (qué entra en el fajo, qué falta, qué se puede cargar) y allá lo que se MUESTRA. El
// mensaje se rehízo entero como tabla markdown —el dueño no podía leer la prosa corrida— y mezclar
// las dos cosas en un archivo hacía que cambiar una coma del texto obligara a releer la lógica de
// idempotencia. `mensaje.mjs` importa de acá; nunca al revés.

// ── LO QUE LA HISTORIA OFRECE PARA CONTESTAR ─────────────────────────────────
//
// Una sola función para el texto y para los botones. Si el mensaje listara las opciones de un lado y
// los botones salieran de otro, existiría la opción que se lee y no se puede tocar — y peor, la que
// se puede tocar y nadie ofreció, que es por donde entra un valor que el desplegable estricto de la
// columna J va a rechazar.

/** Campos que se pueden completar tocando un botón. El resto va por el formulario de "Corregir". */
export const CAMPOS_IMPUTABLES = Object.freeze(['obra', 'unidad', 'detalle'])

/**
 * Las opciones que la lib de imputación aprendida contó para una dimensión, con el valor sugerido
 * adelante si no estuviera entre las más frecuentes (pasa cuando la obra se refina por el concepto).
 * Ese caso va SIN conteo: la lib no lo da y acá no se inventa un número.
 *
 * @param {{sugerido?:string, opciones?:Array<{valor:string,n:number}>}|null} sug
 * @returns {Array<{valor:string, n:number|null}>}
 */
export function opcionesDe(sug) {
  if (!sug) return []
  const ops = (Array.isArray(sug.opciones) ? sug.opciones : [])
    .filter((o) => o && String(o.valor ?? '').trim())
    .map((o) => ({ valor: String(o.valor).trim(), n: Number.isFinite(o.n) ? o.n : null }))
  if (sug.sugerido && !ops.some((o) => o.valor === sug.sugerido)) {
    return [{ valor: String(sug.sugerido).trim(), n: null }, ...ops]
  }
  return ops
}

/** El primer ítem al que le falta la obra Y tiene opciones que ofrecer. -1 si no hay ninguno. */
export function indiceObraOfrecible(items = []) {
  return items.findIndex((it) => it && !it.yaCargado && !it.comprobante?.obra && opcionesDe(it.sugerencia?.obra).length)
}

/**
 * Aplica una opción ELEGIDA con un botón. Devuelve el ítem nuevo (no muta) o null si no se acepta.
 *
 * FALLA CERRADO Y CONTRA LO QUE ESTE ÍTEM OFRECIÓ. El callback de Mattermost no trae identidad y su
 * `context` lo puede escribir cualquiera que consiga la URL: si acá se aceptara un valor arbitrario,
 * un click fabricado imputaría un gasto a una obra que no existe en el desplegable estricto de la
 * columna J —celda en rojo y cruces del Cash Flow rotos—. Sólo se acepta uno de los valores que
 * salieron de la historia de Compras de este mismo comprobante.
 */
export function aplicarOpcion(item = {}, { campo, valor } = {}) {
  if (!CAMPOS_IMPUTABLES.includes(campo)) return null
  const elegido = opcionesDe(item?.sugerencia?.[campo]).find((o) => o.valor === String(valor ?? '').trim())
  if (!elegido) return null
  const c = { ...(item.comprobante ?? {}) }
  const sug = { ...(item.sugerencia ?? {}) }
  if (campo === 'obra') {
    c.obra = elegido.valor
    c.obraVia = 'eleccion'
    // EL DETALLE CUELGA DE LA OBRA. La sugerencia que viajaba se calculó para la obra que la lib
    // proponía; si el dueño eligió otra, ofrecerla igual sería ofrecerle el frente de otra obra.
    if (sug.detalle && sug.detalle.obra && sug.detalle.obra !== elegido.valor) sug.detalle = null
  } else if (campo === 'unidad') {
    c.unidad = elegido.valor
  } else {
    c.detalleObra = elegido.valor
    c.detalleVia = 'eleccion'
  }
  return { ...item, comprobante: c, sugerencia: sug, elegido: { ...(item.elegido ?? {}), [campo]: elegido.valor } }
}

/**
 * Los botones. `integration.url` lleva el SECRETO en la query: Mattermost guarda esa URL en su base
 * y no se la manda al cliente, así que es el único lugar donde un callback puede probar que viene de
 * Mattermost. El callback NO trae token de identidad — verificado contra el servidor real.
 */
export function botonesFajo(fajo = {}, { url } = {}) {
  if (!url) return []
  const items = fajo.items ?? []
  const contexto = (accion, extra = {}) => ({ accion, fajo_id: fajo.id, dominio: 'comprobantes', ...extra })
  const hayQueCargar = items.some(estaCompleto)
  const acciones = []

  // EL DUPLICADO SE CONTESTA ANTES QUE NADA. Mientras haya uno abierto no aparece "Confirmar":
  // dejarlo al lado invita a apretarlo sin leer, y lo que está en juego es un gasto contado dos
  // veces en el Flujo de Fondos.
  const dup = indiceDuplicadoAbierto(items)
  if (dup >= 0) {
    const n = items.length > 1 ? ` (${dup + 1}/${items.length})` : ''
    return [{
      fallback: 'Decidí si este comprobante ya estaba cargado.',
      color: '#b58900',
      actions: [
        { id: 'duplicado_mismo', name: `Es el mismo, no lo cargues${n}`, type: 'button', integration: { url, context: contexto('duplicado_mismo', { indice: dup }) } },
        { id: 'duplicado_otro', name: `Es otro, cargalo${n}`, type: 'button', style: 'primary', integration: { url, context: contexto('duplicado_otro', { indice: dup }) } },
        { id: 'descartar', name: 'Descartar', type: 'button', style: 'danger', integration: { url, context: contexto('descartar') } },
      ],
    }]
  }

  if (hayQueCargar) {
    acciones.push({ id: 'confirmar', name: 'Confirmar y cargar', type: 'button', style: 'primary', integration: { url, context: contexto('confirmar') } })
  }
  acciones.push({ id: 'corregir', name: 'Corregir', type: 'button', integration: { url, context: contexto('corregir') } })
  acciones.push({ id: 'descartar', name: 'Descartar', type: 'button', style: 'danger', integration: { url, context: contexto('descartar') } })
  const bloques = []

  // LA OBRA SE CONTESTA CON UN CLICK. Se ofrece la del PRIMER comprobante que la necesita, no la de
  // todos: cuatro comprobantes darían doce botones y el dueño no sabría cuál es de cuál. Al contestar
  // uno, el mensaje se reescribe y aparece el siguiente.
  const oi = indiceObraOfrecible(items)
  if (oi >= 0) {
    const it = items[oi]
    const cual = items.length > 1 ? ` (${oi + 1}/${items.length})` : ''
    bloques.push({
      fallback: '¿A qué obra va este comprobante?',
      color: '#b58900',
      title: `¿A qué obra va${cual}? — ${it.comprobante?.proveedor ?? 'sin proveedor'}`,
      actions: opcionesDe(it.sugerencia?.obra).slice(0, 3).map((o, k) => ({
        id: `obra_${k}`,
        name: o.n != null ? `${o.valor} (${o.n})` : o.valor,
        type: 'button',
        integration: { url, context: contexto('imputar', { indice: oi, campo: 'obra', valor: o.valor }) },
      })),
    })
  }

  bloques.push({
    fallback: 'Confirmá la carga de los comprobantes desde Mattermost.',
    color: hayQueCargar ? '#1e7e34' : '#b58900',
    actions: acciones,
  })
  return bloques
}

/**
 * Contesta un probable duplicado. Devuelve los ítems NUEVOS (no muta los de entrada).
 *
 * "Es el mismo" no borra el comprobante: lo deja marcado y visible, para que quede constancia de que
 * se decidió no cargarlo. Un descarte silencioso y un comprobante que nunca llegó se ven igual.
 *
 * @param {Array} items
 * @param {number} indice
 * @param {'mismo'|'otro'} respuesta
 */
export function resolverDuplicado(items = [], indice = -1, respuesta = 'otro') {
  const it = items[indice]
  if (!it?.posibleDuplicado || it.duplicadoResuelto) return null
  const out = [...items]
  out[indice] = { ...it, duplicadoResuelto: respuesta === 'mismo' ? 'mismo' : 'otro' }
  return out
}
