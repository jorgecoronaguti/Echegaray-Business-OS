// EL BORDE DEL AÑO — que enero de 2027 no entre en el ejercicio 2026, ni diciembre de 2025.
//
// El defecto que estos tests mantienen muerto: la última columna del Semanal ("28/12") sumaba hasta el
// 3/1/2027 y se llevaba al año dos movimientos del 01/01/2027 ($13.073.317). El TOTAL del año quedaba
// $13,07M peor que el del Mensual y —lo que importa— el PISO DEL PERÍODO caía sobre esa columna
// contaminada: el dueño leía un piso que no existía.
//
// Revertir `expresionAcotada` en cash-flow-semanas.mjs pone en rojo "la última columna corta en el
// 1/1" y "las 53 columnas particionan exactamente el ejercicio".

import test from 'node:test'
import assert from 'node:assert/strict'
import { acotarAlEjercicio, bordeDelEjercicio, expresionAcotada } from './cash-flow-borde-anio.mjs'
import { COL, celda, expresionVentana, particionExacta, ventanas, colTotal, FILA } from './cash-flow-matriz.mjs'
import { grillaSemanal } from './cash-flow-semanas.mjs'
import { grillaMeses } from './cash-flow-meses.mjs'

const ANIO = 2026
const REFS = { saldo: 'CAJA_TOTAL_DISPONIBLE', fecha: 'CAJA_FECHA_SALDO', minima: 'CAJA_MINIMA' }
const HOY = new Date(Date.UTC(2026, 7, 13))
const SEMANAS = ventanas('semana', { anio: ANIO })
const u = (d) => new Date(d).toISOString().slice(0, 10)

test('las semanas ISO SE DERRAMAN sobre los dos años vecinos: es el hecho que causó el desvío', () => {
  // Si esto dejara de ser cierto, el recorte sobraría. Se prueba para que el porqué no dependa del
  // comentario: la primera semana de 2026 arranca el lunes 29/12/2025 y la última termina el 4/1/2027.
  assert.equal(u(SEMANAS[0].desde), '2025-12-29')
  assert.equal(u(SEMANAS[SEMANAS.length - 1].hasta), '2027-01-04')
  assert.equal(SEMANAS.length, 53)
})

test('acotar deja el ejercicio exacto y conserva el lunes como ancla del encabezado', () => {
  const e = acotarAlEjercicio(SEMANAS, ANIO)
  assert.equal(u(e[0].desde), '2026-01-01', 'la primera columna no suma diciembre de 2025')
  assert.equal(u(e[0].ancla), '2025-12-29', 'pero la columna se sigue rotulando con su lunes')
  assert.equal(u(e[52].hasta), '2027-01-01', 'la última columna corta antes del 1/1/2027')
  assert.equal(u(e[52].desde), '2026-12-28', 'y sigue mostrando la semana del 28/12, que SÍ es 2026')
  // Las 51 del medio quedan intactas: recortar donde no hace falta sería alargar 51 fórmulas.
  for (let i = 1; i < 52; i++) assert.deepEqual([u(e[i].desde), u(e[i].hasta)], [u(SEMANAS[i].desde), u(SEMANAS[i].hasta)])
})

test('LA CONDICIÓN QUE HACE QUE LAS DOS VISTAS NO PUEDAN DISCREPAR: partición exacta del ejercicio', () => {
  const { inicio, fin } = bordeDelEjercicio(ANIO)
  for (const meta of [grillaSemanal({ hoy: HOY, anio: ANIO, refs: REFS }).meta, grillaMeses({ anio: ANIO, refs: REFS, hoy: HOY }).meta]) {
    const p = particionExacta(meta.efectivas, inicio, fin)
    assert.ok(p.ok, `${meta.pestana}: ${p.huecos.join('; ')}`)
    assert.deepEqual([meta.cubre.inicio.getTime(), meta.cubre.fin.getTime()], [inicio.getTime(), fin.getTime()])
  }
  // Sin acotar, la partición NO es exacta: es el defecto, escrito como test.
  const sinAcotar = particionExacta(SEMANAS, inicio, fin)
  assert.equal(sinAcotar.ok, false)
})

