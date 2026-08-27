// EL RUTEO DE CAPACIDADES SE RESUELVE CON CÓDIGO, Y SÓLO PREGUNTA AL MODELO CUANDO NO SABE.
//
// Los dos defectos que estos tests atrapan:
//  1. Skills que existen y que ningún ruteo alcanzaba: "te paso el extracto del santander" no
//     llegaba a `lectura-bancaria-impacto-sheet` aunque esa skill tiene seis módulos del OS detrás.
//  2. Escalar al modelo por las dudas. Si alguien mete una llamada de IA antes de cada elección,
//     el test del contador se pone rojo: los casos claros se resuelven sin API y sin latencia.
//
// Las frases son las del dueño (voseo, sin tildes, con typos), no español de manual.
import test from 'node:test'
import assert from 'node:assert/strict'
import { elegirCapacidad, resolverCapacidad, SKILL_KEYWORDS } from './elegir-capacidad.mjs'

test('lo que ya ruteaba el chat sigue ruteando igual', () => {
  const r = elegirCapacidad('cuanta caja tengo hoy')
  assert.equal(r.resolucion, 'determinista')
  assert.equal(r.capacidad, 'advise.finance')
  assert.deepEqual(r.skills, ['finanzas-tesoreria-construccion'])
})

test('una señal inequívoca de una skill SIN capacidad la trae igual', () => {
  const r = elegirCapacidad('te paso el extracto del santander de agosto')
  assert.equal(r.resolucion, 'determinista')
  assert.ok(r.skills.includes('lectura-bancaria-impacto-sheet'),
    `la skill del banco tiene motor en el OS y no la alcanzaba nadie; salió: ${r.skills.join(', ')}`)
})

test('la skill directa SE SUMA al dominio, no lo reemplaza', () => {
  const r = elegirCapacidad('q pago primero esta semana')
  assert.ok(r.skills.includes('finanzas-tesoreria-construccion'), 'la de dominio no se pierde')
  assert.ok(r.skills.includes('financial-engineering'), 'el motor de tesorería es el que decide a quién se le paga')
})

test('cargar un comprobante activa la skill de carga, no sólo la impositiva', () => {
  const r = elegirCapacidad('carga el comprobante de la factura de cemento avellaneda')
  assert.ok(r.skills.includes('carga-gastos-multimedia'), `salió: ${r.skills.join(', ')}`)
})

test('appsheet es una palabra que no puede ser de otro dominio', () => {
  const r = elegirCapacidad('agregá una columna a la app de pedidos de appsheet')
  assert.ok(r.skills.includes('appsheet-desarrollo'))
})

test('invertir un excedente llega a la skill de inversiones', () => {
  const r = elegirCapacidad('me conviene poner la plata en un plazo fijo o la dejo en la cuenta')
  assert.ok(r.skills.includes('tesoreria-inversiones-corporativas'))
})

test('un saludo no rutea a ninguna skill (ni escala al modelo)', () => {
  const r = elegirCapacidad('buenas, todo bien?')
  assert.equal(r.resolucion, 'sin_match')
  assert.deepEqual(r.skills, [])
})

test('si habla de un Sheet sin dominio, el criterio de Sheets entra igual (regla del CLAUDE.md)', () => {
  const r = elegirCapacidad('mostrame las pestañas de ese spreadsheet')
  assert.equal(r.resolucion, 'determinista')
  assert.ok(r.skills.includes('google-sheets-business-systems'))
})

test('el modelo NO se consulta cuando el caso es claro', async () => {
  let veces = 0
  const escalar = async () => { veces++; return null }
  for (const frase of ['cuanta caja tengo hoy', 'alta de un oficial uocra', 'te paso el extracto del santander', 'buenas']) {
    await resolverCapacidad(frase, { escalar })
  }
  assert.equal(veces, 0, 'una llamada al modelo antes de cada skill es latencia y plata por nada')
})

test('la ambigüedad real es la ÚNICA puerta al modelo, y el desempate tiene que ser una candidata', async () => {
  // Dos señales débiles y ninguna fuerte: "ticket" (carga de gastos) y "pantalla" (diseño).
  const frase = 'la pantalla del ticket'
  const seco = elegirCapacidad(frase)
  assert.equal(seco.resolucion, 'ambiguo')
  assert.deepEqual(seco.candidatas.sort(), ['carga-gastos-multimedia', 'diseno-ui-ux-producto-os'])

  let veces = 0
  const r = await resolverCapacidad(frase, { escalar: async (_n, cands) => { veces++; return cands[1] } })
  assert.equal(veces, 1)
  assert.equal(r.resolucion, 'determinista')
  assert.equal(r.conModelo, true)
  assert.deepEqual(r.skills, ['diseno-ui-ux-producto-os'])

  // Si el modelo contesta cualquier cosa, NO se le cree: la ambigüedad queda declarada.
  const inventado = await resolverCapacidad(frase, { escalar: async () => 'skill-que-no-existe' })
  assert.equal(inventado.resolucion, 'ambiguo')
})

test('sin `escalar` inyectado, la ambigüedad se devuelve declarada (no se elige al azar)', async () => {
  const r = await resolverCapacidad('la pantalla del ticket')
  assert.equal(r.resolucion, 'ambiguo')
  assert.equal(r.conModelo, false)
})

