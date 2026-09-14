#!/usr/bin/env node
// EL DETALLE EN BLANCO DE CADA RECIBO DE 2026 → public.recibo_sueldo_linea.
//
//   node orquestador/scripts/recibos-detalle-importar.mjs            # en seco (default): no escribe
//   node orquestador/scripts/recibos-detalle-importar.mjs --aplicar  # upsert por (cuil, periodo) y relee
//   [--limite N] [--persona <cuil>]
//
// Lee los PDF del legajo (sólo lectura de Drive), los pasa por `lib/recibo-sueldo-detalle.mjs` y
// coteja el neto contra `nomina_recibo_neto`, que se cargó por otra vía (la planilla del estudio): un
// control que se validara contra el mismo PDF no probaría nada.
//
// ═══ LO QUE NO HACE ═══
//
// · No aplica la migración: sin la tabla, `--aplicar` falla antes de escribir la primera fila.
// · No escribe una fila que el parser rechazó, ni "completa" un campo: el PDF ilegible se lista.
// · Dos recibos con el mismo (cuil, periodo) no se escriben: ¿cuál manda? Lo decide una persona.
import { createRequire } from 'node:module'
import { getTokenFor } from '../lib/google-oauth.mjs'
import { query, withTx, closePool } from '../lib/db.mjs'
import { lineasDeItems, parsearRecibo } from '../lib/recibo-sueldo-detalle.mjs'

const pdfjs = await import(createRequire(import.meta.url).resolve('pdfjs-dist/legacy/build/pdf.mjs'))

const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null)
const APLICAR = process.argv.includes('--aplicar')
const LIMITE = Number(arg('--limite')) || Infinity
const CUIL = arg('--persona')?.replace(/\D/g, '') ?? null
const PARALELO = 3
const FUENTE = 'pdf-legajo:recibos-detalle-importar'

const getTok = getTokenFor(process.env.ORQ_LEGAJOS_CUENTA || 'rodrigo@ecsas.com.ar')
let tok = await getTok()

async function descargar(id) {
  const u = `https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`
  for (let i = 0; i < 5; i++) {
    const r = await fetch(u, { headers: { Authorization: `Bearer ${tok}` } })
    if (r.ok) return Buffer.from(await r.arrayBuffer())
    if (r.status === 401) { tok = await getTok(); continue }
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 1500 * (i + 1))); continue }
    throw new Error(`Drive ${r.status}`)
  }
  throw new Error('Drive: reintentos agotados')
}

async function lineasDelPdf(buf) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), verbosity: 0 }).promise
  const out = []
  for (let p = 1; p <= doc.numPages; p++) out.push(...lineasDeItems((await (await doc.getPage(p)).getTextContent()).items))
  return out
}

/** «Recibo 2026-08 Q2 · X.pdf» → Q2-08/2026; «Liquidación final 2026-08 · X» → FINAL-08/2026. */
function periodoDelNombre(nombre) {
  const q = /(20\d{2})-(\d{2}) (Q[12])/.exec(nombre)
  if (q) return `${q[3]}-${q[2]}/${q[1]}`
  const f = /final (20\d{2})-(\d{2})/i.exec(nombre)
  return f ? `FINAL-${f[2]}/${f[1]}` : null
}

async function leerTodos(rows) {
  const leidos = []; const fallidos = []
  let cursor = 0
  const trabajador = async () => {
    while (cursor < rows.length) {
      const r = rows[cursor++]
      try {
        const res = parsearRecibo(await lineasDelPdf(await descargar(r.drive_file_id)))
        if (res.ok) leidos.push({ doc: r, ...res })
        else fallidos.push({ doc: r, error: res.error })
      } catch (e) {
        fallidos.push({ doc: r, error: String(e.message || e).slice(0, 120) })
      }
    }
  }
  await Promise.all(Array.from({ length: PARALELO }, trabajador))
  return { leidos, fallidos }
}

async function cotejar(leidos) {
  const { rows } = await query('select cuil, periodo, neto from public.nomina_recibo_neto')
  // `nomina_recibo_neto` guarda la final como 'FINAL' a secas, sin mes.
  const neto = new Map(rows.map((x) => [`${x.cuil}|${x.periodo}`, Number(x.neto)]))
  const res = { cotejados: 0, alCentavo: 0, diferencias: [] }
  for (const l of leidos) {
    const f = l.fila
    const ref = neto.get(`${f.cuil}|${f.periodo}`) ?? (f.periodo.startsWith('FINAL') ? neto.get(`${f.cuil}|FINAL`) : undefined)
    if (ref === undefined) continue
    res.cotejados++
    if (Math.abs(ref - f.neto) <= 0.01) res.alCentavo++
    else res.diferencias.push(`${f.cuil} ${f.periodo}: PDF ${f.neto} vs nomina ${ref}`)
  }
  return res
}