test('la expresión sólo se envuelve en los bordes, y con DATE en el locale del archivo', () => {
  const cab = 'BB$7'
  const v = expresionVentana(cab, 'semana')
  assert.deepEqual(expresionAcotada(v, { anio: ANIO }), v, 'una columna del medio no se toca')
  assert.equal(expresionAcotada(v, { anio: ANIO, ultima: true }).hasta, 'MIN(BB$7+7;DATE(2027;1;1))')
  assert.equal(expresionAcotada(v, { anio: ANIO, primera: true }).desde, 'MAX(BB$7;DATE(2026;1;1))')
  // El separador es `;` (es_AR). Con `,` la fórmula entra como texto y la columna deja de sumar.
  assert.ok(!expresionAcotada(v, { anio: ANIO, ultima: true }).hasta.includes(','))
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LO QUE SE VE EN LA PESTAÑA — sobre la grilla real, no sobre la función suelta
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const grillaDe2026 = () => grillaSemanal({ hoy: HOY, anio: ANIO, refs: REFS })

test('UN MOVIMIENTO DEL 01/01/2027 NO ENTRA Y UNO DEL 30/12/2026 SÍ — en la fórmula de la columna', () => {
  const { filas, meta } = grillaDe2026()
  const ultima = meta.cab.col0 + meta.cab.n - 1
  const f = String(filas[meta.fila.egresoProyectado - 1][ultima])
  const cab = celda(ultima, FILA.cabecera)
  // El techo de la última columna es el 1/1/2027, no el lunes+7 (que sería el 4/1/2027).
  assert.ok(f.includes(`<MIN(${cab}+7;DATE(2027;1;1))`), f)
  assert.ok(!f.includes(`<${cab}+7`), 'sin el MIN, el 01/01/2027 vuelve a caer adentro')
  // Y el piso de esa columna sigue siendo su lunes: el 28, 29, 30 y 31/12 pertenecen al ejercicio.
  assert.ok(f.includes(`>=${cab}`), f)
})

test('la primera columna no arrastra diciembre de 2025', () => {
  const { filas, meta } = grillaDe2026()
  const f = String(filas[meta.fila.ingresoReal - 1][meta.cab.col0])
  assert.ok(f.includes(`>=MAX(${celda(meta.cab.col0, FILA.cabecera)};DATE(2026;1;1))`), f)
})

test('la sección POR CLIENTE se acota igual: si no, los clientes no cuadran con el Mensual', () => {
  const { filas, meta } = grillaDe2026()
  const ultima = meta.cab.col0 + meta.cab.n - 1
  const bloque = meta.clientes.bloques[0]
  const f = String(filas[bloque.medidas[0].fila - 1][ultima])
  assert.ok(f.includes('DATE(2027;1;1)'), `la fila del cliente sigue sumando enero de 2027: ${f.slice(0, 160)}`)
})

test('EL PISO NO SE CALCULA SOBRE UNA COLUMNA CONTAMINADA: el rango es el del ejercicio', () => {
  // El piso es `MIN` sobre la fila de saldo final de las columnas de tiempo. Lo que lo arregla no es el
  // rango —que ya era el correcto— sino que la última columna deje de hundirse con plata de 2027. Acá
  // se ata lo que se puede atar en la grilla: que el MIN barre TODAS las columnas de tiempo y ninguna
  // más, y que la última de ellas es la que acaba de acotarse.
  const { filas, meta } = grillaDe2026()
  const piso = String(filas[meta.hero.valor - 1][meta.hero.slots[1]])
  const ultima = celda(meta.cab.col0 + meta.cab.n - 1, meta.fila.saldoFinal)
  assert.ok(piso.startsWith('=MIN('), piso)
  assert.ok(piso.includes(`:${ultima})`), `el piso tiene que llegar hasta la última columna de tiempo: ${piso}`)
  assert.ok(!piso.includes(celda(colTotal('semana', ANIO), meta.fila.saldoFinal)), 'la columna TOTAL no es un período')
  // Y la última columna del saldo final encadena con la de al lado, así que hereda el arreglo.
  const saldo = String(filas[meta.fila.saldoFinal - 1][meta.cab.col0 + meta.cab.n - 1])
  assert.ok(saldo.includes(celda(meta.cab.col0 + meta.cab.n - 1, meta.fila.resultado)), saldo)
  assert.equal(COL.tiempo0, 1)
})
