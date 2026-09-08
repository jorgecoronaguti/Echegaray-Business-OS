import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  JORNADA_ESTANDAR_HS, acuseDeAusencia, acuseDeAusenciasDelDia, ausenciaSinObraDe,
  horasDeLaAusencia, planDeAusenciasSinObra, sumarHoras,
} from './ausenciaDeLaPersona.ts'
import type { FilaDelDia, MarcaDelDia } from './ausenciaDeLaPersona.ts'

const fila = (
  id: string, tipo_hora: string, horas: number | string, obra_canonica_id: string | null,
  extra: Partial<FilaDelDia> = {},
): FilaDelDia => ({ id, tipo_hora, horas, obra_canonica_id, ...extra })

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

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// LA CARGA DEL DÍA (`guardarJornada`): LA OTRA PUERTA DE LA MISMA REGLA
//
// Hasta el 08/09/2026 la «A» del teléfono y la de la grilla escribían la ausencia CON la obra del
// formulario. Estos tests fijan que ya no, y qué pasa con lo que había.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

const P = '11111111-1111-4111-8111-111111111111'
const Q = '22222222-2222-4222-8222-222222222222'
const marcaAusente = (persona_id: string, horas = 8.8, motivo: string | null = null): MarcaDelDia =>
  ({ persona_id, estado: 'ausente', horas, motivo })
const marcaPresente = (persona_id: string, horas = 8.8): MarcaDelDia =>
  ({ persona_id, estado: 'presente', horas, motivo: null })

test('MARCAR AUSENTE ESCRIBE UNA FILA SIN OBRA — el defecto que este trabajo deshace', () => {
  // Sin nada cargado afuera, la ausencia es un INSERT sin obra: `id: null`. Que no haya obra en
  // ninguna parte de este plan es exactamente lo que el dueño pidió.
  const plan = planDeAusenciasSinObra([marcaAusente(P)], [])
  assert.equal(plan.escribir.length, 1)
  assert.equal(plan.escribir[0].id, null)
  assert.equal(plan.escribir[0].tipo, 'ausencia')
  assert.equal(plan.escribir[0].marca.horas, 8.8, 'la ausencia lleva las horas que corresponden')
  assert.deepEqual(plan.borrar, [])
})

test('EL MOTIVO DECIDE SI LA FILA SIN OBRA ES AUSENCIA O LICENCIA', () => {
  // La misma regla que ya usaba el panel: vacaciones y parte médico son LICENCIA, faltar sin avisar
  // es AUSENCIA. Sin esto, la diferencia entre un derecho reconocido y una falta desaparece — y es
  // justo la que usa quien liquida.
  assert.equal(planDeAusenciasSinObra([marcaAusente(P, 8.8, 'enfermedad')], []).escribir[0].tipo, 'licencia')
  assert.equal(planDeAusenciasSinObra([marcaAusente(P, 8.8, 'vacaciones')], []).escribir[0].tipo, 'licencia')
  assert.equal(planDeAusenciasSinObra([marcaAusente(P, 8.8, 'falta')], []).escribir[0].tipo, 'ausencia')
})

test('MARCAR «A» DOS VECES NO ESCRIBE DOS FILAS: la clave única no protege sin obra', () => {
  // El defecto que atrapa: en Postgres dos `obra_canonica_id` NULL NO colisionan, así que
  // `registros_hh_persona_unico` deja pasar la segunda ausencia del mismo día. El día quedaría
  // contado dos veces y nadie vería un error.
  const yaEsta = [fila('r1', 'ausencia', 8.8, null, { persona_id: P, notas: null })]
  const plan = planDeAusenciasSinObra([marcaAusente(P)], yaEsta)
  assert.deepEqual(plan.escribir, [])
  assert.equal(plan.sinCambio, 1)
  assert.deepEqual(plan.borrar, [])
})

