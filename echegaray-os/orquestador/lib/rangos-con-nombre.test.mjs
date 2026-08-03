// LO QUE SE PRUEBA ACÁ ES QUE UN RANGO CON NOMBRE NO PUEDA VOLVER A APUNTAR A LA NADA EN SILENCIO.
//
// Las tres formas concretas en que ya falló, en el archivo real, medidas el 03/08:
//   1. `OFICINA_BANCO` apuntando al bloque correcto, con las doce celdas vacías porque el propio
//      generador se las borraba en cada corrida (centinela VACIO sobre una columna del dueño).
//   2. `OFICINA_EFECTIVO` clavado en la columna J filas 26-37 de un layout que ya no existe, dos
//      filas más arriba del bloque de hoy.
//   3. `ESTRUCTURA_TOTAL_MESES` en la fila 3 de Estructura, que hoy es una fila en blanco.
import test from 'node:test'
import assert from 'node:assert/strict'
import { columna, fila, aRangoApi, verificarRangos, usaNombre, clasificarNombrados } from './rangos-con-nombre.mjs'
import { VACIO } from './preservar-anotaciones.mjs'

// Un bloque de oficina en miniatura: encabezado en la fila 2, tres meses en las filas 3-5.
const bloque = () => [
  ['Oficina — sueldos'],
  ['Mes', 'Personas', 'Pagado', VACIO, 'Se paga el', 'Banco', 'Proyectado'],
  ['Junio', 2, '=SUM(A1:A2)', VACIO, '=EOMONTH(1)', '', VACIO],
  ['Julio', 2, '=SUM(A3:A4)', VACIO, '=EOMONTH(2)', '', VACIO],
  ['Agosto', VACIO, VACIO, 'proyección', '=EOMONTH(3)', '', '=B1*2'],
]

const pagado = () => columna('OFICINA_PAGADO', { col: 2, r0: 3, r1: 5, encabezado: 'Pagado' })
const banco = () => columna('OFICINA_BANCO', { col: 5, r0: 3, r1: 5, encabezado: 'Banco', contenido: 'dueño' })

test('un bloque bien publicado no tiene un solo problema', () => {
  assert.deepEqual(verificarRangos(bloque(), [pagado(), banco()]), [])
})

test('EL DEFECTO QUE DEJÓ OFICINA_BANCO EN CERO: el generador emite el centinela en una columna del dueño', () => {
  // Es exactamente el diff que se arregló en jornales-pestana.mjs: la columna "Banco" iba con VACIO
  // ("es mi celda y va vacía") en vez de '' ("no es mía, preservá"). El rango apunta perfecto, el
  // encabezado dice Banco, y el worker le borra el contenido cada 2 h: cero celdas con dato, para
  // siempre, y las dos líneas de sueldos de administración de CAJA en $0 sin un error.
  const filas = bloque()
  for (let r = 3; r <= 5; r++) filas[r - 1][5] = VACIO
  const p = verificarRangos(filas, [banco()])
  assert.equal(p.length, 1)
  assert.equal(p[0].nombre, 'OFICINA_BANCO')
  assert.equal(p[0].problema, 'pisado')
})

test('un rango del OS sobre celdas vacías es un defecto, no un estado', () => {
  // `OFICINA_PAGADO` lo escribe el generador: si no hay una sola celda con contenido, el nombre
  // devuelve 0 y ninguna fórmula se queja.
  const filas = bloque()
  for (let r = 3; r <= 5; r++) filas[r - 1][2] = VACIO
  const p = verificarRangos(filas, [pagado()])
  assert.equal(p[0].problema, 'sin-dato')
})

test('ANCLAR EN LA POSICIÓN SE CAZA POR EL ENCABEZADO, que es el arreglo de fondo', () => {
  // El bloque se movió dos filas —es literalmente lo que le pasó a OFICINA_EFECTIVO— y el rango se
  // quedó donde estaba. Sin el ancla, esto se publica contento y devuelve cero.
  const p = verificarRangos(bloque(), [columna('OFICINA_BANCO', { col: 5, r0: 1, r1: 3, encabezado: 'Banco', contenido: 'dueño' })])
  assert.equal(p[0].problema, 'desanclado')
})

test('una columna insertada en el medio corre el rango a la de al lado, y también salta', () => {
  // El defecto más caro de este libro: la fórmula sigue andando y contesta otra pregunta.
  const p = verificarRangos(bloque(), [columna('OFICINA_BANCO', { col: 4, r0: 3, r1: 5, encabezado: 'Banco', contenido: 'dueño' })])
  assert.equal(p[0].problema, 'desanclado')
  assert.match(p[0].detalle, /Se paga el/)
})

