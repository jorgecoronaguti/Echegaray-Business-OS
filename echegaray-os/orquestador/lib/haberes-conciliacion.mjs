// LOS HABERES PAGADOS CONTRA LAS QUINCENAS QUE LOS EXPLICAN.
//
// ═══ POR QUÉ EXISTE (13/08/2026) ═══
//
// El Santander muestra un comprobante de pago de haberes del 13/08 a las 10:02 por $239.790,94 a una
// sola persona. El extracto de ese día se generó a las 08:53, así que el banco todavía no lo tiene: el
// saldo bancario del OS está alto por ese importe hasta que llegue el extracto siguiente.
//
// Y el pago no encaja en el modelo. La pestaña "Jornales por Quincena" registra la nómina por
// QUINCENA ENTERA —una fecha "Pagado el", un importe "Banco"— y la caja la descarga con
// `formulaJornalesBancoPosteriores`, que mira `ISNUMBER(JORNALES_REAL_PAGADO)*(pagado>corte)`. Un pago
// individual, hecho a mitad de una quincena que todavía no cerró, no tiene dónde entrar:
//
//   · si se le pone "Pagado el" a la quincena en curso, la caja descuenta la quincena ENTERA — plata
//     que todavía no salió;
//   · si no se registra nada, la caja no descuenta nada y el saldo queda inflado.
//
// Las dos salidas son falsas, así que la respuesta correcta NO es imputarlo solo: es que grite. Este
// módulo empareja lo que el banco pagó contra lo que las quincenas declaran, y deja a la vista lo que
// ninguna quincena reclama. Es el mismo criterio que el repo ya aplica en otros lados: un rango que no
// empareja no se escribe, se declara.
//
// ═══ EL DEFECTO HISTÓRICO QUE ESTO NO PUEDE REPETIR ═══
//
// La proyección de jornales volvía a proyectar una quincena YA PAGADA porque arrancaba en la fecha
// DESDE de la última quincena real en vez del día siguiente. Contaba la misma nómina dos veces con dos
// números distintos. Acá el equivalente sería que un mismo pago del banco respalde a dos quincenas: por
// eso un pago se consume una sola vez, y la quincena que lo toma se lo lleva — el que quede sin
// respaldo se ve, no se reparte.
//
// ═══ LO QUE ESTE CONTROL NO PUEDE AFIRMAR ═══
//
// El lote de "Pago haberes" del banco NO distingue a quién le paga: mezcla obra, oficina y cualquier
// liquidación que salga por el mismo canal. Medido el 13/08 sobre el lote 260731507: $5.815.096,20 en
// 16 movimientos, y sólo $3.083.408,52 se emparejan uno a uno con las filas del espejo de obreros.
// Los $2.731.687,68 restantes salieron de la cuenta como haberes y ninguna fila del bloque de obra los
// reclama — pueden ser oficina, SAC o una liquidación final, y este módulo NO puede decidirlo.
//
// Por eso una diferencia se REPORTA y nunca se imputa sola. Repartirla "porque tiene que ser de
// alguien" es cómo un control deja de ser un control.
//
// NÚCLEO PURO: entran fechas ISO y números, sale la conciliación. No lee Google, no toca la base, no
// mira el reloj.

const DIA = 86400000
const iso = (s) => String(s ?? '').slice(0, 10)
const dia = (s) => Date.parse(`${iso(s)}T00:00:00Z`)
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.abs(n) : 0 }
const cent = (v) => Math.round(num(v) * 100)

/**
 * LA FECHA DE PAGO DE UNA QUINCENA, EN EL MISMO ORDEN QUE MANDA EN LA CAJA.
 *
 * `pagado_el` es el HECHO (la columna que el dueño marca y la que la caja exige con ISNUMBER);
 * `se_paga_el` es la fecha PREVISTA y sólo sirve para emparejar una quincena todavía sin marcar. Una
 * quincena sin ninguna de las dos no reclama ningún pago: es la quincena en curso, y darle un pago
 * sería adelantarle plata que no salió.
 */
export function fechaDePago(q = {}) {
  return iso(q.pagado_el) || iso(q.se_paga_el) || null
}

/**
 * NÚCLEO PURO: empareja pagos de haberes con las quincenas que los declaran.
 *
 * El emparejamiento es por FECHA (±`ventana` días), que es como el extracto ya probó que funciona: la
 * quincena que cerró el 15/07 se pagó el 17/07 en el lote 260717507. No por importe, porque el lote
 * llega partido en un movimiento por persona y ningún movimiento individual coincide con el total.
 *
 * UN PAGO SE CONSUME UNA SOLA VEZ. Si dos quincenas caen dentro de la ventana, se lo lleva la de fecha
 * más cercana (y ante empate, la de cierre más reciente): repartir el mismo pago entre dos quincenas es
 * la forma exacta de dar por pagada dos veces la misma plata.
 *
 * @param {{pagos:Array, quincenas:Array, corte?:string, ventana?:number}} e
 * @returns {{quincenas:Array, huerfanos:Array, anunciados:Array, avisos:string[]}}
 */
