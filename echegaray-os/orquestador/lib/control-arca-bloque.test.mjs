import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bloqueControlArca, ALTO_BLOQUE, comprasDevengado, DIR, C, DESDE, HASTA } from './control-arca-bloque.mjs'

const armar = (rubros = ['Materiales Civil']) => bloqueControlArca({ titulo: '9 · CONTROL', rubros, fila0: 50 })

test('el bloque declara su alto real — una fila de más corre las fórmulas de abajo', () => {
  assert.equal(armar().length, ALTO_BLOQUE)
})

test('NI UN SOLO IMPORTE ESCRITO: toda celda de la columna B es fórmula', () => {
  for (const fila of armar()) {
    if (fila.length < 2) continue
    assert.equal(typeof fila[1], 'string')
    assert.ok(fila[1].startsWith('='), `la celda "${fila[0]}" no es una fórmula: ${fila[1]}`)
  }
})

test('LA VENTANA ES DEVENGADA: compara por fecha de FACTURA (col C), nunca por fecha de caja (col AD)', () => {
  // Es la regla de oro nº 3. Medido contra los datos reales del 04/08, usar la fecha de caja mueve
  // junio de +$27.621.744 a +$1.276.132 y julio de −$6.008.294 a −$20.320.175.
  const f = comprasDevengado(['Materiales Civil'])
  assert.match(f, /Compras!\$C\$4:\$C/)
  assert.doesNotMatch(f, /Compras!\$AD\$4:\$AD/, 'la fecha de caja no puede entrar en un control contra ARCA')
})

test('la ventana sale de _ARCA_RAW y no está escrita a mano — se estira sola al replicar un mes', () => {
  assert.match(DESDE, /_ARCA_RAW/)
  assert.match(HASTA, /_ARCA_RAW/)
  const texto = armar().flat().join(' ')
  assert.doesNotMatch(texto, /2026-0\d\b/, 'ningún período literal en el bloque')
})

test('LAS DOS DIRECCIONES SE INFORMAN POR SEPARADO — nunca restadas', () => {
  const filas = armar()
  const a = filas.find((f) => String(f[0]).includes('ARCA registró y Compras NO tiene'))
  const b = filas.find((f) => String(f[0]).includes('ARCA NO respalda'))
  assert.ok(a && b, 'las dos líneas existen')
  assert.match(a[1], new RegExp(DIR.arcaSinCompras))
  assert.match(b[1], new RegExp(DIR.comprasSinArca))
  // Y ninguna de las dos se calcula restando la otra: son sumas independientes sobre _CRUCE_ARCA.
  assert.doesNotMatch(a[1], new RegExp(DIR.comprasSinArca))
  assert.doesNotMatch(b[1], new RegExp(DIR.arcaSinCompras))
})

test('EL VEREDICTO NO SE PONE VERDE SIN FUENTE, y exige que las DOS direcciones estén en cero', () => {
  const v = String(armar().at(-1)[0])
  assert.match(v, /NO PUEDO VERIFICAR/)
  // El ✓ tiene que estar detrás de un AND de las dos direcciones: con un OR, $10M de un lado darían
  // verde si el otro lado está limpio.
  assert.match(v, /IF\(AND\(/)
  assert.doesNotMatch(v, /IF\(OR\(/)
})

test('el veredicto de fracaso trae los DOS montos, no la diferencia neta', () => {
  const v = String(armar().at(-1)[0])
  const refs = v.match(/B5[0-9]/g) ?? []
  // B56 (ARCA sin Compras) y B57 (Compras sin ARCA) con fila0=50.
  assert.ok(refs.includes('B56') && refs.includes('B57'), `referencias encontradas: ${refs}`)
})

test('lo que legítimamente no está en ARCA va en su línea, marcada, y NO en la diferencia', () => {
  const filas = armar()
  const l = filas.find((f) => String(f[0]).includes('Fuera de ARCA por naturaleza'))
  assert.ok(l, 'la línea existe')
  assert.match(String(l[0]), /^ⓘ/, 'marcada como informativa, no como hallazgo')
  assert.match(l[1], /Jornales de obra/)
  // La diferencia agregada NO la incluye: es B(compras del universo) − B(arca).
  const dif = filas.find((f) => String(f[0]).startsWith('⇒ Diferencia agregada'))
  assert.equal(dif[1], '=ROUND(B54-B53;0)')
})

test('las fórmulas usan el separador es_AR (;) y no la coma', () => {
  for (const fila of armar()) {
    for (const celda of fila) {
      if (typeof celda !== 'string' || !celda.startsWith('=')) continue
      assert.doesNotMatch(celda, /SUMIFS\([^)]*,/, `coma como separador en: ${celda.slice(0, 80)}`)
    }
  }
})

test('un universo de varios rubros suma todos — Materiales cubre Civil y Mantenimiento', () => {
  const f = comprasDevengado(['Materiales Civil', 'Materiales Mantenimiento'])
  assert.match(f, /"Materiales Civil"/)
  assert.match(f, /"Materiales Mantenimiento"/)
  assert.equal(f.split('SUMIFS').length - 1, 2)
})

test('LAS LÍNEAS RECONSTRUYEN LA DIFERENCIA — ningún número queda sin explicar', () => {
  // El defecto que esto atrapa: mostrar "⇒ difieren en $67.838.113" y debajo dos direcciones que
  // suman otra cosa. Contra los datos del 04/08 el residuo es −$31.096.502 y tiene que estar a la
  // vista, no escondido. Con fila0=50: dif=B55, arcaSin=B56, comprasSin=B57, NC=B58, resto=B59.
  const filas = armar()
  const resto = filas.find((f) => String(f[0]).includes('IMPORTE distinto al que ARCA registró'))
  assert.ok(resto, 'la línea del residuo existe')
  assert.equal(resto[1], '=ROUND(B55-(B57-B56+B58);0)')
  const nc = filas.find((f) => String(f[0]).includes('Notas de crédito'))
  assert.ok(nc, 'las notas de crédito se declaran aparte: restan del libro, no son carga faltante')
})

test('el detalle accionable se remite a la pestaña que lo tiene, no a un texto suelto', () => {
  assert.equal(C, '_CRUCE_ARCA')
  assert.match(String(armar().at(-1)[0]), /_CRUCE_ARCA/)
})
