#!/usr/bin/env node
// ¿SIRVE EL RECIBO ESTIMADO? COTEJO RETROSPECTIVO DE SÓLO LECTURA.
//
//   node orquestador/scripts/recibos-detalle-importar.mjs --volcar /tmp/x/recibos.json   # en seco
//   node orquestador/scripts/recibo-estimado-cotejo.mjs --volcado /tmp/x/recibos.json \
//        --periodos Q1-08/2026,Q2-08/2026 --feriados Q2-08/2026=1
//
// Para cada período: las reglas se derivan SÓLO de las quincenas anteriores (`reglasDelRecibo`), se estima el
// recibo de cada persona que tiene recibo real ese período (`estimarRecibo`) y se compara concepto por concepto
// (`compararConReal`). No lee ni escribe la base: trabaja sobre el volcado del importador en seco.
//
// ═══ LO QUE EL COTEJO SUPONE, DICHO ═══
//
// · El $/h es el del recibo real: el cotejo mide las reglas, no el piso de la categoría ni la tarifa.
// · Los feriados hábiles de cada quincena van por `--feriados`, porque `calendario_no_laborable` no tiene
//   ninguna fila (15/09/2026). Sin el argumento, la quincena se estima sin feriados, igual que la pantalla.
// · Las horas del recibo son las de la regla (media jornada) o las del último recibo (jornada completa).
import { readFileSync } from 'node:fs'
import { reglasDelRecibo } from '../../src/features/administracion/services/reglasDelRecibo.ts'
import { compararConReal, estimarRecibo } from '../../src/features/administracion/services/reciboEstimado.ts'

const arg = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null)
const VOLCADO = arg('--volcado')
if (!VOLCADO) { console.error('falta --volcado <archivo.json> (el de recibos-detalle-importar.mjs --volcar)'); process.exit(2) }
const PERIODOS = (arg('--periodos') ?? 'Q1-08/2026,Q2-08/2026').split(',')
const FERIADOS = new Map((arg('--feriados') ?? '').split(',').filter(Boolean).map((x) => { const [p, n] = x.split('='); return [p, Number(n)] }))

const r2 = (n) => Math.round(n * 100) / 100
const $ = (n) => (n == null ? '—' : n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

const leidos = JSON.parse(readFileSync(VOLCADO, 'utf8')).filter((l) => /^Q/.test(l.fila.periodo) && l.conceptos?.ok)
const recibos = leidos.map((l) => ({
  persona: l.fila.cuil, nombre: l.nombre, periodo: l.fila.periodo, valorHora: l.fila.valor_hora,
  horasNormales: l.fila.horas_normales, horasFeriado: l.fila.horas_feriado, horasOtras: l.fila.horas_otras,
  neto: l.fila.neto, conceptos: l.conceptos.lineas,
}))

function cotejarPeriodo(periodo) {
  const reglas = reglasDelRecibo(recibos, periodo)
  const personas = []
  const porConcepto = new Map()
  for (const real of recibos.filter((r) => r.periodo === periodo)) {
    const est = estimarRecibo(reglas, {
      persona: real.persona, periodo, valorHora: real.valorHora, horasRecibo: null,
      feriados: FERIADOS.get(periodo) ?? 0, recibosPropios: recibos.filter((r) => r.persona === real.persona),
    })
    const filas = compararConReal(est, real.conceptos)
    for (const f of filas.filter((x) => x.seccion !== 'contribucion')) {
      const k = `${f.codigo} ${f.descripcion}`
      const acc = porConcepto.get(k) ?? { n: 0, sinEstimar: 0, noPrevisto: 0, errores: [] }
      // Sin número y sin fuente: el estimado no lo previó (un accidente, un embargo). Sin número con fuente: dudosa.
      if (f.real == null || (f.estimado == null && !f.fuente)) acc.noPrevisto++
      else if (f.estimado == null) acc.sinEstimar++
      else acc.errores.push(Math.abs(f.diferencia))
      acc.n++
      porConcepto.set(k, acc)
    }
    const difieren = filas.filter((f) => f.seccion !== 'contribucion' && (f.diferencia != null ? Math.abs(f.diferencia) > 0.01 : f.real != null || f.estimado != null))
      .map((f) => `${f.codigo} ${f.diferencia != null ? $(f.diferencia) : f.real != null ? `real ${$(f.real)} sin estimar` : `estimado ${$(f.estimado)} no está en el real`}`)
    personas.push({ nombre: real.nombre, horas: r2(real.horasNormales + real.horasFeriado + real.horasOtras), estimado: est?.neto ?? null, real: real.neto, avisos: est?.avisos ?? ['sin estimado'], difieren })
  }
  return { reglas, personas, porConcepto }
}

function informar(periodo, { reglas, personas, porConcepto }) {
  console.log(`\n══ ${periodo} · reglas de ${reglas.periodos.join(', ')} (${reglas.recibos} recibos) · feriados ${FERIADOS.get(periodo) ?? 0}`)
  console.log('NETO POR PERSONA (real − estimado):')
  const errores = []
  for (const p of personas.sort((a, b) => a.nombre.localeCompare(b.nombre))) {
    const d = p.estimado == null ? null : r2(p.real - p.estimado)
    if (d != null) errores.push(Math.abs(d))
    console.log(`  ${p.nombre.slice(0, 32).padEnd(32)} ${String(p.horas).padStart(5)} h  est ${$(p.estimado).padStart(12)}  real ${$(p.real).padStart(12)}  dif ${$(d).padStart(10)}${d != null && p.real ? ` (${(100 * d / p.real).toFixed(2)} %)` : ''}`)
    // Más de 1 % de diferencia: qué conceptos la explican y qué avisó el estimado.
    if (d == null || (p.real && Math.abs(d / p.real) > 0.01)) console.log(`     ↳ ${p.difieren.join(' · ')}${p.avisos.length ? ` | aviso: ${p.avisos.join(' · ')}` : ''}`)
  }
  const med = errores.length ? r2(errores.reduce((a, b) => a + b, 0) / errores.length) : null
  console.log(`  NETO: ${errores.length}/${personas.length} estimados · error absoluto medio $${$(med)} · máximo $${$(errores.length ? Math.max(...errores) : null)} · al centavo ${errores.filter((e) => e <= 0.01).length}`)
  console.log('POR CONCEPTO (haberes y descuentos): n · error medio · máximo · sin estimar (dudosa) · no previsto (sólo en el real o sólo en el estimado)')
  for (const [k, a] of [...porConcepto].sort()) {
    const m = a.errores.length ? r2(a.errores.reduce((x, y) => x + y, 0) / a.errores.length) : null
    console.log(`  ${k.slice(0, 44).padEnd(44)} ${String(a.n).padStart(3)} · ${$(m).padStart(10)} · ${$(a.errores.length ? Math.max(...a.errores) : null).padStart(10)} · ${a.sinEstimar} · ${a.noPrevisto}`)
  }
}

for (const p of PERIODOS) informar(p, cotejarPeriodo(p))
