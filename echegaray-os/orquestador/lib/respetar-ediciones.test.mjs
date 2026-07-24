import test from 'node:test'
import assert from 'node:assert/strict'
import { respetarEdiciones, detectarEdiciones, esRotulo, esEstructural, detectarArranqueEnFrio, MAX_BORRADOS_CREIBLES } from './respetar-ediciones.mjs'
import { VACIO } from './preservar-anotaciones.mjs'

test('un rótulo es texto: no una fórmula, no un número, no un importe escrito', () => {
  assert.ok(esRotulo('Deuda previsional en cuotas'))
  assert.ok(esRotulo('⇒ Total pagado'))
  assert.ok(!esRotulo('=SUM(B1:B9)'))
  assert.ok(!esRotulo(1234))
  assert.ok(!esRotulo('$1.234.567'))
  assert.ok(!esRotulo('2,00%'))
  assert.ok(!esRotulo(''))
  assert.ok(!esRotulo(VACIO), 'el centinela del generador no es un rótulo')
})

test('detecta la edición porque MI texto ya no está en la pestaña', () => {
  const mios = ['Deuda previsional en cuotas', 'F931']
  const actual = [['Plan de pago ARCA', 100], ['F931', 200]]
  const generado = [['Deuda previsional en cuotas'], ['F931']]
  const e = detectarEdiciones(mios, actual, generado)
  assert.equal(e.size, 1)
  assert.ok(e.has('Deuda previsional en cuotas'))
})

test('si YO dejé de escribir un texto, no es una edición del dueño', () => {
  // Se comió el subtítulo de Impuestos: lo reescribí, el anterior desapareció, y la regla lo
  // registró como "el dueño lo borró". Desde entonces respetaba vacío y la pestaña quedaba sin
  // subtítulo para siempre.
  const mios = ['Subtítulo viejo']
  const actual = [['Subtítulo nuevo']]
  const generado = [['Subtítulo nuevo']]
  assert.equal(detectarEdiciones(mios, actual, generado).size, 0)
})

test('si mi texto se MOVIÓ de fila, no es una edición', () => {
  // Es exactamente el caso que rompió la primera versión: comparaba por posición, y una fila de más
  // corría todo el registro un renglón y "respetaba" la celda equivocada. Dejó CAJA con un importe
  // pegado donde iba el título "DISPONIBILIDADES".
  const mios = ['Total pagado']
  const actual = [['otra cosa'], ['más cosas'], ['Total pagado']]
  assert.equal(detectarEdiciones(mios, actual, [['Total pagado']]).size, 0)
})

test('respeta la edición esté donde esté la fila', () => {
  const ediciones = new Map([['Deuda previsional en cuotas', 'Plan de pago ARCA']])
  const { grid, respetadas } = respetarEdiciones(
    [['algo'], ['Deuda previsional en cuotas', 100]], [['algo'], ['Plan de pago ARCA', 100]], ediciones)
  assert.equal(grid[1][0], 'Plan de pago ARCA')
  assert.equal(respetadas.length, 1)
})

test('UNA ELIMINACIÓN TAMBIÉN ES UNA DECISIÓN: vacío gana', () => {
  const { grid } = respetarEdiciones([['Lo que falta saber']], [['']], new Map([['Lo que falta saber', '']]))
  assert.equal(grid[0][0], '')
})

test('si el dueño vuelve atrás, el generador retoma su versión', () => {
  const ediciones = new Map([['Total pagado', 'Salidas']])
  const { grid, respetadas } = respetarEdiciones([['Total pagado']], [['Total pagado']], ediciones)
  assert.equal(grid[0][0], 'Total pagado')
  assert.equal(respetadas.length, 0)
})

test('sin nada registrado, el generador escribe lo suyo', () => {
  const { grid, respetadas } = respetarEdiciones([['Concepto']], [['Otra cosa']], new Map())
  assert.equal(grid[0][0], 'Concepto')
  assert.equal(respetadas.length, 0)
})

test('el importe y la fórmula NO se respetan: son la respuesta que la pestaña calcula', () => {
  const { grid } = respetarEdiciones([['Total', '=SUM(A1:A9)']], [['Total', '12345']], new Map([['12345', '999']]))
  assert.equal(grid[0][1], '=SUM(A1:A9)')
})

test('el apóstrofo que fuerza texto no cuenta como una edición', () => {
  // Sheets guarda "'ene-26" y devuelve "ene-26": sin normalizarlo, cada encabezado de mes parecería
  // editado en cada corrida y la regla los congelaría.
  assert.equal(detectarEdiciones(["'ene-26"], [['ene-26']], [["'ene-26"]]).size, 0)
})

