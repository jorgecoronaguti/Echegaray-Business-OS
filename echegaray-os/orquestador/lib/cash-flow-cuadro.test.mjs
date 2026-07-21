import test from 'node:test'
import assert from 'node:assert/strict'
import { CUADRO, verificarCuadro, expresionReal, formulaLineaMes, SUB_BIENES_DE_USO, formulaChequesSinFactura, INSTRUMENTOS } from './cash-flow-lineas.mjs'
import { MARCAS } from './cheques-cobertura.mjs'
import { RUBROS } from './rubro-caja.mjs'

// La propiedad que sostiene el cuadro: todo rubro de Compras aparece en UNA actividad, exactamente
// una vez. Si alguien agrega un rubro y se olvida de ubicarlo, el estado de flujo lo dejaría afuera
// en silencio — y el control del pie seguiría dando $0 porque suma por rubro, no por lo que se ve.
test('el cuadro contable cubre todos los rubros, exactamente una vez', () => {
  const { lineas, rubrosUsados } = verificarCuadro()
  assert.equal(rubrosUsados.length, RUBROS.length)
  assert.deepEqual([...rubrosUsados].sort(), [...RUBROS].sort())
  assert.ok(lineas.length > rubrosUsados.length, 'hay líneas que no son rubros (cobranzas, cheques)')
})

test('las tres actividades que exige la norma están, y en orden', () => {
  assert.deepEqual(CUADRO.map((a) => a.actividad),
    ['ACTIVIDADES OPERATIVAS', 'ACTIVIDADES DE INVERSIÓN', 'ACTIVIDADES DE FINANCIACIÓN'])
})

// El corte de bienes de uso es el único lugar donde un rubro se parte en dos líneas. Si la línea de
// inversión mostrara los equipos y la de estructura NO los restara, esa plata se contaría dos veces
// y el cuadro cerraría igual — el error más caro de detectar.
test('los bienes de uso se restan de estructura para no contarse dos veces', () => {
  const { lineas } = verificarCuadro()
  const inv = lineas.find((l) => l.soloSub === SUB_BIENES_DE_USO)
  const est = lineas.find((l) => l.excluirSub === SUB_BIENES_DE_USO)
  assert.ok(inv && est, 'existen las dos mitades')
  assert.equal(est.rubro, 'Estructura')
  const f = expresionReal(est, 'B$3', 'C$3')
  assert.ok(f.includes('-SUMIFS'), 'la de estructura resta')
  assert.ok(expresionReal(inv, 'B$3', 'C$3').includes('$AF$4'), 'la de inversión filtra por sub-rubro')
})

test('un bien de uso no se proyecta: comprar una moto no es un ritmo mensual', () => {
  const { lineas } = verificarCuadro()
  const inv = lineas.find((l) => l.soloSub)
  const f = formulaLineaMes(inv, 'I', 'I', 3)
  assert.ok(!f.includes('MAX('), 'sin proyección')
})

test('la línea de cheques no tiene fórmula — la llena el script con valores', () => {
  const { lineas } = verificarCuadro()
  const ch = lineas.find((l) => l.cheques)
  assert.equal(expresionReal(ch, 'B$3', 'C$3'), null)
  assert.equal(formulaLineaMes(ch, 'I', 'I', 3), null)
})

// Los cobros NO se proyectan y los pagos SÍ. Es una asimetría deliberada —no hay obra facturada de
// octubre en adelante y proyectar facturación que no existe sería fabricar ingresos— pero tiene que
// ser deliberada y no un accidente, así que se fija acá.
test('los cobros no se proyectan', () => {
  const { lineas } = verificarCuadro()
  for (const l of lineas.filter((x) => x.cobranzas)) {
    assert.ok(!formulaLineaMes(l, 'I', 'I', 3).includes('MAX('), `${l.nombre} no proyecta`)
  }
})

// EL ÚNICO NÚMERO PEGADO QUE QUEDABA EN EL CUADRO (lo encontró el auditor de reglas de oro):
// $9.666.906,66 escritos a mano. Un importe pegado no baja cuando se carga la factura que faltaba.
test('la línea de cheques sin factura es una fórmula que suma las marcas del OS', () => {
  const f = formulaChequesSinFactura('B$3', 'EOMONTH(B$3;0)+1', MARCAS.falta)
  assert.ok(f.startsWith('='))
  // Las dos pestañas, o la mitad del número se pierde.
  assert.ok(f.includes("'Cheques Emitidos'!$M$2:$M$400"))
  assert.ok(f.includes("'Tarjeta de Credito'!$L$3:$L$400"))
  // La marca EXACTA: si el texto cambia de un lado y no del otro, la fórmula da $0 en silencio.
  assert.ok(f.includes(MARCAS.falta))
  // Ventana con límite superior EXCLUYENTE: ningún pago puede caer en dos columnas.
  assert.ok(f.includes('>=B$3') && f.includes('<EOMONTH(B$3;0)+1'))
  // Un importe que no es número no rompe la suma (hay celdas con "-" en esas columnas).
  assert.ok(f.includes('IF(ISNUMBER('))
})

// La columna de marcas tiene que caer DESPUÉS de la última columna de datos de cada pestaña, o el
// OS pisaría un dato cargado por una persona.
test('la columna de marcas no pisa ninguna columna de datos', () => {
  assert.equal(INSTRUMENTOS.cheques.colMarca, 12)  // M, después de L "Unidad de Negocio"
  assert.equal(INSTRUMENTOS.tarjeta.colMarca, 11)  // L, después de K "Unidad de Negocio"
  for (const i of Object.values(INSTRUMENTOS)) {
    const letraNum = (c) => c.charCodeAt(0) - 65
    assert.ok(i.colMarca > letraNum(i.colMonto) && i.colMarca > letraNum(i.colFecha))
  }
})
