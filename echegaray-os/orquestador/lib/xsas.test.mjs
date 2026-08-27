import test from 'node:test'
import assert from 'node:assert/strict'
import { NIVEL, nivelDeOperacion, resumirEstado, herramientasDelOs, skillsDelOs, AGENTES_DEL_BUILDER } from './xsas.mjs'

// ── EL NIVEL DE OPERACIÓN ────────────────────────────────────────────────────────────────────
//
// Es la respuesta a «¿qué puede hacer el OS ahora mismo?». Se decide en una función pura para poder
// probar los escenarios de caída SIN caerse nada: apagar el proveedor de verdad para ver qué pasa no
// es una prueba, es un incidente.

test('sin razonador el nivel es NO_LLM, aunque todo lo demás esté sano', () => {
  assert.equal(nivelDeOperacion({ razonador: false, base: true, agentes: true }), NIVEL.NO_LLM)
})

test('con razonador pero sin base, DEGRADED — no FULL', () => {
  // Un control que no pudo mirar la base no puede decir que el conjunto está bien.
  assert.equal(nivelDeOperacion({ razonador: true, base: false, agentes: false }), NIVEL.DEGRADED)
  assert.equal(nivelDeOperacion({ razonador: true, base: true, agentes: false }), NIVEL.DEGRADED)
})

test('todo en pie es FULL', () => {
  assert.equal(nivelDeOperacion({ razonador: true, base: true, agentes: true }), NIVEL.FULL)
})

test('la caída del proveedor gana sobre la de la base: NO_LLM antes que DEGRADED', () => {
  // Son dos fallas distintas y la del razonador cambia MÁS lo que el OS puede hacer. Publicar
  // DEGRADED con el proveedor caído escondería la única que obliga a esperar.
  assert.equal(nivelDeOperacion({ razonador: false, base: false, agentes: false }), NIVEL.NO_LLM)
})

// ── EL INVENTARIO SALE DEL DISCO, NO DE UNA CONSTANTE ────────────────────────────────────────

test('las herramientas y las skills se cuentan de verdad', () => {
  // Un número escrito a mano miente el día que alguien agrega una skill. Sólo se afirma que hay
  // varias y que se contaron: la cifra exacta cambia y no es lo que se está probando.
  assert.ok(herramientasDelOs() > 10, 'el OS tiene herramientas propias')
  assert.ok(skillsDelOs() > 10, 'el OS tiene método de dominio propio')
})

// ── EL BUILDER SE CUENTA APARTE ──────────────────────────────────────────────────────────────

test('los agentes del Builder están declarados y son sólo dos', () => {
  // Construyen el propio OS y por eso pueden razonar con Claude Code. Cualquier OTRO que lo haga es
  // el negocio dependiendo de la cuota de una herramienta de desarrollo.
  assert.deepEqual([...AGENTES_DEL_BUILDER].sort(), ['implementer', 'software-architect'])
})

// ── EL RESUMEN SE LEE AUNQUE FALTE TODO ──────────────────────────────────────────────────────

test('el resumen dice «no se pudo leer», no un cero inventado', () => {
  const linea = resumirEstado({
    nivel: NIVEL.DEGRADED,
    motor: { disponible: true },
    agentes: null, conocimiento: null, trabajos: null,
    herramientas: 45, skills: 45,
  })
  assert.match(linea, /XSAS DEGRADED/)
  assert.match(linea, /agentes: no se pudo leer/)
  assert.ok(!/0 agentes/.test(linea), 'cero agentes y «no pude preguntar» son cosas distintas')
})

test('con el motor caído el resumen lo dice primero', () => {
  const linea = resumirEstado({
    nivel: NIVEL.NO_LLM,
    motor: { disponible: false },
    agentes: { deNegocio: 23 }, conocimiento: { afirmaciones: 10, confirmadas: 4 },
    trabajos: { activos: 2 }, herramientas: 45, skills: 45,
  })
  assert.match(linea, /XSAS NO_LLM · motor CAÍDO/)
  assert.match(linea, /23 agentes de negocio/)
})
