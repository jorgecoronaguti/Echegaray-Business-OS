import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { manoObraPropiaDe } from './manoObraPropia.ts'

// ═══ QUÉ DEFECTO ATRAPA ═══
//
// Quattropani en la página Obras: «Sin una hora adentro» con $0 de mano de obra, porque la solapa leía
// `costo_real_mano_de_obra` (compras con área «personas»). La línea de mano de obra propia tiene que
// salir de `costo_de_obras_a_la_fecha`, la misma función que la ficha del CRM.

const DIR = dirname(fileURLToPath(import.meta.url))

test('la fila de la obra se lee con importe, estimado y horas sin dato', () => {
  const m = manoObraPropiaDe([
    { obra_id: 'otra', mano_obra: 1 },
    { obra_id: 'quattropani', mano_obra: '3572782.1', mano_obra_estimada: '3572782.1', horas_sin_tarifa: null, puede_ver_tarifas: true },
  ], 'quattropani')
  assert.deepEqual(m, { importe: 3572782.1, estimado: 3572782.1, horasSinDato: 0, puedeVer: true })
})

test('sin permiso no se dibuja; sin fila es «—»; sin respuesta es «no pude leer»', () => {
  assert.equal(manoObraPropiaDe([{ obra_id: 'q', mano_obra: null, puede_ver_tarifas: false }], 'q')?.puedeVer, false)
  assert.equal(manoObraPropiaDe([], 'q')?.importe, null)
  assert.equal(manoObraPropiaDe(null, 'q'), null)
})

test('el panel económico pide la definición única y la solapa la dibuja', () => {
  const srv = readFileSync(join(DIR, 'obrasService.ts'), 'utf8')
  const cuerpo = srv.slice(srv.indexOf('export async function getEconomiaObra'))
  assert.match(cuerpo.slice(0, 1200), /rpc\('costo_de_obras_a_la_fecha', \{ p_obras: \[obraId\] \}\)/)
  const tab = readFileSync(join(DIR, '../components/TabEconomia.tsx'), 'utf8')
  assert.match(tab, /data-testid="economia-mano-obra-propia"/)
  assert.match(tab, /e\.mano_obra_propia/)
})
