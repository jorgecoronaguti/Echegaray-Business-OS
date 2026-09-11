// LOS PAPELES DE UNA OBRA — la vista y la RPC, contra los datos REALES de Drive.
//
// ═══ QUÉ DEFECTOS ATRAPA ═══
//
//  1 · QUE UN PAPEL SALGA ABAJO DE LA OBRA EQUIVOCADA. Son los dos casos que de verdad existen en el
//      Drive de Echegaray: la carpeta del CLIENTE «JAVIER SANCHEZ» está declarada como carpeta de la
//      obra original y adentro están las carpetas de las otras tres obras (gana la MÁS PROFUNDA); y
//      la OC del adicional del tercer muro está guardada DENTRO de la carpeta del Playón de Azufre
//      (gana el PAPEL ATADO por encima de la carpeta).
//  2 · QUE LA COLUMNA NUEVA NAZCA SIN PERMISO. `obra_papel_drive` es `security_invoker`: sin GRANT
//      sobre `obra_carpeta_drive`, la cara Documentos responde «permission denied» para todos.
//  3 · QUE LOS PAPELES VIAJEN EN LAS NUEVE CARAS. Son 100+ filas por cliente: el recorte por solapa
//      que 20260911T1200 acaba de ganar se perdería de nuevo, y esta vez sin que nadie lo midiera.
//
// Las dos migraciones se aplican DENTRO de la transacción y todo termina en ROLLBACK.

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { getPool } from './db.mjs'

const migracion = (n) => readFileSync(join(
  import.meta.dirname, '..', '..', 'supabase', 'migrations', n), 'utf8')
const EL_PADRE = migracion('20260911T2000_obra_adicional_cuelga_de_su_obra_mayor.sql')
const LOS_PAPELES = migracion('20260911T2100_los_papeles_de_una_obra_tienen_su_carpeta.sql')

const RAIZ = 'administracion/PRESUPUESTOS - CLIENTES'
/** La OC del adicional, guardada DENTRO de la carpeta de su obra mayor. */
const OC_DEL_ADICIONAL = '15QUCmWc1KGfcQqiX-UPo3VDklfNEjqjz'


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
//     ORQ_PG_DDL=1 node --test orquestador/lib/obra-papel-drive.pg.test.mjs
const DDL_PERMITIDO = process.env.ORQ_PG_DDL === '1'
const hayBase = DDL_PERMITIDO
  && await getPool().query('select 1').then(() => true).catch(() => false)

