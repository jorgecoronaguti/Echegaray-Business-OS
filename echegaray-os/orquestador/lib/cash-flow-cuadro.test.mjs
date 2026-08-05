import test from 'node:test'
import assert from 'node:assert/strict'
import { CUADRO, verificarCuadro, expresionReal, formulaLineaMes, SUB_BIENES_DE_USO, formulaChequesSinFactura, INSTRUMENTOS, bloqueControl } from './cash-flow-lineas.mjs'
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
  // ═══ EL RANGO SE DERIVA DEL INSTRUMENTO, NO SE TIPEA (04/08) ═══
  //
  // Acá decía `$L$3:$L$400` a mano. Eso no fijaba una regla: fijaba el valor que tenía `filaCab`
  // ese día (2). Cuando se corrigió a 31 —el encabezado del registro de la tarjeta está en la 31,
  // no en la 2— el test se puso rojo y el dato correcto parecía el error. La regla que sí vale es
  // que la fórmula arranque en la PRIMERA FILA DE DATOS de cada instrumento, sea cual sea.
  for (const i of [INSTRUMENTOS.cheques, INSTRUMENTOS.tarjeta]) {
    const col = i.colMarca === 11 ? 'L' : 'M'
    assert.ok(f.includes(`'${i.pestaña}'!$${col}$${i.filaCab + 1}:$${col}$400`),
      `la fórmula tiene que leer ${i.pestaña} desde su primera fila de datos (${i.filaCab + 1})`)
  }
  // La marca EXACTA: si el texto cambia de un lado y no del otro, la fórmula da $0 en silencio.
  assert.ok(f.includes(MARCAS.falta))
  // Ventana con límite superior EXCLUYENTE: ningún pago puede caer en dos columnas.
  assert.ok(f.includes('>=B$3') && f.includes('<EOMONTH(B$3;0)+1'))
  // Un importe que no es número no rompe la suma (hay celdas con "-" en esas columnas).
  assert.ok(f.includes('IF(ISNUMBER('))
  // EL CASH FLOW MENSUAL CUENTA TAMBIÉN LO YA DEBITADO, Y TIENE QUE SEGUIR HACIÉNDOLO: un cheque que
  // el banco debitó en julio fue un pago real de julio, y como su factura no está en Compras nadie
  // más lo cuenta. Filtrar acá por debitado dejaría meses pasados sin ese egreso.
  assert.ok(!f.includes('<>"SI"'), 'el cash flow mensual no filtra por debitado — el mes ya pasó')
})

// ═══ EL DEFECTO DE $12.188.441 (05/08/2026) ═══
//
// El calendario de CAJA arranca del SALDO DEL BANCO y abre su primer tramo desde el serial 0, para no
// perder un cheque viejo que sigue sin presentarse. Sin el filtro de debitado, esa ventana arrastraba
// 10 cheques ($11.631.542) y 2 cuotas de tarjeta ($556.899) que el banco YA había debitado y que el
// saldo de partida ya tenía descontados: se restaban dos veces y hundían el piso proyectado.
test('la variante del CALENDARIO excluye lo que el banco YA debitó — el piso parte del saldo', () => {
  const f = formulaChequesSinFactura('0', 'TODAY()', MARCAS.falta, [INSTRUMENTOS.cheques], { soloNoDebitados: true })
  const c = INSTRUMENTOS.cheques
  assert.ok(f.includes(`UPPER('${c.pestaña}'!$${c.colDebitado}$${c.filaCab + 1}:$${c.colDebitado}$400)<>"SI"`),
    'sin esta condición el tramo "Vencido" vuelve a restar cheques que ya salieron de la cuenta')
  // Y la tarjeta tiene SU propia columna de debitado: usar la del cheque (K) leería otra cosa.
  const t = formulaChequesSinFactura('0', 'TODAY()', MARCAS.falta, [INSTRUMENTOS.tarjeta], { soloNoDebitados: true })
  assert.ok(t.includes(`UPPER('${INSTRUMENTOS.tarjeta.pestaña}'!$${INSTRUMENTOS.tarjeta.colDebitado}$`))
  // UPPER porque la columna la tipea una persona: "Si", "si" y "SI" son el mismo hecho.
  assert.ok(f.includes('UPPER('))
})

// EL LADO DEL INGRESO TAMBIÉN SE AUDITA (T04). Antes el control del pie sólo miraba el egreso
// (Compras): un cobro sin unidad o sin fecha se caía del cuadro sin que nada avisara. Ahora el bloque
// de control incluye sus dos espejos del ingreso.
test('el bloque de control incluye los dos espejos del ingreso (sin unidad, sin fecha)', () => {
  const ctrl = bloqueControl(10, 20, 'B', 40)
  const etiquetas = ctrl.map((c) => c.etiqueta)
  assert.ok(etiquetas.some((e) => e.startsWith('Cobros sin unidad de negocio')), 'está el control de cobros sin unidad')
  assert.ok(etiquetas.some((e) => e.startsWith('Cobros sin fecha')), 'está el control de cobros sin fecha')
  // Cada fila de control trae fórmula: ninguna es un número pegado (regla de oro).
  for (const c of ctrl) assert.ok(String(c.formula).startsWith('='), `${c.etiqueta} es una fórmula`)
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
