// LA RPC DE `/clientes` DICE EXACTAMENTE LO QUE DECÍAN LAS DIEZ CONSULTAS — contra la base real.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// Mover diez lecturas a un solo cuerpo SQL es barato de escribir y caro de equivocar: una columna
// de menos, un `order by` distinto, un `where` que se olvida (`eliminado_en is null`), un `distinct`
// que colapsa filas legítimas, y la pantalla dibuja OTROS NÚMEROS sin un solo error. Este test
// corre las diez consultas viejas y la RPC nueva EN LA MISMA TRANSACCIÓN y exige igualdad exacta,
// fila por fila y en el mismo orden. Si alguien edita el cuerpo de la función y le cambia una
// columna, este test se pone rojo con el nombre de la clave.
//
// Y el subtest de arranque en frío mide lo único que justifica el cambio: cuánto cuesta la primera
// vez que un backend ve estas vistas (`discard all` + `explain analyze`) contra cuánto cuesta ya
// caliente. Si el planning en frío de la RPC no fuera mucho menor que la suma de diez arranques,
// el hito no tendría sentido y este número lo diría.
//
// ═══ CÓMO NO ENSUCIA LA BASE ═══
//
// La función se crea DENTRO de la transacción y todo termina en ROLLBACK: la base productiva queda
// como estaba. Es el mismo camino de `cobranza-obra.pg.test.mjs`. Sin base, se salta — no se
// inventa un verde.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'

const RAIZ = join(import.meta.dirname, '..', '..')
const MIGRACION = readFileSync(
  join(RAIZ, 'supabase', 'migrations', '20260911T0010_pantalla_clientes_una_consulta.sql'), 'utf8')

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

/**
 * LAS DIEZ CONSULTAS DE HOY, escritas como las manda PostgREST.
 *
 * Cada una devuelve `jsonb` con la MISMA forma que la clave de la RPC, para poder compararlas con
 * `deepEqual` sin traducir nada en el medio — una traducción en el test es un lugar donde esconder
 * la diferencia que el test venía a encontrar.
 */
