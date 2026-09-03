// LOS PANELES SE COMPARTEN POR ENLACE, O NO SON ESTADO DE URL.
//
// El defecto que estos tests impiden es silencioso y molesto: abrir una partida desde la vista de
// costos y volver a la de oferta, o quedar con `?atencion=1` pegado para siempre porque el enlace de
// cerrar no lo saca. Ninguno rompe nada — sólo hace que la pantalla se sienta mal hecha, que es la
// razón por la que la versión anterior se rechazó.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { aliasPartida, hrefEntorno, leerEstadoUrl, partidaDelInspector } from './rutas.ts'

describe('lo que se lee de la URL', () => {
  test('sin parámetros se abre en costos: se viene a trabajar el costo', () => {
    assert.deepEqual(leerEstadoUrl({}), { vista: 'costos', insp: null, atencion: false, nueva: false })
  })

  test('una vista desconocida no rompe la pantalla: cae en costos', () => {
    assert.equal(leerEstadoUrl({ vista: 'cualquiera' }).vista, 'costos')
  })

  test('los paneles se leen como banderas explícitas, no como «presente»', () => {
    assert.equal(leerEstadoUrl({ atencion: '0' }).atencion, false)
    assert.equal(leerEstadoUrl({ atencion: '1' }).atencion, true)
  })

  test('un parámetro repetido toma el primero en vez de romper', () => {
    assert.equal(leerEstadoUrl({ vista: ['oferta', 'costos'] }).vista, 'oferta')
  })
})

describe('el inspector', () => {
  test('abre la partida que nombra', () => {
    assert.equal(partidaDelInspector('partida:abc-123'), 'abc-123')
  })

  test('un inspector de otra cosa NO se lee como partida', () => {
    assert.equal(partidaDelInspector('recurso:cemento'), null)
  })

  test('un `insp` vacío o mal formado no abre nada', () => {
    assert.equal(partidaDelInspector('partida:'), null)
    assert.equal(partidaDelInspector(null), null)
  })
})

describe('el alias viejo sigue vivo', () => {
  test('`?partida=x` se traduce a `insp=partida:x`', () => {
    assert.equal(aliasPartida({ partida: 'x' }), 'partida:x')
  })

  test('sin alias no hay redirección: una URL nueva no rebota en bucle', () => {
    assert.equal(aliasPartida({ insp: 'partida:x' }), null)
  })
})

describe('el armado del enlace', () => {
  const base = leerEstadoUrl({ vista: 'oferta' })

  test('la vista se conserva al abrir un panel', () => {
    assert.equal(
      hrefEntorno('c1', base, { insp: 'partida:p9' }),
      '/presupuestos/c1?vista=oferta&insp=partida%3Ap9',
    )
  })

  test('cerrar el inspector deja la vista y la cola como estaban', () => {
    const conTodo = leerEstadoUrl({ vista: 'costos', insp: 'partida:p9', atencion: '1' })
    assert.equal(
      hrefEntorno('c1', conTodo, { insp: null }),
      '/presupuestos/c1?vista=costos&atencion=1',
    )
  })

  test('lo que está apagado NO viaja en la URL: nada de `atencion=0` pegado', () => {
    const url = hrefEntorno('c1', leerEstadoUrl({}))
    assert.equal(url, '/presupuestos/c1?vista=costos')
    assert.ok(!url.includes('atencion'))
    assert.ok(!url.includes('nueva'))
  })

  test('el alta de partida vive dentro del inspector, no como bloque suelto', () => {
    assert.match(hrefEntorno('c1', base, { nueva: true }), /nueva=1/)
  })
})

describe('MUTACIÓN — el control puede dar rojo', () => {
  test('un armador que ignorara la vista rompería el ida y vuelta', () => {
    const ingenuo = (id: string, e: { insp: string | null }) =>
      `/presupuestos/${id}${e.insp ? `?insp=${e.insp}` : ''}`
    const base = leerEstadoUrl({ vista: 'oferta' })
    assert.notEqual(ingenuo('c1', { insp: 'partida:p9' }), hrefEntorno('c1', base, { insp: 'partida:p9' }))
    assert.ok(!ingenuo('c1', { insp: 'partida:p9' }).includes('vista=oferta'),
      'si el ingenuo conservara la vista, este test no probaría nada')
  })
})
