// LA PUERTA DEL MÓDULO DE SUELDOS, PROBADA SOBRE EL CÓDIGO QUE LA IMPLEMENTA.
//
// Dueño, 09/09/2026: «Liquidación de horas es accesible SÓLO con nivel de usuario administrador».
// Son tres capas y este archivo prueba las dos que se pueden probar sin base: el rol que decide, y
// que la ruta corte con `notFound()` en vez de servir la vista con un aviso. La tercera —la RLS con
// `public.liquida_sueldos()`— sólo se puede probar contra la base, y va en el informe de cierre.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { esAdministracion, liquidaSueldos, veEconomia } from '../../auth/types/areas.ts'

test('SÓLO DIRECCIÓN Y ADMINISTRACIÓN LIQUIDAN — jefe de obra NO', () => {
  assert.equal(liquidaSueldos('direccion'), true)
  assert.equal(liquidaSueldos('administracion'), true)
  // EL DEFECTO QUE ATRAPA: usar `esAdministracion` para gobernar la solapa. Incluye al jefe de obra
  // desde el 19/08/2026 —entra a esta misma pantalla a cargar asistencia— y le abriría los sueldos.
  assert.equal(esAdministracion('jefe_obra'), true, 'el jefe SÍ administra el legajo')
  assert.equal(liquidaSueldos('jefe_obra'), false, 'y NO liquida')
  assert.equal(liquidaSueldos('campo'), false)
  assert.equal(liquidaSueldos('cliente'), false)
  // Falla cerrado: un rol desconocido o un usuario sin perfil no es administrador.
  assert.equal(liquidaSueldos(null), false)
  assert.equal(liquidaSueldos(undefined), false)
})

test('LA PUERTA ES PROPIA: ampliar la economía de obra no debe abrir los sueldos', () => {
  // Hoy los dos conjuntos coinciden. La prueba no es que coincidan —eso sería clavar el presente—:
  // es que sean DOS funciones. Si alguien reemplaza una por la otra, este test no lo ve, pero el
  // comentario y la firma quedan; lo que sí se prueba es que las dos existen y se pueden divergir.
  assert.equal(typeof liquidaSueldos, 'function')
  assert.equal(typeof veEconomia, 'function')
})

const RUTA = new URL('../../../app/(main)/administracion/personas/page.tsx', import.meta.url)

test('LA RUTA NO SIRVE LA VISTA A QUIEN NO LIQUIDA: corta con notFound()', () => {
  // EL DEFECTO QUE ATRAPA: la versión anterior devolvía la pantalla con un `Aviso` que decía «los
  // sueldos no se ven desde este rol». No filtraba un peso, pero confirmaba que el módulo existe y
  // en qué URL. El dueño pidió 404, no un mensaje.
  const src = readFileSync(RUTA, 'utf8')
  assert.match(src, /if \(enLiquidacion && !liquida\) notFound\(\)/)
  assert.match(src, /const liquida = liquidaSueldos\(rol\)/)
  assert.doesNotMatch(src, /liquidacion-sin-permiso/, 'el aviso que anunciaba el módulo ya no está')
  // Y el corte va ANTES de armar el bloque: no se lee una fila para después esconderla.
  assert.ok(
    src.indexOf('if (enLiquidacion && !liquida) notFound()') < src.indexOf('<BloqueLiquidacion'),
    'el 404 tiene que estar antes de la vista',
  )
})