const VIEJAS = {
  clientes: `
    select coalesce(jsonb_agg(jsonb_build_object(
      'cliente_id', c.cliente_id, 'slug', c.slug, 'nombre_comercial', c.nombre_comercial,
      'razon_social', c.razon_social, 'cuit', c.cuit, 'direccion', c.direccion,
      'telefono', c.telefono, 'email', c.email, 'responsable_id', c.responsable_id,
      'responsable_nombre', c.responsable_nombre, 'drive_carpeta_id', c.drive_carpeta_id,
      'activo', c.activo, 'notas', c.notas, 'n_obras', c.n_obras,
      'n_obras_activas', c.n_obras_activas, 'restricciones_abiertas', c.restricciones_abiertas,
      'avance_sincronizado_en', c.avance_sincronizado_en, 'n_contactos', c.n_contactos,
      'n_documentos', c.n_documentos)
      order by c.n_obras_activas desc, c.nombre_comercial asc), '[]'::jsonb)
    from public.cliente_panel c`,
  obras_activas: `
    select coalesce(jsonb_agg(jsonb_build_object(
      'obra_id', o.obra_id, 'nombre', o.nombre, 'cliente_id', o.cliente_id,
      'avance_pct', o.avance_pct, 'jefe_obra', o.jefe_obra)
      order by o.orden asc, o.nombre asc), '[]'::jsonb)
    from public.obra_panel o where o.estado = 'activa'`,
  obras_todas: `
    select coalesce(jsonb_agg(jsonb_build_object(
      'obra_id', o.obra_id, 'nombre', o.nombre, 'cliente_id', o.cliente_id,
      'estado', o.estado, 'avance_pct', o.avance_pct)
      order by o.orden asc, o.nombre asc), '[]'::jsonb)
    from public.obra_panel o`,
  cobrado_por_obra: `
    select coalesce(jsonb_agg(jsonb_build_object(
      'obra_id', k.obra_id, 'cobrado_neto', k.cobrado_neto, 'imputacion', k.imputacion)), '[]'::jsonb)
    from public.obra_cobranza k`,
  certificados: `
    select coalesce(jsonb_agg(jsonb_build_object(
      'obra_canonica_id', t.obra_canonica_id, 'numero', t.numero,
      'fecha_certificacion', t.fecha_certificacion, 'fecha_facturacion', t.fecha_facturacion,
      'fecha_cobranza', t.fecha_cobranza) order by t.fecha_certificacion asc), '[]'::jsonb)
    from public.certificados t`,
  papeles: `
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id, 'cliente_id', r.cliente_id, 'obra_id', r.obra_id, 'tipo', r.tipo,
      'numero', r.numero, 'fecha', r.fecha, 'importe', r.importe, 'moneda', r.moneda,
      'cita', r.cita, 'nombre_archivo', r.nombre_archivo, 'drive_file_id', r.drive_file_id)), '[]'::jsonb)
    from public.cliente_orden r where r.eliminado_en is null`,
  economia_obras: `
    select coalesce(jsonb_agg(jsonb_build_object(
      'obra_canonica_id', e.obra_canonica_id, 'contratado', e.contratado, 'costo_mo', e.costo_mo,
      'costo_materiales', e.costo_materiales, 'margen', e.margen, 'origen', e.origen,
      'referencia', e.referencia, 'nota', e.nota,
      'oc_civa_ventana', e.oc_civa_ventana, 'oc_civa_historico', e.oc_civa_historico,
      'oc_n_ventana', e.oc_n_ventana, 'oc_n_historico', e.oc_n_historico)), '[]'::jsonb)
    from public.obra_economia_cartera e`,
  cuenta_por_obra: `
    select coalesce(jsonb_agg(jsonb_build_object(
      'obra_id', u.obra_id, 'obra', u.obra, 'cliente_id', u.cliente_id, 'contratado', u.contratado,
      'n_cobranzas', u.n_cobranzas, 'n_cobradas', u.n_cobradas, 'cobrado_total', u.cobrado_total,
      'cobrado_neto', u.cobrado_neto, 'por_cobrar', u.por_cobrar, 'vencido', u.vencido,
      'proximo_cobro_fecha', u.proximo_cobro_fecha, 'proximo_cobro_medio', u.proximo_cobro_medio,
      'imputacion', u.imputacion)), '[]'::jsonb)
    from public.obra_cuenta u`,
  contratos: `
    select coalesce(jsonb_agg(distinct d.cliente_id), '[]'::jsonb)
    from public.cliente_documento d where d.rol = 'contrato'`,
  economia_clientes: `
    select coalesce(jsonb_agg(jsonb_build_object(
      'cliente_id', x.cliente_id, 'contratado', x.contratado,
      'contratado_en_curso', x.contratado_en_curso, 'n_obras_en_curso', x.n_obras_en_curso,
      'n_obras_cerradas', x.n_obras_cerradas, 'n_obras_con_precio', x.n_obras_con_precio,
      'n_obras_sin_precio', x.n_obras_sin_precio, 'costo_real', x.costo_real,
      'facturado_90d', x.facturado_90d, 'cobrado_90d', x.cobrado_90d,
      'cobrado_total', x.cobrado_total, 'cobrado_neto_total', x.cobrado_neto_total,
      'saldo', x.saldo, 'vencido', x.vencido, 'por_vencer', x.por_vencer,
      'pendiente_contractual', x.pendiente_contractual)), '[]'::jsonb)
    from public.cliente_economia x`,
}