export function conciliarHaberes({ pagos = [], quincenas = [], corte = null, ventana = 3 } = {}) {
  const qs = quincenas.map((q, i) => ({
    i,
    desde: iso(q.desde),
    hasta: iso(q.hasta),
    fecha_pago: fechaDePago(q),
    banco_declarado: num(q.banco),
    pagos: [],
  }))
  const huerfanos = []
  for (const p of pagos) {
    const q = mejorQuincena(qs, p, ventana)
    if (!q) { huerfanos.push(normalizarPago(p)); continue }
    q.pagos.push(normalizarPago(p))
  }
  const cierre = qs.map((q) => {
    const pagado = q.pagos.reduce((a, x) => a + cent(x.importe), 0)
    return {
      desde: q.desde,
      hasta: q.hasta,
      fecha_pago: q.fecha_pago,
      banco_declarado: q.banco_declarado,
      banco_pagado: pagado / 100,
      // Positivo = la quincena declara más banco del que el extracto muestra (falta un pago o el
      // extracto todavía no llegó). Negativo = el banco pagó más de lo que la quincena declara.
      diferencia: Math.round(cent(q.banco_declarado) - pagado) / 100,
      pagos: q.pagos,
    }
  })
  // ═══ EL MISMO DÍA DEL CORTE TAMBIÉN ES "DESPUÉS" (13/08) ═══
  //
  // El corte del extracto tiene HORA y este módulo trabaja en días. El caso que lo obligó: el extracto
  // del 13/08 se generó a las 08:53 y el pago se hizo a las 10:02 — mismo día, y NO está en el
  // extracto. Con `>` estricto el pago quedaba dado por incluido y el saldo bancario del OS afirmaba
  // tener $239.790,94 que ya no estaban.
  //
  // Sólo se evalúan los pagos de origen `comprobante`: un pago que SALIÓ del extracto está en el
  // extracto por definición, así que compararlo contra su propio corte sería marcarlo por su fecha en
  // vez de por su origen.
  const anunciados = pagos
    .filter((p) => corte && String(p.origen ?? 'extracto') === 'comprobante' && dia(p.fecha) >= dia(corte))
    .map(normalizarPago)
  return { quincenas: cierre, huerfanos, anunciados, avisos: avisosDe(cierre, huerfanos, anunciados) }
}

/** La quincena más cercana dentro de la ventana, o null. Una quincena sin fecha de pago no compite. */
function mejorQuincena(qs, pago, ventana) {
  const f = dia(pago.fecha)
  if (!Number.isFinite(f)) return null
  let mejor = null
  let mejorDist = Infinity
  for (const q of qs) {
    if (!q.fecha_pago) continue
    const d = Math.abs(dia(q.fecha_pago) - f)
    if (!Number.isFinite(d) || d > ventana * DIA) continue
    if (d < mejorDist || (d === mejorDist && q.hasta > (mejor?.hasta ?? ''))) { mejor = q; mejorDist = d }
  }
  return mejor
}

function normalizarPago(p = {}) {
  return {
    fecha: iso(p.fecha),
    importe: num(p.importe),
    beneficiario: String(p.beneficiario ?? '').trim(),
    cuil: String(p.cuil ?? '').replace(/\D/g, ''),
    referencia: String(p.referencia ?? '').trim(),
    // 'extracto' = el banco ya lo muestra · 'comprobante' = hay una constancia del banco pero el
    // extracto todavía no llegó. La distinción decide si la caja ya lo tiene descontado o no.
    origen: String(p.origen ?? 'extracto').trim(),
  }
}

const $ = (v) => `$${Number(v ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Lo que hay que mirar, dicho como problema y no como tabla. PURO. */
function avisosDe(quincenas, huerfanos, anunciados) {
  const out = []
  for (const h of huerfanos) {
    out.push(`PAGO DE HABERES SIN QUINCENA: ${h.fecha} · ${$(h.importe)}`
      + `${h.beneficiario ? ` · ${h.beneficiario}` : ''}. Ninguna quincena declara un pago en esa fecha, `
      + 'así que no está en el costo de ninguna y la caja no lo descuenta. Decidí a qué quincena '
      + 'pertenece antes de cargarlo: ponerle "Pagado el" a la quincena en curso descontaría la quincena entera.')
  }
  for (const a of anunciados) {
    if (a.origen !== 'comprobante') continue
    out.push(`PAGO POSTERIOR AL CORTE DEL EXTRACTO: ${a.fecha} · ${$(a.importe)}`
      + `${a.beneficiario ? ` · ${a.beneficiario}` : ''}. El banco lo confirmó pero el extracto todavía `
      + 'no lo muestra: el saldo bancario del OS está alto por ese importe hasta la próxima importación.')
  }
  for (const q of quincenas) {
    if (!q.pagos.length || Math.abs(q.diferencia) < 1) continue
    out.push(`QUINCENA ${q.desde}–${q.hasta}: declara ${$(q.banco_declarado)} por banco y el extracto `
      + `muestra ${$(q.banco_pagado)} (diferencia ${$(q.diferencia)}). El lote del banco puede incluir `
      + 'oficina, SAC o una liquidación final: la diferencia se reporta, no se imputa.')
  }
  return out
}

/** Texto legible de la conciliación. PURO. */
export function formatConciliacion(r) {
  const L = ['HABERES PAGADOS vs. QUINCENAS', '']
  L.push('  QUINCENA                  FECHA PAGO   DECLARA BANCO      PAGÓ EL BANCO   DIF')
  for (const q of r.quincenas) {
    if (!q.pagos.length && !q.banco_declarado) continue
    L.push(`  ${`${q.desde}–${q.hasta}`.padEnd(24)}  ${(q.fecha_pago ?? '—').padEnd(11)}  `
      + `${$(q.banco_declarado).padStart(15)}  ${$(q.banco_pagado).padStart(15)}  ${$(q.diferencia).padStart(13)}`)
  }
  if (r.huerfanos.length) {
    L.push('')
    L.push(`  ⚠ ${r.huerfanos.length} pago(s) de haberes que ninguna quincena reclama.`)
  }
  for (const a of r.avisos) { L.push(''); L.push(`  ⚠ ${a}`) }
  return L.join('\n')
}
