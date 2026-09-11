#!/usr/bin/env node
// VINCULAR CADA OBRA CON SU CARPETA DE DRIVE — ENSAYO por defecto, escribe con --aplicar.
//
// Lee `drive_index` (el catálogo del Drive, timer cada 6 h), las obras con sus alias y los PAPELES
// ANCLA que ya están atados a una obra con evidencia, y escribe `public.obra_carpeta_drive`.
//
// La REGLA no vive acá: vive en `orquestador/lib/obras-carpetas-drive.mjs`, que es puro y tiene sus
// tests. Este archivo es el borde: lee, llama, informa y —sólo con `--aplicar`— escribe.
//
//   node orquestador/scripts/obras-carpetas-drive.mjs            ← ensayo: no escribe nada
//   node orquestador/scripts/obras-carpetas-drive.mjs --aplicar
//   node orquestador/scripts/obras-carpetas-drive.mjs --cliente messina
//
// NO TOCA GOOGLE: `drive_index` ya tiene el catálogo. Y NO BORRA: una carpeta vinculada a mano por
// una persona (fuente `manual`) no la pisa ninguna corrida.

import { getPool } from '../lib/db.mjs'
import { vincularCarpetas } from '../lib/obras-carpetas-drive.mjs'

const args = process.argv.slice(2)
const APLICAR = args.includes('--aplicar')
const cliente = args[args.indexOf('--cliente') + 1]
const soloCliente = args.includes('--cliente') ? cliente : null

/** La raíz del Drive donde vive una carpeta por cliente y, adentro, una por obra. */
const RAIZ = 'administracion/PRESUPUESTOS - CLIENTES'
/** `administracion / PRESUPUESTOS - CLIENTES / <CLIENTE> / <OBRA>` = 4 segmentos. */
const NIVEL_OBRA = 4

const pool = getPool()
const q = async (sql, params) => (await pool.query(sql, params)).rows

// `obra_padre_id` LLEGA CON 20260911T2000, y este script tiene que poder correr antes: se pregunta
// por la columna en vez de suponerla. Sin ella no hay madres ni adicionales y el desempate de una
// carpeta compartida cae en «no se puede decidir» — que es la respuesta correcta, no un enlace
// inventado.
const hayPadre = (await q(`select count(*)::int n from information_schema.columns
   where table_schema = 'public' and table_name = 'obra_canonica' and column_name = 'obra_padre_id'`))[0].n > 0
const obras = await q(`
  select o.id, o.nombre, o.cliente_id, o.drive_carpeta_id,
         ${hayPadre ? 'o.obra_padre_id' : 'null::text as obra_padre_id'}
    from public.obra_canonica o
   where o.fusionada_en is null and o.cliente_id is not null`)
const alias = await q('select alias, obra_id from public.obra_alias where obra_id is not null')
const carpetas = await q(`
  select drive_file_id, name, path, depth from public.drive_index
   where is_folder and coalesce(trashed, false) = false and coalesce(ausente_en_drive, false) = false
     and path like $1`, [`${RAIZ}/%`])

// LOS PAPELES ANCLA: un archivo atado a una obra CON EVIDENCIA. Los tres orígenes que ya existen.
const anclas = await q(`
  select k.obra_id, d.drive_file_id, d.path, 'obra_contrato (la cotización que fija el precio)' que
    from public.obra_contrato k join public.drive_index d on d.drive_file_id = k.fuente_drive_id
  union all
  select r.obra_id, d.drive_file_id, d.path, 'cliente_orden ' || coalesce(r.tipo, '')
    from public.cliente_orden r join public.drive_index d on d.drive_file_id = r.drive_file_id
   where r.obra_id is not null and r.eliminado_en is null
  union all
  select v.obra_id, d.drive_file_id, d.path, 'obra_documento'
    from public.obra_documento v join public.drive_index d on d.drive_file_id = v.drive_file_id`)

