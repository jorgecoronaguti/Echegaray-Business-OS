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
  motivoParaNoCambiarRol, motivoParaNoDesactivar, motivoParaNoRegenerarClave, ultimoIngresoDicho,
  veTodasLasObras, type CuentaEnJuego,
} from './reglas.ts'
import { permisosEfectivos, type UsuarioGestion } from '../types.ts'

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

test('UNA CUENTA QUE NUNCA ENTRÓ NO TIENE FECHA, Y ESO ES UN DATO', () => {
  // La lista de cuentas muestra «último ingreso». Una invitación que nadie usó y una cuenta que
  // entra todos los días son situaciones opuestas: un guión las iguala y esconde la invitación
  // muerta. `null` obliga a la pantalla a escribir «nunca ingresó».
  assert.equal(ultimoIngresoDicho(null), null)
  assert.equal(ultimoIngresoDicho(''), null)

  // Y la hora es la de San Juan, no la del proceso: Vercel corre en UTC, tres horas adelante. Un
  // ingreso de las 23:00 del 19 se anunciaría como «hoy 02:00» del 20 si se mirara el reloj del
  // servidor — día equivocado y hora equivocada, sin un solo error visible.
  const ahora = new Date('2026-08-20T14:00:00Z')
  assert.equal(ultimoIngresoDicho('2026-08-20T02:00:00Z', ahora), 'ayer 23:00')
  assert.equal(ultimoIngresoDicho('2026-08-20T11:04:00Z', ahora), 'hoy 08:04')
})

test('LA PANTALLA NO PUEDE AFIRMAR UN PERMISO QUE LA BASE NIEGA', () => {
  // `ve_obra()` en Postgres da TODAS las obras a Dirección, Administración y jefe de obra. La
  // pantalla decidía lo mismo con `areaDe(rol) === 'administracion'`, que acierta por casualidad:
  // ese es el área de NAVEGACIÓN, no el alcance de obra.
  assert.equal(veTodasLasObras('direccion'), true)
  assert.equal(veTodasLasObras('administracion'), true)
  assert.equal(veTodasLasObras('jefe_obra'), true)
  assert.equal(veTodasLasObras('campo'), false)
  assert.equal(veTodasLasObras(null), false)
})

test('un jefe de obra NO ve la economía, y su ficha tiene que decirlo', () => {
  // Decía «Ve todas las obras, los clientes y la economía» para todo el área Administración — y el
  // jefe de obra está en esa área con `veEconomia` en false. Afirmaba un permiso que no tiene.
  const base = { id: 'u1', nombre: 'Marcos', email: 'm@ecsas.com.ar', obras: [], ultimoIngreso: null, persona: null }
  const jefe = { ...base, rol: 'jefe_obra', area: 'administracion', estado: 'activo' } as UsuarioGestion
  const frase = permisosEfectivos(jefe)
  assert.match(frase, /Entra a todas las obras/)
  assert.match(frase, /No ve el precio de venta ni la economía/)
  assert.doesNotMatch(frase, /Ve los clientes/)

  const direccion = { ...base, rol: 'direccion', area: 'administracion', estado: 'activo' } as UsuarioGestion
  assert.match(permisosEfectivos(direccion), /Ve los clientes, el precio de venta y la economía/)

  // Campo sin obras: entra y no ve NADA. Es lo que hay que poder leer de un vistazo.
  const campo = { ...base, rol: 'campo', area: 'obras', estado: 'activo' } as UsuarioGestion
  assert.match(permisosEfectivos(campo), /Sin obras asignadas/)

  // Y sin acceso, ninguna de las dos preguntas aplica.
  assert.equal(permisosEfectivos({ ...campo, estado: 'sin_acceso' }), 'No puede entrar al sistema.')
})
