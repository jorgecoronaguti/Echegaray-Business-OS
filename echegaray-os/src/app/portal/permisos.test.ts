import test from 'node:test'
import assert from 'node:assert/strict'
import { accesoVigente, alcanzaLaObra, limpiarNombre, loQueSiPuedeVer } from './permisos.ts'

// LOS CUATRO DEFECTOS QUE ESTE ARCHIVO ATRAPA — los cuatro se cometieron de verdad al leer
// `cliente_mail` en vez de `cliente_acceso`.

test('un acceso revocado NO entra, aunque su fila siga en la tabla', () => {
  assert.equal(accesoVigente({ revocado_at: null }), true)
  assert.equal(accesoVigente({ revocado_at: '2026-08-12T10:00:00Z' }), false)
})

test('obras = NULL es TODAS y obras = [] es NINGUNA — no son lo mismo', () => {
  // NULL: alcanza cualquier obra, incluso una fila del esquema sin obra asignada.
  assert.equal(alcanzaLaObra(null, 'pisos-industriales'), true)
  assert.equal(alcanzaLaObra(null, null), true)

  // []: no alcanza NADA. Aplanar el vacío a «todas» es lo que abre el acceso por accidente.
  assert.equal(alcanzaLaObra([], 'pisos-industriales'), false)
  assert.equal(alcanzaLaObra([], null), false)
})

test('una lista de obras alcanza las suyas y ninguna más', () => {
  assert.equal(alcanzaLaObra(['pisos-industriales'], 'pisos-industriales'), true)
  assert.equal(alcanzaLaObra(['pisos-industriales'], 'quattropani'), false)
})

test('un acceso acotado NO ve la fila del esquema que no dice de qué obra es', () => {
  // Falla cerrado: no hay forma de afirmar que ese pago le corresponda. Con `obras = NULL` sí la ve,
  // porque ahí alcanza todo lo del cliente.
  assert.equal(alcanzaLaObra(['pisos-industriales'], null), false)
  assert.equal(alcanzaLaObra(null, null), true)
})

test('sin puede_ver_montos la pantalla dice QUÉ SÍ puede ver, y no habla de importes', () => {
  const conObra = loQueSiPuedeVer({ puedeVerObra: true, puedeVerMontos: false })
  assert.match(conObra, /no incluye los importes/i)
  assert.match(conObra, /documentos/i)

  const sinObra = loQueSiPuedeVer({ puedeVerObra: false, puedeVerMontos: false })
  assert.match(sinObra, /no incluye los importes/i)
  assert.doesNotMatch(sinObra, /documentos/i)

  // Con permiso no hay leyenda de recorte: no se le avisa a nadie de una limitación que no tiene.
  assert.doesNotMatch(loQueSiPuedeVer({ puedeVerObra: true, puedeVerMontos: true }), /no incluye/i)
})

test('el nombre del cliente pierde los paréntesis de la anotación interna', () => {
  assert.equal(limpiarNombre('(IMOTOR / Javier Sánchez)'), 'IMOTOR / Javier Sánchez')
  assert.equal(limpiarNombre('  ARCOR  '), 'ARCOR')
})