test('el borrado de un TÍTULO nunca se da por bueno: es la forma de mi propio error', () => {
  // El registro se enganchó y dejó a CAJA sin subtítulo: una vez marcado como borrado, el generador
  // no lo vuelve a escribir, sigue ausente, y la marca se confirma sola. Un lazo del que sólo se
  // salía purgando la tabla a mano.
  const mios = ['2 · CALENDARIO DE VENCIMIENTOS', 'Cuánta plata hay de verdad, qué ya está comprometido y hasta cuándo alcanza']
  const generado = [['2 · CALENDARIO DE VENCIMIENTOS'], ['Cuánta plata hay de verdad, qué ya está comprometido y hasta cuándo alcanza']]
  assert.equal(detectarEdiciones(mios, [['otra cosa']], generado).size, 0)
})

// ── EL ARRANQUE EN FRÍO ────────────────────────────────────────────────────────────────────────
// Una pestaña que nunca usó la regla no tiene registro, así que la primera corrida pisaría todo lo
// que el dueño hubiera editado antes. Estos casos cubren el único indicio honesto que hay sin
// historia: el generador quiere escribir un rótulo que en la pestaña no está en ninguna parte.

test('arranque en frío: detecta el rótulo que el generador escribe y en la pestaña no está', () => {
  const generado = [['Deuda previsional en cuotas'], ['Saldo'], [1000]]
  const actual = [['Plan de pago ARCA'], ['Saldo'], [1000]]
  const r = detectarArranqueEnFrio(generado, actual)
  assert.deepEqual(r.map((x) => x.mio), ['Deuda previsional en cuotas'])
})

test('arranque en frío: no marca un rótulo que sigue estando, aunque se haya movido de fila', () => {
  const generado = [['Saldo'], ['Deuda']]
  const actual = [[''], ['Deuda'], ['Saldo']]
  assert.deepEqual(detectarArranqueEnFrio(generado, actual), [])
})

test('arranque en frío: NUNCA da por borrado un título ni una sección', () => {
  // Nadie borra a propósito el encabezado de una sección: si desapareció, lo movió el generador.
  const generado = [['1 · LA POSICIÓN'], ['⇒ Total del año'], ['Un concepto suelto']]
  const r = detectarArranqueEnFrio(generado, [['']])
  assert.deepEqual(r.map((x) => x.mio), ['Un concepto suelto'])
})

test('arranque en frío: ignora números y fórmulas, que no son rótulos', () => {
  const generado = [['=SUMA(A1:A9)'], [1234], ['12%'], ['Concepto real']]
  const r = detectarArranqueEnFrio(generado, [['']])
  assert.deepEqual(r.map((x) => x.mio), ['Concepto real'])
})

test('una fecha NO es un rótulo: congelarla dejaría el cuadro clavado en un año', () => {
  // Hallazgo de la primera corrida real (23/07) sobre "Estructura" y "Recurrentes": los doce
  // encabezados de mes entraban como rótulos porque la barra no es un dígito.
  for (const f of ['1/1/2026', '01/12/2026', '31-12-2026', '2026-07', '2026-07-23']) {
    assert.equal(esRotulo(f), false, `"${f}" es una fecha, no un texto que alguien redacte`)
  }
  // Un mes escrito como palabra SÍ es un rótulo: ahí hay una decisión de redacción.
  assert.equal(esRotulo('ene-26'), true)
  assert.equal(esRotulo('Enero 2026'), true)
})

// ── EL SEGURO CONTRA EL BORRADO MASIVO (23/07) ─────────────────────────────────────────────────────
// El registro tenía 13 borrados que el dueño nunca hizo: un bloque entero de "Recurrentes" y dos
// rótulos de "Proveedores". Un falso borrado se confirma solo, así que el daño era permanente.
test('un borrado puntual SÍ se registra: es una decisión creíble de una persona', () => {
  const mios = ['Nota que no sirve', 'Otro rótulo']
  const generado = [['Nota que no sirve'], ['Otro rótulo']]
  const actual = [[''], ['Otro rótulo']]
  const e = detectarEdiciones(mios, actual, generado)
  assert.equal(e.get('Nota que no sirve'), '')
  assert.equal(e.size, 1)
})

test('un borrado MASIVO no se registra: eso es una lectura que falló, no el dueño limpiando', () => {
  const mios = Array.from({ length: MAX_BORRADOS_CREIBLES + 1 }, (_, i) => `Rótulo ${i}`)
  const generado = mios.map((m) => [m])
  const actual = [['']] // la lectura no vio nada de eso
  assert.equal(detectarEdiciones(mios, actual, generado).size, 0)
})

test('justo en el límite todavía se cree: el seguro no es un techo caprichoso', () => {
  const mios = Array.from({ length: MAX_BORRADOS_CREIBLES }, (_, i) => `Rótulo ${i}`)
  const generado = mios.map((m) => [m])
  assert.equal(detectarEdiciones(mios, [['']], generado).size, MAX_BORRADOS_CREIBLES)
})
