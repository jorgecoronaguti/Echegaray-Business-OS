// EL CONSUMIDOR DE LA COLA QUE ESCRIBE LA COLUMNA «OBRA» DE COMPRAS.
//
// La app elige la obra de una fila con `compra_obra_asignar` (migración 20260915T0700): la base guarda
// en `compra_sheet` y deja el pedido en `public.compra_obra_cambio`. Acá termina el viaje, con la forma
// de `comunicacion/cobranzas/cola-cambios.mjs`: se toma el cambio más viejo, se RELEE la fila del
// Sheet, el bisturí (`lib/bisturi-compras-obra.mjs`) decide, se escribe UNA celda, se RELEE lo escrito
// y se guarda en `leido_de_vuelta`. La base es la fuente; el Sheet refleja.
//
// ═══ EL FRENO DE MANO: `confirmacion` CON EL NOMBRE DE QUIEN PIDIÓ ═══
//
// Mismo razonamiento que en Cobranzas: `ORQ_SHEETS_DESCONGELAR` en la unidad sería un bypass permanente.
// La puerta es `confirmacion: { actor, motivo }` con la persona que eligió la obra — `pedido_por` (su
// perfil) o, si vino del chat, `pedido_por_nombre`. Sin nombre no hay escritura.
//
// ═══ TRES DIFERENCIAS CON COBRANZAS, Y POR QUÉ ═══
//
//   1. Relectura distinta = `error`, no `aplicado`. Cobranzas guarda lo releído y cierra igual; acá la
//      prueba de la escritura ES la relectura, y una celda que no dice lo pedido (la guarda central
//      re-inyectó lo del dueño, o alguien la tocó en el mismo segundo) no puede cerrarse como hecha.
//   2. Diferir NO consume reintentos. En Cobranzas cada vuelta con el freno puesto suma `intentos`, y la
//      primera falla técnica posterior cierra en `error` un cambio que nunca se intentó escribir.
//   3. Un diferido corta la corrida. El freno, el candado o la columna que falta no se levantan en el
//      mismo minuto; seguir tomaría el mismo cambio (el más viejo) hasta `max` veces.
//
// Todo entra inyectado (`port`, `google`): se prueba con dobles, sin Postgres ni Google.
import { planificarObra, relecturaConfirma } from '../../lib/bisturi-compras-obra.mjs'
import { rangoEncabezado, rangoFilas } from '../../lib/columnas-por-encabezado.mjs'

/** Cuántos minutos puede quedar un cambio en `procesando` antes de darlo por colgado. */
export const LEASE_MIN = Number(process.env.ORQ_COMPRA_OBRA_CAMBIO_LEASE_MIN || 10)
export const MAX_INTENTOS = 3

// Sin formato, como lee el sync: la clave del comprobante tiene que salir idéntica a `compra_sheet.clave`.
const SIN_FORMATO = { render: 'UNFORMATTED_VALUE' }

async function idDelCashflow() {
  const { CASHFLOW_ID } = await import('../../lib/cash-briefing.mjs')
  return CASHFLOW_ID
}

/** Devuelve a la cola lo que quedó `procesando` de un worker que murió a mitad de camino. */
export async function reciclarColgados(port, { minutos = LEASE_MIN, maxIntentos = MAX_INTENTOS } = {}) {
  const r = await port.query(
    `update public.compra_obra_cambio
        set estado = case when intentos >= $2 then 'error' else 'pendiente' end,
            motivo = case when intentos >= $2
                          then 'la escritura se cortó a la mitad y ya no quedan reintentos'
                          else motivo end
      where estado = 'procesando' and tomado_at < now() - make_interval(mins => $1::int)
      returning id`,
    [minutos, maxIntentos],
  )
  return r?.rows?.length ?? 0
}

/** Toma UN cambio y lo marca `procesando` en el mismo UPDATE: dos workers no se llevan el mismo. */
export async function tomarCambio(port) {
  const r = await port.query(
    `update public.compra_obra_cambio c
        set estado = 'procesando', tomado_at = now(), intentos = c.intentos + 1
      where c.id = (select id from public.compra_obra_cambio
                     where estado = 'pendiente' order by creado_at limit 1
                     for update skip locked)
      returning c.*`,
  )
  return r?.rows?.[0] ?? null
}

