// LOS DEFECTOS QUE ESTOS TESTS ATRAPAN:
//
//   · QUE UN CAMPO VACÍO SE GUARDE COMO "" Y NO COMO NULL. La agenda dibuja «sin teléfono» sólo con
//     null; un "" se vería como un teléfono en blanco.
//   · QUE UN MAIL MAL ESCRITO ENTRE. Un mail que no llega es peor que ninguno: nadie lo corrige.
//   · QUE EL SERVIDOR ACEPTE LO QUE EL FORMULARIO NO DEJA ESCRIBIR (topes de 120/60/400).
//   · QUE UN CONTACTO SIN NOMBRE —o con un nombre de un carácter o sólo espacios— se guarde.
//   · QUE UN ARCHIVO VIAJE COMO TEXTO en un POST armado a mano.
//   · QUE LA TABLA QUE FALTA SE LEA COMO UN ERROR CUALQUIERA: son dos códigos, Postgres y PostgREST.

import test from 'node:test'
import assert from 'node:assert/strict'
import { faltaLaTabla, leerContacto } from './contacto.ts'

const form = (o: Record<string, string>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(o)) f.set(k, v)
  return f
}

test('un contacto como lo carga Administración: vacíos a null, espacios fuera', () => {
  const r = leerContacto(form({ nombre: '  ariel gomez ', rol: 'cobranzas', email: '', telefono: ' 264 155 1234 ', notas: '' }))
  assert.deepEqual(r, {
    ok: true,
    fila: { nombre: 'ariel gomez', rol: 'cobranzas', email: null, telefono: '264 155 1234', notas: null },
  })
})

test('sólo el nombre alcanza: el resto es opcional y queda en null', () => {
  const r = leerContacto({ nombre: 'Tito' })
  assert.deepEqual(r, { ok: true, fila: { nombre: 'Tito', rol: null, email: null, telefono: null, notas: null } })
})

test('sin nombre, o con uno de un carácter o de puros espacios, no hay contacto', () => {
  for (const nombre of ['', 'a', '    ']) {
    const r = leerContacto(form({ nombre }))
    assert.equal(r.ok, false, `aceptó ${JSON.stringify(nombre)}`)
    if (!r.ok) assert.match(r.error, /nombre/i)
  }
  assert.equal(leerContacto(form({ rol: 'comercial' })).ok, false)
})

test('un mail mal escrito se rechaza y dice por qué; uno bien escrito pasa', () => {
  const mal = leerContacto(form({ nombre: 'Ariel', email: 'ariel@hierros' }))
  assert.equal(mal.ok, false)
  if (!mal.ok) assert.match(mal.error, /email/i)
  const bien = leerContacto(form({ nombre: 'Ariel', email: ' ventas@hierrosdelcentro.com.ar ' }))
  assert.equal(bien.ok, true)
  if (bien.ok) assert.equal(bien.fila.email, 'ventas@hierrosdelcentro.com.ar')
})

test('los topes del formulario valen en el servidor', () => {
  assert.equal(leerContacto({ nombre: 'x'.repeat(121) }).ok, false)
  assert.equal(leerContacto({ nombre: 'x'.repeat(120) }).ok, true)
  assert.equal(leerContacto({ nombre: 'Ariel', telefono: '9'.repeat(61) }).ok, false)
  assert.equal(leerContacto({ nombre: 'Ariel', rol: 'r'.repeat(121) }).ok, false)
  assert.equal(leerContacto({ nombre: 'Ariel', notas: 'n'.repeat(401) }).ok, false)
  assert.equal(leerContacto({ nombre: 'Ariel', notas: 'n'.repeat(400) }).ok, true)
})

test('un archivo en lugar de texto no es un contacto', () => {
  const f = new FormData()
  f.set('nombre', new Blob(['Ariel']), 'nombre.txt')
  assert.equal(leerContacto(f).ok, false)
})

test('la tabla que falta: 42P01 de Postgres y PGRST205 de PostgREST; nada más', () => {
  assert.equal(faltaLaTabla({ code: '42P01' }), true)
  assert.equal(faltaLaTabla({ code: 'PGRST205' }), true)
  assert.equal(faltaLaTabla({ code: '42501' }), false)
  assert.equal(faltaLaTabla(null), false)
  assert.equal(faltaLaTabla(undefined), false)
})
