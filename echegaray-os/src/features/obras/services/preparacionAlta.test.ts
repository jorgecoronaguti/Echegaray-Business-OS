import test from 'node:test'
import assert from 'node:assert/strict'
import { preparacionDeObra, type InsumosPreparacion } from './preparacion.ts'
import { preparacionDelAlta } from './preparacionAlta.ts'

const ins = (o: Partial<InsumosPreparacion> = {}): InsumosPreparacion => ({
  obraId: 'qp', jefeObra: 'D. Olivera', montoContratado: null, inicioPlan: '2026-10-06', finPlan: null, driveCarpetaId: null,
  actividades: [], personasAsignadas: 0, verContrato: true, ...o,
})

test('02b: las siete filas del diseño, en el orden de los pasos, con el faltante corto', () => {
  const i = ins()
  const l = preparacionDelAlta(i, preparacionDeObra(i), 'Messinas')
  assert.deepEqual(l.map((x) => [x.titulo, x.listo, x.detalle]), [
    ['Cliente', true, 'Messinas'], ['Responsable', true, 'D. Olivera'], ['Fechas', false, 'sin fecha de fin'],
    ['Contrato', false, 'monto sin cargar'], ['Drive', false, 'carpeta sin vincular'], ['Equipo', false, 'nadie asignado'],
    ['Cronograma', false, '0 actividades'],
  ])
  assert.equal(l[2].href, '/obras/nueva?obra=qp&paso=fechas')
})

test('02b: quien no ve el contrato no tiene esa fila; el cronograma cuenta las vivas', () => {
  const i = ins({ verContrato: false, finPlan: '2026-12-30', actividades: [
    { archivada: false, inicio_plan: null, fin_plan: null, inicio_base: null, fin_base: null, responsable_id: null, hh_plan: null },
    { archivada: true, inicio_plan: null, fin_plan: null, inicio_base: null, fin_base: null, responsable_id: null, hh_plan: null },
  ] })
  const l = preparacionDelAlta(i, preparacionDeObra(i), null)
  assert.ok(!l.some((x) => x.clave === 'contrato'))
  assert.equal(l.find((x) => x.clave === 'fechas')!.detalle, '06/10 → 30/12')
  assert.equal(l.find((x) => x.clave === 'cronograma')!.detalle, '1 actividad')
  assert.equal(l.find((x) => x.clave === 'cliente')!.detalle, 'sin cliente')
})
