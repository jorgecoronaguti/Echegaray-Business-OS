#!/usr/bin/env node
// LA CASCADA DE UNA COTIZACIÓN REAL, ESCALÓN POR ESCALÓN, CITANDO SU VERSIÓN DE POLÍTICA.
//
// Contesta la pregunta que hoy no se puede contestar mirando `cotizacion_cascada`: **de dónde salió
// cada número**. La vista publica `venta_final` y ocho porcentajes sueltos; acá sale el costo
// directo con sus cajones, el indirecto con su estructura, la política con su versión y sus
// overrides, y el precio con el coeficiente derivado.
//
//   node orquestador/scripts/cascada-versionada.mjs                      # la cotización más grande
//   node orquestador/scripts/cascada-versionada.mjs --cotizacion COT-…   # por número o por uuid
//   node orquestador/scripts/cascada-versionada.mjs --sin-override       # sin el 27 % histórico
//
// NO ESCRIBE NADA. Sólo lee.

import { getPool } from '../lib/db.mjs'
import { leerEstado } from '../lib/cotizador/pg.mjs'
import { costoDePartida, costoDirecto } from '../lib/cotizador/costo.mjs'
import { indirectoCalculado, indirectoAplicado, overrideDeIndirecto } from '../lib/cotizador/indirectos.mjs'
import { politicaEfectiva, proyectarACascada, resolverReferencia, margenSobreVenta, markupSobreCosto } from '../lib/cotizador/politica-version.mjs'
import { cascada } from '../lib/cotizador/comercial.mjs'
import { leerVersionDePolitica, leerCatalogoDePoliticas, leerPoliticaDeCotizacion, leerEstructuraIndirecta, leerVigenciaDeSubcontratos } from '../lib/cotizador/politica-pg.mjs'

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d }
const flag = (n) => process.argv.includes(n)

const $ = (n) => (n === null || n === undefined ? '        —        ' : Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).padStart(17))
const pct = (n) => (n === null || n === undefined ? '   —   ' : `${(Number(n) * 100).toFixed(3)} %`.padStart(9))
const linea = (rot, monto, nota = '') => console.log(`  ${rot.padEnd(34)} ${$(monto)}  ${nota}`)

/** El 27 % con el que la empresa cotiza HOY, declarado como lo que es: un override sobre una
 *  estructura que el OS todavía no tiene cargada, con sus cuatro datos. No es un default del script:
 *  es el número que está en `parametro_comercial` y su origen está citado. */
const OVERRIDE_HISTORICO = {
  valor: 0.27, actor: 'parametro_comercial v1 (siembra, PENDIENTE de firma del dueño)',
  fecha: '2026-08-21',
  motivo: 'la empresa cotiza con el 27 % del libro; la estructura que lo explicaría no está cargada en el OS',
  evidencia: 'Planilla para Cotizar (2).xlsm · hoja Presupuesto B62:H89 · el 27 % es el redondeo a mano del 26,98 % de la hoja GG',
}

