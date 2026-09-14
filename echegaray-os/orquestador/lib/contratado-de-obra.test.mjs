// EL CONTRATADO DE UNA OBRA ES UNO SOLO — la página Obras lee la base del CRM (14/09/2026).
//
// «hay obras que no están reflejando el monto cotizado» (dueño). `obra_panel.monto_contratado` y
// `obra_economia.venta_contratada` salían de `contratado_de_obra()` = el campo del formulario, y las
// obras activas —cuyo precio vive en OBRAS (`obra_economia_cartera`)— se veían vacías en Obras mientras
// el CRM las mostraba. QUÉ DEFECTOS ATRAPA: que la función vuelva a leer sólo el formulario, que el orden
// de las fuentes se invierta (el formulario le ganaría al contrato), o que se pierda el portero.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = dirname(fileURLToPath(import.meta.url))
const SQL = readFileSync(join(DIR, '../../supabase/migrations/20260915T0750_contratado_de_obra_unico.sql'), 'utf8')

const cuerpo = (nombre) => {
  const i = SQL.indexOf(`FUNCTION public.${nombre}(`)
  assert.ok(i >= 0, `la migración no define ${nombre}`)
  return SQL.slice(i, SQL.indexOf('$function$;', i))
}

test('contratado_de_obra: contrato desglosado, después OBRAS, y el formulario sólo como último respaldo', () => {
  const c = cuerpo('contratado_de_obra')
  const contrato = c.indexOf('e.contrato_total > 0')
  const obras = c.indexOf('e.contratado')
  const formulario = c.indexOf('oc.monto_contratado')
  assert.ok(contrato > 0 && obras > contrato && formulario > obras, 'el orden de las fuentes no es contrato → OBRAS → formulario')
  assert.match(c, /from public\.obra_economia_cartera e/)
})

test('el portero no se pierde y la función sigue siendo SECURITY DEFINER', () => {
  const c = cuerpo('contratado_de_obra')
  assert.match(c, /public\.ve_economia\(\) or auth\.uid\(\) is null/)
  assert.match(c, /SECURITY DEFINER/i)
})

test('la fuente se publica: contrato · obras · suma-viva · formulario', () => {
  const c = cuerpo('contratado_de_obra_fuente')
  for (const f of ["'contrato'", "'formulario'", 'e.origen']) assert.ok(c.includes(f), `falta la fuente ${f}`)
})
