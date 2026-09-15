#!/usr/bin/env node
// CREA LAS CUATRO OBRAS DE LA ESTRELLA QUE COMPRAS YA NOMBRA (dueño, 14/09/2026).
//
//   node orquestador/scripts/obras-le-crear.mjs            ← ENSAYO: lee, decide y muestra. No escribe.
//   node orquestador/scripts/obras-le-crear.mjs --aplicar  ← inserta obras + alias en UNA transacción
//
// El código OB-#### lo pone el trigger `obra_canonica_codigo_guardia` (cualquier código escrito se
// ignora). El estado y los alias salen de `lib/obras-nuevas-plan.mjs`; la simulación final corre el
// MISMO asignador del sync con el catálogo aumentado, para ver cuántas compras pasan a cada obra antes
// de escribir nada. No toca el Sheet.

import { query, closePool, withTx } from '../lib/db.mjs'
import { normAlias } from '../lib/jornales-a-registros-hh.mjs'
import { asignadorDeCompras, catalogosDeAsignacion, planDeAsignacion, rotulosDeDetalle } from '../lib/compras-obra-asignada.mjs'
import { estadoPorActividad, planDeAlias } from '../lib/obras-nuevas-plan.mjs'

const APLICAR = process.argv.includes('--aplicar')
const HOY = new Date().toISOString().slice(0, 10)
const CLIENTE_SLUG = 'la-estrella'
const CLIENTE_TEXTO = 'La Estrella'

/** `re` reconoce la grafía en el primer tramo de la K; en las horas, en la nota de JORNALES. */
const OBRAS = [
  { id: 'le-galpon-7', nombre: 'LE - GALPÓN 7', re: /^galpon 7$/ },
  { id: 'le-galpon-8', nombre: 'LE - GALPÓN 8', re: /^galpon 8$/ },
  { id: 'le-cierre-perimetral', nombre: 'LE - CIERRE PERIMETRAL', re: /^cierre perimetral$/ },
  { id: 'le-mamposteria', nombre: 'LE - MAMPOSTERÍA', re: /^mamposteria$/ },
]

const esLE = (t) => normAlias(t) === 'estrella'
const tramo = (k) => normAlias(rotulosDeDetalle(k).at(-1) ?? '')

/** Última compra y grafías por obra; grafías que usan OTROS clientes. */
async function evidenciaDeCompras() {
  const { rows } = await query('select obra_texto, detalle_obra, fecha::date::text fecha, total from public.compra_sheet')
  const porObra = new Map(OBRAS.map((o) => [o.id, { ultima: null, grafias: new Set(), n: 0, total: 0 }]))
  const deOtros = new Set()
  for (const r of rows) {
    const t = tramo(r.detalle_obra)
    if (!esLE(r.obra_texto)) { if (t) deOtros.add(t); continue }
    const o = OBRAS.find((x) => x.re.test(t))
    if (!o) continue
    const e = porObra.get(o.id)
    e.n++; e.total += Number(r.total) || 0
    e.grafias.add(rotulosDeDetalle(r.detalle_obra).at(-1).trim())
    if (r.fecha && (!e.ultima || r.fecha > e.ultima)) e.ultima = r.fecha
  }
  return { porObra, deOtros }
}

/** Última hora de JORNALES cuya nota nombra la obra bajo LA ESTRELLA. «Cierre de Obra» NO es «Cierre perimetral». */
async function ultimaHora(o) {
  const { rows } = await query(
    `select notas, fecha::date::text fecha from public.registros_hh where notas ilike '%estrella%' order by fecha desc`)
  for (const r of rows) {
    const partes = String(r.notas).split('·').map((s) => normAlias(s))
    if (partes.some((p) => o.re.test(p))) return r.fecha
  }
  return null
}

async function plan() {
  const { rows: [cliente] } = await query('select id from public.clientes where slug = $1', [CLIENTE_SLUG])
  if (!cliente) throw new Error(`no existe el cliente ${CLIENTE_SLUG}`)
  const { rows: ya } = await query('select id, codigo from public.obra_canonica where id = any($1)', [OBRAS.map((o) => o.id)])
  const { rows: alias } = await query('select alias, obra_id from public.obra_alias')
  const existentes = new Map(alias.map((a) => [a.alias, a.obra_id]))
  const { porObra, deOtros } = await evidenciaDeCompras()
  const obras = []
  for (const o of OBRAS) {
    const ev = porObra.get(o.id)
    const hora = await ultimaHora(o)
    const est = estadoPorActividad({ ultimaCompra: ev.ultima, ultimaHora: hora }, HOY)
    const al = planDeAlias({ obraId: o.id, cliente: CLIENTE_TEXTO, grafias: [...ev.grafias] }, { existentes, grafiasDeOtros: deOtros })
    obras.push({ ...o, existe: ya.find((y) => y.id === o.id) ?? null, ev, hora, ...est, alias: al })
  }
  return { clienteId: cliente.id, obras }
}

