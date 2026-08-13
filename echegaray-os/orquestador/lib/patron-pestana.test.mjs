import test from 'node:test'
import assert from 'node:assert/strict'
import { auditarPatron, seccion, sub, total, ES_SECCION_NUM, glosasLargas, textoVisible } from './patron-pestana.mjs'

/** Una pestaña que cumple la gramática entera, para usar de base en cada caso. */
const buena = () => [
  ['Cargas sociales'],
  ['Qué se declara, qué se paga y qué va a salir · fuente: F931 del Drive · al 23/07/2026'],
  [],
  ['LA POSICIÓN', 'Monto', 'Origen'],
  [total('Deuda previsional en planes'), 7958394, 'Compras'],
  [sub('vence este mes'), 473767, 'Compras'],
  [],
  [seccion(1, 'Declarado en la DDJJ F931 — ¿cuánto generó la nómina?'), '', ''],
  ['Concepto', 'Monto', 'Origen'],
  ['Aportes Seguridad Social', 981497, 'F931 de enero'],
  [total('Total declarado'), 981497, ''],
  [],
  [seccion(2, 'Pagado — ¿cuánto salió de la caja?'), '', ''],
  ['Concepto', 'Monto', 'Origen'],
  ['F931', 500000, 'Compras'],
]

test('una pestaña que cumple la gramática no tiene hallazgos', () => {
  assert.deepEqual(auditarPatron(buena()), [])
})

test('los helpers producen exactamente lo que las reglas reconocen', () => {
  const m = seccion(3, 'planes de pago').match(ES_SECCION_NUM)
  assert.equal(m[1], '3')
  assert.equal(m[2], undefined, 'una sección de primer nivel no tiene sub-número')
  assert.equal(m[3], 'PLANES DE PAGO')
  assert.equal(sub('vence'), '   · vence')
  assert.equal(total('Total'), '⇒ Total')
})

test('exige título en oración y subtítulo con fuente y fecha', () => {
  const f = buena(); f[0] = ['CARGAS SOCIALES']; f[1] = []
  const r = auditarPatron(f).map((x) => x.regla)
  assert.ok(r.includes('titulo-versalita'))
  assert.ok(r.includes('sin-subtitulo'))
})

test('detecta una sección salteada y una repetida', () => {
  const f = buena()
  f[12][0] = seccion(4, 'Pagado — ¿cuánto salió de la caja?')
  const r = auditarPatron(f)
  assert.ok(r.some((x) => x.regla === 'seccion-desordenada' && x.fila === 13))
  f[12][0] = seccion(2, 'Declarado en la DDJJ F931 — ¿cuánto generó la nómina?')
  assert.ok(auditarPatron(f).some((x) => x.regla === 'seccion-repetida'))
})

test('un bloque en versalita sin número, después del hero, es un bloque suelto', () => {
  const f = buena()
  f.push(['LO QUE SALE DE LA CAJA — no es el devengado del mes'])
  const r = auditarPatron(f)
  assert.ok(r.some((x) => x.regla === 'bloque-sin-numero'))
  // Pero el hero (antes de la sección 1) es la excepción: no se marca.
  assert.ok(!r.some((x) => x.regla === 'bloque-sin-numero' && x.fila === 4))
})

test('varios anchos de grilla en la misma pestaña es el defecto "descuadrado"', () => {
  const f = buena()
  f.push([], [seccion(3, 'SAC y vacaciones')], ['Concepto', 'ene', 'feb', 'mar', 'abr', 'Total'],
    [], [seccion(4, 'Proyección')], ['Concepto', 'jul', 'ago', 'sep'])
  const m = auditarPatron(f).find((x) => x.regla === 'anchos-mezclados')
  assert.ok(m && /3, 4, 6/.test(m.detalle))
})

test('un #REF! o un #VALUE! vivo se reporta como rotura, no como estética', () => {
  const f = buena(); f[9][1] = '#VALUE!'
  const r = auditarPatron(f)
  assert.ok(r.some((x) => x.regla === 'error-de-formula' && x.fila === 10))
})

test('un número flotando sin rótulo en A ni en B no se entiende', () => {
  const f = buena(); f.push(['', '', 456])
  assert.ok(auditarPatron(f).some((x) => x.regla === 'fila-sin-concepto'))
  // Pero un listado agrupado rotula en B cuando el nombre lo puso la fila de grupo: eso sí se lee.
  const g = buena(); g.push(['', 'FA 0001-000123', 456])
  assert.ok(!auditarPatron(g).some((x) => x.regla === 'fila-sin-concepto'))
})

