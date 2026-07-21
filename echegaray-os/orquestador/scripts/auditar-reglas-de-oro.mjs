#!/usr/bin/env node
// ¿EL ARCHIVO RESPETA LAS REGLAS DE ORO? MEDIDO, NO OPINADO.
//
// POR QUÉ EXISTE (21/07). El dueño: "revisá si todo el documento respeta TODAS LAS REGLAS DE ORO que
// se impusieron". Contestar eso mirando el archivo y opinando vale hasta la próxima corrida del
// agente, que es dentro de dos horas. Una regla que no se mide no se cumple: se cumple el día que
// alguien se acuerda de mirarla.
//
// Este script recorre el archivo entero y verifica cada regla con evidencia. No arregla nada: varias
// se rompen por trabajo de carga pendiente y no por un defecto del software, y taparlo sería peor.
//
// 0 API: son lecturas y comparaciones. No pasa por el modelo.
//
//   node orquestador/scripts/auditar-reglas-de-oro.mjs

import { makeGoogleClient, WRITE_SCOPES } from '../lib/google.mjs'
import { loadConfig } from '../lib/config.mjs'
import { REGLAS, DERIVADAS, CALCULADAS, CON_ORIGEN, CLASE, sinClasificar, numerosPegados, derivadasHuerfanas, usaInflacion, indicesCompletos, criteriosEnFormulas, criteriosHuerfanos } from '../lib/reglas-de-oro.mjs'
import { RUBROS } from '../lib/rubro-caja.mjs'
import { SUBRUBROS, OTROS } from '../lib/sub-rubro-estructura.mjs'
import { USA, CABECERA, comparar } from '../lib/cobertura-datos.mjs'
import { PASOS } from '../lib/flujo-caja-pasos.mjs'
import { parseMonto } from '../lib/cash-briefing.mjs'

const ID = process.env.ORQ_CASHFLOW_ID || '1SR6HY5mMt8K9AwfAWVTV-7Z2xPGRildXMDe1QFx5HV8'
const letra = (i) => { let s = ''; for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s; return s }

const hallazgos = []
const anotar = (regla, detalle, evidencia) => hallazgos.push({ regla, detalle, evidencia })

