// NÚMERO EXPLÍCITO = RENDICIÓN — un comprobante de #comprobantes-gastos que nombra una entrega de efectivo.
//
// ═══ EL PEDIDO (dueño, 24/09/2026) ═══
//
// «voy a imputar un gasto que tengo que registrar vía canal comprobantes gastos a una rendición de efectivo,
// ¿cómo hago eso?» y después: «hay mezcla en las lógicas de comprobantes, los canales comprobantes gastos y
// efectivo. Quiero una solución sin que rompa lo que funciona actualmente en comprobantes gastos».
//
// ═══ POR QUÉ ESTO NO ES LO QUE SE DESCARTÓ EL 22 Y EL 23/09 ═══
//
// Lo que el dueño rechazó dos veces fue ADIVINAR: mirar si quien manda tiene una entrega abierta e imputarle
// todo. Administración carga facturas de proveedores por este canal, y con una entrega a su nombre se habría
// comido todas. Acá no se adivina nada: sólo un mensaje que ESCRIBE el número de la entrega («ER-0020»,
// «er 20», «ER20») va a la entrega, y va a ESA. Sin número, el canal hace exactamente lo que hacía — este
// módulo ni siquiera consulta la base (`codigosDeEntrega` es puro y devuelve vacío).
//
// ═══ QUÉ HACE CON EL NÚMERO ═══
//
// Lo mismo que el canal Efectivo con un ticket (`rendiciones.mjs`): registra el ticket en
// `efectivo_comprobante` ANTES de cargar (así la reconciliación lo vincula si la carga queda en espera),
// fuerza Tipo pago «A rendir» y pagado —la plata ya salió del cajón con la entrega: si dijera «Efectivo»,
// CAJA la restaría dos veces— y la obra de la entrega, y después llama a `vincular_rendiciones_pendientes`,
// que ata la fila de Compras a la entrega: el saldo de la persona baja.
//
// ═══ QUIÉN PUEDE ═══
//
// Dirección y Administración (`ve_economia()`: rol direccion|administracion) a la entrega de cualquiera;
// cualquier otro, sólo a las suyas. Un número que no existe, anulado, cerrado o de prueba se dice y NO se
// carga nada: cargar «a ciegas» como compra común un ticket que la persona quiso rendir es exactamente el
// doble descuento que esto existe para evitar.

/** «ER-0020», «er 20», «ER20», «ER-20». El número del medio es el `numero` de la entrega. */
const RE_CODIGO = /\bER[-\s]?(\d{1,6})\b/gi

/** Los roles que ven la economía: los mismos que `public.ve_economia()`. */
export const ROLES_QUE_IMPUTAN_A_CUALQUIERA = Object.freeze(['direccion', 'administracion'])

/** El código como lo escribe la base (`'ER-' || lpad(numero, 4, '0')`). */
export const codigoDe = (n) => `ER-${String(n).padStart(4, '0')}`

/**
 * NÚCLEO PURO: los números de entrega que el mensaje nombra, sin repetir. Vacío = compra común.
 * @param {string|null|undefined} texto
 * @returns {number[]}
 */
export function codigosDeEntrega(texto) {
  const vistos = new Set()
  for (const m of String(texto ?? '').matchAll(RE_CODIGO)) {
    const n = Number(m[1])
    if (n > 0) vistos.add(n)
  }
  return [...vistos]
}

export const TEXTO = Object.freeze({
  NO_VERIFICABLE: 'No pude confirmar quién sos, y un comprobante con número de entrega descuenta del saldo de una persona. No cargué nada. Probá de nuevo en un minuto.',
  SIN_USUARIO: 'No encuentro tu usuario de la app detrás de esta cuenta de Mattermost, así que no puedo imputar a una entrega. No cargué nada: avisale a Administración.',
})

const rechazo = (motivo, texto) => ({ ok: false, motivo, texto })
const noCargue = 'No cargué nada:'

/**
 * NÚCLEO PURO: ¿se puede imputar este comprobante a esta entrega, pedido por esta persona?
 *
 * @param {{numeros:number[], remitente:{perfilId?:string|null, rol?:string|null, personaId?:string|null}|null,
 *   entrega:{codigo:string, persona_id:string, anulada:boolean, cerrada:boolean, es_prueba:boolean,
 *   persona_prueba?:boolean}|null}} p
 * @returns {{ok:true}|{ok:false, motivo:string, texto:string}}
 */
