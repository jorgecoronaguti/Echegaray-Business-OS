// LA BASE MAESTRA CRECE POR PROPUESTA — y cada prueba cuida una forma de que crezca mal.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  claveDe, mismaEscritura, agrupar, impactoDe, propuestaDe, proponerTareasMaestras,
} from './tareas-maestras-propuestas.mjs'

const a = (nombre, obraId, extra = {}) => ({
  actividadId: `${obraId}-${nombre}-${Math.random()}`, obraId, nombre, esTarea: true, ...extra,
})

test('la escritura no abre grupos: mayúsculas, acentos y plural caen en el mismo', () => {
  assert.equal(claveDe('Compactación'), claveDe('COMPACTACIONES'))
  assert.equal(claveDe('Nivelacion de terreno'), claveDe('NIVELACIÓN TERRENO'))
})

test('un typo tampoco abre un grupo propio', () => {
  // Proponer dos tareas maestras porque alguien escribió «Compactasion» metería el error de tipeo
  // adentro del dato maestro, que es donde más caro sale.
  assert.ok(mismaEscritura(claveDe('Compactacion'), claveDe('Compactasion')))
  // Pero dos tareas realmente distintas no se funden por ser cortas y parecidas.
  assert.equal(mismaEscritura(claveDe('MURO'), claveDe('MUROS')), true)
  assert.equal(mismaEscritura(claveDe('PISO'), claveDe('PILA')), false)
})

test('las filas que no son trabajo no fundan una tarea maestra', () => {
  // «GALPÓN 1» aparecía siete veces y salía propuesto como tarea: es el lugar donde se trabaja, y
  // sus filas son encabezados de frente con las fechas de sus hijas.
  const g = agrupar([
    a('GALPÓN 1', 'sf', { esTarea: false }), a('GALPÓN 1', 'sf', { esTarea: false }),
    a('GALPÓN 1', 'sf', { esTarea: false }), a('GALPÓN 1', 'sf', { esTarea: false }),
  ])
  assert.equal(g.length, 0)
})

test('dos obras alcanzan; una sola obra necesita repetición', () => {
  const dosObras = agrupar([a('Retoque de Pintura', 'sf'), a('Retoque de Pintura', 'g9')])
  assert.equal(impactoDe(dosObras[0]), 'alta')

  const unaObraPoco = agrupar([a('Recuadrar bases', 'me'), a('Recuadrar bases', 'me'), a('Recuadrar bases', 'me')])
  assert.equal(impactoDe(unaObraPoco[0]), null, 'tres veces en una obra puede ser un ítem de esa obra')

  const unaObraMucho = agrupar(Array.from({ length: 6 }, () => a('Compactación', 'sf')))
  assert.equal(impactoDe(unaObraMucho[0]), 'media')
})

test('un caso aislado nunca funda una tarea: es una observación, no una recurrencia', () => {
  const g = agrupar([a('Pintado de cordón', 'sf')])
  assert.equal(impactoDe(g[0]), null)
  assert.equal(propuestaDe(g[0]), null)
})

test('la propuesta dice qué desbloquea y en qué unidad, o que no hay unidad', () => {
  const g = agrupar([
    a('Encofrado', 'me', { hechosDeDuracion: 1, unidad: 'M2' }),
    a('Encofrado', 'sf', { hechosDeDuracion: 2, unidad: 'M2' }),
  ])
  const p = propuestaDe(g[0])
  assert.match(p.evidencia, /2 obra\(s\)/)
  assert.match(p.evidencia, /3 hecho\(s\) de duración/)
  assert.match(p.evidencia, /Se midió en M2/)
  assert.equal(p.fuente, 'xsas:tarea-maestra:ENCOFRADO')
})

test('el título no depende del orden de las filas: la misma evidencia, el mismo título', () => {
  const filas = [a('encofrado', 'me'), a('Encofrado', 'sf'), a('Encofrado', 'g9')]
  const uno = propuestaDe(agrupar(filas)[0])
  const otro = propuestaDe(agrupar([...filas].reverse())[0])
  assert.equal(uno.titulo, otro.titulo)
  assert.equal(uno.fuente, otro.fuente)
})

// ── LA ESCRITURA ─────────────────────────────────────────────────────────────────────────────

function baseFalsa(filas) {
  const escrituras = []
  return {
    escrituras,
    query: async (sql, params) => {
      if (/^\s*select id, estado from public\.backlog_autonomo/.test(sql)) {
        return { rows: filas.filter((f) => f.fuente === params[0]) }
      }
      escrituras.push({ sql: sql.trim().split(/\s+/)[0], params })
      return { rows: [] }
    },
  }
}

test('correr el ciclo cuatro veces no abre cuatro propuestas de la misma tarea', async () => {
  const grupos = agrupar([a('Encofrado', 'me'), a('Encofrado', 'sf')])
  const abierta = baseFalsa([{ id: 'x1', estado: 'abierto', fuente: 'xsas:tarea-maestra:ENCOFRADO' }])
  const r = await proponerTareasMaestras(abierta, grupos)
  assert.equal(r.nuevas, 0)
  assert.equal(r.filas[0].accion, 'refrescada')
  assert.equal(abierta.escrituras[0].sql, 'update', 'refresca la evidencia, no inserta otra')
})

test('una propuesta ya descartada por una persona NO se vuelve a abrir', async () => {
  // Descartar es una decisión. Un proceso que la revierte cada seis horas convierte la bandeja en
  // ruido y enseña a ignorarla.
  const grupos = agrupar([a('Encofrado', 'me'), a('Encofrado', 'sf')])
  const cerrada = baseFalsa([{ id: 'x1', estado: 'descartado', fuente: 'xsas:tarea-maestra:ENCOFRADO' }])
  const r = await proponerTareasMaestras(cerrada, grupos)
  assert.equal(r.propuestas, 0)
  assert.equal(r.yaDecididas, 1)
  assert.equal(cerrada.escrituras.length, 0, 'no se escribió nada')
})

test('en ensayo no escribe una sola fila', async () => {
  const grupos = agrupar([a('Encofrado', 'me'), a('Encofrado', 'sf')])
  const base = baseFalsa([])
  const r = await proponerTareasMaestras(base, grupos, { dry: true })
  assert.equal(r.nuevas, 1)
  assert.equal(base.escrituras.length, 0)
})
