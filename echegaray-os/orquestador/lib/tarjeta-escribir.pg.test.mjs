// CARGAR DOS VECES EL MISMO RESUMEN NO PUEDE DUPLICAR NADA — probado contra Postgres real.
//
// La idempotencia es una promesa que el código no puede cumplir solo: entre que un script chequea si
// el resumen ya está y lo inserta, otra corrida puede haberlo insertado. Lo único que la cierra es
// el índice único de la BASE, y eso es lo que se prueba acá: contra la base viva, no contra un doble.
//
// Y no alcanza con que no duplique: tiene que CORREGIR. Un PDF que se vuelve a leer porque el parser
// mejoró debe dejar los números nuevos, no la lectura vieja escondida detrás de un "ya estaba".
//
// TODO PASA DENTRO DE UNA TRANSACCIÓN QUE TERMINA EN ROLLBACK. No queda una fila. Sin base, se
// saltea — un verde inventado sería peor que un test que no corrió.

import test from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from './db.mjs'
import { insertarResumen } from './tarjeta-escribir.mjs'

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

/** Una tarjeta que no existe: si se usara la real, el test mediría el estado del mundo. */
const TARJETA = 'QA Visa 0000 20260828'

const resumen = (mut = {}) => ({
  resumen: {
    tarjeta: TARJETA, cuentaTarjeta: '999999999', titular: 'QA', numero: '999001',
    cierre: '2026-08-20', vencimiento: '2026-09-01',
    cierreAnterior: '2026-07-23', vencimientoAnterior: '2026-08-03',
    proximoCierre: '2026-09-24', proximoVencimiento: '2026-10-05',
    limiteCompra: 10000000, limiteCuotas: 10000000, limiteFinanciacion: 7000000,
    saldoAnteriorPesos: 1090924.47, saldoAnteriorDolares: 193.25,
    pagoAnterior: { fecha: '2026-08-03', importe: 1384664.47, tc: 1520 },
    consumosPesos: 1949747.67, consumosDolares: 544.99, cargosPesos: 259210.75,
    aDebitarPesos: 2208958.42, aDebitarDolares: 544.99, cuentaDebito: '00000000913836',
    pagoMinimo: 1138130, pagoMinimoVerificado: true,
    ...mut,
  },
  movimientos: [
    { orden: 1, tipo: 'saldo_anterior', concepto: null, fecha: null, comprobante: null, comercio: 'SALDO ANTERIOR', referencia: null, cuota: null, cuotas: null, pesos: 1090924.47, dolares: 193.25 },
    // DOS CONSUMOS IDÉNTICOS EL MISMO DÍA: es un caso real (dos cargos de U$S 45 de ANTHROPIC el
    // 31/07). Ninguna combinación de campos los distingue, y por eso la clave es (resumen, orden).
    { orden: 2, tipo: 'consumo', concepto: null, fecha: '2026-07-31', comprobante: '918810', comercio: 'ANTHROPIC', referencia: null, cuota: null, cuotas: null, pesos: 0, dolares: 45 },
    { orden: 3, tipo: 'consumo', concepto: null, fecha: '2026-07-31', comprobante: '303171', comercio: 'ANTHROPIC', referencia: null, cuota: null, cuotas: null, pesos: 0, dolares: 45 },
    { orden: 4, tipo: 'cargo', concepto: 'rg5617', fecha: '2026-08-20', comprobante: null, comercio: 'DB.RG 5617', referencia: null, cuota: null, cuotas: null, pesos: 244755, dolares: 0, base: 815850.03 },
  ],
  cuotas: {
    porMes: [{ mes: '2026-09-01', importe: 1546611.33 }, { mes: '2026-10-01', importe: 1282797.42 }],
    cola: { desde: '2027-03-01', total: 1421653.32, cuotas: 4, cuota: 355413.33 },
    total: 4251062.07,
  },
})

