#!/usr/bin/env node
// LOS PAPELES QUE ESTÁN GUARDADOS Y NADIE LEYÓ NUNCA — se leen y se cuelgan de su fila.
//
// El backfill (`backfill-comprobantes-mattermost.mjs`) sólo mira lo que TODAVÍA NO ESTÁ en el
// bucket: `origen_file_id` es único y lo que ya está anotado se saltea entero. Eso deja un hueco
// permanente para los 21 archivos que se guardaron en una corrida SIN `--con-vision`: quedaron
// respaldados, sin lectura y sin fila, y ninguna corrida posterior los vuelve a mirar. Acá se los
// mira, y sólo a ellos.
//
// ═══ NO ESCRIBE EN EL SHEET. NI UNA CELDA ═══
//
// Lo único que toca es `public.compra_adjunto`: la clave, la fila-pista y la lectura. Si la lectura
// encuentra su fila, el papel aparece en la pantalla Compras colgado de esa compra; si no la
// encuentra, queda `sin_vincular` y sale en la sub-vista para que una persona lo asigne. Cargar la
// compra es otra decisión y otra herramienta: la mitad de estos archivos son la misma factura
// reenviada tres veces, y cargarla otra vez duplicaría el gasto.
//
// ═══ CUESTA CRÉDITOS ═══
//
// Una llamada de visión por archivo. `--dry` cuenta y no gasta. `--tope N` acota.
//
//   node orquestador/scripts/leer-adjuntos-sin-lectura.mjs --dry
//   ORQ_IA_PERMITIR=… node orquestador/scripts/leer-adjuntos-sin-lectura.mjs [--tope N]

import { query, closePool } from '../lib/db.mjs'
import { mattermostDelOs } from '../lib/mattermost-os.mjs'
import { bajarAdjunto } from '../comunicacion/comprobantes/flujo.mjs'
import { normalizar_lectura } from '../lib/comprobantes/lectura.mjs'
import { leerAdjunto } from '../lib/comprobantes/vision.mjs'
import { vincularLectura } from '../lib/comprobantes/vinculo.mjs'

const DRY = process.argv.includes('--dry')
const TOPE = Number(process.argv[process.argv.indexOf('--tope') + 1]) || Infinity

async function main() {
  const { rows: pendientes } = await query(
    `select id, origen_file_id, nombre from public.compra_adjunto
      where compra_clave is null and lectura is null and origen_file_id is not null
        and origen = 'mattermost'
        -- LO QUE EL BOT YA LEYÓ NO SE VUELVE A LEER. Su lectura vive en el ítem del fajo
        -- (comprobante_fajos.items) aunque la columna lectura de esta tabla esté vacía: sin este
        -- filtro se pagarían 24 llamadas de visión para volver a averiguar lo que ya está escrito, y
        -- una segunda lectura del mismo papel puede además contradecir a la primera. El ítem SIN
        -- clave no cuenta como lectura: es un papel que el bot miró y no pudo identificar, y ésos
        -- son justamente los que hay que volver a mirar.
        and not exists (
          select 1 from comunicacion.comprobante_fajos f,
                        lateral jsonb_array_elements(coalesce(f.items,'[]'::jsonb)) it
           where it->>'clave' is not null
             and (it->'origen'->>'fileId' = compra_adjunto.origen_file_id
               or exists (select 1 from jsonb_array_elements(coalesce(it->'copias','[]'::jsonb)) co
                           where co->>'fileId' = compra_adjunto.origen_file_id)))
      order by subido_at`)
  console.log(`respaldados, sin leer y sin fila: ${pendientes.length}`)
  if (DRY || !pendientes.length) {
    console.log('[dry] no bajé, no leí y no escribí nada.')
    await closePool(); return
  }

  const mm = mattermostDelOs()
  if (!mm) throw new Error('sin MM_BASE_URL/MM_BOT_TOKEN — no puedo bajar los archivos')
  const { rows: compras } = await query(
    'select fila, clave, comprobante, total::float8 total from public.compra_sheet')

  const cuenta = { leidos: 0, vinculados: 0, sueltos: 0, fallados: 0 }
  for (const p of pendientes.slice(0, TOPE)) {
    const bajado = await bajarAdjunto(mm, p.origen_file_id)
    if (!bajado.ok) { cuenta.fallados++; console.log(`  ✗ ${p.nombre}: ${bajado.error}`); continue }
    const leido = await leerAdjunto({ data: bajado.data, mediaType: bajado.mediaType, nombre: bajado.nombre })
    if (!leido.ok) { cuenta.fallados++; console.log(`  ✗ ${p.nombre}: ${leido.error}`); continue }
    cuenta.leidos++

    const c = normalizar_lectura(leido.crudo).comprobante
    const v = vincularLectura(c, compras)
    // La lectura se guarda SIEMPRE, haya vínculo o no: es lo que evita volver a gastar el modelo
    // sobre el mismo papel y lo que deja auditar un match dudoso sin releerlo.
    if (v.vinculado_por === 'match_numero') {
      cuenta.vinculados++
      console.log(`  ✓ ${p.nombre} → fila ${v.fila} · ${v.clave} (confianza ${v.confianza})`)
      await query(
        `update public.compra_adjunto
            set compra_clave=$2, fila_compras=$3, vinculado_por='match_numero', confianza=$4,
                vinculado_at=now(), lectura=$5
          where id=$1 and compra_clave is null`,
        [p.id, v.clave, v.fila, v.confianza ?? null, JSON.stringify(c)])
    } else {
      cuenta.sueltos++
      console.log(`  · ${p.nombre} sin fila: ${v.motivo} (${c?.cuit ?? '-'} ${c?.numero ?? '-'})`)
      await query('update public.compra_adjunto set lectura=$2 where id=$1 and compra_clave is null',
        [p.id, JSON.stringify(c)])
    }
  }
  console.log(`\nleídos ${cuenta.leidos} · vinculados ${cuenta.vinculados} · sin fila ${cuenta.sueltos} · fallados ${cuenta.fallados}`)
  await closePool()
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
