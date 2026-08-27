#!/usr/bin/env node
// LE PONE TIPO DE TAREA A LA EXPERIENCIA HISTÓRICA — para que se pueda volver a usar.
//
//   node orquestador/scripts/xsas-clasificar-actividades.mjs            muestra qué haría, no escribe
//   node orquestador/scripts/xsas-clasificar-actividades.mjs --aplicar  asigna
//   ... --sin-modelo                                                    sólo lo determinístico
//
// El grueso lo resuelve SQL: similitud de nombres contra el catálogo de la Base Maestra. Al modelo
// va únicamente la zona gris —lo que tiene señal pero no certeza—, en UNA llamada con todos los
// casos juntos, y su decisión entra marcada como CANDIDATO. Nunca convierte una inferencia en dato
// maestro sin decir que lo es.

import { query, closePool } from '../lib/db.mjs'
import { pedirTexto } from '../lib/ia/cliente.mjs'
import { CAPACIDAD } from '../lib/ia/capacidad.mjs'
import { veredictoDe, decisionDelModelo, UMBRAL } from '../lib/clasificar-actividades.mjs'

const APLICAR = process.argv.includes('--aplicar')
const SIN_MODELO = process.argv.includes('--sin-modelo')

/** Las actividades sin clasificar, cada una con sus candidatas. Una sola consulta. */
async function candidatas() {
  const { rows } = await query(`
    with a as (
      select a.id, a.nombre, a.unidad, a.obra_id
        from public.obra_actividad a
       where a.tarea_tipo_id is null and a.archivada is not true and a.obra_id <> 'prueba-e2e'),
    c as (
      select a.id, a.nombre, a.unidad, a.obra_id,
             t.id tid, t.nombre tnombre, t.unidad tunidad,
             similarity(upper(a.nombre), upper(t.nombre)) s,
             row_number() over (partition by a.id order by similarity(upper(a.nombre), upper(t.nombre)) desc, t.codigo) rn
        from a join public.tarea_tipo t on t.activo is not false
       where similarity(upper(a.nombre), upper(t.nombre)) >= $1)
    select id, nombre, unidad, obra_id,
           jsonb_agg(jsonb_build_object('tareaTipoId', tid, 'nombre', tnombre, 'unidad', tunidad, 'similitud', s)
                     order by s desc) filter (where rn <= 6) candidatas
      from c group by id, nombre, unidad, obra_id`, [UMBRAL.MIRAR])
  return rows
}

/** Las que ni siquiera tienen una candidata por encima del piso: se cuentan, no se consultan. */
async function sinNingunaCandidata() {
  const { rows } = await query(`
    select count(*)::int n from public.obra_actividad a
     where a.tarea_tipo_id is null and a.archivada is not true and a.obra_id <> 'prueba-e2e'
       and not exists (select 1 from public.tarea_tipo t
                        where t.activo is not false and similarity(upper(a.nombre), upper(t.nombre)) >= $1)`,
  [UMBRAL.MIRAR])
  return rows[0].n
}

async function preguntarAlModelo(grises) {
  const lista = grises.map((g, i) => {
    const cs = g.decision.candidatas.map((c) => `      ${c.tareaTipoId} · ${c.nombre} [${c.unidad ?? '?'}] (${c.similitud.toFixed(2)})`).join('\n')
    return `${i + 1}. ACTIVIDAD: "${g.nombre}"${g.unidad ? ` [${g.unidad}]` : ''}\n    candidatas:\n${cs}`
  }).join('\n')

  const sistema = [
    'Clasificás actividades de obra de una constructora de San Juan, Argentina, contra el catálogo de tareas de su Base Maestra.',
    'Para cada actividad elegís UNA de las candidatas que se te dan, o "ninguna".',
    'REGLA DURA: elegís sólo si la actividad ES esa tarea, no si "se parece". Un nombre parecido con un trabajo distinto es "ninguna".',
    'Si la actividad es más específica o más general que la candidata y no son la misma unidad de trabajo, es "ninguna".',
    '"ninguna" es una respuesta correcta y esperada: una actividad sin clasificar no hace daño, una mal clasificada contamina el rendimiento de esa tarea y después una cotización.',
    'Además de elegir, declarás la certeza: "misma_tarea" si la actividad ES esa tarea del catálogo, o "parecida" si sólo se le parece, es una parte de ella, o es más amplia. SÓLO se acepta "misma_tarea": "parecida" equivale a no clasificar.',
    'Respondés SÓLO un array JSON: [{"n":1,"tarea_tipo_id":"<uuid o ninguna>","certeza":"misma_tarea|parecida","motivo":"<una línea>"}]. Sin texto alrededor.',
  ].join(' ')

  const r = await pedirTexto({
    capacidad: CAPACIDAD.NORMAL,
    sistema,
    mensajes: [{ role: 'user', content: lista }],
    maxTokens: 4096,
    agente: 'xsas',
    funcion: 'clasificar-actividades',
  })
  const m = String(r.texto).match(/\[[\s\S]*\]/)
  if (!m) throw new Error('el modelo no devolvió un array JSON')
  return JSON.parse(m[0])
}

