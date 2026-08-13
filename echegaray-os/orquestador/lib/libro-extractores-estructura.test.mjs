// LO QUE ESTOS TESTS ATRAPAN SI ALGUIEN REVIERTE EL ARREGLO.
//
// El defecto medido el 13/08/2026: la línea "Estructura" de los dos cash flow tenía plata hasta agosto
// y NADA de septiembre a diciembre, aunque la pestaña `Estructura` ya publicaba la proyección de esos
// meses. Nadie la leía. Si `deEstructura` vuelve a devolver cero movimientos con una pestaña que sí
// proyecta, el primer test se pone rojo.
//
// El defecto SIMÉTRICO —el que introduce un arreglo apurado— es contar dos veces: emitir la proyección
// de un mes que YA tiene su factura cargada en Compras, que entra al libro por su propio camino. Hay
// un test para esa dirección también, y otro para que la compra de equipos no se proyecte como si
// fuera un gasto que se repite solo.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  deEstructura, diaTipicoDeEstructura, ubicarCuadro, RUBRO_ESTRUCTURA, PESTANA_ESTRUCTURA,
  SUB_NO_PROYECTABLE, RUBROS_DEL_CUADRO,
} from './libro-extractores-estructura.mjs'
import { serialDe, fechaDeSerial } from './libro-extractores-fechas.mjs'
import { NOMBRES_COMPRAS } from './libro-extractores-compras.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))

const HOY = serialDe(2026, 8, 13) // el día del reclamo del dueño
const ANIO = 2026

// ── LA PESTAÑA DE MENTIRA, CON LA GEOMETRÍA REAL ──────────────────────────────────────────────────
// Cuatro filas de título/subtítulo/blancos/sección arriba, encabezado en la quinta, y el bloque
// auxiliar corrido a la derecha: es la forma que escribe `estructura-pestana.mjs`.
const C_MES0 = 1
const C_AUX0 = 18

/**
 * @param {Array<{rubro:string, visible:number[], real:number[]}>} rubros doce meses cada arreglo
 */
function pestanaFixture(rubros, { anio = ANIO } = {}) {
  const ancho = C_AUX0 + 12
  const vacia = () => Array(ancho).fill('')
  const filas = [vacia(), vacia(), vacia(), vacia(), vacia()]
  const cab = vacia()
  cab[0] = 'Rubro'
  for (let m = 0; m < 12; m++) cab[C_MES0 + m] = serialDe(anio, m + 1, 1)
  cab[C_AUX0] = 'AUXILIAR — el real de cada mes. De acá sale la proyección. No borrar ni mostrar.'
  filas.push(cab)
  for (const r of rubros) {
    const f = vacia()
    f[0] = r.rubro
    for (let m = 0; m < 12; m++) {
      f[C_MES0 + m] = r.visible[m] ?? 0
      f[C_AUX0 + m] = r.real[m] ?? 0
    }
    filas.push(f)
  }
  const tot = vacia(); tot[0] = 'TOTAL ESTRUCTURA'
  filas.push(tot)
  return filas
}

/** Doce meses: real hasta julio, proyección de agosto a diciembre (lo que hace la pestaña real). */
const serie = (real, proy) => ({
  visible: [...Array(12)].map((_, m) => (m < 7 ? real : proy)),
  real: [...Array(12)].map((_, m) => (m < 7 ? real : 0)),
})

// ── COMPRAS DE MENTIRA, sólo lo que `diaTipicoDeEstructura` mira ───────────────────────────────────
function comprasFixture(dias) {
  const enc = []
  Object.values(NOMBRES_COMPRAS).forEach((n, i) => { enc[i] = n })
  const iRubro = enc.indexOf(NOMBRES_COMPRAS.rubro)
  const iFecha = enc.indexOf(NOMBRES_COMPRAS.fechaCaja)
  const filas = [[], [], enc]
  for (const d of dias) {
    const f = []
    f[iRubro] = RUBRO_ESTRUCTURA
    f[iFecha] = serialDe(2026, 5, d)
    filas.push(f)
  }
  return filas
}

// ══════════════════════════════════════════════════════════════════════════════════════════════════

