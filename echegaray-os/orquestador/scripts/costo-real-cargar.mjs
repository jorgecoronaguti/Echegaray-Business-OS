#!/usr/bin/env node
// LLENAR obra_partida_costo_real DESDE LAS FUENTES QUE YA EXISTEN.
//
//   node orquestador/scripts/costo-real-cargar.mjs                      # simula y no escribe
//   node orquestador/scripts/costo-real-cargar.mjs --aplicar
//   node orquestador/scripts/costo-real-cargar.mjs --fuente jornales --obra la-estrella --aplicar
//   node orquestador/scripts/costo-real-cargar.mjs --rehacer --aplicar   # borra lo suyo y recarga
//
// ═══ QUÉ ESCRIBE Y QUÉ NO ═══
//
// Escribe SÓLO `public.obra_partida_costo_real`. NO toca ninguna pestaña de ningún Sheet: de
// JORNALES y de Compras únicamente LEE. Por defecto simula: arma todo, informa, y hace rollback.
//
// ═══ NINGUNA FILA LLEVA PARTIDA, Y ES EL RESULTADO, NO UN ATAJO ═══
//
// Ninguna fuente del OS ata hoy un peso a una partida (el detalle está en `lib/costo-real-partida.mjs`).
// Repartir el costo de la obra entre sus partidas daría una tabla completa y un desvío por partida
// que sale de una división: ese número terminaría adentro de una cotización. Se carga la obra —y el
// frente cuando una persona lo escribió— con `granularidad` declarada, y el hueco queda a la vista.
//
// ═══ EL CONTROL QUE NO SE PRODUCE ACÁ ═══
//
// Cada bloque de JORNALES se contrasta contra el «TOTAL MO» que la propia planilla tiene escrito.
// Y todo lo que no entra sale con su motivo y su monto: un gasto que no se carga y tampoco figura
// en ningún lado hace que la obra parezca más barata de lo que fue.

import { getPool, closePool } from '../lib/db.mjs'
import { makeGoogleClient, WORKSPACE_SCOPES } from '../lib/google.mjs'
import { operadorPara, getTokenFor } from '../lib/google-oauth.mjs'
import { loadConfig } from '../lib/config.mjs'
import { JORNALES_FILE_ID } from '../lib/espejo-jornales.mjs'
import { cargarMapaClientes } from '../lib/cliente-alias.mjs'
import { imputarCostoReal } from '../lib/cotizador/obra-pg.mjs'
import { evaluarCompra, filasDeJornales, cuadreDeCarga } from '../lib/costo-real-partida.mjs'

/** Las pestañas de JORNALES con su año. El año NO se deduce del nombre: las fechas de un bloque
 *  vienen como texto «6/1» y sin año la fila cae en el año equivocado sin avisar. */
const PESTANAS = [
  { nombre: 'JORNALES 25', anio: 2025 },
  { nombre: 'Obreros 26', anio: 2026 },
  { nombre: 'Oficina 26', anio: 2026 },
]

const $ = (n) => (n == null ? '—' : new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n))

function argumentos(argv) {
  const a = {}
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z]+)$/.exec(argv[i])
    if (!m) continue
    a[m[1]] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
  }
  const fuente = typeof a.fuente === 'string' ? a.fuente : 'todo'
  if (!['todo', 'compras', 'jornales'].includes(fuente)) throw new Error('--fuente: todo | compras | jornales')
  return {
    fuente,
    obra: typeof a.obra === 'string' ? a.obra : null,
    aplicar: a.aplicar === true,
    rehacer: a.rehacer === true,
  }
}

/** El estado de la tabla, medido. Se llama antes y después: la evidencia es el efecto. */
async function estado(q, obra) {
  const [r] = await q(
    `select count(*)::int filas, coalesce(sum(monto),0)::numeric monto,
            count(*) filter (where cotizacion_partida_id is not null)::int con_partida
       from public.obra_partida_costo_real where ($1::text is null or obra_id = $1)`, [obra])
  return r
}