/** El cliente de una ruta: el segmento 3 (`administracion/PRESUPUESTOS - CLIENTES/<CLIENTE>/…`). */
const carpetaCliente = (path) => String(path ?? '').split('/')[2] ?? null

// ═══ QUÉ CLIENTE DEL OS ES CADA CARPETA — TRES CAMINOS, NINGUNO UN PARECIDO ═══
//
// No se puede adivinar por el nombre: la carpeta «JAVIER SANCHEZ» es el cliente «Javier Sánchez -
// San Francisco - IMOTOR». Los tres caminos son:
//
//   1 · `cliente_alias`  el diccionario que el DUEÑO ya decidió («JAVIER SANCHEZ» → SAN FRANCISCO).
//   2 · el slug          el nombre de la carpeta normalizado ES el slug del cliente.
//   3 · un papel ancla   adentro hay un archivo atado a una obra: la obra dice de quién es.
//
// Sin ninguno de los tres, la carpeta queda como «cliente sin obras en el OS», que es lo que de
// verdad pasa con ARCOR - SAN JUAN, VUELO PLACO, ORICA y SAINT GOBAIN.
const clientes = await q('select id, nombre_comercial, slug from public.clientes')
const aliasCliente = await q('select rotulo_clave, cliente_canonico from public.cliente_alias')
const clientePorCarpeta = new Map()
const comoSlug = (s) => String(s ?? '').toLowerCase().normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const porSlug = new Map(clientes.map((c) => [c.slug, c.id]))
for (const carpeta of new Set(carpetas.map((c) => carpetaCliente(c.path)).filter(Boolean))) {
  const directo = porSlug.get(comoSlug(carpeta))
  if (directo) { clientePorCarpeta.set(carpeta, directo); continue }
  const a = aliasCliente.find((x) => x.rotulo_clave === carpeta.trim().toUpperCase())
  const porAlias = a ? porSlug.get(comoSlug(a.cliente_canonico)) : null
  if (porAlias) clientePorCarpeta.set(carpeta, porAlias)
}
for (const a of anclas) {
  const c = carpetaCliente(a.path)
  const o = obras.find((x) => x.id === a.obra_id)
  if (c && o?.cliente_id) clientePorCarpeta.set(c, o.cliente_id)
}
for (const o of obras) {
  if (!o.drive_carpeta_id) continue
  const c = carpetas.find((x) => x.drive_file_id === o.drive_carpeta_id)
  if (c) clientePorCarpeta.set(carpetaCliente(c.path), o.cliente_id)
}

const { vinculos, dudas, sinCarpeta } = vincularCarpetas({
  carpetas, anclas, obras, alias, nivelObra: NIVEL_OBRA,
  clienteDe: (path) => clientePorCarpeta.get(carpetaCliente(path)) ?? null,
})

const nombre = (id) => obras.find((o) => o.id === id)?.nombre ?? id
const delCliente = (id) => !soloCliente || obras.find((o) => o.id === id)?.cliente_id === soloCliente

console.log(`\nVÍNCULOS (${vinculos.length})`)
for (const v of vinculos.filter((v) => delCliente(v.obra_id)).sort((a, b) => a.ruta.localeCompare(b.ruta))) {
  console.log(`  ${nombre(v.obra_id).padEnd(34)} ← ${v.ruta.replace(RAIZ + '/', '')}`)
  console.log(`  ${''.padEnd(34)}   [${v.fuente}] ${v.porque}`)
}

const ajenas = dudas.filter((d) => d.tipo === 'cliente-sin-obras-en-el-os')
const propias = dudas.filter((d) => d.tipo !== 'cliente-sin-obras-en-el-os')

console.log(`\nSIN VINCULAR — para el dueño (${propias.length})`)
for (const d of propias) {
  const detalle = d.ruta ? d.ruta.replace(RAIZ + '/', '') : `${nombre(d.obra_id)} → ${d.drive_folder_id}`
  console.log(`  ${d.tipo.padEnd(34)} ${detalle}${d.obras?.length ? ` (candidatas: ${d.obras.map(nombre).join(' · ')})` : ''}`)
}