/** Cuántas compras de La Estrella pasarían a cada obra con el catálogo aumentado. */
async function simular(obras) {
  const cat = await catalogosDeAsignacion(query)
  const nuevas = obras.filter((o) => !o.existe)
  const aumentado = {
    ...cat,
    canonicas: [...cat.canonicas, ...nuevas.map((o) => ({ id: o.id, nombre: o.nombre, cliente_texto: CLIENTE_TEXTO }))],
    alias: new Map([...cat.alias, ...obras.flatMap((o) => o.alias.cargar.map((a) => [a.alias, a.obra_id]))]),
  }
  const { rows } = await query('select * from public.compra_sheet')
  const antes = planDeAsignacion(rows, asignadorDeCompras(cat))
  const despues = planDeAsignacion(rows, asignadorDeCompras(aumentado))
  const ids = new Set(obras.map((o) => o.id))
  const movidas = despues.filter((d, i) => ids.has(d.obra_id) && antes[i].obra_id !== d.obra_id)
  const robadas = despues.filter((d, i) => antes[i].obra_id && antes[i].obra_id !== d.obra_id && !ids.has(d.obra_id))
  const total = new Map(rows.map((r) => [String(r.sheet_id ?? r.fila), Number(r.total) || 0]))
  return { movidas, robadas, plata: (xs) => xs.reduce((s, x) => s + (total.get(x.referencia) ?? 0), 0) }
}

const $ = (n) => `$${Math.round(n).toLocaleString('es-AR')}`

function informar(p, s) {
  console.log(`${APLICAR ? 'APLICAR' : 'ENSAYO (no escribe)'} · hoy ${HOY} · cliente ${CLIENTE_SLUG} (${p.clienteId})\n`)
  for (const o of p.obras) {
    console.log(`${o.existe ? `= YA EXISTE ${o.existe.codigo}` : '+ CREAR'} ${o.id} «${o.nombre}» → ${o.estado}`)
    console.log(`    evidencia: ${o.ev.n} compras ${$(o.ev.total)} · ${o.porque}`)
    console.log(`    grafías en Compras: ${[...o.ev.grafias].join(' | ') || '—'}`)
    for (const a of o.alias.cargar) console.log(`    + alias «${a.alias}»`)
    for (const a of o.alias.omitidos) console.log(`    ✋ alias «${a.alias}» NO: ${a.porque}`)
    const m = s.movidas.filter((x) => x.obra_id === o.id)
    console.log(`    simulación: ${m.length} filas de Compras pasan a esta obra (${$(s.plata(m))})`)
  }
  console.log(`\nfilas que dejarían una obra existente por otra: ${s.robadas.length}${s.robadas.length ? ' ← REVISAR' : ''}`)
}

async function aplicar(p) {
  await withTx(async (db) => {
    for (const o of p.obras.filter((x) => !x.existe)) {
      await db.query(
        `insert into public.obra_canonica (id, nombre, estado, tipo, cliente_id, cliente_texto) values ($1,$2,$3,'obra',$4,$5)`,
        [o.id, o.nombre, o.estado, p.clienteId, CLIENTE_TEXTO])
    }
    for (const a of p.obras.flatMap((o) => o.alias.cargar)) {
      await db.query(
        `insert into public.obra_alias (alias, obra_id, clasificacion, ejemplo_raw, en_texto_libre)
         values ($1,$2,'obra',$3,false) on conflict (alias) do nothing`, [a.alias, a.obra_id, a.ejemplo_raw])
    }
  })
  // LA EVIDENCIA DEL EFECTO: lo que quedó en la base, releído.
  const { rows } = await query(
    `select o.id, o.codigo, o.estado, count(a.alias)::int alias from public.obra_canonica o
       left join public.obra_alias a on a.obra_id = o.id where o.id = any($1) group by 1,2,3 order by 2`, [OBRAS.map((o) => o.id)])
  for (const r of rows) console.log(`✔ ${r.codigo} ${r.id} ${r.estado} · ${r.alias} alias`)
}

async function main() {
  const p = await plan()
  informar(p, await simular(p.obras))
  if (APLICAR) await aplicar(p)
  else console.log('\nEnsayo: no se escribió nada. --aplicar para crear.')
  await closePool()
}
main().catch(async (e) => { console.error('obras-le-crear falló:', e.message); await closePool().catch(() => {}); process.exit(1) })