test('un ledger crudo al final es la única excepción al ancho único', () => {
  const f = buena()
  f.push([], [seccion(3, 'El registro, cheque por cheque')],
    ['Tipo', 'Nro', 'Fecha', 'Proveedor', 'Monto', 'Comp', 'Debitado', 'Unidad'])
  assert.ok(!auditarPatron(f).some((x) => x.regla === 'anchos-mezclados'))
  // Dos cuadros de anchos distintos, en cambio, sí descuadran la pestaña.
  f.push([], [seccion(4, 'Otro cuadro')], ['Concepto', 'ene', 'feb', 'mar', 'abr'])
  assert.ok(auditarPatron(f).some((x) => x.regla === 'anchos-mezclados'))
})

// ── LA EXCEPCIÓN 2: EL BLOQUE DE POSICIÓN, ARRIBA ────────────────────────────────────────────────
//
// "Impuestos y Financieros" abre con un calendario de vencimientos (fecha + importe) y una posición
// de financiamiento (límite, tomado, disponible) antes de su cuadro de doce meses. Ninguno de los dos
// tiene doce columnas ni tiene por qué tenerlas: forzarlos sería inventar diez celdas vacías por fila
// para que el auditor esté contento. La excepción se admite ARRIBA y sólo hacia ANGOSTO.

/** Una pestaña que abre con bloques de posición angostos y sigue con su cuadro mensual. */
const conPosicion = () => [
  ['Impuestos y financiero'],
  ['Qué se le debe al fisco · IVA de ARCA al 30/07 · IIBB al 30/06'],
  [],
  ['LA POSICIÓN AL 06/08', 'Monto'],
  [total('IMPUESTOS A FAVOR'), 7973348],
  [],
  [seccion(1, 'Calendario de vencimientos')],
  ['Fecha y concepto', 'Importe'],
  ['19/08 · IVA · DDJJ F.2051', 14820368],
  [],
  [seccion(2, 'Financiamiento')],
  ['Línea de financiamiento', 'Límite', 'Tomado', 'Disponible'],
  ['Acuerdo en descubierto', 18200000, 0, 18200000],
  [],
  [seccion(3, 'IVA — la DDJJ oficial'), '', '', '', '', ''],
  ['Concepto', 'ene', 'feb', 'mar', 'abr', 'Total'],
  ['Débito fiscal del período', 1, 2, 3, 4, 10],
]

test('los bloques de POSICIÓN arriba pueden ser más angostos que el cuadro', () => {
  assert.deepEqual(auditarPatron(conPosicion()).filter((x) => x.regla === 'anchos-mezclados'), [])
})

test('pero un cuadro angosto DESPUÉS del mensual sigue siendo descuadre', () => {
  const f = conPosicion()
  f.push([], [seccion(4, 'Otro cuadro')], ['Concepto', 'jul', 'ago'])
  const m = auditarPatron(f).find((x) => x.regla === 'anchos-mezclados')
  assert.ok(m, 'un ancho nuevo en el medio del detalle no es posición: es un cuadro que no se puso de acuerdo')
})

test('y un ancho de la posición que REAPARECE abajo pierde el perdón', () => {
  // Si el mismo ancho angosto vuelve a aparecer después del cuadro, no era la posición: era un
  // formato que se coló en dos lados. El perdón se retira entero, no sólo para la de abajo.
  const f = conPosicion()
  f.push([], [seccion(4, 'Un cuadro de dos columnas más abajo')], ['Fecha y concepto', 'Importe'])
  assert.ok(auditarPatron(f).some((x) => x.regla === 'anchos-mezclados'))
})

test('un bloque MÁS ANCHO arriba no es posición: sólo se perdona hacia angosto', () => {
  const f = conPosicion()
  f.splice(6, 0, ['Régimen', 'a', 'b', 'c', 'd', 'e', 'f', 'g'])
  assert.ok(auditarPatron(f).some((x) => x.regla === 'anchos-mezclados'))
})

test('un nombre en versalita con importes al lado es un dato, no un título de bloque', () => {
  const f = buena(); f.push(['PEDRO TELLO', 1234567, 'Compras'])
  assert.ok(!auditarPatron(f).some((x) => x.regla === 'bloque-sin-numero'))
})

