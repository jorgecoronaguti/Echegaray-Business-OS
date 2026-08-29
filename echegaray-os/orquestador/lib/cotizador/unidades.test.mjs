// «520 m² NO SON 520 MILLONES» — el test obligatorio del §7.
//
// Todos los casos de acá salen de textos que aparecen en la conversación real con el dueño o en los
// planos leídos. Se escriben como los escribe él: sin acentos, con typos, con la unidad pegada al
// número, en formato argentino.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DIMENSION, UNIDADES, normalizarUnidad, mismaDimension, convertir,
  numeroAR, leerCantidad, compatibleConPartida,
} from './unidades.mjs'
import { ESTADO } from './contrato.mjs'

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL CASO QUE DA NOMBRE AL ARCHIVO
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('520 m² son 520 metros cuadrados — NO 520 millones', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `leerCantidad`, mover el bloque del multiplicador ANTES del
  // PASO 1 (la resolución de la unidad).
  for (const texto of ['520 m2', '520m2', '520 m²', '520 mts2', '520 M2', '520 metros cuadrados']) {
    const r = leerCantidad(texto)
    assert.equal(r.valor, 520, texto)
    assert.equal(r.unidad, 'm2', texto)
    assert.equal(r.dimension, DIMENSION.SUPERFICIE, texto)
    assert.equal(r.estado, ESTADO.EXTRAIDO, texto)
  }
})

test('«520 m2» NO se parte en «520 m» + «2» — el 2 es parte de la unidad', () => {
  // Éste es el defecto concreto que tenía el patrón anterior: `[^\s\d]*` dejaba el dígito afuera y
  // la unidad salía `m` (LONGITUD). Un cómputo de mampostería en metros lineales en vez de metros
  // cuadrados no se nota mirando el número.
  assert.equal(leerCantidad('520 m2').unidad, 'm2')
  assert.notEqual(leerCantidad('520 m2').unidad, 'm')
  assert.equal(leerCantidad('47,2 m3').unidad, 'm3')
  assert.equal(leerCantidad('47,2m³').valor, 47.2)
  assert.equal(leerCantidad('47,2m³').unidad, 'm3')
})

test('«8,5 m» CON contexto de magnitud son ocho metros y medio', () => {
  const r = leerCantidad('8,5 m', { contexto: 'MAGNITUD' })
  assert.equal(r.valor, 8.5)
  assert.equal(r.unidad, 'm')
  assert.equal(r.dimension, DIMENSION.LONGITUD)
})

test('«8,5M» y «8,5 m» SIN contexto son EL MISMO AMBIGUO: la mayúscula no decide', () => {
  // MUTACIÓN QUE LO PONE ROJO: sacar `'m'` de `COLISIONAN`.
  //
  // La tentación era leer `M` mayúscula como millones y `m` minúscula como metros. Es una regla que
  // pasa el test y falla en el chat: el dueño escribe con el teclado en mayúsculas cuando le
  // conviene, y ahí un typo se vuelve un error de seis órdenes de magnitud. La colisión se declara.
  for (const texto of ['8,5M', '8,5 m', '8,5m', '8,5 M']) {
    const r = leerCantidad(texto)
    assert.equal(r.estado, ESTADO.AMBIGUO, texto)
    assert.equal(r.valor, null, `${texto}: un AMBIGUO no publica un número, porque publicarlo ES elegir`)
    assert.deepEqual(r.lecturas.map((l) => l.valor), [8.5, 8_500_000], texto)
  }
})

test('«520 m2» NO colisiona: en cuanto la unidad tiene más que la letra sola, no hay duda', () => {
  for (const texto of ['520 m2', '520 kg', '47,2 m3', '12 hs']) {
    assert.notEqual(leerCantidad(texto).estado, ESTADO.AMBIGUO, texto)
  }
})

test('«8,5M» CON contexto monetario declarado son 8.500.000', () => {
  const r = leerCantidad('8,5M', { contexto: 'MONETARIO' })
  assert.equal(r.valor, 8_500_000)
  assert.equal(r.unidad, 'ARS')
  assert.equal(r.dimension, DIMENSION.MONEDA)
})

test('el signo $ es contexto monetario DECLARADO por quien escribió', () => {
  assert.equal(leerCantidad('$8,5M').valor, 8_500_000)
  assert.equal(leerCantidad('$ 8.500.000').valor, 8_500_000)
  assert.equal(leerCantidad('u$s 12.000').unidad, 'USD')
  assert.equal(leerCantidad('u$s 12.000').valor, 12_000)
})

