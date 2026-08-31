// LA CÁSCARA CONTRA LA BASE REAL.
//
// Lo que estos tests atrapan: que el adaptador «arregle» los datos en el camino, y que el CHECK que
// impide un SIN_PRECIO con valor sea una promesa del código en vez de una regla de la base.
//
// Todo lo que escribe usa el prefijo ZZ y se limpia en `after`. Las escrituras adversariales van
// dentro de un `begin/rollback` propio para que un `permission denied` esperado no arrastre a la
// transacción siguiente.

import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { getPool } from '../db.mjs'
import {
  leerRecursosConSerie, leerComprasReales, candidatosDeRecurso,
  resolverCatalogo, guardarResolucion, aplicarResolucion,
} from './precio-fuentes.pg.mjs'
import { ORIGEN, RESULTADO, resolverPrecio, candidatoDePrecio } from './precio-resolucion.mjs'

// UNA sola conexión tomada del pool, y todo dentro de un `begin` que nunca se comitea. `pool.query`
// no garantiza la misma conexión entre llamadas, así que una transacción abierta con él no envuelve
// nada: es el mismo patrón que usa `pg.pg.test.mjs`.
const pool = getPool()
let cliente = null
const query = (s, p) => cliente.query(s, p)
const CODIGO = 'ZZ_PRECIO_TEST'
let recursoId = null

/** Un intento que SE ESPERA que la base rechace. El savepoint es obligatorio: un error deja la
 *  transacción abortada y todo lo que siga falla por arrastre, escondiendo el test real. */
async function rechazaLaBase(sql, params = []) {
  await query('savepoint intento')
  try {
    await query(sql, params)
    await query('release savepoint intento')
    return null
  } catch (e) {
    await query('rollback to savepoint intento')
    return String(e.message)
  }
}

before(async () => {
  cliente = await pool.connect()
  await query('begin')
  const { rows } = await query(
    `insert into public.recurso (codigo, nombre, unidad, tipo, familia, activo)
     values ($1, 'ZZ HORMIGON DE PRUEBA', 'm3', 'material', 'MATERIAL', true) returning id`, [CODIGO])
  recursoId = rows[0].id
})

after(async () => {
  await query('rollback').catch(() => {})
  cliente.release()
  await pool.end()
})

test('leerRecursosConSerie · devuelve la SERIE COMPLETA, no sólo el precio vigente', async () => {
  await query(
    `insert into public.recurso_precio (recurso_id, costo, fecha_precio, fuente, moneda, vigente)
     values ($1, 100, '2026-01-15', 'ZZ fuente vieja', 'ARS', false),
            ($1, 120, '2026-05-15', 'ZZ fuente nueva', 'ARS', true)`, [recursoId])
  const { recursos } = await leerRecursosConSerie({ query }, { codigos: [CODIGO] })
  assert.equal(recursos.length, 1)
  assert.equal(recursos[0].serie.length, 2, 'con una sola fila no se puede medir volatilidad nunca')
  assert.equal(recursos[0].serie[0].observadoEn, '2026-05-15', 'la más reciente primero')
  assert.equal(recursos[0].tipo, 'material')
})

test('leerRecursosConSerie · una fila SIN FECHA no entra a la serie — hay 38 así en la base', async () => {
  // `recurso_precio.costo` es NOT NULL (verificado abajo), así que el hueco que sí existe es el de
  // la FECHA: 38 de las 389 observaciones no la tienen y por eso no se pueden vencer ni medir.
  await query(
    `insert into public.recurso_precio (recurso_id, costo, fecha_precio, fuente, moneda, vigente)
     values ($1, 999, null, 'ZZ sin fecha', 'ARS', false)`, [recursoId])
  const { recursos, crudo } = await leerRecursosConSerie({ query }, { codigos: [CODIGO] })
  assert.equal(recursos[0].serie.length, 2, 'la fila sin fecha queda afuera de la serie')
  assert.equal(crudo.filter((r) => r.codigo === CODIGO).length, 3, 'pero el crudo la conserva: el hueco tiene que ser visible')
  assert.ok(recursos[0].serie.every((o) => o.precio > 0 && o.observadoEn))

  const { rows } = await query(
    `select is_nullable from information_schema.columns
      where table_schema='public' and table_name='recurso_precio' and column_name='costo'`)
  assert.equal(rows[0].is_nullable, 'NO', 'si costo se vuelve nullable, un NULL puede llegar a leerse como 0 aguas abajo')
})