test('los papeles de cada obra salen de una sola vista y ninguno cae en la obra equivocada', { skip: !hayBase }, async (t) => {
  const c = await getPool().connect()
  const q = async (sql, params) => (await c.query(sql, params)).rows
  try {
    await c.query('begin')
    await c.query(EL_PADRE)
    await c.query(LOS_PAPELES)

    // LOS VÍNCULOS QUE ESCRIBE `scripts/obras-carpetas-drive.mjs`, los tres que hacen falta para
    // medir las dos reglas. Se escriben acá y no se corre el script: lo que se prueba es la VISTA.
    const carpeta = async (ruta, obraId, fuente) => {
      const f = (await q('select drive_file_id from public.drive_index where path = $1 and is_folder', [ruta]))[0]
      assert.ok(f, `la carpeta «${ruta}» no está en drive_index: el índice cambió`)
      // IDEMPOTENTE: desde que el dueño corrió el script con `--aplicar`, estos tres vínculos YA
      // están en la base. El test tiene que medir lo mismo antes y después de esa corrida — si
      // dependiera de que la tabla esté vacía, se pondría rojo por el éxito del script.
      await q(`insert into public.obra_carpeta_drive (drive_folder_id, obra_id, ruta, fuente)
               values ($1, $2, $3, $4)
               on conflict (drive_folder_id) do update
                  set obra_id = excluded.obra_id, ruta = excluded.ruta, fuente = excluded.fuente`,
        [f.drive_file_id, obraId, ruta, fuente])
    }
    await carpeta(`${RAIZ}/JAVIER SANCHEZ`, 'san-francisco', 'obra_canonica.drive_carpeta_id')
    await carpeta(`${RAIZ}/JAVIER SANCHEZ/Entrepiso`, 'entrepiso-y-escalera', 'obra_canonica.drive_carpeta_id')
    await carpeta(`${RAIZ}/MESSINA/PLATEA DE HORMIGON - Playon de azufre`, 'messina-playon-azufre', 'nombre-de-carpeta')

    await t.test('gana la carpeta MÁS PROFUNDA: el entrepiso no cuelga de la obra del cliente', async () => {
      const filas = await q(`select obra_id, count(*)::int n from public.obra_papel_drive
                              where ruta like $1 group by 1 order by 2 desc`, [`${RAIZ}/JAVIER SANCHEZ/%`])
      const por = new Map(filas.map((f) => [f.obra_id, f.n]))
      assert.ok((por.get('entrepiso-y-escalera') ?? 0) > 0, 'el entrepiso se quedó sin papeles')
      // Y NINGÚN ARCHIVO ESTÁ DOS VECES: la vista es `distinct on (drive_file_id)`.
      const dobles = await q(`select drive_file_id from public.obra_papel_drive
                               group by 1 having count(*) > 1 limit 1`)
      assert.deepEqual(dobles, [], 'un archivo aparece bajo dos obras a la vez')
      const dentro = await q(`select obra_id from public.obra_papel_drive
                               where ruta like $1`, [`${RAIZ}/JAVIER SANCHEZ/Entrepiso/%`])
      assert.ok(dentro.length > 0)
      for (const f of dentro) {
        assert.equal(f.obra_id, 'entrepiso-y-escalera',
          'un papel del entrepiso quedó bajo la obra dueña de la carpeta del cliente')
      }
    })

    await t.test('el papel ATADO le gana a la carpeta: la OC del adicional es del adicional', async () => {
      const f = (await q('select obra_id, via from public.obra_papel_drive where drive_file_id = $1',
        [OC_DEL_ADICIONAL]))[0]
      assert.ok(f, 'la OC 2256 no está en la vista: ¿se movió en Drive?')
      assert.equal(f.obra_id, 'messina-adicional-tercer-muro',
        'la OC del adicional quedó bajo el Playón de Azufre porque el PDF vive en su carpeta')
      assert.match(f.via, /atado|cotización|contrato/)
    })

    await t.test('la cara Documentos trae los papeles y las demás NO los transportan', async () => {
      const documentos = JSON.parse(
        (await q(`select public.pantalla_cliente('san-francisco', 'documentos')::text t`))[0].t)
      const obras = JSON.parse(
        (await q(`select public.pantalla_cliente('san-francisco', 'obras')::text t`))[0].t)
      assert.ok(documentos.papeles_obra.length > 0, 'la cara Documentos no trajo ningún papel de obra')
      assert.deepEqual(obras.papeles_obra, [], 'los papeles viajan en una cara que no los dibuja')
      assert.ok(documentos.carpetas_obra.length > 0)
      assert.deepEqual(obras.carpetas_obra, [])
      // Cada papel es de una obra DE ESTE CLIENTE: la RPC recorta, no manda el Drive entero.
      const suyas = new Set(documentos.obras.map((o) => o.obra_id))
      for (const p of documentos.papeles_obra) assert.ok(suyas.has(p.obra_id))
    })

    await t.test('la tabla nace con permiso de lectura y su RLS es la de la obra', async () => {
      const p = (await q(`
        select has_table_privilege('authenticated', 'public.obra_carpeta_drive', 'select') lee,
               has_table_privilege('authenticated', 'public.obra_carpeta_drive', 'insert') escribe,
               (select relrowsecurity from pg_class where oid = 'public.obra_carpeta_drive'::regclass) rls,
               (select count(*)::int from pg_policy where polrelid = 'public.obra_carpeta_drive'::regclass) policies`))[0]
      assert.equal(p.lee, true, 'authenticated no puede leer la tabla: la cara Documentos se cae entera')
      assert.equal(p.escribe, false, 'cualquiera con sesión puede atar una carpeta a una obra')
      assert.equal(p.rls, true, 'la tabla nueva quedó SIN RLS')
      assert.equal(p.policies, 2)
    })

    await t.test('una carpeta pertenece a UNA obra: la clave lo impone la base', async () => {
      const f = (await q('select drive_folder_id from public.obra_carpeta_drive limit 1'))[0]
      await c.query('savepoint dos_obras')
      await assert.rejects(
        () => c.query(`insert into public.obra_carpeta_drive (drive_folder_id, obra_id, ruta, fuente)
                       values ($1, 'messina', 'x', 'manual')`, [f.drive_folder_id]),
        /duplicate key/)
      await c.query('rollback to savepoint dos_obras')
    })
  } finally {
    await c.query('rollback').catch(() => {})
    c.release()
  }
})
