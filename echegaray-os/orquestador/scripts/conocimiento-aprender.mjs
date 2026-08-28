#!/usr/bin/env node
// EL BUCLE DE APRENDIZAJE, CORRIDO CONTRA LOS DATOS REALES DE ECSAS.
//
// Toma lo que tenemos MEDIDO ejecutando (`public.rendimiento_historico`), arma un candidato por
// tarea, corre la regresión contra los casos históricos conocidos y decide si se promueve.
//
// ═══ POR QUÉ IMPORTA CORRERLO AUNQUE NO PROMUEVA NADA ═══
//
// Un bucle de aprendizaje que sólo existe en los tests es una promesa. Corriéndolo se contesta la
// pregunta que importa: ¿alcanza lo que medimos para aprender algo? Y si la respuesta es que no,
// eso es un dato del negocio —no tenemos captura suficiente— y no un defecto del código.
//
//   node orquestador/scripts/conocimiento-aprender.mjs
//   node orquestador/scripts/conocimiento-aprender.mjs --promover   # persiste lo que pase el gate
import fs from 'node:fs'
import path from 'node:path'
import { query } from '../lib/db.mjs'
import { MADUREZ, candidato, decidirPromocion, promover, regresion } from '../lib/conocimiento/promocion.mjs'

const RUTA = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'datos', 'conocimiento', 'reglas-aprendidas.json')
const persistir = process.argv.includes('--promover')

const filas = (await query(`
  select rh.tarea_tipo_id, tt.codigo, tt.nombre, tt.unidad,
         rh.obra_id, rh.cantidad, rh.hh_reales, rh.hs_unitarias, rh.unidad as unidad_medida,
         rh.fuente, rh.origen, rh.confianza, rh.fecha_desde::text, rh.condiciones
    from public.rendimiento_historico rh
    left join public.tarea_tipo tt on tt.id = rh.tarea_tipo_id
   where rh.hh_reales is not null and rh.cantidad is not null and rh.cantidad::numeric > 0
   order by 2 nulls last, 5`)).rows

// La clave de agrupación es la TAREA. Sin tarea no hay regla que aprender: hay una medición suelta
// que todavía no se sabe a qué actividad pertenece, y eso se dice, no se promedia con las demás.
const porClave = new Map()
const sinTarea = []
for (const f of filas) {
  const hsU = Number(f.hs_unitarias ?? (Number(f.hh_reales) / Number(f.cantidad)))
  if (!Number.isFinite(hsU)) continue
  if (!f.tarea_tipo_id) { sinTarea.push({ ...f, hsU }); continue }
  const k = f.codigo ?? f.tarea_tipo_id
  if (!porClave.has(k)) porClave.set(k, { codigo: f.codigo, nombre: f.nombre, unidad: f.unidad, filas: [] })
  porClave.get(k).filas.push({ ...f, hsU })
}

console.log(`\n═══ APRENDIZAJE DESDE LA EJECUCIÓN REAL ═══\n`)
console.log(`  mediciones con cantidad y HH   ${filas.length}`)
console.log(`  sin tarea asignada             ${sinTarea.length}  ← no se pueden convertir en regla: no se sabe de qué actividad son`)
console.log(`  tareas con al menos una        ${porClave.size}\n`)

let registro = (() => { try { return JSON.parse(fs.readFileSync(RUTA, 'utf8')) } catch { return { version: 0, reglas: {}, historial: [] } } })()
let promovidas = 0

for (const [k, g] of [...porClave.entries()].sort()) {
  const obras = g.filas.map((f) => f.obra_id ?? 'sin-obra')
  const c = candidato({
    clave: `rendimiento.${k}`,
    afirmacion: `${g.nombre ?? k} rinde ${'{media}'} h/${g.unidad ?? 'un'} medido en obra`,
    unidad: `h/${g.unidad ?? 'un'}`,
    valores: g.filas.map((f) => f.hsU),
    obras,
    contexto: g.filas[0]?.condiciones?.slice(0, 160) ?? null,
    evidencia: g.filas.map((f) => ({ fuente: f.fuente ?? f.origen ?? 'rendimiento_historico', obra: f.obra_id, desde: f.fecha_desde, cantidad: Number(f.cantidad), hh: Number(f.hh_reales) })),
    reglaAnterior: registro.reglas?.[`rendimiento.${k}`] ?? null,
    fecha: new Date().toISOString().slice(0, 10),
  })

  // La regresión: cada medición histórica es un caso, y la regla candidata tiene que reproducirla.
  // Con UNA sola medición la regresión corre pero no prueba nada — y eso lo dice `corrio` + madurez.
  const reg = regresion({
    casos: g.filas.map((f, i) => ({ id: `${k}#${i + 1}${f.obra_id ? ` (${f.obra_id})` : ''}`, entrada: Number(f.cantidad), esperado: f.hsU })),
    aplicar: (regla) => (regla && typeof regla === 'object' ? regla.valor : regla),
    reglaAnterior: registro.reglas?.[`rendimiento.${k}`]?.valor ?? null,
    reglaCandidata: c.reglaCandidata,
  })
  const d = decidirPromocion({ candidato: c, regresion: reg, exigeMadurez: MADUREZ.D })

  console.log(`  ${d.promover ? '✔' : '✗'} ${k} · ${g.nombre ?? ''}`)
  console.log(`      ${c.estadistica.n} medición(es) en ${c.obrasDistintas} obra(s) · media ${c.estadistica.media} ${c.unidad} · dispersión ${c.estadistica.dispersion ?? '—'} · madurez ${c.madurez}`)
  console.log(`      regresión: ${reg.casos} caso(s) · mejoran ${reg.mejoran} · empeoran ${reg.empeoran} · corrió ${reg.corrio}`)
  console.log(`      ${d.porQue}`)
  if (d.promover && persistir) { const r = promover({ registro, candidato: c, decision: d, cuando: new Date().toISOString().slice(0, 10) }); registro = r.registro; promovidas += 1 }
  else if (d.promover) promovidas += 1
}

if (sinTarea.length) {
  console.log(`\n  ── las ${sinTarea.length} mediciones sin tarea ──`)
  for (const f of sinTarea.slice(0, 12)) console.log(`     ${String(f.unidad_medida ?? '?').padEnd(10)} ${String(f.cantidad).padStart(8)} → ${String(f.hh_reales).padStart(8)} HH  (${(f.hsU).toFixed(3)} h/u)  ${String(f.condiciones ?? '').slice(0, 70)}`)
  console.log(`     ⇒ asignarles la tarea de Base Maestra que corresponde es lo que las vuelve utilizables.`)
}

console.log(`\n  ${promovidas} regla(s) pasan el gate${persistir ? ' y quedaron persistidas' : ' (correr con --promover para persistirlas)'}.`)
if (!promovidas) {
  console.log('  NO ES UN ERROR: es lo que dice la evidencia. Una obra no hace una regla, y hoy no hay')
  console.log('  ninguna tarea con mediciones en cinco obras distintas. El cuello es la CAPTURA, no el código.')
}
if (persistir && promovidas) { fs.mkdirSync(path.dirname(RUTA), { recursive: true }); fs.writeFileSync(RUTA, `${JSON.stringify(registro, null, 1)}\n`) }