/** Para `--dry`: los pendientes, SIN tomarlos. Una corrida en seco no cambia ni un estado. */
export async function verPendientes(port, max) {
  const r = await port.query(
    `select * from public.compra_obra_cambio where estado = 'pendiente' order by creado_at limit $1`, [max],
  )
  return r?.rows ?? []
}

/** Quién pidió el cambio: su perfil, o el nombre que dejó el chat. Sin nombre, `null`. */
export async function actorDelCambio(port, cambio) {
  if (cambio?.pedido_por) {
    const r = await port.query('select nombre from public.perfiles where id = $1', [cambio.pedido_por])
    const nombre = String(r?.rows?.[0]?.nombre ?? '').trim()
    if (nombre) return nombre
  }
  return String(cambio?.pedido_por_nombre ?? '').trim() || null
}

// SIN `.catch()`: una lectura fallida que devuelve vacío haría que la huella no coincida y el cambio se
// cerraría `rechazado` —terminal— por una caída de red. Que suba y se reintente.
const leerEncabezado = async (google, fileId) =>
  (await google.readSheetValues(fileId, rangoEncabezado('Compras'), SIN_FORMATO))?.[0] ?? []

const leerFila = async (google, fileId, fila) =>
  (await google.readSheetValues(fileId, rangoFilas('Compras', fila, fila), SIN_FORMATO))?.[0] ?? []

/**
 * El catálogo contra el que se valida el valor ANTES de escribir: el mismo universo que el desplegable de
 * la app y que `public.obra_celda_resolver`. Sin `.catch()`: sin catálogo no hay validación (difiere).
 */
export async function leerObras(port) {
  const r = await port.query('select id, codigo, nombre, cliente_texto, fusionada_en from public.obra_canonica')
  return r?.rows ?? []
}

/** La decisión sin efectos: la usa la corrida real y la corrida en seco, así las dos dicen lo mismo. */
export async function decidir({ port, google, fileId, cambio, encabezado, obras }) {
  const actor = await actorDelCambio(port, cambio)
  if (!actor) {
    return { accion: 'rechazar', motivo: 'sin_actor', detalle: 'el cambio no tiene una persona identificada y el Sheet no se escribe sin nombre' }
  }
  const fila = await leerFila(google, fileId, Number(cambio.fila))
  return { ...planificarObra({ cambio, encabezado, fila, obras: obras ?? await leerObras(port) }), actor }
}

const marcar = (port, id, estado, motivo) => port.query(
  'update public.compra_obra_cambio set estado = $2, motivo = $3 where id = $1',
  [id, estado, motivo ?? null],
)

/** Diferir devuelve el intento: esperar a que se levante un freno no es haber intentado escribir. */
const diferir = (port, id, motivo) => port.query(
  `update public.compra_obra_cambio
      set estado = 'pendiente', motivo = $2, intentos = greatest(intentos - 1, 0)
    where id = $1`,
  [id, motivo],
)

const cerrar = (port, id, { estado, motivo, leido }) => port.query(
  `update public.compra_obra_cambio
      set estado = $2, motivo = $3, leido_de_vuelta = $4,
          aplicado_at = case when $2 = 'aplicado' then now() else aplicado_at end
    where id = $1`,
  [id, estado, motivo ?? null, leido ?? null],
)

