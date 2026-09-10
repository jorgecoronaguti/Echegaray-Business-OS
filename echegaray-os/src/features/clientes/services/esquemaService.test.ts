// CONTRA QUÉ CONTRATO SE CONTROLA EL ESQUEMA DE PAGO (pantalla 32), Y DÓNDE ESTÁ ESA DEFINICIÓN.
//
// ═══ EL DEFECTO QUE ESTAS PRUEBAS IMPIDEN (10/09/2026, verificado en producción) ═══
//
// La ficha de Messina publicaba «$31,85 M contrato» y la alarma «El esquema asigna $204,61 M MÁS
// que el contrato». Los $31,85 M son la suma de `obra_panel.monto_contratado` —el campo del
// formulario— y en ese cliente sólo está cargado en las CINCO obras cerradas. Lo contratado de
// verdad, el que publica la pestaña OBRAS, es $156.174.253 en las cinco obras en curso.
//
// La primera corrección sumó bien PERO ACÁ, en el servicio, mientras la ficha sumaba en su página,
// la lista en `armarCartera` y el panel lateral leía `cliente_panel.contratado`. Cuatro sumas y
// ninguna canónica. Desde el hito H1 la suma la hace `public.contratado_de_cliente()` y este
// servicio sólo lee `cliente_economia.contratado_en_curso`.
//
// ═══ POR QUÉ ESTE TEST MIRA UN ARCHIVO .sql ═══
//
// La regla se mudó a la base y ya no hay función TypeScript que ejercitar: probar el servicio
// contra un doble de Supabase sólo probaría el doble. Lo que sí se puede probar sin base —y es lo
// que se rompería en silencio— es que la DEFINICIÓN de la migración siga siendo la que se acordó:
// suma de `obra_economia_sheet`, obras no fusionadas, y NUNCA el campo del formulario. Es el mismo
// criterio de `prefetch-en-listas.test.ts`: cuando la regla vive en el fuente, el test lee el
// fuente.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { hayCambiosSinPublicar, proximoVencimiento } from './esquemaService.ts'
import type { PagoEsquema } from '../types'

const MIGRACION = 'supabase/migrations/20260910T2110_cliente_economia.sql'
const sql = readFileSync(MIGRACION, 'utf8')

/** El cuerpo de `contratado_de_cliente`, que es la definición única del contratado del cliente. */
function cuerpoDeLaFuncion(): string {
  const desde = sql.indexOf('create or replace function public.contratado_de_cliente')
  assert.notEqual(desde, -1, `${MIGRACION} ya no define contratado_de_cliente`)
  const hasta = sql.indexOf('comment on function public.contratado_de_cliente', desde)
  assert.notEqual(hasta, -1, 'la función perdió su comentario: nadie sabría qué define')
  return sql.slice(desde, hasta)
}

test('el contratado del cliente suma OBRAS, y jamás el campo del formulario', () => {
  const cuerpo = cuerpoDeLaFuncion()
  assert.match(cuerpo, /obra_economia_sheet/, 'la fuente es la réplica de la pestaña OBRAS')
  // `obra_canonica.monto_contratado` es el campo del formulario, la definición que este hito retiró.
  // Si vuelve a aparecer acá, la base publicaría otra vez los $31,85 M de las obras cerradas.
  assert.doesNotMatch(cuerpo, /monto_contratado/,
    'la definición volvió a leer el campo del formulario de la obra')
})

test('una obra fusionada no suma su contrato dos veces', () => {
  // «BSA - Planta» y «ME - BSA» son la misma obra (decisión del dueño, 10/09/2026). Sin este filtro
  // el cliente contaría el contrato de las dos.
  assert.match(cuerpoDeLaFuncion(), /fusionada_en is null/)
})

test('«en curso» es `estado = activa`, el mismo criterio que la lista y la ficha', () => {
  // Si acá dijera `estado <> 'cerrada'`, la cifra de la ficha y las filas de obra que se dibujan
  // debajo dejarían de cerrar: `getObrasDeLaCartera` filtra por `activa`.
  assert.match(cuerpoDeLaFuncion(), /solo_en_curso or oc\.estado = 'activa'/)
})

test('sin precio en OBRAS el contrato es NULL, y por eso la alarma no se enciende', () => {
  // `sum()` de cero filas es NULL en Postgres, no 0 — y eso es lo correcto: un cero afirmaría que
  // el cliente contrató nada y la pantalla escribiría «el esquema asigna $ X MÁS que el contrato»
  // sobre un cliente del que no se sabe el precio. El comentario de la función lo declara y la vista
  // no lo envuelve en `coalesce`.
  assert.match(sql, /NULL —nunca 0— si ninguna tiene precio en OBRAS/)
  const vista = sql.slice(sql.indexOf('create view\n  public.cliente_economia') >= 0
    ? sql.indexOf('create view\n  public.cliente_economia')
    : sql.indexOf('create view public.cliente_economia'))
  assert.doesNotMatch(vista.slice(0, vista.indexOf('comment on view')),
    /coalesce\(\s*public\.contratado_de_cliente/,
    'un coalesce sobre el contratado convertiría «no sé» en «cero»')
})

test('el jefe de obra no ve el contrato del cliente, y el cliente del portal ve el suyo', () => {
  const cuerpo = cuerpoDeLaFuncion()
  // El portero va ADENTRO de la función porque es `security definer`: sin él, cualquier
  // autenticado podría pedirla por rpc y leer la cartera entera.
  assert.match(cuerpo, /public\.ve_economia\(\)/)
  assert.match(cuerpo, /public\.cliente_de_sesion\(\) = cliente/)
})

// ═══ LO QUE SIGUE SIENDO PURO EN ESTE SERVICIO ═══

const pago = (p: Partial<PagoEsquema>): PagoEsquema => ({
  id: p.id ?? 'p1', cliente_id: 'c1', obra_id: null, cobranza_fila: null, concepto: 'Anticipo',
  fecha: '2026-09-20', monto: 100, moneda: 'ARS', factura_numero: null, recibo_numero: null,
  reparo: null, estado: 'pendiente', medio: null, visible_portal: true, aviso_dias: null,
  mostrar_reprogramaciones: false, nota_interna: null, reprogramaciones: [], publicado_at: null,
  cambio_pendiente: false, orden: 1, ...p,
} as PagoEsquema)

test('hay cambios sin publicar tanto si nunca se publicó como si cambió después', () => {
  assert.equal(hayCambiosSinPublicar([pago({ publicado_at: null })]), true)
  assert.equal(hayCambiosSinPublicar([pago({ publicado_at: '2026-09-01', cambio_pendiente: true })]), true)
  assert.equal(hayCambiosSinPublicar([pago({ publicado_at: '2026-09-01' })]), false)
  // Lo que el cliente no ve no se le publica: un pago interno no enciende el botón.
  assert.equal(hayCambiosSinPublicar([pago({ visible_portal: false, publicado_at: null })]), false)
})

test('el próximo vencimiento no le recuerda al cliente un pago que ya hizo', () => {
  const hoy = new Date('2026-09-10T12:00:00Z')
  const pagos = [
    pago({ id: 'viejo', fecha: '2026-09-01' }),
    pago({ id: 'cobrado', fecha: '2026-09-15', estado: 'cobrado' }),
    pago({ id: 'proximo', fecha: '2026-09-20' }),
    pago({ id: 'lejano', fecha: '2026-10-20' }),
  ]
  assert.equal(proximoVencimiento(pagos, hoy)?.id, 'proximo')
  assert.equal(proximoVencimiento([pago({ id: 'viejo', fecha: '2026-09-01' })], hoy), null)
})
