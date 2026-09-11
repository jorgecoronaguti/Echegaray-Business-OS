// LA RPC DE LA FICHA DEL CLIENTE DICE LO MISMO QUE LAS QUINCE LECTURAS — contra la base real.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// Dos de las quince lecturas dependían de la anterior: `drive_index` de los ids que devuelve
// `cliente_documento`, y `certificados` de las obras del cliente. Adentro de un cuerpo SQL esa
// dependencia es una SUBCONSULTA, y una subconsulta mal acotada es el error caro de este hito: si
// `drive` trajera el índice entero de Drive, la ficha de un cliente viajaría con 3.500 archivos; si
// `certificados` perdiera el recorte, mostraría los de todas las obras de la empresa. Este test
// compara ambos contra su consulta original y exige igualdad exacta.
//
// Y compara la ficha entera: quince claves, quince consultas viejas, fila por fila.
//
// La función se crea DENTRO de la transacción y todo termina en ROLLBACK.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'

const MIGRACION = readFileSync(join(
  import.meta.dirname, '..', '..', 'supabase', 'migrations',
  '20260911T0940_la_ficha_del_cliente_recibe_el_desglose_del_contrato.sql'), 'utf8')

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

/** Las quince consultas de hoy, con `$1` = el cliente_id ya resuelto por el slug. */
const VIEJAS = {
  responsables: `select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nombre', p.nombre, 'rol', p.rol) order by p.nombre), '[]'::jsonb)
                   from public.perfiles p where p.es_prueba = false`,
  contactos: `select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb) from public.cliente_contacto k where k.cliente_id = $1`,
  obras: `select coalesce(jsonb_agg(to_jsonb(o)), '[]'::jsonb) from public.obra_panel o where o.cliente_id = $1`,
  papeles: `select coalesce(jsonb_agg(jsonb_build_object(
              'id', r.id, 'obra_id', r.obra_id, 'tipo', r.tipo, 'numero', r.numero, 'fecha', r.fecha,
              'importe', r.importe, 'moneda', r.moneda, 'cita', r.cita, 'nombre_archivo', r.nombre_archivo,
              'atribucion', r.atribucion, 'drive_file_id', r.drive_file_id)), '[]'::jsonb)
            from public.cliente_orden r where r.cliente_id = $1 and r.eliminado_en is null`,
  documentos: `select coalesce(jsonb_agg(jsonb_build_object(
                 'drive_file_id', d.drive_file_id, 'rol', d.rol, 'origen', d.origen, 'creado_en', d.creado_en)), '[]'::jsonb)
               from public.cliente_documento d where d.cliente_id = $1`,
  // LA SEGUNDA OLA, la que esperaba: los ids salen de la consulta de arriba.
  drive: `select coalesce(jsonb_agg(jsonb_build_object(
            'drive_file_id', a.drive_file_id, 'name', a.name, 'path', a.path,
            'mime_type', a.mime_type, 'modified_time', a.modified_time)), '[]'::jsonb)
          from public.drive_index a
          where a.drive_file_id in (select d.drive_file_id from public.cliente_documento d where d.cliente_id = $1)`,
  notas: `select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'texto', n.texto, 'autor_id', n.autor_id, 'creado_en', n.creado_en) order by n.creado_en desc), '[]'::jsonb)
            from public.cliente_nota n where n.cliente_id = $1`,
  certificados: `select coalesce(jsonb_agg(jsonb_build_object(
                   'id', t.id, 'numero', t.numero, 'obra_canonica_id', t.obra_canonica_id,
                   'fecha_certificacion', t.fecha_certificacion, 'monto_certificado', t.monto_certificado,
                   'fecha_facturacion', t.fecha_facturacion, 'monto_facturado', t.monto_facturado,
                   'fecha_cobranza', t.fecha_cobranza, 'monto_cobrado', t.monto_cobrado)), '[]'::jsonb)
                 from public.certificados t
                 where t.obra_canonica_id in (select o.obra_id from public.obra_panel o where o.cliente_id = $1)`,
  presupuestos: `select coalesce(jsonb_agg(to_jsonb(z) order by z.fecha_cotizacion desc), '[]'::jsonb)
                   from public.cotizacion_cascada z where z.vigente = true and z.cliente_id = $1`,
  // LO COBRADO POR TRABAJO: la misma vista y las mismas ocho columnas que /clientes, recortadas a
  // las obras del cliente. Un recorte perdido acá le mostraría a esta ficha la cuenta de otro.
  cobrado_por_obra: `select coalesce(jsonb_agg(jsonb_build_object(
                       'obra_id', u.obra_id, 'cobrado_total', u.cobrado_total, 'cobrado_neto', u.cobrado_neto,
                       'por_cobrar', u.por_cobrar, 'vencido', u.vencido,
                       'proximo_cobro_fecha', u.proximo_cobro_fecha, 'proximo_cobro_medio', u.proximo_cobro_medio,
                       'imputacion', u.imputacion)), '[]'::jsonb)
                     from public.obra_cuenta u where u.cliente_id = $1`,
}

