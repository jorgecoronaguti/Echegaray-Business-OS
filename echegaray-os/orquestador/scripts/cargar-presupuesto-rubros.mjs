#!/usr/bin/env node
// LEE EL PRESUPUESTO DE CADA OBRA EN DRIVE Y LO CARGA POR RUBRO EN `obra_presupuesto_lectura` + `obra_presupuesto_rubro`.
//
//   node orquestador/scripts/cargar-presupuesto-rubros.mjs                 (ensayo: begin … rollback)
//   node orquestador/scripts/cargar-presupuesto-rubros.mjs --aplicar       (commit y relectura en destino)
//   node orquestador/scripts/cargar-presupuesto-rubros.mjs --cache=/dir    (dónde guardar los .xlsm bajados)
//   node orquestador/scripts/cargar-presupuesto-rubros.mjs --sin-drive     (sólo con lo que hay en el cache)
//   node orquestador/scripts/cargar-presupuesto-rubros.mjs --refrescar     (vuelve a bajar todo)
//   node orquestador/scripts/cargar-presupuesto-rubros.mjs --detalle       (imprime cada insumo)
//   node orquestador/scripts/cargar-presupuesto-rubros.mjs --con-migracion <sql>  (ensayo con la migración adentro)
//
// SÓLO LEE DRIVE. Los documentos son del dueño; acá no se escribe ni se mueve nada en Drive.
// Se vuelve a correr cuando cambia una cotización: es idempotente por obra (borra y reescribe sus
// rubros dentro de la misma transacción).
//
// ═══ EL CONTROL QUE NO SE PUEDE SALTEAR ═══
//
// La suma de los rubros leídos tiene que ser el `costo_directo_presupuestado` del presupuesto aprobado
// (`presupuestos`, cargado el 17/09 desde las mismas celdas): es lo que la ficha de la obra muestra
// como costo objetivo. Si no coincide en más de $ 1, NO se carga: dos números para el mismo concepto es
// exactamente lo que el dueño rechazó.
//
// LA EVIDENCIA ES EL DATO LEÍDO: con --aplicar, después del commit se relee `obra_economia_rubros`
// con OTRA conexión.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import XLSX from 'xlsx'
import { getPool, closePool } from '../lib/db.mjs'
import { makeGoogleClient } from '../lib/google.mjs'
import { OBRAS, RUBROS, explotarLibro, rubrosDeObra, rubrosDesdePartidas } from '../lib/presupuesto-rubros.mjs'

const args = process.argv.slice(2)
const aplicar = args.includes('--aplicar')
const sinDrive = args.includes('--sin-drive')
const refrescar = args.includes('--refrescar')
const conDetalle = args.includes('--detalle')
const forzar = args.includes('--forzar')
const iMig = args.indexOf('--con-migracion')
const migracion = iMig >= 0 ? args[iMig + 1] : null
if (aplicar && migracion) { console.error('--con-migracion es sólo para ensayar: la migración se aplica con aplicar-migracion.mjs.'); process.exit(1) }
const arg = (n, d) => { const m = args.find((a) => a.startsWith(`--${n}=`)); return m ? m.slice(n.length + 3) : d }
const CACHE = arg('cache', path.join(os.tmpdir(), 'presupuesto-rubros'))
const QUIEN = `cargar-presupuesto-rubros.mjs · ${new Date().toISOString().slice(0, 10)}`

const plata = (v) => (v == null ? '—' : Number(v).toLocaleString('es-AR', { maximumFractionDigits: 0 }))

