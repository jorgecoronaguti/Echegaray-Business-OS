// LO QUE ESTAS PRUEBAS ATRAPAN, Y NO ES "QUE EL CÓDIGO ANDE".
//
// Son dos defectos concretos, los dos ya vistos en este repo:
//
//   1. QUE EL BLOQUE SE DIBUJE PARA QUIEN NO DEBE VERLO. La ficha de anotaciones es la del
//      EMPLEADOR sobre su empleado: si el rol `campo` —que es la propia persona marcando asistencia—
//      la ve, nadie vuelve a anotar nada honesto. La prueba fija los cuatro roles y el `null`.
//   2. QUE ENTRE UNA ANOTACIÓN QUE NO DICE NADA. Cuatro espacios pasan el `not null` de cualquier
//      columna de texto y producen un renglón con fecha, autor y nada escrito.
//
// El permiso se prueba contra la MISMA función que decide en la base (`es_administracion()` ↔
// `esAdministracion()`): si mañana alguien saca al jefe de obra de una de las dos, una de estas se
// pone roja antes de que la pantalla y la RLS se contradigan.

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  autorDeAnotacion, LARGO_MAXIMO, puedeAnotar, validarTextoAnotacion, veAnotaciones,
} from './anotacionesPersona.ts'

test('la ficha del empleador la ven dirección, administración y jefe de obra — campo no', () => {
  assert.equal(veAnotaciones('direccion'), true)
  assert.equal(veAnotaciones('administracion'), true)
  // El jefe de obra administra los maestros desde el 19/08 y es quien ve trabajar a la gente.
  assert.equal(veAnotaciones('jefe_obra'), true)
  // EL CASO QUE IMPORTA: `campo` es la persona misma. Sus anotaciones no son suyas.
  assert.equal(veAnotaciones('campo'), false)
})

test('sin rol legible no se ve nada: falla cerrado', () => {
  // Un usuario sin perfil, o un rol que este código no conoce, no es Administración. El modo de
  // fallar de un default permisivo acá es publicar lo que el empleador escribió de un empleado.
  assert.equal(veAnotaciones(null), false)
  assert.equal(veAnotaciones(undefined), false)
  assert.equal(veAnotaciones('lo_que_sea' as never), false)
})

test('quien puede anotar es exactamente quien puede ver, y campo no escribe en su propia ficha', () => {
  for (const rol of ['direccion', 'administracion', 'jefe_obra'] as const) {
    assert.equal(puedeAnotar(rol), true, `${rol} tiene que poder anotar`)
    assert.equal(puedeAnotar(rol), veAnotaciones(rol), `${rol}: ver y anotar no pueden discrepar hoy`)
  }
  assert.equal(puedeAnotar('campo'), false)
  assert.equal(puedeAnotar(null), false)
})

test('una anotación en blanco no se guarda, y el motivo se dice', () => {
  for (const vacio of ['', '   ', '\n\n', '\t \n']) {
    const r = validarTextoAnotacion(vacio)
    assert.equal(r.ok, false, `«${JSON.stringify(vacio)}» no puede pasar`)
    // El error habla de lo que hay que hacer, no de un `check_violation` de Postgres.
    if (!r.ok) assert.match(r.error, /Escribí la anotación/)
  }
})

test('lo que no es texto tampoco entra: el FormData puede traer cualquier cosa', () => {
  // `Object.fromEntries(form)` devuelve un `File` si alguien manda un campo de archivo con el mismo
  // nombre. Sin esta rama, `.trim()` explota y la pantalla muestra un error de JavaScript.
  for (const raro of [null, undefined, 42, {}, []]) {
    assert.equal(validarTextoAnotacion(raro).ok, false)
  }
})

test('el texto se guarda RECORTADO: lo que se ve es lo que hay', () => {
  const r = validarTextoAnotacion('   Pidió adelanto de quincena.\n  ')
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.texto, 'Pidió adelanto de quincena.')
})

test('el tope es el mismo del textarea, y el error dice cuánto se pasó', () => {
  assert.equal(validarTextoAnotacion('a'.repeat(LARGO_MAXIMO)).ok, true)
  const r = validarTextoAnotacion('a'.repeat(LARGO_MAXIMO + 1))
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.error, new RegExp(`${LARGO_MAXIMO}`))
})

test('los saltos de línea de adentro se respetan: tres renglones son tres renglones', () => {
  const r = validarTextoAnotacion('  Llegó tarde.\nHablé con él.\nQuedamos en el viernes.  ')
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.texto.split('\n').length, 3)
})

test('una anotación sin autor legible dice que la cuenta se dio de baja, no «—»', () => {
  // `creado_por` es `on delete set null`: dar de baja a un jefe no borra lo que observó. La
  // anotación existió y la escribió alguien; lo que se perdió es el nombre, y eso se dice.
  assert.equal(autorDeAnotacion(null), 'cuenta dada de baja')
  assert.equal(autorDeAnotacion('   '), 'cuenta dada de baja')
  assert.equal(autorDeAnotacion('Rodrigo'), 'Rodrigo')
})
