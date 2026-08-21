import test from 'node:test'
import assert from 'node:assert/strict'
import { puedeVerRuta, RUTAS_SOLO_ECONOMIA } from '../../auth/types/areas.ts'

// Las mismas seis que declara NavAdministracionTabs. Si alguien agrega una allá y no acá, el
// último test lo dice.
const VISTAS = ['/clientes', '/presupuestos', '/administracion/usuarios', '/administracion/personas',
  '/administracion/proveedores', '/administracion/pendientes']

test('el jefe de obra NO ve Usuarios ni Presupuestos: son la puerta a la economía', () => {
  const suyas = VISTAS.filter((v) => puedeVerRuta('jefe_obra', v))
  assert.deepEqual(suyas, ['/clientes', '/administracion/personas',
    '/administracion/proveedores', '/administracion/pendientes'])
})

test('dirección y administración ven las seis', () => {
  for (const rol of ['direccion', 'administracion'] as const) {
    assert.equal(VISTAS.filter((v) => puedeVerRuta(rol, v)).length, 6, `${rol} perdió una solapa`)
  }
})

test('sin rol todavía cargado, las restringidas NO se dibujan: falla cerrado', () => {
  // Una solapa que aparece medio segundo y desaparece es peor que una que tarda en aparecer.
  const suyas = VISTAS.filter((v) => puedeVerRuta(null, v))
  assert.ok(!suyas.includes('/administracion/usuarios'))
  assert.ok(!suyas.includes('/presupuestos'))
})

test('la barra y la puerta usan el MISMO portero: toda ruta económica de la barra está en la lista', () => {
  // Es lo que impide que vuelvan a discrepar. Si mañana alguien agrega una ruta económica a la
  // barra y se olvida de la lista, el jefe la ve y el middleware lo rebota — otra vez.
  const economicasEnLaBarra = VISTAS.filter((v) => !puedeVerRuta('jefe_obra', v))
  for (const v of economicasEnLaBarra) {
    assert.ok(RUTAS_SOLO_ECONOMIA.some((r) => v === r || v.startsWith(r + '/')),
      `${v} no se le dibuja al jefe pero no está declarada en RUTAS_SOLO_ECONOMIA`)
  }
})