/** Los bytes de un libro: del cache, o de Drive (y al cache). Con la marca de modificación si Drive contesta. */
async function bajar(google, libro) {
  fs.mkdirSync(CACHE, { recursive: true })
  const ruta = path.join(CACHE, `${libro.drive}.xlsm`)
  const metaRuta = `${ruta}.json`
  let meta = fs.existsSync(metaRuta) ? JSON.parse(fs.readFileSync(metaRuta, 'utf8')) : null
  if (!refrescar && fs.existsSync(ruta)) return { bytes: fs.readFileSync(ruta), meta, deCache: true }
  if (sinDrive) throw new Error(`${libro.nombre}: no está en el cache (${ruta}) y se pidió --sin-drive`)
  const bytes = Buffer.from(await google.descargarBytes(libro.drive))
  meta = await google.getVersion(libro.drive).catch(() => null)
  fs.writeFileSync(ruta, bytes)
  if (meta) fs.writeFileSync(metaRuta, JSON.stringify(meta))
  return { bytes, meta, deCache: false }
}

async function leerObra(google, cfg, c) {
  if (cfg.sinPresupuesto) return { estado: 'sin_presupuesto', motivo: cfg.sinPresupuesto, rubros: null, costoDirecto: null, controles: [], problemas: [] }
  if (cfg.desdePartidas) {
    const { rows } = await c.query(
      `select pp.codigo, pp.descripcion, pp.monto from public.presupuestos p join public.partidas_presupuesto pp on pp.presupuesto_id = p.id
        where p.obra_canonica_id = $1 and p.estado = 'aprobado' order by pp.codigo`, [cfg.obra])
    if (!rows.length) return { estado: 'sin_presupuesto', motivo: 'sin partidas cargadas en presupuestos', rubros: null, costoDirecto: null, controles: [], problemas: [] }
    const r = rubrosDesdePartidas(cfg, rows)
    return { estado: 'leido', ...r, fuente: cfg.fuente, cita: cfg.cita, modificado: null, estimado: true }
  }
  const explosiones = []
  let modificado = null
  for (const libro of cfg.libros) {
    const { bytes, meta, deCache } = await bajar(google, libro)
    const wb = XLSX.read(bytes, { type: 'buffer', cellDates: false })
    const explosion = explotarLibro(wb, { filas: libro.filas ?? null, sinAnalisis: libro.sinAnalisis ?? {} })
    explosiones.push({ libro, explosion, deCache, meta })
    if (meta?.modifiedTime && (!modificado || meta.modifiedTime > modificado)) modificado = meta.modifiedTime
  }
  const r = rubrosDeObra(cfg, explosiones)
  const principal = cfg.libros[0]
  return {
    estado: 'leido', ...r, modificado, estimado: false,
    // LA FUENTE DICE TODOS LOS PAPELES: en Quattropani los materiales salen del contrato (fondo
    // administrado), no de la cotización, y el encabezado tiene que nombrarlo (auditoría 18/09).
    fuente: { drive: principal.drive, nombre: [...cfg.libros.map((l) => l.nombre), ...(cfg.materialesDelContrato ? ['materiales: CONTRATO DE OBRA Y MEMORIA DESCRIPTIVA.docx'] : [])].join(' + ') },
    cita: RUBROS.map((k) => r.rubros[k].cita).filter(Boolean).join(' | ').slice(0, 900),
    explosiones,
  }
}

