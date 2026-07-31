// Tests del pago de una obligación. Herméticos, con los datos REALES del archivo al 31/07/2026.
import test from 'node:test'
import assert from 'node:assert/strict'
import { estadoObligacion, loteDeLaFecha, conciliarConBanco, pesaEnElCalendario, ESTADOS, aFecha } from './obligacion-pago.mjs'

const HOY = new Date(2026, 6, 31)   // viernes 31/07/2026
// Los lotes de haberes REALES del extracto 29/06 → 31/07.
const LOTES = [
  { fecha: '30/06/2026', total: 344401.2 },
  { fecha: '01/07/2026', total: 3745311.51 },
  { fecha: '17/07/2026', total: 3775150 },
]

test('EL DEFECTO DEL TITULAR: una quincena cerrada HOY no está pagada', () => {
  // Cerró el 31/07 y se paga el 03/08. El titular la sumaba en "ya pagadas" porque miraba el CIERRE:
  // $7.675.588 dados por salidos con la plata todavía en la cuenta.
  const r = estadoObligacion({ cierre: '31/07/2026', prevista: '03/08/2026', hoy: HOY })
  assert.equal(r.estado, ESTADOS.A_PAGAR, 'cerrada y sin pagar: se DEBE')
  assert.equal(r.pagada, false)
  assert.equal(r.fechaDeCaja.getMonth(), 7, 'su plata se imputa a AGOSTO')
  assert.equal(r.diasDeAtraso, 0, 'todavía no está atrasada: la fecha prevista es futura')
})

test('la quincena en curso no es una obligación todavía', () => {
  const r = estadoObligacion({ cierre: '15/08/2026', prevista: '17/08/2026', hoy: HOY })
  assert.equal(r.estado, ESTADOS.EN_CURSO)
  assert.equal(r.pagada, false)
})

test('MARCAR EL PAGO GANA SOBRE TODO — es un hecho, no una estimación', () => {
  // Lo que el dueño necesita: marcar cuándo se efectivizó. Aunque la previsión dijera otra cosa.
  const r = estadoObligacion({ cierre: '15/07/2026', prevista: '17/07/2026', pagada: '20/07/2026', hoy: HOY })
  assert.equal(r.estado, ESTADOS.PAGADA)
  assert.equal(r.fechaDeCaja.getDate(), 20, 'la plata se imputa al día que SALIÓ, no al previsto')
})

test('una obligación cerrada y vencida cuenta sus días de atraso', () => {
  const r = estadoObligacion({ cierre: '30/06/2026', prevista: '01/07/2026', hoy: HOY })
  assert.equal(r.estado, ESTADOS.A_PAGAR)
  assert.equal(r.diasDeAtraso, 30, 'del 01/07 al 31/07')
})

test('el lote del banco se empareja por fecha, con tolerancia, y un día es UN lote', () => {
  assert.equal(loteDeLaFecha('01/07/2026', LOTES).total, 3745311.51)
  assert.equal(loteDeLaFecha('17/07/2026', LOTES).total, 3775150)
  // Con tolerancia de 3 días, el 18/07 encuentra el lote del 17.
  assert.equal(loteDeLaFecha('18/07/2026', LOTES, 3).total, 3775150)
  // Fuera de la tolerancia, nada: no se le adjudica un lote lejano.
  assert.equal(loteDeLaFecha('10/08/2026', LOTES, 3), null)
  assert.equal(loteDeLaFecha('', LOTES), null)
})

test('LA CONCILIACIÓN QUE NO EXISTÍA: $3.745.312 salieron del banco y la planilla decía nada', () => {
  // Medido en el archivo: la quincena que cerró el 30/06 tiene "Banco: —" y el extracto muestra un
  // lote de $3.745.311,51 el 01/07, que es su fecha de pago. Nadie comparaba las dos cosas.
  const c = conciliarConBanco({ banco: 0, lote: loteDeLaFecha('01/07/2026', LOTES), total: 9384100 })
  assert.ok(c.diferencia > 3_700_000, 'la diferencia es el lote entero')
  assert.match(c.veredicto, /la planilla no registra nada por banco/)
})

test('la otra quincena real: $4.028.550 en la planilla contra $3.775.150 en el banco', () => {
  const c = conciliarConBanco({ banco: 4028550, lote: loteDeLaFecha('17/07/2026', LOTES), total: 7227250 })
  assert.equal(c.diferencia, -253400)
  assert.match(c.veredicto, /el banco muestra .* y la planilla/)
})

test('sin extracto para esa fecha NO se inventa una diferencia', () => {
  // Las quincenas de enero a mayo caen fuera de la ventana del extracto. Decir "diferencia $X" ahí
  // sería inventar un desvío que sólo existe porque falta el dato.
  const c = conciliarConBanco({ banco: 1380275, lote: null, total: 4888075 })
  assert.equal(c.diferencia, 0)
  assert.match(c.veredicto, /sin extracto/)
})

test('coincidir es coincidir: menos de un peso no es una diferencia', () => {
  const c = conciliarConBanco({ banco: 3745311.51, lote: { total: 3745311.51 }, total: 9384100 })
  assert.equal(c.diferencia, 0)
  assert.match(c.veredicto, /coinciden/)
})

// ── LA REGLA ANTI-DOBLE-CONTEO ──────────────────────────────────────────────────────────────────
const CORTE = '31/07/2026'

test('lo pagado ANTES del corte NO pesa en el calendario: ya está en el extracto', () => {
  assert.equal(pesaEnElCalendario({ estado: ESTADOS.PAGADA, fechaDeCaja: aFecha('17/07/2026'), corteExtracto: CORTE }), false)
})

test('lo pagado DESPUÉS del corte SÍ pesa: el extracto no lo vio', () => {
  assert.equal(pesaEnElCalendario({ estado: ESTADOS.PAGADA, fechaDeCaja: aFecha('03/08/2026'), corteExtracto: CORTE }), true)
})

test('lo que se DEBE siempre pesa, y lo que está en curso nunca', () => {
  assert.equal(pesaEnElCalendario({ estado: ESTADOS.A_PAGAR, fechaDeCaja: aFecha('03/08/2026'), corteExtracto: CORTE }), true)
  assert.equal(pesaEnElCalendario({ estado: ESTADOS.EN_CURSO, fechaDeCaja: aFecha('17/08/2026'), corteExtracto: CORTE }), false)
})

test('las tres fechas no se confunden nunca', () => {
  // Un test que fija el vocabulario: cierre ≠ prevista ≠ pagada. Confundirlas es el defecto original.
  const r = estadoObligacion({ cierre: '15/07/2026', prevista: '17/07/2026', pagada: '17/07/2026', hoy: HOY })
  assert.equal(r.estado, ESTADOS.PAGADA)
  const sinPago = estadoObligacion({ cierre: '15/07/2026', prevista: '17/07/2026', hoy: HOY })
  assert.equal(sinPago.estado, ESTADOS.A_PAGAR, 'la fecha prevista NO paga nada por sí sola')
})
