#!/usr/bin/env node
// EL BUCLE DE APRENDIZAJE, CORRIDO ENTERO SOBRE LAS OBRAS REALES.
//
//   COTIZACIÓN → EJECUCIÓN → OBSERVACIÓN → COMPARACIÓN → CANDIDATO → CONTRASTE
//              → GOBERNANZA → REGRESIÓN → ACTIVACIÓN → REUTILIZACIÓN
//
//   node orquestador/scripts/learning-circuito.mjs              sólo mide y reporta
//   node orquestador/scripts/learning-circuito.mjs --persistir  guarda los candidatos
//   node orquestador/scripts/learning-circuito.mjs --activar     activa los que la gobernanza habilita
//
// ═══ POR QUÉ IMPORTA CORRERLO AUNQUE NO PROMUEVA NADA ═══
//
// Un bucle de aprendizaje que sólo existe en los tests es una promesa. Corriéndolo se contesta la
// pregunta del negocio: ¿alcanza lo que medimos para aprender algo? Si la respuesta es que no, eso
// es un dato —falta CAPTURA— y no un defecto del código. Lo que no se puede hacer es aflojar los
// umbrales hasta que algo promueva: ahí el bucle deja de aprender y empieza a inventar.
import { query } from '../lib/db.mjs'
import { candidato } from '../lib/conocimiento/promocion.mjs'
import {
  evaluarGobernanza, muestrasAdmisibles, filtrarPorCausa, causasDeclaradas, ventana, ESTADO,
} from '../lib/conocimiento/gobernanza.mjs'
import { regresionHoldOut } from '../lib/conocimiento/regresion-aprendizaje.mjs'
import { guardar, activar, activos } from '../lib/conocimiento/activacion.mjs'

const persistir = process.argv.includes('--persistir') || process.argv.includes('--activar')
const conActivacion = process.argv.includes('--activar')
const n = (x) => (x === null || x === undefined ? null : Number(x))
const f = (x, d = 3) => (x === null || x === undefined || !Number.isFinite(Number(x)) ? '—' : Number(x).toFixed(d))

// ── EL CATÁLOGO DE CAUSAS, QUE ES LO QUE DECIDE SI UN DESVÍO HABLA DE PRODUCTIVIDAD ───────────
const catalogo = new Map((await query('select clave, familia from public.causa_desvio')).rows.map((r) => [r.clave, r.familia]))

// ── 1. LAS OBSERVACIONES REALES ──────────────────────────────────────────────────────────────

const rend = (await query(`
  select rh.tarea_tipo_id, coalesce(tt.codigo, rh.tarea_tipo_id::text) codigo, tt.nombre, rh.unidad,
         rh.obra_id, rh.actividad_id, rh.hs_unitarias, rh.hs_unitarias_plan, rh.estado, rh.confianza,
         rh.causas, rh.fecha_desde::text desde, coalesce(rh.fecha_hasta, rh.fecha_desde)::text hasta
    from public.rendimiento_historico rh
    left join public.tarea_tipo tt on tt.id = rh.tarea_tipo_id
   where rh.hs_unitarias is not null`)).rows

const dur = (await query(`
  select d.actividad_id, d.obra_id, d.tarea_tipo_id, coalesce(tt.codigo, 'SIN-TAREA') codigo,
         tt.nombre, d.dias_plan, d.dias_real, d.confianza, d.estado,
         d.inicio_real::text desde, d.fin_real::text hasta
    from public.duracion_historica d
    left join public.tarea_tipo tt on tt.id = d.tarea_tipo_id
   where d.estado <> 'DESCARTADO' and d.dias_real is not null and d.dias_plan > 0`)).rows

const porCausa = filtrarPorCausa(rend.map((r) => ({ ...r, causas: causasDeclaradas(r.causas, catalogo) })))
const { admisibles, referencia, descartadas } = muestrasAdmisibles(porCausa.admisibles)

console.log('\n═══ EL BUCLE DE APRENDIZAJE SOBRE LAS OBRAS REALES ═══\n')
console.log('  ── observaciones ──')
console.log(`  rendimiento (hs/unidad)          ${rend.length}`)
console.log(`     de la referencia del xlsm     ${referencia.length}  ← no es experiencia: es con lo que se viene cotizando`)
console.log(`     descalificadas por causa      ${porCausa.descalificadas.length}  ← el desvío tiene dueño declarado y no es la tarea`)
for (const d of porCausa.descalificadas) console.log(`        ${d.codigo} (${d.obra_id}): ${d.motivo}`)
console.log(`     descartadas                   ${descartadas.length}`)
console.log(`     ADMISIBLES                    ${admisibles.length}  en ${new Set(admisibles.map((r) => r.obra_id).filter(Boolean)).size} obra(s)`)
console.log(`  duración (días)                  ${dur.length}  en ${new Set(dur.map((r) => r.obra_id)).size} obra(s)`)
console.log(`     con tipo de tarea             ${dur.filter((r) => r.tarea_tipo_id).length}  ← sin tarea la experiencia no se puede reutilizar en otra obra`)

