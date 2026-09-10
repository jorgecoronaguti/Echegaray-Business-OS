// ESCRIBIR MOVIMIENTOS DE BANCO — un solo escritor, dos que lo llaman.
//
// Lo llaman `scripts/importar-banco.mjs` (la terminal) y `comunicacion/archivos/importacion.mjs`
// (el botón del chat). Antes el INSERT vivía adentro del script; sacarlo acá no es prolijidad, es la
// regla del OS: una capacidad, una fuente. Dos INSERT distintos sobre la misma tabla se separan a la
// primera corrección —ya pasó con la columna `referencia`, que faltaba en una de las listas y dejó el
// índice único viviendo sobre NULLs— y ahí el conteo empieza a mentir sin dar un solo error.
//
// ═══ LA RELECTURA NO ES UN EXTRA ═══
//
// `insertarMovimientos` devuelve los IDs que Postgres asignó, y `releerMovimientos` los trae DE VUELTA
// de la tabla. Eso es lo que se le muestra al dueño: el dato leído en su destino, no el contador del
// que escribió. Un importador que dice "cargué 12" prueba que contó hasta doce.

import { CUENTA } from './banco-santander.mjs'
import { normalizarReferencia } from './banco-importar.mjs'
import { cerrarDia } from './banco-acreditacion.mjs'

/**
 * MARCA DE LA FILA PROVISORIA. Un cobro probado por comprobante —el dueño manda la transferencia y el
 * dinero YA está en la cuenta— no puede esperar al próximo extracto para existir: mientras tanto CAJA
 * publica un saldo menor al real. Entra al banco con este prefijo en `origen` y, cuando llega el
 * extracto que lo contiene, se borra solo (`purgarProvisorios`, abajo).
 *
 * POR QUÉ ASÍ Y NO SUMANDO EN UNA PESTAÑA. El saldo de la cuenta tiene UNA fuente: la réplica del
 * banco. Un cobro sumado aparte queda dos veces el día que el extracto lo trae, y ese doble conteo no
 * da error: infla la caja en silencio.
 */
export const PROVISORIO = 'PROVISORIO · comprobante'

/**
 * Saca las filas provisorias que caen dentro de la ventana del extracto que se está cargando.
 *
 * LA CLAVE ES QUE CORRE ANTES DEL INSERT, NO DESPUÉS. El extracto trae el movimiento con su
 * referencia real y su saldo corrido; la fila provisoria tiene una referencia inventada por nosotros,
 * así que el índice único NO las junta. Si la provisoria sobreviviera, el mismo peso quedaría dos
 * veces y la cadena de saldos dejaría de cerrar.
 *
 * @returns {Promise<number>} cuántas provisorias se dieron de baja
 */
export async function purgarProvisorios(port, movs = [], { cuenta = CUENTA.numero } = {}) {
  const fechas = movs.map((m) => aFecha(m.fecha)).filter(Boolean).sort()
  if (!fechas.length) return 0
  const { rowCount } = await port.query(
    `delete from public.banco_movimientos
      where cuenta = $1 and origen like $2 and fecha >= $3::date and fecha <= $4::date`,
    [cuenta, `${PROVISORIO}%`, fechas[0], fechas[fechas.length - 1]])
  return rowCount ?? 0
}

/**
 * Inserta movimientos ignorando los que ya están: la deduplicación la impone el índice único
 * `(cuenta, referencia, importe)` de la base.
 *
 * LA REFERENCIA SE ESCRIBE. Es la columna por la que se cae la clave entera si falta: el índice
 * existe pero, sin el dato, vive sobre NULLs y no protege nada.
 *
 * @param {{query:Function}} port
 * @param {{fecha:string,concepto:string,importe:number,saldo?:number|null,referencia?:string|null}[]} movs
 * @param {string} origen  de dónde salió (queda escrito en la fila, para poder auditarla después)
 * @returns {Promise<{insertados:number, ids:number[]}>}
 */
