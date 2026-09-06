import test from 'node:test'
import assert from 'node:assert/strict'
import { amparoDeOrigen, bloquesDeGrilla, normalizarRotulo, expandirColumnas, indiceDeColumna } from './origen-declarado.mjs'

/** Una grilla con la forma real de «Cargas Sociales»: el bloque 7 con sus tres planes y su total. */
const grilla = () => [
  ['Cargas Sociales'],                                    // 1
  ['Cuánto cuesta el personal · DDJJ F931 · al 05/09'],   // 2
  [],                                                     // 3
  ['6 · FONDO DE CESE', 'x'],                             // 4
  ['Fondo de Cese devengado', 721872],                    // 5
  [],                                                     // 6
  ['7 · PLANES DE PAGO DE DEUDA PREVISIONAL — LAS CUOTAS, MES POR MES'], // 7
  ['Concepto', 'ene-26', 'feb-26'],                       // 8
  ['Plan F931 W303094', 2494875.65, 2494875.65],          // 9
  ['⇒ Total de cuotas del año', '=SUM(B9:B9)'],           // 10
  [],                                                     // 11
  ['8 · OTRO BLOQUE'],                                    // 12
  ['Algo pegado que no está amparado', 999],              // 13
]

const DECL = [{ bloque: 'Planes de pago de deuda previsional', cols: 'B:M', que: 'réplica de Compras' }]

test('normalizarRotulo saca el número de sección, la glosa, las tildes y las mayúsculas', () => {
  assert.equal(
    normalizarRotulo('7 · PLANES DE PAGO DE DEUDA PREVISIONAL — LAS CUOTAS, MES POR MES'),
    'planes de pago de deuda previsional',
  )
  // El mismo bloque renumerado sigue siendo el mismo bloque: es la razón de ser de la normalización.
  assert.equal(normalizarRotulo('9 · Planes de pago de deuda previsional'), normalizarRotulo('7 · PLANES DE PAGO DE DEUDA PREVISIONAL'))
})

test('indiceDeColumna y expandirColumnas cubren el rango y rechazan lo que no es columna', () => {
  assert.equal(indiceDeColumna('A'), 0)
  assert.equal(indiceDeColumna('AA'), 26)
  assert.deepEqual(expandirColumnas('B:E'), ['B', 'C', 'D', 'E'])
  assert.deepEqual(expandirColumnas('C'), ['C'])
  assert.throws(() => expandirColumnas('M:B'), /dado vuelta/)
  assert.throws(() => indiceDeColumna('3'), /no es una columna/)
})

test('bloquesDeGrilla parte por filas vacías, igual que el censo', () => {
  assert.deepEqual(bloquesDeGrilla(grilla()), [
    { desde: 0, hasta: 1 }, { desde: 3, hasta: 4 }, { desde: 6, hasta: 9 }, { desde: 11, hasta: 12 },
  ])
})

test('el amparo cubre las cuotas del bloque declarado', () => {
  const { amparadas, huerfanas } = amparoDeOrigen(grilla(), DECL)
  assert.deepEqual(huerfanas, [])
  assert.ok(amparadas.has('B9'), 'la cuota de enero tiene que quedar amparada')
  assert.ok(amparadas.has('C9'), 'la cuota de febrero tiene que quedar amparada')
})

// ═══ LAS TRES PRUEBAS DE QUE ESTO SIGUE SIENDO UN CONTROL ═══
// Una excepción que ampara de más deja de ser excepción y pasa a ser el interruptor de apagado.

test('el amparo NO se derrama al bloque siguiente', () => {
  const { amparadas } = amparoDeOrigen(grilla(), DECL)
  assert.equal(amparadas.has('B13'), false, 'el 999 del bloque 8 no está amparado por la declaración del bloque 7')
})

test('el amparo NO se derrama a una columna no declarada', () => {
  const { amparadas } = amparoDeOrigen(grilla(), DECL)
  assert.equal(amparadas.has('A9'), false, 'la A es el concepto, no está en B:M')
  assert.equal(amparadas.has('N9'), false, 'la N es el total del renglón y es fórmula: fuera del amparo')
})

test('una declaración sin columnas no ampara nada y se denuncia', () => {
  const { amparadas, huerfanas } = amparoDeOrigen(grilla(), [{ bloque: 'Planes de pago de deuda previsional' }])
  assert.equal(amparadas.size, 0, 'un permiso en blanco no se otorga por omisión')
  assert.equal(huerfanas.length, 1)
  assert.match(huerfanas[0].motivo, /columnas/)
})

test('si el bloque declarado ya no existe, la declaración queda HUÉRFANA y se denuncia', () => {
  // El bloque se renombró: la declaración se quedó amparando un rótulo que la pestaña ya no tiene.
  const sinBloque = grilla().map((f) => (String(f[0] ?? '').startsWith('7 · ') ? ['7 · CONVENIOS DE PAGO'] : f))
  const { amparadas, huerfanas } = amparoDeOrigen(sinBloque, DECL)
  assert.equal(amparadas.size, 0)
  assert.equal(huerfanas.length, 1)
  assert.equal(huerfanas[0].bloque, 'Planes de pago de deuda previsional')
  assert.match(huerfanas[0].motivo, /ningún bloque/)
})

