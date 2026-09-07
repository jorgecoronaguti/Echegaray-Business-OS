import test from 'node:test'
import assert from 'node:assert/strict'

import {
  ubicarCuadroCosto, costosDeCuadro, partirRotulo, filaEsDeObra,
  egresosDesdeSheet, compararConLoGuardado, ROTULO_OBRA, ROTULO_COSTO_PROYECTADO,
} from './obras-egresos-proyectados.mjs'
// LOS FIXTURES SE CONSTRUYEN CON LA FUNCIÓN DE PRODUCCIÓN, NO A MANO. Un ítem fabricado a mano puede
// tener una forma que el generador nunca produce, y entonces el test pasa sobre algo que no existe —
// es el defecto que dejó «0 supuestos ocultos» como constante en este mismo repo.
import { itemsSemilla } from './obras-grilla.mjs'
import { OBRAS_FUTURAS, totalEgresos } from './obras-datos.mjs'

const LEIDO = '2026-09-05T12:00:00.000Z'

/** Los ítems del cuadro 5 con el número de fila que tendrían en la pestaña. */
const itemsConFila = (obras, base = 45) =>
  itemsSemilla(obras).map((i, k) => ({
    fila: base + k, rotulo: i.rotulo, familia: i.familia, proveedor: i.proveedor,
    fecha: i.fecha, previsto: i.previsto, nota: i.nota,
  }))

/** Las filas del cuadro de costo tal como las escribe el generador, con su rótulo largo. */
const costosConFila = (obras, base = 33) => obras.map((o, k) => ({
  fila: base + k,
  rotulo: `4.${k + 1} · ${o.cliente} — ${o.obra} · 05/08 → 30/09`,
  proyectado: totalEgresos(o),
}))

/** Una pestaña mínima con el cuadro de costo adentro, para probar la ubicación. */
const pestanaConCuadroCosto = (numeroDeSeccion) => ([
  ['1 · CARTERA'], [],
  [`${numeroDeSeccion} · OBRAS — COSTO PROYECTADO Y COMPRAS IMPUTADAS`],
  [ROTULO_OBRA, '% comprado', ROTULO_COSTO_PROYECTADO, 'Comprado (real)', 'Resta proyectado', 'Imputado por'],
  ['4.1 · San Francisco — PISOS INDUSTRIALES · 05/08 → 30/09', 0, 23259946, 0, 0, ''],
  ['4.2 · MESSINA — BSA · 29/07 → 21/08', 0, 2108281, 0, 0, ''],
  ['⇒ TOTAL — 2 OBRAS'],
])

test('el cuadro se ubica por su ENCABEZADO y no por el número de sección', () => {
  const a = ubicarCuadroCosto(pestanaConCuadroCosto(4))
  const b = ubicarCuadroCosto(pestanaConCuadroCosto(7))
  assert.deepEqual(a, b, 'renumerar la sección no puede mover el cuadro')
  assert.equal(costosDeCuadro(pestanaConCuadroCosto(7)).length, 2)
  assert.equal(costosDeCuadro(pestanaConCuadroCosto(7))[0].proyectado, 23259946)
  assert.equal(costosDeCuadro(pestanaConCuadroCosto(7))[0].fila, 5)
})

test('sin encabezado no hay cuadro: no se inventa una ubicación', () => {
  assert.equal(ubicarCuadroCosto([['nada'], ['tampoco']]), null)
  assert.deepEqual(costosDeCuadro([['nada']]), [])
})

test('partirRotulo corta en el PRIMER separador', () => {
  assert.deepEqual(partirRotulo('PISOS INDUSTRIALES — Gasoil'), { obra: 'PISOS INDUSTRIALES', concepto: 'Gasoil' })
  assert.deepEqual(partirRotulo('PLAYÓN DE AZUFRE — Materiales — Hierro'),
    { obra: 'PLAYÓN DE AZUFRE', concepto: 'Materiales — Hierro' })
})

