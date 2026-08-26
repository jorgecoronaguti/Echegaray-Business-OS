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
export async function insertarMovimientos(port, movs = [], origen = null, { cuenta = CUENTA.numero } = {}) {
  // El extracto manda sobre lo provisorio: si trae la ventana donde vive un cobro cargado por
  // comprobante, esa fila deja de hacer falta y su permanencia sería un duplicado.
  const purgados = String(origen ?? '').startsWith(PROVISORIO) ? 0 : await purgarProvisorios(port, movs, { cuenta })
  const ids = []
  for (const m of movs) {
    const r = await port.query(
      `insert into public.banco_movimientos (cuenta, fecha, concepto, importe, saldo_despues, origen, referencia)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict do nothing
       returning id`,
      [cuenta, m.fecha, m.concepto, m.importe, m.saldo ?? null, origen, m.referencia ?? null],
    )
    if (r.rows?.[0]?.id != null) ids.push(r.rows[0].id)
  }
  return { insertados: ids.length, ids, provisoriosDadosDeBaja: purgados }
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
