// LO QUE ESTE TEST ATRAPA — todos defectos que dibujan un error como otra cosa:
//
//   1. TRAGARSE EL MENSAJE DE LA FUENTE. El contrato dice «el mensaje real de la fuente»: si el
//      diagnóstico lo reemplaza por una frase amable, la pantalla deja de decir qué arreglar.
//   2. DECIR «REINTENTÁ» ANTE UN PROBLEMA DE PERMISOS. Reintentar mil veces no crea un `grant`, y
//      esa confusión ya costó horas de buscar el defecto en el lugar equivocado.
//   3. PERDER EL `digest`. En producción Next borra el texto del error y deja sólo ese código: sin
//      mostrarlo, el error de la persona no se puede encontrar en el registro del servidor.
//   4. BUSCAR HUELLAS DENTRO DEL PÁRRAFO DE NEXT, que habla de Next y no del defecto.

import test from 'node:test'
import assert from 'node:assert/strict'
import { diagnosticar } from './diagnostico.ts'

test('el mensaje de la fuente se muestra tal cual, nunca reemplazado', () => {
  const d = diagnosticar({ message: 'permission denied for table obras' })
  assert.equal(d.detalle, 'permission denied for table obras')
})

test('permiso: reconoce el caso y NO ofrece reintentar como solución', () => {
  for (const m of ['permission denied for table obras', 'new row violates row-level security policy', 'error 42501']) {
    const d = diagnosticar({ message: m })
    assert.equal(d.clave, 'permiso', `no reconoció: ${m}`)
    assert.equal(d.sirveReintentar, false)
    assert.match(d.queHacer ?? '', /Administración/)
  }
})

test('sesión vencida: no se confunde con un problema de red', () => {
  const d = diagnosticar({ message: 'JWT expired' })
  assert.equal(d.clave, 'sesion')
  assert.equal(d.sirveReintentar, false)
})

test('red: es el caso donde reintentar sí puede resolver', () => {
  const d = diagnosticar({ message: 'TypeError: fetch failed' })
  assert.equal(d.clave, 'red')
  assert.equal(d.sirveReintentar, true)
  assert.equal(d.queHacer, null)
})

test('la mordaza de producción no se muestra como si fuera el detalle, y publica el código', () => {
  const mordaza =
    'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details.'
  const d = diagnosticar({ message: mordaza, digest: '2842731123' })
  assert.equal(d.clave, 'servidor-sin-detalle')
  assert.equal(d.detalle, null, 'el párrafo de Next no es el mensaje de la fuente')
  assert.equal(d.digest, '2842731123')
  assert.match(d.queHacer ?? '', /2842731123/)
})

test('sin mensaje y sin digest, lo dice: no hay código para buscarlo', () => {
  const d = diagnosticar({})
  assert.equal(d.clave, 'servidor-sin-detalle')
  assert.equal(d.digest, null)
  assert.match(d.queHacer ?? '', /no dejó código/)
})

test('la mordaza gana sobre las huellas: el párrafo de Next no habla del defecto', () => {
  // «production» y «permission» no se parecen, pero un mensaje amordazado que además mencione una
  // tabla no debe leerse como un problema de permisos: no hay evidencia de eso.
  const d = diagnosticar({
    message: 'The specific message is omitted in production builds. permission denied',
    digest: 'abc',
  })
  assert.equal(d.clave, 'servidor-sin-detalle')
})

test('esquema: una tabla que no existe es un despliegue incompleto, no algo para reintentar', () => {
  const d = diagnosticar({ message: 'relation "public.obra_panel" does not exist' })
  assert.equal(d.clave, 'esquema')
  assert.equal(d.sirveReintentar, false)
  assert.match(d.queHacer ?? '', /migración/)
})

test('un error desconocido no se disfraza: se admite y se muestra crudo', () => {
  const d = diagnosticar({ message: 'algo rarísimo pasó' })
  assert.equal(d.clave, 'desconocido')
  assert.equal(d.detalle, 'algo rarísimo pasó')
  assert.equal(d.queHacer, null)
  assert.equal(d.sirveReintentar, true)
})

test('null no rompe: un error sin objeto sigue siendo un error', () => {
  const d = diagnosticar(null)
  assert.equal(d.clave, 'servidor-sin-detalle')
  assert.equal(d.detalle, null)
})
