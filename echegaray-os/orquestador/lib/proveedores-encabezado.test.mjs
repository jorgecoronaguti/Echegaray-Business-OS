import test from 'node:test'
import assert from 'node:assert/strict'
import { grillaEncabezado, FILAS_AGING, MEDIOS, F } from './proveedores-encabezado.mjs'
import { ALERTA } from './glifos.mjs'

const G = grillaEncabezado()
const celda = (fila, col) => G[fila - 1][col]
const todas = () => G.flat().filter((c) => typeof c === 'string')

test('ni un solo importe escrito: todo lo que es plata es fórmula', () => {
  for (const [i, fila] of G.entries()) {
    for (const [j, c] of fila.entries()) {
      if (typeof c !== 'string') continue
      assert.ok(!/^-?[\d.]+,\d+$/.test(c) && !/^\$/.test(c),
        `fila ${i + 1} col ${j}: "${c}" parece un número escrito a mano`)
    }
  }
})

test('no hay columna de comentarios: el dueño los borra y volvían', () => {
  // Las columnas E (4) y las de texto largo al lado de un número están prohibidas.
  for (const [i, fila] of G.entries()) {
    const largos = fila.filter((c) => typeof c === 'string' && !c.startsWith('=') && c.length > 120)
    assert.ok(largos.length <= (i + 1 === F.bajada ? 1 : 0),
      `fila ${i + 1} tiene ${largos.length} texto(s) de prosa: ${largos[0]?.slice(0, 60)}`)
  }
})

test('el aging tiene sus seis tramos y el total los suma a todos', () => {
  assert.equal(FILAS_AGING.length, 6)
  FILAS_AGING.forEach((r, i) => assert.equal(celda(F.primerTramo + i, 0), r))
  assert.equal(celda(F.totalAging, 1), `=SUM($B${F.primerTramo}:$B${F.ultimoTramo})`)
  assert.equal(F.ultimoTramo - F.primerTramo + 1, FILAS_AGING.length,
    'el rango del total deja algún tramo afuera')
})

test('los rótulos del aging no llevan el prefijo de ordenamiento', () => {
  // "8 a 30 días" empieza con dígito y está bien; lo prohibido es el prefijo "N · " que ordena.
  for (const r of FILAS_AGING) assert.doesNotMatch(r, /^\d+\s*·/, `"${r}" muestra el número de orden`)
})

test('el comodín del SUMIF engancha el rótulo sin prefijo con el tramo con prefijo', () => {
  const f = celda(F.primerTramo, 1)
  assert.match(f, /SUMIF\(Compras!\$AN\$4:\$AN;"\*"&\$A5;Compras!\$AL\$4:\$AL\)/)
})

test('la deuda sale de Compras!AL, no de reconstruir el saldo con cuatro SUMIFS', () => {
  for (const c of todas()) {
    if (!c.startsWith('=') || !c.includes('SUMIF')) continue
    assert.ok(!c.includes('Compras!$T$4') && !c.includes('Compras!$U$4') && !c.includes('Compras!$W$4'),
      `esta fórmula reconstruye el saldo a mano en vez de leer AL: ${c.slice(0, 80)}`)
  }
})

test('ninguna fórmula usa coma como separador (locale es_AR)', () => {
  for (const c of todas()) {
    if (!c.startsWith('=')) continue
    const sinTextos = c.replace(/"[^"]*"/g, '""')
    assert.ok(!sinTextos.includes(','), `coma de separador en: ${c.slice(0, 80)}`)
  }
})

test('los paréntesis cierran en todas las fórmulas', () => {
  for (const c of todas()) {
    if (!c.startsWith('=')) continue
    assert.equal(c.split('(').length, c.split(')').length, `desbalanceada: ${c.slice(0, 80)}`)
  }
})

test('el control compara dos caminos independientes al mismo total', () => {
  const c = celda(F.control, 0)
  assert.ok(c.includes(`$B$${F.totalAging}`) && c.includes(`$G$${F.totalMedios}`),
    'el control tiene que cruzar el total del aging contra el del medio de pago')
  assert.ok(c.includes('✓') && c.includes('✗'), 'el control tiene que decir verde o rojo, no un número suelto')
})

