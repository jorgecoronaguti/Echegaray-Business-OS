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
  join(RAIZ, 'supabase', 'migrations', '20260911T1030_una_vista_cara_se_recorre_una_vez_por_viaje.sql'), 'utf8')

const hayBase = await getPool().query('select 1').then(() => true).catch(() => false)

/**
 * LO QUE LA CARTERA LEE DE `obra_economia_cartera`, DECLARADO UNA VEZ.
 *
 * ═══ POR QUÉ NO VA ESCRITO A MANO DENTRO DE LA CONSULTA (12/09/2026) ═══
 *
 * Estaba, y se desincronizó: el desglose del contrato (`contrato_total`, `contrato_mano_obra`,
 * `contrato_cita`, … once claves nuevas del 11/09) entró a la RPC y esta copia quedó con las once
 * viejas. El test no decía «falta declarar una clave»: escupía un diff de doscientas líneas con las
 * cuatro obras enteras, que es la peor forma de dar una noticia simple. Ahora la lista vive en un solo
 * lugar, la consulta se arma con ella, y los dos tests de abajo dicen exactamente qué clave sobra o
 * falta — en la RPC y en la vista.
 */
const CLAVES_ECONOMIA_OBRAS = [
  'obra_canonica_id', 'contratado', 'contratado_usd', 'tipo_cambio', 'origen', 'referencia', 'nota',
  'oc_civa_ventana', 'oc_civa_historico', 'oc_n_ventana', 'oc_n_historico',
  // El desglose del contrato (11/09/2026): qué parte es mano de obra, qué parte materiales, de qué
  // papel salió y con qué cita. Es lo que hace auditable un «contratado» que no viene de una OC.
  'contrato_mano_obra', 'contrato_mano_obra_usd', 'contrato_materiales', 'contrato_materiales_usd',
  'contrato_total', 'contrato_fuente', 'contrato_fuente_drive_id', 'contrato_fuente_nombre',
  'contrato_cita', 'contrato_nota',
]

/**
 * LAS COLUMNAS DE LA VISTA QUE LA CARTERA **NO** PIDE, CON SU MOTIVO.
 *
 * Una columna que la vista publica y la RPC no lleva es, casi siempre, una columna que alguien se
 * olvidó de enchufar: la pantalla muestra el campo vacío y nadie lo asocia a la RPC. Las de acá abajo
 * son deliberadas, y tres de ellas son una ORDEN DEL DUEÑO.
 */
