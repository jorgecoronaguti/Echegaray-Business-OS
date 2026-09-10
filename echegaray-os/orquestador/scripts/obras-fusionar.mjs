#!/usr/bin/env node
// FUSIONAR DOS OBRAS DEL MAESTRO QUE SON LA MISMA OBRA.
//
//   node orquestador/scripts/obras-fusionar.mjs --de bsa-planta --en messina-bsa           → dice qué haría
//   node orquestador/scripts/obras-fusionar.mjs --de bsa-planta --en messina-bsa --aplicar → mueve y verifica
//
// Decisión del dueño (10/09/2026): «BSA - Planta» = «ME - BSA» y «Pisos 120m2» = «ME - PISOS 120 M²
// Y RAMPA». «Limpieza de Escombros» y «Relevamiento Topográfico» NO se tocan.
//
// ═══ POR QUÉ LAS TABLAS NO ESTÁN ESCRITAS ACÁ ═══
//
// La lista de tablas que referencian una obra sale de `pg_constraint` en el momento de correr, no de
// una lista en el código. Una lista escrita a mano envejece con la primera tabla nueva y la fusión
// dejaría filas apuntando a una obra que ya nadie mira — sin error, que es lo peor. El precio de
// descubrirlo son 39 `count(*)` sobre tablas chicas.
//
// El QUÉ se mueve y el QUÉ NO lo decide `../lib/obras-fusion.mjs` (puro, con tests). Este archivo
// sólo mide, ejecuta dentro de UNA transacción y vuelve a leer la base para probar el efecto.
//
// ═══ LO QUE NO HACE ═══
//
// No borra la obra vieja (su nombre sigue escrito en documentos y en el Sheet) ni suma economías:
// si las dos obras publican `obra_economia_sheet`, lo declara como conflicto y no toca ninguna.
import { closePool, query, withTx } from '../lib/db.mjs'
import { lineasDelPlan, planificarFusion } from '../lib/obras-fusion.mjs'

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : undefined }
const APLICAR = process.argv.includes('--aplicar')

/** Las columnas que referencian `obra_canonica`, medidas contra la base viva. */
async function referenciasVivas(de, en) {
  const { rows } = await query(`
    select c.conrelid::regclass::text as tabla, a.attname as col
      from pg_constraint c
      join unnest(c.conkey) k(attnum) on true
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
     where c.contype = 'f' and c.confrelid = 'public.obra_canonica'::regclass
     order by 1, 2`)
  const refs = []
  for (const { tabla, col } of rows) {
    const { rows: [n] } = await query(
      `select count(*) filter (where "${col}" = $1)::int as de, count(*) filter (where "${col}" = $2)::int as en from ${tabla}`,
      [de, en])
    refs.push({ tabla, col, filasDe: n.de, filasEn: n.en })
  }
  return refs
}

/** Aplica el plan en UNA transacción. Si una tabla no mueve lo que dijo el plan, no se aplica nada. */
async function aplicar(plan) {
  const tieneMarca = await existeColumnaFusionadaEn()
  await withTx(async (cx) => {
    for (const m of plan.movimientos) {
      const r = await cx.query(`update ${m.tabla} set "${m.col}" = $1 where "${m.col}" = $2`, [plan.en, plan.de])
      if (r.rowCount !== m.filasDe) throw new Error(`${m.tabla}: movió ${r.rowCount} y el plan decía ${m.filasDe}`)
    }
    for (const a of plan.aliasNuevos) {
      await cx.query(
        `insert into public.obra_alias (alias, obra_id, clasificacion, ejemplo_raw) values ($1,$2,$3,$4)
         on conflict (alias) do nothing`,
        [a.alias, a.obra_id, a.clasificacion, plan.nombreDe])
    }
    // La marca `fusionada_en` es lo único que saca la obra vieja de las pantallas. Vive en una
    // migración que aplica el dueño (una migración no se aplica desde un agente), así que el script
    // funciona con y sin ella: sin la columna, la fusión de datos igual queda completa.
    if (tieneMarca) {
      await cx.query('update public.obra_canonica set fusionada_en = $1 where id = $2', [plan.en, plan.de])
    }
  })
  return tieneMarca
}

async function existeColumnaFusionadaEn() {
  const { rows } = await query(
    `select 1 from information_schema.columns where table_schema='public' and table_name='obra_canonica' and column_name='fusionada_en'`)
  return rows.length > 0
}

/** Evidencia del efecto: se vuelve a LEER la base y se cuenta lo que quedó apuntando al slug viejo. */
async function verificar(de, en) {
  const refs = await referenciasVivas(de, en)
  const quedan = refs.filter((r) => r.filasDe > 0)
  for (const r of quedan) console.log(`  QUEDAN ${r.tabla}.${r.col}: ${r.filasDe}`)
  const { rows: [a] } = await query('select count(*)::int c from public.obra_alias where obra_id = $1', [en])
  console.log(`  filas que aún apuntan a "${de}": ${quedan.reduce((s, r) => s + r.filasDe, 0)} · alias de "${en}": ${a.c}`)
  return quedan
}

async function main() {
  const de = arg('--de'), en = arg('--en')
  const { rows: obras } = await query('select id, nombre from public.obra_canonica')
  const { rows: alias } = await query('select alias, obra_id from public.obra_alias')
  const referencias = await referenciasVivas(de, en)
  const plan = planificarFusion({ de, en, obras, referencias, alias })
  console.log(lineasDelPlan(plan).join('\n'))
  if (!APLICAR) { console.log('(--dry: no se escribió nada; agregar --aplicar)'); return }
  const conMarca = await aplicar(plan)
  console.log(conMarca ? 'aplicado (con marca fusionada_en)' : 'aplicado (SIN marca: falta la migración fusionada_en)')
  const quedan = await verificar(de, en)
  if (quedan.some((r) => !plan.conflictos.some((c) => c.tabla === r.tabla))) {
    throw new Error('quedaron filas apuntando al slug viejo fuera de los conflictos declarados')
  }
}

main().then(() => closePool()).catch(async (e) => {
  console.error('ERROR:', e.message)
  await closePool()
  process.exitCode = 1
})
