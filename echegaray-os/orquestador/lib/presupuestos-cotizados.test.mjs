import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PRESUPUESTOS, OBRAS_ACTIVAS, DOCUMENTOS, MOTIVO_BSA, CORRECCION_CONTRATO,
  problemasDe, problemasDelConjunto, filaDe,
} from './presupuestos-cotizados.mjs'

const de = (obra, version = 1) => PRESUPUESTOS.find((x) => x.obra === obra && x.version === version)
const clon = (x) => structuredClone(x)

test('el conjunto entero es cargable: sin problemas', () => {
  assert.deepEqual(problemasDelConjunto(), [])
})

test('las 10 obras activas tienen exactamente un presupuesto aprobado', () => {
  assert.equal(OBRAS_ACTIVAS.length, 10)
  for (const obra of OBRAS_ACTIVAS) {
    assert.equal(PRESUPUESTOS.filter((x) => x.obra === obra && x.estado === 'aprobado').length, 1, obra)
  }
})

test('costo directo por obra: los números de la tabla verificada contra las .xlsm', () => {
  const esperado = {
    quattropani: 39592912.25, 'le-comedor': 81963999.15, 'messina-bsa': null,
    'messina-playon-azufre': 49916328.35, 'messina-playon-dilucion-acido': 8926448.57,
    'messina-pisos-120-rampa': 4649300.16, 'messina-adicional-tercer-muro': 5183571.40,
    'instalacion-electrica': 24573563.58, 'pisos-industriales': 32406752.00, 'entrepiso-y-escalera': 3829741.63,
  }
  for (const [obra, costo] of Object.entries(esperado)) {
    const aprobado = PRESUPUESTOS.find((x) => x.obra === obra && x.estado === 'aprobado')
    assert.equal(aprobado.costoDirecto, costo, obra)
  }
})

test('messina-bsa: venta vigente de la recotización, costo NULL con el motivo, 2024 reemplazado', () => {
  const v2 = de('messina-bsa', 2)
  assert.equal(v2.estado, 'aprobado')
  assert.equal(v2.venta, 17704199.40)
  assert.equal(Math.round((2 * 4073021.70 + 3583956 + 5974200) * 100) / 100, v2.venta)
  assert.equal(v2.costoDirecto, null)
  assert.equal(v2.costoPendienteMotivo, MOTIVO_BSA)
  assert.match(v2.fuente, /1XBHeCpC9pH4oxcqC6BPjrR5J83iY8kYo/)
  assert.match(v2.fuente, /16jl2ZbV8ZtMSeyxauVukDp62nbsvJXlb/)
  assert.equal(de('messina-bsa', 1).estado, 'reemplazado')
})

test('le-comedor: adicional vendido de Cobranzas fila 36 y la diferencia de 900.000 queda pendiente', () => {
  const x = de('le-comedor')
  assert.equal(x.venta, Math.round((120438881.80 + 17476079.99) * 100) / 100)
  assert.match(x.fuente, /Cobranzas fila 36/)
  assert.match(x.notas, /PENDIENTE DE EXPLICACIÓN/)
  assert.match(x.notas, /900\.000/)
  assert.match(x.notas, /246\.149\.261/)
})

test('el adicional de dilución de ácido está cotizado, no aprobado', () => {
  const x = de('messina-playon-dilucion-acido', 2)
  assert.equal(x.estado, 'cotizado')
})

test('quattropani: USD 63.000 con el tipo de cambio del archivo, marcado', () => {
  const x = de('quattropani')
  assert.equal(x.moneda.original, 'USD')
  assert.equal(x.moneda.monto, 63000)
  assert.equal(x.moneda.tipoCambio, 1467.5)
  assert.match(x.moneda.origen, /tipo de cambio del archivo/)
  assert.match(x.fuente, /INFERENCIA/)
})

test('pisos 120: marcado INFERENCIA y con la rampa citando obras-datos.mjs', () => {
  const x = de('messina-pisos-120-rampa')
  assert.match(x.fuente, /^INFERENCIA/)
  assert.match(x.fuente, /obras-datos\.mjs/)
  assert.equal(x.partidas.filter((q) => q.codigo.startsWith('RAMPA')).reduce((s, q) => s + q.monto, 0), 1426156)
})

