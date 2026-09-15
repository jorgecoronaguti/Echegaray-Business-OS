import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { filasDeCosto, lineasDeCostoObra } from './costoObraQuincena.ts'

// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1 · QUE UN FALTA_DATO SUME. Una persona sin tarifa no entra al costo de la obra: se nombra.
//  2 · QUE ESTRUCTURA SE MEZCLE CON LAS OBRAS. Va aparte, al final.
//  3 · QUE LA SOLAPA VUELVA A CALCULAR SU PROPIO NÚMERO con el multiplicador promedio.
//  4 · QUE CERRAR LA QUINCENA NO SELLE EL COSTO POR OBRA.

const DIR = dirname(fileURLToPath(import.meta.url))

const FILAS = filasDeCosto([
  { obra_canonica_id: 'quattropani', persona_id: 'reta', horas: '82', costo_blanco: '397782', costo_negro: '242884', costo_total: '640666', estado: 'estimado', origen: 'x', sellado_en: null },
  { obra_canonica_id: 'quattropani', persona_id: 'jefe', horas: '89', costo_blanco: '1246545.43', costo_negro: '236858.44', costo_total: '1483403.87', estado: 'real', origen: 'x', sellado_en: null },
  { obra_canonica_id: 'quattropani', persona_id: 'aguero', horas: '60', costo_blanco: '400000', costo_negro: null, costo_total: null, estado: 'falta_dato', origen: 'negro: sin tarifa (FALTA_DATO)', sellado_en: null },
  { obra_canonica_id: null, persona_id: 'avila', horas: '0', costo_blanco: '225000', costo_negro: '0', costo_total: '225000', estado: 'real', origen: 'x', sellado_en: null },
  { obra_canonica_id: 'x', persona_id: 'y', horas: '1', estado: 'inventado', origen: '' },
])

test('las filas se leen con sus números y un estado desconocido se descarta', () => {
  assert.equal(FILAS.length, 4)
  assert.equal(FILAS[0].total, 640666)
  assert.equal(FILAS[2].total, null)
})

test('por obra: suma lo valorizado, nombra al FALTA_DATO y deja Estructura al final', () => {
  const l = lineasDeCostoObra(FILAS, new Map([['quattropani', 'Quattropani']]), new Map([['aguero', 'AGUERO']]),
    new Map([['quattropani', 10_000_000]]))
  assert.deepEqual(l.map((x) => x.obraId), ['quattropani', null])
  const q = l[0]
  assert.equal(q.rotulo, 'Quattropani')
  assert.equal(q.horas, 231)
  assert.equal(q.gente, 3)
  assert.ok(Math.abs((q.costo ?? 0) - (640666 + 1483403.87)) < 0.01, 'el FALTA_DATO no suma')
  assert.equal(q.estimado, 640666)
  assert.deepEqual(q.sinDato.map((s) => [s.nombre, s.horas]), [['AGUERO', 60]])
  assert.ok(q.consumo != null && Math.abs(q.consumo - 21.24) < 0.01)
  assert.equal(l[1].rotulo, 'Estructura – Administración')
  assert.equal(l[1].presupuesto, null)
})

test('ESTRUCTURA se abre en Administración y Taller, y ninguna de las dos es una obra', () => {
  const filas = filasDeCosto([
    { obra_canonica_id: 'quattropani', persona_id: 'reta', horas: '9', costo_total: '100', costo_blanco: '60', costo_negro: '40', estado: 'real', destino: 'obra', origen: 'x' },
    { obra_canonica_id: null, persona_id: 'jefe', horas: '0', costo_total: '900', costo_blanco: '500', costo_negro: '400', estado: 'real', destino: 'ES-ADM', origen: 'x' },
    { obra_canonica_id: null, persona_id: 'mecanico', horas: '18', costo_total: '300', costo_blanco: '200', costo_negro: '100', estado: 'real', destino: 'ES-TAL', origen: 'x' },
  ])
  const l = lineasDeCostoObra(filas, new Map(), new Map(), new Map())
  assert.deepEqual(l.map((x) => [x.obraId, x.destino, x.rotulo, x.costo]), [
    ['quattropani', 'obra', 'quattropani', 100],
    [null, 'ES-ADM', 'Estructura – Administración', 900],
    [null, 'ES-TAL', 'Estructura – Taller', 300],
  ])
})

test('una obra con sólo FALTA_DATO no publica costo: null, nunca 0', () => {
  const l = lineasDeCostoObra([FILAS[2]], new Map(), new Map(), new Map())
  assert.equal(l[0].costo, null)
  assert.equal(l[0].consumo, null)
})

test('la solapa lee la definición única y no el multiplicador promedio', () => {
  const src = readFileSync(join(DIR, '../components/liquidacion/solapas/costo-obra.tsx'), 'utf8')
  assert.ok(src.includes('getCostoObraQuincena'), 'la solapa no lee costo_mo_quincena')
  assert.ok(!/multiplicadorDeCosto|getTarifasDeCosto|getHorasPorObra/.test(src), 'volvió la cuenta propia con multiplicador')
})

test('cerrar la quincena sella el costo por obra, después de marcar las cabeceras', () => {
  const src = readFileSync(join(DIR, 'liquidacionCierreActions.ts'), 'utf8')
  const cuerpo = src.slice(src.indexOf('export async function cerrarQuincenaAction'))
  const marca = cuerpo.indexOf('marcarCerrada(supabase')
  const sello = cuerpo.indexOf('sellarCostoPorObra(q.desde)')
  assert.ok(marca > 0 && sello > marca, 'el sellado del costo por obra no corre al cerrar')
  assert.match(src, /rpc\('sellar_costo_obra_quincena', \{ p_desde: desde \}\)/)
})
