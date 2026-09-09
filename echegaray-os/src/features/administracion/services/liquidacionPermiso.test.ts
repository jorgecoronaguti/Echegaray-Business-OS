// LA GUARDA DE SERVIDOR DE LA LIQUIDACIÓN, PROBADA SOBRE EL CÓDIGO QUE LA IMPLEMENTA.
//
// El test de la ruta (`liquidacionSoloAdmin.test.ts`) prueba la PANTALLA. Éste prueba el ENDPOINT:
// una server action se llama sin abrir jamás la pantalla, así que el 404 de la ruta no la protege.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MENSAJE_SIN_PERFIL,
  MENSAJE_SIN_PERMISO,
  permisoDeLiquidacion,
} from './liquidacionPermiso.ts'

test('EL JEFE DE OBRA ES RECHAZADO; ADMINISTRACIÓN Y DIRECCIÓN PASAN', () => {
  // EL DEFECTO QUE ATRAPA: usar `esAdministracion` (que incluye al jefe de obra desde el 19/08/26)
  // para gobernar la escritura de sueldos. Con esa función, esta línea daría `true`.
  assert.deepEqual(permisoDeLiquidacion('jefe_obra'), { ok: false, error: MENSAJE_SIN_PERMISO })
  assert.deepEqual(permisoDeLiquidacion('administracion'), { ok: true })
  assert.deepEqual(permisoDeLiquidacion('direccion'), { ok: true })
})

test('FALLA CERRADO: rol desconocido, sin perfil, o perfil ilegible', () => {
  assert.equal(permisoDeLiquidacion('campo').ok, false)
  assert.equal(permisoDeLiquidacion('cliente').ok, false)
  assert.equal(permisoDeLiquidacion(null).ok, false)
  assert.equal(permisoDeLiquidacion(undefined).ok, false)
  // Un error de lectura del perfil NO es «pasá igual»: es un no, y con otro mensaje para que se
  // pueda distinguir un problema de base de una falta de permiso.
  assert.deepEqual(permisoDeLiquidacion('administracion', new Error('timeout')), {
    ok: false,
    error: MENSAJE_SIN_PERFIL,
  })
})

const ACTIONS = new URL('./liquidacionActions.ts', import.meta.url)

test('TODAS LAS ESCRITURAS CRUZAN LA GUARDA, Y ANTES DE TOCAR LA BASE', () => {
  // Sin base no se puede ejecutar la action; lo que sí se puede probar es que el llamado existe y
  // que está antes del primer `cabecera(...)`, que es lo que CREA la quincena. Rechazar después
  // dejaría una cabecera abierta por alguien que no puede liquidar.
  //
  // EL CONTEO NO SE CLAVA: se cuentan las acciones exportadas y se exige una guarda por cada una.
  // Un número fijo obliga a editar el test al agregar la quinta acción, y ese día el camino corto
  // es subir el número — que es exactamente cómo entra una escritura sin guarda (09/09/2026: eran
  // dos, se agregaron `guardarCeldaLiquidacion` y `guardarValorHora`).
  const src = readFileSync(ACTIONS, 'utf8')
  const acciones = (src.match(/^export async function \w+\(/gm) ?? []).length
  assert.ok(acciones >= 2, 'el módulo tiene acciones exportadas')
  const guardas = src.match(/const permiso = await puedeLiquidar\(supabase\)/g) ?? []
  assert.equal(guardas.length, acciones, 'una guarda por cada acción exportada')
  assert.equal(
    (src.match(/if \(!permiso\.ok\) return \{ ok: false, error: permiso\.error \}/g) ?? []).length,
    acciones,
  )
  assert.ok(
    src.indexOf('const permiso = await puedeLiquidar(supabase)') <
      src.indexOf('const cab = await cabecera(supabase, v)'),
    'la guarda va antes de abrir la cabecera',
  )
  // Y la guarda pregunta por quien LIQUIDA: la decisión está en el módulo puro de arriba, donde
  // este mismo archivo ya probó que el jefe de obra da `false`.
  assert.match(src, /import \{ permisoDeLiquidacion, type PermisoLiquidacion \} from '\.\/liquidacionPermiso'/)
})
