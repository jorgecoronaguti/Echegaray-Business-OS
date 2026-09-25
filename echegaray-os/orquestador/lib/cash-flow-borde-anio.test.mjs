// EL BORDE DEL AÑO — que el TOTAL 2026 no se lleve un peso de 2027 ni de 2025, y que enero de 2027 se
// vea igual, DESPUÉS del TOTAL.
//
// Dos defectos que estos tests mantienen muertos:
//
//   13/08/2026 · la última columna del Semanal ("28/12") sumaba hasta el 3/1/2027 y se llevaba al año
//   dos movimientos del 01/01/2027 ($13.073.317). El TOTAL del año quedaba $13,07M peor que el del
//   Mensual y el PISO DEL PERÍODO caía sobre esa columna contaminada.
//
//   24/09/2026 · con el recorte, $45,4M de pagos de enero de 2027 —obligaciones de diciembre— no se
//   veían en NINGUNA vista. El dueño: «si vas a crear el 2027 hacelo después de los totales del 2026».
//   Enero va en un bloque a la derecha del TOTAL, y la semana del 28/12 queda partida: 28–31/12 a la
//   izquierda, 1–3/01 a la derecha.
//
// Sacar el recorte de la semana del 28/12 pone en rojo "el TOTAL 2026 no suma el 01/01/2027"; perder el
// bloque de enero pone en rojo "el F931 de diciembre tiene columna".

import test from 'node:test'
import assert from 'node:assert/strict'
import { bordeDelEjercicio, horizonteDeLaVista, expresionAcotada, recorteDe } from './cash-flow-borde-anio.mjs'
import {
  COL, celda, expresionVentana, particionExacta, ventanas, colTotal, FILA, serialDeFecha, columnasDeLaVista, letra,
} from './cash-flow-matriz.mjs'
import { grillaSemanal } from './cash-flow-semanas.mjs'
import { grillaMeses } from './cash-flow-meses.mjs'

const ANIO = 2026
const REFS = { saldo: 'CAJA_TOTAL_DISPONIBLE', fecha: 'CAJA_FECHA_SALDO', minima: 'CAJA_MINIMA' }
const HOY = new Date(Date.UTC(2026, 7, 13))
const u = (d) => new Date(d).toISOString().slice(0, 10)

test('el ejercicio es el año; lo que las vistas muestran llega al 31/01 siguiente', () => {
  assert.deepEqual([u(bordeDelEjercicio(ANIO).inicio), u(bordeDelEjercicio(ANIO).fin)], ['2026-01-01', '2027-01-01'])
  assert.deepEqual([u(horizonteDeLaVista(ANIO).inicio), u(horizonteDeLaVista(ANIO).fin)], ['2026-01-01', '2027-02-01'])
})

test('las semanas ISO SE DERRAMAN sobre los años vecinos: es el hecho que obliga a recortar', () => {
  const s = ventanas('semana', { anio: ANIO })
  assert.equal(u(s[0].desde), '2025-12-29')
  const s2812 = s.find((v) => u(v.desde) === '2026-12-28')
  assert.equal(u(s2812.hasta), '2027-01-04', 'la semana del 28/12 tiene días de los dos años')
})

test('el recorte lo deciden las fechas: primera del ejercicio, última del ejercicio y primera del siguiente', () => {
  const cols = columnasDeLaVista('semana', ANIO)
  const conRecorte = cols.map((c) => ({ c, r: recorteDe(c) })).filter(({ r }) => r.desde || r.hasta)
  assert.deepEqual(conRecorte.map(({ c, r }) => [letra(c.col), r.desde && u(r.desde), r.hasta && u(r.hasta)]), [
    ['B', '2026-01-01', null], // 29/12/2025 → desde el 1/1
    ['BB', null, '2027-01-01'], // 28/12 → hasta el 31/12: el TOTAL 2026 no se lleva el 01/01/2027
    ['BD', '2027-01-01', null], // 28/12 otra vez, después del TOTAL → del 1 al 3/01
  ])
  // El mensual no recorta nada: un mes arranca el 1° y termina el 1° del siguiente.
  assert.ok(columnasDeLaVista('mes', ANIO).every((c) => !recorteDe(c).desde && !recorteDe(c).hasta))
})

