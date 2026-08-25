// EL CONSUMIDOR DE LA COLA QUE ESCRIBE EN COBRANZAS (pantallas 28 y 32).
//
// La app deja una fila en `public.cobranza_cambio`. Acá termina el viaje: se toma el cambio más
// viejo, se RELEE la fila del Sheet, se verifica que sea la misma fila que la pantalla vio, se
// escribe una sola celda (más la nota), se RELEE lo escrito y se guarda en `leido_de_vuelta`.
//
// ═══ EL FRENO DE MANO: POR QUÉ `confirmacion` Y NO `ORQ_SHEETS_DESCONGELAR` ═══
//
// La variable de entorno es la puerta para una PERSONA que tipea un comando. Ponerla en la unidad de
// systemd la convertiría en un bypass permanente, que es exactamente el defecto contra el que el
// congelador fue escrito («un freno que se puede saltear con una opción no es un freno»), y dejaría
// una sola línea de log por proceso en vez de una por escritura.
//
// La puerta correcta es la otra: `confirmacion: { actor, motivo }`. Y es legítima, no un rodeo — la
// fila de la cola TIENE una persona identificada (`pedido_por`, con FK a auth.users) que apretó un
// botón en la app, igual que quien confirma en el chat. El actor que llega al congelador es esa
// persona, no el worker. Si la fila no tiene un usuario con nombre, el cambio NO se aplica: sin
// identidad real no hay escritura.
//
// ═══ TODO ENTRA INYECTADO ═══
//
// `port` (Postgres) y `google` entran por parámetro para poder probar el reparto de estados, el
// rechazo por huella y el reciclado de lo colgado con dobles en memoria — sin Postgres, sin Google y
// sin acercarse al Sheet real.
import { planificarEscritura } from '../../lib/portal/bisturi-cobranzas.mjs'

/** Cuántos minutos puede quedar un cambio en `procesando` antes de darlo por colgado. */
export const LEASE_MIN = Number(process.env.ORQ_COBRANZA_CAMBIO_LEASE_MIN || 10)
export const MAX_INTENTOS = 3

/** El id del Flujo de Caja. Se importa perezosamente para que los tests no necesiten la config. */
async function idDelCashflow() {
  const { CASHFLOW_ID } = await import('../../lib/cash-briefing.mjs')
  return CASHFLOW_ID
}

/**
 * Devuelve a la cola lo que quedó `procesando` de un worker que se murió a mitad de camino.
 * Sin esto, un reinicio de la VM deja el cobro en «procesando» para siempre y la pantalla gira sobre
 * algo que nadie va a mirar.
 */
