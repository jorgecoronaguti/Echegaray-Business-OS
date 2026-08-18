// LAS REGLAS DE USUARIOS, PROBADAS SIN BASE, SIN SESIÓN Y SIN NAVEGADOR.
//
// Estas reglas deciden quién puede sacar a quién del sistema y quién puede tomar la identidad de
// otro. Son exactamente las que no se pueden ejercitar «probando en producción»: para ver si se
// puede apagar al último administrador habría que apagarlo. Por eso viven separadas de todo `await`
// y se prueban acá, donde corren en milisegundos y entran en `npm run orq:test`.
//
// LAS DOS PRIMERAS ya se ejercitaban desde `tests/usuarios-gestion.spec.ts`, que sólo corre con
// Playwright y una base viva. Se repiten acá a propósito: una regla de seguridad que únicamente se
// verifica cuando alguien decide levantar el navegador termina verificándose casi nunca.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  motivoParaNoCambiarRol, motivoParaNoDesactivar, motivoParaNoRegenerarClave,
  type CuentaEnJuego,
} from './reglas.ts'

const cuenta = (p: Partial<CuentaEnJuego> = {}): CuentaEnJuego => ({
  actorId: 'yo', objetivoId: 'otro', rolActual: 'jefe_obra', adminsActivos: 3, ...p,
})

test('nadie se saca el acceso ni se cambia el rol a sí mismo', () => {
  const propia = cuenta({ objetivoId: 'yo' })
  assert.ok(motivoParaNoDesactivar(propia), 'pudo sacarse el acceso a sí mismo')
  assert.ok(motivoParaNoCambiarRol(propia, 'direccion'), 'pudo cambiarse el rol a sí mismo')
})

test('no se apaga al último administrador, ni sacándole el acceso ni bajándole el rol', () => {
  const ultimo = cuenta({ rolActual: 'direccion', adminsActivos: 1 })
  assert.ok(motivoParaNoDesactivar(ultimo), 'apagó al último administrador')
  assert.ok(motivoParaNoCambiarRol(ultimo, 'jefe_obra'), 'degradó al último administrador')
  // Con otro administrador vivo las dos puertas se abren: la regla protege al ÚLTIMO, no al rol.
  const acompañado = cuenta({ rolActual: 'direccion', adminsActivos: 2 })
  assert.equal(motivoParaNoDesactivar(acompañado), null)
  assert.equal(motivoParaNoCambiarRol(acompañado, 'jefe_obra'), null)
})

// ═══ LA CONTRASEÑA ═══
//
// Quien puede ponerle la clave a alguien puede entrar como ese alguien. Si `administracion`
// pudiera, le pondría la clave a una cuenta de Dirección y entraría con ella: una promoción sin
// tocar un solo rol. El defecto que este test atrapa es que alguien «unifique» este portón con el
// de las demás acciones usando `esAdministracion()`, que es la simplificación que parece obvia.

test('sólo Dirección regenera contraseñas — Administración NO, y el motivo se dice', () => {
  assert.equal(motivoParaNoRegenerarClave('direccion'), null)
  for (const rol of ['administracion', 'jefe_obra', 'campo', null, undefined] as const) {
    const motivo = motivoParaNoRegenerarClave(rol)
    assert.ok(motivo, `${rol} pudo regenerar una contraseña`)
    // Devolver el TEXTO y no un booleano es lo que obliga a la pantalla a decir por qué: un `false`
    // mudo termina siempre en un botón escondido sin explicación.
    assert.match(motivo, /Dirección/)
  }
})