async function main() {
  const google = makeGoogleClient({ config: loadConfig(), scopes: WRITE_SCOPES })
  const hojas = (await google.getSheetMeta(ID)).map((h) => h.title)
  const ok = (t) => console.log(`  ✓ ${t}`)
  const mal = (t) => console.log(`  ⚠ ${t}`)

  for (const r of REGLAS) console.log(`· ${r.regla}`)
  console.log(`\n${hojas.length} pestañas: ${hojas.join(' · ')}\n`)

  // ── PESTAÑA POR PESTAÑA ─────────────────────────────────────────────────────────────────────────
  // El dueño pidió "revisar todo el Sheet pestaña por pestaña, AL DETALLE". Antes el auditor sólo
  // miraba las nueve que el OS escribe: las otras diez no las controlaba nadie.
  console.log('LAS PESTAÑAS, UNA POR UNA')
  console.log(`  ${'Pestaña'.padEnd(26)}${'Clase'.padEnd(11)}${'valores'.padStart(8)}${'fórmulas'.padStart(9)}${'pegados'.padStart(8)}  Lectura`)
  const huerfanasDeClase = sinClasificar(hojas)
  const detalle = []
  for (const t of hojas) {
    const g = await google.readSheetGrid(ID, `${t}!A1:BZ400`).catch(() => ({ filas: [] }))
    const cel = (g.filas ?? []).flat().filter(Boolean)
    const formulas = cel.filter((c) => c.formula).length
    const valores = cel.filter((c) => c.formula || (c.valor != null && String(c.valor).trim() !== '')).length
    const pegados = numerosPegados(g.filas ?? []).length
    const clase = CLASE[t] ?? '⚠ SIN CLASE'
    let lectura = ''
    if (!CLASE[t]) lectura = '⚠ nadie declaró qué es: ningún control la mira'
    else if (clase === 'calculada' && pegados) lectura = `⚠ ${pegados} números escritos donde todo tiene que ser fórmula`
    else if (clase === 'calculada') lectura = 'todo fórmula ✓'
    else if (clase === 'replica') lectura = CON_ORIGEN[t] ? 'números con origen declarado ✓' : '⚠ réplica sin origen declarado'
    else if (clase === 'carga') lectura = 'los números son el hecho primario'
    else if (clase === 'cruda') lectura = 'importada: no se toca'
    else lectura = 'configuración de otras pestañas'
    detalle.push({ t, clase, valores, formulas, pegados })
    console.log(`  ${t.slice(0, 24).padEnd(26)}${clase.padEnd(11)}${String(valores).padStart(8)}${String(formulas).padStart(9)}${String(pegados).padStart(8)}  ${lectura}`)
  }
  if (huerfanasDeClase.length) anotar('automatico', 'pestañas sin clasificar', huerfanasDeClase.join(' · '))
  console.log()

  // ── REGLA "automatico" ──────────────────────────────────────────────────────────────────────────
  console.log('REGLA · todo se actualiza solo')
  const cubiertas = PASOS.flatMap((p) => p[2] ?? [])
  const huerfanas = derivadasHuerfanas(hojas, cubiertas)
  if (huerfanas.length) {
    mal(`${huerfanas.length} pestaña(s) derivada(s) que no rehace ningún script: ${huerfanas.join(' · ')}`)
    anotar('automatico', 'pestaña derivada sin dueño', huerfanas.join(' · '))
  } else ok(`las ${DERIVADAS.filter((d) => hojas.includes(d)).length} pestañas derivadas del archivo las rehace el agente`)

  // ── REGLA "formulas" ────────────────────────────────────────────────────────────────────────────
  console.log('\nREGLA · nunca números sueltos en las pestañas que escribe el OS')
  for (const t of [...CALCULADAS, ...Object.keys(CON_ORIGEN)]) {
    if (!hojas.includes(t)) continue
    const g = await google.readSheetGrid(ID, `${t}!A1:BZ200`).catch(() => ({ filas: [] }))
    const sueltos = numerosPegados(g.filas ?? [])
    if (!sueltos.length) { ok(`${t}: sin números pegados`); continue }
    const muestra = sueltos.slice(0, 4).map((s) => `${letra(s.col - 1)}${s.fila}=${s.valor}`).join(' · ')
    // Un importe traído de ARCA o cargado del extracto CUMPLE la regla: tiene origen trazable y no
    // hay ninguna fórmula del archivo que lo pueda calcular. Se informa, no se marca como defecto.
    if (CON_ORIGEN[t]) { ok(`${t}: ${sueltos.length} números con origen declarado — ${CON_ORIGEN[t]}`); continue }
    mal(`${t}: ${sueltos.length} número(s) escritos a mano — ${muestra}`)
    anotar('formulas', `${t}: ${sueltos.length} números escritos`, muestra)
  }

  // ── REGLA "sin_duplicar" ─────────────────────────────────────────────────────────────────────────
  // La formulación amplia —"un concepto no se calcula en dos lados"— no se puede decidir sola: el
  // cuadro y la pestaña de detalle suman lo mismo a propósito, son dos vistas de la misma partición.
  // Lo que SÍ se verifica es que todas las fórmulas hablen de la MISMA lista de rubros: un criterio
  // escrito a mano que no existe en la definición única es una segunda definición del concepto, y
  // devuelve $0 para siempre sin que ningún control de partición lo note.
  console.log('\nREGLA · un solo juego de rubros para todo el archivo')
  const todasLasFormulas = []
  for (const t of [...CALCULADAS, ...Object.keys(CON_ORIGEN)]) {
    if (!hojas.includes(t)) continue
    const g = await google.readSheetGrid(ID, `${t}!A1:BZ200`).catch(() => ({ filas: [] }))
    todasLasFormulas.push(...(g.filas ?? []).flatMap((f) => (f || []).map((c) => c?.formula).filter(Boolean)))
  }
  for (const [col, validos, que] of [['AC', RUBROS, 'rubro de caja'], ['AF', [...SUBRUBROS.map(([n]) => n), OTROS], 'sub-rubro de estructura']]) {
    const usados = criteriosEnFormulas(todasLasFormulas, col)
    const huerfanos = criteriosHuerfanos(todasLasFormulas, validos, col)
    if (huerfanos.length) {
      mal(`${que}: ${huerfanos.length} criterio(s) que la definición única no conoce — ${huerfanos.join(' · ')}`)
      anotar('sin_duplicar', `${que} escrito a mano en una fórmula`, huerfanos.join(' · '))
    } else ok(`${que}: los ${usados.length} criterios usados en las fórmulas existen en la definición única`)
  }

  // ── REGLA "inflacion" ───────────────────────────────────────────────────────────────────────────
  console.log('\nREGLA · las proyecciones ajustan por inflación')
  for (const t of ['Estructura', 'Recurrentes', 'Cash Flow Mensual', 'Cash Flow Semanal']) {
    if (!hojas.includes(t)) continue
    const g = await google.readSheetGrid(ID, `${t}!A1:BZ200`).catch(() => ({ filas: [] }))
    const formulas = (g.filas ?? []).flatMap((f) => (f || []).map((c) => c?.formula).filter(Boolean))
    const u = usaInflacion(formulas)
    if (!u.proyecta) { ok(`${t}: no proyecta (nada que ajustar)`); continue }
    if (!u.ajusta) {
      mal(`${t}: proyecta en ${u.mira} fórmula(s) y ninguna referencia la tabla de índices`)
      anotar('inflacion', `${t}: proyecta a peso constante`, `${u.mira} fórmulas de proyección, 0 con factor`)
    } else ok(`${t}: proyecta en ${u.mira} fórmula(s) y ajusta por inflación en ${u.ajusta}`)
  }

  // ── REGLA "sin_inventar" ────────────────────────────────────────────────────────────────────────
  console.log('\nREGLA · ningún índice sin fuente, y la tabla llega hasta fin de año')
  const idx = await google.readSheetValues(ID, 'Parámetros!A74:D95').catch(() => [])
  const finDeAno = new Date(new Date().getFullYear(), 11, 1)
  const i = indicesCompletos(idx, finDeAno)
  if (!i.meses) { mal('no encontré la tabla de índices'); anotar('sin_inventar', 'sin tabla de índices', 'Parámetros!A74') }
  else {
    if (i.sinFuente) { mal(`${i.sinFuente} índice(s) sin fuente declarada`); anotar('sin_inventar', 'índice sin fuente', `${i.sinFuente} filas`) }
    else ok(`${i.meses} meses de índice, todos con fuente`)
    const hasta = i.cubreHasta ? i.cubreHasta.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) : '—'
    if (!i.alcanza) { mal(`la tabla llega hasta ${hasta}: los meses posteriores proyectan a peso constante`); anotar('inflacion', 'tabla de índices corta', hasta) }
    else ok(`la tabla cubre hasta ${hasta}`)
  }

  // ── REGLA "devengado_percibido" ─────────────────────────────────────────────────────────────────
  console.log('\nREGLA · el cash flow usa la fecha de CAJA, no la de la factura')
  const gcf = await google.readSheetGrid(ID, 'Cash Flow Mensual!A1:N40').catch(() => ({ filas: [] }))
  const sumifs = (gcf.filas ?? []).flatMap((f) => (f || []).map((c) => c?.formula).filter((x) => x && /SUMIFS|SUMPRODUCT/.test(x)))
  const porFactura = sumifs.filter((f) => /Compras!\$C\$/.test(f))
  const porCaja = sumifs.filter((f) => /Compras!\$AD\$/.test(f))
  if (porFactura.length) {
    mal(`${porFactura.length} fórmula(s) del cuadro suman por FECHA DE FACTURA (Compras!C) — eso es devengado, no caja`)
    anotar('devengado_percibido', 'el cash flow suma por fecha de factura', porFactura[0].slice(0, 120))
  } else ok(`${porCaja.length} fórmulas del cuadro suman por la fecha de caja (Compras!AD)`)

  // ── REGLA "sin_huecos" ──────────────────────────────────────────────────────────────────────────
  console.log('\nREGLA · no tiene que haber dato sin contemplar')
  for (const t of Object.keys(USA)) {
    if (!hojas.includes(t)) { mal(`${t}: la pestaña ya no existe con ese nombre`); continue }
    const cab = CABECERA[t] ?? 1
    const v = await google.readSheetValues(ID, `${t}!A${cab}:BZ400`).catch(() => [])
    const ancho = Math.max(...v.map((f) => f.length), 0)
    const columnas = []
    for (let c = 0; c < ancho; c++) {
      const cuerpo = v.slice(1).map((f) => f?.[c]).filter((x) => String(x ?? '').trim() !== '')
      columnas.push({
        col: letra(c),
        rotulo: String(v[0]?.[c] ?? '').trim(),
        filas: cuerpo.length,
        monto: cuerpo.reduce((a, x) => a + (parseMonto(x) || 0), 0),
      })
    }
    const { huecos, declaradas_vacias } = comparar(t, columnas)
    const conDato = huecos.filter((h) => h.filas > 0)
    if (conDato.length) {
      mal(`${t}: ${conDato.length} columna(s) con datos que el OS no mira — ${conDato.map((h) => `${h.col} "${h.rotulo || 'sin rótulo'}" (${h.filas} filas)`).join(' · ')}`)
      anotar('sin_huecos', `${t}: ${conDato.length} columnas cargadas y no leídas`,
        conDato.map((h) => `${h.col} "${h.rotulo || 'sin rótulo'}" ${h.filas} filas${h.monto ? ` · $${Math.round(h.monto).toLocaleString('es-AR')}` : ''}`).join(' · '))
    } else ok(`${t}: todas las columnas con datos están contempladas`)
    if (declaradas_vacias.length) mal(`${t}: declaradas pero vacías en el archivo: ${declaradas_vacias.join(', ')}`)
  }

  console.log(`\n${'─'.repeat(90)}`)
  if (!hallazgos.length) return console.log('LAS 7 REGLAS DE ORO SE CUMPLEN EN TODO EL ARCHIVO.')
  console.log(`${hallazgos.length} HALLAZGO(S):`)
  for (const h of hallazgos) {
    const r = REGLAS.find((x) => x.id === h.regla)
    console.log(`\n· [${h.regla}] ${h.detalle}`)
    console.log(`  evidencia: ${h.evidencia}`)
    console.log(`  por qué importa: ${r?.porque ?? ''}`)
  }
  process.exitCode = 1
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
