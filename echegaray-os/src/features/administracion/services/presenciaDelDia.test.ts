import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  acusePresencia, avisoSinMarcar, casillasDePresencia, estadoSegunMotivo, horasSegunPresencia,
  loQueViajaPresencia, marcarTodosPresentes, personasSinHoras, planDePresencia, resumenPresencia,
  sumarPersonasNuevasPresencia,
} from './presenciaDelDia.ts'
import type { CasillaPresencia, PresenciaGuardada } from './presenciaDelDia.ts'

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

test('el declarado ausente o de licencia no tiene casilla de horas que llenar', () => {
  assert.deepEqual(horasSegunPresencia('ausente', 8.8), { editable: false, sugerencia: null, letra: 'A' })
  assert.deepEqual(horasSegunPresencia('licencia', 8.8), { editable: false, sugerencia: null, letra: 'L' })
})

test('la jornada se sugiere SÓLO al presente, y sólo si la obra la tiene pactada', () => {
  assert.deepEqual(horasSegunPresencia('presente', 8.8), { editable: true, sugerencia: 8.8, letra: null })
  assert.deepEqual(horasSegunPresencia('presente', 0), { editable: true, sugerencia: null, letra: null },
    'se inventó una jornada que el contrato de la obra no dice')
})

test('sin presencia declarada la carga de horas queda como estaba: editable y sin sugerencia', () => {
  assert.deepEqual(horasSegunPresencia(null, 8.8), { editable: true, sugerencia: null, letra: null })
})

test('a quien fue declarado ausente o de licencia no se le pone la jornada', () => {
  const sinHoras = personasSinHoras([
    g('a', 'presente'), g('b', 'ausente', 'falta'), g('c', 'licencia', 'vacaciones'),
  ])
  assert.equal(sinHoras.has('a'), false, 'al presente sí se le cargan horas')
  assert.equal(sinHoras.has('b'), true)
  assert.equal(sinHoras.has('c'), true)
})
