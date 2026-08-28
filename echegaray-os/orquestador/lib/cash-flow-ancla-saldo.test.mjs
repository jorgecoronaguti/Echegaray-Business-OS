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
  // ene–jul siguen siendo ANTES: el ROL no cambió con la reconstrucción hacia atrás del 28/08 —
  // cambió qué se hace con ellos. El ancla sigue siendo uno solo, que es lo que este test cuida.
  assert.deepEqual(roles.slice(0, 7), Array(7).fill(ROL.ANTES), 'ene–jul no anclan: no contienen el corte')
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

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LA CADENA HACIA ATRÁS — los meses anteriores al corte, despejados en vez de vacíos (28/08/2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('EL CASO MEDIDO: la cadena hacia atrás reproduce al peso el inicio del mes ancla', () => {
  // Las TRES cifras de este test están medidas sobre el archivo real (Cash Flow Mensual, 28/08/2026):
  //   · inicio del mes ancla (agosto) que publica el cuadro ....... $70.165.741
  //   · variación de caja acumulada de enero a julio .............. +$19.535.570
  //   · saldo implícito al 1/1/2026, reconstruido a mano ........... $50.630.171
  // El desglose mes a mes NO está medido, así que no se inventa: ene→jul entra como UN período con su
  // neto agregado. Lo que se prueba es la identidad, y la identidad no depende del desglose.
  const eneJul = { desde: d('2026-01-01'), hasta: d('2026-08-01'), neto: 19535570 }
  const agosto = { desde: d('2026-08-01'), hasta: d('2026-09-01'), neto: 0 }
  const cadena = cadenaEsperada([eneJul, agosto], { saldo: 70165741, fecha: d('2026-08-04') })

  assert.equal(cadena[0].inicio, 50630171, 'el saldo implícito al 1/1/2026')
  assert.equal(cadena[0].calculado, true, 'no es un saldo registrado: se despejó, y tiene que decirlo')
  assert.equal(cadena[0].cierre, 70165741, 'el cierre de julio ES el inicio de agosto, sin diferencia')
  assert.equal(cadena[1].inicio, 70165741)
  assert.equal(cadena[1].calculado, false, 'el mes ancla es el único que se puede contrastar con el banco')
})

test('la cadena reconstruida cierra sola: verificarCadena la da VERDE de punta a punta', () => {
  // Grilla SINTÉTICA de doce meses (netos inventados a propósito y declarados como tales): lo que se
  // prueba es el encadenado, no los importes.
  const netos = [3, -7, 11, -2, 5, -9, 4, 6, -1, 8, -3, 2].map((n) => n * 1000000)
  const periodos = netos.map((neto, m) => ({
    desde: new Date(Date.UTC(2026, m, 1)), hasta: new Date(Date.UTC(2026, m + 1, 1)), neto,
  }))
  const cadena = cadenaEsperada(periodos, SALDO)

  // Los siete meses previos al corte quedaron con saldo, y marcados como CÁLCULO.
  assert.equal(cadena.filter((c) => c.calculado).length, 7)
  assert.equal(cadena.filter((c) => c.inicio === null).length, 0, 'ningún mes quedó sin cadena')
  // Y la cadena entera cierra: el control no encuentra ni una ruptura de identidad ni una de enlace.
  const filas = cadena.map((c, i) => ({
    periodo: `m${i + 1}`, neto: netos[i], inicio: c.inicio, cierre: c.cierre,
  }))
  assert.equal(verificarCadena(filas).cierra, true)
  // El eslabón que importa: el cierre de julio tiene que dar EXACTAMENTE el inicio de agosto, que es
  // el único saldo que no se despejó de nada.
  assert.equal(cadena[6].cierre, cadena[7].inicio)
  assert.equal(cadena[7].inicio, SALDO.saldo)
})

test('EL CONTROL PUEDE DAR ROJO: si se rompe un eslabón de la cadena reconstruida, salta', () => {
  const netos = [3, -7, 11, -2, 5, -9, 4, 6, -1, 8, -3, 2].map((n) => n * 1000000)
  const periodos = netos.map((neto, m) => ({
    desde: new Date(Date.UTC(2026, m, 1)), hasta: new Date(Date.UTC(2026, m + 1, 1)), neto,
  }))
  const cadena = cadenaEsperada(periodos, SALDO)
  const filas = cadena.map((c, i) => ({ periodo: `m${i + 1}`, neto: netos[i], inicio: c.inicio, cierre: c.cierre }))

  // LA MUTACIÓN: se corre $5.000.000 el inicio de marzo — exactamente lo que pasaría si el despeje
  // hacia atrás se hiciera contra el mes equivocado. La identidad de marzo consigo mismo sigue
  // cerrando si se mueve también su cierre; lo que se rompe es el ENLACE con febrero.
  const roto = filas.map((f, i) => (i === 2 ? { ...f, inicio: f.inicio + 5000000, cierre: f.cierre + 5000000 } : f))
  const r = verificarCadena(roto)
  assert.equal(r.cierra, false, 'un control que no puede decir que no es una constante disfrazada')
  assert.equal(r.identidad.length, 0, 'cada mes cierra consigo mismo: mirar sólo la identidad lo daba por bueno')
  assert.deepEqual(r.enlace.map((e) => `${e.periodo}:${e.diferencia}`), ['m3:5000000', 'm4:-5000000'])
})

test('sin ancla en la grilla no se despeja nada hacia atrás: no hay de dónde', () => {
  const periodos = [0, 1, 2].map((m) => ({
    desde: new Date(Date.UTC(2026, m, 1)), hasta: new Date(Date.UTC(2026, m + 1, 1)), neto: 1000,
  }))
  const cadena = cadenaEsperada(periodos, { saldo: 999, fecha: d('2027-06-01') })
  assert.deepEqual(cadena.map((c) => c.inicio), [null, null, null])
  assert.deepEqual(cadena.map((c) => c.calculado), [false, false, false])
})

test('la bandera apaga la reconstrucción sin tocar el resto de la cadena', () => {
  const periodos = [0, 1, 2, 3].map((m) => ({
    desde: new Date(Date.UTC(2026, m, 1)), hasta: new Date(Date.UTC(2026, m + 1, 1)), neto: 1000,
  }))
  const ancla = { saldo: 500, fecha: d('2026-03-15') }
  const sin = cadenaEsperada(periodos, ancla, { reconstruirHaciaAtras: false })
  assert.deepEqual(sin.map((c) => c.inicio), [null, null, 500, 1500])
  const con = cadenaEsperada(periodos, ancla)
  assert.deepEqual(con.map((c) => c.inicio), [-1500, -500, 500, 1500])
  assert.deepEqual(con.map((c) => c.calculado), [true, true, false, false])
})

test('la expresión del mes anterior al corte se despeja del INICIO del siguiente, nunca de su cierre', () => {
  const f = expresionInicio({
    desde: 'B$7', hasta: 'EOMONTH(B$7;0)+1', refSaldo: 'CAJA_TOTAL_DISPONIBLE', refFecha: 'CAJA_FECHA_SALDO',
    anterior: null, siguiente: '$C$8', resultadoDelPeriodo: '$B$49',
  })
  assert.ok(f.startsWith('=IF(EOMONTH(B$7;0)+1<=CAJA_FECHA_SALDO;IF(N($C$8)=0;"";N($C$8)-N($B$49));'), f)
  assert.ok(!f.includes(','), 'el archivo es es_AR: el separador de argumentos es ;')
})

test('sin "siguiente" la expresión no cambia: el semanal conserva el comportamiento histórico', () => {
  const base = {
    desde: 'AH$3', hasta: 'AH$3+7', refSaldo: 'CAJA_TOTAL_DISPONIBLE', refFecha: 'CAJA_FECHA_SALDO', anterior: 'AG55',
  }
  assert.equal(expresionInicio(base), expresionInicio({ ...base, resultadoDelPeriodo: 'AH55' }),
    'el resultado solo, sin el eslabón hacia atrás, no puede cambiar nada')
  assert.ok(expresionInicio(base).includes('CAJA_FECHA_SALDO;"";IF('))
})
