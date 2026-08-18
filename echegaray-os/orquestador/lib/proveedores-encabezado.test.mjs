import test from 'node:test'
import assert from 'node:assert/strict'
import { grillaEncabezado, celdasEncabezado, encabezadoSinFormato, FILAS_AGING, MEDIOS, F } from './proveedores-encabezado.mjs'
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


// ═══ LO PAGADO NO PUEDE VOLVER A APARECER COMO DEUDA (18/08/2026) ═══
//
// Acá vivían tres tests que DEFENDÍAN la fila «Dicen "Pagado" y falta plata»: exigían que estuviera
// pegada al TOTAL, que su glifo se encendiera con el importe y que sus tres celdas fueran es-AR.
// Defendían un defecto. Esos $11.919.063 no se deben: son 8 facturas donde el dueño tipeó "Pagado"
// encima de la fórmula del Estado, y lo que "los contradecía" eran dos celdas DERIVADAS de esa misma
// fila (`Monto Pagado` es `=IF(F="pago";O;0)` y `Monto Parcial 1` es `=T-O`). El dueño lo reclamó
// tres veces: *"en la pestaña compras se paga y cambia a estado pagado y lo continua mostrando como
// q se adeuda"*.
//
// Un test que exige la existencia de una celda es la forma más eficaz de que esa celda vuelva. Éste
// exige lo contrario, y por eso reemplaza a los tres.
test('ninguna celda del encabezado publica plata de facturas que NO están Pendientes', () => {
  for (const [i, fila] of celdasEncabezado().entries()) {
    for (const [j, c] of fila.entries()) {
      const v = String(c?.v ?? '')
      assert.ok(!v.includes('$X$4:$X<>"Pendiente"'),
        `fila ${i + 1} col ${j}: suma filas cuyo estado NO dice Pendiente — eso es plata ya pagada`)
      assert.ok(!/falta plata|Dicen ""?Pagado/.test(v),
        `fila ${i + 1} col ${j}: vuelve a presentar lo pagado como deuda`)
    }
  }
})

test('el control de cuadratura quedó pegado al total, sin una fila muerta en el medio', () => {
  assert.equal(F.control, F.totalAging + 1, 'al sacar la fila de la contradicción el control sube una')
  assert.equal(F.fin, F.control, 'el bloque termina en el control: ni una fila más')
})

// ═══ TODA CELDA QUE ESCRIBE UN NÚMERO DECLARA SU ESPECIE (14/08/2026) ═══
//
// EL DEFECTO QUE ESTOS TRES TESTS ATRAPAN. `Proveedores!B12` publicaba `11919062,68` —coma decimal,
// sin miles, sin símbolo— al lado de columnas que muestran "$15.097.040". La celda existía desde el
// mismo día, la fórmula estaba bien y el número era correcto: lo que faltaba era el FORMATO, porque
// el aplicador lo daba por una lista de rangos escrita a mano en otro archivo y `F.noMostrada` no
// estaba en esa lista. Sin formato propio hereda el reset base, que es TEXTO, y un número con
// formato de texto se dibuja crudo.
//
// El primero prueba el caso concreto; el segundo, la clase entera: cualquier fila futura que sume o
// cuente sin declarar especie pone la suite en rojo el día que se escribe, no seis semanas después.
test('ninguna fórmula que suma o cuenta quedó sin especie declarada', () => {
  assert.deepEqual(encabezadoSinFormato(), [],
    'esa celda escribe un número y no dice de qué especie: se va a dibujar con el formato de ayer')
})

test('grillaEncabezado es la proyección de celdasEncabezado: una sola fuente', () => {
  const C = celdasEncabezado()
  const G2 = grillaEncabezado()
  assert.equal(G2.length, C.length)
  for (const [i, fila] of C.entries()) {
    for (const [j, c] of fila.entries()) {
      assert.equal(G2[i][j], c === null ? null : c.v, `fila ${i + 1} col ${j}: las dos vistas discrepan`)
    }
  }
})

// ═══ UNA CELDA QUE PROMETE PLATA NO PUEDE PUBLICAR UN COMPROBANTE (14/08/2026) ═══
//
// `ARCA_FALTAN_MONTO` vive hoy en `Materiales!B53`, que publica `0038-00025483`. Estas dos celdas son
// sus únicos lectores, así que la posición mostraba ese comprobante bajo el rótulo "Saldo" y un CUIT
// bajo "%". El rango se cura en `rangos-nombrados.mjs`; acá se cura el lector, que hace falta igual:
// mientras el nombre exista apuntando a cualquier lado, el que lo cita a ciegas publica lo que haya.
test('las dos celdas de ARCA no publican lo que no sea un número', () => {
  for (const [col, nombre] of [[6, 'ARCA_FALTAN_MONTO'], [7, 'ARCA_FALTAN_N']]) {
    const v = celda(F.arca, col)
    assert.ok(v.includes(`ISNUMBER(${nombre})`),
      `${nombre} se publica sin preguntar si es un número: un comprobante se dibujaría como plata`)
    assert.ok(v.includes('IFERROR('), `${nombre}: si el rango se retira, la celda tiene que dar "—", no #REF!`)
    assert.ok(v.includes('"—"'), `${nombre}: cuando el número no está, la celda muestra "—"`)
  }
})

test('cuando no hay número, el rótulo de ARCA lo dice: un "—" solo se lee como "no hay deuda"', () => {
  const rotulo = celda(F.arca, 5)
  assert.ok(rotulo.includes(`ISNUMBER($G$${F.arca})`), 'el rótulo tiene que mirar la celda que acompaña')
  assert.ok(rotulo.includes(ALERTA), 'y avisar con el mismo triángulo que el resto del cuadro')
})
