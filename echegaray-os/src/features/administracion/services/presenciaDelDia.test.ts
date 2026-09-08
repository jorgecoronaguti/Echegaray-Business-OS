import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  acuseDeHorasPorDefecto, acusePresencia, avisoSinMarcar, casillasDePresencia, estadoSegunMotivo,
  FUENTE_HORAS_POR_DEFECTO, horasSegunPresencia, loQueViajaPresencia, marcarTodosPresentes,
  personasAMarcar, personasSinHoras, planDeHorasPorDefecto, planDePresencia, resumenPresencia,
  sumarPersonasNuevasPresencia,
} from './presenciaDelDia.ts'
import type {
  CasillaPresencia, HoraDelDia, MarcaPresencia, PresenciaGuardada,
} from './presenciaDelDia.ts'

// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN — cada uno ya costó algo o está a un renglón de costarlo:
//
//  1. QUE LA PANTALLA NAZCA AFIRMANDO. Si la casilla naciera «presente», un toque en Guardar
//     declararía la presencia de quince personas que nadie miró. Es la misma forma exacta del
//     defecto que escribió 77,4 HH en una obra viva y costó un revert.
//  2. QUE EL ATAJO PISE UNA AUSENCIA YA MARCADA.
//  3. QUE «no vino → enfermedad» quede guardado como falta (o al revés).
//  4. QUE GUARDAR DOS VECES ESCRIBA DOS VECES: el acuse mentiría y `marcado_por` se reescribiría
//     con el nombre de quien sólo pasó a mirar.
//  5. QUE UNA PRESENCIA ARRASTRE UN MOTIVO viejo después de corregir.
//  6. QUE LAS HORAS DECLAREN PRESENCIA. La única dirección permitida es presencia → horas.
//  7. QUE EL ACUSE HABLE DE HORAS. Una frase, una unidad.

const g = (persona_id: string, estado: PresenciaGuardada['estado'], motivo: string | null = null):
PresenciaGuardada => ({ persona_id, estado, motivo })

const cas = (entradas: Record<string, CasillaPresencia>) => entradas

// ── 1 · NADIE NACE MARCADO ───────────────────────────────────────────────────────────────────────

test('la casilla nace SIN MARCAR: la pantalla no afirma por nadie', () => {
  const c = casillasDePresencia(['a', 'b', 'c'])
  for (const id of ['a', 'b', 'c']) {
    assert.equal(c[id].estado, null, `${id} nació con un estado que nadie declaró`)
  }
  assert.equal(loQueViajaPresencia(c).length, 0, 'una pantalla recién abierta mandó marcas a la base')
})

test('lo ya guardado se muestra tal cual: reabrir el día no borra lo de la mañana', () => {
  const c = casillasDePresencia(['a', 'b'], [g('a', 'ausente', 'lluvia')])
  assert.deepEqual(c.a, { estado: 'ausente', motivo: 'lluvia' })
  assert.deepEqual(c.b, { estado: null, motivo: null })
})

test('quien llega a la obra sin recargar la pantalla recibe su casilla vacía', () => {
  const previas = cas({ a: { estado: 'presente', motivo: null } })
  const out = sumarPersonasNuevasPresencia(previas, ['a', 'nuevo'])
  assert.deepEqual(out.a, { estado: 'presente', motivo: null }, 'se pisó lo que el jefe ya había marcado')
  assert.deepEqual(out.nuevo, { estado: null, motivo: null })
})

// ── 2 · EL ATAJO OFRECE, NO IMPONE ───────────────────────────────────────────────────────────────

test('«marcar a todos» llena las vacías y NO pisa una ausencia ya marcada', () => {
  const out = marcarTodosPresentes(cas({
    a: { estado: null, motivo: null },
    b: { estado: 'ausente', motivo: 'falta' },
    c: { estado: 'licencia', motivo: 'vacaciones' },
  }))
  assert.equal(out.a.estado, 'presente')
  assert.deepEqual(out.b, { estado: 'ausente', motivo: 'falta' }, 'el atajo borró una ausencia declarada')
  assert.deepEqual(out.c, { estado: 'licencia', motivo: 'vacaciones' })
})

