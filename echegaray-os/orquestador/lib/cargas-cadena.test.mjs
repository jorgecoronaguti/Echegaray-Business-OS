// LO QUE SE PRUEBA ACÁ ES QUE NINGÚN CONCEPTO SE PROYECTE POR UNA BASE QUE NO ES LA SUYA.
//
//   B13 · IERIC y FODECO se proyectaban como % DE LA MASA SALARIAL. Se pagan POR TRABAJADOR. Con la
//         base equivocada daban ~$7.000 por mes cada uno: un número que nadie puede defender.
//   FCL · se proyectaba con la alícuota media histórica. La ley 22.250 la hace depender de la
//         ANTIGÜEDAD, y la antigüedad está en la columna C del espejo desde siempre, sin consumidores.
//
// Y que lo que el OS NO PUDO VERIFICAR quede DECLARADO. Ésta es la parte que no se negocia: no hay
// acceso a la fuente oficial en esta corrida, así que las alícuotas normativas viajan como parámetro
// marcado "a verificar" y la pestaña lo dice al lado del número. Si alguien saca la marca, este
// archivo se pone rojo.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CONCEPTOS_CADENA, PARAMETROS_CARGAS, A_VERIFICAR,
  RANGO_FCL_PRIMER_ANIO, RANGO_FCL_POSTERIOR, RANGO_IERIC, RANGO_FODECO, RANGO_DIA_PAGO_F931,
  expresionAlicuotaFCL, formulaProporcionPrimerAnio, proyeccionDeConcepto,
} from './cargas-cadena.mjs'

const ref = {
  fRem: 20, fEmp: 19, reales: (f) => `$B$${f}:$G$${f}`, colMes: (m) => String.fromCharCode(65 + m),
  fRemProy: 39, fDot: 40, celdaProporcion: '$B$41',
}
const de = (rotulo) => CONCEPTOS_CADENA.find((c) => c.rotulo === rotulo)
const proy = (rotulo, filaOrigen) => proyeccionDeConcepto(de(rotulo), { ...ref, filaOrigen })

test('B13 · IERIC y FODECO se proyectan POR TRABAJADOR, no como % de la masa', () => {
  for (const r of ['IERIC', 'FODECO']) {
    assert.equal(de(r).base, 'dotacion', `${r} volvió a la base "remuneracion": daría $7.000 por mes`)
    const p = proy(r, 50)
    // Multiplica la DOTACIÓN, no la remuneración proyectada.
    assert.match(p.celda(8), new RegExp(`\\*I\\$${ref.fDot}$`), `${r} está multiplicando la masa salarial`)
    assert.doesNotMatch(p.celda(8), new RegExp(`\\$${ref.fRemProy}`))
  }
})

test('el parámetro por trabajador MANDA sobre lo medido, y en 0 se usa lo medido y se declara', () => {
  const p = proy('IERIC', 50)
  assert.match(p.alicuota, new RegExp(`IF\\(N\\(${RANGO_IERIC}\\)>0;${RANGO_IERIC};`), 'sin el IF, el dueño no puede corregir la norma sin tocar código')
  assert.match(p.origen, new RegExp(A_VERIFICAR))
  assert.match(p.origen, /por trabajador/)
})

test('FCL usa la alícuota LEGAL ponderada por antigüedad, no el promedio histórico', () => {
  assert.equal(de('FCL').base, 'antiguedad')
  const p = proy('FCL', 51)
  assert.equal(p.alicuota, `($B$41*${RANGO_FCL_PRIMER_ANIO}+(1-$B$41)*${RANGO_FCL_POSTERIOR})`)
  // Y multiplica la REMUNERACIÓN proyectada: el FCL es un % de la remuneración, no un costo por cabeza.
  assert.match(p.celda(8), new RegExp(`\\*I\\$${ref.fRemProy}$`))
  // El origen dice cuál es la ponderación REAL y que la alícuota está sin verificar.
  assert.match(p.origen, new RegExp(A_VERIFICAR))
  assert.match(p.origen, /ponderada por antigüedad/)
  // Y conserva la alícuota MEDIDA al lado: el dueño tiene que poder ver si la ley y la caja se separan.
  assert.match(p.origen, /Medido sobre lo pagado/)
})

