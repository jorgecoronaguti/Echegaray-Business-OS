import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CUADRO, verificarCuadro, expresionReal, formulaLineaMes,
  formulaCalendarioImpuestosMes, formulaCalendarioImpuestosSemana, CALENDARIO_IMPUESTOS,
  rotulosCalendarioImpuestos, colMesDelAnio, ROTULOS_CALENDARIO,
  formulaChequesSinFactura, instrumentosDeLinea, destinoDetalle, INSTRUMENTOS,
} from './cash-flow-lineas.mjs'
import { MARCAS } from './cheques-cobertura.mjs'

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LÍNEA IVA/IIBB A PAGAR — la salida que el cuadro no proyectaba (TAUDIT, 28/07)
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const lineaCalendario = () => verificarCuadro().lineas.find((l) => l.calendarioImpuestos)

test('la línea de IVA/IIBB está en el cuadro, en "Pagos de impuestos", como pago (signo −1)', () => {
  const op = CUADRO.find((a) => a.actividad === 'ACTIVIDADES OPERATIVAS')
  const grupo = op.grupos.find((g) => g.nombre === 'Pagos de impuestos')
  assert.ok(grupo, 'existe el grupo de impuestos')
  assert.equal(grupo.signo, -1, 'es un pago')
  const l = grupo.lineas.find((x) => x.calendarioImpuestos)
  assert.ok(l, 'la línea de IVA/IIBB vive en el grupo de impuestos')
  // NO tiene rubro: no sale de Compras. Por eso no rompe la partición de rubros del cuadro.
  assert.equal(l.rubro, undefined)
})

test('la línea de IVA/IIBB no ensucia la partición de rubros de Compras', () => {
  // verificarCuadro rompe si un rubro queda sin ubicar o si se nombra uno inexistente: como la línea
  // no tiene rubro, la partición sigue intacta y hay más líneas que rubros.
  const { lineas, rubrosUsados } = verificarCuadro()
  assert.ok(lineas.length > rubrosUsados.length)
})

test('la línea de IVA/IIBB no tiene fórmula genérica — la arma el generador (mensual y semanal)', () => {
  const l = lineaCalendario()
  assert.equal(expresionReal(l, 'B$3', 'C$3'), null, 'semanal: la llena el generador')
  assert.equal(formulaLineaMes(l, 'I', 'I', 3), null, 'mensual: la llena el generador')
})

test('los rótulos del calendario llevan el prefijo "⇒" que escribe impuestos-pestana', () => {
  // Si el rótulo no coincide con el que la otra pestaña escribe, el generador no ubica la fila y rompe
  // en vez de referenciar una fila muerta. Anclar acá el contrato entre las dos pestañas.
  assert.equal(CALENDARIO_IMPUESTOS.pestaña, 'Impuestos y Financieros')
  assert.deepEqual(rotulosCalendarioImpuestos().map((r) => r.rotulo),
    ['⇒ IVA a pagar en efectivo', '⇒ IIBB a pagar en el mes'])
  // "en efectivo" no es cosmético: el IVA que absorbe el crédito de libre disponibilidad NO sale de la
  // caja, y esta línea del cash flow sólo debe proyectar la plata que efectivamente se paga.
  assert.equal(ROTULOS_CALENDARIO.iva, 'IVA a pagar en efectivo')
})

