import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ROL, rolDelPeriodo, rolesDeLaGrilla, expresionInicio, cadenaEsperada, verificarCadena,
} from './cash-flow-ancla-saldo.mjs'

const d = (s) => new Date(`${s}T00:00:00Z`)
// Las cinco semanas de agosto de 2026 tal como están en la fila 3 de "Cash Flow Semanal".
const SEMANAS_AGOSTO = ['2026-08-03', '2026-08-10', '2026-08-17', '2026-08-24', '2026-08-31'].map(d)
const FIN_SEMANA = (i, inicios) => new Date(inicios[i].getTime() + 7 * 86400000)
// El saldo real leído de CAJA el 04/08/2026 (CAJA_FECHA_SALDO=46238, CAJA_TOTAL_DISPONIBLE).
const SALDO = { saldo: 115548463, fecha: d('2026-08-04') }

test('EL DEFECTO: cinco semanas del mismo mes no pueden anclar las cinco al saldo', () => {
  const roles = rolesDeLaGrilla(SEMANAS_AGOSTO, SALDO.fecha, (i) => FIN_SEMANA(i, SEMANAS_AGOSTO))
  assert.equal(roles.filter((r) => r === ROL.ANCLA).length, 1,
    'el ancla es el período que CONTIENE la fecha del saldo, y sólo puede haber uno')
  assert.deepEqual(roles, [ROL.ANCLA, ROL.ENCADENA, ROL.ENCADENA, ROL.ENCADENA, ROL.ENCADENA])
})

test('el criterio VIEJO (mes del saldo) da cinco anclas — así se rompió la cadena de agosto', () => {
  const mismoMes = (a, b) => a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()
  const viejos = SEMANAS_AGOSTO.filter((s) => mismoMes(s, SALDO.fecha)).length
  assert.equal(viejos, 5, 'el criterio mensual no distingue las cinco columnas semanales de agosto')
  const nuevos = rolesDeLaGrilla(SEMANAS_AGOSTO, SALDO.fecha, (i) => FIN_SEMANA(i, SEMANAS_AGOSTO))
    .filter((r) => r === ROL.ANCLA).length
  assert.notEqual(nuevos, viejos, 'si esto vuelve a coincidir es que se revirtió la corrección')
})

test('la semana anterior al saldo queda vacía; el saldo del último día de una semana es de la siguiente', () => {
  // 27/07 cubre [27/07, 03/08): el saldo del 03/08 NO es suyo, es de la semana que arranca ese día.
  assert.equal(rolDelPeriodo(d('2026-07-27'), d('2026-08-03'), d('2026-08-03')), ROL.ANTES)
  assert.equal(rolDelPeriodo(d('2026-08-03'), d('2026-08-10'), d('2026-08-03')), ROL.ANCLA)
})

test('en la mensual el resultado no cambia — la corrección no toca el cuadro que ya cerraba', () => {
  const meses = Array.from({ length: 12 }, (_, m) => new Date(Date.UTC(2026, m, 1)))
  const finMes = (i) => new Date(Date.UTC(2026, i + 1, 1))
  const roles = rolesDeLaGrilla(meses, SALDO.fecha, finMes)
  assert.deepEqual(roles.slice(0, 7), Array(7).fill(ROL.ANTES), 'ene–jul sin saldo reconstruible')
  assert.equal(roles[7], ROL.ANCLA, 'agosto ancla')
  assert.deepEqual(roles.slice(8), Array(4).fill(ROL.ENCADENA), 'sept–dic encadenan')
})

test('la cadena reconstruida de agosto da $232.113.539 al 31/08, no los $147.965.511 de la pestaña', () => {
  // Los netos son los que muestra la fila 53 de "Cash Flow Semanal" al 04/08/2026.
  const netos = [-40334246, 63107941, 1512327, 59862005, 32417048]
  const periodos = SEMANAS_AGOSTO.map((desde, i) => ({
    desde, hasta: FIN_SEMANA(i, SEMANAS_AGOSTO), neto: netos[i],
  }))
  const cadena = cadenaEsperada(periodos, SALDO)
  assert.equal(cadena[0].inicio, 115548463)
  assert.equal(cadena[4].cierre, 232113538, 'inicio + la suma de los cinco netos')
  // Cada inicio es el cierre anterior: es lo que la pestaña NO hacía.
  for (let i = 1; i < cadena.length; i++) assert.equal(cadena[i].inicio, cadena[i - 1].cierre)
})