// ── 3 · EL MOTIVO DECIDE AUSENCIA O LICENCIA, NO EL BOTÓN ────────────────────────────────────────

test('«no vino» + enfermedad es LICENCIA; «licencia» + faltó sin avisar es AUSENCIA', () => {
  assert.equal(estadoSegunMotivo('ausente', 'enfermedad'), 'licencia')
  assert.equal(estadoSegunMotivo('licencia', 'falta'), 'ausente')
  assert.equal(estadoSegunMotivo('ausente', 'lluvia'), 'ausente', 'la lluvia no es un derecho del trabajador')
  assert.equal(estadoSegunMotivo('ausente', null), 'ausente', 'sin motivo todavía, manda el botón')
})

// ── 5 · UNA PRESENCIA NO LLEVA MOTIVO ────────────────────────────────────────────────────────────

test('corregir «no vino · lluvia» a «está» no deja el motivo pegado', () => {
  const viaje = loQueViajaPresencia(cas({ a: { estado: 'presente', motivo: 'lluvia' } }))
  assert.deepEqual(viaje, [{ persona_id: 'a', estado: 'presente', motivo: null }])
})

test('un motivo que no está en el catálogo no viaja como si lo estuviera', () => {
  const viaje = loQueViajaPresencia(cas({ a: { estado: 'ausente', motivo: 'porque si' } }))
  assert.equal(viaje[0].motivo, null, 'se guardó texto libre en el campo que después se agrupa por causa')
})

// ── 4 · GUARDAR DOS VECES NO ESCRIBE DOS VECES ───────────────────────────────────────────────────

test('el plan es idempotente: sin cambios, no hay nada que escribir', () => {
  const guardadas = [g('a', 'presente'), g('b', 'ausente', 'falta')]
  const marcas = loQueViajaPresencia(cas({
    a: { estado: 'presente', motivo: null },
    b: { estado: 'ausente', motivo: 'falta' },
  }))
  const plan = planDePresencia(marcas, guardadas)
  assert.deepEqual(plan.cambios, [], 'reabrir y guardar sin tocar nada reescribió la presencia de todos')
  assert.equal(plan.intactas, 2)
})

test('el plan lleva sólo lo que cambió — estado o motivo', () => {
  const guardadas = [g('a', 'presente'), g('b', 'ausente', 'falta'), g('c', 'ausente', 'lluvia')]
  const marcas = loQueViajaPresencia(cas({
    a: { estado: 'presente', motivo: null },      // igual
    b: { estado: 'presente', motivo: null },      // cambió de estado
    c: { estado: 'ausente', motivo: 'enfermedad' }, // cambió de motivo
    d: { estado: 'presente', motivo: null },      // nueva
  }))
  const plan = planDePresencia(marcas, guardadas)
  assert.equal(plan.intactas, 1)
  assert.deepEqual(plan.cambios.map((m) => m.persona_id).sort(), ['b', 'c', 'd'])
})

test('quien quedó sin marcar no viaja: no se pisa lo que ya tenía guardado', () => {
  const guardadas = [g('a', 'ausente', 'falta')]
  const marcas = loQueViajaPresencia(cas({ a: { estado: null, motivo: null } }))
  assert.deepEqual(marcas, [])
  assert.deepEqual(planDePresencia(marcas, guardadas).cambios, [])
})

// ── 7 · EL ACUSE HABLA DE ESTADOS, NUNCA DE HORAS ────────────────────────────────────────────────

test('el acuse cuenta estados en palabras y no escribe los ceros', () => {
  const marcas = loQueViajaPresencia(cas({
    a: { estado: 'presente', motivo: null },
    b: { estado: 'presente', motivo: null },
    c: { estado: 'ausente', motivo: 'falta' },
    d: { estado: 'licencia', motivo: 'vacaciones' },
  }))
  const r = resumenPresencia(marcas, 6)
  assert.deepEqual(r, { presentes: 2, ausentes: 1, licencias: 1, sinMarcar: 2 })
  assert.equal(acusePresencia(r), '2 presentes · 1 ausente · 1 licencia')
  assert.doesNotMatch(acusePresencia(r), /\bh\b|hora/i, 'el acuse de presencia mencionó horas')
})