test('CORREGIR EL MOTIVO O LAS HORAS DE LA AUSENCIA ES UN UPDATE DE LA MISMA FILA', () => {
  const yaEsta = [fila('r1', 'ausencia', 8.8, null, { persona_id: P, notas: 'falta' })]
  const otroMotivo = planDeAusenciasSinObra([marcaAusente(P, 8.8, 'falta_con_aviso')], yaEsta)
  assert.deepEqual(otroMotivo.escribir.map((e) => e.id), ['r1'])
  // LAS HORAS TAMBIÉN CUENTAN COMO CAMBIO (dueño, 08/09 16:16): «las ausencias que tienen motivo
  // registrado dan la posibilidad de que se le registre hs, como pasa con los accidentes
  // laborales». Si sólo se comparara el motivo, corregir 8,8 a 4 diría «ya estaba así».
  const otrasHoras = planDeAusenciasSinObra([marcaAusente(P, 4, 'falta')], yaEsta)
  assert.deepEqual(otrasHoras.escribir.map((e) => e.id), ['r1'])
  assert.equal(otrasHoras.escribir[0].marca.horas, 4)
})

test('VOLVER DE AUSENTE A PRESENTE SACA LA AUSENCIA SIN OBRA', () => {
  // El defecto que atrapa: escribir las horas encima de una «A» y dejar las dos afirmaciones
  // guardadas. Como la ausencia no vive en la obra, el borrado del plan de la obra —acotado por
  // `obra_canonica_id`— no la alcanza: tiene que salir por acá o no sale nunca.
  const yaEsta = [fila('r1', 'ausencia', 8.8, null, { persona_id: P })]
  const plan = planDeAusenciasSinObra([marcaPresente(P, 8)], yaEsta)
  assert.deepEqual(plan.borrar, ['r1'])
  assert.deepEqual(plan.escribir, [])
})

test('UNA LICENCIA SIN OBRA NO SE PISA DESDE LA OBRA, Y SE NOMBRA', () => {
  // Misma regla que `esDeLaJornada`: la licencia la autorizó Administración con un papel atrás. Ni
  // la «A» del jefe la convierte en ausencia ni marcar presente la borra. Y no se escribe una
  // ausencia al lado: serían dos filas del mismo día.
  const licencia = [fila('r1', 'licencia', 8, null, { persona_id: P, notas: 'vacaciones' })]
  for (const marca of [marcaAusente(P), marcaPresente(P, 8)]) {
    const plan = planDeAusenciasSinObra([marca], licencia)
    assert.deepEqual(plan.escribir, [])
    assert.deepEqual(plan.borrar, [])
    assert.equal(plan.intactas.length, 1)
    assert.match(plan.intactas[0].motivo, /Administración/)
  }
})

test('CADA PERSONA MIRA SÓLO SUS FILAS: la cuadrilla entra en un solo envío', () => {
  // El defecto que atrapa: leer el día de toda la cuadrilla y aplicarle a uno la fila de otro. Se
  // marca ausente a P —que no tiene nada— mientras Q ya tenía su ausencia.
  const deQ = [fila('r9', 'ausencia', 8.8, null, { persona_id: Q })]
  const plan = planDeAusenciasSinObra([marcaAusente(P)], deQ)
  assert.equal(plan.escribir.length, 1)
  assert.equal(plan.escribir[0].id, null, 'no puede corregir la fila de otra persona')
  assert.deepEqual(plan.borrar, [])
})

test('EL ACUSE DE LA CARGA DEL DÍA DICE QUE NO SE CARGÓ A NINGUNA OBRA', () => {
  const m = acuseDeAusenciasDelDia({ insertadas: 1, actualizadas: 0, sacadas: 0, sinCambio: 0, intactas: [] })
  assert.equal(m, 'Ausencia registrada. La ausencia es de la persona; no se cargó a ninguna obra.')
  assert.ok(m && !/imputad/i.test(m))
  // Sin nada que decir no dice nada: un acuse vacío sería «no cambió nada» sobre lo que sí cambió
  // en la obra.
  assert.equal(acuseDeAusenciasDelDia({ insertadas: 0, actualizadas: 0, sacadas: 0, sinCambio: 0, intactas: [] }), null)
  assert.match(
    acuseDeAusenciasDelDia({ insertadas: 0, actualizadas: 0, sacadas: 0, sinCambio: 1, intactas: [] }) ?? '',
    /ya estaba registrada/)
})