/** Escribe la celda del plan, con el freno levantado por quien pidió. Devuelve el estado final. */
async function escribirYReleer({ port, google, fileId, cambio, plan }) {
  const r = await google.batchUpdateValues(
    fileId,
    [{ range: plan.celda, values: [[plan.valor]] }],
    { confirmacion: { actor: plan.actor, motivo: `obra de la compra elegida en la app por ${plan.actor} (cambio ${cambio.id})` } },
  )
  if (r?.congelado) { await diferir(port, cambio.id, 'el freno de mano de Sheets está puesto'); return 'diferido' }
  if (r?.protegido) {
    // Vaciar una celda con dato lo frena no-borrar, y eso no se levanta solo: se vacía a mano.
    if (r.noBorrar && plan.valor === '') {
      await cerrar(port, cambio.id, { estado: 'rechazado', motivo: `no-borrar no deja vaciar ${plan.celda} desde un worker: se vacía a mano en el Sheet` })
      return 'rechazado'
    }
    await diferir(port, cambio.id, `pestaña protegida: ${r.motivo ?? 'candado'}`)
    return 'diferido'
  }
  // La escritura YA ocurrió: si no se puede releer, no se finge el cierre. Vuelve a la cola, y la vuelta
  // siguiente la cierra por `ya_aplicado` con la celda leída como evidencia.
  const vuelta = await google.readSheetValues(fileId, plan.celda).catch(() => null)
  if (vuelta === null) {
    const agotado = cambio.intentos >= MAX_INTENTOS
    await marcar(port, cambio.id, agotado ? 'error' : 'pendiente', `${plan.celda} escrita pero no pude releerla: sin evidencia no se cierra`)
    return 'error'
  }
  const leido = String(vuelta?.[0]?.[0] ?? '')
  if (!relecturaConfirma(leido, plan.valor)) {
    await cerrar(port, cambio.id, { estado: 'error', motivo: `relectura distinta: ${plan.celda} dice «${leido}» y se escribió «${plan.valor}»`, leido })
    return 'error'
  }
  await cerrar(port, cambio.id, { estado: 'aplicado', motivo: `${plan.celda} escrita por ${plan.actor}`, leido })
  return 'aplicado'
}

/**
 * APLICA UN CAMBIO. Verificar → escribir → releer, en ese orden. Una escritura no es buena porque la
 * API devolvió 200: es buena cuando la celda, releída, dice lo pedido.
 */
export async function aplicarCambio({ port, google, fileId, cambio, encabezado, obras }) {
  const plan = await decidir({ port, google, fileId, cambio, encabezado, obras })
  if (plan.accion === 'rechazar') {
    await cerrar(port, cambio.id, { estado: 'rechazado', motivo: `${plan.motivo}: ${plan.detalle}` })
    return 'rechazado'
  }
  if (plan.accion === 'diferir') {
    await diferir(port, cambio.id, `${plan.motivo}: ${plan.detalle}`)
    return 'diferido'
  }
  if (plan.accion === 'ya_aplicado') {
    await cerrar(port, cambio.id, { estado: 'aplicado', motivo: 'la celda ya decía lo pedido: no se volvió a escribir', leido: plan.actual })
    return 'aplicado'
  }
  return escribirYReleer({ port, google, fileId, cambio, plan })
}

/** Qué haría con cada pendiente, sin tomar ninguno, sin escribir el Sheet y sin tocar la base. */
async function planEnSeco({ port, google, fileId, max }) {
  const pendientes = await verPendientes(port, max)
  if (!pendientes.length) return []
  const encabezado = await leerEncabezado(google, fileId)
  const obras = await leerObras(port)
  const plan = []
  for (const cambio of pendientes) {
    plan.push({ id: cambio.id, fila: cambio.fila, ...await decidir({ port, google, fileId, cambio, encabezado, obras }) })
  }
  return plan
}

/** Vacía la cola, o con `dry` sólo dice qué escribiría. `max` acota una corrida. */
export async function procesarCola({ port, google, fileId = null, max = 20, dry = true } = {}) {
  const id = fileId ?? await idDelCashflow()
  if (dry) return { dry: true, plan: await planEnSeco({ port, google, fileId: id, max }) }

  const cuenta = { dry: false, reciclados: await reciclarColgados(port), aplicado: 0, rechazado: 0, diferido: 0, error: 0 }
  // La fila de rótulos, UNA vez por corrida y sólo si hay algo que aplicar.
  let encabezado = null
  let obras = null
  for (let i = 0; i < max; i += 1) {
    const cambio = await tomarCambio(port)
    if (!cambio) break
    let estado
    try {
      encabezado = encabezado ?? await leerEncabezado(google, id)
      obras = obras ?? await leerObras(port)
      estado = await aplicarCambio({ port, google, fileId: id, cambio, encabezado, obras })
    } catch (e) {
      estado = 'error'
      const agotado = cambio.intentos >= MAX_INTENTOS
      await marcar(port, cambio.id, agotado ? 'error' : 'pendiente', `falla técnica: ${e.message}`)
    }
    cuenta[estado] += 1
    if (estado === 'diferido') break
  }
  return cuenta
}
