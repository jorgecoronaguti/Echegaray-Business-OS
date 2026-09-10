#!/usr/bin/env node
// EL PAPEL ESTÁ GUARDADO Y LA COMPRA DICE «SIN COMPROBANTE» — ESTO LOS VUELVE A UNIR.
//
// Conciliación completa de los 14 días desde el 25/08/2026 (pedido del dueño, 08/09 16:30: «siguen
// habiendo comprobantes en canal comprobantes-gastos que no están en app.ecsas.com.ar»). De los 83
// archivos de esos días, 66 llegaron a la pestaña Compras y ninguno lo saca `esCompraDeObra` — pero
// 5 salían «sin comprobante» en la app, y 57 filas de `compra_adjunto` estaban en `sin_vincular`.
//
// DOS CAUSAS, LAS DOS ACÁ:
//
//   1. EL ARCHIVO SE SUBIÓ ANTES QUE SU FILA. El respaldo escribía con
//      `on conflict (origen_file_id) do nothing`: si el archivo ya estaba anotado sin clave, el
//      respaldo del fajo —que sí la trae— no escribía nada y el vínculo se perdía para siempre. Eso
//      se arregló en `lib/comprobantes/respaldo-adjunto.mjs` (ahora repone sin pisar). Este script
//      repara lo que quedó de antes.
//   2. LAS DOS CLAVES DEL MISMO COMPROBANTE. El lector arma `c:<cuit>|<numero>` y la fila del Sheet
//      vuelve sin CUIT, así que el espejo la guarda como `p:<proveedor>|<numero>`. La regla vive en
//      `lib/comprobantes/clave-conciliada.mjs` y exige que el NÚMERO y el TIPO coincidan siempre:
//      lo único que se afloja es la identidad, y sólo si el proveedor lo confirma.
//
// NO ESCRIBE EN EL SHEET NI EN MATTERMOST. Sólo rellena `compra_adjunto.compra_clave/fila_compras`
// donde hoy hay un hueco, y nunca pisa un vínculo existente. Correr dos veces no cambia nada.
//
//   node orquestador/scripts/vincular-adjuntos-huerfanos.mjs [--dry] [--dias 14]

import { query, closePool } from '../lib/db.mjs'
import { filaConciliada } from '../lib/comprobantes/clave-conciliada.mjs'

const DRY = process.argv.includes('--dry')
const DIAS = Number(process.argv[process.argv.indexOf('--dias') + 1]) || 400

/**
 * Lo que el lector del bot dijo de cada archivo: su clave y su proveedor, por `file_id`.
 *
 * LA CLAVE SALE DEL ÍTEM, NUNCA DE LA POSICIÓN. `filas` guarda sólo los ítems que ENTRARON al
 * Sheet, así que `filas[k]` no es el ítem `k`: cruzar por índice le colgó la factura de Robles
 * Pintureria al PDF de MASS CONSULTORA en la primera corrida en seco de este script (08/09/2026).
 * `filas` se usa sólo para el número de fila, y buscado POR CLAVE.
 */
export function lecturaPorArchivo(fajos = []) {
  const mapa = new Map()
  for (const f of fajos) {
    const filas = f.filas ?? []
    for (const it of (f.items ?? [])) {
      const clave = it?.clave ?? null
      if (!clave) continue
      const anotada = filas.find((x) => x?.clave === clave) ?? null
      const proveedor = it?.proveedor ?? it?.emisor?.nombre ?? anotada?.proveedor ?? null
      const fila = Number.isInteger(anotada?.fila) ? anotada.fila : null
      // El TOTAL viaja con la lectura porque es la corroboración de un candidato por número
      // (`papel-sin-vincular.mjs`): dos comprobantes distintos pueden compartir número, el importe no.
      const total = Number.isFinite(Number(it?.total)) ? Number(it.total) : null
      for (const o of [it?.origen, ...(it?.copias ?? [])]) {
        if (o?.fileId) mapa.set(String(o.fileId), { clave, proveedor, fila, total })
      }
    }
  }
  return mapa
}

async function main() {
  const { rows: huerfanos } = await query(
    `select id, origen_file_id, origen_post_id, nombre, creado_at
       from public.compra_adjunto
      where compra_clave is null and origen_file_id is not null
        and creado_at > now() - ($1 || ' days')::interval
      order by creado_at`, [String(DIAS)])
  const { rows: fajos } = await query(
    // TODOS los estados, no sólo «cargado». Un fajo se marca «descartado» cuando sus pendientes se
    // mudan a un fajo nuevo, y la LECTURA del papel que quedó ahí sigue siendo válida: el
    // 20379240195_011_00001_00000211.pdf está en la fila 923 de Compras y su única lectura vive en
    // el fajo descartado b55d33ff. Filtrar por «cargado» lo dejaba huérfano. La fila igual sale del
    // espejo, así que un fajo descartado no puede inventar una compra que no existe.
    `select items, filas from comunicacion.comprobante_fajos`)
  const { rows: espejo } = await query(
    `select fila, clave, proveedor, comprobante, total from public.compra_sheet where clave is not null`)

  const lectura = lecturaPorArchivo(fajos)
  const arreglados = []
  const sinLectura = []
  const sinFila = []

  for (const h of huerfanos) {
    const l = lectura.get(String(h.origen_file_id))
    if (!l) { sinLectura.push(h); continue }
    const f = filaConciliada(l.clave, espejo, { proveedor: l.proveedor })
    if (!f) { sinFila.push({ ...h, clave: l.clave, proveedor: l.proveedor }); continue }
    arreglados.push({ ...h, clave: f.clave, fila: f.fila, proveedor: f.proveedor, exacta: f.clave === l.clave })
  }

  for (const a of arreglados) {
    console.log(`${a.exacta ? 'exacta   ' : 'conciliada'} fila ${a.fila} · ${a.proveedor} · ${a.clave} ← ${a.nombre}`)
    if (DRY) continue
    // `compra_clave is null` en el WHERE: si alguien lo vinculó mientras tanto, gana esa persona.
    await query(
      `update public.compra_adjunto
          set compra_clave = $2, fila_compras = $3,
              vinculado_por = $4, confianza = 1, vinculado_at = now()
        where id = $1 and compra_clave is null`,
      [a.id, a.clave, a.fila, a.exacta ? 'registro' : 'match_numero'])  // valores del CHECK , ya en la base
  }
  console.log(`\n${DRY ? '[dry] ' : ''}vinculados ${arreglados.length} · sin lectura del bot ${sinLectura.length} · leídos pero sin fila en Compras ${sinFila.length}`)
  for (const s of sinFila) console.log(`  SIN FILA: ${s.nombre} · ${s.clave} · ${s.proveedor ?? '-'} · post ${s.origen_post_id}`)
  await closePool()
}

if (import.meta.url === `file://${process.argv[1]}`) await main()
