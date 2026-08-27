// EL RÉGIMEN DE LA CONSTRUCCIÓN, PROBADO CONTRA EL TEXTO DE LA LEY.
//
// El error más caro de este dominio es aplicarle a un obrero de la construcción la indemnización por
// antigüedad del art. 245 LCT. En la Ley 22.250 esa línea NO EXISTE —el art. 15, último párrafo, dice
// que el Fondo de Cese "reemplaza al régimen de preaviso y despido" de la LCT— y el costo de echar a
// diecisiete personas cambia en un orden de magnitud según cuál de los dos se use.
//
// Cada test de acá corresponde a un artículo. Si alguien "arregla" el módulo agregando preaviso, o
// mueve el corte del 12% al 8%, o le pone el 8% a alguien de siete meses, se pone rojo.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FCL_PRIMER_ANIO, FCL_DESDE_UN_ANIO, antiguedad, alicuotaFcl, diasVacacionesPorAntiguedad,
  vacacionesProporcionales, sacProporcional, fclPagoDirecto, liquidacionFinal, totalizar,
} from './desvinculacion-22250.mjs'

const d = (a, m, x) => new Date(a, m - 1, x)

test('art. 15 — las dos alícuotas son las de la ley y no otras', () => {
  assert.equal(FCL_PRIMER_ANIO, 0.12)
  assert.equal(FCL_DESDE_UN_ANIO, 0.08)
})

test('art. 15 — el corte está en el AÑO de antigüedad, no antes ni después', () => {
  const ingreso = d(2025, 8, 26)
  // Un día antes del aniversario todavía es "primer año de prestación de servicios".
  assert.equal(alicuotaFcl(ingreso, d(2026, 8, 25)), 0.12)
  // El día del aniversario ya es "a partir del año de antigüedad".
  assert.equal(alicuotaFcl(ingreso, d(2026, 8, 26)), 0.08)
  assert.equal(alicuotaFcl(ingreso, d(2027, 1, 1)), 0.08)
})

test('sin fecha de ingreso no hay alícuota: no se estima una', () => {
  assert.equal(alicuotaFcl(null, d(2026, 8, 27)), null)
  assert.equal(antiguedad(null, d(2026, 8, 27)), null)
})

test('antigüedad — años completos y el resto en meses', () => {
  assert.deepEqual(antiguedad(d(2023, 6, 26), d(2026, 8, 27)), { anios: 3, meses: 2, dias: 1158 })
  assert.deepEqual(antiguedad(d(2026, 8, 19), d(2026, 8, 27)), { anios: 0, meses: 0, dias: 8 })
})

test('art. 150 LCT — los cuatro tramos de vacaciones', () => {
  assert.equal(diasVacacionesPorAntiguedad(0), 14)
  assert.equal(diasVacacionesPorAntiguedad(5), 14)
  assert.equal(diasVacacionesPorAntiguedad(6), 21)
  assert.equal(diasVacacionesPorAntiguedad(10), 21)
  assert.equal(diasVacacionesPorAntiguedad(11), 28)
  assert.equal(diasVacacionesPorAntiguedad(20), 28)
  assert.equal(diasVacacionesPorAntiguedad(21), 35)
})

test('art. 156 LCT — vacaciones proporcionales a la fracción del año trabajada', () => {
  // Aguero Cristian, el caso real: ingresó el 26/5/2025, cese hipotético el 27/8/2026. Trabajó del
  // 1/1 al 27/8 = 239 días de 365. Oficial: $6.348/h × 8 h = $50.784 por día de vacación.
  const v = vacacionesProporcionales({ ingreso: d(2025, 5, 26), cese: d(2026, 8, 27), jornalDiario: 50784 })
  assert.equal(v.diasVac, 14)
  assert.equal(v.diasTrabajados, 239)
  assert.equal(Math.round(v.importe), 465543)
})

test('art. 156 — quien entró en el año cuenta desde su ingreso, no desde enero', () => {
  const v = vacacionesProporcionales({ ingreso: d(2026, 8, 19), cese: d(2026, 8, 27), jornalDiario: 50784 })
  assert.equal(v.diasTrabajados, 9)
  assert.equal(Math.round(v.importe), 17531)
})

test('art. 123 LCT — SAC proporcional sobre el semestre del cese', () => {
  // Cese el 27/8/2026: el semestre es julio–diciembre (184 días) y van 58 corridos.
  const s = sacProporcional({ cese: d(2026, 8, 27), ingreso: d(2025, 5, 26), mejorRemuneracionMensual: 1314036 })
  assert.equal(s.diasDelSemestre, 184)
  assert.equal(s.diasTrabajados, 58)
  assert.equal(Math.round(s.importe), 207104)
})

test('art. 17 — el pago directo es sólo el aporte que todavía no se depositó', () => {
  assert.equal(fclPagoDirecto({ remuneracionNoDepositada: 1000000, alicuota: 0.12 }), 120000)
  assert.equal(fclPagoDirecto({ remuneracionNoDepositada: 1000000, alicuota: null }), null)
})

test('EL DEFECTO CARO: preaviso e indemnización por antigüedad valen CERO (art. 15)', () => {
  const l = liquidacionFinal({
    nombre: 'x', ingreso: d(2023, 6, 26), cese: d(2026, 8, 27), basicoHora: 6348,
    horasDevengadasPendientes: 176, remuneracionNoDepositada: 1117248, mejorRemuneracionMensual: 1314036,
  })
  assert.equal(l.preaviso, 0)
  assert.equal(l.indemnizacionAntiguedad, 0)
  // Y el desembolso es EXACTAMENTE la suma de las cinco líneas que sí existen.
  assert.equal(
    Math.round(l.desembolso),
    Math.round(l.haberes + l.vacaciones + l.sac + l.sacSobreVacaciones + l.fclPagoDirecto),
  )
  // Con tres años de antigüedad el aporte es del 8%: $1.117.248 × 0,08.
  assert.equal(l.alicuota, 0.08)
  assert.equal(Math.round(l.fclPagoDirecto), 89380)
})

test('el fondo acumulado NO entra en el desembolso — es plata que ya salió', () => {
  const base = {
    nombre: 'x', ingreso: d(2026, 1, 12), cese: d(2026, 8, 27), basicoHora: 5399,
    horasDevengadasPendientes: 100, remuneracionNoDepositada: 539900, mejorRemuneracionMensual: 900000,
  }
  const sin = liquidacionFinal(base)
  const con = liquidacionFinal({ ...base, fclDevengadoAcumulado: 9_000_000 })
  assert.equal(sin.desembolso, con.desembolso)
  assert.equal(con.fclDevengadoAcumulado, 9_000_000)
})

test('totalizar cuenta a quién no se le pudo medir el fondo, en vez de sumarle un cero', () => {
  const t = totalizar([
    { desembolso: 100, fclDevengadoAcumulado: 10 },
    { desembolso: 200, fclDevengadoAcumulado: null },
  ])
  assert.equal(t.personas, 2)
  assert.equal(t.desembolso, 300)
  assert.equal(t.fclDevengadoAcumulado, 10)
  assert.equal(t.sinFondoMedible, 1)
})
