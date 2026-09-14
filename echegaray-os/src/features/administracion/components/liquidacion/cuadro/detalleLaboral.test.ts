// EL DETALLE LABORAL DEVUELVE AL PANEL LO QUE SE FUE CON «HORAS» (dueño, 14/09/2026: «no quitar»).
//
// El armado se ejecuta (`detalleLaboral.ts` es puro). El componente es JSX y `node --test` no lo monta:
// se prueba sobre la fuente sin comentarios que los cuatro bloques estén y lean el dato que les toca.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { detalleLaboralDe, detallesLaboralesDeLaQuincena } from '../../../services/detalleLaboral.ts'
import type { DatosDePersona } from '../../../services/grillaHorasQuincenaService.ts'
import type { FilaDeGrilla } from '../../../services/grillaHorasQuincena.ts'

const sinComentarios = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const COMPONENTE = sinComentarios(readFileSync(new URL('./DetalleLaboralDeLaPersona.tsx', import.meta.url), 'utf8'))

const persona: DatosDePersona = {
  id: 'p1', nombre: 'Zogbe Fabian', numeroLegajo: '12', encabezado: '', valorHora: 3650, convenio: null,
  legajo: [{ rotulo: 'CUIL', valor: '20-1', mono: true }],
  laboral: [{ rotulo: 'Categoría', valor: 'Oficial' }],
  asignacion: [{ rotulo: 'Obra', valor: null }],
  mesesHH: [{ rotulo: 'sep', clave: '2026-09', horas: 80, actual: true }],
  registrosDeLaQuincena: [], adelanto: null,
}
const fila: FilaDeGrilla = {
  personaId: 'p1', nombre: 'Zogbe Fabian', celdas: [], cargadas: 40, esperadas: 97, estado: 'sin-cargar',
  diasSinMotivo: 0, diasSinCargar: 2, horasDeLicencia: 0, esJefe: false,
}

test('EL DETALLE TRAE LOS CUATRO BLOQUES CON EL DATO DE SU FUENTE', () => {
  const d = detalleLaboralDe({ persona, fila, cobra: 146000, multiplicador: 1.5 })
  assert.equal(d.cargadas, 40)
  assert.equal(d.esperadas, 97)
  assert.equal(d.estado, 'sin-cargar')
  assert.equal(d.bolsillo, 146000, 'el bolsillo es el cobra de la línea cuando existe')
  assert.equal(d.costoCargado, 219000)
  assert.deepEqual(d.laboral, persona.laboral)
  assert.deepEqual(d.asignacion, persona.asignacion)
  assert.deepEqual(d.legajo, persona.legajo)
  assert.deepEqual(d.mesesHH, persona.mesesHH)
})

test('SIN LÍNEA EL BOLSILLO ES HORAS × $/H, Y SIN ALÍCUOTAS EL COSTO ES «SIN BASE», NO CERO', () => {
  const d = detalleLaboralDe({ persona, fila, cobra: undefined, multiplicador: null })
  assert.equal(d.bolsillo, 146000)
  assert.equal(d.costoCargado, null)
  const sinFila = detalleLaboralDe({ persona: { ...persona, valorHora: null }, multiplicador: 1.5 })
  assert.equal(sinFila.esperadas, null)
  assert.equal(sinFila.bolsillo, null)
})

test('HAY UN DETALLE POR PERSONA DEL PADRÓN, CON EL COBRA DE SU LÍNEA', () => {
  const r = detallesLaboralesDeLaQuincena({
    datos: { porPersona: { p1: persona } }, grilla: [fila],
    liquidacion: { cuadros: [{ lineas: [{ personaId: 'p1', cobra: 100 }] }] },
  }, 2)
  assert.deepEqual(Object.keys(r), ['p1'])
  assert.equal(r.p1.costoCargado, 200)
})

test('EL COMPONENTE DIBUJA LOS CUATRO BLOQUES', () => {
  const bloques: [string, RegExp][] = [
    ['detalle-quincena', /detalle\.esperadas[\s\S]*?ESTADOS\[detalle\.estado\]|ESTADOS\[detalle\.estado\][\s\S]*?detalle\.esperadas/],
    ['detalle-costo', /detalle\.costoCargado/],
    ['detalle-laboral', /campos=\{detalle\.laboral\}[\s\S]*campos=\{detalle\.asignacion\}/],
    ['detalle-hh-mes', /detalle\.mesesHH\.map\(/],
  ]
  for (const [testid, dato] of bloques) {
    assert.ok(COMPONENTE.includes(`data-testid="${testid}"`), `falta el bloque ${testid}`)
    assert.match(COMPONENTE, dato, `${testid} tiene que leer su dato`)
  }
})