test('el archivo vivo entero traduce a 24 filas sin un solo hallazgo', () => {
  const { filas, hallazgos } = egresosDesdeSheet({
    items: itemsConFila(OBRAS_FUTURAS), costos: costosConFila(OBRAS_FUTURAS),
    obras: OBRAS_FUTURAS, leidoEn: LEIDO,
  })
  assert.deepEqual(hallazgos, [])
  const materiales = filas.filter((f) => f.tipo === 'material')
  const mo = filas.filter((f) => f.tipo === 'mano_de_obra')
  // LOS CONTEOS SE DERIVAN DEL ARCHIVO, NO SE CLAVAN (07/09/2026). Decía «17 ítems» y «7 obras»: el
  // día que Dilución y Tercer Muro recibieron su costo desde la planilla de cotización, el test se
  // puso rojo sin que ninguna regla se hubiera roto. Lo que este test prueba es la IDENTIDAD —cada
  // ítem del cuadro 5 es una fila de material y cada obra con costo es una fila de mano de obra—, y
  // eso se afirma contra la fuente, cualquiera sea su tamaño.
  const conCosto = OBRAS_FUTURAS.filter((o) => !o.sinCosto)
  assert.ok(conCosto.length >= 7, 'la fuente perdió obras con costo: eso sí hay que mirarlo')
  assert.equal(materiales.length, itemsSemilla(OBRAS_FUTURAS).length, 'una fila de material por ítem del cuadro 5')
  assert.equal(mo.length, conCosto.length, 'una fila de mano de obra por obra con costo')
  // La suma por obra RECONSTRUYE el costo proyectado que publica el Sheet: es la identidad que hace
  // que la celda pueda pasar a ser un SUMIFS.
  for (const o of OBRAS_FUTURAS) {
    const suma = filas.filter((f) => f.obra_rotulo === o.obra).reduce((s, f) => s + f.monto, 0)
    assert.equal(Math.round(suma), totalEgresos(o), `${o.obra}`)
  }
  // Toda fila de material declara de qué celda salió: el CHECK de la tabla lo exige.
  assert.ok(materiales.every((f) => /^E\d+$/.test(f.origen_celda)))
  assert.ok(mo.every((f) => f.origen_celda === null))
  assert.ok(filas.every((f) => f.origen_leido_en === LEIDO))
})

test('los tres «PLAYÓN DE AZUFRE — Materiales» NO colapsan: la clave lleva el proveedor', () => {
  const { filas } = egresosDesdeSheet({
    items: itemsConFila(OBRAS_FUTURAS), costos: costosConFila(OBRAS_FUTURAS),
    obras: OBRAS_FUTURAS, leidoEn: LEIDO,
  })
  const mismos = filas.filter((f) => f.obra_rotulo === 'PLAYÓN DE AZUFRE' && f.concepto === 'Materiales')
  assert.equal(mismos.length, 3)
  assert.equal(new Set(mismos.map((f) => f.clave)).size, 3, 'tres claves distintas, una por proveedor')
})

test('MUTACIÓN — si el Previsto de una celda cambia, la mano de obra deducida deja de cerrar y se GRITA', () => {
  const items = itemsConFila(OBRAS_FUTURAS)
  items[0].previsto += 1000 // alguien tocó OBRAS!E45
  const { filas, hallazgos } = egresosDesdeSheet({
    items, costos: costosConFila(OBRAS_FUTURAS), obras: OBRAS_FUTURAS, leidoEn: LEIDO,
  })
  assert.equal(hallazgos.length, 1)
  assert.match(hallazgos[0], /mano de obra deducida/)
  assert.ok(!filas.some((f) => f.obra_rotulo === 'PISOS INDUSTRIALES' && f.tipo === 'mano_de_obra'),
    'la obra que no cierra no aporta fila de mano de obra')
})

test('MUTACIÓN — un Previsto que no es número no se adivina: se nombra su celda', () => {
  const items = itemsConFila(OBRAS_FUTURAS)
  items[1].previsto = ''
  const { hallazgos } = egresosDesdeSheet({
    items, costos: costosConFila(OBRAS_FUTURAS), obras: OBRAS_FUTURAS, leidoEn: LEIDO,
  })
  assert.ok(hallazgos.some((h) => h.startsWith('OBRAS!E46')), hallazgos.join(' | '))
})

