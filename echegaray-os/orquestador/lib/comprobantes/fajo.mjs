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

const money = (n) => (n == null
  ? '—'
  : `${n < 0 ? '−' : ''}$${Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)

/** Etiqueta corta del comprobante: "F A 0113-00010489" · "N C 0001-00000042". */
export function etiquetaComprobante(c = {}) {
  const t = c.esNotaCredito ? 'N C' : (c.tipo ? `F ${c.tipo}` : 'comprobante')
  return `${t} ${c.numero ?? 's/n'}`
}

/**
 * Qué le falta a un comprobante para poder cargarse, en castellano y como PREGUNTA.
 *
 * La regla del OS es no inventar; la consecuencia operativa es que hay que preguntar. Un comprobante
 * con preguntas abiertas se muestra igual —para que el dueño vea que llegó— pero no se carga hasta
 * que estén contestadas.
 */
export function preguntasDe(item = {}) {
  const c = item.comprobante ?? {}
  const p = []
  if (item.proveedorNuevo) {
    p.push(`el proveedor **${c.proveedor ?? '(ilegible)'}** no está en la lista de Compras — ¿lo agrego?`)
  }
  if (!c.obra) p.push('no dice a qué obra va — ¿cuál es?')
  if (c.total == null) p.push('no pude leer el total')
  if (!c.fecha) p.push('no pude leer la fecha')
  if (!c.numero) p.push('no pude leer el número de comprobante')
  return p
}

/** ¿Este ítem se puede escribir sin preguntarle nada a nadie? */
export function estaCompleto(item = {}) {
  return preguntasDe(item).length === 0 && !item.yaCargado
}

/**
 * El mensaje de confirmación: qué leyó el OS, comprobante por comprobante.
 *
 * MUESTRA EL TOTAL Y EL IVA POR SEPARADO a propósito. El Importe que va a la columna M es
 * `Total − IVA` y absorbe percepciones: si el mensaje mostrara sólo "importe", el dueño no podría
 * verificar contra el papel el número que sí está impreso ahí, que es el total.
 */
export function resumenFajo(fajo = {}) {
  const items = fajo.items ?? []
  const l = []
  l.push(items.length === 1 ? '**Leí este comprobante:**' : `**Leí ${items.length} comprobantes:**`)
  l.push('')
  items.forEach((it, i) => {
    const c = it.comprobante ?? {}
    const n = items.length > 1 ? `${i + 1}. ` : ''
    l.push(`${n}**${c.proveedor ?? '(proveedor ilegible)'}** · ${etiquetaComprobante(c)} · ${c.fecha ?? 'sin fecha'}`)
    const imp = c.total != null ? `total ${money(c.total)}` : 'total ilegible'
    const iva = c.iva != null ? ` · IVA ${money(c.iva)}` : ' · sin IVA discriminado'
    const importe = c.total != null ? ` · importe a Compras ${money(redondear(c.total - (c.iva ?? 0)))}` : ''
    l.push(`   ${imp}${iva}${importe}`)
    if (c.otrosTributos) l.push(`   percepciones/otros tributos ${money(c.otrosTributos)} (van dentro del importe, no son IVA)`)
    if (c.esNotaCredito) l.push('   ⚠ **nota de crédito: entra en negativo**')
    // De DÓNDE salió la obra se dice siempre que no venga del papel. Imputar el costo a una obra es
    // la decisión con más consecuencias de toda la fila —arrastra margen, certificación y P&L— y si
    // se dedujo de lo que la persona escribió en el chat, tiene que poder verlo antes de confirmar.
    const via = c.obra && c.obraVia === 'mensaje' ? ' _(de lo que escribiste)_' : ''
    l.push(`   obra: ${c.obra ?? '_falta_'}${via}${c.concepto ? ` · ${c.concepto}` : ''}`)
    if (it.yaCargado) l.push(`   ✓ **ya está cargado en la fila ${it.yaCargado.fila ?? '?'}** — no lo vuelvo a cargar`)
    for (const p of preguntasDe(it)) l.push(`   ❓ ${p}`)
  })

  const cargables = items.filter(estaCompleto).length
  const yaEstaban = items.filter((it) => it.yaCargado).length
  l.push('')
  if (yaEstaban) l.push(`_${yaEstaban} ya estaba${yaEstaban > 1 ? 'n' : ''} cargado${yaEstaban > 1 ? 's' : ''}._`)
  if (!cargables) {
    l.push('**No hay nada que cargar todavía.** Contestame lo que falta y lo cargo.')
  } else {
    l.push(`Si está bien, apretá **Confirmar** y lo escribo en Compras (${cargables} fila${cargables > 1 ? 's' : ''}).`)
  }
  return l.join('\n')
}

function redondear(n) {
  return n == null ? null : Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Los botones. `integration.url` lleva el SECRETO en la query: Mattermost guarda esa URL en su base
 * y no se la manda al cliente, así que es el único lugar donde un callback puede probar que viene de
 * Mattermost. El callback NO trae token de identidad — verificado contra el servidor real.
 */
export function botonesFajo(fajo = {}, { url } = {}) {
  if (!url) return []
  const contexto = (accion) => ({ accion, fajo_id: fajo.id, dominio: 'comprobantes' })
  const hayQueCargar = (fajo.items ?? []).some(estaCompleto)
  const acciones = []
  if (hayQueCargar) {
    acciones.push({ id: 'confirmar', name: 'Confirmar y cargar', type: 'button', style: 'primary', integration: { url, context: contexto('confirmar') } })
  }
  acciones.push({ id: 'corregir', name: 'Corregir', type: 'button', integration: { url, context: contexto('corregir') } })
  acciones.push({ id: 'descartar', name: 'Descartar', type: 'button', style: 'danger', integration: { url, context: contexto('descartar') } })
  return [{
    fallback: 'Confirmá la carga de los comprobantes desde Mattermost.',
    color: hayQueCargar ? '#1e7e34' : '#b58900',
    actions: acciones,
  }]
}

/** El mensaje completo (texto + botones) tal como sale al canal. */
export function mensajeFajo(fajo, { url } = {}) {
  return { texto: resumenFajo(fajo), attachments: botonesFajo(fajo, { url }) }
}