// LAS CARPETAS DE CLIENTES QUE NO TIENEN OBRA EN EL OS se cuentan por cliente, no se enumeran: son
// trabajo de alta de obras, no de vinculación, y una lista de 83 líneas esconde las seis que sí son
// de este trabajo.
const porClienteAjeno = new Map()
for (const d of ajenas) {
  const c = carpetaCliente(d.ruta)
  porClienteAjeno.set(c, (porClienteAjeno.get(c) ?? 0) + 1)
}
if (porClienteAjeno.size) {
  console.log(`\nCARPETAS DE CLIENTES SIN NINGUNA OBRA EN EL OS (${ajenas.length} carpetas)`)
  for (const [c, n] of [...porClienteAjeno].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(3)}  ${c}`)
}

console.log(`\nOBRAS SIN CARPETA (${sinCarpeta.length})`)
for (const id of sinCarpeta.filter(delCliente)) console.log(`  ${nombre(id)}`)

// ═══ LA COBERTURA: CUÁNTOS ARCHIVOS QUEDA VIENDO CADA OBRA ═══
//
// GANA LA CARPETA MÁS PROFUNDA, y es la misma regla que la vista `obra_papel_drive`: la carpeta del
// cliente («JAVIER SANCHEZ») está vinculada a la obra original y adentro están las carpetas de las
// otras tres obras. Sin esta regla, los papeles del Entrepiso contarían dos veces y aparecerían
// abajo de la obra equivocada.
const archivos = await q(`
  select path from public.drive_index
   where not is_folder and coalesce(trashed, false) = false and path like $1`, [`${RAIZ}/%`])
const rutas = vinculos.map((v) => ({ ruta: v.ruta + '/', obra_id: v.obra_id }))
const cobertura = new Map()
let cubiertos = 0
for (const a of archivos) {
  const c = rutas.filter((r) => a.path.startsWith(r.ruta)).sort((x, y) => y.ruta.length - x.ruta.length)[0]
  if (!c) continue
  cubiertos++
  cobertura.set(c.obra_id, (cobertura.get(c.obra_id) ?? 0) + 1)
}
console.log(`\nCOBERTURA — ${cubiertos} de ${archivos.length} archivos de «${RAIZ}» quedan bajo una obra`)
for (const [id, n] of [...cobertura].filter(([id]) => delCliente(id)).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${nombre(id)}`)
}

if (!APLICAR) {
  console.log('\nENSAYO: no se escribió nada. Para escribir: --aplicar')
  await pool.end()
  process.exit(0)
}

const existe = (await q(`select to_regclass('public.obra_carpeta_drive') t`))[0].t
if (!existe) {
  console.error('\nLa tabla public.obra_carpeta_drive no existe: falta aplicar la migración '
    + '20260911T2100_los_papeles_de_una_obra_tienen_su_carpeta.sql')
  await pool.end()
  process.exit(1)
}

let escritos = 0
for (const v of vinculos) {
  // NO PISA LO MANUAL: si una persona ató esta carpeta a mano, su decisión gana a la corrida.
  const r = await q(`
    insert into public.obra_carpeta_drive (obra_id, drive_folder_id, ruta, fuente, porque)
    values ($1, $2, $3, $4, $5)
    on conflict (drive_folder_id) do update
       set obra_id = excluded.obra_id, ruta = excluded.ruta, fuente = excluded.fuente,
           porque = excluded.porque, actualizado_en = now()
     where public.obra_carpeta_drive.fuente <> 'manual'
    returning drive_folder_id`, [v.obra_id, v.drive_folder_id, v.ruta, v.fuente, v.porque])
  escritos += r.length
}
console.log(`\nESCRITOS ${escritos} de ${vinculos.length} (los que faltan son vínculos manuales, que no se pisan)`)
await pool.end()