test('EL CONTRATO NO SE PUEDE RENOMBRAR DE UN SOLO LADO', () => {
  // Qué pasó (30/07 → 31/07): impuestos-pestana.mjs renombró su fila a "IVA a pagar en efectivo"
  // razonando sobre el NÚMERO DE FILA ("queda en la misma fila 18 que leía el cash flow"), pero el
  // consumidor la ubica POR TEXTO. Resultado: los dos cash flow no se pudieron regenerar por un día —
  // fallaban cerrado, que es lo correcto, pero el archivo dejó de recibir todo lo demás.
  //
  // Este test lee el FUENTE del productor: si alguien vuelve a escribir el texto ahí en vez de
  // importar la constante, falla acá y no dentro de un mes cuando el cash flow no arranque.
  const src = readFileSync(new URL('../scripts/impuestos-pestana.mjs', import.meta.url), 'utf8')
  for (const [clave, rotulo] of Object.entries(ROTULOS_CALENDARIO)) {
    assert.ok(!src.includes(`'${rotulo}'`) && !src.includes(`"${rotulo}"`),
      `impuestos-pestana.mjs tiene el rótulo de ${clave} escrito a mano ("${rotulo}"): tiene que salir de ROTULOS_CALENDARIO`)
  }
  assert.match(src, /import \{ CALENDARIO_IMPUESTOS \} from '\.\.\/lib\/cash-flow-lineas\.mjs'/,
    'el productor importa el contrato del consumidor')
  assert.match(src, /mensual\(CALENDARIO_IMPUESTOS\.rotulos\.iva,/, 'y lo usa para escribir la fila del IVA')
  assert.match(src, /mensual\(CALENDARIO_IMPUESTOS\.rotulos\.iibb,/, 'y para la del IIBB')
})

test('la fórmula MENSUAL lee la fila 18 (IVA) y la 28 (IIBB) de la MISMA columna del mes', () => {
  const f = formulaCalendarioImpuestosMes('D', { iva: 18, iibb: 28 })
  assert.equal(f, "=N('Impuestos y Financieros'!D$18)+N('Impuestos y Financieros'!D$28)")
  // N() para que una celda vacía o "—" cuente 0 sin romper.
  assert.ok(f.includes('N(') && !f.includes(','), 'separador es-AR: sin comas')
  // La columna del mes se alinea con la del calendario: enero es B.
  assert.equal(colMesDelAnio(1), 'B')
  assert.equal(colMesDelAnio(12), 'M')
  assert.equal(colMesDelAnio(3), 'D') // marzo, la columna que TAUDIT nombró ($7,8M)
})

test('la fórmula SEMANAL imputa cada mes a la semana de su vencimiento (fin de mes), es-AR', () => {
  const f = formulaCalendarioImpuestosSemana('B$3', 'B$3+7', 2026, { iva: 18, iibb: 28 })
  assert.ok(f.startsWith('='))
  // Referencia la fila 18 y la 28 de "Impuestos y Financieros".
  assert.ok(f.includes("'Impuestos y Financieros'!B$18") && f.includes("'Impuestos y Financieros'!B$28"))
  assert.ok(f.includes("'Impuestos y Financieros'!M$18"), 'llega hasta diciembre (columna M)')
  // El vencimiento se construye con DATE + EOMONTH, con separador ';' (coma = decimal en es-AR).
  assert.ok(f.includes('EOMONTH(DATE(2026;1;1);0)'))
  assert.ok(!f.includes(','), 'separador es-AR: ni una coma')
  // Ventana [desde, hasta) con límite superior EXCLUYENTE, como el resto del cuadro.
  assert.ok(f.includes('>=B$3') && f.includes('<B$3+7'))
  // Un término por cada uno de los doce meses del año.
  for (let m = 1; m <= 12; m++) assert.ok(f.includes(`DATE(2026;${m};1)`), `está el mes ${m}`)
})

test('sin las filas ubicadas, las fórmulas del calendario ROMPEN (no referencian una fila muerta)', () => {
  assert.throws(() => formulaCalendarioImpuestosMes('D', {}), /fila muerta/)
  assert.throws(() => formulaCalendarioImpuestosSemana('B$3', 'B$3+7', 2026, { iva: 18 }), /fila muerta/)
})

test('el vínculo de trazabilidad del IVA/IIBB va al calendario (a la fila del IVA si ya se ubicó)', () => {
  const l = lineaCalendario()
  // Sin filas ubicadas: a la pestaña (A1), nunca a Compras ni a una celda adivinada.
  assert.deepEqual(destinoDetalle(l, {}, {}), { pestaña: 'Impuestos y Financieros', rango: 'A1' })
  // Con la fila ubicada: a la fila del "⇒ IVA a pagar".
  assert.deepEqual(destinoDetalle(l, {}, { iva: 18, iibb: 28 }), { pestaña: 'Impuestos y Financieros', rango: 'A18' })
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// CUOTAS DE TARJETA — línea propia, SIN sumar plata nueva (split de la línea "sin factura")
// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('la línea de cheques se abrió en dos: cheques y cuotas de tarjeta, cada una a SU pestaña', () => {
  const chequesLineas = verificarCuadro().lineas.filter((l) => l.cheques)
  assert.equal(chequesLineas.length, 2, 'dos líneas: cheques y tarjeta')
  const porInst = new Map(chequesLineas.map((l) => [l.inst, l]))
  assert.equal(porInst.get('cheques').detalle, 'Cheques Emitidos')
  assert.equal(porInst.get('tarjeta').detalle, 'Tarjeta de Credito')
})

test('instrumentosDeLinea abre UN instrumento por línea, o los dos sin `inst`', () => {
  assert.deepEqual(instrumentosDeLinea('tarjeta'), [INSTRUMENTOS.tarjeta])
  assert.deepEqual(instrumentosDeLinea('cheques'), [INSTRUMENTOS.cheques])
  assert.equal(instrumentosDeLinea(undefined).length, 2)
})

test('la línea de tarjeta lee "Tarjeta de Credito" col E (monto) por col H (fecha), marca en L', () => {
  const f = formulaChequesSinFactura('B$3', 'EOMONTH(B$3;0)+1', MARCAS.falta, instrumentosDeLinea('tarjeta'))
  assert.ok(f.startsWith('='))
  // SÓLO tarjeta: monto E, fecha H, marca L. NADA de Cheques Emitidos (o duplicaría al otro renglón).
  assert.ok(f.includes("'Tarjeta de Credito'!$E$3:$E$400"), 'monto = col E')
  assert.ok(f.includes("'Tarjeta de Credito'!$H$3:$H$400"), 'fecha de pago = col H')
  assert.ok(f.includes("'Tarjeta de Credito'!$L$3:$L$400"), 'marca = col L')
  assert.ok(!f.includes('Cheques Emitidos'), 'no mezcla la otra pestaña')
  // Anti-doble-conteo: sólo suma lo que tiene la marca "FALTA cargar la factura".
  assert.ok(f.includes(MARCAS.falta))
  // es-AR y ventana excluyente.
  assert.ok(!f.includes(',') && f.includes('>=B$3') && f.includes('<EOMONTH(B$3;0)+1'))
})

test('cheques + tarjeta por separado = la fórmula de los dos juntos: NO hay plata nueva', () => {
  const desde = 'B$3'; const hasta = 'EOMONTH(B$3;0)+1'
  const juntos = formulaChequesSinFactura(desde, hasta, MARCAS.falta) // default: los dos
  const cheques = formulaChequesSinFactura(desde, hasta, MARCAS.falta, instrumentosDeLinea('cheques'))
  const tarjeta = formulaChequesSinFactura(desde, hasta, MARCAS.falta, instrumentosDeLinea('tarjeta'))
  // El split es de PRESENTACIÓN: la suma de los dos sumandos es exactamente la fórmula original.
  assert.equal(`${cheques.slice(1)}+${tarjeta.slice(1)}`, juntos.slice(1))
})

test('el vínculo de la línea de tarjeta apunta a la columna de monto de Tarjeta de Credito (E)', () => {
  const tarjeta = verificarCuadro().lineas.find((l) => l.inst === 'tarjeta')
  assert.deepEqual(destinoDetalle(tarjeta, {}, {}), { pestaña: 'Tarjeta de Credito', rango: 'E3:E400' })
  const cheques = verificarCuadro().lineas.find((l) => l.inst === 'cheques')
  assert.deepEqual(destinoDetalle(cheques, {}, {}), { pestaña: 'Cheques Emitidos', rango: 'F2:F400' })
})
