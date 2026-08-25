// EL CUADRO 5 ES EL ORIGEN — probado en frío, porque su defecto NO da error (24/08/2026).
//
// EL DEFECTO QUE ESTE ARCHIVO PERSIGUE. El libro leía los materiales previstos de las constantes de
// `obras-datos.mjs` (fechas de la transcripción: casi todo el 25/08). El dueño corrigió esas fechas A
// MANO en la pestaña —el grueso al 07/09/2026, tres ítems repartidos en cuotas— y el generador se las
// pisaba en la corrida siguiente. Nada fallaba: el cash flow mostraba un pico de $16,3M el 25/08 que
// él ya había dicho que no iba a ocurrir, y se leía como un número bueno.
//
// Los cuatro modos de mentir que se persiguen acá:
//
//   · LEER LA FECHA DE OTRO LADO — la celda D del cuadro es LA fecha. Si el movimiento sale con otra,
//     el calendario de caja pone plata en una semana en la que no está.
//   · REPARTIR MAL LAS CUOTAS — si la suma de las cuotas no reconstruye el total exacto, el cuadro y
//     el libro dicen dos números distintos y nadie sabe cuál es.
//   · INVENTAR LO QUE NO SE ENTIENDE — una fila sin importe o sin fecha legible NO se completa con un
//     supuesto: se omite y se nombra.
//   · CAER A LAS CONSTANTES EN SILENCIO — sin cuadro, CERO movimientos. Un fallback devolvería las
//     fechas viejas sin un solo aviso, que es exactamente el defecto de arriba otra vez.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  materialesDesdeCuadro5, movimientosDeMateriales, exigirNeteoDeMateriales, serialesDeCelda,
  repartirEnCuotas, anioDeMesSuelto, totalDeclarado, ubicarCuadro5,
} from './materiales-previstos.mjs'
import { serialDe } from './libro-extractores-fechas.mjs'
import { RUBRO_OBRAS } from './libro-extractores-obras.mjs'
import { grillaObras } from './obras-grilla.mjs'
import { OBRAS_FUTURAS } from './obras-datos.mjs'

const S = (a, m, d) => serialDe(a, m, d)
const TITULO = '5 · MATERIALES PREVISTOS — el plan, ítem por ítem (fuera del calendario de caja desde el 24/08)'
const ENCABEZADO = ['Obra — concepto', 'Familia', 'Proveedor', 'Fecha estimada', 'Previsto', 'Nota']

// LA FIXTURE COPIA LA FORMA REAL DE LA PESTAÑA leída el 24/08 con UNFORMATTED_VALUE: dos cuadros
// arriba (para que la ubicación tenga que buscar de verdad), la fecha única como SERIAL y las cuotas
// como TEXTO con « · ». Las dos últimas filas de ítem son las que el generador tiene que omitir.
const FILAS = [
  ['4 · OBRAS — COSTO PROYECTADO Y COMPRAS IMPUTADAS'],
  ['Obra', '% comprado', 'Costo proyectado'],
  ['4.1 · San Francisco — PISOS INDUSTRIALES', 0.25, 23259946],
  ['⇒ TOTAL — 7 OBRAS', 0.3, 145855278],
  [],
  [TITULO],
  ENCABEZADO,
  ['PISOS INDUSTRIALES — Gasoil', 'Combustible', 'ACA', S(2026, 8, 10), 377740],
  ['PISOS INDUSTRIALES — Nafta', 'Combustible', 'VILLA DEL PINO', '10/08 · 10/09', 977760, 'repartida por el dueño'],
  ['SALÓN COMERCIAL — Combustible (gasoil)', 'Combustible', 'ACA', '10/09 · 10/10 · 10/11 · 10/12', 269584, '4 cuotas'],
  ['PLAYÓN DE AZUFRE — Materiales', 'Materiales', 'FEMENIA', S(2026, 9, 7), 7372050],
  ['MAMPOSTERÍA — Reparto que no divide', 'Materiales', 'Bedini', '10/09 · 10/10 · 10/11', 100],
  ['ENTREPISO Y ESCALERA — Materiales', 'Materiales', 'Alumetal', S(2026, 9, 7), 'ver PDF'],
  ['MAMPOSTERÍA — Materiales sin itemizar', 'Materiales', 'sin proveedor', '', 2847439],
  ['⇒ TOTAL — 7 ÍTEMS PREVISTOS', '', '', '', 11844673],
]