test('el rótulo se busca sólo en la columna A: una celda de datos no abre un amparo', () => {
  const impostor = [['x', 'Planes de pago de deuda previsional', 123]]
  const { amparadas, huerfanas } = amparoDeOrigen(impostor, DECL)
  assert.equal(amparadas.size, 0)
  assert.equal(huerfanas.length, 1, 'el texto en la B no titula un bloque')
})

test('el amparo sigue al bloque cuando se mueve de fila', () => {
  // La regla del repositorio: por RÓTULO, nunca por posición. Se insertan cuatro filas arriba.
  const corrida = [[], [], [], [], ...grilla()]
  const { amparadas } = amparoDeOrigen(corrida, DECL)
  assert.ok(amparadas.has('B13'), 'la cuota se movió de B9 a B13 y el amparo la siguió')
  assert.equal(amparadas.has('B9'), false, 'y dejó de amparar la fila vieja')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LOS DOS AGUJEROS QUE CONVERTÍAN LA EXCEPCIÓN DECLARADA EN UN INTERRUPTOR (06/09/2026)
// ══════════════════════════════════════════════════════════════════════════════════════════════════
//
// Una grilla del CENSO no trae strings: trae `{valor, formula, numero, derivada, formato}`, y una
// celda vacía es `{valor: null, …}`. `visible()` hacía `String(celda?.valor ?? celda ?? '')`, así que
// una celda vacía caía al objeto y devolvía "[object Object]" — con lo cual NINGUNA fila era vacía,
// `bloquesDeGrilla` devolvía UN bloque por pestaña y cualquier declaración amparaba la pestaña
// entera en sus columnas. Medido en «Plantel»: declarar los cuadros 2 y 3 amparaba de yapa `D68:G68`
// y las diecisiete cuentas de recibos de `G70:G86`, que no son de esos cuadros.
//
// El segundo: el amparo llegaba hasta el renglón `⇒` del cuadro. Los seis fósiles de `D24`/`D66:G66`
// —las filas «⇒ 17 persona(s)»— quedaban amparados y el censo daba 0 de 285.

/** La MISMA grilla, pero con celdas del censo: es la forma con la que corre en producción. */
const comoCenso = (filas) => filas.map((f) => Array.from({ length: 14 }, (_, j) => ({
  valor: f[j] === undefined ? null : f[j], formula: null, numero: typeof f[j] === 'number' ? f[j] : null,
  derivada: false, formato: null,
})))

test('UNA FILA VACÍA DEL CENSO ES VACÍA: si no, el bloque se come la pestaña entera', () => {
  const filas = comoCenso(grilla())
  const bloques = bloquesDeGrilla(filas)
  assert.ok(bloques.length > 1, `la grilla del censo tiene que partirse en varios bloques, dio ${bloques.length}`)
  const { amparadas } = amparoDeOrigen(filas, [{ bloque: '7 · PLANES DE PAGO DE DEUDA PREVISIONAL', cols: 'B:M', que: 'x' }])
  // La fila 5 («Fondo de Cese devengado») vive en OTRO bloque: no puede quedar amparada.
  assert.equal(amparadas.has('B5'), false, 'el amparo se derramó a un bloque anterior')
})

test('EL AMPARO SE CORTA EN LA ESTRUCTURA DEL CUADRO: su título y su renglón ⇒ nunca son dato de origen', () => {
  const filas = [
    ['1 · UN CUADRO', 100],
    ['Persona', 'ene'],
    ['Aguero', 1000],
    ['⇒ 17 persona(s)', 46128],
    [],
  ]
  const { amparadas } = amparoDeOrigen(filas, [{ bloque: '1 · UN CUADRO', cols: 'B', que: 'x' }])
  assert.equal(amparadas.has('B3'), true, 'el renglón de datos sí queda amparado')
  assert.equal(amparadas.has('B4'), false, 'el renglón ⇒ de total NO puede quedar amparado')
  assert.equal(amparadas.has('B1'), false, 'el título de sección NO puede quedar amparado')
})

test('UN DATO QUE ARRANCA CON UNA PALABRA DE ENCABEZADO SIGUE SIENDO UN DATO', () => {
  // Medido: `Cargas Sociales!A81` es «Plan F931 W303094 — financiación de junio 2026» y sus tres
  // cuotas quedaban fuera del amparo porque «plan» abre la lista de ES_ENCABEZADO. Un encabezado no
  // lleva importes.
  const filas = [
    ['7 · PLANES DE PAGO', 'ene'],
    ['Plan F931 W303094 — financiación de junio 2026', 2494875.65],
    ['⇒ Total de cuotas del año', 2494875.65],
    [],
  ]
  const { amparadas } = amparoDeOrigen(filas, [{ bloque: '7 · PLANES DE PAGO', cols: 'B', que: 'x' }])
  assert.equal(amparadas.has('B2'), true, 'la cuota de un plan es dato, aunque su rótulo empiece con «Plan»')
  assert.equal(amparadas.has('B3'), false)
})