/** COMPRAS → filas. La obra se resuelve con `norm_obra` + `obra_alias`, que es el mismo camino que
 *  ya usa la vista `obra_costo_real`: no se inventa un segundo normalizador en JavaScript. */
async function desdeCompras(q, obra) {
  const filas = await q(
    `select cs.fila, cs.obra_texto, cs.detalle_obra, cs.concepto, cs.proveedor, cs.comprobante,
            cs.familia_material, cs.importe, cs.total, cs.fecha::date::text fecha, cs.anulada,
            a.obra_id, a.clasificacion
       from public.compra_sheet cs
       left join public.obra_alias a on a.alias = public.norm_obra(cs.obra_texto)
      where cs.fecha is not null and ($1::text is null or a.obra_id = $1)
      order by cs.fila`, [obra])
  const out = { filas: [], excluidas: [], total: 0 }
  for (const c of filas) {
    out.total += Number(c.importe) || 0
    const r = evaluarCompra(c, { obraId: c.obra_id, clasificacion: c.clasificacion })
    if (r.fila) out.filas.push(r.fila)
    else out.excluidas.push({ ...r, rotulo: c.obra_texto })
  }
  return out
}

/** El mapa de obras: alias normalizado → obra_id. Los alias con `obra_id` en NULL (Administración,
 *  Taller, F931…) entran igual: son la diferencia entre «no lo conozco» y «lo conozco y NO es obra». */
async function mapaObras(q) {
  const filas = await q('select alias, obra_id from public.obra_alias', [])
  return new Map(filas.map((f) => [f.alias, f.obra_id]))
}

/** La normalización la hace POSTGRES, no una copia en JS: `norm_obra` ya define esa regla para todo
 *  el OS y dos implementaciones se separan el día que alguien agregue una palabra vacía. */
function normalizadorPg(q) {
  const cache = new Map()
  return async (textos) => {
    const nuevos = [...new Set(textos.filter((t) => t && !cache.has(t)))]
    if (nuevos.length) {
      const filas = await q('select t, public.norm_obra(t) k from unnest($1::text[]) t', [nuevos])
      for (const f of filas) cache.set(f.t, f.k)
    }
    return (t) => cache.get(t) ?? ''
  }
}

/** JORNALES → filas. Las tres pestañas, bloque por bloque. Sólo lectura. */
async function desdeJornales(q, obra) {
  const op = await operadorPara()
  if (!op) throw new Error('no hay cuenta de Google autorizada para leer JORNALES')
  const google = makeGoogleClient({ config: loadConfig(), scopes: WORKSPACE_SCOPES, getToken: getTokenFor(op) })
  const mapa = await cargarMapaClientes({ fuente: 'JORNALES' })
  if (mapa.leido !== true) throw new Error(`sin mapa de clientes no se atribuye nada: ${mapa.motivo}`)
  const alias = await mapaObras(q)
  const preparar = normalizadorPg(q)

  const out = { filas: [], excluidas: [], bloques: [], total: 0 }
  for (const { nombre, anio } of PESTANAS) {
    const grid = await google.readSheetGrid(JORNALES_FILE_ID, `'${nombre}'!A1:AH2000`)
    if (!grid?.filas?.length) throw new Error(`la pestaña «${nombre}» se leyó vacía`)
    // Se normalizan de una vez todos los rótulos que la pestaña puede traer, incluida la
    // combinación «cliente obra» que usa la segunda regla de imputación.
    const rotulos = new Set()
    for (const f of grid.filas) for (const c of f) if (c?.valor) rotulos.add(String(c.valor))
    for (const a of alias.keys()) rotulos.add(a)
    const norm = await preparar([...rotulos])
    const r = filasDeJornales(grid, { pestana: nombre, anio, mapa, alias, norm: (t) => norm(String(t ?? '')) })
    out.filas.push(...(obra ? r.filas.filter((f) => f.obraId === obra) : r.filas))
    out.excluidas.push(...r.excluidas.map((e) => ({ ...e, pestana: nombre })))
    out.bloques.push(...r.bloques.map((b) => ({ ...b, pestana: nombre })))
    out.total += r.bloques.reduce((a, b) => a + b.leido, 0)
  }
  return out
}

