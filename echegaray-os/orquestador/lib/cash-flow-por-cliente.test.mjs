// LA SECCIÓN POR CLIENTE — que discrimine de verdad, y que el cuadro siga cerrando.
//
// Lo que se prueba acá es lo que rompe en silencio:
//
//  · el filtro por CONTRAPARTE en vez de por la columna canónica. La contraparte de un egreso es el
//    PROVEEDOR: filtrarla por "LA ESTRELLA" devuelve cero para siempre y el cuadro no da un error, sólo
//    muestra que a LA ESTRELLA no se le pagó nada nunca.
//  · el residuo calculado como SUMA en vez de por DIFERENCIA: un cliente nuevo del Libro se caería del
//    bloque y el bloque cerraría consigo mismo — coherente y falso.
//  · el subtotal del tronco tocado. La sección cuelga de él y no lo modifica: si cambia, no fue esto.
//  · los tres rangos con nombre (CF_MESES / CF_INICIO / CF_CIERRE) corridos por las 36 filas nuevas.
//  · la coma como separador. El archivo es es-AR: el separador de argumentos es `;` y una fórmula con
//    coma no da error, entra como TEXTO.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CONCEPTOS, FILA, MEDIDAS_POR_CLIENTE, TITULO_POR_CLIENTE,
  bloqueDeMedida, conceptosDe, filaDeConcepto, footprintDe, filaGraficos, formulasDeMedida,
} from './cash-flow-matriz.mjs'
import { bloquesDeCliente, filaTituloPorCliente, formulasDeCliente, formulasPorCliente } from './cash-flow-por-cliente.mjs'
import { nombresDeClientes, ROTULO_SIN_CLIENTE } from './libro-clientes.mjs'
import { grillaMeses, destinosNombrados, NOMBRES_VISTA } from './cash-flow-meses.mjs'
import { NOMBRE_MESES } from './cash-flow-lineas.mjs'

const VENTANA = { col: 1, desde: '$B$7', hasta: '$B$7+7' }

test('hay un bloque por cliente del catálogo y UNO de residuo, en las dos vistas', () => {
  for (const tipo of ['semana', 'mes']) {
    const bloques = bloquesDeCliente(tipo)
    assert.deepEqual(bloques.map((b) => b.nombre), [...nombresDeClientes(), ROTULO_SIN_CLIENTE], tipo)
    assert.equal(bloques.filter((b) => b.residuo).length, 1, 'un solo residuo, y va último')
    assert.equal(bloques[bloques.length - 1].residuo, true)
  }
  // Las mismas filas RELATIVAS en las dos vistas: un cliente no puede estar en un lugar acá y otro
  // allá, o comparar las dos pestañas deja de significar algo.
  const rel = (tipo) => bloquesDeCliente(tipo).map((b) => [b.nombre, b.cabecera - filaTituloPorCliente(tipo)])
  assert.deepEqual(rel('semana'), rel('mes'))
})

test('las cinco filas de un cliente son CONTIGUAS: cabecera y sus cuatro medidas, en orden', () => {
  for (const b of bloquesDeCliente('semana')) {
    assert.equal(b.primera, b.cabecera + 1, `${b.nombre}: la primera medida va pegada a la cabecera`)
    assert.equal(b.ultima, b.cabecera + MEDIDAS_POR_CLIENTE.length)
    assert.deepEqual(b.medidas.map((m) => m.clave), MEDIDAS_POR_CLIENTE.map((m) => m.clave))
    assert.deepEqual(b.medidas.map((m) => m.fila), b.medidas.map((_, i) => b.cabecera + 1 + i))
  }
  // Y los rótulos llevan la MISMA sangría que las sub-líneas de rubro: son la misma clase de fila.
  const filas = conceptosDe('semana').filter((c) => c.cli && c.cli.medida)
  for (const f of filas) assert.match(f.rotulo, /^ {4}· /, f.rotulo)
  const titulo = CONCEPTOS.find((c) => c.tituloSeccion)
  assert.equal(titulo.rotulo, TITULO_POR_CLIENTE)
  assert.equal(titulo.total, false, 'el título de sección no suma nada: no es una fila de datos')
})