test('el control NO se valida contra la misma información que produce', () => {
  const aging = celda(F.primerTramo, 1)
  const medio = celda(F.primerMedio, 6)
  assert.ok(aging.includes('$AN$'), 'el aging agrupa por tramo de vencimiento')
  assert.ok(medio.includes('$P$') && !medio.includes('$AN$'), 'el medio de pago agrupa por instrumento')
})

test('los cuatro medios de pago están y ninguno se solapa con otro', () => {
  assert.equal(MEDIOS.length, 4)
  const criterios = MEDIOS.flatMap((m) => m.criterios)
  assert.equal(new Set(criterios).size, criterios.length, 'un criterio repetido contaría dos veces')
})

test('el bloque declara su última fila: nadie escribe por debajo sin saberlo', () => {
  assert.equal(G.length, F.fin)
  assert.ok(F.fin < 14, `el encabezado invade la sección 1, que arranca en la fila 14 (fin=${F.fin})`)
})

test('todas las filas tienen el mismo ancho: el generador es dueño de su ancho entero', () => {
  for (const f of G) assert.equal(f.length, 8)
})

// ═══ LA DEUDA QUE EL TOTAL NO CUENTA — el defecto del 14/08 ═══
//
// Ocho facturas comerciales dicen "Pagado" con el monto pagado en cero y el paréntesis de "Monto
// Parcial 1" declarando que falta la plata entera: $11.919.063 que el titular, el aging y las dos
// dinámicas cuentan como cero, porque las cuatro cuelgan de `Compras!AL`, que arranca con
// IF(Estado="Pendiente"; …; 0). Si alguien saca esta línea, la contradicción vuelve a ser invisible.
test('EL DEFECTO · la deuda que el cuadro no muestra sale AL LADO del total, no al pie', () => {
  assert.equal(F.noMostrada, F.totalAging + 1, 'una línea despegada del total no se lee junto a él')
  const monto = celda(F.noMostrada, 1)
  const cuenta = celda(F.noMostrada, 3)
  assert.ok(monto.startsWith('=SUMPRODUCT('), 'un número pegado seguiría gritando después de corregido (regla 5)')
  // Mide lo contrario que el aging: filas cuyo ESTADO dice que ya no se deben.
  assert.ok(monto.includes('$X$4:$X<>"Pendiente"'), 'sin esto vuelve a contar lo mismo que el TOTAL')
  assert.ok(monto.includes('$AJ$4:$AJ=1'), 'la deuda no comercial vive en Impuestos y Financieros')
  assert.ok(monto.includes('$T$4:$T') && monto.includes('$U$4:$U') && monto.includes('$W$4:$W'),
    'sin los tres tramos de pago el saldo de la fila está mal')
  assert.ok(!monto.includes('*(') === false && monto.length > cuenta.length,
    'el monto pondera por el saldo; el conteo no')
})

test('el aviso se APAGA solo cuando no hay nada: un triángulo permanente deja de leerse', () => {
  const rotulo = celda(F.noMostrada, 0)
  assert.ok(rotulo.includes(`IF(ROUND($B$${F.noMostrada};0)<=0;""`), 'el glifo tiene que depender del importe')
  assert.ok(rotulo.includes(ALERTA), 'la marca es ALERTA de glifos.mjs')
  // `⚠` no se dibuja al exportar a PDF, y el PDF es con lo que el dueño verifica.
  assert.ok(!rotulo.includes('⚠'), 'el ⚠ no sale en el PDF: la marca vigente es ▲')
})

test('es-AR en las tres celdas nuevas: separador `;` y ni una coma', () => {
  for (const c of [0, 1, 3]) {
    const v = celda(F.noMostrada, c)
    assert.ok(!/,/.test(v), `la celda ${c} tiene una coma: en es-AR es un separador decimal`)
  }
})
