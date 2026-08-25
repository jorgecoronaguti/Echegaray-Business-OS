// Los candados que separan «entorno de prueba descartable» de «base con gente adentro».
// Cada caso viene de un ataque real del auditor de reproducibilidad (22/08).
import test from 'node:test'
import assert from 'node:assert/strict'
import { esUrlLocal, decisionSobreBase, semillaPermitida, PREFIJO_SEMILLA } from './reconstruccion-candados.mjs'

test('sólo URLs locales pasan sin --si-remoto', () => {
  assert.equal(esUrlLocal('postgres://postgres:x@127.0.0.1:55452/postgres'), true)
  assert.equal(esUrlLocal('postgres://u:p@localhost/db'), true)
  assert.equal(esUrlLocal('postgres://u:p@db.abc.supabase.co:5432/postgres'), false)
  assert.equal(esUrlLocal('postgres://u:p@10.0.0.7:5432/postgres'), false)
  assert.equal(esUrlLocal(undefined), false, 'sin URL no hay nada local')
})

test('una base con negocio y sin ledger propio NO se toca (ataque «victima» del auditor)', () => {
  const d = decisionSobreBase({ tablas: 1, conLedger: false })
  assert.equal(d.seguir, false)
  assert.match(d.motivo, /No se toca/)
})

test('vacía se construye; con ledger propio se continúa', () => {
  assert.equal(decisionSobreBase({ tablas: 0, conLedger: false }).seguir, true)
  assert.equal(decisionSobreBase({ tablas: 260, conLedger: true }).seguir, true)
})

test('la semilla se niega ante UN solo perfil real — el túnel local a producción no la ve venir', () => {
  // Producción alcanzada por túnel en 127.0.0.1 pasa esUrlLocal, y con las 258 hasheadas pasa el
  // censo. La última línea de defensa es el CONTENIDO: producción tiene gente; un entorno de
  // prueba recién reconstruido, no.
  assert.equal(semillaPermitida({ perfilesAjenos: 1 }).permitida, false)
  assert.equal(semillaPermitida({ perfilesAjenos: 14 }).permitida, false)
  assert.equal(semillaPermitida({ perfilesAjenos: 0 }).permitida, true)
})

test('el prefijo de la semilla es el declarado en semilla-minima.sql', () => {
  assert.equal(PREFIJO_SEMILLA, '00000000-0000-4000-8000-')
})