test('LA CONDICIÓN QUE HACE QUE LAS DOS VISTAS NO PUEDAN DISCREPAR: partición exacta del horizonte y del ejercicio', () => {
  const { inicio, fin } = horizonteDeLaVista(ANIO)
  const ej = bordeDelEjercicio(ANIO)
  for (const meta of [grillaSemanal({ hoy: HOY, anio: ANIO, refs: REFS }).meta, grillaMeses({ anio: ANIO, refs: REFS, hoy: HOY }).meta]) {
    const p = particionExacta(meta.efectivas, inicio, fin)
    assert.ok(p.ok, `${meta.pestana}: ${p.huecos.join('; ')}`)
    assert.deepEqual([meta.cubre.inicio.getTime(), meta.cubre.fin.getTime()], [inicio.getTime(), fin.getTime()])
    // Lo que suma el TOTAL (las columnas a su izquierda) es EXACTAMENTE el ejercicio.
    const q = particionExacta(meta.efectivas.slice(0, meta.cab.nTotal), ej.inicio, ej.fin)
    assert.ok(q.ok, `${meta.pestana} · TOTAL: ${q.huecos.join('; ')}`)
  }
  // Sin recortar, la partición NO es exacta: es el defecto, escrito como test.
  assert.equal(particionExacta(ventanas('semana', { anio: ANIO }), inicio, fin).ok, false)
})

test('la expresión sólo se envuelve donde hay recorte, y con DATE en el locale del archivo', () => {
  const v = expresionVentana('BB$7', 'semana')
  assert.deepEqual(expresionAcotada(v, {}), v, 'una columna del medio no se toca')
  assert.equal(expresionAcotada(v, { hasta: new Date(Date.UTC(2027, 0, 1)) }).hasta, 'MIN(BB$7+7;DATE(2027;1;1))')
  assert.equal(expresionAcotada(v, { desde: new Date(Date.UTC(2026, 0, 1)) }).desde, 'MAX(BB$7;DATE(2026;1;1))')
  // El separador es `;` (es_AR). Con `,` la fórmula entra como texto y la columna deja de sumar.
  assert.ok(!expresionAcotada(v, { hasta: new Date(Date.UTC(2027, 0, 1)) }).hasta.includes(','))
})

// ══════════════════════════════════════════════════════════════════════════════════════════════════
// LO QUE SE VE EN LA PESTAÑA — sobre la grilla real, no sobre la función suelta
// ══════════════════════════════════════════════════════════════════════════════════════════════════

const grillaDe2026 = () => grillaSemanal({ hoy: HOY, anio: ANIO, refs: REFS })

test('EL TOTAL 2026 NO SUMA EL 01/01/2027: la última semana del ejercicio corta en el 31/12', () => {
  const { filas, meta } = grillaDe2026()
  const ultima = meta.cab.col0 + meta.cab.nTotal - 1
  const f = String(filas[meta.fila.egresoProyectado - 1][ultima])
  const cab = celda(ultima, FILA.cabecera)
  // La celda mezcla las dos formas del término: SUMIFS (`"<"&(expr)`) y el SUMPRODUCT de respaldo de
  // las devoluciones (`<expr`), que pasan de MAX_SUMIFS combinaciones. El corte vale para las dos.
  assert.ok(f.includes(`"<"&(MIN(${cab}+7;DATE(2027;1;1)))`), f)
  assert.ok(f.includes(`<MIN(${cab}+7;DATE(2027;1;1))`), f)
  assert.ok(!f.includes(`"<"&(${cab}+7)`) && !f.includes(`<${cab}+7`), 'sin el MIN, el 01/01/2027 vuelve a caer adentro del año')
  assert.ok(f.includes(`">="&(${cab})`) && f.includes(`>=${cab}`), f)
  // Y el TOTAL suma hasta esa columna, ni una más.
  const t = String(filas[meta.fila.egresoProyectado - 1][colTotal('semana', ANIO)])
  assert.equal(t, `=SUM($B$${meta.fila.egresoProyectado}:$${letra(ultima)}$${meta.fila.egresoProyectado})`)
})