async function main() {
  const pool = getPool()
  const query = (s, p) => pool.query(s, p)
  const ref = arg('--cotizacion')

  const c = (await query(
    ref
      ? `select id, numero, cliente, obra_nombre, version, estado from public.cotizaciones
          where id::text = $1 or numero = $1 order by version desc limit 1`
      : `select c.id, c.numero, c.cliente, c.obra_nombre, c.version, c.estado
           from public.cotizaciones c join public.cotizacion_partida p on p.cotizacion_id = c.id
          group by c.id, c.numero, c.cliente, c.obra_nombre, c.version, c.estado
          order by count(p.id) desc, c.id limit 1`,
    ref ? [ref] : [])).rows[0]
  if (!c) { console.log(`no se encontró la cotización «${ref}»`); return }

  console.log(`\n╔═ ${c.numero} v${c.version} · ${c.cliente ?? 'sin cliente'} · ${c.obra_nombre ?? ''} [${c.estado}]`)
  console.log(`╚═ ${c.id}\n`)

  // ── 1 · COSTO DIRECTO ────────────────────────────────────────────────────────────────────────
  const estado = await leerEstado({ query }, c.id)
  const tabla = await leerVigenciaDeSubcontratos({ query })
  const costos = estado.partidas.map((p) => costoDePartida({
    partida: p, composicion: p.composicion, observaciones: estado.observaciones,
    hoy: estado.hoy, tablaVigenciaSubcontrato: tabla,
  }))
  const cd = costoDirecto(costos)

  console.log('── 1 · COSTO DIRECTO ─────────────────────────────────────────────────────────────')
  for (const [k, v] of Object.entries(cd.cajones ?? { LABOR: null, MATERIALS: null, EQUIPMENT: null, SUBCONTRACTS: null, OTHER: null })) linea(k, v)
  linea('TOTAL', cd.total, cd.total === null ? `← NO se afirma: ${cd.nSinCosto} de ${cd.nPartidas} partidas sin costo` : `${cd.nPartidas} partidas`)
  if (cd.total === null) linea('(parcial, no es el costo directo)', cd.parcial, '← lo que sí cerró. Se llama distinto a propósito')
  console.log(`  HH: ${cd.hh ?? '— (' + cd.nSinHh + ' partidas no pueden afirmarlas)'}`)

  // ── 2 · INDIRECTOS ───────────────────────────────────────────────────────────────────────────
  const estructura = await leerEstructuraIndirecta({ query })
  const calc = indirectoCalculado({ estructura, costoDirectoObra: cd.total })
  const intento = flag('--sin-override') ? null : overrideDeIndirecto(OVERRIDE_HISTORICO)
  const ind = indirectoAplicado({ calculado: calc, intento })

  console.log('\n── 2 · INDIRECTOS ────────────────────────────────────────────────────────────────')
  console.log(`  estructura v${estructura?.version ?? '—'} · ${estructura?.conceptos.length ?? 0} conceptos · costo directo anual: ${estructura?.costoDirectoAnual ?? '— (no declarado)'}`)
  // El motivo entero está en `calc.porQue` y en cada concepto; acá se recortan los 14 huecos a un
  // renglón, porque un párrafo de 900 caracteres en una terminal no se lee y esconde lo que sigue.
  const huecos = calc.porConcepto.filter((x) => x.porQue)
  console.log(`  CALCULADO ${pct(ind.calculado)}   ${huecos.length ? `${huecos.length} de ${calc.nConceptos} conceptos sin valor: ${huecos.slice(0, 3).map((x) => x.concepto).join(' · ')}${huecos.length > 3 ? ` … y ${huecos.length - 3} más` : ''}` : ''}`)
  console.log(`  APLICADO  ${pct(ind.aplicado)}   ${ind.override ? `← override de ${ind.override.actor}` : 'sin override'}`)
  if (ind.override) console.log(`     motivo: ${ind.override.motivo}\n     evidencia: ${ind.override.evidencia} (${ind.override.fecha})`)
  if (ind.brechaDeAbsorcion !== null) linea('brecha de absorción', ind.brechaDeAbsorcion, ind.brechaDeAbsorcion < 0 ? '← estructura que esta obra NO absorbe' : '')

  // ── 3 · POLÍTICA COMERCIAL ───────────────────────────────────────────────────────────────────
  const { referencia, overrides } = await leerPoliticaDeCotizacion({ query }, c.id)
  const catalogo = await leerCatalogoDePoliticas({ query })
  const vigente = await leerVersionDePolitica({ query })
  const usada = referencia ? resolverReferencia(referencia, catalogo) : { ok: false, version: null, porQue: 'esta cotización no referencia ninguna versión de política todavía' }
  // Sin referencia se usa la VIGENTE y se DICE que es un supuesto: nunca se finge que la cotización
  // eligió una política que nadie le asignó.
  const version = usada.version ?? vigente
  const ef = politicaEfectiva({ version, overrides })

  console.log('\n── 3 · POLÍTICA COMERCIAL ────────────────────────────────────────────────────────')
  console.log(`  versión v${version.version} [${version.estado}] · ${referencia ? 'REFERENCIADA por la cotización' : 'SUPUESTA (la vigente): ' + usada.porQue}`)
  console.log(`  fuente: ${version.fuente}`)
  for (const [k, v] of Object.entries(ef.valores)) {
    const comp = version.porClave[k]
    const ov = ef.aplicados.find((a) => a.clave === k)
    console.log(`    ${k.padEnd(20)} ${pct(v)}  ${ov ? `← override de ${ov.autorizadoPor}: ${ov.motivo} (era ${pct(ov.valorAnterior).trim()})` : (comp?.conflicto ? `⚠ CONFLICTO: ${comp.conflicto.slice(0, 80)}…` : '')}`)
  }
  for (const r of ef.rechazados) console.log(`    ⚠ override RECHAZADO: ${r.porQue}`)

  // ── 4 · EL PRECIO ────────────────────────────────────────────────────────────────────────────
  const proy = proyectarACascada({ efectiva: ef, pctGastosGenerales: ind.aplicado })
  console.log('\n── 4 · CASCADA Y PRECIO ──────────────────────────────────────────────────────────')
  if (!proy.politica) { console.log(`  NO SE CALCULA · ${proy.porQue}`); return }

  const r = cascada({ costoDirecto: cd.total, politica: proy.politica })
  if (r.costoDirecto === null) { console.log(`  NO SE CALCULA · ${r.porQue}`); return }
  linea('costo directo', r.costoDirecto)
  linea('+ gastos generales', r.gastosGenerales, `${pct(proy.politica.pctGastosGenerales).trim()} sobre el costo directo`)
  linea('= COSTO INDUSTRIAL', r.costoIndustrial)
  linea('+ beneficio', r.beneficio, `${pct(proy.politica.pctBeneficio).trim()} MARKUP sobre el industrial`)
  linea('+ financiero', r.financiero, `${pct(proy.politica.pctFinanciero).trim()} × ${proy.politica.factorFinanciero} sobre el industrial`)
  linea('+ IIBB', r.iibb, 'sobre industrial + beneficio')
  linea('+ ganancias', r.ganancias, 'sobre industrial + beneficio')
  linea('= SUBTOTAL', r.subtotal)
  linea('+ impuesto al cheque', r.impuestoCheque, 'sobre el subtotal')
  linea('= VENTA SIN IVA', r.ventaSinIva)
  linea('+ IVA', r.iva)
  linea('= VENTA FINAL', r.ventaFinal)
  console.log(`\n  coeficiente s/IVA ${r.coeficienteSinIva} · c/IVA ${r.coeficienteConIva}`)
  console.log(`  MARKUP sobre el costo directo: ${(markupSobreCosto({ precio: r.ventaSinIva, costo: r.costoDirecto }) * 100).toFixed(2)} %`)
  console.log(`  MARGEN sobre la venta:         ${(margenSobreVenta({ precio: r.ventaSinIva, costo: r.costoDirecto }) * 100).toFixed(2)} %  ← NO es el markup`)
  console.log(`  beneficio sobre la venta:      ${r.margenSobrePrecioPct} %  ← lo que deja el ${pct(proy.politica.pctBeneficio).trim()} de markup`)
  console.log(`\n  política citada: ${r.politica.fuente}\n`)
}

main().then(() => getPool().end(), (e) => { console.error(e); getPool().end(); process.exitCode = 1 })