// ── 2. LOS CANDIDATOS ────────────────────────────────────────────────────────────────────────

/** Agrupa por clave y arma un candidato con su muestra, su ventana y su regresión hold-out. */
function armar({ clave, afirmacion, unidad, filas, valorDe, baseDe, area, contexto = null }) {
  const muestras = filas.map((r, i) => ({
    id: `${r.codigo ?? clave}#${i + 1}${r.obra_id ? ` (${r.obra_id})` : ''}`,
    obra: r.obra_id ?? 'sin-obra', valor: valorDe(r), base: baseDe(r),
  })).filter((m) => Number.isFinite(m.valor))
  if (!muestras.length) return null
  const c = candidato({
    clave, afirmacion, unidad, area,
    valores: muestras.map((m) => m.valor),
    obras: muestras.map((m) => m.obra),
    contexto,
    evidencia: filas.map((r) => ({
      obra: r.obra_id, actividad: r.actividad_id, desde: r.desde, hasta: r.hasta, confianza: r.confianza,
    })),
    fecha: new Date().toISOString().slice(0, 10),
  })
  c.ventana = ventana(c.evidencia)
  c.contexto = contexto
  const regresion = regresionHoldOut({ muestras })
  return { candidato: c, regresion, gobernanza: evaluarGobernanza({ candidato: c, regresion }), muestras }
}

const agrupar = (filas, clave) => {
  const m = new Map()
  for (const r of filas) {
    const k = clave(r)
    if (!m.has(k)) m.set(k, [])
    m.get(k).push(r)
  }
  return m
}

const candidatos = []

// 2a. RENDIMIENTO POR TAREA — lo que se cotiza. La base contra la que se mide es lo COTIZADO.
for (const [cod, filas] of agrupar(admisibles.filter((r) => r.tarea_tipo_id), (r) => r.codigo)) {
  const c = armar({
    clave: `rendimiento.${cod}`, area: 'cotizacion',
    afirmacion: `${filas[0].nombre ?? cod} rinde {media} hs/${filas[0].unidad ?? 'un'} medido en obra`,
    unidad: `hs/${filas[0].unidad ?? 'un'}`, filas,
    valorDe: (r) => n(r.hs_unitarias), baseDe: (r) => n(r.hs_unitarias_plan),
  })
  if (c) candidatos.push(c)
}

// 2b. DURACIÓN POR TAREA — cuánto tarda. La base es el PLAN.
for (const [cod, filas] of agrupar(dur.filter((r) => r.tarea_tipo_id), (r) => r.codigo)) {
  const c = armar({
    clave: `duracion.${cod}`, area: 'planificacion',
    afirmacion: `${filas[0].nombre ?? cod} tarda {media} día(s) medido en obra`,
    unidad: 'días', filas, valorDe: (r) => n(r.dias_real), baseDe: (r) => n(r.dias_plan),
  })
  if (c) candidatos.push(c)
}

// 2c. LA TENTACIÓN: UN SOLO NÚMERO PARA TODA LA EMPRESA.
//
// Es el candidato que un motor ingenuo promovería —«las actividades tardan X días»— y el que este
// frente existe para frenar. Se arma a propósito para que el rechazo quede medido y no supuesto.
{
  const c = armar({
    clave: 'duracion.global', area: 'planificacion',
    afirmacion: 'una actividad de Echegaray tarda {media} día(s), mida lo que mida el plan',
    unidad: 'días', filas: dur, valorDe: (r) => n(r.dias_real), baseDe: (r) => n(r.dias_plan),
    contexto: { alcance: 'todas las actividades terminadas, sin distinguir tarea' },
  })
  if (c) candidatos.push(c)
}

// ── 3. LA PUERTA ─────────────────────────────────────────────────────────────────────────────