test('una nota larga en el medio de la grilla desparrama la fila', () => {
  const f = buena()
  f[9][1] = 'El F931 de un mes vence al mes siguiente, así que lo que sale de caja es el devengado anterior'
  assert.ok(auditarPatron(f).some((x) => x.regla === 'nota-en-el-medio' && x.fila === 10))
  // La misma nota en la ÚLTIMA columna es correcta y no se marca.
  const g = buena(); g[9][2] = 'El F931 de un mes vence al mes siguiente, así que lo que sale de caja es el devengado anterior'
  assert.ok(!auditarPatron(g).some((x) => x.regla === 'nota-en-el-medio'))
})

test('una pestaña vacía se reporta entera, sin reventar', () => {
  assert.deepEqual(auditarPatron([]), [{ fila: 0, regla: 'vacia', detalle: 'La pestaña no tiene contenido.' }])
})

test('las sub-secciones cuelgan de su sección y corren de a una', () => {
  const f = buena()
  f.push([], [seccion(3, 'Anexo')], [], ['3.1 · PRIMER DETALLE'], [], ['3.2 · SEGUNDO DETALLE'])
  assert.deepEqual(auditarPatron(f), [])
  // Saltarse una sub-sección se marca…
  f[f.length - 1][0] = '3.5 · SEGUNDO DETALLE'
  assert.ok(auditarPatron(f).some((x) => x.regla === 'seccion-desordenada'))
  // …y colgar de una sección que no está abierta, también.
  f[f.length - 1][0] = '9.1 · SEGUNDO DETALLE'
  assert.ok(auditarPatron(f).some((x) => x.regla === 'subseccion-huerfana'))
})

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// MINIMALISMO (13/08). El dueño rechazó "Jornales por Quincena" sin que tuviera un solo defecto de
// los que `auditarPatron` mide: *"tiene muchas palabras y frases y explicación que nadie lee"*. Lo
// que faltaba era una medida del LARGO de la columna de concepto — la única que el auditor exceptúa.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

test('glosasLargas marca el párrafo de la columna A y deja pasar el rótulo', () => {
  const f = [['t'], ['sub'], [sub('Proyectado al convenio')], [sub('x'.repeat(80))]]
  const d = glosasLargas(f)
  assert.equal(d.length, 1, 'un rótulo corto no puede marcarse y un párrafo de 82 no puede pasar')
  assert.equal(d[0].fila, 4)
  // 82 y no 85: se mide el texto TRIMEADO, así que la sangría del sub-ítem ("   · ") no gasta tope.
  // Es deliberado — el tope mide palabras, no indentación, y el prefijo lo pone la gramática, no quien
  // escribe la glosa.
  assert.equal(d[0].largo, 82)
})

test('el texto que RINDE una fórmula también se mide: es donde se escondían las glosas largas', () => {
  // El caso real: el supuesto del convenio de Jornales medía 374 caracteres adentro de un IF, y todos
  // los auditores lo salteaban porque leen valores — y el valor de una fórmula, en frío, es "=IF(…".
  assert.equal(textoVisible('=IF(A1=0;"corto";"otro corto")'), 'otro corto')
  assert.equal(glosasLargas([['t'], ['s'], [`=IF(A1=0;"${'z'.repeat(90)} y algo";"ok")`]]).length, 1)
  // Se devuelve el literal MÁS LARGO: es el que ocupa la fila cuando la condición cae de ese lado.
  const largo = `la proyección ${'de más '.repeat(9)}fin`   // 70 caracteres de prosa con espacios
  assert.equal(textoVisible(`=IF(A1;"${largo}";"ok listo")`), largo)
})

test('una máscara de formato no es una glosa — si no, TEXT(x;"#,##0") daría falso rojo', () => {
  assert.equal(textoVisible('=TEXT(A1;"#,##0")&" · "&TEXT(B1;"d/m/yyyy")'), '')
  assert.deepEqual(glosasLargas([['t'], ['s'], [`=TEXT(A1;"${'#,##0 '.repeat(15)}")`]]), [])
})

test('las filas 1 y 2 quedan afuera: la 2 es, POR GRAMÁTICA, la línea de prosa de la pestaña', () => {
  // "qué contesta · fuente · fecha de corte" no entra en 60 y no tiene que entrar: es el único lugar
  // donde la gramática de este repo PIDE una oración. Medirla ahí sería obligar a mentir el subtítulo.
  const f = [['x'.repeat(90)], ['y'.repeat(90)], [sub('z'.repeat(90))]]
  assert.deepEqual(glosasLargas(f).map((d) => d.fila), [3])
})