test('la carga del resumen contra la base real', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const cx = { query: (sql, params) => c.query(sql, params) }
  try {
    await c.query('begin')
    // Mismo lock que el resto de los pg-tests que escriben tablas calientes: los serializa entre sí
    // y se libera solo con el rollback.
    await c.query('select pg_advisory_xact_lock(20260828)')

    await t.test('los índices únicos existen: sin ellos la idempotencia es una intención', async () => {
      const { rows } = await c.query(
        `select indexname, indexdef from pg_indexes where tablename in ('tarjeta_resumen','tarjeta_resumen_linea','tarjeta_cuota_a_vencer')`)
      const nombres = rows.map((r) => r.indexname)
      assert.ok(nombres.includes('tarjeta_resumen_cierre_unico'), 'una tarjeta cierra UNA vez por período')
      assert.ok(nombres.includes('tarjeta_resumen_linea_unica'))
      assert.ok(nombres.includes('tarjeta_cuota_unica'))
      // El del número es PARCIAL: un resumen sin número legible tiene que poder entrar igual.
      const nro = rows.find((r) => r.indexname === 'tarjeta_resumen_numero_unico')
      assert.match(nro.indexdef, /WHERE \(numero IS NOT NULL\)/i)
    })

    let id = null
    await t.test('la primera carga entra entera', async () => {
      const f = await insertarResumen(cx, resumen(), 'qa · primera')
      id = f.id
      assert.equal(f.nueva, true)
      const { rows } = await c.query('select count(*)::int n from public.tarjeta_resumen_linea where resumen_id = $1', [id])
      assert.equal(rows[0].n, 4)
    })

    await t.test('la segunda carga del MISMO resumen no duplica nada', async () => {
      const f = await insertarResumen(cx, resumen(), 'qa · segunda')
      assert.equal(f.id, id, 'es la misma fila, no una nueva')
      assert.equal(f.nueva, false)
      const { rows: [n] } = await c.query(`
        select (select count(*)::int from public.tarjeta_resumen where tarjeta = $1) resumenes,
               (select count(*)::int from public.tarjeta_resumen_linea where resumen_id = $2) lineas,
               (select count(*)::int from public.tarjeta_cuota_a_vencer where resumen_id = $2) cuotas`, [TARJETA, id])
      assert.deepEqual(n, { resumenes: 1, lineas: 4, cuotas: 3 })
    })

    await t.test('y si el PDF se relee mejor, CORRIGE en vez de esconder la lectura vieja', async () => {
      const f = await insertarResumen(cx, resumen({ pagoMinimo: 1200000 }), 'qa · corregida')
      assert.equal(f.id, id)
      const { rows } = await c.query('select pago_minimo, origen from public.tarjeta_resumen where id = $1', [id])
      assert.equal(Number(rows[0].pago_minimo), 1200000)
      assert.match(rows[0].origen, /corregida/)
    })

    await t.test('una relectura con MENOS líneas no deja las de más viviendo adentro', async () => {
      // Si no se borraran, el resumen sería la suma de dos lecturas distintas y el total dejaría de
      // cerrar contra el documento — sin que nada avise.
      const menos = resumen()
      menos.movimientos = menos.movimientos.slice(0, 2)
      await insertarResumen(cx, menos, 'qa · más corta')
      const { rows } = await c.query('select count(*)::int n from public.tarjeta_resumen_linea where resumen_id = $1', [id])
      assert.equal(rows[0].n, 2)
    })

    await t.test('otro resumen de la misma tarjeta con otro cierre SÍ entra', async () => {
      const otro = resumen({ numero: '999002', cierre: '2026-09-24', vencimiento: '2026-10-05' })
      const f = await insertarResumen(cx, otro, 'qa · mes siguiente')
      assert.equal(f.nueva, true)
      assert.notEqual(f.id, id)
      const { rows } = await c.query('select count(*)::int n from public.tarjeta_resumen where tarjeta = $1', [TARJETA])
      assert.equal(rows[0].n, 2)
    })
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