test('MUTACIÓN — si el cuadro de costo se reordena, NO se carga el costo de otra obra', () => {
  const costos = costosConFila(OBRAS_FUTURAS)
  const [a, b] = [costos[0], costos[1]]
  costos[0] = { ...b, fila: a.fila }
  costos[1] = { ...a, fila: b.fila }
  const { hallazgos } = egresosDesdeSheet({
    items: itemsConFila(OBRAS_FUTURAS), costos, obras: OBRAS_FUTURAS, leidoEn: LEIDO,
  })
  assert.equal(hallazgos.length, 2)
  assert.ok(hallazgos.every((h) => /esperaba la obra/.test(h)), hallazgos.join(' | '))
})

test('MUTACIÓN — si el Sheet y obras-datos.mjs no dicen lo mismo, no se carga nada de esa obra', () => {
  const costos = costosConFila(OBRAS_FUTURAS)
  costos[2].proyectado += 5000
  const { filas, hallazgos } = egresosDesdeSheet({
    items: itemsConFila(OBRAS_FUTURAS), costos, obras: OBRAS_FUTURAS, leidoEn: LEIDO,
  })
  assert.equal(hallazgos.length, 1)
  assert.match(hallazgos[0], /el Sheet dice .* y obras-datos\.mjs/)
  // Cae exactamente UNA obra: la mutada. Las demás con costo siguen entrando.
  const conCosto = OBRAS_FUTURAS.filter((o) => !o.sinCosto).length
  assert.equal(filas.filter((f) => f.tipo === 'mano_de_obra').length, conCosto - 1)
})

test('filaEsDeObra exige que el rótulo NOMBRE la obra', () => {
  assert.ok(filaEsDeObra('4.1 · San Francisco — PISOS INDUSTRIALES · 05/08', 'PISOS INDUSTRIALES'))
  assert.ok(!filaEsDeObra('4.1 · San Francisco — MAMPOSTERÍA · 05/08', 'PISOS INDUSTRIALES'))
})

test('la comparación contra la base PUEDE dar rojo: monto, falta y sobra', () => {
  const esperadas = [
    { clave: 'A‖X', obra_rotulo: 'O', obra_clave: 'o', tipo: 'material', concepto: 'c', familia: null, proveedor: 'X', fecha_estimada: '2026-10-01', fecha_texto: null, nota: null, origen_pestana: 'OBRAS', origen_celda: 'E45', origen_fuente: 'f', monto: 377740 },
    { clave: 'B‖X', obra_rotulo: 'O', obra_clave: 'o', tipo: 'material', concepto: 'd', familia: null, proveedor: 'X', fecha_estimada: null, fecha_texto: null, nota: null, origen_pestana: 'OBRAS', origen_celda: 'E46', origen_fuente: 'f', monto: 100 },
  ]
  // El caso que NO debe dar falso positivo: `numeric` vuelve de Postgres como string.
  const iguales = esperadas.map((e) => ({ ...e, monto: `${e.monto}.00` }))
  assert.deepEqual(compararConLoGuardado(esperadas, iguales), [])

  const conMonto = iguales.map((g, i) => (i === 0 ? { ...g, monto: '377741.00' } : g))
  assert.equal(compararConLoGuardado(esperadas, conMonto).length, 1)
  assert.match(compararConLoGuardado(esperadas, conMonto)[0], /monto/)

  assert.match(compararConLoGuardado(esperadas, [iguales[0]])[0], /^falta en la base: B‖X$/)
  assert.match(compararConLoGuardado([esperadas[0]], iguales)[0], /^sobra en la base: B‖X$/)

  const conCelda = iguales.map((g, i) => (i === 0 ? { ...g, origen_celda: 'E99' } : g))
  assert.match(compararConLoGuardado(esperadas, conCelda)[0], /origen_celda/)
})