test('signo de moneda CON unidad física es un ERROR, no una preferencia', () => {
  const r = leerCantidad('$520 m2')
  assert.equal(r.estado, ESTADO.ERROR)
  assert.match(r.porQue, /no se elige en silencio/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// NÚMEROS A LA ARGENTINA
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('el formato argentino: la coma decide', () => {
  assert.equal(numeroAR('8,5'), 8.5)
  assert.equal(numeroAR('8.500.000'), 8_500_000)
  assert.equal(numeroAR('1.234,56'), 1234.56)
  assert.equal(numeroAR('191,92'), 191.92)
  assert.equal(numeroAR('520'), 520)
  assert.equal(numeroAR('hola'), null)
  assert.equal(numeroAR(''), null)
  assert.equal(numeroAR(null), null)
})

test('un número solo, sin unidad y sin contexto, es AMBIGUO — no un metro', () => {
  const r = leerCantidad('520')
  assert.equal(r.estado, ESTADO.AMBIGUO)
  assert.match(r.porQue, /sin unidad/)
})

test('el texto ORIGINAL viaja siempre, aunque no se pueda leer (§7)', () => {
  assert.equal(leerCantidad('520 m2').original, '520 m2')
  assert.equal(leerCantidad('cuarenta').original, 'cuarenta')
  assert.equal(leerCantidad('8,5M').original, '8,5M')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LAS DIEZ UNIDADES DEL §7
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('las diez unidades del programa existen: m ml m² m³ kg t un l hs día', () => {
  for (const u of ['m', 'ml', 'm2', 'm3', 'kg', 't', 'un', 'l', 'hs', 'dia']) {
    assert.ok(UNIDADES[u], `falta ${u}`)
  }
})

test('LITROS y M3 NO son la misma dimensión — un tanque de 600 l no es 0,6 m³ de hormigón', () => {
  assert.equal(mismaDimension('l', 'm3'), false)
  assert.equal(convertir(600, 'l', 'm3').estado, ESTADO.ERROR)
})

test('ml y m son lo mismo; m2 y m3 no', () => {
  assert.equal(mismaDimension('ml', 'm'), true)
  assert.equal(mismaDimension('m2', 'm3'), false)
  assert.equal(mismaDimension('M3', 'm3'), true, 'la Base Maestra escribe M3 en mayúscula')
})

test('una tonelada son mil kilos y la conversión declara su fórmula', () => {
  const r = convertir(2.5, 't', 'kg')
  assert.equal(r.valor, 2500)
  assert.equal(r.estado, ESTADO.CALCULADO)
  assert.match(r.formula, /2\.5 t/)
})

test('cuántas horas tiene un DÍA no lo decide una tabla de unidades', () => {
  // MUTACIÓN QUE LO PONE ROJO: poner `factor: 8` en `dia`.
  const r = convertir(1, 'dia', 'hs')
  assert.equal(r.valor, null)
  assert.equal(r.estado, ESTADO.FALTA_DATO)
  assert.match(r.porQue, /jornada/)
})

test('pasar de USD a ARS no es una conversión de unidades: exige un tipo de cambio con fecha', () => {
  const r = convertir(100, 'USD', 'ARS')
  assert.equal(r.valor, null)
  assert.match(r.porQue, /tipo de cambio con fecha/)
})

test('una unidad que no está en el catálogo NO se adivina', () => {
  assert.equal(normalizarUnidad('bolsas'), null)
  assert.equal(normalizarUnidad('paletas'), null)
  assert.equal(convertir(1, 'bolsas', 'kg').estado, ESTADO.ERROR)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL FILTRO DURO CONTRA LA PARTIDA
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('una cantidad en m3 NO entra a una partida que se cotiza en m2', () => {
  // MUTACIÓN QUE LO PONE ROJO: en `compatibleConPartida`, devolver `{ok:true}` cuando las
  // dimensiones difieren.
  const r = compatibleConPartida({ unidad: 'm3', unidadPartida: 'M2' })
  assert.equal(r.ok, false)
  assert.equal(r.estado, ESTADO.ERROR)
  assert.match(r.porQue, /sin significado/)
})

test('cm entra a una partida en m, y el factor se declara', () => {
  const r = compatibleConPartida({ unidad: 'cm', unidadPartida: 'm' })
  assert.equal(r.ok, true)
  assert.equal(r.factor, 0.01)
})

test('sin unidad declarada la cantidad NO entra: es AMBIGUO, no un pase libre', () => {
  const r = compatibleConPartida({ unidad: null, unidadPartida: 'M3' })
  assert.equal(r.ok, false)
  assert.equal(r.estado, ESTADO.AMBIGUO)
})

test('una partida con una unidad que el catálogo no conoce se declara ERROR, no se acepta', () => {
  const r = compatibleConPartida({ unidad: 'm3', unidadPartida: 'GLB' })
  assert.equal(r.ok, false)
  assert.equal(r.estado, ESTADO.ERROR)
})