function informar(titulo, r) {
  const c = cuadreDeCarga({ totalFuente: r.total, filas: r.filas, excluidas: r.excluidas })
  console.log(`\n${titulo}`)
  console.log(`  leído de la fuente ${$(c.total)} = cargado ${$(c.cargado)} + excluido ${$(c.excluido)}`)
  for (const m of c.porMotivo) {
    // El bruto se muestra al lado y NUNCA sumado: una fila sin neto declarado excluye $0 de neto y
    // esconde un comprobante de varios millones. Los dos números juntos son el tamaño real del hueco.
    console.log(`    · ${m.motivo}: ${m.n} fila(s) · neto ${$(m.monto)} · con IVA ${$(m.bruto)}`)
  }
  console.log(`  residuo ${$(c.residuo)} · ${c.cuadra ? '✓ cuadra' : '✗ NO CUADRA: hay plata sin nombre'}`)
  return c
}

/** Los rótulos que no encontraron obra: es la lista de trabajo para el dueño —cada uno se resuelve
 *  agregando UN alias— y mientras tanto es plata que no está en ninguna obra. */
function informarSinAlias(excluidas) {
  const porRotulo = new Map()
  for (const e of excluidas.filter((x) => x.excluida === 'SIN_OBRA_CANONICA')) {
    const k = (e.rotulo ?? '').trim() || '(sin rótulo)'
    const a = porRotulo.get(k) ?? { rotulo: k, n: 0, monto: 0 }
    a.n++
    a.monto += Number(e.monto) || 0
    porRotulo.set(k, a)
  }
  const lista = [...porRotulo.values()].sort((a, b) => b.monto - a.monto)
  if (!lista.length) return
  console.log('\n  RÓTULOS SIN OBRA CANÓNICA (cada uno se resuelve con un alias en public.obra_alias)')
  for (const r of lista.slice(0, 15)) console.log(`    «${r.rotulo}» ${r.n} fila(s) ${$(r.monto)}`)
  if (lista.length > 15) console.log(`    … y ${lista.length - 15} rótulo(s) más`)
}

function informarBloques(bloques) {
  const conTestigo = bloques.filter((b) => b.testigo != null)
  const malos = conTestigo.filter((b) => !b.concuerda)
  const sinTestigo = bloques.length - conTestigo.length
  console.log(`\n  CONTRA EL «TOTAL MO» QUE ESCRIBIÓ LA PLANILLA`)
  console.log(`    ${conTestigo.length}/${bloques.length} bloque(s) con testigo · ${sinTestigo} sin testigo (no contrastan, que NO es que contrasten bien)`)
  for (const b of malos.slice(0, 12)) {
    console.log(`    ✗ ${b.pestana} bloque ${b.bloque} (${b.desde}→${b.hasta}): OS ${$(b.leido)} · planilla ${$(b.testigo)} · dif ${$(b.diferencia)}`)
  }
  if (malos.length > 12) console.log(`    … y ${malos.length - 12} bloque(s) más con diferencia`)
  if (!malos.length && conTestigo.length) console.log('    ✓ todos los bloques con testigo coinciden al peso')
  const os = conTestigo.reduce((a, b) => a + b.leido, 0)
  const pl = conTestigo.reduce((a, b) => a + b.testigo, 0)
  const abs = malos.reduce((a, b) => a + Math.abs(b.diferencia), 0)
  console.log(`    sobre los bloques CON testigo: OS ${$(os)} · planilla ${$(pl)} · neto ${$(os - pl)} · en valor absoluto ${$(abs)}`)
  const dup = bloques.filter((b) => b.fechasDuplicadas > 0)
  if (dup.length) console.log(`    ⚠ ${dup.length} bloque(s) con fechas compartidas con otro bloque`)
}