test('leerComprasReales · la fuente es compra_sheet, y public.compras está vacía', async () => {
  const compras = await leerComprasReales({ query }, { limite: 50 })
  assert.ok(compras.length > 0, 'compra_sheet tiene 913 filas: si esto da 0, se está leyendo la tabla equivocada')
  const { rows } = await query('select count(*)::int n from public.compras')
  assert.equal(rows[0].n, 0, 'public.compras sigue vacía: buscar por el nombre obvio da «no hay historial»')
  assert.ok(compras.every((c) => c.concepto), 'toda fila leída trae concepto')
})

test('candidatosDeRecurso · una fila rota del catálogo NO voltea la corrida, queda como rechazo', () => {
  const r = candidatosDeRecurso({
    recurso: {
      codigo: CODIGO, nombre: 'ZZ HORMIGON DE PRUEBA', unidad: 'm3', id: recursoId,
      serie: [
        { precio: 120, moneda: 'ARS', fuente: 'ok', observadoEn: '2026-05-15' },
        { precio: 0, moneda: 'ARS', fuente: 'rota', observadoEn: '2026-05-15' },
      ],
    },
    compras: [],
  })
  assert.equal(r.candidatos.length, 1)
  assert.equal(r.rechazados.length, 1)
  assert.match(r.rechazados[0], /no es un precio/)
})

