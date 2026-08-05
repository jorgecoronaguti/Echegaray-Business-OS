import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ESTADOS, ESPERADOS, COB, formulaTotalEstado, formulaCantidadEstado, formulaEstadoDesconocido,
  formulaUltimoCobroRegistrado, formulaMontoRanking, formulaClienteRanking, consultaPorCliente,
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

test('EL RANKING NO DERRAMA: todo array está CONSUMIDO por un INDEX', () => {
  // ⚠ ES EL REQUISITO, NO UNA LIMITACIÓN. Esta pestaña se escribe con fusión preservadora fila por
  // fila: una fórmula que devuelve cinco filas desde una celda pisa las cinco de abajo y corrompe el
  // bloque siguiente sin dar un solo error — y crece sola cuando entra un cliente nuevo.
  //
  // LO QUE ESTE TEST DECÍA ANTES ERA DEMASIADO: prohibía QUERY, SORT, UNIQUE y FILTER a secas. Una
  // función que devuelve un array sólo derrama si NADIE la consume, y prohibirlas empujó a una
  // alternativa que directamente no funciona (ver el encabezado del módulo). La regla correcta es que
  // la celda devuelva UN valor, y eso se garantiza con el INDEX de afuera.
  const monto = formulaMontoRanking(2)
  assert.ok(monto.startsWith('=IFERROR(INDEX('), 'la consulta tiene que entrar a un INDEX, o derrama')
  assert.ok(monto.includes(';2;2)'), 'el segundo puesto sale de la fila 2, columna 2 de la consulta')
  // Menos de k clientes no puede dejar un #N/A a la vista.
  assert.ok(monto.startsWith('=IFERROR('))
  // Y la consulta sola NO se publica nunca: si alguien exporta una celda con el QUERY pelado, derrama.
  assert.ok(!consultaPorCliente().startsWith('='), 'la consulta es un fragmento, no una celda')
})

test('SUMIFS NO SE VECTORIZA DENTRO DE ARRAYFORMULA: el patrón que vació el bloque no puede volver', () => {
  // EL DEFECTO, MEDIDO EN LA PESTAÑA ESCRITA. La versión anterior armaba el total por cliente con
  // `ARRAYFORMULA(… * SUMIFS(M;G;G;O;"Pendiente"))`. SUMIF acepta un criterio en forma de array;
  // SUMIFS NO. Con un criterio array devuelve un escalar o un error, el IFERROR de afuera se lo comía,
  // y las cinco filas del ranking salieron VACÍAS con el total intacto en $345.200.985 — una línea
  // muda de trescientos cuarenta y cinco millones, que es justo lo que este bloque existe para evitar.
  //
  // Se prohíbe la CAUSA (SUMIFS adentro de ARRAYFORMULA), no el síntoma.
  for (const f of [formulaMontoRanking(1), formulaClienteRanking('1º', 1, '$C$10'), consultaPorCliente()]) {
    const arrayfs = [...f.matchAll(/ARRAYFORMULA\(/g)]
    for (const m of arrayfs) {
      const trozo = f.slice(m.index, m.index + 400)
      assert.ok(!trozo.includes('SUMIFS('), `SUMIFS dentro de ARRAYFORMULA no se vectoriza:\n  ${trozo.slice(0, 120)}`)
    }
  }
})

test('el ranking DEDUPLICA por cliente: dos facturas del mismo cliente son UNA línea', () => {
  // Sin dedupe, el ranking devolvería el mismo cliente en los cinco puestos. Lo hace el `group by` de
  // la consulta, que además es lo que la vuelve legible: la agrupación se lee, no se deduce.
  const q = consultaPorCliente('pendiente')
  assert.ok(q.includes('group by Col1'), 'sin group by, el mismo cliente ocupa varios puestos')
  assert.ok(q.includes('order by sum(Col7) desc'), 'y sin order by no hay ranking')
  assert.ok(q.includes(`Col9 = '${ESTADOS.pendiente}'`), 'el estado se elige por su nombre exacto')
  // Una fila sin cliente agruparía a todas las anónimas en un bucket que puede ganarle a uno real.
  assert.ok(q.includes('Col1 is not null'))
  // SIN EL LABEL VACÍO, QUERY AGREGA UNA FILA DE ENCABEZADO y el ranking se corre un puesto: el primer
  // cliente desaparece sin dar un solo error.
  assert.ok(q.includes("label sum(Col7) ''"))
  // El rango tiene que llegar hasta la columna del ESTADO o Col9 no existe y la consulta rompe entera.
  assert.ok(q.includes(`${COB.pestaña}!$${COB.cliente}$${COB.primera}:$${COB.estado}$${COB.ultima}`))
})

test('el nombre del cliente sale del MISMO PUESTO que el importe, no de buscar el importe', () => {
  // La versión anterior hacía `MATCH(importe; array; 0)` para ahorrarse una consulta: dos clientes
  // empatados en el mismo total mostraban el mismo nombre en dos filas. Ir por el puesto no empata.
  const f = formulaClienteRanking('3º', 3, '$C$63')
  assert.ok(f.includes(';3;1)'), 'el nombre tiene que salir de la fila 3, columna 1 de la consulta')
  assert.ok(!f.includes('MATCH('), 'buscar por importe hace que dos empatados muestren el mismo nombre')
  assert.ok(f.startsWith('=IF($C$63="";"";'), 'sin importe no hay nombre: una fila vacía se ve vacía')
})

test('ninguna fórmula usa la coma como separador de argumentos (es_AR usa `;`)', () => {
  const todas = [
    formulaTotalEstado('pendiente', { desde: 'TODAY()', hasta: 'TODAY()+30' }),
    formulaCantidadEstado('cobrado'), formulaEstadoDesconocido(), formulaUltimoCobroRegistrado(),
    formulaMontoRanking(1), formulaClienteRanking('1º', 1, '$C$10'), consultaPorCliente(),
  ]
  for (const f of todas) {
    const sinLiterales = f.replace(/"(?:[^"]|"")*"/g, '«»')
    assert.ok(!sinLiterales.includes(','), `usa coma: ${f.slice(0, 90)}`)
  }
})