test('cada línea de cliente lleva el MISMO filtro que su subtotal, más la columna CLIENTE', () => {
  const b = bloquesDeCliente('semana').find((x) => x.nombre === 'LA ESTRELLA')
  const lineas = formulasDeCliente('semana', 'LA ESTRELLA', VENTANA)
  for (const m of b.medidas) {
    const f = lineas.find((l) => l.fila === m.fila).formula
    const subtotal = formulasDeMedida('semana', m.clave, VENTANA)
      .find((l) => l.fila === filaDeConcepto('semana', m.clave)).formula
    // El término del subtotal, con UNA condición más. Se compara quitando la condición del cliente:
    // si quedara algo distinto, las dos filas estarían contando ventanas o estados diferentes.
    const sinCliente = f.replace('*((_MOVIMIENTOS!$Q$2:$Q="LA ESTRELLA"))', '')
    assert.equal(sinCliente, subtotal, `${m.clave}: el filtro del cliente no puede cambiar la medida`)
    assert.ok(f.includes('_MOVIMIENTOS!$Q$2:$Q="LA ESTRELLA"'), `${m.clave}: ${f}`)
  }
})

test('EL FILTRO ES POR LA COLUMNA CLIENTE, NUNCA POR CONTRAPARTE — la contraparte de un egreso es el proveedor', () => {
  const lineas = formulasDeCliente('semana', 'MESSINA', VENTANA)
  const egreso = lineas.find((l) => l.formula.includes('$B$2:$B=-1'))
  assert.ok(egreso, 'tiene que haber una línea de egreso')
  // La J es Contraparte y la Q es Cliente. Si esto filtrara por J, la línea de egreso de MESSINA
  // sumaría cero para siempre: en un pago, la contraparte es el proveedor al que se le paga.
  assert.ok(!/\$J\$2:\$J=/.test(egreso.formula), `filtra por contraparte: ${egreso.formula}`)
  assert.ok(egreso.formula.includes('_MOVIMIENTOS!$Q$2:$Q="MESSINA"'), egreso.formula)
})

test('el NETO del cliente es entra − sale sobre SUS PROPIAS celdas, igual que la fila Resultado', () => {
  const b = bloquesDeCliente('mes').find((x) => x.nombre === 'ARCOR')
  const neto = formulasDeCliente('mes', 'ARCOR', { col: 3, desde: '$D$7', hasta: 'EOMONTH($D$7;0)+1' })
    .find((l) => l.fila === b.cabecera).formula
  const c = (clave) => `$D$${b.medidas.find((m) => m.clave === clave).fila}`
  assert.equal(neto, `=N(${c('ingresoReal')})+N(${c('ingresoProyectado')})-N(${c('egresoReal')})-N(${c('egresoProyectado')})`)
  // No recalcula nada del libro: si mañana cambia la definición de "Egresos reales", cambia con ella.
  assert.ok(!neto.includes('SUMPRODUCT'), 'el neto no puede tener su propia aritmética sobre el libro')
})

test('EL RESIDUO SE DESPEJA DEL SUBTOTAL DEL TRONCO, y enumera a TODOS los clientes listados', () => {
  const res = bloquesDeCliente('semana').find((b) => b.residuo)
  const lineas = formulasDeCliente('semana', ROTULO_SIN_CLIENTE, VENTANA)
  const listados = bloquesDeCliente('semana').filter((b) => !b.residuo)
  for (const m of res.medidas) {
    const f = lineas.find((l) => l.fila === m.fila).formula
    const subtotal = filaDeConcepto('semana', m.clave)
    const partes = listados.map((b) => `N($B$${b.medidas.find((y) => y.clave === m.clave).fila})`)
    // Subtotal del tronco MENOS cada cliente listado. Si faltara uno, su plata aparecería DOS veces
    // (en su fila y en el residuo); si sobrara, el residuo saldría de menos.
    assert.equal(f, `=N($B$${subtotal})-(${partes.join('+')})`, m.clave)
    assert.ok(!f.includes('SUMPRODUCT'), 'el residuo NO se filtra por "cliente vacío": un cliente nuevo desaparecería')
  }
})

test('LOS SUBTOTALES DEL TRONCO NO CAMBIAN: la sección cuelga de ellos y no los toca', () => {
  // La regla del pedido, y la que hace que la partición cierre: el subtotal sigue siendo el LIBRO
  // entero, no la suma de los bloques de cliente.
  for (const clave of MEDIDAS_POR_CLIENTE.map((m) => m.clave)) {
    const b = bloqueDeMedida('semana', clave)
    const sub = formulasDeMedida('semana', clave, VENTANA).find((l) => l.fila === b.subtotal).formula
    assert.ok(sub.startsWith('=SUMPRODUCT('), sub)
    assert.ok(!/\$Q\$2:\$Q/.test(sub), 'el subtotal no puede llevar un filtro de cliente')
  }
})

