// Tests del cableado de la cartera de CAJA. Herméticos: el núcleo puro no toca red, base ni Sheet.
//
// ESTE CÓDIGO ESCRIBE EN LA PESTAÑA REAL DE CAJA, la única del archivo donde el dueño tipea números a
// mano. Los tests son el seguro: prueban que ubica por RÓTULO (nunca por fila fija), que no vuelve a
// listar un cheque que ya está, y que no toca ni una celda de las que él carga.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ubicar, numeroDelRotulo, planCableado } from './caja-cartera-viva.mjs'

/** La forma REAL de la pestaña al 30/07, recortada a lo que este script necesita ver. */
const CAJA = () => {
  const f = Array.from({ length: 60 }, () => [''])
  f[6] = ['Cuenta', 'Moneda', 'Saldo en moneda de origen', 'Tipo de cambio', 'Saldo en pesos', 'Fecha del saldo']
  f[7] = ['Caja en pesos', 'ARS', 0, '', '=IF(C8="";"";C8)', 46233]
  f[9] = ['Santander · cta cte ARS', 'ARS', '=INDEX(…)']
  f[11] = ['Valores a depositar', 'ARS', '=SUM(C47)']
  f[14] = ['Total disponibilidades', '', '', '', '=SUM(E8:E14)-E12']
  f[20] = ['Vencido — ya pasó la fecha', '', '=SUMPRODUCT(($F$47<TODAY())*…)']
  f[21] = ['Esta semana', '', '=SUMPRODUCT(…)']
  f[22] = ['Semana que viene', '', '=SUMPRODUCT(…)']
  f[23] = ['Resto de este mes', '', '=SUMPRODUCT(…)']
  f[24] = ['El mes que viene', '', '=SUMPRODUCT(…)']
  f[25] = ['Más adelante', '', '=SUMPRODUCT(…)']
  f[26] = ['Sin fecha de pago cargada']
  f[27] = ['⇒ Total del horizonte', '', '=SUM($C21:$C27)']
  f[45] = ['4.1 · VALORES EN CARTERA, UNO POR UNO']
  f[46] = ['   ECHEQ 90020099 · Alimentos Del Sur SA', 'ARS', 10000000]
  f[47] = ['   ECHEQ 90020100 · YA NO ES NUESTRO — endosado a ALUMETAL S.A']
  f[48] = ['   ECHEQ 90020101 · YA NO ES NUESTRO — endosado a ALUMETAL S.A']
  f[49] = ['⇒ Control: qué dice Cobranzas de estos cheques', '', '=SUMPRODUCT(…)']
  f[50] = ['⇒ Diferencia contra el banco (manda el banco)']
  return f
}

const CHEQUES = [
  { numero: '90020099', emisor: 'Alimentos Del Sur SA', estado: 'En custodia', importe: 10000000 },
  { numero: '00000514', emisor: 'Mineral Del Rio SA', estado: 'En custodia', importe: 290000 },
]

test('UBICA POR RÓTULO, no por número de fila', () => {
  const p = ubicar(CAJA())
  assert.deepEqual(p.faltan, [])
  assert.equal(p.cartera, 12)
  assert.equal(p.cal0, 21)
  assert.equal(p.calTotal, 28)
  assert.equal(p.det0, 46)
  assert.equal(p.control, 50)
  assert.equal(p.detalle.length, 3, 'un cheque en cartera y dos endosados')
  assert.deepEqual(p.detalle.map((d) => d.endosado), [false, true, true])
})

test('si la pestaña se movió, sigue ubicando; si le falta un ancla, LO DICE', () => {
  // Dos bloques nuevos arriba: todo se corre 5 filas y el script tiene que seguir encontrando su lugar.
  const corrida = [...Array.from({ length: 5 }, () => ['']), ...CAJA()]
  const p = ubicar(corrida)
  assert.deepEqual(p.faltan, [])
  assert.equal(p.cartera, 17, 'la cartera se corrió con la pestaña')
  assert.equal(p.detalle[0].fila, 52)
  // Sin el bloque de detalle no se puede escribir nada: mejor abortar que escribir en el lugar equivocado.
  const sinDetalle = CAJA(); sinDetalle[45] = ['']
  assert.ok(ubicar(sinDetalle).faltan.some((f) => /4\.1/.test(f)))
})

