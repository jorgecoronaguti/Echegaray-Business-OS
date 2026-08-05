import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ESTADOS, ESPERADOS, COB, formulaTotalEstado, formulaCantidadEstado, formulaEstadoDesconocido,
  formulaUltimoCobroRegistrado, formulaMontoRanking, formulaClienteRanking, arrayTotalPorCliente,
} from './cobranzas-cartera.mjs'

test('LOS CINCO ESTADOS, y CANCELAR NO es plata que se espera cobrar', () => {
  // ═══ EL DEFECTO (05/08/2026) ═══
  //
  // El filtro que había en el archivo era "todo lo que no dice Cobrado ni Endosado". Eso mete en la
  // misma bolsa una factura CANCELADA (fila 54, IMOTOR/San Francisco) y tres cobros PROYECTADOS de
  // ARCOR por $6.075.303 al 30/09. Hoy la cancelada está en $0 y no cuesta plata; el día que alguien
  // cancele una factura con importe cargado, el calendario la va a seguir esperando y el piso va a
  // mentir HACIA ARRIBA — el error caro.
  assert.equal(Object.keys(ESTADOS).length, 5, 'la columna Estado tiene cinco valores, no dos')
  assert.ok(!ESPERADOS.includes('cancelado'), 'una factura cancelada no es un ingreso futuro')
  assert.ok(!ESPERADOS.includes('cobrado'), 'lo cobrado ya está en el saldo del banco: sumarlo lo cuenta dos veces')
  assert.deepEqual([...ESPERADOS].sort(), ['facturado', 'pendiente', 'proyectado'])
})

test('cada estado se suma SOLO: ninguna fórmula mezcla dos categorías en la misma columna', () => {
  // Es la regla literal de finanzas-tesoreria-construccion. Si una fórmula de total nombrara dos
  // estados, el cuadro estaría sumando certezas distintas en una columna.
  for (const clave of Object.keys(ESTADOS)) {
    const f = formulaTotalEstado(clave)
    const nombrados = Object.values(ESTADOS).filter((v) => f.includes(`="${v}"`))
    assert.deepEqual(nombrados, [ESTADOS[clave]], `${clave} nombra más de un estado`)
  }
})

test('la ventana de vencidos es EXCLUYENTE y exige que la fecha sea número', () => {
  // Una fecha guardada como TEXTO compara como mayor que cualquier número: sin ISNUMBER, filas sin
  // fecha usable entrarían en la ventana. Es el mismo defecto que ya costó $657.000 del lado de los
  // cheques.
  const f = formulaTotalEstado('pendiente', { hasta: 'TODAY()' })
  assert.ok(f.includes('ISNUMBER('))
  assert.ok(f.includes('<TODAY()') && !f.includes('<=TODAY()'))
  // Y la cantidad usa EXACTAMENTE la misma condición que el monto: un total sin su cantidad no se
  // puede auditar, y dos condiciones distintas darían un promedio inventado.
  const c = formulaCantidadEstado('pendiente', { hasta: 'TODAY()' })
  assert.equal(c.replace('*1)', ')'), f.replace(`*IF(ISNUMBER(${COB.pestaña}!$M$5:$M$400);${COB.pestaña}!$M$5:$M$400;0))`, ')'))
})

test('LA LISTA BLANCA SE PAGA CON UN CONTADOR: un sexto estado no puede pasar en silencio', () => {
  // Elegir estados por nombre tiene un riesgo propio: el día que alguien tipee "Cobrado parcial",
  // esas filas dejan de contarse en todos los cuadros y nadie se entera. Sin este contador, la lista
  // blanca sería peor que la lista negra que reemplaza.
  const f = formulaEstadoDesconocido()
  for (const v of Object.values(ESTADOS)) assert.ok(f.includes(`="${v}"`), `falta ${v}`)
  assert.ok(f.includes('<>""'), 'una fila vacía no es un estado desconocido')
})