test('es-AR: ninguna fórmula de la sección usa la coma como separador', () => {
  // Una fórmula con coma no da error en un archivo es-AR: entra como TEXTO y la celda muestra la
  // fórmula escrita. Ya pasó, y es invisible hasta que alguien mira la pestaña.
  for (const l of formulasPorCliente('semana', VENTANA)) {
    assert.ok(!l.formula.includes(','), l.formula)
    assert.ok(l.formula.startsWith('='), l.formula)
  }
})

test('la sección va DESPUÉS de todo el tronco, y no hay dos filas con la misma clave', () => {
  for (const tipo of ['semana', 'mes']) {
    const titulo = filaTituloPorCliente(tipo)
    assert.ok(titulo > filaDeConcepto(tipo, 'saldoFinal'))
    if (tipo === 'mes') assert.ok(titulo > filaDeConcepto(tipo, 'variacionMesAnterior'))
    for (const b of bloquesDeCliente(tipo)) assert.ok(b.cabecera > titulo, b.nombre)
  }
  assert.equal(new Set(CONCEPTOS.map((c) => c.clave)).size, CONCEPTOS.length)
})

test('EL FOOTPRINT SE RECALCULA con las filas nuevas: el gráfico sigue cayendo adentro de la hoja', () => {
  // Si el alto quedara con el número anterior, `addChart` ancla fuera de la grilla y devuelve 400: se
  // cae el lote entero y la pestaña queda a medio escribir. El alto es una FUNCIÓN de las filas.
  const clientes = nombresDeClientes().length + 1 // + el residuo
  const seccion = 1 + clientes * (1 + MEDIDAS_POR_CLIENTE.length)
  assert.equal(conceptosDe('semana').length, 43 + seccion)
  assert.equal(conceptosDe('mes').length, 45 + seccion)
  for (const tipo of ['semana', 'mes']) {
    const fp = footprintDe(tipo, 2026)
    assert.equal(filaGraficos(tipo), FILA.concepto + conceptosDe(tipo).length + 1)
    assert.ok(fp.filas > filaGraficos(tipo), `${tipo}: el gráfico se ancla fuera de la hoja`)
  }
})

test('CF_MESES / CF_INICIO / CF_CIERRE siguen apuntando a las filas del tronco, no corridos', () => {
  // Los tres nombres son el piso de `caja-anexo-controles.mjs`. Un nombre que apunta a la geometría
  // anterior NO da error: devuelve otra celda, y el control que lo lee miente sin un solo #REF!.
  const { meta } = grillaMeses({ anio: 2026, refs: { saldo: 'CAJA_SALDO', fecha: 'CAJA_FECHA_SALDO' } })
  const destinos = Object.fromEntries(destinosNombrados(meta).map((d) => [d.name, d]))
  assert.equal(destinos[NOMBRE_MESES].fila, FILA.cabecera)
  assert.equal(destinos[NOMBRES_VISTA.inicio].fila, filaDeConcepto('mes', 'saldoInicial'))
  assert.equal(destinos[NOMBRES_VISTA.cierre].fila, filaDeConcepto('mes', 'saldoFinal'))
  for (const d of Object.values(destinos)) {
    assert.equal(d.filas, 1, 'los tres son FILAS de doce columnas, no columnas de doce filas')
    assert.equal(d.cols, 12)
    assert.ok(d.fila < meta.clientes.titulo, `${d.name} quedó dentro de la sección POR CLIENTE`)
  }
})

test('la grilla ESCRIBE la sección: cada fila de cliente tiene su rótulo y su fórmula en cada mes', () => {
  const { filas, meta } = grillaMeses({ anio: 2026, refs: { saldo: 'CAJA_SALDO', fecha: 'CAJA_FECHA_SALDO' } })
  const en = (f, c) => (filas[f - 1] || [])[c]
  assert.equal(en(meta.clientes.titulo, 0), TITULO_POR_CLIENTE)
  for (const b of meta.clientes.bloques) {
    assert.equal(en(b.cabecera, 0), b.nombre)
    for (let j = 0; j < 12; j++) {
      assert.match(String(en(b.cabecera, meta.cab.col0 + j)), /^=/, `${b.nombre} mes ${j + 1}: sin fórmula`)
      for (const m of b.medidas) {
        assert.match(String(en(m.fila, meta.cab.col0 + j)), /^=/, `${b.nombre}/${m.clave} mes ${j + 1}`)
      }
    }
    // Y la columna TOTAL suma la fila: cada línea de cliente es un flujo, no un stock.
    assert.match(String(en(b.cabecera, meta.cab.colTotal)), /^=SUM\(/)
  }
})