test('el singular y el vacío también se dicen bien', () => {
  assert.equal(acusePresencia({ presentes: 1, ausentes: 0, licencias: 0, sinMarcar: 0 }), '1 presente')
  assert.equal(acusePresencia({ presentes: 0, ausentes: 0, licencias: 0, sinMarcar: 5 }), 'Sin nadie marcado')
})

test('lo que falta por marcar se dice sin acusar a nadie', () => {
  assert.equal(avisoSinMarcar(0), null)
  assert.equal(avisoSinMarcar(1), 'Falta 1 persona por marcar.')
  assert.equal(avisoSinMarcar(3), 'Faltan 3 personas por marcar.')
})

// ── 6 · LA ÚNICA DIRECCIÓN: PRESENCIA → HORAS ────────────────────────────────────────────────────

const LUNES = '2026-09-07'
const VIERNES = '2026-09-11'
const SABADO = '2026-09-12'

test('el declarado ausente o de licencia no tiene casilla de horas que llenar', () => {
  assert.deepEqual(horasSegunPresencia('ausente', LUNES), { editable: false, sugerencia: null, letra: 'A' })
  assert.deepEqual(horasSegunPresencia('licencia', LUNES), { editable: false, sugerencia: null, letra: 'L' })
})

// LA SUGERENCIA ES DEL DÍA, NO DE LA OBRA (dueño, 08/09/2026). Antes salía de
// `obra_canonica.jornada_horas` —9 para todas las obras y todos los días—: un viernes sugería 9 y
// eso es una hora de más por persona y por semana.
test('al presente se le sugiere la jornada por defecto de ESA fecha', () => {
  assert.deepEqual(horasSegunPresencia('presente', LUNES), { editable: true, sugerencia: 9, letra: null })
  assert.deepEqual(horasSegunPresencia('presente', VIERNES), { editable: true, sugerencia: 8, letra: null },
    'el viernes son 8: la jornada de la obra volvió a ganarle a la regla del día')
  assert.deepEqual(horasSegunPresencia('presente', SABADO), { editable: true, sugerencia: null, letra: null },
    'se inventó una jornada de sábado que nadie pactó')
})

test('sin presencia declarada la carga de horas queda como estaba: editable y sin sugerencia', () => {
  assert.deepEqual(horasSegunPresencia(null, LUNES), { editable: true, sugerencia: null, letra: null })
})

test('a quien fue declarado ausente o de licencia no se le pone la jornada', () => {
  const sinHoras = personasSinHoras([
    g('a', 'presente'), g('b', 'ausente', 'falta'), g('c', 'licencia', 'vacaciones'),
  ])
  assert.equal(sinHoras.has('a'), false, 'al presente sí se le cargan horas')
  assert.equal(sinHoras.has('b'), true)
  assert.equal(sinHoras.has('c'), true)
})

// ── 8 · EL JEFE NO SE MARCA A SÍ MISMO ───────────────────────────────────────────────────────────
//
// Dueño, 08/09/2026: «los jefes de obra no tienen que marcar si han asistido o no, ellos marcan a
// los demás». Si `personasAMarcar` vuelve a devolver la lista entera, estos tres se ponen rojos:
// el jefe reaparece en la lista, «marcar a todos» lo incluye y el conteo del pie lo cuenta.

const fila = (persona_id: string, esJefe?: boolean) => ({ persona: { persona_id, esJefe } })

test('la lista de presencia EXCLUYE a los jefes de obra', () => {
  const filas = [fila('nievas', true), fila('acosta', false), fila('molina')]
  assert.deepEqual(
    personasAMarcar(filas).map((f) => f.persona.persona_id),
    ['acosta', 'molina'],
    'un jefe de obra volvió a la lista de quienes se marcan',
  )
})

