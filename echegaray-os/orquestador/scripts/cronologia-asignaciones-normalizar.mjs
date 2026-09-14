#!/usr/bin/env node
// NORMALIZAR LA CRONOLOGÍA GUARDADA EN `obra_asignacion` — una sola línea de tiempo por persona.
//
// Las reglas: `lib/cronologia-asignaciones.mjs`. Cómo se aplican a lo existente: `lib/cronologia-normalizar.mjs`.
//
// EL DEFECTO ES NO ESCRIBIR. Sin `--aplicar` lee y muestra el plan. Con `--aplicar`: respaldo JSON de
// la tabla entera, una transacción, y relectura — el plan recalculado sobre la base escrita tiene que
// dar cero cambios; si no, sale con código 1. Filas de persona (app o dueño): sólo `hasta` y `notas`,
// y sólo si `hasta` sigue siendo el que se leyó (nadie la tocó entremedio).
//
//   node orquestador/scripts/cronologia-asignaciones-normalizar.mjs                  # plan completo
//   node orquestador/scripts/cronologia-asignaciones-normalizar.mjs --mes 2026-09    # sólo lo que toca ese mes
//   node orquestador/scripts/cronologia-asignaciones-normalizar.mjs --aplicar
import { mkdirSync, writeFileSync } from 'node:fs'
import { query, withTx, closePool } from '../lib/db.mjs'
import { superposiciones } from '../lib/cronologia-asignaciones.mjs'
import { SQL, planDeNormalizacion } from '../lib/cronologia-normalizar.mjs'

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] ?? null : null }
const APLICAR = process.argv.includes('--aplicar')
const MES = arg('mes')
if (MES && !/^\d{4}-\d{2}$/.test(MES)) throw new Error(`--mes tiene que ser YYYY-MM, no «${MES}»`)
const HOY = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)
const FECHA = `${HOY.slice(8, 10)}/${HOY.slice(5, 7)}/${HOY.slice(0, 4)}`

const SQL_LEER = `select a.id, a.persona_id, p.nombre_completo as persona, a.obra_id, a.rol,
    to_char(a.desde, 'YYYY-MM-DD') as desde, to_char(a.hasta, 'YYYY-MM-DD') as hasta, a.notas, a.creado_en
  from public.obra_asignacion a left join public.personas p on p.id = a.persona_id
  where coalesce(p.es_prueba, false) = false`

const leer = async () => (await query(SQL_LEER)).rows
const t = (x) => (x ? `${x.desde ?? '—'}→${x.hasta ?? 'abierta'}` : '(no existe)')

/** Toca el mes: alguno de los dos tramos (antes o después) cubre algún día de ese mes. */
function tocaElMes(c) {
  if (!MES) return true
  const [ini, fin] = [`${MES}-01`, `${MES}-31`]
  return [c.antes, c.despues].some((x) => x && (x.desde ?? '') <= fin && (x.hasta ?? '9999') >= ini)
}

function imprimir(filas, plan) {
  const pares = superposiciones(filas)
  const cuenta = {}
  for (const p of pares) {
    const k = `${p.clase}${p.mismaObra ? ' misma obra' : ''}${p.unDia ? ' (día suelto)' : ''}`
    cuenta[k] = (cuenta[k] ?? 0) + 1
  }
  console.log(`obra_asignacion · ${filas.length} filas · pares superpuestos: ${JSON.stringify(cuenta)}`)
  const cambios = plan.cambios.filter(tocaElMes)
  console.log(`\nPLAN${MES ? ` (${MES})` : ''} · ${cambios.length} cambios de ${plan.cambios.length}`)
  for (const c of cambios.sort((a, b) => String(a.fila.persona).localeCompare(String(b.fila.persona)))) {
    console.log(`  ${String(c.fila.persona).padEnd(32)} ${c.tipo.padEnd(9)} ${String(c.fila.obra_id).padEnd(30)} ${t(c.antes).padEnd(24)} → ${t(c.despues).padEnd(24)} ${c.fila.id}`)
  }
  const dueno = plan.paraDueno.filter((p) => tocaElMes({ antes: p.fila, despues: p.contra }))
  console.log(`\nPARA EL DUEÑO · la regla lo pide y el orquestador no puede escribirlo en una fila de persona: ${dueno.length}`)
  for (const p of dueno) {
    console.log(`  ${String(p.fila.persona).padEnd(32)} ${p.tipo.padEnd(10)} ${p.fila.obra_id} ${t(p.fila)} (cargada ${String(p.fila.creado_en?.toISOString?.() ?? p.fila.creado_en).slice(0, 16)}) contra ${p.contra.obra_id} ${t(p.contra)} (cargada ${String(p.contra.creado_en?.toISOString?.() ?? p.contra.creado_en).slice(0, 16)}) · ${p.detalle}`)
  }
}

async function aplicar(filas, plan) {
  mkdirSync('orquestador/datos/respaldos', { recursive: true })
  const respaldo = `orquestador/datos/respaldos/obra-asignacion-cronologia-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '')}.json`
  writeFileSync(respaldo, JSON.stringify({ cuando: new Date().toISOString(), filas }, null, 1))
  console.log(`\nrespaldo: ${respaldo}`)
  return withTx(async (tx) => {
    for (const c of plan.cambios) {
      const f = c.fila
      const res = c.tipo === 'cerrar' ? await tx.query(SQL.cerrarDePersona, [f.id, c.despues.hasta, c.notas, c.antes.hasta])
        : c.tipo === 'recortar' ? await tx.query(SQL.recortarReconstruida, [f.id, c.despues.desde, c.despues.hasta, c.notas])
          : c.tipo === 'borrar' ? await tx.query(SQL.borrarReconstruida, [f.id])
            : await tx.query(SQL.insertarReconstruida, [f.persona_id, f.obra_id, c.despues.desde, c.despues.hasta, c.notas])
      // UNA SENTENCIA QUE NO AFECTÓ SU FILA DESHACE TODO: la base cambió desde la lectura, o la guarda
      // de la marca frenó algo que el plan creía reconstruido. Seguir escribiría un plan viejo.
      if (res.rowCount !== 1) throw new Error(`${c.tipo} ${f.id} afectó ${res.rowCount} filas: nada se escribió`)
    }
    return plan.cambios.length
  })
}

async function main() {
  const filas = await leer()
  const plan = planDeNormalizacion(filas, { fecha: FECHA })
  imprimir(filas, plan)
  if (!APLICAR) { console.log(`\nENSAYO: no se escribió nada. Con --aplicar se escriben ${plan.cambios.length} cambios.`); return }
  const n = await aplicar(filas, plan)
  const despues = await leer()
  const otra = planDeNormalizacion(despues, { fecha: FECHA })
  console.log(`\nescritos ${n} · releído: quedan ${otra.cambios.length} cambios (tiene que ser 0)`)
  if (otra.cambios.length) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 }).finally(() => closePool().catch(() => {}))
