// EL N DE LA SOLAPA DOCUMENTOS Y LAS FILAS DE ABAJO CUENTAN LO MISMO — sobre los clientes REALES.
//
// ═══ QUÉ DEFECTO ATRAPA ═══
//
// Hay dos implementaciones de «cuántos papeles tiene este cliente»: `n_documentos` en SQL —que viaja
// en las nueve caras, porque la barra de solapas escribe el número en todas— y
// `armarCaraDocumentos()` en TypeScript, que es lo que DIBUJA. Dos implementaciones de la misma
// regla se separan en el primer cambio de criterio, y cuando se separan el dueño ve «Documentos ·
// 113» arriba y 226 filas abajo — que es exactamente el defecto que mandó arreglar («el crm dice
// documentos de drive (0) y está pésimo eso»).
//
// Se comparan sobre TODOS los clientes, no sobre uno elegido, y con el MISMO payload: se llama a la
// RPC, se arma la cara con su resultado y se mide contra el `n_documentos` que esa misma llamada
// trajo. La migración se aplica DENTRO de la transacción y todo termina en ROLLBACK.
//
// La cuarta fuente —los archivos de la carpeta del cliente que ninguna obra reclama— la lee la
// página con `getArchivosDeEntidad`; acá se reproduce su MISMA consulta (mismo `like`, mismo tope de
// 300) para poder comparar los dos números completos.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'
import { armarCaraDocumentos } from '../../src/features/clientes/services/caraDocumentos.ts'
import { papelesPorObra } from '../../src/features/clientes/services/papelesDeObra.ts'
import { agruparPapeles } from '../../src/features/clientes/services/papelesCliente.ts'

const CONTADOR = readFileSync(join(
  import.meta.dirname, '..', '..', 'supabase', 'migrations',
  '20260911T2200_el_contador_de_documentos_cuenta_lo_que_se_dibuja.sql'), 'utf8')


// ═══ ESTE TEST NO CORRE SOLO, Y ES UNA DECISIÓN DE PRODUCCIÓN (11/09/2026) ═══
//
// Aplica migraciones adentro de una transacción. El ROLLBACK deshace los objetos, pero el DDL YA
// DISPARÓ `pgrst_ddl_watch`: cada `create` manda a PostgREST a recargar el esquema, y cada recarga
// frena ~1,5 s a TODO el que esté usando la app. El 11/09 hubo 148 recargas en un día y el dueño vio
// la app trabada; buena parte salió de correr estos tests una y otra vez contra la base REAL.
//
// Por eso pide `ORQ_PG_DDL=1` explícito: la evidencia que da sigue estando disponible cuando hace
// falta —antes de aplicar una migración, o auditando un cambio del modelo— y deja de pagarse sin
// que nadie lo haya pedido.
//
//     ORQ_PG_DDL=1 node --test orquestador/lib/cara-documentos.pg.test.mjs
const DDL_PERMITIDO = process.env.ORQ_PG_DDL === '1'
const hayBase = DDL_PERMITIDO
  && await getPool().query('select 1').then(() => true).catch(() => false)

test('el contador de la solapa y lo que dibuja la cara cuentan lo mismo', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  try {
    await c.query('begin')
    // ═══ EL MUTEX DEL DDL EN LA BASE COMPARTIDA (12/09/2026) ═══
    //
    // Este test aplica una migración DENTRO de la transacción, así que toma locks ACCESS EXCLUSIVE
    // sobre las vistas que recrea. Los 16 tests que ya tomaban este mismo advisory lock se
    // serializaban entre ellos y quedaban expuestos a los que NO lo tomaban: medido el 12/09 en la
    // corrida completa, `rls-obra-no-por-fila` murió con «canceling statement due to lock timeout» y
    // `vinculacion-estandar` con «statement timeout» aplicando T6100, las dos pasando solas. El lock
    // se pide ANTES de cualquier otra cosa: quien hace DDL acá, primero toma el turno.
    await c.query('select pg_advisory_xact_lock(20260822)')
    await c.query(CONTADOR)

    const clientes = await q('select slug from public.cliente_panel where slug is not null order by slug')
    assert.ok(clientes.length > 0, 'no hay clientes: este test no probó nada')

    for (const { slug } of clientes) {
      await t.test(`${slug}`, async () => {
        const j = JSON.parse((await q(
          `select public.pantalla_cliente($1, 'documentos')::text t`, [slug]))[0].t)

        // La MISMA lectura que hace la página (`carpetaDeEntidadService`): la carpeta del cliente,
        // sin carpetas, sin papelera, con el tope de 300.
        const archivosDelCliente = await q(`
          select a.drive_file_id, a.name, a.path, a.size_bytes, a.modified_time, a.web_view_link
            from public.drive_index a
           where not a.is_folder and coalesce(a.trashed, false) = false
             and coalesce(a.ausente_en_drive, false) = false
             and a.path like (select p.path || '/%' from public.drive_index p
                               where p.drive_file_id = $1)
           order by a.modified_time desc nulls last limit 300`, [j.cliente?.drive_carpeta_id ?? ''])

        const cara = armarCaraDocumentos({
          filas: (j.obras ?? []).map((o) => ({
            obra_id: o.obra_id, nombre: o.nombre, nivel: o.obra_padre_id ? 1 : 0,
            esAdicional: !!o.obra_padre_id, huerfano: false,
          })),
          papelesObra: papelesPorObra(j.papeles_obra ?? [], {
            obrasConCarpeta: new Set((j.carpetas_obra ?? []).map((x) => x.obra_id)),
            aceptadas: new Set(),
          }),
          papelesCliente: agruparPapeles(j.papeles ?? []),
          documentos: j.documentos ?? [],
          archivosDelCliente,
          carpetas: new Map(),
        })

        // EXACTAMENTE EL MISMO NÚMERO. No «parecido»: el N de la solapa y las filas de abajo hablan
        // del mismo cliente, y una diferencia de uno es un archivo que alguien no encuentra.
        //
        // LA EXCEPCIÓN ES EL TOPE, Y ES UNA EXCEPCIÓN DECLARADA: la lectura de la carpeta del
        // cliente trae 300 archivos como máximo (`TOPE_ARCHIVOS`), y ARCOR tiene 641. Ahí la cara
        // dibuja MENOS que lo que hay y la pantalla lo dice con palabras («Drive devolvió el tope»),
        // en vez de publicar un número redondeado hacia abajo como si fuera el total.
        if (archivosDelCliente.length >= 300) {
          assert.ok(cara.total < Number(j.n_documentos),
            `${slug}: se topó la lectura de Drive y aun así la cara dice tener todo`)
          return
        }
        assert.equal(cara.total, Number(j.n_documentos),
          `${slug}: la cara dibuja ${cara.total} y la solapa cuenta ${j.n_documentos}`)
      })
    }

    await t.test('y el número dejó de ser el de los vínculos manuales', async () => {
      const j = JSON.parse((await q(
        `select public.pantalla_cliente('san-francisco', 'documentos')::text t`))[0].t)
      const vinculos = Number((await q(`
        select count(*) n from public.cliente_documento d
         join public.cliente_panel c on c.cliente_id = d.cliente_id
        where c.slug = 'san-francisco'`))[0].n)
      assert.equal(vinculos, 0, 'San Francisco dejó de ser el caso testigo: ya tiene vínculos manuales')
      assert.ok(j.n_documentos > 0,
        'la solapa vuelve a decir 0 sobre un cliente con 63 archivos en Drive')
    })
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
