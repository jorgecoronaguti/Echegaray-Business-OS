// EL COBRO QUE EL SYNC TRAE TIENE QUE LLEGAR AL CLIENTE — probado contra Postgres real.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// Entre el 05/09 y el 07/09/2026 el portal de San Francisco publicaba $133.797.709,50 contra los
// $141.865.646 que la pestaña Cobranzas declara cobrados en 2026. La fila que faltaba —«Pisos
// Industriales — saldo del anticipo · 1ª de 2 cuotas», $8.067.936,50, cobrada el 04/09— estaba en
// `esquema_pago` con `estado = 'cobrado'` y con `visible_portal = false` / `publicado_at = null`,
// porque el `insert` del sync no declaraba ninguna de las dos y la columna es `default false`.
//
// ESTO NO SE PUEDE PROBAR SIN LA BASE. El valor que fallaba lo pone el DEFAULT de la tabla, no el
// código: un test con un doble del ejecutor vería los parámetros que el script manda y diría que
// está todo bien mientras Postgres escribe `false`. Lo que se prueba acá es la fila LEÍDA DE VUELTA.
//
// TODO PASA DENTRO DE UNA TRANSACCIÓN QUE TERMINA EN ROLLBACK. No queda una fila. Sin base, se
// saltea — un verde inventado sería peor que un test que no corrió.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from '../db.mjs'
import {
  cobrosOcultos, guardarCertificadoDelSync, guardarPagoDelSync, repararCobrosOcultos,
} from './publicacion.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

// `cobranza_fila` fuera de todo rango real de la pestaña: si se usara una viva, el test pisaría el
// esquema de un cliente de verdad en vez de probar la regla.
const FILA_QA = 999901
const OTRA_QA = 999902

const pago = (cambios = {}) => ({
  cliente_id: null, cobranza_fila: FILA_QA, huella_comprobante: 'QA', huella_monto: 8067936.5,
  concepto: 'QA · Pisos Industriales — saldo del anticipo · 1ª de 2 cuotas',
  fecha: '2026-09-04', monto: 8067936.5, estado: 'cobrado', medio: 'transferencia', orden: 900001,
  ...cambios,
})

const leer = (q, fila) => q(
  `select visible_portal, publicado_at, estado, monto, concepto
     from public.esquema_pago where cobranza_fila = $1`, [fila]).then((r) => r.rows[0])

test('un cobro que el sync trae llega publicado al cliente', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = (sql, params) => c.query(sql, params)
  try {
    await q('begin')
    // Mismo lock que el resto de los pg-tests que escriben tablas calientes: los serializa entre sí
    // y se libera solo con el rollback.
    await q('select pg_advisory_xact_lock(20260822)')

    const { rows: [cli] } = await q('select id from public.clientes limit 1')
    assert.ok(cli, 'sin un cliente no hay esquema de pago que probar')

    await t.test('LA FILA NUEVA NACE VISIBLE Y PUBLICADA — el defecto del 05/09', async () => {
      await guardarPagoDelSync(pago({ cliente_id: cli.id }), { query: q })
      const f = await leer(q, FILA_QA)
      // Antes del arreglo esta fila salía `visible_portal = false, publicado_at = null` por el
      // DEFAULT de la tabla, y el cliente no la veía nunca.
      assert.equal(f.visible_portal, true, 'sin esto el cobro es invisible para el cliente')
      assert.notEqual(f.publicado_at, null, 'y sin publicar tampoco lo ve: la policy pide las DOS')
    })

    await t.test('y por lo tanto el control ya no la cuenta como cobro oculto', async () => {
      const { rows } = await q(
        `select cliente_id, estado, monto, visible_portal, publicado_at
           from public.esquema_pago where cobranza_fila = $1`, [FILA_QA])
      assert.deepEqual(cobrosOcultos(rows), [], 'el control y la escritura leen el mismo predicado')
    })

    await t.test('UNA LÍNEA APAGADA A MANO NO SE VUELVE A PUBLICAR EN LA CORRIDA SIGUIENTE', async () => {
      // Es la otra mitad de la regla, y la que impide sobre-corregir: administración apaga una línea
      // en la pantalla 32 y el sync de las 00:10 no puede deshacerlo.
      await q(`update public.esquema_pago set visible_portal = false where cobranza_fila = $1`, [FILA_QA])
      await guardarPagoDelSync(pago({ cliente_id: cli.id, monto: 9000000 }), { query: q })
      const f = await leer(q, FILA_QA)
      assert.equal(f.visible_portal, false, 'la decisión de administración manda sobre el sync')
      assert.equal(Number(f.monto), 9000000, 'pero el monto del Sheet sí se actualizó')
    })

    await t.test('el upsert sigue siendo idempotente por cobranza_fila', async () => {
      await guardarPagoDelSync(pago({ cliente_id: cli.id, cobranza_fila: OTRA_QA, orden: 900002 }), { query: q })
      await guardarPagoDelSync(pago({ cliente_id: cli.id, cobranza_fila: OTRA_QA, orden: 900002 }), { query: q })
      const { rows } = await q(
        'select count(*)::int n from public.esquema_pago where cobranza_fila = $1', [OTRA_QA])
      assert.equal(rows[0].n, 1, 'dos corridas del sync no pueden dejar dos filas del mismo cobro')
    })
  } finally {
    await c.query('rollback')
    c.release()
  }
})