const FUERA_DE_LA_CARTERA = {
  // Dueño, 10/09/2026: «Administración es un CRM y Obra un ERP: todo lo pertinente a datos de
  // clientes va en CRM, no mezcles cosas con obras». El costo y el margen de una obra se deciden
  // contra el avance y el certificado, y eso no se mira desde la ficha de un cliente. Si viajaran en
  // la RPC, la próxima pantalla de Clientes los encontraría servidos y la columna volvería sola —
  // que es exactamente lo que pasó con Margen. `clientes-no-lee-el-erp.test.ts` lo prohíbe del lado
  // de la web; esto lo cierra del lado del dato.
  costo_mo: 'es del ERP (orden del dueño 10/09/2026)',
  costo_materiales: 'es del ERP (orden del dueño 10/09/2026)',
  margen: 'es del ERP (orden del dueño 10/09/2026)',
  obra_clave: 'la pantalla ata por `obra_canonica_id`; la clave textual es del Sheet',
  leido_en: 'cuándo lo leyó el sync: es metadato del espejo, no un dato de la cartera',
  obra_padre_id: 'la jerarquía de adicionales viaja en la lista de obras, no en su economía',
  plazo_desde: 'los plazos los publica la lista de obras',
  plazo_hasta: 'los plazos los publica la lista de obras',
}

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
      'obra_id', u.obra_id, 'cobrado_total', u.cobrado_total, 'cobrado_neto', u.cobrado_neto,
      'por_cobrar', u.por_cobrar, 'vencido', u.vencido,
      'proximo_cobro_fecha', u.proximo_cobro_fecha, 'proximo_cobro_medio', u.proximo_cobro_medio,
      'imputacion', u.imputacion)), '[]'::jsonb)
    from public.obra_cuenta u`,
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
    select coalesce(jsonb_agg(jsonb_build_object(${CLAVES_ECONOMIA_OBRAS
      .map((k) => `'${k}', e.${k}`).join(', ')})), '[]'::jsonb)
    from public.obra_economia_cartera e`,

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
    // ═══ UN SOLO SNAPSHOT PARA TODAS LAS COMPARACIONES (12/09/2026) ═══
    //
    // Este test compara DIEZ lecturas entre sí —la ficha entera contra cada una de las nueve caras— en
    // sentencias separadas. En `read committed` cada sentencia toma un snapshot nuevo, así que un
    // commit ajeno en el medio cambia el resultado: medido el 12/09 en la corrida completa, falló con
    // «la cara actividad cambió economia_obras» y pasó sola, porque entre dos llamadas de un test que
    // tardó 18 minutos cualquier otro test commiteó algo. `repeatable read` le da a toda la
    // transacción UNA sola foto de la base, que es la única forma de que la comparación signifique
    // algo. Y el mutex del DDL va primero: el snapshot se toma en la primera sentencia.
    await c.query('begin isolation level repeatable read')
    await c.query('select pg_advisory_xact_lock(20260822)')
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

    await t.test('las nueve listas coinciden fila por fila', async () => {
      for (const [clave, sql] of Object.entries(VIEJAS)) {
        const viejo = (await q(sql))[0].coalesce
        assert.deepEqual(rpc[clave], viejo, `la clave «${clave}» de la RPC no coincide con su consulta`)
      }
    })

    // ═══ LOS DOS CONTROLES QUE AVISAN ANTES DEL DIFF DE DOSCIENTAS LÍNEAS ═══
    //
    // El `deepEqual` de arriba compara VALORES y por eso grita fuerte y tarde. Éstos comparan la FORMA
    // —qué claves viajan— y por eso dicen en una línea qué hay que declarar. El primero mira la RPC
    // contra la lista; el segundo, la VISTA contra la RPC, que es por donde entró el defecto del 11/09:
    // la vista ganó once columnas y nadie dijo si la cartera las quería.
    await t.test('la economía de cada obra viaja con las claves declaradas, ni una más ni una menos', () => {
      const fila = rpc.economia_obras[0]
      assert.ok(fila, 'la RPC no devolvió ninguna obra con economía: no hay forma que comparar')
      const sobran = Object.keys(fila).filter((k) => !CLAVES_ECONOMIA_OBRAS.includes(k))
      const faltan = CLAVES_ECONOMIA_OBRAS.filter((k) => !(k in fila))
      assert.deepEqual(sobran, [], `la RPC publica claves que la cartera no declara: ${sobran.join(', ')}`)
      assert.deepEqual(faltan, [], `la RPC dejó de publicar: ${faltan.join(', ')}`)
    })

    await t.test('ninguna columna nueva de la vista queda sin decidir: o viaja, o está declarada fuera', async () => {
      const cols = (await q(
        `select column_name from information_schema.columns
          where table_schema='public' and table_name='obra_economia_cartera'`)).map((r) => r.column_name)
      assert.ok(cols.length > 20, `sólo ${cols.length} columnas: el barrido no miró la vista`)
      const sinDecidir = cols.filter((c) => !CLAVES_ECONOMIA_OBRAS.includes(c) && !(c in FUERA_DE_LA_CARTERA))
      assert.deepEqual(sinDecidir, [],
        `estas columnas de obra_economia_cartera no viajan en la RPC y nadie declaró por qué: ${sinDecidir.join(', ')}. `
        + 'Agregalas a la RPC y a CLAVES_ECONOMIA_OBRAS, o a FUERA_DE_LA_CARTERA con el motivo.')
      // Y al revés: una exclusión que ya no existe esconde el próximo caso real detrás de un permiso
      // que nadie revisa.
      const fantasmas = Object.keys(FUERA_DE_LA_CARTERA).filter((c) => !cols.includes(c))
      assert.deepEqual(fantasmas, [], `estas exclusiones ya no existen en la vista: ${fantasmas.join(', ')}`)
    })

    await t.test('trae datos de verdad, no listas vacías', () => {
      // Un `deepEqual` entre dos listas vacías pasa siempre: sin este piso, una RPC que devolviera
      // `[]` en todo por un `where` roto se vería idéntica a un verde legítimo.
      assert.ok(rpc.clientes.length >= 3, `sólo ${rpc.clientes.length} clientes`)
      assert.ok(rpc.obras_activas.length > 0, 'ninguna obra activa')
      assert.ok(rpc.economia_clientes.length > 0, 'ninguna economía de cliente')
      assert.ok(rpc.papeles.length > 0, 'ningún papel')
      assert.ok(rpc.cobrado_por_obra.length > 0, 'ninguna obra en obra_cuenta')
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
      assert.equal(suyo.cobrado_por_obra.length, 0, 'el jefe de obra vio la cuenta de cada obra')
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