/** Lo que emite la fixture, sin avisos: el material de casi todos los tests. */
const leer = (filas = FILAS) => materialesDesdeCuadro5(filas)

test('LA FECHA SALE DE LA CELDA D, no de las constantes: un serial es UNA salida por el total', () => {
  const { movimientos } = leer()
  const gasoil = movimientos.filter((m) => m.concepto === 'PISOS INDUSTRIALES · Gasoil')
  assert.equal(gasoil.length, 1, 'una fecha única no se parte en cuotas')
  assert.equal(gasoil[0].fechaSerial, S(2026, 8, 10))
  assert.equal(gasoil[0].importe, 377740)
  const femenia = movimientos.filter((m) => m.proveedor === 'FEMENIA')
  assert.equal(femenia[0].fechaSerial, S(2026, 9, 7), 'el 07/09/2026 que puso el dueño, no el 25/08 de la transcripción')
})

test('EL TEXTO MULTI-CUOTA SE PARTE: una salida por fecha, con « · cuota k/n» en el concepto', () => {
  const { movimientos } = leer()
  const nafta = movimientos.filter((m) => m.proveedor === 'VILLA DEL PINO')
  assert.deepEqual(nafta.map((m) => m.concepto), [
    'PISOS INDUSTRIALES · Nafta · cuota 1/2',
    'PISOS INDUSTRIALES · Nafta · cuota 2/2',
  ])
  assert.deepEqual(nafta.map((m) => m.fechaSerial), [S(2026, 8, 10), S(2026, 9, 10)])
  assert.deepEqual(nafta.map((m) => m.importe), [488880, 488880])

  const salon = movimientos.filter((m) => m.obra === 'SALÓN COMERCIAL')
  assert.equal(salon.length, 4)
  assert.deepEqual(salon.map((m) => m.fechaSerial),
    [S(2026, 9, 10), S(2026, 10, 10), S(2026, 11, 10), S(2026, 12, 10)])
  assert.equal(salon.at(-1).concepto, 'SALÓN COMERCIAL · Combustible (gasoil) · cuota 4/4')
})

test('LA SUMA DE LAS CUOTAS RECONSTRUYE EL TOTAL EXACTO: la última absorbe el redondeo', () => {
  const { movimientos } = leer()
  // 100 en 3 no divide: 33,33 + 33,33 + 33,34. Repartir con round en las tres daría 99,99 y el cuadro
  // y el libro publicarían dos números distintos del mismo ítem.
  const tres = movimientos.filter((m) => m.proveedor === 'Bedini')
  assert.deepEqual(tres.map((m) => m.importe), [33.33, 33.33, 33.34])
  assert.equal(tres.reduce((a, m) => a + m.importe, 0), 100)
  // Y para todo ítem repartido de la fixture, la suma por ítem cierra contra su Previsto.
  const porFila = new Map()
  for (const m of movimientos) porFila.set(m.fila, (porFila.get(m.fila) ?? 0) + m.importe)
  for (const [fila, suma] of porFila) {
    assert.equal(Math.round(suma * 100) / 100, FILAS[fila - 1][4], `fila ${fila}`)
  }
})

test('LO QUE NO SE ENTIENDE SE OMITE Y SE NOMBRA — nunca se completa con un supuesto', () => {
  const avisos = []
  const r = materialesDesdeCuadro5(FILAS, { aviso: (m) => avisos.push(m) })
  assert.equal(r.resumen.items, 5, 'cinco ítems legibles')
  assert.equal(r.resumen.movimientos, 11, '1 + 2 + 4 + 1 + 3')
  assert.equal(r.omitidas.length, 2)
  const [sinImporte, sinFecha] = r.omitidas
  assert.match(sinImporte.rotulo, /^ENTREPISO Y ESCALERA/)
  assert.match(sinImporte.motivo, /Previsto no es un número positivo/)
  assert.equal(sinImporte.previsto, null, 'sin importe legible no se sabe cuánta plata quedó afuera')
  assert.match(sinFecha.rotulo, /^MAMPOSTERÍA — Materiales sin itemizar/)
  assert.match(sinFecha.motivo, /no puedo interpretar la Fecha estimada/)
  assert.equal(sinFecha.previsto, 2847439, 'el importe sí se conoce: viaja para que el control cierre')
  // Ninguna de las dos aparece en el calendario, y las dos aparecen en el log CON su rótulo.
  assert.equal(r.movimientos.filter((m) => m.proveedor === 'Alumetal').length, 0)
  assert.equal(r.movimientos.filter((m) => m.proveedor === 'sin proveedor').length, 0)
  assert.equal(avisos.filter((a) => /ENTREPISO Y ESCALERA|Materiales sin itemizar/.test(a)).length, 2)
})