/**
 * ¿La base ya tiene la columna de la retención de 48 hs?
 *
 * NO ES DEFENSA POR LAS DUDAS. `importar-banco.mjs` aplica sus migraciones antes de escribir, pero el
 * botón de importación del chat NO las aplica: entre el merge y la primera corrida del importador, un
 * INSERT que nombre la columna rompería la carga desde el chat. Se pregunta una vez por lote —cuesta
 * una consulta al catálogo— y el importador sigue siendo el que la crea.
 */
async function tieneColumnaPendiente(port) {
  try {
    const { rows } = await port.query(
      `select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'banco_movimientos'
          and column_name = 'acreditacion_pendiente'`)
    return rows.length > 0
  } catch { return false }
}

export async function insertarMovimientos(port, movs = [], origen = null, { cuenta = CUENTA.numero } = {}) {
  // El extracto manda sobre lo provisorio: si trae la ventana donde vive un cobro cargado por
  // comprobante, esa fila deja de hacer falta y su permanencia sería un duplicado.
  const purgados = String(origen ?? '').startsWith(PROVISORIO) ? 0 : await purgarProvisorios(port, movs, { cuenta })
  const conPendiente = await tieneColumnaPendiente(port)
  const ids = []
  for (const m of movs) {
    // LA MARCA SE ESCRIBE CON EL MOVIMIENTO, no después: un depósito retenido que entra sin marca ya
    // fue contado como saldo por todo lo que lee esta tabla.
    const r = await port.query(
      `insert into public.banco_movimientos (cuenta, fecha, concepto, importe, saldo_despues, origen, referencia${conPendiente ? ', acreditacion_pendiente' : ''})
       values ($1, $2, $3, $4, $5, $6, $7${conPendiente ? ', $8' : ''})
       on conflict do nothing
       returning id`,
      [cuenta, m.fecha, m.concepto, m.importe, m.saldo ?? null, origen, m.referencia ?? null,
        ...(conPendiente ? [m.acreditacionPendiente === true] : [])],
    )
    if (r.rows?.[0]?.id != null) ids.push(r.rows[0].id)
  }
  return { insertados: ids.length, ids, provisoriosDadosDeBaja: purgados }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA RETENCIÓN DE 48 HS: PONER LA MARCA, SACARLA, Y GUARDAR EL SALDO QUE DECLARA EL BANCO
// ══════════════════════════════════════════════════════════════════════════════════════════════════

/** El par que identifica el movimiento para el banco. Es la clave del índice único de la tabla. */
const porReferencia = (m) => [normalizarReferencia(m?.referencia), Number(m?.importe)]

/**
 * Marca como retenidos los depósitos que el extracto trae sin acreditar y YA estaban cargados.
 *
 * POR QUÉ HACE FALTA SI EL INSERT YA LOS MARCA. El importador es idempotente por referencia: volver a
 * correrlo sobre el mismo CSV no re-inserta nada, así que las filas cargadas ANTES de que existiera la
 * marca se quedarían con su saldo calculado —el inflado— para siempre.
 *
 * El `saldo_despues` se pone en NULL a propósito: un depósito que el banco no acreditó no tiene saldo
 * corrido propio. El que tenía era un cálculo nuestro, y era el error.
 *
 * @returns {Promise<number>} cuántas filas quedaron marcadas ahora
 */
export async function marcarAcreditacionPendiente(port, movs = [], { cuenta = CUENTA.numero } = {}) {
  let n = 0
  for (const m of movs.filter((x) => x?.acreditacionPendiente)) {
    const [ref, imp] = porReferencia(m)
    if (ref === null) continue // sin referencia no hay identidad: no se toca una fila por parecido
    const { rowCount } = await port.query(
      `update public.banco_movimientos
          set acreditacion_pendiente = true, saldo_despues = null
        where cuenta = $1 and referencia = $2 and importe = $3 and acreditacion_pendiente is not true`,
      [cuenta, ref, imp])
    n += rowCount ?? 0
  }
  return n
}

/**
 * Apaga la marca cuando un extracto POSTERIOR trae el depósito ya acreditado, con su saldo corrido.
 *
 * EL SALDO SE COPIA, NO SE RECALCULA. Es el número que imprimió el banco; reconstruirlo sería volver a
 * poner en el medio el cálculo que causó el problema. Es, además, lo que pedía la lección del 19/08:
 * *"rellenarles el saldo desde el extracto nuevo (que sí lo trae) antes de escribir _BANCO_RAW"*.
 *
 * @returns {Promise<number>} cuántos depósitos acreditó el banco desde la última corrida
 */
export async function acreditarPendientes(port, movs = [], { cuenta = CUENTA.numero } = {}) {
  let n = 0
  for (const m of movs.filter((x) => x?.saldo != null && !x?.acreditacionPendiente)) {
    const [ref, imp] = porReferencia(m)
    if (ref === null) continue
    const { rowCount } = await port.query(
      `update public.banco_movimientos
          set acreditacion_pendiente = false, saldo_despues = $4
        where cuenta = $1 and referencia = $2 and importe = $3 and acreditacion_pendiente`,
      [cuenta, ref, imp, m.saldo])
    n += rowCount ?? 0
  }
  return n
}

/**
 * Guarda la línea "Saldo al DD/MM/AAAA" del pie del extracto. Es la ÚNICA fuente independiente contra
 * la que se puede contrastar la cadena reconstruida — la tabla existía desde el 19/08 y nadie la
 * poblaba, así que el aviso "no coincide con el saldo declarado" nunca podía dispararse.
 *
 * Upsert por (cuenta, fecha): el mismo día se puede descargar dos veces y el último pie manda.
 */
export async function guardarSaldoDeclarado(port, pie, origen, { cuenta = CUENTA.numero } = {}) {
  if (!pie || !pie.cierre || !pie.fecha || !Number.isFinite(Number(pie.saldo))) return null
  await port.query(
    `insert into public.banco_saldo_declarado (cuenta, fecha, saldo, origen)
     values ($1, $2, $3, $4)
     on conflict (cuenta, fecha) do update
        set saldo = excluded.saldo, origen = excluded.origen, importado_en = now()`,
    [cuenta, pie.fecha, pie.saldo, origen])
  const { rows } = await port.query(
    'select fecha::text, saldo from public.banco_saldo_declarado where cuenta = $1 and fecha = $2',
    [cuenta, pie.fecha])
  return rows[0] ? { fecha: rows[0].fecha, saldo: Number(rows[0].saldo) } : null
}

/**
 * REESCRIBE LOS SALDOS CALCULADOS DE UN DÍA, Y SÓLO SI CIERRAN CONTRA EL BANCO.
 *
 * POR QUÉ. Los "Movimientos del Día" se guardan con un saldo que calculamos nosotros. El día que un
 * depósito retenido entró a esa cadena, TODAS las filas posteriores de la fecha quedaron infladas en
 * la base —$38.572.526,23 de más el 10/09— y el importador, idempotente por referencia, nunca las
 * vuelve a tocar. Marcar el depósito no alcanza: hay que rehacer la cadena de ese día.
 *
 * LAS TRES SALVAGUARDAS, porque esto PISA datos ya guardados:
 *   1. sólo la fecha del pie del extracto que se acaba de leer (el día en curso, el que vino sin saldo);
 *   2. se recalcula desde el último saldo conocido ANTERIOR a esa fecha, que no se toca;
 *   3. se escribe únicamente si el resultado coincide al peso con el saldo que declara el banco. Si no
 *      cierra, no se escribe nada y el cierre vuelve con su hallazgo: preferimos un saldo viejo
 *      explicado a uno nuevo que nadie puede verificar.
 *
 * @returns {Promise<{aplicado:boolean, actualizadas:number, cierre:object, ancla:number|null}>}
 */
export async function recalcularSaldosDelDia(port, fecha, saldoDeclarado, { cuenta = CUENTA.numero } = {}) {
  const { rows: previas } = await port.query(
    `select saldo_despues from public.banco_movimientos
      where cuenta = $1 and fecha < $2::date and saldo_despues is not null
      order by fecha desc, id desc limit 1`, [cuenta, fecha])
  const ancla = previas[0] ? Number(previas[0].saldo_despues) : null
  const { rows } = await port.query(
    `select id, concepto, importe from public.banco_movimientos
      where cuenta = $1 and fecha = $2::date order by id`, [cuenta, fecha])
  // El saldo guardado del día se IGNORA a propósito: es el número que hay que rehacer. La marca sale
  // del concepto y del importe, que son del banco.
  const delDia = rows.map((r) => ({ id: r.id, concepto: r.concepto, importe: Number(r.importe), saldo: null }))
  const serie = ancla == null ? delDia : [{ concepto: 'ancla', importe: 0, saldo: ancla }, ...delDia]
  const cierre = cerrarDia(serie, saldoDeclarado)
  if (cierre.cierra !== true) return { aplicado: false, actualizadas: 0, cierre, ancla }

  let corrido = ancla
  let actualizadas = 0
  for (const m of delDia) {
    const pendiente = cierre.pendientes.includes(m)
    const saldo = pendiente || corrido == null ? null : Math.round((corrido + m.importe) * 100) / 100
    if (!pendiente && corrido != null) corrido = saldo
    const { rowCount } = await port.query(
      `update public.banco_movimientos
          set saldo_despues = $2, acreditacion_pendiente = $3
        where id = $1 and (saldo_despues is distinct from $2 or acreditacion_pendiente is distinct from $3)`,
      [m.id, saldo, pendiente])
    actualizadas += rowCount ?? 0
  }
  return { aplicado: true, actualizadas, cierre, ancla }
}

/** Trae de la tabla las filas que quedaron. Es la EVIDENCIA: se lee el destino, no el intento. */
export async function releerMovimientos(port, ids = []) {
  if (!ids.length) return []
  const { rows } = await port.query(
    `select id, fecha, concepto, importe, saldo_despues as saldo, referencia
       from public.banco_movimientos where id = any($1::bigint[]) order by fecha, id`,
    [ids])
  return rows.map(normalizarFila)
}

/** Los movimientos ya cargados de la cuenta, en el orden del extracto. Para deduplicar. */
export async function movimientosCargados(port, { cuenta = CUENTA.numero } = {}) {
  const { rows } = await port.query(
    // ORDER BY fecha, id: dos movimientos del MISMO día sólo se distinguen por el orden en que el
    // banco los listó, que es el orden en que se insertaron.
    `select fecha, concepto, importe, saldo_despues as saldo, referencia
       from public.banco_movimientos where cuenta = $1 order by fecha, id`,
    [cuenta])
  return rows.map(normalizarFila)
}

/** Cuántos hay y hasta cuándo llega el extracto en la base. Lo que se le contesta al dueño al final. */
export async function estadoCuenta(port, { cuenta = CUENTA.numero } = {}) {
  const { rows } = await port.query(
    'select count(*)::int as n, max(fecha) as hasta from public.banco_movimientos where cuenta = $1', [cuenta])
  const r = rows?.[0] ?? {}
  return { total: r.n ?? 0, cobertura: r.hasta ? aFecha(r.hasta) : null }
}

const aFecha = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10))

function normalizarFila(r) {
  return {
    ...(r.id != null ? { id: r.id } : {}),
    fecha: aFecha(r.fecha),
    concepto: r.concepto,
    importe: Number(r.importe),
    saldo: r.saldo == null ? null : Number(r.saldo),
    // La base guarda las referencias sin ceros a la izquierda y el extracto las trae con ellos:
    // `novedades` normaliza los dos lados, acá se pasa el dato tal cual está.
    referencia: r.referencia ?? null,
  }
}