test('resolverCatalogo · corre sobre la base real sin N+1 y devuelve una resolución por recurso', async () => {
  const r = await resolverCatalogo({ query }, { codigos: [CODIGO], hoy: new Date('2026-08-30T00:00:00Z') })
  assert.equal(r.resoluciones.length, 1)
  assert.ok(r.comprasLeidas > 0)
  const p = r.resoluciones[0].resolucion
  assert.ok(Object.values(RESULTADO).includes(p.resultado))
  assert.equal(p.provenance.recorrido.length, 4, 'el recorrido completo sale siempre')
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LO QUE LA BASE HACE CUMPLIR, NO EL CÓDIGO
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('guardarResolucion · escribe la evidencia y se puede volver a leer', async () => {
  const p = resolverPrecio({
    recurso: { codigo: CODIGO, nombre: 'ZZ HORMIGON DE PRUEBA', tipo: 'material' },
    hoy: new Date('2026-08-30T00:00:00Z'),
    candidatos: [candidatoDePrecio({ recursoCodigo: CODIGO, valor: 250_000, origen: ORIGEN.COMPRA_ECSAS, observadoEn: '2026-08-28', detalleFuente: 'ZZ compra_sheet fila 1' })],
  })
  const fila = await guardarResolucion({ query }, { recurso: { id: recursoId }, resolucion: p })
  // LA EVIDENCIA ES DEL EFECTO: se lee de vuelta, no se le cree al INSERT.
  const { rows } = await query('select resultado, valor, provenance, por_que from public.recurso_precio_resolucion where id = $1', [fila.id])
  assert.equal(rows[0].resultado, p.resultado)
  assert.equal(Number(rows[0].valor), 250_000)
  assert.equal(rows[0].provenance.resueltoEn, ORIGEN.COMPRA_ECSAS)
  assert.equal(rows[0].provenance.recorrido.length, 4)
})

test('NEGATIVO · la BASE rechaza un SIN_PRECIO con valor: no es una convención del código', async () => {
  const e = await rechazaLaBase(
    `insert into public.recurso_precio_resolucion (recurso_codigo, resultado, valor, moneda, provenance, por_que)
     values ($1, 'SIN_PRECIO', 0, 'ARS', '{}'::jsonb, 'intento de escribir un cero')`, [CODIGO])
  assert.ok(e, 'la base aceptó un SIN_PRECIO con valor 0')
  assert.match(e, /sin_precio_no_es_cero/, `el CHECK que falló fue otro: ${e}`)
})

test('NEGATIVO · la BASE rechaza un precio resuelto con valor 0', async () => {
  const e = await rechazaLaBase(
    `insert into public.recurso_precio_resolucion (recurso_codigo, resultado, valor, moneda, provenance, por_que)
     values ($1, 'ACTUALIZADO', 0, 'ARS', '{}'::jsonb, 'un cero disfrazado de precio')`, [CODIGO])
  assert.ok(e, 'la base aceptó un precio de 0')
  assert.match(e, /sin_precio_no_es_cero/)
})

test('NEGATIVO · la BASE rechaza un valor sin moneda: un número sin unidad no es plata', async () => {
  const e = await rechazaLaBase(
    `insert into public.recurso_precio_resolucion (recurso_codigo, resultado, valor, provenance, por_que)
     values ($1, 'ACTUALIZADO', 100, '{}'::jsonb, 'sin moneda')`, [CODIGO])
  assert.ok(e, 'la base aceptó un valor sin moneda')
  assert.match(e, /valor_lleva_moneda/)
})

test('NEGATIVO · la BASE rechaza un resultado que el motor no conoce', async () => {
  const e = await rechazaLaBase(
    `insert into public.recurso_precio_resolucion (recurso_codigo, resultado, provenance, por_que)
     values ($1, 'MAS_O_MENOS', '{}'::jsonb, 'un estado inventado')`, [CODIGO])
  assert.ok(e, 'la base aceptó un resultado desconocido')
  assert.match(e, /resultado_conocido/)
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LA ESCRITURA AUTÓNOMA
// ══════════════════════════════════════════════════════════════════════════════════════════════

test('aplicarResolucion · NO escribe nada que no sea ACTUALIZADO', async () => {
  for (const resultado of [RESULTADO.VIGENTE, RESULTADO.NECESITA_HUMANO, RESULTADO.SIN_PRECIO]) {
    const r = await aplicarResolucion({ query }, { recurso: { id: recursoId }, resolucion: { resultado } })
    assert.equal(r.escrito, false, `${resultado} no puede escribirse solo`)
    assert.match(r.porQue, /sólo ACTUALIZADO/)
  }
})

test('aplicarResolucion · agrega una observación NUEVA y no pisa la vieja: la serie crece', async () => {
  const antes = await query('select count(*)::int n from public.recurso_precio where recurso_id = $1', [recursoId])
  const r = await aplicarResolucion({ query }, {
    recurso: { id: recursoId },
    resolucion: {
      resultado: RESULTADO.ACTUALIZADO, valor: 333_000, moneda: 'ARS', fecha: '2026-08-28',
      detalleFuente: 'ZZ compra_sheet fila 9', vigencia: { dias: 23 },
      provenance: { resueltoEn: ORIGEN.COMPRA_ECSAS }, porQue: 'test',
      evidencia: { proveedor: 'ZZ Proveedor' },
    },
  })
  assert.equal(r.escrito, true)
  // EL EFECTO, LEÍDO DEL DESTINO.
  const { rows } = await query('select costo, vigente, vigencia_dias from public.recurso_precio where recurso_id = $1 order by fecha_precio desc, costo desc', [recursoId])
  assert.equal(rows.length, antes.rows[0].n + 1, 'la fila vieja sigue ahí: pisarla borraría la serie')
  assert.equal(rows.filter((x) => x.vigente).length, 1, 'exactamente una vigente')
  assert.equal(Number(rows.find((x) => x.vigente).costo), 333_000)
  assert.equal(rows.find((x) => x.vigente).vigencia_dias, 23, 'la vigencia DERIVADA queda escrita en la fila')
})