export function decidirImputacion({ numeros = [], remitente = null, entrega = null } = {}) {
  if (numeros.length > 1) {
    return rechazo('varios_codigos', `Nombraste más de una entrega (${numeros.map(codigoDe).join(', ')}). ${noCargue} mandá cada comprobante con un solo número.`)
  }
  if (!remitente?.perfilId) return rechazo('sin_usuario', TEXTO.SIN_USUARIO)
  const codigo = codigoDe(numeros[0])
  if (!entrega) {
    return rechazo('no_existe', `No existe la entrega **${codigo}**. ${noCargue} revisá el número. Si es una compra común, mandalo sin número.`)
  }
  if (entrega.anulada) return rechazo('anulada', `**${entrega.codigo}** está anulada. ${noCargue} si el gasto es de otra entrega, mandalo con ese número; si es una compra común, sin número.`)
  if (entrega.cerrada) return rechazo('cerrada', `**${entrega.codigo}** ya está cerrada. ${noCargue} pedile a Administración que la revise o mandalo con el número de una entrega abierta.`)
  // UNA PRUEBA NO ESCRIBE COMPRAS (dueño, 23/09/2026): la misma regla que el canal Efectivo.
  if (entrega.es_prueba || entrega.persona_prueba) {
    return rechazo('prueba', `**${entrega.codigo}** es una prueba: ${noCargue} sus tickets no van a Compras.`)
  }
  const puedeCualquiera = ROLES_QUE_IMPUTAN_A_CUALQUIERA.includes(String(remitente.rol ?? ''))
  if (!puedeCualquiera && remitente.personaId !== entrega.persona_id) {
    return rechazo('sin_permiso', `**${entrega.codigo}** no es tuya, y a la entrega de otra persona sólo imputa Administración. ${noCargue} si el gasto es tuyo, mandalo con el número de tu entrega; si es una compra común, sin número.`)
  }
  return { ok: true }
}

/** Quién manda: el perfil de la app detrás del usuario de Mattermost, con su rol y su persona. */
export async function leerRemitente(port, mmUserId) {
  const r = await port.query(
    `select p.id as perfil_id, p.rol, p.persona_id
       from comunicacion.identidades i
       join auth.users u on lower(u.email) = lower(i.email)
       join public.perfiles p on p.id = u.id
      where i.plataforma = 'mattermost' and i.plataforma_user_id = $1 and i.activo
      limit 1`, [String(mmUserId)])
  const y = r?.rows?.[0]
  return y ? { perfilId: y.perfil_id, rol: y.rol ?? null, personaId: y.persona_id ?? null } : null
}

/** La entrega por su número, con lo que hace falta para decidir y para contestar. `null` si no existe. */
export async function leerEntrega(port, numero) {
  const r = await port.query(
    `select e.id, e.codigo, e.persona_id, e.estructura, coalesce(e.es_prueba, false) as es_prueba,
            e.anulada_en is not null as anulada, e.cerrada_en is not null as cerrada,
            o.nombre as obra, o.codigo as obra_codigo,
            coalesce(per.nombre_para_mostrar, per.nombre_completo) as persona,
            coalesce(per.es_prueba, false) as persona_prueba,
            (select i.plataforma_username
               from public.perfiles pf
               join auth.users u on u.id = pf.id
               join comunicacion.identidades i on lower(i.email) = lower(u.email) and i.plataforma = 'mattermost' and i.activo
              where pf.persona_id = e.persona_id
              limit 1) as mm_usuario
       from public.efectivo_entrega e
       left join public.obra_canonica o on o.id = e.obra_id
       left join public.personas per on per.id = e.persona_id
      where e.numero = $1`, [Number(numero)])
  return r?.rows?.[0] ?? null
}

/**
 * ¿El mensaje pide imputar a una entrega? `null` = NO (compra común: no se tocó la base). Si pide, devuelve
 * `{ok:true, entrega, remitente}` o el rechazo con el texto para el hilo. Falla cerrado: sin poder leer
 * quién manda o la entrega, no se carga.
 */
export async function imputacionPedida({ port, texto, actor }) {
  const numeros = codigosDeEntrega(texto)
  if (!numeros.length) return null
  if (typeof port?.query !== 'function' || !actor?.plataforma_user_id) return rechazo('no_verificable', TEXTO.NO_VERIFICABLE)
  let remitente
  let entrega
  try {
    remitente = await leerRemitente(port, actor.plataforma_user_id)
    entrega = numeros.length === 1 ? await leerEntrega(port, numeros[0]) : null
  } catch {
    return rechazo('no_verificable', TEXTO.NO_VERIFICABLE)
  }
  const d = decidirImputacion({ numeros, remitente, entrega })
  return d.ok ? { ok: true, entrega, remitente } : d
}