export async function reciclarColgados(port, { minutos = LEASE_MIN, maxIntentos = MAX_INTENTOS } = {}) {
  const r = await port.query(
    `update public.cobranza_cambio
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

/**
 * Toma UN cambio y lo marca `procesando` en el mismo UPDATE.
 *
 * `for update skip locked` sobre el más viejo: si dos workers arrancan juntos, cada uno se lleva uno
 * distinto en vez de pelearse por el mismo. Dos escrituras del mismo cambio serían dos cobros.
 */
export async function tomarCambio(port) {
  const r = await port.query(
    `update public.cobranza_cambio c
        set estado = 'procesando', tomado_at = now(), intentos = c.intentos + 1
      where c.id = (select id from public.cobranza_cambio
                     where estado = 'pendiente' order by pedido_at limit 1
                     for update skip locked)
      returning c.*`,
  )
  return r?.rows?.[0] ?? null
}

/** Quién pidió el cambio. Sin nombre no hay escritura: el congelador exige identidad real. */
export async function actorDelCambio(port, cambio) {
  if (!cambio?.pedido_por) return null
  const r = await port.query('select nombre, rol from public.perfiles where id = $1', [cambio.pedido_por])
  const p = r?.rows?.[0]
  return p?.nombre ? { nombre: p.nombre, rol: p.rol, id: cambio.pedido_por } : null
}

const LETRAS = ['C', 'D', 'E', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'W']

/** Relee la fila del Sheet: valores para la huella, fórmulas para saber si se puede tocar J. */
export async function leerFila(google, fileId, fila) {
  const rango = `Cobranzas!A${fila}:AC${fila}`
  // SIN `.catch()`. Tragarse un error de lectura acá deja `leido` vacío, la huella no coincide y el
  // cambio se cierra como `rechazado` —que es TERMINAL—: una caída de red de tres segundos mataría
  // para siempre un cobro legítimo. Que la excepción suba: el llamador la trata como falla técnica y
  // la reintenta. Lo encontró el test de la falla técnica, no una lectura del código.
  const [valores = []] = await google.readSheetValues(fileId, rango)
  const [formulas = []] = await google.readSheetValues(fileId, rango, { render: 'FORMULA' })
  const en = (arr, letra) => arr?.[letra.charCodeAt(0) - 65] ?? null
  const f = {}
  for (const l of LETRAS) f[l] = en(formulas, l)
  return {
    leido: {
      comprobante: en(valores, 'E'),
      // El neto se lee del VALOR (no de la fórmula): la huella compara importes, no expresiones.
      monto_neto: Number(String(en(valores, 'J') ?? '').replace(/[^\d,-]/g, '').replace(',', '.')) || null,
      nota: en(formulas, 'W'),   // la nota se relee CRUDA para apendar sin perder saltos de línea
      estado: en(valores, 'O'),
    },
    formulas: f,
  }
}

/** Todo cambio de estado pasa por acá, con la MISMA forma de parámetros. Una consulta que embebe el
 *  estado en el SQL y otra que lo parametriza es una máquina de estados que hay que leer dos veces. */
const marcar = (port, id, estado, motivo) => port.query(
  'update public.cobranza_cambio set estado = $2, motivo = $3 where id = $1',
  [id, estado, motivo ?? null],
)

const cerrar = (port, id, campos) => port.query(
  `update public.cobranza_cambio
      set estado = $2, motivo = $3, leido_de_vuelta = $4,
          aplicado_at = case when $2 = 'aplicado' then now() else aplicado_at end
    where id = $1`,
  [id, campos.estado, campos.motivo ?? null, campos.leido_de_vuelta ?? null],
)

/**
 * APLICA UN CAMBIO. Devuelve el estado en que quedó, para que el llamador lo reporte.
 *
 * El orden importa y no es negociable: verificar → escribir → releer. Una escritura NO se da por
 * buena porque la API devolvió 200; se da por buena cuando la celda, releída, dice lo que tiene que
 * decir.
 */
export async function aplicarCambio({ port, google, fileId, cambio }) {
  const actor = await actorDelCambio(port, cambio)
  if (!actor) {
    await cerrar(port, cambio.id, { estado: 'rechazado', motivo: 'el cambio no tiene un usuario identificado y el Sheet no se escribe sin nombre' })
    return 'rechazado'
  }

  const { leido, formulas } = await leerFila(google, fileId, cambio.cobranza_fila)
  const nota = `OS ${new Date().toISOString().slice(0, 10)}: ${cambio.campo} → ${cambio.valor_nuevo ?? 'Cobrado'} (${actor.nombre})`
  const { celdas, rechazo } = planificarEscritura({
    fila: cambio.cobranza_fila, cambio, leido, formulas, nota,
  })

  if (rechazo) {
    // `rechazado` es TERMINAL y no se reintenta: la huella no va a coincidir sola en el intento
    // siguiente, y reintentar una escritura dudosa contra el Flujo de Caja es peor que no hacerla.
    await cerrar(port, cambio.id, { estado: 'rechazado', motivo: `${rechazo.motivo}: ${rechazo.detalle}` })
    return 'rechazado'
  }

  const motivoFreno = `cobro registrado en la app por ${actor.nombre} (cambio ${cambio.id})`
  const r = await google.batchUpdateValues(
    fileId,
    celdas.map((c) => ({ range: c.rango, values: [[c.valor]] })),
    { confirmacion: { actor: actor.nombre, motivo: motivoFreno } },
  )
  if (r?.congelado || r?.protegido) {
    // Vuelve a `pendiente` (no `error`): el freno o el candado son estados del mundo que se levantan,
    // no defectos del cambio. Cuando se levanten, el cambio se aplica solo.
    await marcar(port, cambio.id, 'pendiente',
      r.congelado ? 'el freno de mano de Sheets está puesto' : `pestaña protegida: ${r.motivo ?? 'candado'}`)
    return 'diferido'
  }

  // LA EVIDENCIA DEL EFECTO: qué dice la celda AHORA.
  const objetivo = celdas[0].rango
  // Acá el `.catch()` sí corresponde y es lo contrario del de arriba: la escritura YA ocurrió. Si la
  // relectura falla, el cambio está aplicado igual y lo que falta es la evidencia — se dice, no se
  // finge. Un `leido_de_vuelta` vacío significa «no pude mirar», no «la celda está vacía».
  const [vuelta] = await google.readSheetValues(fileId, objetivo).catch(() => [null])
  const leidoDeVuelta = vuelta === null ? '(no pude releer la celda)' : String(vuelta?.[0] ?? '')
  await cerrar(port, cambio.id, {
    estado: 'aplicado',
    motivo: `${objetivo} escrita por ${actor.nombre}`,
    leido_de_vuelta: leidoDeVuelta,
  })
  return 'aplicado'
}

/** Vacía la cola. `max` acota una corrida para que el timer no se quede escribiendo indefinidamente. */
export async function procesarCola({ port, google, fileId = null, max = 20 } = {}) {
  const id = fileId ?? await idDelCashflow()
  const reciclados = await reciclarColgados(port)
  const cuenta = { reciclados, aplicado: 0, rechazado: 0, diferido: 0, error: 0 }

  for (let i = 0; i < max; i += 1) {
    const cambio = await tomarCambio(port)
    if (!cambio) break
    try {
      cuenta[await aplicarCambio({ port, google, fileId: id, cambio })] += 1
    } catch (e) {
      cuenta.error += 1
      const agotado = cambio.intentos >= MAX_INTENTOS
      await marcar(port, cambio.id, agotado ? 'error' : 'pendiente', `falla técnica: ${e.message}`)
    }
  }
  return cuenta
}