test('EL DEFECTO: la proyección de ago-dic llega al libro, con su rubro y su estado', () => {
  // `serie` deja agosto SIN real, así que la celda visible de agosto muestra su proyección y ese mes
  // también entra: es plata que va a salir antes de fin de mes.
  const filas = pestanaFixture([{ rubro: 'Combustible', ...serie(300_000, 280_000) }])
  const { movimientos, resumen } = deEstructura(filas, HOY, { diaTipico: 10 })

  assert.equal(movimientos.length, 5, 'faltan meses futuros: el cuadro vuelve a decir que la empresa '
    + 'deja de tener gastos de estructura en septiembre')
  assert.equal(resumen.total, 5 * 280_000)
  const meses = movimientos.map((m) => fechaDeSerial(m.fecha).getUTCMonth() + 1)
  assert.deepEqual(meses.sort((a, b) => a - b), [8, 9, 10, 11, 12])
  for (const m of movimientos) {
    assert.equal(m.rubro, RUBRO_ESTRUCTURA, 'tiene que caer en la línea Estructura que ya existe')
    assert.equal(m.estado, 'PROYECTADO', 'una proyección jamás se presenta como hecho')
    assert.equal(m.signo, -1)
    assert.equal(m.origen.pestana, PESTANA_ESTRUCTURA)
  }
  // El día sale del día típico medido, no de una convención… salvo en el mes en curso, donde el 10 ya
  // pasó (hoy es 13) y la provisión se corre a MAÑANA: con fecha vencida diría VENCIDO de algo que
  // quizá ni facturaron todavía.
  const dias = movimientos.map((m) => [fechaDeSerial(m.fecha).getUTCMonth() + 1, fechaDeSerial(m.fecha).getUTCDate()])
  assert.deepEqual(dias.sort((a, b) => a[0] - b[0]), [[8, 14], [9, 10], [10, 10], [11, 10], [12, 10]])
})

test('NO CUENTA DOS VECES: el mes que ya tiene su factura cargada no se proyecta', () => {
  // La pestaña muestra "el real si lo hay": en octubre entró una factura de $250.000 y la celda
  // visible pasó a valer eso. La provisión MAX(0; visible − real) tiene que dar $0 — esa plata ya
  // viaja al libro por su fila de Compras.
  const s = serie(300_000, 280_000)
  s.visible[9] = 250_000
  s.real[9] = 250_000
  const { movimientos } = deEstructura(pestanaFixture([{ rubro: 'Combustible', ...s }]), HOY, { diaTipico: 10 })
  const octubre = movimientos.filter((m) => fechaDeSerial(m.fecha).getUTCMonth() + 1 === 10)
  assert.equal(octubre.length, 0, 'octubre ya está en Compras: emitirlo acá lo cuenta dos veces')
  assert.equal(movimientos.length, 4, 'agosto, septiembre, noviembre y diciembre siguen saliendo')
})

test('LA COMPRA DE EQUIPOS NO SE PROYECTA — y el monto excluido se informa, no se esconde', () => {
  const filas = pestanaFixture([
    { rubro: SUB_NO_PROYECTABLE, ...serie(4_000_000, 4_000_000) },
    { rubro: 'Combustible', ...serie(300_000, 280_000) },
  ])
  const { movimientos, resumen } = deEstructura(filas, HOY, { diaTipico: 10 })
  assert.ok(movimientos.every((m) => !m.concepto.includes(SUB_NO_PROYECTABLE)),
    'una compra de rodados no es una necesidad de caja que se repite sola: proyectarla mete la decisión '
    + 'adentro del flujo con el que se decide')
  assert.equal(resumen.excluido, 5 * 4_000_000, 'lo excluido se cuenta y se declara')
  assert.equal(resumen.total, 5 * 280_000)
})

test('CADA MES ES UN MOVIMIENTO DISTINTO: la clave de origen lleva el mes adentro', () => {
  // Los doce meses de un sub-rubro viven en la MISMA fila física. Sin el mes en `origen.fila`, la
  // deduplicación del libro colapsaría los cuatro en uno y quedaría un mes de estructura en el año.
  const { movimientos } = deEstructura(
    pestanaFixture([{ rubro: 'Combustible', ...serie(300_000, 280_000) }]), HOY, { diaTipico: 10 })
  const claves = new Set(movimientos.map((m) => m.clave))
  assert.equal(claves.size, movimientos.length, 'dos meses comparten clave: uno de los dos desaparece')
})