test('EL 01/01/2027 SE VE DESPUÉS DEL TOTAL: la zona 2027 arranca el 01/01, rotulada 01/01, hasta el 3/01', () => {
  // El dueño (24/09/2026): «estás haciendo mal el mes de enero» — veía «28/12» a los dos lados del
  // TOTAL y leía la misma semana dos veces. La columna dice el primer día que suma.
  const { filas, meta } = grillaDe2026()
  const primera = meta.cab.siguiente[0]
  assert.equal(primera, colTotal('semana', ANIO) + 1)
  assert.equal(filas[FILA.cabecera - 1][primera], serialDeFecha(new Date(Date.UTC(2027, 0, 1))), 'rotulada 01/01, no 28/12')
  assert.equal(filas[FILA.cabecera - 1][primera + 1], serialDeFecha(new Date(Date.UTC(2027, 0, 4))))
  const f = String(filas[meta.fila.egresoProyectado - 1][primera])
  const cab = celda(primera, FILA.cabecera)
  assert.ok(f.includes(`">="&(${cab})`) && f.includes(`>=${cab})`), f)
  assert.ok(f.includes(`"<"&(MIN(${cab}+7;DATE(2027;1;4)))`) && f.includes(`<MIN(${cab}+7;DATE(2027;1;4))`),
    `sin el MIN se pisaría con la semana del 04/01: ${f.slice(0, 200)}`)
  // Ningún encabezado se repite: cada columna es un tramo distinto del calendario.
  const cabs = meta.cab.cols.map((c) => filas[FILA.cabecera - 1][c])
  assert.equal(new Set(cabs).size, cabs.length)
})

test('la primera columna no arrastra diciembre de 2025: arranca y se rotula el 01/01', () => {
  const { filas, meta } = grillaDe2026()
  assert.equal(filas[FILA.cabecera - 1][meta.cab.col0], serialDeFecha(new Date(Date.UTC(2026, 0, 1))))
  const f = String(filas[meta.fila.ingresoReal - 1][meta.cab.col0])
  const cab = celda(meta.cab.col0, FILA.cabecera)
  assert.ok(f.includes(`">="&(${cab})`) && f.includes(`"<"&(MIN(${cab}+7;DATE(2026;1;5)))`), f)
})

test('la sección POR CLIENTE se recorta igual que su columna: si no, los clientes no cuadran con el Mensual', () => {
  const { filas, meta } = grillaDe2026()
  const bloque = meta.clientes.bloques[0]
  const ultima = meta.cab.col0 + meta.cab.nTotal - 1
  assert.ok(String(filas[bloque.medidas[0].fila - 1][ultima]).includes('DATE(2027;1;1)'), 'la última del año corta en el 31/12')
  assert.ok(String(filas[bloque.medidas[0].fila - 1][meta.cab.siguiente[0]]).includes('DATE(2027;1;4)'), 'la primera de 2027 corta el 3/01')
})

test('EL PISO MIRA HASTA LA ÚLTIMA SEMANA DE ENERO, y el TOTAL no le aporta nada', () => {
  // Los sueldos de diciembre se pagan el 01/01 y las cargas el 10/01: un piso que terminara en el 31/12
  // se perdería justo la semana en que la caja más baja.
  const { filas, meta } = grillaDe2026()
  const piso = String(filas[meta.hero.valor - 1][meta.hero.slots[1]])
  const ultima = celda(meta.cab.cols[meta.cab.n - 1], meta.fila.saldoFinal)
  assert.equal(u(meta.ventanas[meta.cab.n - 1].desde), '2027-01-25')
  assert.ok(piso.startsWith('=MIN('), piso)
  assert.ok(piso.includes(`:${ultima})`), `el piso tiene que llegar hasta la última columna de tiempo: ${piso}`)
  assert.equal(String(filas[meta.fila.saldoFinal - 1][colTotal('semana', ANIO)] ?? ''), '', 'el TOTAL no tiene saldo que el MIN pueda tomar')
  // La primera semana de 2027 encadena con la última de 2026, saltando el TOTAL.
  const ini = String(filas[meta.fila.saldoInicial - 1][meta.cab.siguiente[0]])
  assert.ok(ini.includes(celda(meta.cab.col0 + meta.cab.nTotal - 1, meta.fila.saldoFinal)), ini)
  assert.equal(COL.tiempo0, 1)
})

test('EL F931 DE DICIEMBRE (10/01/2027) TIENE COLUMNA EN LAS DOS VISTAS, y está a la derecha del TOTAL', () => {
  // El caso del pedido: $15.970.972 de cargas de diciembre con fecha de pago 10/01/2027.
  const fecha = serialDeFecha(new Date(Date.UTC(2027, 0, 10)))
  for (const meta of [grillaDe2026().meta, grillaMeses({ anio: ANIO, refs: REFS, hoy: HOY }).meta]) {
    const j = meta.efectivas.map((v, i) => (serialDeFecha(v.desde) <= fecha && fecha < serialDeFecha(v.hasta) ? i : -1)).filter((i) => i >= 0)
    assert.equal(j.length, 1, `${meta.pestana}: el 10/01/2027 cae en ${j.length} columnas`)
    assert.ok(meta.cab.cols[j[0]] > meta.cab.colTotal, `${meta.pestana}: 2027 va después del TOTAL`)
  }
})
