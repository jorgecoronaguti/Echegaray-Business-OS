import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  JORNADA_ESTANDAR_HS, acuseDeAusencia, ausenciaSinObraDe, horasDeLaAusencia, sumarHoras,
} from './ausenciaDeLaPersona.ts'
import type { FilaDelDia } from './ausenciaDeLaPersona.ts'

const fila = (
  id: string, tipo_hora: string, horas: number | string, obra_canonica_id: string | null,
): FilaDelDia => ({ id, tipo_hora, horas, obra_canonica_id })

// ── EL DEFECTO QUE RECHAZÓ EL DUEÑO ─────────────────────────────────────────────────────────────
//
// «La ausencia quedó imputada a La Estrella: es donde ya estaban las horas de ese día». Si alguien
// vuelve a nombrar una obra en el acuse de una ausencia, este test se pone rojo.
test('EL ACUSE DE UNA AUSENCIA NO NOMBRA NINGUNA OBRA COMO DESTINO', () => {
  const m = acuseDeAusencia({ fila: 'insertada', horasSacadas: 0, obrasSacadas: [], intactas: [] })
  assert.equal(m, 'Día corregido: no vino. La ausencia es de la persona; no se cargó a ninguna obra.')
  assert.ok(!/imputad/i.test(m), 'el acuse no puede decir que la ausencia quedó imputada a nada')
})

test('LAS HORAS QUE SE SACAN DE UNA OBRA SE NOMBRAN: BORRARLAS EN SILENCIO SERÍA PERDER EL DATO', () => {
  const m = acuseDeAusencia({
    fila: 'insertada', horasSacadas: 9, obrasSacadas: ['La Estrella Galpón 9'], intactas: [],
  })
  assert.ok(m.includes('9 hs'), m)
  assert.ok(m.includes('La Estrella Galpón 9'), m)
  assert.ok(m.includes('no trabajó'), m)
})

test('LO QUE NO SE TOCÓ SE NOMBRA, IGUAL QUE EN EL RESTO DE LA PANTALLA', () => {
  const m = acuseDeAusencia({
    fila: 'actualizada', horasSacadas: 0, obrasSacadas: [],
    intactas: [{ motivo: 'hora improductiva con su causa' }],
  })
  assert.ok(m.includes('Quedó sin tocar una fila: hora improductiva con su causa.'), m)
})

test('SI LA BASE NO CAMBIÓ NADA, EL ACUSE NO AFIRMA QUE CORRIGIÓ', () => {
  // La evidencia es del efecto: `fila: null` es un update que afectó cero filas.
  const m = acuseDeAusencia({ fila: null, horasSacadas: 0, obrasSacadas: [], intactas: [] })
  assert.equal(m, 'No cambió nada en la base: el día ya estaba así.')
})

// ── LA FILA QUE SE CORRIGE ES LA QUE YA ESTÁ SIN OBRA ───────────────────────────────────────────
test('UNA AUSENCIA VIEJA CON OBRA NO CUENTA COMO LA FILA SIN OBRA: SE REEMPLAZA, NO SE EDITA', () => {
  const filas = [
    fila('b', 'ausencia', 9, 'la-estrella'),   // el legado de JORNALES
    fila('c', 'normal', 9, 'quattropani'),
  ]
  assert.equal(ausenciaSinObraDe(filas), null)
})

test('LA FILA SIN OBRA SE ENCUENTRA Y EL RESULTADO NO DEPENDE DEL ORDEN', () => {
  const sinObra = fila('a', 'licencia', 8, null)
  const otras = [fila('b', 'ausencia', 9, 'la-estrella'), fila('c', 'normal', 4, 'quattropani')]
  assert.equal(ausenciaSinObraDe([sinObra, ...otras])?.id, 'a')
  assert.equal(ausenciaSinObraDe([...otras, sinObra])?.id, 'a')
})

test('UNAS HORAS TRABAJADAS SIN OBRA NO SON UNA AUSENCIA', () => {
  // No debería existir —el CHECK de `20260908T2000` lo prohíbe—, y si existe no se corrige como si
  // fuera la ausencia de la persona.
  assert.equal(ausenciaSinObraDe([fila('a', 'normal', 9, null)]), null)
})

// ── LAS HORAS DE LA AUSENCIA ────────────────────────────────────────────────────────────────────
test('LAS HORAS LAS MANDA QUIEN CORRIGE CUANDO LAS MANDA', () => {
  assert.equal(horasDeLaAusencia(4, 9), 4)
})

test('SIN HORAS PEDIDAS VALE LA JORNADA DE REFERENCIA, NO UNA HORA SUELTA', () => {
  // El defecto viejo: `c.horas ?? 1` registraba una ausencia de UNA hora sobre una jornada de nueve.
  assert.equal(horasDeLaAusencia(null, 9), 9)
  assert.equal(horasDeLaAusencia(undefined, 8.8), 8.8)
})

test('SIN NINGUNA JORNADA DE REFERENCIA SE USA LA ESTÁNDAR, NUNCA CERO', () => {
  // `registros_hh` exige horas > 0, y el dueño lo dijo al revés: «se le suma hs porque corresponde
  // por ley». Un cero diría que ese día no le corresponde nada.
  assert.equal(horasDeLaAusencia(null, null), JORNADA_ESTANDAR_HS)
  assert.equal(horasDeLaAusencia(null, 0), JORNADA_ESTANDAR_HS)
  assert.ok(horasDeLaAusencia(null, null) > 0)
})

test('LAS HORAS SUMAN AUNQUE POSTGREST LAS MANDE COMO TEXTO', () => {
  // `horas` es numeric: sin el Number la suma concatenaría y el acuse diría «49 hs» por 4 y 9.
  const filas = [fila('a', 'normal', '4.5', 'q'), fila('b', 'normal', '4.5', 'q'), fila('c', 'normal', 9, 'x')]
  assert.equal(sumarHoras(filas, ['a', 'b']), 9)
  assert.equal(sumarHoras(filas, []), 0)
})