test('UN CERO MUDO MIENTE: existe la fecha del último cobro para poder distinguirlo', () => {
  // "Está todo conciliado" y "hace tres semanas que nadie carga" se dibujan igual: cero.
  const f = formulaUltimoCobroRegistrado()
  assert.ok(f.includes(`="${ESTADOS.cobrado}"`), 'el ancla es un cobro REAL, no uno esperado')
  assert.ok(f.includes('MAX(') && f.includes('ISNUMBER('))
})

test('EL RANKING NO DERRAMA: una celda, un valor — ni QUERY ni SORT ni UNIQUE', () => {
  // ⚠ ES EL REQUISITO, NO UNA LIMITACIÓN. Esta pestaña se escribe con fusión preservadora fila por
  // fila: una fórmula que devuelve cinco filas desde una celda pisa las cinco de abajo y corrompe el
  // bloque siguiente sin dar un solo error — y crece sola cuando entra un cliente nuevo.
  const monto = formulaMontoRanking(2)
  for (const prohibida of ['QUERY(', 'SORT(', 'UNIQUE(', 'FILTER(']) {
    assert.ok(!monto.includes(prohibida), `${prohibida} derrama y corrompe las filas de abajo`)
  }
  assert.ok(monto.includes('LARGE(') && monto.includes(';2)'))
  // Menos de k clientes no puede dejar un #NUM! a la vista.
  assert.ok(monto.startsWith('=IFERROR('))
})

test('el ranking DEDUPLICA por cliente: dos facturas del mismo cliente son UNA línea', () => {
  // Sin dedupe, LARGE sobre los totales por fila devolvería el mismo cliente en los cinco puestos.
  // El dedupe se hace con una clave por fila y MATCH a su primera aparición, sin columnas auxiliares.
  const a = arrayTotalPorCliente('pendiente')
  assert.ok(a.includes('MATCH('), 'sin MATCH a la primera aparición, el mismo cliente ocupa varios puestos')
  assert.ok(a.includes('SUMIFS('), 'el total por cliente sale de SUMIFS sobre los rangos reales')
  // La clave de las filas que NO califican es un carácter fijo, nunca "": MATCH sobre celdas
  // realmente vacías da resultados distintos según la fila y el dedupe se rompe en silencio.
  assert.ok(a.includes('"·"'))
  // Y ese grupo se anula multiplicando por la condición, o "otros" se comería el ranking.
  assert.ok(a.startsWith(`ARRAYFORMULA((${COB.pestaña}!$O$5:$O$400="${ESTADOS.pendiente}")*`))
})

test('el nombre del cliente no recalcula el ranking: lee el importe que ya está en la fila', () => {
  // Dos motivos: la mitad del costo (LARGE y MATCH sobre 396 filas, cinco veces) y —el que importa—
  // que las dos celdas de la misma fila no se puedan contradecir.
  const f = formulaClienteRanking('3º', '$C$63')
  assert.ok(f.includes('MATCH($C$63;'), 'el nombre tiene que salir del importe ya calculado')
  assert.ok(!f.includes('LARGE('), 'recalcular LARGE acá permite que el nombre y el importe discrepen')
  assert.ok(f.startsWith('=IF($C$63="";"";'), 'sin importe no hay nombre: una fila vacía se ve vacía')
})

test('ninguna fórmula usa la coma como separador de argumentos (es_AR usa `;`)', () => {
  const todas = [
    formulaTotalEstado('pendiente', { desde: 'TODAY()', hasta: 'TODAY()+30' }),
    formulaCantidadEstado('cobrado'), formulaEstadoDesconocido(), formulaUltimoCobroRegistrado(),
    formulaMontoRanking(1), formulaClienteRanking('1º', '$C$10'), arrayTotalPorCliente(),
  ]
  for (const f of todas) {
    const sinLiterales = f.replace(/"(?:[^"]|"")*"/g, '«»')
    assert.ok(!sinLiterales.includes(','), `usa coma: ${f.slice(0, 90)}`)
  }
})