test('FALLA CERRADO: sin cuadro reconocible o sin día típico, no proyecta y lo dice', () => {
  const avisos = []
  const aviso = (m) => avisos.push(m)

  const sinCuadro = deEstructura([['otra cosa'], ['nada']], HOY, { diaTipico: 10, aviso })
  assert.equal(sinCuadro.movimientos.length, 0)
  assert.equal(avisos.length, 1, 'un cuadro irreconocible se declara, no se asume vacío en silencio')

  const filas = pestanaFixture([{ rubro: 'Combustible', ...serie(300_000, 280_000) }])
  const sinDia = deEstructura(filas, HOY, { diaTipico: null, aviso })
  assert.equal(sinDia.movimientos.length, 0, 'sin día típico la plata caería en una semana inventada')
  assert.equal(avisos.length, 2)
})

test('LA GEOMETRÍA SE RESUELVE POR RÓTULO: el cuadro corrido dos filas sigue saliendo', () => {
  const filas = pestanaFixture([{ rubro: 'Combustible', ...serie(300_000, 280_000) }])
  const corrido = [[], [], ...filas]
  const g = ubicarCuadro(corrido)
  assert.ok(g, 'el cuadro se ubica por "Rubro" en la columna A, no por un índice guardado')
  assert.equal(g.filas.length, 1)
  assert.equal(deEstructura(corrido, HOY, { diaTipico: 10 }).movimientos.length, 5)
})

test('una celda en error deja SU mes sin proyectar y lo declara — nunca se asume $0', () => {
  const s = serie(300_000, 280_000)
  s.visible[10] = '#REF!'
  const avisos = []
  const { movimientos } = deEstructura(pestanaFixture([{ rubro: 'Combustible', ...s }]), HOY,
    { diaTipico: 10, aviso: (m) => avisos.push(m) })
  assert.equal(movimientos.length, 4)
  assert.equal(avisos.length, 1)
  assert.match(avisos[0], /#REF!/)
})

test('el día típico es la MEDIANA de la fecha de caja real, acotada al 28', () => {
  assert.equal(diaTipicoDeEstructura(comprasFixture([2, 10, 28])), 10)
  assert.equal(diaTipicoDeEstructura(comprasFixture([1, 5])), 3)
  assert.equal(diaTipicoDeEstructura(comprasFixture([30, 31])), 28, 'el 31 no existe en todos los meses')
  assert.equal(diaTipicoDeEstructura(comprasFixture([])), null, 'sin filas del rubro no se inventa un día')
})

test('los rótulos que el extractor reconoce son los sub-rubros declarados, no una lista propia', () => {
  // Una lista copiada acá se desincroniza el día que se agregue un sub-rubro y ese gasto se cae del
  // cuadro sin un solo error: el bucle corta en el primer rótulo desconocido.
  const fuente = fs.readFileSync(path.join(AQUI, 'libro-extractores-estructura.mjs'), 'utf8')
  assert.match(fuente, /from '\.\/sub-rubro-estructura\.mjs'/)
  assert.ok(RUBROS_DEL_CUADRO.includes('Combustible') && RUBROS_DEL_CUADRO.includes('Otros'))
})

test('EL LIBRO LEE LA PESTAÑA ESTRUCTURA: si el generador deja de leerla, la línea vuelve a cortarse', () => {
  const fuente = fs.readFileSync(path.join(AQUI, '../scripts/libro-movimientos-pestana.mjs'), 'utf8')
  assert.match(fuente, /deEstructura\(/, 'el generador dejó de correr el extractor de estructura')
  assert.match(fuente, /Estructura: gastosEstructura\.movimientos/, 'la fuente Estructura salió del libro')
  assert.match(fuente, /A1:AD/, 'sin el bloque auxiliar (S..AD) la provisión no se puede netear contra el real')
})
