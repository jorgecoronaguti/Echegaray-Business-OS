import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import {
  COLUMNA_FECHA_DEL_PAGO, MIGRACION_FECHA_DEL_PAGO, fechaDelPagoSchema, puenteDeLaFecha, puenteParaElPago,
} from './fechaDelPagoEnEfectivo.ts'

// LA FECHA DEL PAGO EN EFECTIVO (02/10/2026). El trigger de la base (probado EJECUTADO en
// orquestador/lib/liquidacion-pago-efectivo.pgreprod.test.mjs) pone la fecha; acá se prueba que la app se la MANDE
// por los dos caminos que cargan un pago —la celda y la marca «Pagar»— y sólo cuando hace falta.

const leer = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const ACCIONES = leer('./liquidacionActions.ts')
const cuerpoDe = (nombre: string): string => {
  const i = ACCIONES.indexOf(`export async function ${nombre}(`)
  assert.ok(i > 0, `no encontré ${nombre}`)
  return ACCIONES.slice(i, i + ACCIONES.slice(i).indexOf('\n}\n'))
}

test('sin fecha o con la de hoy no viaja nada (lo pone la base), con una pasada viaja en la columna puente', () => {
  assert.deepEqual(puenteDeLaFecha(undefined, '2026-10-02'), { ok: true, puente: {} })
  assert.deepEqual(puenteDeLaFecha('2026-10-02', '2026-10-02'), { ok: true, puente: {} })
  assert.deepEqual(puenteDeLaFecha('2026-09-16', '2026-10-02'), { ok: true, puente: { [COLUMNA_FECHA_DEL_PAGO]: '2026-09-16' } })
})

test('una fecha futura se rechaza con palabras, y un día que no existe no pasa el esquema', () => {
  const r = puenteDeLaFecha('2026-10-03', '2026-10-02')
  assert.equal(r.ok, false)
  assert.equal(fechaDelPagoSchema.safeParse('2026-02-31').success, false)
  assert.equal(fechaDelPagoSchema.safeParse('16/09/2026').success, false)
  assert.equal(fechaDelPagoSchema.safeParse('2026-09-16').success, true)
})

test('una fecha elegida con la base sin migrar NO se descarta en silencio: se frena y se dice qué falta', async () => {
  const sin = await puenteParaElPago('2026-09-16', '2026-10-02', async () => false)
  assert.equal(sin.ok, false)
  assert.match(sin.ok ? '' : sin.error, new RegExp(MIGRACION_FECHA_DEL_PAGO))
  // Sin fecha elegida ni se pregunta: guardar un pago de hoy anda con la base de antes y de después.
  let preguntas = 0
  const hoy = await puenteParaElPago(undefined, '2026-10-02', async () => { preguntas++; return false })
  assert.deepEqual(hoy, { ok: true, puente: {} })
  assert.equal(preguntas, 0)
  assert.equal((await puenteParaElPago('2026-09-16', '2026-10-02', async () => true)).ok, true)
})

test('la celda y la marca «Pagar» mandan la fecha a la escritura de la línea (la celda sólo para Pagado efectivo)', () => {
  const celda = cuerpoDe('guardarCeldaLiquidacion')
  assert.match(celda, /if \(campo === 'pagadoEfectivo'\) \{[\s\S]*puenteParaElPago[\s\S]*Object\.assign\(cambios, fecha\.puente\)/)
  const marca = cuerpoDe('marcarLineaPagada')
  assert.match(marca, /puenteParaElPago[\s\S]*Object\.assign\(aEscribir, fecha\.puente\)[\s\S]*\.upsert\(aEscribir/)
})

test('la pantalla manda fecha_pago desde la celda de Pagado efectivo y desde el botón Pagar, y la migración existe', () => {
  const celdas = leer('../components/liquidacion/CeldasDeLiquidacion.tsx')
  assert.match(celdas, /campo === 'pagadoEfectivo' && fechaDelPago \? \{ fecha_pago: fechaDelPago \}/)
  const marca = leer('../components/liquidacion/cuadro/MarcaDePago.tsx')
  assert.match(marca, /fechaDelPago \? \{ fecha_pago: fechaDelPago \}/)
  assert.ok(existsSync(new URL(`../../../../supabase/migrations/${MIGRACION_FECHA_DEL_PAGO}`, import.meta.url)))
  // Las dos raíces de la pantalla de Liquidación montan el proveedor y el campo (una sola fecha por pantalla).
  for (const f of ['../components/liquidacion/BloqueLiquidacion.tsx', '../components/liquidacion/solapas/quincena.tsx']) {
    const t = leer(f)
    assert.match(t, /<ProveedorDeFechaDelPago hoy=\{hoy\}>/, f)
    assert.match(t, /<FechaDelPagoEnEfectivo \/>/, f)
  }
})