// ── mutaciones: el control tiene que poder dar rojo ─────────────────────────────────────────────
test('mutación: una partida alterada rompe la suma contra el costo directo', () => {
  const x = clon(de('instalacion-electrica'))
  x.partidas[0].monto += 1
  assert.ok(problemasDe(x).some((m) => /partidas .* ≠ costo directo/.test(m)))
})

test('mutación: costo NULL sin motivo es rechazado', () => {
  const x = clon(de('messina-bsa', 2))
  x.costoPendienteMotivo = '  '
  assert.ok(problemasDe(x).some((m) => /sin motivo/.test(m)))
})

test('mutación: fuente sin drive id o sin celda es rechazada', () => {
  const a = clon(de('pisos-industriales'))
  a.fuente = 'Presupuesto!H63'
  assert.ok(problemasDe(a).some((m) => /drive id/.test(m)))
  const b = clon(de('pisos-industriales'))
  b.fuente = 'archivo drive 1iKAAbLs6vdk9jnzgRYS4Bo16g-1wrgdF sin celda'
  assert.ok(problemasDe(b).some((m) => /hoja!celda/.test(m)))
})

test('mutación: inferencia sin la palabra INFERENCIA es rechazada', () => {
  const x = clon(de('quattropani'))
  x.fuente = x.fuente.replaceAll('INFERENCIA', 'cálculo')
  assert.ok(problemasDe(x).some((m) => /inferencia sin marcar/.test(m)))
})

test('mutación: dos aprobados en una obra rompen el conjunto', () => {
  const lista = clon(PRESUPUESTOS)
  lista.find((x) => x.obra === 'messina-bsa' && x.version === 1).estado = 'aprobado'
  assert.ok(problemasDelConjunto(lista).some((m) => /messina-bsa: 2 presupuestos aprobados/.test(m)))
})

test('mutación: venta ARS que no es USD × tipo de cambio es rechazada', () => {
  const x = clon(de('quattropani'))
  x.moneda.tipoCambio = 1510
  assert.ok(problemasDe(x).some((m) => /tipo de cambio/.test(m)))
})

test('filaDe mapea a las columnas de la base, con NULL explícito donde no hay dato', () => {
  const f = filaDe(de('messina-bsa', 2))
  assert.equal(f.obra_canonica_id, 'messina-bsa')
  assert.equal(f.costo_directo_presupuestado, null)
  assert.equal(f.costo_indirecto_presupuestado, null)
  assert.equal(f.margen_esperado, null)
  assert.equal(f.costo_pendiente_motivo, MOTIVO_BSA)
  assert.equal(filaDe(de('quattropani')).monto_moneda_original, 63000)
})

test('documentos: una fila por (obra, drive id), sólo obras activas, y cada .xlsm cargada está catalogada', () => {
  const claves = DOCUMENTOS.map((x) => `${x.obra}#${x.drive}`)
  assert.equal(new Set(claves).size, claves.length)
  for (const x of DOCUMENTOS) assert.ok(OBRAS_ACTIVAS.includes(x.obra), x.obra)
  for (const pres of PRESUPUESTOS.filter((x) => x.costoDirecto != null && !x.obra.includes('pisos-120'))) {
    const xlsm = pres.fuente.match(/drive (1[A-Za-z0-9_-]{24,})/)[1]
    assert.ok(DOCUMENTOS.some((x) => x.drive === xlsm && x.obra === pres.obra), `${pres.obra} v${pres.version}: ${xlsm}`)
  }
})

test('corrección de obra_contrato: los ids difieren sólo en el último carácter', () => {
  assert.equal(CORRECCION_CONTRATO.idRoto.slice(0, -1), CORRECCION_CONTRATO.idReal.slice(0, -1))
  assert.notEqual(CORRECCION_CONTRATO.idRoto, CORRECCION_CONTRATO.idReal)
})