async function main() {
  const filas = await candidatas()
  const sinCandidata = await sinNingunaCandidata()

  const resueltas = []
  const grises = []
  for (const f of filas) {
    const cs = (f.candidatas ?? []).map((c) => ({ ...c, similitud: Number(c.similitud) }))
    const d = veredictoDe({ nombre: f.nombre, unidad: f.unidad }, cs)
    if (d.veredicto === 'ZONA GRIS') grises.push({ ...f, decision: d })
    else resueltas.push({ ...f, decision: d })
  }

  if (grises.length && !SIN_MODELO) {
    console.log(`[modelo] ${grises.length} casos en zona gris — una sola llamada`)
    let respuestas = []
    try { respuestas = await preguntarAlModelo(grises) } catch (e) {
      console.log(`[modelo] no se pudo consultar (${String(e.message).slice(0, 80)}): la zona gris queda sin clasificar`)
    }
    for (const [i, g] of grises.entries()) {
      const r = respuestas.find((x) => Number(x.n) === i + 1)
      resueltas.push({ ...g, decision: r ? decisionDelModelo(r, g.decision.candidatas) : { veredicto: 'SIN MATCH', porQue: 'el modelo no contestó por este caso' } })
    }
  } else {
    for (const g of grises) resueltas.push({ ...g, decision: { veredicto: 'AMBIGUO', porQue: g.decision.porQue } })
  }

  const porVeredicto = {}
  for (const r of resueltas) porVeredicto[r.decision.veredicto] = (porVeredicto[r.decision.veredicto] ?? 0) + 1

  // SE ASIGNA lo que decidió una regla; se PROPONE lo que decidió el modelo. La diferencia no es de
  // calidad del modelo: es que una regla se puede leer y auditar, y una inferencia hay que aceptarla.
  const aAsignar = resueltas.filter((r) => r.decision.tareaTipoId && r.decision.origen !== 'modelo')
  const aProponer = resueltas.filter((r) => r.decision.tareaTipoId && r.decision.origen === 'modelo')
  if (APLICAR) {
    for (const r of aProponer) {
      await query(
        `update public.obra_actividad
            set propuesta_tarea_tipo_id = $2, propuesta_evidencia = $3, propuesta_en = now()
          where id = $1 and tarea_tipo_id is null`,
        [r.id, r.decision.tareaTipoId, JSON.stringify({ ...r.decision.evidencia, por_que: r.decision.porQue })])
    }
    for (const r of aAsignar) {
      // SÓLO estas cuatro columnas. Ni el nombre, ni el avance, ni las HH, ni las fechas.
      await query(
        `update public.obra_actividad
            set tarea_tipo_id = $2, tarea_tipo_origen = $3, tarea_tipo_confianza = $4,
                tarea_tipo_evidencia = $5, tarea_tipo_asignado_en = now()
          where id = $1 and tarea_tipo_id is null`,
        [r.id, r.decision.tareaTipoId, r.decision.origen, r.decision.confianza,
          JSON.stringify({ ...r.decision.evidencia, por_que: r.decision.porQue })])
    }
  }

  console.log(`\nCLASIFICACIÓN DE ACTIVIDADES${APLICAR ? '' : ' (ENSAYO — no escribe)'}\n`)
  console.log(`  ${filas.length + sinCandidata} actividades sin clasificar`)
  console.log(`  ${sinCandidata} sin ninguna candidata por encima de ${UMBRAL.MIRAR} de similitud`)
  for (const [v, n] of Object.entries(porVeredicto).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)} ${v}`)
  console.log(`\n  ${aAsignar.length} ${APLICAR ? 'ASIGNADAS' : 'se asignarían'} (por regla):`)
  for (const r of aAsignar) {
    console.log(`     [${r.decision.confianza}] ${r.nombre}  →  ${r.decision.evidencia?.candidata ?? '?'}`)
    console.log(`               ${r.decision.porQue}`)
  }
  console.log(`\n  ${aProponer.length} ${APLICAR ? 'PROPUESTAS' : 'se propondrían'} (las decidió el modelo; las acepta una persona):`)
  for (const r of aProponer) {
    console.log(`     ${r.nombre}  →  ${r.decision.evidencia?.candidata ?? '?'}   · ${r.decision.porQue}`)
  }
  console.log()
  return 0
}

const codigo = await main().catch((e) => { console.error('✖', e?.message ?? e); return 1 })
await closePool()
process.exit(codigo)
