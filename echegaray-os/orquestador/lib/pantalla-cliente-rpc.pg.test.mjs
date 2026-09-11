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
  '20260911T1200_la_ficha_del_cliente_trae_lo_que_su_cara_dibuja.sql'), 'utf8')

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

    // ═══ EL RECORTE POR CARA (20260911T1200) ═══
    //
    // Lo que este bloque atrapa: que `p_solapa` deje de ser un RECORTE y se vuelva un cambio de
    // dato. Un recorte que además alterara lo que sí viaja sería peor que el peso que ahorra —la
    // cabecera y el costado se dibujan igual en las nueve caras—, y un recorte que no recortara
    // nada sería una firma nueva sin efecto.
    await t.test('la cara pedida recorta lo que no dibuja, y NADA más', async () => {
      const entera = (await q('select public.pantalla_cliente($1, null) j', [slug]))[0].j
      // Lo que la cabecera y el costado necesitan en TODAS las caras tiene que venir idéntico.
      const SIEMPRE = ['cliente', 'perfil', 'responsables', 'contactos', 'obras', 'economia_obras',
        'cobrado_por_obra', 'economia_cliente', 'papeles', 'presupuestos', 'n_documentos']
      // Lo que sólo dibujan Documentos y Actividad, y lo que sólo dibuja Actividad.
      const SOLO_DOC = ['documentos', 'drive']
      const SOLO_ACT = ['notas', 'autores', 'certificados']
      const RECORTADAS = { obras: [...SOLO_DOC, ...SOLO_ACT], ordenes: [...SOLO_DOC, ...SOLO_ACT],
        cobranzas: [...SOLO_DOC, ...SOLO_ACT], presupuestos: [...SOLO_DOC, ...SOLO_ACT],
        cuenta: [...SOLO_DOC, ...SOLO_ACT], esquema: [...SOLO_DOC, ...SOLO_ACT],
        accesos: [...SOLO_DOC, ...SOLO_ACT], documentos: SOLO_ACT, actividad: [] }

      // LAS NUEVE CARAS, INCLUIDAS LAS DOS QUE RECIBEN TODO. Auditor de cierre (11/09/2026): el
      // bucle recorría siete, y mutar la migración para vaciar `papeles` SÓLO en la cara Documentos
      // dejaba el guardián verde — la cabecera habría escrito «OC recibidas c/IVA (0)» sobre un
      // cliente con 333 papeles. Una cara que no se compara es una cara sin control.
      for (const [cara, recortadas] of Object.entries(RECORTADAS)) {
        const j = (await q('select public.pantalla_cliente($1, $2) j', [slug, cara]))[0].j
        for (const k of SIEMPRE) {
          assert.deepEqual(j[k], entera[k], `la cara «${cara}» cambió «${k}», que se dibuja en las nueve`)
        }
        for (const k of recortadas) {
          assert.deepEqual(j[k], [], `la cara «${cara}» todavía transporta «${k}»`)
        }
        // Lo que NO está recortado en esta cara tiene que llegar igual que en la ficha entera.
        for (const k of [...SOLO_DOC, ...SOLO_ACT].filter((x) => !recortadas.includes(x))) {
          assert.deepEqual(canonico(j[k]), canonico(entera[k]), `la cara «${cara}» no recibió «${k}»`)
        }
        const esperado = cara === 'actividad' ? entera.actividad_cliente : null
        assert.deepEqual(j.actividad_cliente, esperado,
          `la cara «${cara}» no transporta actividad_cliente como corresponde`)
      }
    });

    // ═══ LO QUE ESTE CONTROL NO PUEDE PROBAR HOY, DICHO EN VOZ ALTA ═══
    //
    // Auditor de cierre (11/09/2026): `cliente_nota` y `certificados` tienen CERO filas en toda la
    // base, así que los asserts sobre `notas`, `autores` y `certificados` comparan `[]` contra `[]`
    // y quedan verdes aunque se les saque el recorte. El control existe y es correcto; hoy no
    // muerde. Esta prueba no arregla eso —no se fabrican filas en producción— pero lo DECLARA: el
    // día que se cargue la primera nota o el primer certificado, deja de estar en blanco y el
    // bucle de arriba empieza a cuidarlo de verdad. Un límite callado es un control que se cree.
    await t.test('declara cuáles de las claves recortadas todavía no tienen datos que mirar', async () => {
      const entera = (await q('select public.pantalla_cliente($1, null) j', [slug]))[0].j
      const enBlanco = ['notas', 'autores', 'certificados'].filter((k) => entera[k].length === 0)
      if (enBlanco.length) {
        t.diagnostic(`SIN PROBAR (cero filas en la base): ${enBlanco.join(', ')} — el recorte de la `
          + 'cara Actividad no se puede poner en rojo hasta que exista la primera fila')
      }
      // Al menos UNA de las seis claves recortadas tiene que tener datos, o el control entero es
      // decorativo. `drive` y `documentos` los tienen (208 en arcor) y son los que sostienen la
      // prueba mientras las otras tres estén vacías.
      assert.ok(entera.drive.length > 0 && entera.documentos.length > 0,
        'ninguna clave recortada tiene filas: el recorte no se puede probar con este cliente')
    });

    // FAIL-CLOSED, NO FAIL-OPEN. Un `p_solapa` que no es ninguna de las nueve recibe el MÍNIMO, no
    // la ficha entera: si algún día un consumidor manda un valor viejo, el peor caso es una cara
    // pobre y nunca 199 KB de más. `solapaDe()` ya normaliza antes de llamar, así que hoy no puede
    // pasar — esto clava el contrato para el día que otro consumidor llame directo.
    await t.test('una solapa desconocida recibe el mínimo, no la ficha entera', async () => {
      const raro = (await q(`select public.pantalla_cliente($1, 'no-existe-esta-cara') j`, [slug]))[0].j
      const obras = (await q(`select public.pantalla_cliente($1, 'obras') j`, [slug]))[0].j
      assert.deepEqual(raro.drive, [])
      assert.deepEqual(raro.documentos, [])
      assert.equal(raro.actividad_cliente, null)
      assert.equal(Number(raro.n_documentos), Number(obras.n_documentos))
      assert.deepEqual(canonico(raro.papeles), canonico(obras.papeles))
    });

    // LA CUENTA NO PUEDE MENTIR CUANDO LAS FILAS NO VIAJAN: es lo único que sostiene el «Documentos
    // · N» de la barra en las siete caras que ya no reciben la lista.
    await t.test('n_documentos cuenta lo mismo que la lista que reemplaza', async () => {
      const entera = (await q('select public.pantalla_cliente($1, null) j', [slug]))[0].j
      assert.ok(entera.documentos.length > 0, 'este cliente no tiene vínculos: la cuenta no se pudo probar')
      assert.equal(Number(entera.n_documentos), entera.documentos.length)
      for (const cara of ['obras', 'documentos']) {
        const j = (await q('select public.pantalla_cliente($1, $2) j', [slug, cara]))[0].j
        assert.equal(Number(j.n_documentos), entera.documentos.length,
          `«${cara}» perdió la cuenta de documentos`)
      }
    });

    // LA PUERTA VIEJA SIGUE ABIERTA mientras Vercel despliega: si esta firma desapareciera, la
    // ficha se caería en la ventana entre aplicar la migración y terminar el deploy.
    await t.test('la firma de un argumento sigue devolviendo la ficha entera', async () => {
      const uno = (await q('select public.pantalla_cliente($1) j', [slug]))[0].j
      const dos = (await q('select public.pantalla_cliente($1, null) j', [slug]))[0].j
      assert.equal(canonico(uno.documentos).length, canonico(dos.documentos).length)
      assert.equal(uno.cliente.slug, slug)
    });

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
