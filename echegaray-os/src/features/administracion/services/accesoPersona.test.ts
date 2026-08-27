// LOS PERMISOS QUE LA FICHA AFIRMA TIENEN QUE SER LOS QUE LA BASE DA.
//
// El defecto que estas pruebas atrapan es UNO y es el peor de una pantalla de accesos: decir que
// alguien puede algo que no puede, o al revés. Ya pasó en este repo —`permisosEfectivos` afirmaba
// «ve la economía» para toda el área Administración, y el jefe de obra está en esa área y no la ve—.
//
// Cada aserción está atada a la función que decide de verdad, así que si mañana alguien afloja
// `veEconomia` o `motivoParaNoRegenerarClave`, una de estas se pone roja antes de que la pantalla
// mienta.

import test from 'node:test'
import assert from 'node:assert/strict'
import { permisosDelRol, rutasCerradasPara, veLaCuentaDeOtro, REGLA_ECONOMICO } from './accesoPersona.ts'

const de = (rol: Parameters<typeof permisosDelRol>[0], clave: string) => {
  const p = permisosDelRol(rol).find((x) => x.clave === clave)
  assert.ok(p, `no existe el permiso «${clave}»`)
  return p.tiene
}

test('el jefe de obra administra los maestros y NO tiene permiso económico', () => {
  // Es la distinción del 19/08 y la que ya se afirmó mal una vez: administrar ≠ ver el precio.
  assert.equal(de('jefe_obra', 'Administra los maestros y ve el costo'), true)
  assert.equal(de('jefe_obra', 'Permiso económico'), false)
  assert.equal(de('jefe_obra', 'Gestiona las cuentas y los roles'), false)
  // Y sin embargo entra a todas las obras: son dos ejes distintos y no se contagian.
  assert.equal(de('jefe_obra', 'Entra a todas las obras'), true)
})

test('restablecer contraseñas es SÓLO de Dirección, un escalón más arriba que la economía', () => {
  // Si esto se derivara de `veEconomia`, la ficha le prometería el botón a `administracion` y la
  // acción del servidor se lo rebotaría: la pantalla afirmando un permiso que la acción niega.
  assert.equal(de('direccion', 'Restablece contraseñas'), true)
  assert.equal(de('administracion', 'Restablece contraseñas'), false)
  assert.equal(de('administracion', 'Permiso económico'), true, 'economía sí, contraseña no')
  assert.equal(de('jefe_obra', 'Restablece contraseñas'), false)
  assert.equal(de('campo', 'Restablece contraseñas'), false)
})

test('campo no tiene ninguno de los cinco permisos', () => {
  assert.deepEqual(
    permisosDelRol('campo').filter((p) => p.tiene).map((p) => p.clave),
    [],
  )
})

test('una cuenta SIN rol falla cerrado: ningún permiso, nunca', () => {
  // El modo de fallar de un default permisivo es repartir accesos. `null` es una cuenta creada a
  // mano en Supabase sin perfil, y existe de verdad en producción.
  for (const rol of [null, undefined] as const) {
    assert.deepEqual(permisosDelRol(rol).filter((p) => p.tiene), [], `rol ${rol}`)
  }
})

test('cada permiso dice QUÉ abre: una lista de claves sin detalle no se puede auditar', () => {
  for (const p of permisosDelRol('direccion')) {
    assert.ok(p.detalle.length > 10, `«${p.clave}» sin detalle`)
  }
  assert.match(REGLA_ECONOMICO, /aparte del rol/)
})

test('las rutas cerradas salen del guard, no de una copia', () => {
  const cerradas = rutasCerradasPara('jefe_obra')
  assert.ok(cerradas.includes('/calendario-financiero'))
  assert.ok(cerradas.includes('/administracion/usuarios'))
  assert.ok(cerradas.includes('/presupuestos'))
  // Dirección no tiene ninguna cerrada: si esta lista dejara de estar vacía, el guard cambió.
  assert.deepEqual(rutasCerradasPara('direccion'), [])
  assert.deepEqual(rutasCerradasPara('administracion'), [])
})

test('la solapa se abre con el MISMO predicado que cierra /administracion/usuarios', () => {
  // El defecto que atrapa: si alguien abriera la solapa con `esAdministracion`, la ficha sería el
  // camino largo hasta la pantalla que la lista negra cierra al jefe de obra.
  assert.equal(veLaCuentaDeOtro('direccion'), true)
  assert.equal(veLaCuentaDeOtro('administracion'), true)
  assert.equal(veLaCuentaDeOtro('jefe_obra'), false)
  assert.equal(veLaCuentaDeOtro('campo'), false)
  assert.equal(veLaCuentaDeOtro(null), false)
  // La comprobación cruzada: el que no ve la solapa es exactamente el que tiene esa ruta cerrada.
  for (const rol of ['direccion', 'administracion', 'jefe_obra', 'campo', null] as const) {
    assert.equal(
      veLaCuentaDeOtro(rol),
      !rutasCerradasPara(rol).includes('/administracion/usuarios'),
      `la solapa y la ruta se contradicen para ${rol}`,
    )
  }
})