test('pantalla_cliente() devuelve lo mismo que las quince lecturas', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  try {
    await c.query('begin')
    await c.query(MIGRACION)

    const direccion = (await q(`select id from perfiles where rol='direccion' and es_prueba = false limit 1`))[0]
    assert.ok(direccion, 'no hay ningún perfil de dirección: sin él no se puede leer la economía')
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: direccion.id, role: 'authenticated' })])
    await c.query('set local role authenticated')

    // EL CLIENTE CON MÁS PAPELES: una ficha vacía haría pasar cualquier comparación.
    const slug = (await q(`
      select c.slug from public.cliente_panel c
        join public.cliente_orden r on r.cliente_id = c.cliente_id and r.eliminado_en is null
       group by c.slug order by count(*) desc limit 1`))[0]?.slug
    assert.ok(slug, 'no hay ningún cliente con papeles: el control no tendría nada que mirar')
    const id = (await q(`select cliente_id from public.cliente_panel where slug = $1`, [slug]))[0].cliente_id

    const rpc = (await q('select public.pantalla_cliente($1) j', [slug]))[0].j

    // ═══ LAS LISTAS SIN `order by` SE COMPARAN COMO CONJUNTOS ═══
    //
    // `cliente_documento`, `drive_index` y `cliente_orden` no llevan orden declarado —tampoco lo
    // llevaban en PostgREST—, así que Postgres puede devolverlas en distinto orden en dos
    // ejecuciones de la misma transacción. Compararlas posicionalmente sería un test que falla por
    // el plan, no por el dato. Las que SÍ tienen orden (`responsables`, `notas`, `presupuestos`) se
    // comparan tal cual: ahí el orden es parte de lo que se promete.
    const ORDENADAS = new Set(['responsables', 'notas', 'presupuestos'])
    const canonico = (v) => [...v].map((x) => JSON.stringify(x)).sort()

    await t.test('las nueve listas coinciden fila por fila', async () => {
      for (const [clave, sql] of Object.entries(VIEJAS)) {
        // `responsables` no lleva parámetro: pasarle uno a una sentencia sin `$1` es un 08P01.
        const viejo = (await q(sql, sql.includes('$1') ? [id] : []))[0].coalesce
        if (ORDENADAS.has(clave)) {
          assert.deepEqual(rpc[clave], viejo, `la clave «${clave}» de la RPC no coincide con su consulta`)
        } else {
          assert.deepEqual(canonico(rpc[clave]), canonico(viejo),
            `la clave «${clave}» de la RPC no trae las mismas filas que su consulta`)
        }
      }
    })

    await t.test('la subconsulta de Drive está acotada al cliente, no al índice entero', async () => {
      const todos = Number((await q('select count(*) n from public.drive_index'))[0].n)
      assert.ok(rpc.drive.length < todos,
        `la ficha se trajo el índice de Drive entero (${rpc.drive.length} de ${todos})`)
      assert.ok(rpc.drive.length > 0, 'este cliente no tiene archivos: el recorte no se pudo probar')
    })

    await t.test('trae la ficha, no una cáscara vacía', () => {
      assert.equal(rpc.cliente.slug, slug)
      assert.ok(rpc.obras.length > 0, 'el cliente no tiene obras')
      assert.ok(rpc.papeles.length > 0, 'el cliente no tiene papeles')
      assert.ok(rpc.responsables.length > 0, 'no hay responsables')
      assert.equal(rpc.actividad_cliente.nombre_comercial, rpc.cliente.nombre_comercial)
    })

    await t.test('un slug que no existe devuelve la ficha en null, no un error', async () => {
      const vacio = (await q(`select public.pantalla_cliente('no-existe-este-cliente') j`))[0].j
      // `cliente: null` es «no existe o no lo podés ver» y la pantalla hace notFound(). Que además
      // las listas vengan vacías impide dibujar los papeles de otro cliente en una ficha fantasma.
      assert.equal(vacio.cliente, null)
      assert.deepEqual(vacio.obras, [])
      assert.deepEqual(vacio.papeles, [])
      assert.equal(vacio.economia_cliente, null)
    })

    await t.test('un rol sin economía no recibe la economía del cliente', async () => {
      const jefe = (await q(`select id from perfiles where rol='jefe_obra' and es_prueba = false limit 1`))[0]
      if (!jefe) return t.diagnostic('no hay perfil de jefe de obra en la base: el portero no se pudo probar')
      await c.query(`select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: jefe.id, role: 'authenticated' })])
      const suyo = (await q('select public.pantalla_cliente($1) j', [slug]))[0].j
      assert.equal(suyo.economia_cliente, null, 'el jefe de obra vio la economía del cliente')
    })
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
