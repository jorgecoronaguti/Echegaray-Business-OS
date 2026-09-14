// HORAS Y LIQUIDACIÓN MUESTRAN LAS MISMAS PERSONAS EN UNA QUINCENA (QA del plantel, 14/09/2026).
//
// La solapa Horas armaba sus filas desde las asignaciones vigentes (incluidas las reconstruidas) y los
// registros, sin pasar por `plantelDeLaQuincena`. Quincena 16/06: Liquidación 22 y Horas 25, con Castillo
// (alta 01/09/26) y Ochoa (alta 26/08/26) en blanco. Quincena 01/03: 20 contra 25.
//
// INVARIANTE: el conjunto de personas de Horas es el de Liquidación.
// MUTACIÓN QUE LO PONE ROJO: volver a armar las filas desde las asignaciones.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarQuincenaPorObra } from './quincenaPorObra.ts'
import { plantelDeLaQuincena, marcaDeBaja } from './liquidacionPlantelActivo.ts'
import { quincenaDe, diasDeLaQuincenaSinDomingos } from './quincena.ts'

const q = quincenaDe('2026-03-01')
const PERSONAS = [
  { id: 'aguero', nombre: 'AGUERO', enLaEmpresa: true, fechaIngreso: '2025-05-26', fechaEgreso: null },
  // Ingresó en agosto, pero tiene una asignación reconstruida que cubre marzo.
  { id: 'castillo', nombre: 'CASTILLO', enLaEmpresa: true, fechaIngreso: '2026-09-01', fechaEgreso: null },
  // Se fue en junio; en marzo tenía horas.
  { id: 'videla', nombre: 'VIDELA', enLaEmpresa: false, fechaIngreso: '2025-01-10', fechaEgreso: '2026-06-17' },
  // Está en la empresa, sin asignación y sin horas esa quincena.
  { id: 'maldonado', nombre: 'MALDONADO', enLaEmpresa: true, fechaIngreso: '2025-05-26', fechaEgreso: null },
]
const REGISTROS = [
  { persona_id: 'aguero', obra_id: 'obra', fecha: '2026-03-02', horas: 9, tipo_hora: 'normal' },
  { persona_id: 'videla', obra_id: 'obra', fecha: '2026-03-03', horas: 8, tipo_hora: 'normal' },
]
const ASIGNACIONES = [
  { persona_id: 'aguero', nombre: 'AGUERO', nota: null, obra_id: 'obra', desde: '2026-01-01', hasta: null },
  { persona_id: 'castillo', nombre: 'CASTILLO', nota: null, obra_id: 'obra', desde: '2026-01-01', hasta: null },
]

test('INVARIANTE: las personas de Horas son las de Liquidación (el plantel de la quincena)', () => {
  const vacio = new Set<string>()
  const plantel = plantelDeLaQuincena(PERSONAS, q, {
    conHoras: new Set(REGISTROS.map((r) => r.persona_id)), conLinea: vacio, conRecibo: vacio, conJornales: vacio,
  })
  const liquidacion = new Set(plantel.activas.map((p) => p.id))
  const filas = armarQuincenaPorObra({
    asignaciones: ASIGNACIONES, registros: REGISTROS,
    obras: { obra: { id: 'obra', nombre: 'OBRA', cliente: null, estado: 'activa' } },
    dias: diasDeLaQuincenaSinDomingos(q), hoy: '2026-09-14',
    personas: Object.fromEntries(plantel.activas.map((p) => [p.id, { nombre: p.nombre, nota: marcaDeBaja(p)?.texto ?? null }])),
    plantel: liquidacion,
  })
  assert.deepEqual(new Set(filas.map((f) => f.clave)), liquidacion,
    'MUTACIÓN: armar las filas desde las asignaciones mete a Castillo y deja afuera a Maldonado')
  assert.ok(!filas.some((f) => f.clave === 'castillo'), 'una asignación de quien ingresó después no crea fila')
  assert.equal(filas.find((f) => f.clave === 'videla')?.persona.nota, 'baja 17/06', 'la baja lleva la marca de Liquidación')
})

test('SIN PLANTEL (llamador anterior) LAS FILAS SIGUEN SALIENDO DE ASIGNACIONES Y REGISTROS', () => {
  const filas = armarQuincenaPorObra({
    asignaciones: ASIGNACIONES, registros: REGISTROS,
    obras: { obra: { id: 'obra', nombre: 'OBRA', cliente: null, estado: 'activa' } },
    dias: diasDeLaQuincenaSinDomingos(q), hoy: '2026-09-14',
    personas: { videla: { nombre: 'VIDELA', nota: null } },
  })
  assert.deepEqual(filas.map((f) => f.clave).sort(), ['aguero', 'castillo', 'videla'])
})