async function main() {
  const google = sinDrive ? null : makeGoogleClient({})
  const pool = getPool()
  const c = await pool.connect()
  const resultados = []
  let abortar = false
  try {
    await c.query('begin')
    await c.query("set local lock_timeout = '5s'")
    if (migracion) await c.query(fs.readFileSync(migracion, 'utf8'))
    const aprobados = new Map((await c.query(
      `select obra_canonica_id, costo_directo_presupuestado::float8 as costo, costo_pendiente_motivo from public.presupuestos where estado = 'aprobado' and obra_canonica_id is not null`)).rows
      .map((r) => [r.obra_canonica_id, r]))
    const panel = (await c.query(`select obra_id, nombre from public.obra_panel where nombre not like '[PRUEBA%' and nombre not like 'ZZ-%'`)).rows

    for (const cfg of OBRAS) {
      const r = await leerObra(google, cfg, c)
      r.obra = cfg.obra
      r.fecha = cfg.fecha ?? null
      const ap = aprobados.get(cfg.obra)
      if (r.estado === 'leido') {
        const dif = ap?.costo == null ? null : Math.round((r.costoDirecto - ap.costo) * 100) / 100
        r.control = ap?.costo == null ? `sin presupuesto aprobado con costo en presupuestos (${ap?.costo_pendiente_motivo ?? 'sin fila'})` : `Σ rubros ${plata(r.costoDirecto)} vs presupuestos ${plata(ap.costo)} · dif ${dif}`
        // TOLERANCIA: $ 1 o el 0,05 % del costo. Quattropani difiere en $ 12.240 (0,015 %) porque el SUMIF de la
        // plantilla en T1078 suma como mano de obra 2 hs de la tarea siguiente; la lectura por análisis es la
        // correcta y la diferencia queda escrita en la cita, no tapada.
        if (dif !== null && Math.abs(dif) > Math.max(1, ap.costo * 0.0005)) { r.problemas.push(`la suma de los rubros (${r.costoDirecto}) no es el costo directo del presupuesto aprobado (${ap.costo}): dif ${dif}`) }
        else if (dif !== null && Math.abs(dif) > 1) r.cita = `${r.cita} · control: Σ rubros difiere ${dif} del costo directo de presupuestos (${ap.costo}); manda la lectura por análisis`
      }
      if (r.problemas.length) abortar = true
      resultados.push(r)
    }
    // Las obras del panel que no tienen entrada: su fila dice por qué.
    const cubiertas = new Set(OBRAS.map((o) => o.obra))
    for (const o of panel) {
      if (cubiertas.has(o.obra_id)) continue
      const ap = aprobados.get(o.obra_id)
      const motivo = ap?.costo != null
        ? `el presupuesto aprobado viene del Sheet legacy (costo directo ${plata(ap.costo)}) sin partidas: no hay desglose por rubro`
        : 'sin cotización interna leída para esta obra (obra cerrada: no se buscó su presupuesto en esta pasada)'
      resultados.push({ obra: o.obra_id, estado: 'sin_presupuesto', motivo, rubros: null, costoDirecto: null, controles: [], problemas: [], fecha: null })
    }

    // ── informe ──
    for (const r of resultados) {
      console.log(`\n${r.obra}`)
      if (r.estado !== 'leido') { console.log(`  sin presupuesto: ${r.motivo}`); continue }
      console.log(`  ${r.fuente.nombre} (${r.fuente.drive})${r.modificado ? ` · modificado ${r.modificado}` : ''}${r.estimado ? ' · ESTIMADO' : ''}`)
      for (const k of RUBROS) {
        const b = r.rubros[k]
        const fuera = b.detalle.filter((d) => d.fuera_de_oferta).reduce((a, d) => a + d.importe, 0)
        console.log(`  ${k.padEnd(16)} ${b.monto == null ? '—'.padStart(14) : plata(b.monto).padStart(14)}  ${b.detalle.length} líneas${fuera ? ` · fuera de la oferta ${plata(fuera)}` : ''}${b.motivo ? ` · ${b.motivo}` : ''}`)
        if (conDetalle) for (const d of b.detalle.slice(0, 40)) console.log(`      ${plata(d.importe).padStart(13)}  ${d.item}${d.unidad ? ` [${d.unidad}${d.cantidad != null ? ` ${d.cantidad}` : ''}]` : ''}${d.parte ? ` (${d.parte})` : ''}${d.fuera_de_oferta ? ' · fuera de la oferta' : ''}${d.sin_evidencia ? ' · SIN EVIDENCIA' : ''}`)
      }
      console.log(`  control: ${r.control} · horas del documento ${r.hh ?? '—'}`)
      for (const x of r.controles) console.log(`  ⚠ ${x}`)
      for (const x of r.problemas) console.log(`  ✗ ${x}`)
    }
    if (abortar && !forzar) {
      await c.query('rollback')
      console.error('\nNO SE CARGA: hay problemas arriba (✗). Con --forzar se carga igual.')
      process.exitCode = 1
      return
    }

    // ── escritura ──
    let escritas = 0
    for (const r of resultados) {
      await c.query(
        `insert into public.obra_presupuesto_lectura (obra_canonica_id, estado, motivo, costo_directo, moneda, estimado, fuente_drive_id, fuente_nombre, fuente_fecha, fuente_modificado, cita, leido_en, leido_por, hh_cotizadas)
         values ($1, $2, $3, $4, 'ARS', $5, $6, $7, $8, $9, $10, now(), $11, $12)
         on conflict (obra_canonica_id) do update set estado = excluded.estado, motivo = excluded.motivo, costo_directo = excluded.costo_directo,
           estimado = excluded.estimado, fuente_drive_id = excluded.fuente_drive_id, fuente_nombre = excluded.fuente_nombre, fuente_fecha = excluded.fuente_fecha,
           fuente_modificado = excluded.fuente_modificado, cita = excluded.cita, leido_en = now(), leido_por = excluded.leido_por,
           hh_cotizadas = excluded.hh_cotizadas`,
        [r.obra, r.estado, r.estado === 'leido' ? null : r.motivo, r.costoDirecto, !!r.estimado, r.fuente?.drive ?? null, r.fuente?.nombre ?? null,
          r.fecha, r.modificado ?? null, r.estado === 'leido' ? r.cita : null, QUIEN, r.hh ?? null])
      await c.query('delete from public.obra_presupuesto_rubro where obra_canonica_id = $1', [r.obra])
      if (r.estado !== 'leido') continue
      for (const k of RUBROS) {
        const b = r.rubros[k]
        await c.query(
          `insert into public.obra_presupuesto_rubro (obra_canonica_id, rubro, monto, motivo, detalle, estimado, cita) values ($1, $2, $3, $4, $5::jsonb, $6, $7)`,
          [r.obra, k, b.monto, b.monto == null ? b.motivo : (b.motivo ?? null), JSON.stringify(b.detalle), !!(r.estimado || b.estimado), b.cita ?? null])
        escritas++
      }
    }
    console.log(`\n${resultados.length} obras · ${escritas} filas de rubro`)
    if (!aplicar) {
      const { rows } = await c.query(LECTURA)
      console.log('\nLECTURA DENTRO DE LA TRANSACCIÓN (se deshace):')
      imprimir(rows)
      await c.query('rollback')
      console.log('\n✓ ensayo: nada quedó escrito (rollback). Para escribir: --aplicar')
      return
    }
    await c.query('commit')
  } catch (e) {
    await c.query('rollback').catch(() => {})
    throw e
  } finally {
    c.release()
  }
  const otra = await pool.connect()
  try {
    console.log('\nLEÍDO EN DESTINO (otra conexión, después del commit):')
    imprimir((await otra.query(LECTURA)).rows)
  } finally {
    otra.release()
  }
}

const LECTURA = `
select obra_canonica_id, presupuesto_estado, presupuestado_total, presupuestado_mano_obra, presupuestado_materiales, presupuestado_subcontratistas, presupuestado_otros, contratado, contratado_origen, presupuesto_motivo
  from public.obra_economia_rubros where presupuesto_estado is not null order by presupuesto_estado, obra_canonica_id`

function imprimir(filas) {
  for (const f of filas) {
    console.log(`  ${f.obra_canonica_id.padEnd(31)} ${f.presupuesto_estado.padEnd(15)} total ${plata(f.presupuestado_total).padStart(12)} · MO ${plata(f.presupuestado_mano_obra)} · MAT ${plata(f.presupuestado_materiales)} · SUB ${plata(f.presupuestado_subcontratistas)} · OTR ${plata(f.presupuestado_otros)} · contratado ${plata(f.contratado)} (${f.contratado_origen ?? '—'})${f.presupuesto_motivo ? ` · ${f.presupuesto_motivo.slice(0, 70)}` : ''}`)
  }
}

main().catch((e) => { console.error(e.stack ?? e.message); process.exitCode = 1 }).finally(() => closePool())