test('verificarCadena separa el corte de ENLACE de la ruptura de IDENTIDAD', () => {
  // Lo que la pestaña mostraba: cada columna cierra bien consigo misma y aun así la cadena está rota.
  // Los montos van redondeados al peso entre sí (la pestaña los tiene con decimales) para que lo
  // único que quede en rojo sea el enlace, que es lo que este test prueba.
  const comoEstaba = [
    { periodo: '2026-08-03', neto: -40334246, inicio: 115548463, cierre: 75214217 },
    { periodo: '2026-08-10', neto: 63107941, inicio: 115548463, cierre: 178656404 },
    { periodo: '2026-08-17', neto: 1512327, inicio: 115548463, cierre: 117060790 },
  ]
  const r = verificarCadena(comoEstaba)
  assert.equal(r.identidad.length, 0, 'la identidad cerraba: mirar sólo eso lo daba por bueno')
  assert.equal(r.enlace.length, 2)
  assert.equal(Math.round(r.enlace[0].diferencia), 40334246)
  assert.equal(r.cierra, false)
})

test('verificarCadena da verde cuando la cadena está bien y no se traga un cierre mal calculado', () => {
  const bien = [
    { periodo: 'ago', neto: 88548106, inicio: 115548463, cierre: 204096569 },
    { periodo: 'sept', neto: 62326550, inicio: 204096569, cierre: 266423119 },
  ]
  assert.equal(verificarCadena(bien).cierra, true)
  const mal = [{ periodo: 'ago', neto: 88548106, inicio: 115548463, cierre: 204096569 + 5000 }]
  assert.equal(verificarCadena(mal).identidad.length, 1)
})

test('la expresión sale en locale es_AR y con la ventana del período, no con EOMONTH', () => {
  const f = expresionInicio({
    desde: 'AH$3', hasta: 'AH$3+7', refSaldo: 'CAJA_TOTAL_DISPONIBLE', refFecha: 'CAJA_FECHA_SALDO',
    anterior: 'AG55',
  })
  assert.equal(f, '=IF(AH$3+7<=CAJA_FECHA_SALDO;"";IF(AH$3<=CAJA_FECHA_SALDO;N(CAJA_TOTAL_DISPONIBLE);IF(N(AG55)=0;"";AG55)))')
  assert.ok(!f.includes(','), 'el archivo es es_AR: el separador de argumentos es ;')
  assert.ok(!/EOMONTH/.test(f), 'un cuadro semanal no puede decidir su ancla con un criterio mensual')
})

test('la primera columna no encadena contra el rótulo de la izquierda', () => {
  const f = expresionInicio({
    desde: 'B$3', hasta: 'EOMONTH(B$3;0)+1', refSaldo: 'CAJA_TOTAL_DISPONIBLE', refFecha: 'CAJA_FECHA_SALDO',
    anterior: null,
  })
  assert.ok(f.endsWith(';"")))') || f.includes(';""))'), `sin celda anterior encadena a vacío: ${f}`)
})

test('sin saldo declarado no se inventa una cadena', () => {
  const periodos = SEMANAS_AGOSTO.map((desde, i) => ({ desde, hasta: FIN_SEMANA(i, SEMANAS_AGOSTO), neto: 1000 }))
  // Una fecha de saldo posterior a toda la grilla: ninguna columna ancla, ninguna muestra saldo.
  const cadena = cadenaEsperada(periodos, { saldo: 999, fecha: d('2027-01-01') })
  assert.deepEqual(cadena.map((c) => c.cierre), [null, null, null, null, null])
})