test('«marcar a todos» tampoco incluye al jefe: no tiene casilla', () => {
  const filas = [fila('nievas', true), fila('acosta')]
  const ids = personasAMarcar(filas).map((f) => f.persona.persona_id)
  const todos = marcarTodosPresentes(casillasDePresencia(ids))
  assert.deepEqual(Object.keys(todos), ['acosta'])
  assert.equal(
    loQueViajaPresencia(todos).some((m) => m.persona_id === 'nievas'), false,
    'el atajo declaró presente a un jefe de obra: nadie lo marcó',
  )
})

test('la obra donde el único asignado es el jefe se queda sin nadie a quien marcar', () => {
  // La pantalla NO queda vacía por error: es el caso que muestra «Vos no te marcás».
  assert.deepEqual(personasAMarcar([fila('nievas', true)]), [])
  // Y el pie no puede reclamar una marca que nadie tiene que hacer.
  assert.equal(avisoSinMarcar(resumenPresencia([], 0).sinMarcar), null)
})

// ── 8 · LAS HORAS POR DEFECTO AL DECLARAR EL PRESENTE ────────────────────────────────────────────
//
// Los defectos que atrapan estos tests, todos con costo económico directo (una hora escrita es
// costo de mano de obra imputado a una obra):
//
//  8.1 QUE EL DEFECTO PISE HORAS CARGADAS A MANO — el día pasaría a costar el doble.
//  8.2 QUE MIRE SÓLO LA OBRA DE LA PANTALLA — quien ya tiene 9 h en otra obra recibiría 9 h más.
//  8.3 QUE ESCRIBA EL FIN DE SEMANA — un sábado que nadie trabajó facturaría 9 h a la obra.
//  8.4 QUE CORREGIR A «no vino» BORRE UNA HORA QUE ALGUIEN CARGÓ — pérdida silenciosa de trabajo.
//  8.5 QUE CORREGIR A «no vino» DEJE VIVA LA JORNADA QUE NADIE MIRÓ — el ausente cobraría el día.
//  8.6 QUE EL ACUSE HABLE DE HORAS QUE NO SE ESCRIBIERON.

const h = (
  id: string, persona_id: string,
  extra: Partial<HoraDelDia> = {},
): HoraDelDia => ({ id, persona_id, tipo_hora: 'normal', fuente_legacy: 'web:asistencia-obra', ...extra })

// LUNES / VIERNES / SABADO son los mismos días del bloque 7: la sugerencia de la pantalla y la
// jornada que se escribe tienen que salir de la misma regla, y compartir las fechas lo prueba.
const plan = (
  presencias: MarcaPresencia[], horasExistentes: HoraDelDia[] = [], fecha = LUNES,
) => planDeHorasPorDefecto({ presencias, horasExistentes, fecha, obra: 'obra-1' })

test('L a J: el presente carga 9 h normales en la obra donde se lo marcó', () => {
  const p = plan([{ persona_id: 'a', estado: 'presente', motivo: null }])
  assert.equal(p.insertar.length, 1)
  assert.deepEqual(p.insertar[0], {
    persona_id: 'a', obra_canonica_id: 'obra-1', fecha: LUNES, horas: 9,
    tipo_hora: 'normal', fuente_legacy: FUENTE_HORAS_POR_DEFECTO, notas: null,
  })
})

test('el viernes son 8, no 9: la jornada la decide el día, no la obra', () => {
  const p = plan([{ persona_id: 'a', estado: 'presente', motivo: null }], [], VIERNES)
  assert.equal(p.insertar[0].horas, 8)
  assert.equal(p.jornada, 8)
})

test('8.3 · el sábado no escribe NADA: no hay jornada por defecto el fin de semana', () => {
  const p = plan([{ persona_id: 'a', estado: 'presente', motivo: null }], [], SABADO)
  assert.deepEqual(p.insertar, [], 'se escribieron horas un sábado que nadie trabajó')
  assert.equal(p.jornada, null)
})

test('8.1 · quien ya tiene horas cargadas a mano no recibe el defecto', () => {
  const p = plan([{ persona_id: 'a', estado: 'presente', motivo: null }], [h('r1', 'a')])
  assert.deepEqual(p.insertar, [], 'el defecto duplicó un día ya cargado')
})