test('EL CASO REAL: entra el 514 y se agrega UNA fila, sin repetir el 90020099', () => {
  const plan = planCableado(ubicar(CAJA()), CHEQUES)
  assert.equal(plan.nuevos.length, 1)
  assert.equal(plan.nuevos[0].numero, '00000514')
  // La fila nueva va DESPUÉS del último que sigue en cartera y ANTES de los endosados: los endosados
  // van abajo porque no son plata, y meter un valor entre ellos rompe la lectura del bloque.
  assert.equal(plan.filasCartera.length, 2)
  assert.equal(plan.filasCartera[1].fila, 48)
  assert.ok(plan.filasCartera[1].nueva)
})

test('los ceros a la izquierda NO duplican un cheque ya listado', () => {
  // El detalle escribe "514" y la base "00000514": comparar como texto listaría el mismo cheque dos veces.
  const f = CAJA(); f[46] = ['   Cheque 514 · Mineral Del Rio SA', 'ARS', 290000]
  const plan = planCableado(ubicar(f), [CHEQUES[1]])
  assert.deepEqual(plan.nuevos, [], 'es el mismo cheque')
})

test('NO TOCA NI UNA CELDA DE LAS QUE CARGA EL DUEÑO', () => {
  const plan = planCableado(ubicar(CAJA()), CHEQUES)
  const tocadas = plan.celdas.map((c) => c.a1)
  // C8 = arqueo de caja en pesos · F8 su fecha · C11 el saldo en dólares del extracto. Son SUYAS.
  for (const suya of ['C8', 'F8', 'C9', 'C11', 'F11', 'C10']) {
    assert.ok(!tocadas.includes(suya), `${suya} la carga el dueño: no se toca`)
  }
  // Tampoco se toca ningún total ni el control de Cobranzas: son fórmulas que ya están bien.
  for (const ajena of ['E15', 'C16', 'C50', 'E17']) assert.ok(!tocadas.includes(ajena), `${ajena} no es de este arreglo`)
})

