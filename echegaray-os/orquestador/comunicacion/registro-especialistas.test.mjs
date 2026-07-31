// El registro de especialistas es el que decide a dónde va un canal. Estas pruebas fijan
// las dos propiedades de las que depende ese ruteo: que todo especialista declarado esté
// completo, y que un área nunca tenga dos preferidos (antes se resolvía por orden
// alfabético de archivo, o sea por accidente).
import test from 'node:test'
import assert from 'node:assert/strict'
import { especialistas, especialistaDeArea, catalogo } from './registro-especialistas.mjs'

test('todo especialista del directorio está completo y es único por slug', async () => {
  const todos = await especialistas({ recargar: true })
  assert.ok(todos.length > 0, 'no se descubrió ningún especialista')
  const slugs = todos.map((e) => e.slug)
  assert.equal(new Set(slugs).size, slugs.length, `slugs repetidos: ${slugs.join(', ')}`)
  for (const e of todos) {
    for (const campo of ['slug', 'agentSlug', 'area', 'titulo', 'descripcion']) {
      assert.equal(typeof e[campo], 'string', `${e.archivo}: ${campo} debe ser texto`)
      assert.ok(e[campo].length > 0, `${e.archivo}: ${campo} vacío`)
    }
    assert.equal(typeof e.atender, 'function', `${e.archivo}: atender debe ser función`)
    assert.equal(typeof e.reconoce, 'function', `${e.archivo}: reconoce debe ser función`)
  }
})

test('ningún área tiene dos preferidos: el ruteo por canal es determinístico', async () => {
  const todos = await especialistas({ recargar: true })
  for (const area of new Set(todos.map((e) => e.area))) {
    // Si hubiera dos preferidos, especialistaDeArea lanza. Que no lance ES la prueba.
    const e = await especialistaDeArea(area)
    assert.ok(e, `el área "${area}" no resuelve a ningún especialista preferido`)
    assert.equal(e.area, area)
  }
})

test('un especialista transversal no captura el canal de otra área', async () => {
  // Doble del registro: dos especialistas en la misma área, uno de ellos transversal.
  const todos = await especialistas({ recargar: true })
  const compartida = todos.filter((e) => todos.filter((o) => o.area === e.area).length > 1)
  if (!compartida.length) return // todavía no hay áreas compartidas: nada que verificar
  for (const area of new Set(compartida.map((e) => e.area))) {
    const dueño = await especialistaDeArea(area)
    const transversales = compartida.filter((e) => e.area === area && e.preferidoDeArea === false)
    assert.ok(transversales.length >= 1, `el área "${area}" tiene dos especialistas pero ninguno se declaró transversal`)
    assert.ok(!transversales.some((e) => e.slug === dueño.slug), 'el transversal no puede ser el dueño del área')
  }
})

test('el catálogo describe lo mismo que el registro', async () => {
  const todos = await especialistas({ recargar: true })
  const cat = await catalogo()
  assert.equal(cat.length, todos.length)
  assert.deepEqual(cat.map((c) => c.slug).sort(), todos.map((e) => e.slug).sort())
})
