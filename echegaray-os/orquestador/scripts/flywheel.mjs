#!/usr/bin/env node
// ¿EL VOLANTE GIRA? — cuántos ejemplos de corrección humana junta el OS, y a qué ritmo.
//
//   node orquestador/scripts/flywheel.mjs [--semanas 8]
//
// ═══ POR QUÉ ESTE NÚMERO Y NO «TENEMOS EL VOLANTE CONSTRUIDO» ═══
//
// Un volante construido y con cero ejemplos no es un volante: es una tabla. La única cifra que
// dice si el aprendizaje existe es cuántos pares (entrada → corrección humana) entran por semana,
// porque de ahí sale —o no sale— el dataset de un fine-tune.
//
// Se informan TRES cosas y ninguna sola alcanza:
//
//   CAPTURADOS   los ejemplos que ya están guardados
//   CORREGIBLES  lo que está esperando que una persona lo mire (el techo del ritmo)
//   RITMO        ejemplos por semana — el número que tiene que subir
//
// Si CORREGIBLES es alto y CAPTURADOS es cero, el problema no es el volante: es que nadie está
// mirando la cola. Son diagnósticos opuestos y confundirlos manda a arreglar lo que no está roto.

import { query } from '../lib/db.mjs'

const semanas = Number(process.argv[process.argv.indexOf('--semanas') + 1]) || 8

async function seguro(sql, args = []) {
  try { return (await query(sql, args)).rows } catch (e) { return { error: String(e?.message ?? e).slice(0, 120) } }
}

const main = async () => {
  console.log(`\n═══ EL VOLANTE · últimas ${semanas} semanas ═══\n`)

  const capturados = await seguro(
    `select tarea, count(*)::int n,
            count(*) filter (where acerto is false)::int correcciones,
            count(*) filter (where acerto is true)::int confirmaciones,
            count(*) filter (where acerto is null)::int sin_propuesta,
            max(ts) ultimo
       from orq.llm_ejemplo where ts > now() - ($1 || ' weeks')::interval group by 1 order by n desc`,
    [String(semanas)])

  if (capturados.error) {
    console.log(`  CAPTURADOS: la tabla orq.llm_ejemplo todavía no existe en esta base.`)
    console.log(`              (${capturados.error})`)
    console.log('              La captura está cableada y falla abierta: la corrección se aplica igual.')
  } else if (!capturados.length) {
    console.log('  CAPTURADOS: 0. El volante está construido y NO gira.')
  } else {
    console.table(capturados)
    const total = capturados.reduce((a, f) => a + f.n, 0)
    console.log(`\n  RITMO: ${(total / semanas).toFixed(1)} ejemplos por semana`)
  }

  // ── EL TECHO: lo que ya está esperando a una persona ──
  console.log('\n── CORREGIBLES (lo que espera que alguien lo mire) ──')
  const cola = await seguro(
    `select estado, count(*)::int n from public.ml_resolucion
      where corregido_en is null group by 1 order by n desc`)
  if (cola.error) console.log(`  no se pudo leer: ${cola.error}`)
  else console.table(cola)

  const hechas = await seguro(
    `select count(*)::int n, min(corregido_en) primera, max(corregido_en) ultima
       from public.ml_resolucion where corregido_en is not null`)
  if (!hechas.error) {
    const h = hechas[0]
    console.log(`  correcciones humanas registradas hasta hoy: ${h.n}${h.n ? ` (de ${h.primera?.toISOString?.().slice(0, 10)} a ${h.ultima?.toISOString?.().slice(0, 10)})` : ''}`)
  }
  process.exit(0)
}

main().catch((e) => { console.error('flywheel: falló —', e?.message ?? e); process.exit(1) })