test('EL CONTROL CIERRA CONTRA EL TOTAL QUE PUBLICA LA PESTAÑA — otra fuente, no la propia lectura', () => {
  const r = leer()
  const declarado = totalDeclarado(FILAS)
  const leido = r.resumen.total + r.omitidas.reduce((a, o) => a + (o.previsto ?? 0), 0)
  assert.equal(declarado, 11844673)
  assert.equal(Math.round(leido * 100) / 100, declarado, 'lo leído + lo omitido = lo que declara el cuadro')
})

test('SIN CUADRO NO HAY FALLBACK: cero movimientos y un aviso que lo dice', () => {
  for (const [caso, filas] of [
    ['la pestaña no se pudo leer', []],
    ['el título no está', [['3 · OBRAS'], ENCABEZADO, ['X — Y', '', 'P', 46272, 100]]],
    ['el encabezado cambió', [[TITULO], ['Otra cosa'], ['X — Y', '', 'P', 46272, 100]]],
  ]) {
    const avisos = []
    const r = materialesDesdeCuadro5(filas, { aviso: (m) => avisos.push(m) })
    assert.equal(r.movimientos.length, 0, caso)
    assert.equal(r.resumen.total, 0, caso)
    assert.equal(avisos.length, 1, caso)
    assert.match(avisos[0], /NO caigo a obras-datos/, caso)
  }
  assert.equal(ubicarCuadro5([]), null)
})

test('EL AÑO DE UN «dd/mm» ES UNA CONVENCIÓN DECLARADA: mes ≥ 7 ⇒ 2026, mes < 7 ⇒ 2027', () => {
  assert.equal(anioDeMesSuelto(7), 2026)
  assert.equal(anioDeMesSuelto(12), 2026)
  assert.equal(anioDeMesSuelto(6), 2027)
  assert.equal(anioDeMesSuelto(1), 2027)
  assert.deepEqual(serialesDeCelda('10/12'), [S(2026, 12, 10)])
  assert.deepEqual(serialesDeCelda('10/03'), [S(2027, 3, 10)], 'marzo es del año que viene, no del pasado')
  // Un año escrito a mano gana sobre la convención: el dato le gana a la inferencia, siempre.
  assert.deepEqual(serialesDeCelda('10/03/2026'), [S(2026, 3, 10)])
  assert.deepEqual(serialesDeCelda('10/03/26'), [S(2026, 3, 10)])
})

test('SERIALES Y CUOTAS: lo que no es fecha devuelve null, no una fecha inventada', () => {
  assert.deepEqual(serialesDeCelda(46272), [46272])
  assert.deepEqual(serialesDeCelda(46272.4), [46272], 'un serial con hora se trunca al día')
  assert.equal(serialesDeCelda('sin fecha'), null)
  assert.equal(serialesDeCelda(''), null)
  assert.equal(serialesDeCelda(null), null)
  assert.equal(serialesDeCelda(0), null)
  assert.equal(serialesDeCelda('10/09 · mañana'), null, 'una cuota ilegible invalida la fila entera')
  assert.equal(serialesDeCelda('32/09'), null)
  assert.equal(serialesDeCelda('10/13'), null)
  assert.deepEqual(repartirEnCuotas(100, 3), [33.33, 33.33, 33.34])
  assert.deepEqual(repartirEnCuotas(977760, 2), [488880, 488880])
  assert.deepEqual(repartirEnCuotas(100, 1), [100])
  assert.deepEqual(repartirEnCuotas(100, 0), [])
})

// ═══ DE LOS PUNTOS DEL CUADRO A LOS MOVIMIENTOS DEL LIBRO ═══