test('el otro escritor de la misma tabla no se contradice con éste', { skip: !hayBase }, async () => {
  // `portal-sembrar.mjs` inserta con `visible_portal = true, publicado_at = now()`. Que los dos
  // escritores de `esquema_pago` opinen distinto sobre esto ES el defecto: se fija por texto porque
  // el script no expone su sentencia y correrlo escribiría en la base productiva.
  const { readFile } = await import('node:fs/promises')
  const src = await readFile(new URL('../../scripts/portal-sembrar.mjs', import.meta.url), 'utf8')
  const inserts = src.match(/'sync_cobranzas',\s*true,\s*now\(\)/g) ?? []
  assert.ok(inserts.length >= 2,
    'el sembrador dejó de insertar publicada: revisá cuál de los dos escritores tiene razón antes de tocar nada')
})

test('la reparación toca los cobros ocultos y NADA más', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = (sql, params) => c.query(sql, params)
  const cobrada = (fila) => q(
    `select visible_portal, publicado_at from public.esquema_pago where cobranza_fila = $1`, [fila])
    .then((r) => r.rows[0])
  try {
    await q('begin')
    await q('select pg_advisory_xact_lock(20260822)')
    const { rows: [cli] } = await q('select id from public.clientes limit 1')

    // Se recrea el estado exacto del defecto: filas que nacieron sin visibilidad. Se apagan a mano
    // DESPUÉS del insert porque el insert ya está arreglado — el test tiene que partir del mundo roto.
    const nacerOculta = async (fila, cambios) => {
      await guardarPagoDelSync(pago({ cliente_id: cli.id, cobranza_fila: fila, orden: 900000 + fila, ...cambios }), { query: q })
      await q(`update public.esquema_pago set visible_portal = false, publicado_at = null
                where cobranza_fila = $1`, [fila])
    }
    await nacerOculta(FILA_QA, { estado: 'cobrado' })
    await nacerOculta(OTRA_QA, { estado: 'a_vencer' })
    // Y una tercera que administración publicó y APAGÓ a propósito: `publicado_at` queda sellado.
    await guardarPagoDelSync(pago({ cliente_id: cli.id, cobranza_fila: 999903, orden: 900003 }), { query: q })
    await q(`update public.esquema_pago set visible_portal = false where cobranza_fila = 999903`)

    const reparados = await repararCobrosOcultos({ query: q })

    await t.test('el cobro oculto vuelve a la cara del cliente', async () => {
      const f = await cobrada(FILA_QA)
      assert.equal(f.visible_portal, true)
      assert.notEqual(f.publicado_at, null)
      assert.ok(reparados.some((r) => Number(r.monto) === 8067936.5), 'y la reparación lo declara')
    })

    await t.test('una línea PROYECTADA sin publicar NO se publica: sería inventarle deuda', async () => {
      // Medido en San Francisco: publicar las proyectadas subía el pendiente de $77.660.038,90 a
      // $87.660.814,80 por doble conteo contra las líneas viejas del sembrador.
      const f = await cobrada(OTRA_QA)
      assert.equal(f.visible_portal, false)
      assert.equal(f.publicado_at, null)
    })

    await t.test('una línea que administración APAGÓ a mano no se re-enciende', async () => {
      const f = await cobrada(999903)
      assert.equal(f.visible_portal, false, 'la decisión de administración no la revierte una reparación')
    })

    await t.test('y después de reparar el control no encuentra nada de lo que tocó', async () => {
      const { rows } = await q(
        `select cliente_id, estado, monto, visible_portal, publicado_at
           from public.esquema_pago where cobranza_fila = $1`, [FILA_QA])
      assert.deepEqual(cobrosOcultos(rows), [])
    })
  } finally {
    await c.query('rollback')
    c.release()
  }
})