/** «Imputado a **ER-0020** (@emiliano) · a rendir». Sin plata: el canal lo ve todo el grupo. */
export function quienDe(entrega) {
  return entrega?.mm_usuario ? `@${entrega.mm_usuario}` : (entrega?.persona ?? 'sin persona')
}

/**
 * NÚCLEO PURO: el renglón que va al hilo, según lo que de verdad pasó.
 *
 * @param {{entrega:object, vinculadas:number, parte:object, enEspera:boolean}} p
 * @returns {{linea:string, descartar:boolean}} `descartar` = el ticket no va a rendir nunca (no quedó nada
 *   cargado ni en espera): se descarta para que no quede «Por imputar» para siempre en la ficha.
 */
export function cierreDeImputacion({ entrega, vinculadas = 0, parte = {}, enEspera = false } = {}) {
  const cod = `**${entrega.codigo}** (${quienDe(entrega)})`
  const ya = Number(parte?.yaEstaban) || 0
  const notaYa = ya > 0
    ? ` · ${ya === 1 ? '1 ya estaba en Compras y no se imputó' : `${ya} ya estaban en Compras y no se imputaron`}: se hace desde la ficha de la entrega`
    : ''
  if (vinculadas > 0) return { linea: `Imputado a ${cod} · a rendir${notaYa}`, descartar: false }
  if (enEspera || (Number(parte?.cargados) || 0) > 0 || (Number(parte?.reintentando) || 0) > 0) {
    return { linea: `Para ${cod} · a rendir: queda imputado en cuanto se termine de cargar${notaYa}`, descartar: false }
  }
  // LECTURA EN PAUSA (25/09/2026): no se leyó por la API, no por el papel. Se suelta el ticket y se pide de
  // nuevo con el número, sin culpar al comprobante.
  if ((parte?.pausados?.length ?? 0) > 0) {
    return {
      linea: `No imputé nada a ${cod} todavía: ${parte.pausados[0].motivo}. No es el comprobante: mandalo de nuevo con el número cuando vuelva la lectura.`,
      descartar: true,
    }
  }
  if (ya > 0) {
    return {
      linea: `No imputé nada a ${cod}: ya estaba en Compras. Se imputa desde la ficha de la entrega, con «Imputar un comprobante ya cargado».`,
      descartar: true,
    }
  }
  return { linea: `No imputé nada a ${cod}: no quedó ningún comprobante cargado.`, descartar: true }
}

/** El ticket, registrado ANTES de cargar (mismo criterio que el canal Efectivo). */
export async function registrarTicket(port, { entregaId, post, perfilId }) {
  await port.query(
    `insert into public.efectivo_comprobante (entrega_id, mm_post_id, canal, enviado_por)
     values ($1, $2, 'mattermost', $3) on conflict (mm_post_id) do nothing`,
    [entregaId, String(post), perfilId])
}

/**
 * DESPUÉS DE CARGAR: vincula, mide qué quedó atado a la entrega por ESTE post y arma el renglón.
 * Si no se pudo medir, lo dice como espera: nunca afirma «imputado» sin la fila de `efectivo_rendicion`.
 */
export async function cerrarTicket(port, { entrega, post, r, log }) {
  try { await port.query('select public.vincular_rendiciones_pendientes()') } catch (e) {
    log?.warn?.('comprobantes: no pude vincular la rendición ahora; lo hace la próxima vuelta', { error: String(e?.message ?? e) })
  }
  let vinculadas = 0
  let medido = true
  try {
    const q = await port.query(
      `select count(*)::int as n from public.efectivo_rendicion r
         join public.efectivo_comprobante c on c.id = r.comprobante_id
        where c.mm_post_id = $1`, [String(post)])
    vinculadas = Number(q?.rows?.[0]?.n) || 0
  } catch { medido = false }
  const c = cierreDeImputacion({ entrega, vinculadas, parte: r?.parte ?? {}, enEspera: !medido || r?.estado === 'confirmar' })
  if (c.descartar) {
    await port.query(
      `update public.efectivo_comprobante
          set descartado_en = now(), descartado_motivo = 'no quedó cargado en Compras desde el canal de comprobantes'
        where mm_post_id = $1 and descartado_en is null`, [String(post)]).catch(() => {})
  }
  return c
}

/** La obra que se le dice a la lectura: la de la entrega, como en el canal Efectivo. Estructura = ninguna. */
export const textoDeObra = (entrega) => (entrega?.estructura ? null : [entrega?.obra_codigo, entrega?.obra].filter(Boolean).join(' ') || null)
