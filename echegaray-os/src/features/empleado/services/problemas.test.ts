import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MOTIVOS, motivoDe, tipoDeMotivo } from './problemas.ts'

// EL VOCABULARIO DE `obra_restriccion_tipo_check`, COPIADO DE LA MIGRACIÓN 20260823T1000.
//
// Está acá y no importado de la base a propósito: es el CONTRATO que la pantalla tiene que
// respetar. Si alguien agrega un motivo con una clave inventada —«plano», «gente»—, el insert
// rebota con un 23514 recién en producción y el operario ve un error rojo por haber tocado bien.
// Este test lo hace rebotar acá.
const VOCABULARIO_DE_LA_BASE = [
  'material', 'informacion', 'equipo', 'mano_de_obra', 'trabajo_previo', 'permiso',
  'ingenieria_cliente', 'seguridad', 'acceso', 'contrato', 'clima', 'sin_clasificar', 'otro',
]

test('los seis motivos de M07 usan claves que el CHECK de la base acepta', () => {
  assert.equal(MOTIVOS.length, 6)
  for (const m of MOTIVOS) {
    assert.ok(
      VOCABULARIO_DE_LA_BASE.includes(m.tipo),
      `«${m.label}» manda tipo="${m.tipo}", que obra_restriccion_tipo_check rechaza`,
    )
  }
})

test('cada motivo tiene un id propio: dos ids iguales harían inalcanzable al segundo', () => {
  assert.equal(new Set(MOTIVOS.map((m) => m.id)).size, MOTIVOS.length)
})

test('sin motivo elegido NO se inventa uno: el tipo es sin_clasificar', () => {
  assert.equal(motivoDe(null), null)
  assert.equal(motivoDe(''), null)
  assert.equal(motivoDe('inventado'), null)
  assert.equal(tipoDeMotivo(null), 'sin_clasificar')
  // `sin_clasificar` y NUNCA `otro`: `otro` afirma que alguien miró las seis y no encajaba.
  assert.notEqual(tipoDeMotivo(undefined), 'otro')
})

test('el motivo elegido viaja con su clave de base, no con la de la pantalla', () => {
  assert.equal(tipoDeMotivo('gente'), 'mano_de_obra')
  assert.equal(tipoDeMotivo('plano'), 'informacion')
  assert.equal(tipoDeMotivo('material'), 'material')
})