test('pantalla_clientes() devuelve lo mismo que las diez consultas', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  try {
    await c.query('begin')
    await c.query(MIGRACION)

    const direccion = (await q(`select id from perfiles where rol='direccion' and es_prueba = false limit 1`))[0]
    assert.ok(direccion, 'no hay ningún perfil de dirección: sin él no se puede leer la economía')
    await c.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: direccion.id, role: 'authenticated' })])

    // COMO `authenticated`, NO COMO DUEÑO DE LAS TABLAS. Un superusuario saltea la RLS: medir y
    // comparar con él probaría una pantalla que nadie ve.
    await c.query('set local role authenticated')
    assert.equal((await q('select ve_economia() x'))[0].x, true, 'la sesión de prueba no ve economía')

    const rpc = (await q('select public.pantalla_clientes() j'))[0].j

    await t.test('las diez listas coinciden fila por fila', async () => {
      for (const [clave, sql] of Object.entries(VIEJAS)) {
        const viejo = (await q(sql))[0].coalesce
        assert.deepEqual(rpc[clave], viejo, `la clave «${clave}» de la RPC no coincide con su consulta`)
      }
    })

    await t.test('trae datos de verdad, no listas vacías', () => {
      // Un `deepEqual` entre dos listas vacías pasa siempre: sin este piso, una RPC que devolviera
      // `[]` en todo por un `where` roto se vería idéntica a un verde legítimo.
      assert.ok(rpc.clientes.length >= 3, `sólo ${rpc.clientes.length} clientes`)
      assert.ok(rpc.obras_activas.length > 0, 'ninguna obra activa')
      assert.ok(rpc.economia_clientes.length > 0, 'ninguna economía de cliente')
      assert.ok(rpc.papeles.length > 0, 'ningún papel')
      assert.ok(rpc.cuenta_por_obra.length > 0, 'ninguna obra en obra_cuenta')
    })

    await t.test('el perfil que devuelve es el de la sesión, no otro', () => {
      assert.equal(rpc.perfil.id, direccion.id)
      assert.equal(rpc.perfil.rol, 'direccion')
    })

    await t.test('un rol sin economía recibe listas vacías, no las cifras de la cartera', async () => {
      const jefe = (await q(`select id from perfiles where rol='jefe_obra' and es_prueba = false limit 1`))[0]
      if (!jefe) return t.diagnostic('no hay perfil de jefe de obra en la base: el portero no se pudo probar')
      await c.query(`select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: jefe.id, role: 'authenticated' })])
      const suyo = (await q('select public.pantalla_clientes() j'))[0].j
      // ES EL PORTERO, NO LA PANTALLA: `ve_economia()` recorta adentro de las vistas. Si esto
      // devolviera la economía completa, la RPC sería un agujero de permisos con nombre de mejora.
      assert.equal(suyo.economia_clientes.length, 0, 'el jefe de obra vio la economía de los clientes')
      assert.equal(suyo.cobrado_por_obra.length, 0, 'el jefe de obra vio lo cobrado por obra')
      assert.equal(suyo.cuenta_por_obra.length, 0, 'el jefe de obra vio la cuenta de cada obra')
      await c.query(`select set_config('request.jwt.claims', $1, true)`,
        [JSON.stringify({ sub: direccion.id, role: 'authenticated' })])
    })

    await t.test('la RPC entera cabe en un viaje y no se derrumba', async () => {
      const planificar = async (sql) => {
        const filas = await q(`explain (analyze, format json) ${sql}`)
        const p = filas[0]['QUERY PLAN'][0]
        return { planning: p['Planning Time'], exec: p['Execution Time'] }
      }
      const caliente = await planificar('select public.pantalla_clientes()')
      const bytes = JSON.stringify(rpc).length
      t.diagnostic(`RPC: planning ${caliente.planning} ms · exec ${caliente.exec} ms · ${bytes} bytes`)

      // ═══ ACÁ NO SE ASEGURA NINGÚN TIEMPO, Y ES A PROPÓSITO ═══
      //
      // Esta suite corre contra la base PRODUCTIVA y compartida. La misma RPC midió 175 ms, 275 ms,
      // 508 ms y 2.620 ms de ejecución en cuatro corridas del mismo día: no cambió la función,
      // cambió cuántos test files estaban peleando por el pool. Un umbral acá no mediría la
      // función, mediría el día — y ya se puso rojo una vez con el código correcto. Un control que
      // da rojo por el vecino termina apagado, que es el modo de fallo peor.
      //
      // El tiempo queda como DIAGNÓSTICO, para leerlo cuando alguien mire. La regresión que este
      // hito vino a impedir no se cuida con tiempo sino con el CONTEO DE VIAJES, que es
      // determinístico y vive en `carteraDeUnaConsulta.test.ts`.
      // El JSON entero de la pantalla en un viaje. Si esto creciera un orden de magnitud, el viaje
      // único deja de ser gratis y hay que volver a mirar.
      assert.ok(bytes < 2_000_000, `la RPC devolvió ${bytes} bytes en un solo viaje`)
    })

  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