test('que falle el desempate no tumba el ruteo', async () => {
  const r = await resolverCapacidad('la pantalla del ticket', { escalar: async () => { throw new Error('sin crédito') } })
  assert.equal(r.resolucion, 'ambiguo')
  assert.match(r.motivo, /falló el desempate/)
})

test('el índice propio sólo nombra skills que existen en el catálogo', async () => {
  const { leerCatalogoDeDisco } = await import('./skill-catalogo.mjs')
  const enDisco = new Set((await leerCatalogoDeDisco({})).map((f) => f.clave))
  for (const clave of Object.keys(SKILL_KEYWORDS)) {
    assert.ok(enDisco.has(clave), `${clave} se rutea y no existe en .claude/skills/`)
  }
})

test('elegir una capacidad no cuesta latencia medible', () => {
  const t0 = Date.now()
  for (let i = 0; i < 5000; i++) elegirCapacidad('q pago primero esta semana, tengo el extracto del santander')
  const ms = Date.now() - t0
  assert.ok(ms < 2000, `5.000 elecciones tardaron ${ms} ms; esto corre antes de cada respuesta`)
})

// ── LA POLÍTICA DE CUATRO NIVELES ────────────────────────────────────────────────────────────

test('el nivel sale de la evidencia del catálogo, no de una etiqueta escrita a mano', async () => {
  const { nivelDeRuteo, NIVEL } = await import('./elegir-capacidad.mjs')
  const catalogo = [
    { clave: 'con-motor', modulos: ['orquestador/lib/ingenieria-financiera.mjs'] },
    { clave: 'solo-criterio', modulos: [] },
  ]
  assert.equal(nivelDeRuteo(catalogo, { skills: ['con-motor'], capacidades: ['advise.finance'], confianza: 'alta' }), NIVEL.CAPACIDAD)
  assert.equal(nivelDeRuteo(catalogo, { skills: ['solo-criterio'], capacidades: ['advise.legal'], confianza: 'alta' }), NIVEL.IA_LIVIANA)
  assert.equal(nivelDeRuteo(catalogo, { skills: [], confianza: null }), NIVEL.IA_LIVIANA)
})

test('sin evidencia suficiente, ESCALA (la regla que manda sobre las otras tres)', async () => {
  const { nivelDeRuteo, NIVEL } = await import('./elegir-capacidad.mjs')
  const catalogo = [{ clave: 'con-motor', modulos: ['orquestador/lib/x.mjs'] }]
  // Aunque la skill tenga motor, una elección de confianza baja NO se resuelve rápido y mal.
  assert.equal(nivelDeRuteo(catalogo, { skills: ['con-motor'], confianza: 'baja' }), NIVEL.RAZONAMIENTO)
  assert.equal(nivelDeRuteo(catalogo, { skills: [], resolucion: 'ambiguo' }), NIVEL.RAZONAMIENTO)
  // Multidominio: cruzar dos criterios expertos es trabajo del modelo potente.
  assert.equal(nivelDeRuteo(catalogo, { skills: ['a', 'b'], capacidades: ['advise.finance', 'advise.tax'], confianza: 'alta' }), NIVEL.RAZONAMIENTO)
})

test('una respuesta que no pagó modelo se registra como nivel 0', async () => {
  const { nivelResuelto, NIVEL } = await import('./elegir-capacidad.mjs')
  assert.equal(nivelResuelto([], { resolucionDelChat: 'determinista', skills: [] }), NIVEL.DETERMINISTICO)
  assert.equal(nivelResuelto([], { resolucionDelChat: null, skills: [] }), null, 'un estado transitorio no es una ruta')
})

test('LA COBERTURA NO BAJA: sobre los 49 pedidos reales, la política no pierde ninguna skill esperada', async () => {
  // Es el contrato del pedido del dueño: menos modelo no puede significar peor respuesta. Si
  // alguien afina el ruteo para ahorrar y se lleva puesta una skill, este test se pone rojo.
  const { AREAS } = await import('../scripts/auditar-ruteo-areas.mjs')
  const { skillsSegunProfundidad } = await import('./skill-map.mjs')
  const { classifyDirectiveMulti } = await import('./classify-directive.mjs')
  const cumple = (debe, skills) => (debe.length > 1 ? debe.some((d) => skills.includes(d)) : debe.every((d) => skills.includes(d)))
  const perdidos = []
  let casos = 0
  for (const cs of Object.values(AREAS)) {
    for (const [pregunta, debe, criterio] of cs) {
      casos++
      const antes = skillsSegunProfundidad(classifyDirectiveMulti(pregunta), pregunta, { asesoria: !!criterio })
      const despues = elegirCapacidad(pregunta, { asesoria: !!criterio }).skills
      if (cumple(debe, antes) && !cumple(debe, despues)) perdidos.push({ pregunta, debe, despues })
    }
  }
  assert.ok(casos >= 45, `el corpus se achicó: ${casos} casos`)
  assert.deepEqual(perdidos, [], 'la política dejó de cargar una skill que el ruteo actual sí carga')
})