const COLS = { proveedor: 'F', cliente: 'D', fecha: 'C', total: 'O', pagado: 'T' }
const CONTEXTO = new Map([
  ['PISOS INDUSTRIALES', { clave: 'sf-pisos', cliente: 'San Francisco', inicioSerial: S(2026, 8, 5) }],
  ['SALÓN COMERCIAL', { clave: 'q-salon', cliente: 'Quattropani', inicioSerial: S(2026, 8, 18) }],
  ['PLAYÓN DE AZUFRE', { clave: 'm-playon', cliente: 'MESSINA', inicioSerial: S(2026, 8, 24) }],
  ['MAMPOSTERÍA', { clave: 'sf-mamp', cliente: 'San Francisco', inicioSerial: S(2026, 8, 7) }],
])
const CORTE = S(2026, 8, 24)

test('TODO MOVIMIENTO ES PROYECTADO, −1 y del rubro que las fórmulas de _CAJA_ANEXO filtran', () => {
  const { movimientos } = movimientosDeMateriales(leer().movimientos,
    { contexto: CONTEXTO, colsCompras: COLS, corte: CORTE })
  assert.equal(movimientos.length, 11)
  for (const m of movimientos) {
    assert.equal(m.rubro, RUBRO_OBRAS, 'el rubro NO cambia: las fórmulas del anexo filtran por él')
    assert.equal(m.estado, 'PROYECTADO')
    assert.equal(m.signo, -1)
    assert.ok(m.importe > 0, 'el importe es magnitud, el signo va aparte')
  }
  // El concepto llega TAL CUAL lo definió el parser: es lo que el dueño lee en la pestaña.
  assert.ok(movimientos.some((m) => m.concepto === 'PISOS INDUSTRIALES · Gasoil'))
  assert.ok(movimientos.some((m) => m.concepto === 'SALÓN COMERCIAL · Combustible (gasoil) · cuota 2/4'))
})

test('LA FECHA VENCIDA SE CORRE A corte+1, y la futura del dueño se respeta tal cual', () => {
  const { movimientos } = movimientosDeMateriales(leer().movimientos,
    { contexto: CONTEXTO, colsCompras: COLS, corte: CORTE })
  const gasoil = movimientos.find((m) => m.concepto === 'PISOS INDUSTRIALES · Gasoil')
  assert.equal(gasoil.fecha, CORTE + 1, 'el 10/08 ya pasó: no es historia, es plata que sale ya')
  const femenia = movimientos.find((m) => m.contraparte === 'FEMENIA')
  assert.equal(femenia.fecha, S(2026, 9, 7), 'el 07/09 del dueño llega intacto al libro')
  assert.equal(movimientos.filter((m) => m.fecha === S(2026, 9, 7)).length, 1)
})

