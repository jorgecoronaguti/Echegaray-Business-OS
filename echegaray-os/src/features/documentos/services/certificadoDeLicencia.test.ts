// LO QUE EL CERTIFICADO MÉDICO TIENE QUE CONTESTAR, Y LO QUE NO PUEDE INVENTAR.
//
// Si se revierte el cruce con `asistencia_dia`, «cubre N días» pasaría a contar días calendario —o
// vacaciones— y la ficha diría que un papel respalda lo que nadie declaró.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  MOTIVOS_CON_CERTIFICADO, certificadoDelDia, certificadosPorPersonaYDia, diasCubiertos, diasEntre,
  fraseDeCobertura, pideCertificado, revisarRango,
} from './certificadoDeLicencia.ts'
import { CATALOGO } from '../../../../orquestador/lib/asistencia-motivos.mjs'

const lic = (fecha: string, motivo: string | null, estado = 'licencia') => ({ fecha, estado, motivo })

test('cubre sólo los días de LICENCIA por un motivo médico dentro del rango', () => {
  const declarados = [
    lic('2026-09-07', 'enfermedad'),          // antes del rango
    lic('2026-09-08', 'enfermedad'),
    lic('2026-09-09', 'accidente'),
    lic('2026-09-10', 'vacaciones'),          // licencia, pero no pide certificado
    lic('2026-09-11', 'falta', 'ausente'),    // ausencia, no licencia
    lic('2026-09-12', 'accidente_in_itinere'),
    lic('2026-09-13', 'enfermedad'),          // después del rango
  ]
  assert.deepEqual(diasCubiertos(declarados, '2026-09-08', '2026-09-12'), ['2026-09-08', '2026-09-09', '2026-09-12'])
})

test('sin licencias declaradas el certificado no cubre nada, y eso se dice', () => {
  assert.deepEqual(diasCubiertos([], '2026-09-08', '2026-09-12'), [])
  assert.equal(fraseDeCobertura(0), 'no cubre ningún día de licencia declarado')
  assert.equal(fraseDeCobertura(1), 'cubre 1 día de licencia')
  assert.equal(fraseDeCobertura(3), 'cubre 3 días de licencia')
})

test('el timestamp de la base se recorta al día antes de comparar', () => {
  assert.deepEqual(diasCubiertos([lic('2026-09-08T00:00:00', 'enfermedad')], '2026-09-08', '2026-09-08'), ['2026-09-08'])
})

// EL CONTRATO CON EL CATÁLOGO: si alguien renombra `accidente_in_itinere`, el cruce dejaría de
// cubrir accidentes en silencio.
test('los motivos que piden certificado existen en el catálogo de asistencia', () => {
  const claves = new Set(CATALOGO.map((m: { clave: string }) => m.clave))
  for (const m of MOTIVOS_CON_CERTIFICADO) assert.ok(claves.has(m), `«${m}» no está en el catálogo`)
  assert.equal(pideCertificado('vacaciones'), false)
  assert.equal(pideCertificado(null), false)
})

test('el rango: las dos fechas o ninguna, ordenadas, y de a lo sumo un año', () => {
  assert.deepEqual(revisarRango(null, null), { ok: true, desde: null, hasta: null })
  assert.deepEqual(revisarRango('', ''), { ok: true, desde: null, hasta: null })
  assert.equal(revisarRango('2026-09-08', null).ok, false)
  assert.equal(revisarRango('2026-09-12', '2026-09-08').ok, false)
  assert.equal(revisarRango('2026-09-08', '2027-09-10').ok, false)
  assert.equal(revisarRango('08/09/2026', '12/09/2026').ok, false)
  assert.deepEqual(revisarRango('2026-09-08', '2026-09-08'), { ok: true, desde: '2026-09-08', hasta: '2026-09-08' })
  assert.equal(diasEntre('2026-09-08', '2026-09-08'), 1)
  assert.equal(diasEntre('2026-09-08', '2026-09-12'), 5)
})

// EL MISMO TECHO QUE LA BASE. Si el CHECK cambia y esto no, la app rechaza lo que la base acepta o
// al revés, y el error llega como constraint ilegible.
test('el techo del rango es el mismo que el CHECK de la migración', () => {
  const sql = readFileSync(
    fileURLToPath(new URL('../../../../supabase/migrations/20260916T0100_persona_documento.sql', import.meta.url)),
    'utf8',
  )
  assert.match(sql, /licencia_hasta <= licencia_desde \+ 366/)
  assert.equal(revisarRango('2026-01-01', '2027-01-02').ok, true)   // 367 días calendario = desde + 366
  assert.equal(revisarRango('2026-01-01', '2027-01-03').ok, false)
})

test('el clip de un día: el certificado que lo contiene; con dos solapados, el que empieza después', () => {
  const a = { desde: '2026-09-08', hasta: '2026-09-12', nombre: 'a.pdf' }
  const b = { desde: '2026-09-10', hasta: '2026-09-15', nombre: 'b.pdf' }
  assert.equal(certificadoDelDia([a, b], '2026-09-09')?.nombre, 'a.pdf')
  assert.equal(certificadoDelDia([a, b], '2026-09-11')?.nombre, 'b.pdf')
  assert.equal(certificadoDelDia([a, b], '2026-09-16'), null)
})

test('el mapa persona|día para la grilla de muchas personas', () => {
  const m = certificadosPorPersonaYDia(
    [{ persona_id: 'p1', desde: '2026-09-08', hasta: '2026-09-09', nombre: 'c.pdf' }],
    ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10'],
  )
  assert.deepEqual(m, { 'p1|2026-09-08': 'c.pdf', 'p1|2026-09-09': 'c.pdf' })
})
