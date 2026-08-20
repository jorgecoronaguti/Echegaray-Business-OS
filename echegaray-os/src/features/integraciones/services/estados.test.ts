import assert from 'node:assert/strict'
import { test } from 'node:test'
import { lecturaHerramienta, lecturaPedido, necesitanAtencion } from './estados.ts'
import { ultimoResponsable } from './herramientasService.ts'

// ═══ LOS DEFECTOS QUE ESTOS TESTS ATRAPAN ═══
//
// 1. Un estado NORMAL pintado como problema (o como logro). «Pendiente» no es rojo y «En uso» no es
//    verde: si lo fueran, la columna de estado sería el elemento más ruidoso de la pantalla y el
//    color dejaría de significar el día que sí haya un problema.
// 2. Un estado FALTANTE inventado como si fuera uno real.
// 3. El responsable de una herramienta elegido por el orden en que vino la consulta, no por fecha.

test('un pedido entregado es lo único positivo; pendiente y pedido no llevan color', () => {
  assert.equal(lecturaPedido('ENTREGADO').tono, 'pos')
  assert.equal(lecturaPedido('PENDIENTE').tono, 'pendiente')
  assert.equal(lecturaPedido('PEDIDO').tono, 'curso')
  assert.equal(lecturaPedido('en camino').tono, 'curso')
})

test('un pedido sin estado NO es «pendiente»: es «sin estado» y se escribe en faint', () => {
  for (const vacio of [null, undefined, '', '   ']) {
    const l = lecturaPedido(vacio)
    assert.equal(l.tono, 'nulo', `«${String(vacio)}» se inventó un estado`)
    assert.equal(l.clave, 'sin_estado')
  }
})

test('un estado que la fuente trae y acá no está declarado se muestra, no se borra', () => {
  const l = lecturaPedido('RECHAZADO POR EL PROVEEDOR')
  assert.equal(l.label, 'RECHAZADO POR EL PROVEEDOR')
  assert.equal(l.tono, 'curso')
})

test('los cinco estados canónicos de una herramienta llevan el tono del servicio', () => {
  assert.equal(lecturaHerramienta('disponible').tono, 'pos')
  assert.equal(lecturaHerramienta('en_uso').tono, 'curso') // NEUTRO: trabajar no es un logro
  assert.equal(lecturaHerramienta('en_reparacion').tono, 'warn')
  assert.equal(lecturaHerramienta('fuera_servicio').tono, 'neg')
  assert.equal(lecturaHerramienta('perdida').tono, 'neg')
})

test('una herramienta sin estado no se asume disponible', () => {
  // `estadoInfo()` devuelve ESTADOS[0] («Disponible») cuando no encuentra el estado. Para PINTAR,
  // eso sería afirmar que una herramienta que nadie revisó está lista para usarse.
  assert.equal(lecturaHerramienta(null).clave, 'sin_estado')
  assert.equal(lecturaHerramienta('cualquier_cosa').clave, 'sin_estado')
})

test('«necesitan atención» son las tres que no están ni disponibles ni trabajando', () => {
  assert.equal(necesitanAtencion(['disponible', 'en_uso', 'en_reparacion', 'perdida', null]), 2)
  assert.equal(necesitanAtencion(['disponible', 'en_uso']), 0)
})

const M = (id: string, responsable: string | null, fecha: string | null) => ({
  id_herramienta: id,
  responsable,
  fecha,
})

test('el responsable sale del movimiento MÁS NUEVO, aunque la lista venga desordenada', () => {
  const r = ultimoResponsable([
    M('h1', 'L. Cabrera', '2026-07-22'),
    M('h1', 'M. Duarte', '2026-08-04'),
    M('h2', 'Taller', '2026-06-10'),
  ])
  assert.equal(r.get('h1'), 'M. Duarte')
  assert.equal(r.get('h2'), 'Taller')
})

test('un movimiento SIN FECHA no le gana a uno fechado', () => {
  // PostgREST ubica los null según cómo se pidió el `order`: si el primero de la lista ganara,
  // una fila sin fecha publicaría un responsable que ya no tiene la herramienta.
  const r = ultimoResponsable([M('h1', 'Nadie', null), M('h1', 'M. Duarte', '2026-08-04')])
  assert.equal(r.get('h1'), 'M. Duarte')
})

test('un movimiento sin responsable no borra al anterior ni inventa uno', () => {
  const r = ultimoResponsable([M('h1', 'M. Duarte', '2026-08-04'), M('h1', null, '2026-08-09')])
  assert.equal(r.get('h1'), 'M. Duarte')
  assert.equal(r.has('h2'), false)
})