test('EL IMPORTE ES VIVO: neteo secuencial contra Compras, nunca un número pegado', () => {
  const { movimientos } = movimientosDeMateriales(leer().movimientos,
    { contexto: CONTEXTO, colsCompras: COLS, corte: CORTE })
  const uno = movimientos.find((m) => m.concepto === 'PISOS INDUSTRIALES · Gasoil')
  assert.match(uno.importeVivo, /^=MAX\(0;377740-SUMPRODUCT\(/)
  const salon = movimientos.filter((m) => m.obra === 'SALÓN COMERCIAL')
  // El acumulado planificado crece cuota a cuota: el real absorbe EN ORDEN y jamás se resta dos veces.
  assert.match(salon[0].importeVivo, /=MAX\(0;67396-MAX\(0;SUMPRODUCT/)
  assert.match(salon[3].importeVivo, /=MAX\(0;269584-MAX\(202188;SUMPRODUCT/)
  // Y el SUMPRODUCT usa el cliente y el inicio de la FICHA de la obra, que el cuadro 5 no publica.
  assert.match(salon[0].importeVivo, /"Quattropani"/)
  assert.match(salon[0].importeVivo, new RegExp(`>=${S(2026, 8, 18)}`))
})

test('SIN FICHA DE OBRA NO SE PUBLICA: quien escribe ABORTA, y el mensaje nombra obra y proveedor', () => {
  const avisos = []
  const r = movimientosDeMateriales(leer().movimientos,
    { contexto: new Map(), colsCompras: COLS, corte: CORTE, aviso: (m) => avisos.push(m) })
  // La función pura calcula igual —el llamador puede querer medirlos— pero ninguno lleva fórmula.
  assert.equal(r.resumen.sinNeteo, 11)
  for (const m of r.movimientos) assert.equal(m.importeVivo, undefined)
  assert.ok(avisos.some((a) => /PISOS INDUSTRIALES/.test(a)))
  // Y la puerta de publicación no los deja pasar: un egreso pegado se cuenta dos veces en cuanto su
  // factura entra a Compras, y eso es peor que una corrida caída.
  assert.throws(() => exigirNeteoDeMateriales(r), (e) => {
    assert.match(e.message, /PISOS INDUSTRIALES · ACA/, 'el mensaje no nombra la obra y el proveedor')
    assert.match(e.message, /no figura en la ficha de obras/, 'ni dice qué hay que arreglar')
    assert.match(e.message, /no escribo el libro/)
    return true
  })
  // Con la ficha completa pasa sin chistar y devuelve los movimientos.
  const ok = movimientosDeMateriales(leer().movimientos, { contexto: CONTEXTO, colsCompras: COLS, corte: CORTE })
  assert.equal(exigirNeteoDeMateriales(ok).length, 11)
})

test('CADA CUOTA LLEVA SU PROPIA CLAVE DE ORIGEN: sin eso `deduplicar` colapsaría las cuotas', () => {
  const { movimientos } = movimientosDeMateriales(leer().movimientos,
    { contexto: CONTEXTO, colsCompras: COLS, corte: CORTE })
  const claves = movimientos.map((m) => `${m.origen.pestana}:${m.origen.fila}`)
  assert.equal(new Set(claves).size, claves.length, 'once movimientos, once claves distintas')
})

// ═══ EL CONTRATO CON QUIEN ESCRIBE EL CUADRO ═══

test('LA GRILLA QUE ESCRIBE LA PESTAÑA SE PARSEA CON ESTE MISMO LECTOR — el ida y vuelta cierra', () => {
  // Si `obras-grilla.mjs` renombra el título, cambia el encabezado o mueve la columna de la fecha, el
  // lector deja de encontrar el cuadro y el libro sale con CERO materiales. Nada de eso da error: este
  // test es el único lugar donde escritor y lector se miran a la cara.
  const g = grillaObras({ obras: OBRAS_FUTURAS })
  const r = materialesDesdeCuadro5(g.filas)
  assert.ok(r.resumen.items > 0, 'el lector encuentra el cuadro que el escritor acaba de escribir')
  assert.equal(r.omitidas.length, 0, 'ninguna fila escrita por el generador resulta ilegible')
  const declarado = g.filas.find((f) => String(f[0] ?? '').startsWith('⇒ TOTAL —') && String(f[0]).includes('ÍTEMS'))
  assert.ok(declarado, 'la fila de cierre existe')
  // El total del generador es una fórmula SUM(): lo que se compara es el conteo de ítems, que sí es texto.
  assert.match(String(declarado[0]), new RegExp(`${r.resumen.items} ÍTEMS PREVISTOS`))
})

test('EL LIBRO YA NO ARMA SUS MATERIALES CON LAS CONSTANTES — el cableado también es el defecto', () => {
  // El defecto no vivía en una función: vivía en QUÉ FUENTE llamaba el generador. Un test de la lib no
  // se pone rojo si alguien vuelve a enchufar `deObras(OBRAS_FUTURAS…)`, y ese cableado no se puede
  // probar sin red. Por eso se mira el archivo: es feo, y es lo único que se pone rojo si vuelve.
  const src = readFileSync(new URL('../scripts/libro-movimientos-pestana.mjs', import.meta.url), 'utf8')
  assert.ok(src.includes('materialesDesdeCuadro5('), 'el libro lee el cuadro 5 de la pestaña')
  assert.ok(!/\bdeObras\(/.test(src), 'y NO vuelve a construir los egresos desde las constantes')
  assert.ok(src.includes("process.env.ORQ_LIBRO_SIN_OBRAS === '1'"), 'la llave del dueño sigue en pie')
  // Y NO HAY FALLBACK: si la pestaña no se lee, la fuente sale en cero. Un `?? OBRAS_FUTURAS` acá
  // republicaría en silencio las fechas viejas, que es el defecto entero otra vez.
  assert.match(src, /NO PUDE LEER LA PESTAÑA/, 'la lectura fallida tiene que gritar')
  assert.ok(!/materialesDesdeCuadro5\([^)]*\)\s*\?\?/.test(src), 'apareció un fallback sobre la lectura del cuadro')
})