test('la ponderación sale de la FECHA DE INGRESO del espejo, que ya estaba y nadie leía', () => {
  const f = formulaProporcionPrimerAnio('_J_OBREROS', { inicio: 495, fin: 510 })
  assert.match(f, /'_J_OBREROS'!\$C\$495:\$C\$510/)
  assert.match(f, /EDATE\(TODAY\(\);-12\)/)
  // Se divide por los NOMBRES cargados, no por el largo del rango: un bloque con filas vacías al
  // final daría una proporción diluida y una alícuota más baja que la real.
  assert.match(f, /COUNTA\('_J_OBREROS'!\$B\$495:\$B\$510\)/)
  assert.equal(formulaProporcionPrimerAnio('_J_OBREROS', null), '=""', 'sin bloque no inventa una proporción')
})

test('la fórmula de la alícuota de FCL es es-AR: una coma la parte al medio', () => {
  const e = expresionAlicuotaFCL('$B$41')
  assert.doesNotMatch(e, /,/)
})

test('LO NORMATIVO ESTÁ DECLARADO COMO NO VERIFICADO — los cinco parámetros', () => {
  // El quinto entró el 06/08: el DÍA en que el F931 sale de la caja. Es lo que fecha la serie que
  // ahora lee el Libro Canónico, y el calendario de ARCA para la seguridad social no está cableado en
  // el OS — así que viaja como parámetro medido de los pagos reales, igual que las alícuotas.
  const esperados = [RANGO_FCL_PRIMER_ANIO, RANGO_FCL_POSTERIOR, RANGO_IERIC, RANGO_FODECO, RANGO_DIA_PAGO_F931]
  assert.deepEqual(PARAMETROS_CARGAS.map((p) => p.rango), esperados)
  for (const p of PARAMETROS_CARGAS) {
    assert.ok(p.nota.startsWith(A_VERIFICAR),
      `"${p.rotulo}": la nota tiene que ABRIR con la marca de no verificado, no esconderla al final`)
    assert.ok(p.rotulo.length > 10 && p.nota.length > 120, `"${p.rotulo}": una nota corta no explica qué verificar`)
  }
  // IERIC y FODECO nacen en CERO a propósito: un valor inventado se usaría como si fuera la norma.
  assert.equal(PARAMETROS_CARGAS.find((p) => p.rango === RANGO_IERIC).valor, 0)
  assert.equal(PARAMETROS_CARGAS.find((p) => p.rango === RANGO_FODECO).valor, 0)
})

test('los seis conceptos de la DDJJ siguen casándose por CÓDIGO, no por rótulo', () => {
  const codigos = CONCEPTOS_CADENA.filter((c) => c.de === 'declarado').map((c) => c.codigo)
  assert.deepEqual(codigos, ['301', '302', '351', '352', '312', '028'])
  // ART sobre remuneración, Seguro de Vida por persona: son dos bases distintas y no se pueden cruzar.
  assert.equal(CONCEPTOS_CADENA.find((c) => c.codigo === '312').base, 'remuneracion')
  assert.equal(CONCEPTOS_CADENA.find((c) => c.codigo === '028').base, 'dotacion')
})

test('la alícuota que se muestra es la que se APLICÓ: sale por fórmula, no estampada en la corrida', () => {
  const p = proy('Aportes Seguridad Social', 12)
  assert.ok(p.origen.startsWith('='), 'el texto de origen quedó estampado: envejece con la corrida')
  assert.match(p.origen, /TEXT\(/)
  assert.match(p.celda(7), /\*H\$39$/)
})