// ═══ EL CERTIFICADO COBRADO — el defecto del 10/09/2026 ═══
//
// El `on conflict do update` del sync no incluía `estado`: una factura que Cobranzas pasó a
// `Cobrado` se quedaba `emitido` en `certificado_cliente` para siempre, y la ficha del cliente
// ofrecía «Enviar recordatorio» sobre plata ya percibida (Messina, FA 01-00000225, $6.060.479).
//
// Esto tampoco se puede probar sin la base: lo que fallaba era la sentencia, no el cálculo. Se
// prueba la fila LEÍDA DE VUELTA, dentro de una transacción que termina en ROLLBACK.

const certificado = (cambios = {}) => ({
  cliente_id: null, numero: 'QA 01-00000225', factura: 'FA QA 01-00000225', monto: 5961829.95,
  emitido_at: '2026-08-06', vence: '2026-09-03', estado: 'emitido', cobranza_fila: FILA_QA,
  huella_comprobante: 'QA 01-00000225', huella_monto: 5008660.65,
  ...cambios,
})

const leerCert = (q, fila) => q(
  `select estado, monto, observacion from public.certificado_cliente where cobranza_fila = $1`,
  [fila]).then((r) => r.rows[0])

test('un certificado que Cobranzas pasó a cobrado deja de estar emitido', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = (sql, params) => c.query(sql, params)
  try {
    await q('begin')
    await q('select pg_advisory_xact_lock(20260822)')
    const { rows: [cli] } = await q('select id from public.clientes limit 1')
    assert.ok(cli, 'sin un cliente no hay certificado que probar')

    await t.test('la corrida siguiente escribe el COBRO, no lo congela', async () => {
      await guardarCertificadoDelSync(certificado({ cliente_id: cli.id }), { query: q })
      assert.equal((await leerCert(q, FILA_QA)).estado, 'emitido', 'así nace mientras está pendiente')
      // El Sheet lo cobra: la proyección trae `cobrado` sobre la MISMA fila.
      await guardarCertificadoDelSync(
        certificado({ cliente_id: cli.id, estado: 'cobrado' }), { query: q })
      const f = await leerCert(q, FILA_QA)
      assert.equal(f.estado, 'cobrado',
        'sin esto la ficha reclama por mail una factura que el cliente ya pagó')
    })

    await t.test('lo que el CLIENTE contestó del documento no lo pisa el sync', async () => {
      await q(`update public.certificado_cliente
                  set estado = 'observado', observacion = 'falta el remito'
                where cobranza_fila = $1`, [FILA_QA])
      await guardarCertificadoDelSync(
        certificado({ cliente_id: cli.id, estado: 'emitido', monto: 6000000 }), { query: q })
      const f = await leerCert(q, FILA_QA)
      assert.equal(f.estado, 'observado', 'la observación del cliente sobrevive a la corrida')
      assert.equal(f.observacion, 'falta el remito')
      assert.equal(Number(f.monto), 6000000, 'pero el importe del Sheet sí se actualizó')
    })

    await t.test('y si esa factura observada se cobra, el cobro manda', async () => {
      await guardarCertificadoDelSync(
        certificado({ cliente_id: cli.id, estado: 'cobrado' }), { query: q })
      assert.equal((await leerCert(q, FILA_QA)).estado, 'cobrado')
    })

    await t.test('sigue siendo idempotente por cobranza_fila', async () => {
      await guardarCertificadoDelSync(certificado({ cliente_id: cli.id }), { query: q })
      const { rows } = await q(
        'select count(*)::int n from public.certificado_cliente where cobranza_fila = $1', [FILA_QA])
      assert.equal(rows[0].n, 1, 'dos corridas no pueden dejar dos veces el mismo documento')
    })
  } finally {
    await c.query('rollback')
    c.release()
  }
})
