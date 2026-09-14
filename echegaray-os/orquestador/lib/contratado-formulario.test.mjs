// EL CONTRATADO DE LAS OBRAS CERRADAS ES EL DEL FORMULARIO — decisión del dueño, 14/09/2026.
//
// «Sí, tomar el del formulario.» Hasta acá (H1, 10/09/2026) una obra cerrada sin fila en OBRAS se veía
// «sin precio» en la ficha, la cartera y la cuenta corriente, aunque su formulario tuviera el monto (LE
// Oficina $246,1 M, SF Galpones $204,4 M, Galpón 9 $49,7 M). QUÉ DEFECTOS ATRAPA: que el formulario
// vuelva a pisar el precio de OBRAS o del contrato, que entre una obra activa o fusionada, o que la vista
// pierda el portero que la deja correr como su dueño.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const SQL = readFileSync(join(DIR, '../../supabase/migrations/20260915T0830_contratado_formulario_obras_cerradas.sql'), 'utf8')
const vista = SQL.slice(SQL.indexOf('create or replace view public.obra_economia_cartera'), SQL.indexOf('-- FIN DE LA VISTA'))
const formulario = vista.slice(vista.indexOf('-- RAMA FORMULARIO'))

test('la vista conserva la rama de OBRAS tal cual y corre como su dueño CON portero', () => {
  assert.match(vista, /with \(security_invoker = false\)/)
  assert.match(vista, /contratado_valuado\(e\.contratado, e\.contratado_usd\)/)
  const porteros = vista.match(/where \(\(select public\.ve_economia\(\)\) or \(select auth\.uid\(\)\) is null\)/gi) ?? []
  assert.equal(porteros.length, 2, 'cada rama lleva su portero')
})

test('el formulario entra SÓLO para obras cerradas, no fusionadas, sin OBRAS y sin contrato desglosado', () => {
  assert.ok(formulario.length > 0, 'falta la rama del formulario')
  assert.match(formulario, /'formulario'::text/)
  assert.match(formulario, /oc\.estado = 'cerrada'/)
  assert.match(formulario, /oc\.fusionada_en is null/)
  assert.match(formulario, /oc\.monto_contratado is not null/)
  assert.match(formulario, /not exists \(select 1 from public\.obra_economia_sheet s where s\.obra_canonica_id = oc\.id\)/)
  assert.match(formulario, /not exists \(select 1 from public\.obra_contrato k where k\.obra_id = oc\.id\)/)
  assert.match(formulario, /when public\.ve_economia\(\) or auth\.uid\(\) is null then oc\.monto_contratado/)
})