console.log('\n  ── candidatos ──')
const bloqueosPorMotivo = new Map()
let aptos = 0, activados = 0
for (const c of candidatos.sort((a, b) => a.candidato.clave.localeCompare(b.candidato.clave))) {
  const { candidato: k, gobernanza: g, regresion: r } = c
  console.log(`\n  ${g.apto ? '✔' : '✗'} ${k.clave}`)
  console.log(`      ${k.estadistica.n} medición(es) en ${k.obrasDistintas} obra(s) · valor ${f(k.reglaCandidata)} ${k.unidad ?? ''} · dispersión ${f(k.estadistica.dispersion, 4)} · clase ${k.madurez ?? '—'} · ventana ${g.ventana.desde ?? '—'} → ${g.ventana.hasta ?? '—'}`)
  console.log(`      regresión hold-out: ${r.casos} caso(s), ${r.comparables ?? 0} comparable(s), mejoran ${r.mejoran}, empeoran ${r.empeoran}${r.deltaPP === null ? '' : `, error ${f(r.errorAnterior * 100, 1)}% → ${f(r.errorNueva * 100, 1)}% (${r.deltaPP > 0 ? '+' : ''}${r.deltaPP} pp)`}`)
  if (g.apto) { aptos += 1; console.log('      PASA LA GOBERNANZA') } else {
    for (const b of g.bloqueos) bloqueosPorMotivo.set(b, (bloqueosPorMotivo.get(b) ?? 0) + 1)
    console.log(`      RECHAZADO — ${g.porQue}`)
  }
  if (!persistir) continue
  const guardado = await guardar({ query }, c)
  if (guardado.requiereRevision) console.log(`      ⚠ HAY UNA NORMA VIGENTE QUE ESTA MUESTRA YA NO SOSTIENE: ${k.clave}`)
  if (conActivacion && guardado.estado === ESTADO.APTO) {
    const a = await activar({ query }, { clave: k.clave, quien: 'learning-circuito' })
    if (a.activada) { activados += 1; console.log(`      ACTIVADO v${a.version}`) } else console.log(`      no se activó: ${a.porQue}`)
  }
}

// ── 4. LA MEDICIÓN DEL PUNTO §20: ¿ESTIMA MEJOR CON LO APRENDIDO? ────────────────────────────

const global = candidatos.find((c) => c.candidato.clave === 'duracion.global')
if (global?.regresion?.porObra?.length) {
  console.log('\n  ── §20 · ¿ESTIMA MEJOR? dejando una obra afuera por vez ──')
  console.log('     obra                 regla   casos   error con el PLAN   error con lo APRENDIDO   delta')
  for (const o of global.regresion.porObra) {
    const d = o.errorNueva !== null && o.errorAnterior !== null ? (o.errorNueva - o.errorAnterior) * 100 : null
    console.log(`     ${String(o.obra).padEnd(20)} ${f(o.regla, 2).padStart(5)}   ${String(o.comparables).padStart(5)}   ${`${f(o.errorAnterior * 100, 1)}%`.padStart(17)}   ${`${f(o.errorNueva * 100, 1)}%`.padStart(21)}   ${d === null ? '—' : `${d > 0 ? '+' : ''}${d.toFixed(1)} pp`}`)
  }
  const r = global.regresion
  console.log(`     TOTAL                        ${String(r.comparables).padStart(5)}   ${`${f(r.errorAnterior * 100, 1)}%`.padStart(17)}   ${`${f(r.errorNueva * 100, 1)}%`.padStart(21)}   ${r.deltaPP > 0 ? '+' : ''}${r.deltaPP} pp`)
  // EL PROMEDIO NO ES LA DECISIÓN. Un aprendizaje que baja el error medio y al mismo tiempo empeora
  // diecisiete casos conocidos no se activa: el promedio esconde a quién le fue peor, y en una obra
  // «peor» es un plazo incumplido. Por eso la conclusión dice las dos cosas y termina en el veredicto
  // de la gobernanza, no en el delta.
  const veredicto = global.gobernanza.apto ? 'y la gobernanza lo habilita' : `pero la gobernanza NO lo activa — ${global.gobernanza.bloqueos.join(', ')}`
  console.log(`     ⇒ ${r.deltaPP > 0 ? 'estima PEOR que el plan en promedio' : `estima mejor que el plan en promedio (${r.deltaPP} pp)`}, empeora ${r.empeoran} de ${r.comparables} casos conocidos, ${veredicto}.`)
}

// ── 5. EL RESUMEN QUE CONTESTA LA PREGUNTA ───────────────────────────────────────────────────

const enUso = await activos({ query })
console.log('\n  ── resumen ──')
console.log(`  observaciones admisibles         ${admisibles.length} de rendimiento · ${dur.length} de duración`)
console.log(`  candidatos generados             ${candidatos.length}`)
console.log(`  cumplen la gobernanza            ${aptos}`)
console.log(`  activados en esta corrida        ${conActivacion ? activados : '— (falta --activar)'}`)
console.log(`  rigiendo hoy                     ${enUso.length}`)
console.log(`  rechazados                       ${candidatos.length - aptos}`)
for (const [motivo, cuantos] of [...bloqueosPorMotivo].sort((a, b) => b[1] - a[1])) {
  console.log(`     ${String(motivo).padEnd(22)} ${cuantos}`)
}
if (!aptos) {
  console.log('\n  NO ES UN ERROR: es lo que dice la evidencia. Ninguna tarea tiene todavía mediciones')
  console.log('  parejas en dos obras distintas. El cuello es la CAPTURA —clasificar las actividades con')
  console.log('  su tipo de tarea e imputar HH por actividad—, no el código del bucle.')
}
if (!persistir) console.log('\n  (no se escribió nada: correr con --persistir para guardar los candidatos)')
process.exit(0)