test('escribe EXACTAMENTE los cuatro arreglos, y el total sale de la fuente', () => {
  const plan = planCableado(ubicar(CAJA()), CHEQUES)
  const de = (a1) => plan.celdas.find((c) => c.a1 === a1)
  // 1 · el total de la cartera deja de ser la suma de una celda pegada.
  assert.match(de('C12').formula, /^=SUMIFS\(_CHEQUES_RAW!/)
  assert.ok(!de('C12').formula.includes('C47'), 'no puede volver a depender de una celda del detalle')
  // 2 · los seis tramos del calendario.
  for (let k = 0; k < 6; k++) assert.match(de(`C${21 + k}`).formula, /_CHEQUES_RAW/)
  assert.ok(!de('C21').formula.includes('$F$47'), 'el fósil que hacía desaparecer el segundo cheque')
  // 3 · el detalle vivo, con el número de SU cheque adentro.
  assert.match(de('C47').formula, /"90020099"/)
  assert.match(de('C48').formula, /"00000514"/)
  assert.match(de('F48').formula, /^=IF\(COUNTIFS/)
  assert.equal(de('A48').valor, '   Cheque 00000514 · Mineral Del Rio SA')
  // 4 · el canario, con el rango del detalle YA CORRIDO por la fila insertada.
  const canario = plan.celdas.find((c) => /CANARIO/.test(c.que))
  assert.match(canario.formula, /\$C\$47:\$C\$48/)
  assert.match(canario.formula, /\$C\$12/)
  assert.equal(plan.filaCanario, 51, 'va antes del control de Cobranzas, ya corrido')
})

test('LAS INSERCIONES VAN EN COORDENADAS ORIGINALES y se aplican de abajo hacia arriba', () => {
  // ESTE TEST NACE DE UN DAÑO REAL (30/07): la inserción del canario se calculaba sobre la fila YA
  // CORRIDA por la otra inserción y se aplicaba primero, así que la fila vacía cayó entre el control y
  // la diferencia. Hubo que borrar dos filas vacías de la pestaña real de CAJA.
  const plan = planCableado(ubicar(CAJA()), CHEQUES)
  const canario = plan.inserciones.find((i) => /canario/.test(i.para))
  const cartera = plan.inserciones.find((i) => /cartera/.test(i.para))
  assert.equal(cartera.startIndex, 47, 'después de la fila 47 (el último que sigue en cartera)')
  assert.equal(canario.startIndex, 49, 'antes del control, EN COORDENADAS DE HOY (control = 50)')
  // Simulacro del orden real de aplicación: descendente. Tiene que dejar el canario donde dice el plan.
  const filas = CAJA().map((f) => [...f])
  for (const ins of [...plan.inserciones].sort((a, b) => b.startIndex - a.startIndex)) {
    filas.splice(ins.startIndex, 0, ...Array.from({ length: ins.cuantas }, () => ['']))
  }
  assert.equal(String(filas[plan.filaCanario - 1]?.[0] ?? ''), '', 'la fila del canario quedó vacía y libre')
  assert.match(String(filas[plan.filaCanario]?.[0] ?? ''), /^⇒ Control: qué dice Cobranzas/,
    'el canario tiene que quedar INMEDIATAMENTE arriba del control')
  assert.equal(String(filas[47]?.[0] ?? ''), '', 'y la fila del cheque nuevo, libre')
})

test('el canario apunta al total del calendario CORRIDO por las dos inserciones', () => {
  const plan = planCableado(ubicar(CAJA()), CHEQUES)
  // El calendario está ARRIBA del detalle: no se corre por insertar filas abajo.
  assert.equal(plan.calTotal, 28)
  const canario = plan.celdas.find((c) => /CANARIO/.test(c.que))
  assert.match(canario.formula, /\$C\$28/)
})

test('sin cheques nuevos no inserta nada, pero igual cablea lo que estaba pegado', () => {
  const plan = planCableado(ubicar(CAJA()), [CHEQUES[0]])
  assert.deepEqual(plan.nuevos, [])
  assert.equal(plan.inserciones.filter((i) => /cartera/.test(i.para)).length, 0)
  assert.match(plan.celdas.find((c) => c.a1 === 'C47').formula, /_CHEQUES_RAW/)
})

test('CORRE DOS VECES SIN AGREGAR FILAS: si el canario ya está, se reescribe en su lugar', () => {
  // Sin esto, la segunda corrida mete una fila vacía en la pestaña real de CAJA cada vez.
  const f = CAJA()
  f.splice(47, 0, ['   Cheque 00000514 · Mineral Del Rio SA', 'ARS', '=SUMIFS(…)'])
  f.splice(50, 0, ['⇒ ¿el detalle está al día? — si dice ⚠, corré la réplica y regenerá CAJA', '', '', '', '', '', '', '=IF(…)'])
  const pos = ubicar(f)
  assert.equal(pos.canario, 51)
  assert.equal(pos.control, 52)
  const plan = planCableado(pos, CHEQUES)
  assert.deepEqual(plan.nuevos, [], 'los dos cheques ya están listados')
  assert.deepEqual(plan.inserciones, [], 'y no hay nada que insertar')
  assert.equal(plan.filaCanario, 51, 'el canario se reescribe donde está')
  const canario = plan.celdas.find((c) => /CANARIO/.test(c.que))
  assert.match(canario.formula, /\$C\$47:\$C\$48/)
})

test('numeroDelRotulo lee las dos formas que hay en la pestaña', () => {
  assert.equal(numeroDelRotulo('   ECHEQ 90020099 · Alimentos Del Sur SA'), '90020099')
  assert.equal(numeroDelRotulo('   Cheque 00000514 · Mineral Del Rio SA'), '00000514')
  assert.equal(numeroDelRotulo('   ECHEQ 90020100 · YA NO ES NUESTRO — endosado a ALUMETAL S.A'), '90020100')
  assert.equal(numeroDelRotulo('Total disponibilidades'), null)
})

test('TODAS las fórmulas van en locale es-AR: una coma de separador deja #ERROR!', () => {
  const plan = planCableado(ubicar(CAJA()), CHEQUES)
  for (const c of plan.celdas.filter((x) => x.formula)) {
    const sinTexto = c.formula.replace(/"[^"]*"/g, '""')
    assert.ok(!sinTexto.includes(','), `separador con coma en ${c.a1}: ${c.formula}`)
  }
})