async function main() {
  const opt = argumentos(process.argv.slice(2))
  const cliente = await getPool().connect()
  const q = async (sql, params) => (await cliente.query(sql, params)).rows
  let cargadas = 0
  try {
    // LA MIGRACIÓN SE ENTREGA, NO SE APLICA ACÁ: aplicarla es una decisión de integración y este
    // cargador corre desde un worktree. Si todavía no está, la carga igual entra —el costo no se
    // pierde— pero sin la columna que declara con qué precisión se conoce la imputación.
    const [gran] = await q(`select 1 x from information_schema.columns
       where table_schema = 'public' and table_name = 'obra_partida_costo_real' and column_name = 'granularidad'`, [])
    const conGranularidad = !!gran
    if (!conGranularidad) {
      console.log('⚠ la columna `granularidad` no existe todavía (migración sin aplicar): las filas entran')
      console.log('  con `cotizacion_partida_id` en NULL, que en el esquema viejo significa SIN_IMPUTAR.')
    }
    const antes = await estado(q, opt.obra)
    console.log(`ANTES: ${antes.filas} fila(s) · ${$(antes.monto)} · ${antes.con_partida} con partida`)

    const partes = []
    if (opt.fuente !== 'jornales') partes.push(['MATERIALES Y SERVICIOS · pestaña Compras', await desdeCompras(q, opt.obra)])
    if (opt.fuente !== 'compras') partes.push(['MANO DE OBRA · JORNALES', await desdeJornales(q, opt.obra)])

    await cliente.query('begin')
    if (opt.rehacer) {
      // BORRA SÓLO LO QUE ESTE CARGADOR ESCRIBIÓ, y nunca una imputación hecha por una persona: una
      // fila con partida es trabajo humano y no se recalcula desde la fuente. Hace falta cuando
      // cambia la REGLA de lectura —pasó: el monto dejó de ser «TOTAL SEMANA»—, porque
      // `on conflict do nothing` deja el monto viejo para siempre.
      const fuentes = partes.map(([t]) => (t.includes('JORNALES') ? 'jornales' : 'compra_sheet'))
      const [b] = await q(
        `with borradas as (
           delete from public.obra_partida_costo_real
            where fuente = any($1::text[]) and cotizacion_partida_id is null
              and ($2::text is null or obra_id = $2) returning monto)
         select count(*)::int n, coalesce(sum(monto),0)::numeric monto from borradas`, [fuentes, opt.obra])
      console.log(`\n· --rehacer: ${b.n} fila(s) borradas (${$(b.monto)}) de ${fuentes.join(', ')}`)
    }
    for (const [titulo, r] of partes) {
      informar(titulo, r)
      informarSinAlias(r.excluidas)
      if (r.bloques) informarBloques(r.bloques)
      for (const f of r.filas) {
        const ins = await imputarCostoReal({ query: q }, f, { conGranularidad })
        if (ins) cargadas++
      }
    }
    const despues = await estado(q, opt.obra)
    console.log(`\nDESPUÉS: ${despues.filas} fila(s) · ${$(despues.monto)} · ${despues.con_partida} con partida`)
    console.log(`  insertadas en esta corrida: ${cargadas} (el resto ya estaba: la carga es idempotente por fuente+fila)`)

    const porObra = await q(
      `select obra_id, tipo, ${conGranularidad ? 'granularidad' : "'—' granularidad"}, count(*)::int n, sum(monto)::numeric monto
         from public.obra_partida_costo_real group by 1,2,3 order by 1, 5 desc`, [])
    console.log('\n  OBRA                 TIPO           GRAN.     FILAS          MONTO')
    for (const f of porObra) {
      console.log(`  ${f.obra_id.padEnd(20)} ${f.tipo.padEnd(14)} ${f.granularidad.padEnd(8)} ${String(f.n).padStart(5)} ${$(f.monto).padStart(14)}`)
    }
    await cliente.query(opt.aplicar ? 'commit' : 'rollback')
    console.log(`\n${opt.aplicar ? '✓ APLICADO' : '· SIMULACIÓN (rollback) — corré con --aplicar para escribir'}`)
  } catch (e) {
    await cliente.query('rollback').catch(() => {})
    throw e
  } finally {
    cliente.release()
    await closePool()
  }
}

main().catch((e) => { console.error(`✗ ${e.message}`); process.exit(1) })