test('un rango que se pasa del alto de la grilla no se publica', () => {
  const p = verificarRangos(bloque(), [columna('OFICINA_PAGADO', { col: 2, r0: 3, r1: 40, encabezado: 'Pagado' })])
  assert.equal(p[0].problema, 'fuera-de-la-grilla')
})

test('un rango HORIZONTAL se ancla en el rótulo de su fila', () => {
  const filas = [['Rubro', 'ene', 'feb'], ['Alquiler', 10, 20], ['TOTAL ESTRUCTURA', '=SUM(B2)', '=SUM(C2)']]
  const ok = fila('ESTRUCTURA_TOTAL_MESES', { fila: 3, c0: 1, c1: 2, rotulo: 'TOTAL ESTRUCTURA' })
  assert.deepEqual(verificarRangos(filas, [ok]), [])
  // La fila 3 de Estructura en el archivo real: en blanco. Es el tercer rango ciego de la auditoría.
  const mal = fila('ESTRUCTURA_TOTAL_MESES', { fila: 1, c0: 1, c1: 2, rotulo: 'TOTAL ESTRUCTURA' })
  assert.equal(verificarRangos(filas, [mal])[0].problema, 'desanclado')
})

test('la columna que el generador restaura desde la pestaña no cuenta como pisada', () => {
  // "Pagado el" emite el centinela A PROPÓSITO y después copia lo que había. Es la excepción, y está
  // declarada como tal: si el verificador la tratara como el resto, taparía el caso real gritando
  // por uno que no lo es.
  const filas = [['Quincena', 'Pagado el'], ['1/7', VACIO], ['16/7', VACIO]]
  const d = columna('JORNALES_REAL_PAGADO', { col: 1, r0: 2, r1: 3, encabezado: 'Pagado el', contenido: 'dueño-restaurado' })
  assert.deepEqual(verificarRangos(filas, [d]), [])
})

test('el rango que se le manda a la API es 0-based y con el fin exclusivo', () => {
  assert.deepEqual(aRangoApi(7, pagado()), { sheetId: 7, startRowIndex: 2, endRowIndex: 5, startColumnIndex: 2, endColumnIndex: 3 })
})

test('un nombre no matchea adentro de otro más largo', () => {
  assert.ok(usaNombre('=SUMPRODUCT(N(OFICINA_PAGO))', 'OFICINA_PAGO'))
  assert.ok(!usaNombre('=SUMPRODUCT(N(OFICINA_PAGO_VIEJO))', 'OFICINA_PAGO'))
  assert.ok(!usaNombre('=SUMPRODUCT(N(X_OFICINA_PAGO))', 'OFICINA_PAGO'))
})

test('CIEGO ES VACÍO CON LECTORES; HUÉRFANO ES SIN LECTORES', () => {
  const nombrados = [
    { nombre: 'OFICINA_BANCO', hoja: 'Jornales por Quincena', conDato: 0, celdas: 12 },
    { nombre: 'OFICINA_EFECTIVO', hoja: 'Jornales por Quincena', conDato: 0, celdas: 12 },
    { nombre: 'OFICINA_PAGADO', hoja: 'Jornales por Quincena', conDato: 7, celdas: 12 },
  ]
  const formulas = ['=SUMPRODUCT(ISNUMBER(OFICINA_PAGO)*N(OFICINA_BANCO))', '=SUM(OFICINA_PAGADO)']
  const r = clasificarNombrados(nombrados, formulas)
  assert.equal(r.find((x) => x.nombre === 'OFICINA_BANCO').estado, 'ciego')
  assert.equal(r.find((x) => x.nombre === 'OFICINA_EFECTIVO').estado, 'huérfano')
  assert.equal(r.find((x) => x.nombre === 'OFICINA_PAGADO').estado, 'ok')
})

test('un rango vacío que nadie lee NO se reporta como ciego', () => {
  // Es la diferencia entre "hay plata mal contada hoy" y "hay una trampa esperando". Mezclarlos hace
  // que la lista deje de mirarse, que es cómo murió la primera versión del auditor de fosilizados.
  const r = clasificarNombrados([{ nombre: 'X', hoja: 'H', conDato: 0, celdas: 5 }], [])
  assert.equal(r[0].estado, 'huérfano')
})
