import test from 'node:test'
import assert from 'node:assert/strict'
import { grillaEncabezado, celdasEncabezado, encabezadoSinFormato, FILAS_AGING, MEDIOS, F, SUBTITULO } from './proveedores-encabezado.mjs'
import { esProsa, TOPE_SUBTITULO } from './diseno-unificado.mjs'

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
  const c = celda(F.cuadratura, 1)
  assert.ok(c.includes(`$B$${F.totalAging}`) && c.includes(`$G$${F.totalMedios}`),
    'el control tiene que cruzar el total del aging contra el del medio de pago')
  // ROUND(…;0) es lo que impide que una diferencia de fracciones de centavo encienda el rojo con los
  // datos perfectos — el falso positivo que hace que un control se deje de mirar.
  assert.ok(/^=ROUND\(/.test(c), 'el control redondea a pesos antes de comparar')
  assert.ok(!/[✓✗▲]/.test(c), 'el control es un número: el estado lo dibuja el formato, no un glifo tipeado')
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

// ═══ EL DISEÑO DEL BLOQUE ES DEL DUEÑO, EL CONTENIDO DE LA FILA ES MÍO (18/08) ═══
//
// La primera corrección BORRÓ la fila 12 y subió el control a la 12. El dueño: *"no has respetado el
// diseño q tenía"*. Tenía razón: lo que estaba mal era lo que la fila DECÍA, no que la fila existiera.
test('el bloque conserva su forma: dos filas de control colgadas del total, y ni una más', () => {
  assert.equal(F.cuadratura, F.totalAging + 1, 'la primera línea colgada del total es parte del diseño')
  assert.equal(F.carga, F.totalAging + 2, 'la segunda va al pie del bloque')
  assert.equal(F.fin, F.carga, 'el bloque termina ahí: ni una fila más')
})

// ═══ EL CONTRATO DE DISEÑO NO ADMITE UNA ORACIÓN EN UNA CELDA (09/09/2026) ═══
//
// EL DEFECTO QUE ESTE TEST ATRAPA, medido en el archivo vivo el 09/09: las cuatro celdas del pie del
// encabezado eran oraciones — «▲ Pagadas sin registrar con cuánto — CAJA no las puede imputar», «✗
// difieren en $279.586 — hay deuda que un cuadro ve y el otro no» y, en la F, 180 caracteres con
// nombres de proveedores que derramaban sobre G y H. El dueño (05/09): «minimalismo extremo, sin
// aclaraciones ni explicaciones de nada».
//
// Si alguien vuelve a poner una oración acá —es lo que pasa cada vez que aparece un hallazgo nuevo—
// este test se pone rojo antes de que llegue al Sheet. Se mide con el MISMO detector que audita el
// archivo (`esProsa` de `diseno-unificado`), no con una regla paralela que pueda decir otra cosa.
test('ninguna celda del encabezado es prosa: los controles son «rótulo | número»', () => {
  for (const [i, fila] of grillaEncabezado().entries()) {
    if (i + 1 <= 2) continue   // A1 es el nombre y A2 la línea de procedencia: tienen su propia regla
    for (const [j, c] of fila.entries()) {
      const p = esProsa(c)
      assert.equal(p, null, `fila ${i + 1} col ${j} es prosa (${p?.clase}): "${p?.texto ?? c}"`)
    }
  }
})

test('cada control lleva su número al lado y con especie de control', () => {
  const C = celdasEncabezado()
  for (const [fila, colRotulo, colNumero, especie] of [
    [F.cuadratura, 0, 1, 'control'],
    [F.carga, 0, 1, 'controlEntero'],
    [F.carga, 5, 6, 'control'],
  ]) {
    const rotulo = C[fila - 1][colRotulo]
    const numero = C[fila - 1][colNumero]
    assert.ok(rotulo && String(rotulo.v).startsWith('⇒'), `el rótulo de ${fila}/${colRotulo} lleva el prefijo de control`)
    assert.ok(!String(rotulo.v).startsWith('='), 'el rótulo es texto: una fórmula ahí vuelve a ser una oración')
    assert.ok(numero, `falta el número del control en la fila ${fila}`)
    assert.equal(numero.t, especie, `el número de ${fila}/${colNumero} tiene que dibujarse como control (rojo sólo si ≠ 0)`)
  }
})

// ═══ LA LÍNEA DE ARCA SE FUE DEL ENCABEZADO (09/09/2026) ═══
//
// Publicaba «ARCA que Compras no tiene» con `ARCA_SIN_CARGAR_MONTO`, un rango con nombre que hace
// semanas apunta a una celda del layout anterior: la celda mostraba "—" por su propia guarda. No es
// deuda, no es medio de pago y no pertenece a la posición — es respaldo fiscal, y su lugar es el
// bloque que cruza la pestaña contra el libro de IVA de ARCA.
test('el encabezado ya no cita ARCA: eso es respaldo fiscal, no posición de deuda', () => {
  assert.equal(F.arca, undefined, 'la fila de ARCA dejó de existir en el encabezado')
  for (const c of todas()) {
    assert.ok(!/ARCA_SIN_CARGAR/.test(c), `el encabezado sigue citando un rango de ARCA: "${c.slice(0, 60)}"`)
  }
})

test('A2 declara procedencia y entra en el tope del contrato', () => {
  assert.ok(SUBTITULO.length <= TOPE_SUBTITULO, `${SUBTITULO.length} caracteres, el tope es ${TOPE_SUBTITULO}`)
  assert.equal(grillaEncabezado()[F.bajada - 1][0], SUBTITULO)
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