async function escribir(filas) {
  const cols = ['persona_id', 'cuil', 'periodo', 'categoria', 'valor_hora', 'horas_normales', 'horas_feriado',
    'horas_otras', 'horas_blanco', 'bruto', 'descuentos', 'neto', 'drive_file_id', 'fuente']
  await withTx(async (c) => {
    for (const f of filas) {
      await c.query(
        `insert into public.recibo_sueldo_linea (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})
         on conflict (cuil, periodo) do update set ${cols.filter((k) => k !== 'cuil' && k !== 'periodo').map((k) => `${k} = excluded.${k}`).join(', ')}, cargado_en = now()`,
        cols.map((k) => f[k]))
    }
  })
  // La evidencia es lo leído en el destino, no el «insert» que no tiró error.
  const { rows } = await query('select cuil, periodo, neto, horas_blanco from public.recibo_sueldo_linea where fuente = $1', [FUENTE])
  const enBase = new Map(rows.map((x) => [`${x.cuil}|${x.periodo}`, x]))
  const mal = filas.filter((f) => {
    const b = enBase.get(`${f.cuil}|${f.periodo}`)
    return !b || Math.abs(Number(b.neto) - f.neto) > 0.001 || Math.abs(Number(b.horas_blanco) - f.horas_blanco) > 0.001
  })
  console.log(`\nRELECTURA: ${filas.length - mal.length}/${filas.length} filas coinciden en la base`)
  for (const f of mal) console.log(`  NO COINCIDE ${f.cuil} ${f.periodo}`)
  if (mal.length) process.exitCode = 1
}

function informar({ rows, leidos, fallidos, cot, duplicados, avisos }) {
  const porFormato = leidos.reduce((a, l) => ({ ...a, [l.formato]: (a[l.formato] || 0) + 1 }), {})
  console.log(`\nRECIBOS 2026 en legajo: ${rows.length} · leídos: ${leidos.length} ${JSON.stringify(porFormato)} · fallidos: ${fallidos.length}`)
  console.log(`COTEJO neto vs nomina_recibo_neto: ${cot.cotejados} cotejados · ${cot.alCentavo} al centavo · ${cot.diferencias.length} con diferencia > $0,01`)
  for (const d of cot.diferencias) console.log(`  DIF ${d}`)
  console.log(`\nFALLIDOS (${fallidos.length}):`)
  for (const f of fallidos) console.log(`  ${f.doc.nombre} [${f.doc.drive_file_id}] → ${f.error}`)
  console.log(`\nDUPLICADOS (cuil, periodo) no escribibles: ${duplicados.length}`)
  for (const d of duplicados) console.log(`  ${d}`)
  console.log(`\nAVISOS (${avisos.length}):`)
  for (const a of avisos) console.log(`  ${a}`)
  const sinCat = leidos.filter((l) => !l.fila.categoria).length
  const sinVh = leidos.filter((l) => l.fila.valor_hora == null).length
  console.log(`\nSin categoría reconocida: ${sinCat} · sin valor hora (sin 0401): ${sinVh}`)
  const muestra = [...leidos.filter((l) => /ROSALES/.test(l.doc.nombre_completo ?? l.doc.nombre) && l.fila.periodo === 'Q2-08/2026'),
    ...leidos.filter((_, i) => i % Math.max(1, Math.floor(leidos.length / 4)) === 0)].slice(0, 5)
  console.log('\nMUESTRA:')
  for (const l of muestra) console.log(`  ${l.doc.nombre_completo ?? '?'} ${JSON.stringify(l.fila)}`)
}

async function main() {
  const { rows: docs } = await query(
    `select d.drive_file_id, d.nombre, d.persona_id, p.nombre_completo
       from public.documentacion_legajo d left join public.personas p on p.id = d.persona_id
      where d.tipo_documento = 'recibo_sueldo' and d.drive_file_id is not null and d.nombre ~ '2026'
        and coalesce(p.es_prueba, false) = false and d.nombre not like '[PRUEBA%'
        and ($1::text is null or replace(replace(p.cuil,'-',''),' ','') = $1)
      order by d.nombre`, [CUIL])
  const rows = docs.slice(0, LIMITE === Infinity ? docs.length : LIMITE)
  console.log(APLICAR ? '── APLICANDO ──' : '── EN SECO: no se escribe nada ──')
  const { leidos, fallidos } = await leerTodos(rows)

  const { rows: personas } = await query(`select id, replace(replace(cuil,'-',''),' ','') cuil from public.personas where cuil is not null`)
  const idPorCuil = new Map(personas.map((p) => [p.cuil, p.id]))
  const avisos = []; const clave = new Map()
  for (const l of leidos) {
    const f = l.fila
    f.persona_id = idPorCuil.get(f.cuil) ?? null
    f.drive_file_id = l.doc.drive_file_id
    f.fuente = FUENTE
    if (!f.persona_id) avisos.push(`${l.doc.nombre}: CUIL ${f.cuil} sin persona`)
    else if (l.doc.persona_id && l.doc.persona_id !== f.persona_id) avisos.push(`${l.doc.nombre}: el CUIL del PDF (${f.cuil}) es de otra persona que la del legajo`)
    const pn = periodoDelNombre(l.doc.nombre)
    if (pn && pn !== f.periodo) avisos.push(`${l.doc.nombre}: el nombre dice ${pn}, el PDF ${f.periodo}`)
    if (l.unidadesNoHorarias.length) avisos.push(`${l.doc.nombre}: unidades no horarias ignoradas: ${l.unidadesNoHorarias.join('; ')}`)
    const k = `${f.cuil}|${f.periodo}`
    clave.set(k, [...(clave.get(k) ?? []), l])
  }
  const duplicados = [...clave].filter(([, v]) => v.length > 1).map(([k, v]) => `${k}: ${v.map((x) => x.doc.nombre).join(' | ')}`)
  const escribibles = [...clave.values()].filter((v) => v.length === 1).map((v) => v[0].fila)

  informar({ rows, leidos, fallidos, cot: await cotejar(leidos), duplicados, avisos })
  if (APLICAR) await escribir(escribibles)
  else console.log(`\nEn seco: ${escribibles.length} fila(s) se escribirían con --aplicar.`)
}

try { await main() } finally { await closePool() }
