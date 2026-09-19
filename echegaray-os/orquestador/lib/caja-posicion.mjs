// POSICIÓN DE CAJA — LA DEFINICIÓN ÚNICA DE "CUÁNTA PLATA HAY HOY".
//
// POR QUÉ EXISTE ESTE ARCHIVO (05/08). El mismo concepto estaba escrito tres veces, con tres
// aritméticas distintas, y ninguna sabía de las otras:
//
//   · orquestador/lib/caja-alertas.mjs  → saldoActual(), ANCLADA en saldo_fecha  (correcta, sin export)
//   · src/features/posicion-caja/types  → calcularSaldoActual(), SIN ancla       (doble conteo)
//   · src/features/flujo-caja/services  → calendarioReader, lee CAJA!A5 del Sheet (otra cifra más)
//
// La del medio es la que ve el dueño en /caja y es la que está mal. El saldo del ledger del Sheet es
// una FOTO a una fecha (saldo_fecha): todo movimiento real anterior o igual a esa fecha YA ESTÁ
// ADENTRO de la foto. Volver a sumarlo lo cuenta dos veces. El caso concreto que dejó escrito
// caja-alertas: la nómina del 30/06 ya estaba reflejada en el saldo del 17/07, y la web la sumaba
// otra vez. El error no es de redondeo — es del tamaño de todo lo que se movió antes del corte.
//
// LA REGLA, UNA SOLA VEZ: saldo = Σ saldo_inicial (la foto) + Σ movimientos reales POSTERIORES al
// ancla. El ancla es el saldo_fecha MÁS NUEVO entre las cuentas, porque todas se cargan del mismo
// snapshot del ledger.
//
// ESTE NÚCLEO ES PURO A PROPÓSITO: la misma regla vive en Postgres (vista public.caja_posicion) y
// acá. No es duplicación, es el espejo que el canario usa para probar que la base y el código dicen
// lo mismo — el mismo patrón que ya usa el canario con norm_obra(SQL) == normObra(JS). Si un día
// divergen, el canario grita; si sólo existiera en un lado, nadie se enteraría.

/** Fecha de caja de un movimiento: cuándo tocó el banco de verdad, con la esperada como respaldo. */
function fechaDeCaja(m) {
  return m.fecha_real ?? m.fecha_esperada ?? null
}

/** El signo del movimiento sobre la caja. Un tipo desconocido vale 0: no se adivina. */
function signo(m) {
  if (m.tipo === 'cobro') return 1
  if (m.tipo === 'pago') return -1
  return 0
}

function aIso(v) {
  if (!v) return null
  if (typeof v === 'string') return v.slice(0, 10)
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return null
}

/**
 * El ancla: la fecha de la foto del ledger. Si NINGUNA cuenta tiene saldo_fecha, no hay foto y
 * todos los movimientos reales cuentan — que es el comportamiento previo al sync, preservado a
 * propósito para no cambiar el número de una base sin sincronizar.
 */
export function anclaDeSaldo(cuentas) {
  const fechas = cuentas.map((c) => aIso(c.saldo_fecha)).filter(Boolean)
  return fechas.length ? fechas.reduce((a, b) => (a > b ? a : b)) : null
}

/**
 * La posición de caja anclada. Devuelve el número Y de qué está hecho, porque un saldo sin su
 * composición no se puede auditar: cuando el canario encuentra una diferencia, lo primero que hace
 * falta es saber cuántos movimientos absorbió la foto y cuántos se sumaron encima.
 */
export function posicionAnclada({ cuentas = [], movimientos = [] } = {}) {
  const ancla = anclaDeSaldo(cuentas)
  const foto = cuentas.reduce((s, c) => s + Number(c.saldo_inicial ?? 0), 0)

  let posteriores = 0
  let contados = 0
  let absorbidos = 0
  let sinFecha = 0

  for (const m of movimientos) {
    if (m.estado !== 'real') continue
    const f = aIso(fechaDeCaja(m))
    // Un movimiento real sin fecha no se puede ubicar respecto del ancla. No se asume que está
    // adentro ni afuera de la foto: se cuenta aparte y se declara. Meterlo de prepo en cualquiera
    // de los dos lados es inventar plata o hacerla desaparecer.
    if (f === null) {
      sinFecha++
      continue
    }
    if (ancla !== null && f <= ancla) {
      absorbidos++
      continue
    }
    posteriores += signo(m) * Number(m.monto ?? 0)
    contados++
  }

  return {
    saldo: foto + posteriores,
    ancla,
    foto,
    posteriores,
    movimientosContados: contados,
    movimientosAbsorbidos: absorbidos,
    movimientosRealesSinFecha: sinFecha,
  }
}

/**
 * Antigüedad del dato en días respecto de `hoy`. Un saldo de hace tres días es un dato distinto de
 * uno de hoy y la pantalla tiene que poder decirlo — sin este número la web no puede distinguir
 * "no hay plata" de "hace una semana que nadie sincroniza".
 */
export function antiguedadEnDias(ancla, hoy = new Date()) {
  const a = aIso(ancla)
  if (!a) return null
  const ms = new Date(`${aIso(hoy)}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()
  return Math.round(ms / 86400000)
}

/** Umbrales de frescura. Más de 3 días sin sincronizar deja de ser "hoy" y la pantalla lo dice. */
export const FRESCURA = { alDia: 1, tolerable: 3 }

export function estadoDeFrescura(ancla, hoy = new Date()) {
  const dias = antiguedadEnDias(ancla, hoy)
  if (dias === null) return { estado: 'sin_dato', dias: null }
  if (dias <= FRESCURA.alDia) return { estado: 'al_dia', dias }
  if (dias <= FRESCURA.tolerable) return { estado: 'atrasado', dias }
  return { estado: 'vencido', dias }
}
