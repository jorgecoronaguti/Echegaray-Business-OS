// CONTRA QUÉ CONTRATO SE CONTROLA EL ESQUEMA DE PAGO (pantalla 32).
//
// ═══ EL DEFECTO QUE ESTAS PRUEBAS IMPIDEN (10/09/2026, verificado en producción) ═══
//
// La ficha de Messina publicaba «$31,85 M contrato» y la alarma «El esquema asigna $204,61 M MÁS
// que el contrato». Los $31,85 M son la suma de `obra_panel.monto_contratado` —el campo del
// formulario— y en ese cliente sólo está cargado en las CINCO obras cerradas. Lo contratado de
// verdad, el que publica la pestaña OBRAS, es $156.174.253 en las cinco obras en curso.
//
// Una alarma que se enciende en todos los clientes deja de leerse, y con ella la sobreasignación
// real. Los números de acá son los de Messina, medidos contra la base.

import test from 'node:test'
import assert from 'node:assert/strict'
import { contratoEnCurso, type ObraParaElContrato } from './esquemaService.ts'

/** Las cinco obras en curso de Messina, con lo que publica `obra_economia_cartera`. */
const EN_CURSO: [string, number][] = [
  ['messina-adicional-tercer-muro', 10_000_000],
  ['messina-bsa', 14_120_243.4],
  ['messina-pisos-120-rampa', 9_463_141.93],
  ['messina-playon-azufre', 102_500_000],
  ['messina-playon-dilucion-acido', 20_090_867.83],
]
/** Las cerradas, que son las únicas con el formulario cargado. */
const CERRADAS: [string, number][] = [
  ['bsa-adicional', 5_974_200],
  ['limpieza-de-escombros', 5_008_660.65],
  ['messina-bases-tanque-so2', 14_144_880],
  ['pilon', 5_818_735],
  ['relevamiento-topografico', 900_000],
]

const OBRAS: ObraParaElContrato[] = [
  ...EN_CURSO.map(([obra_id]) => ({ obra_id, estado: 'activa', monto_contratado: null })),
  ...CERRADAS.map(([obra_id, monto]) => ({ obra_id, estado: 'cerrada', monto_contratado: monto })),
]
const ECONOMIA = new Map(EN_CURSO.map(([id, contratado]) => [id, { contratado }]))

test('el contrato del esquema es el de OBRAS, no el del formulario que nadie carga', () => {
  // $156.174.253,16 — el mismo número que publica `/clientes` y la cifra «Contratado en curso».
  assert.equal(Math.round(contratoEnCurso(OBRAS, ECONOMIA)!), 156_174_253)
})

test('las obras CERRADAS no suman: su contrato es de trabajo ya terminado', () => {
  // Si sumaran, el total sería $188.020.728 y volvería a compararse contra un esquema que planifica
  // lo que falta cobrar. Era exactamente la mitad del defecto: $31,85 M de puras obras cerradas.
  assert.equal(
    Math.round(contratoEnCurso(OBRAS.filter((o) => o.estado === 'cerrada'), ECONOMIA) ?? -1),
    -1,
    'sin obra en curso no hay contra qué controlar el esquema',
  )
})

test('sin precio en OBRAS vale el del formulario — y NO al revés', () => {
  const obras: ObraParaElContrato[] = [
    { obra_id: 'a', estado: 'activa', monto_contratado: 1_000_000 },
    { obra_id: 'b', estado: 'activa', monto_contratado: 7 },
  ]
  const economia = new Map([['b', { contratado: 2_000_000 }]])
  assert.equal(contratoEnCurso(obras, economia), 3_000_000, 'OBRAS gana donde tiene el dato')
})

test('NULL nunca es cero: sin ningún precio, el contrato es null y la alarma no se enciende', () => {
  const obras: ObraParaElContrato[] = [{ obra_id: 'a', estado: 'activa', monto_contratado: null }]
  assert.equal(contratoEnCurso(obras, new Map()), null)
  assert.equal(contratoEnCurso([], null), null)
  // Un cero afirmaría que el cliente contrató nada, y la pantalla escribiría «el esquema asigna
  // $ X MÁS que el contrato» sobre un cliente del que no sabemos el precio.
  assert.notEqual(contratoEnCurso(obras, new Map()), 0)
})

test('no se pudo leer OBRAS: el respaldo del formulario sigue en pie', () => {
  const obras: ObraParaElContrato[] = [{ obra_id: 'a', estado: 'activa', monto_contratado: 500 }]
  assert.equal(contratoEnCurso(obras, null), 500)
})
