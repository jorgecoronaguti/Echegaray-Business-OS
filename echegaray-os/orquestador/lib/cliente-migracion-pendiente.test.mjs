// GUARDAR DE MENOS EN SILENCIO — el defecto que este archivo existe para impedir.
//
// ═══ LA SITUACIÓN ═══
//
// La migración que agrega dirección, teléfono, email y responsable está en el repositorio y NO en la
// base (aplicarla no es de un agente). Sin ninguna defensa, escribir esos campos devuelve PGRST204 y
// el alta y la edición de cualquier cliente quedan rotas — incluso para corregir una nota.
//
// La salida fácil es reintentar sin esas columnas y contestar «guardado». Es exactamente la falla
// que el OS no admite: alguien escribe el teléfono del cliente, la pantalla dice que sí, y el
// teléfono no existe en ningún lado. La pantalla que responde que sí NO es evidencia de la escritura.
//
// Este test fija las dos mitades de la regla:
//   · sin dato nuevo → se reintenta sin esas columnas, porque no se perdió nada;
//   · CON dato nuevo → no se escribe nada y se avisa con el nombre de la migración.
//
// Si alguien «simplifica» borrando los cuatro campos siempre, el segundo caso se pone rojo.
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  CAMPOS_DE_LA_RELACION, MIGRACION, faltaLaRelacion, mensajeDeMigracion, sinLaRelacion,
} from '../../src/features/clientes/services/migracionPendiente.ts'

const fichaVacia = () => ({
  nombre: 'ARCOR', cuit: '30500018944', slug: 'arcor', notas: null, drive_carpeta_id: null,
  direccion: null, telefono: null, email: null, responsable_id: null,
})

test('sin ningún dato de la relación, la fila se puede reintentar sin esas columnas', () => {
  const reducida = sinLaRelacion(fichaVacia())
  assert.ok(reducida, 'hay reintento posible: no se pierde nada')
  for (const k of CAMPOS_DE_LA_RELACION) {
    assert.ok(!(k in reducida), `${k} no puede viajar a una base que no la tiene`)
  }
  assert.equal(reducida.nombre, 'ARCOR', 'lo que sí se puede guardar se guarda')
  assert.equal(reducida.cuit, '30500018944')
})

test('con UN dato de la relación cargado NO hay reintento: se corta', () => {
  for (const campo of CAMPOS_DE_LA_RELACION) {
    const fila = { ...fichaVacia(), [campo]: campo === 'responsable_id' ? 'un-uuid' : 'algo' }
    assert.equal(sinLaRelacion(fila), null, `${campo} cargado tiene que cortar la escritura`)
  }
})

test('un valor que parece vacío pero es un valor tampoco se tira', () => {
  // `0` y `false` no son ausencias. Un `!fila[k]` en vez de `!= null` los perdería sin decir nada.
  assert.equal(sinLaRelacion({ ...fichaVacia(), telefono: 0 }), null)
  assert.equal(sinLaRelacion({ ...fichaVacia(), direccion: '' }), null)
})

test('reconoce las dos formas en que la base dice «no tengo esa columna»', () => {
  assert.equal(faltaLaRelacion({ code: 'PGRST204' }), true, 'PostgREST no la conoce')
  assert.equal(faltaLaRelacion({ code: '42703' }), true, 'Postgres tampoco')
  // Y NO se traga cualquier error: una violación de clave única o un permiso denegado tienen que
  // llegar tal cual. Tratarlos como «falta la migración» mandaría a buscar el problema al lugar
  // equivocado, que es lo que ya pasó medio día con una guarda de formato.
  assert.equal(faltaLaRelacion({ code: '23505' }), false, 'clave repetida')
  assert.equal(faltaLaRelacion({ code: '42501' }), false, 'permiso denegado')
  assert.equal(faltaLaRelacion(null), false)
  assert.equal(faltaLaRelacion(undefined), false)
})

test('el aviso dice qué falta, qué NO se guardó y cómo se arregla', () => {
  const m = mensajeDeMigracion({ message: "Could not find the 'direccion' column" })
  assert.ok(m.includes(MIGRACION), 'nombra la migración: sin eso nadie sabe qué aplicar')
  assert.ok(/no guardé nada/i.test(m), 'dice explícitamente que no quedó nada a medias')
  assert.ok(m.includes("Could not find the 'direccion' column"),
    'el detalle crudo viaja: el día que falte OTRA columna, un texto fijo manda a buscar al lugar equivocado')
})