test('8.2 · las horas de OTRA obra también frenan el defecto', () => {
  // La fila viene de la obra 2; el plan sólo la ve por persona y día, que es como corresponde.
  const p = plan([{ persona_id: 'a', estado: 'presente', motivo: null }], [h('r1', 'a')])
  assert.equal(p.insertar.length, 0)
})

test('una ausencia ya cargada frena el defecto: el día no puede ser trabajado y no trabajado', () => {
  const p = plan(
    [{ persona_id: 'a', estado: 'presente', motivo: null }],
    [h('r1', 'a', { tipo_hora: 'ausencia', fuente_legacy: 'web:asistencia-obra' })],
  )
  assert.deepEqual(p.insertar, [])
})

test('el defecto no se duplica al volver a guardar el mismo día', () => {
  const p = plan(
    [{ persona_id: 'a', estado: 'presente', motivo: null }],
    [h('r1', 'a', { fuente_legacy: FUENTE_HORAS_POR_DEFECTO })],
  )
  assert.deepEqual(p.insertar, [])
  assert.deepEqual(p.borrar, [])
})

test('8.5 · corregir a «no vino» borra la jornada por defecto que nadie miró', () => {
  const p = plan(
    [{ persona_id: 'a', estado: 'ausente', motivo: 'lluvia' }],
    [h('r1', 'a', { fuente_legacy: FUENTE_HORAS_POR_DEFECTO })],
  )
  assert.deepEqual(p.borrar, ['r1'])
  assert.deepEqual(p.conflictos, [])
})

test('la licencia retira la jornada por defecto igual que la ausencia', () => {
  const p = plan(
    [{ persona_id: 'a', estado: 'licencia', motivo: 'vacaciones' }],
    [h('r1', 'a', { fuente_legacy: FUENTE_HORAS_POR_DEFECTO })],
  )
  assert.deepEqual(p.borrar, ['r1'])
})

test('8.4 · corregir a «no vino» NO borra horas cargadas a mano: las nombra como conflicto', () => {
  const p = plan([{ persona_id: 'a', estado: 'ausente', motivo: 'lluvia' }], [h('r1', 'a')])
  assert.deepEqual(p.borrar, [], 'se borró una hora que cargó una persona')
  assert.deepEqual(p.conflictos, ['a'])
})

test('con horas a mano AL LADO de la del defecto, tampoco se borra nada', () => {
  const p = plan(
    [{ persona_id: 'a', estado: 'ausente', motivo: 'lluvia' }],
    [h('r1', 'a', { fuente_legacy: FUENTE_HORAS_POR_DEFECTO }), h('r2', 'a')],
  )
  assert.deepEqual(p.borrar, [])
  assert.deepEqual(p.conflictos, ['a'])
})

test('marcar a toda la cuadrilla: una fila por cada quien no tenía horas', () => {
  const p = plan(
    [
      { persona_id: 'a', estado: 'presente', motivo: null },
      { persona_id: 'b', estado: 'presente', motivo: null },
      { persona_id: 'c', estado: 'ausente', motivo: 'lluvia' },
    ],
    [h('r1', 'b')],
  )
  assert.deepEqual(p.insertar.map((i) => i.persona_id), ['a'])
  assert.deepEqual(p.borrar, [])
})

test('8.6 · el acuse de horas no dice nada cuando no se escribió nada', () => {
  assert.equal(acuseDeHorasPorDefecto({ insertadas: 0, borradas: 0, conflictos: 0 }), null)
})

test('el acuse dice la regla completa cuando el defecto cargó horas', () => {
  const texto = acuseDeHorasPorDefecto({ insertadas: 3, borradas: 0, conflictos: 0 })
  assert.equal(texto, 'horas cargadas por defecto: 9 h (lun–jue) / 8 h (vie); editables en Asistencia')
})

test('el acuse nombra el conflicto en vez de esconderlo', () => {
  const texto = acuseDeHorasPorDefecto({ insertadas: 0, borradas: 1, conflictos: 1 }) ?? ''
  assert.match(texto, /se quitaron las horas por defecto de 1 persona/)
  assert.match(texto, /1 persona con horas cargadas a mano/)
})
