// MARCA EL RUBRO «SUBCONTRATISTA» QUE CONFIRMÓ EL DUEÑO (14/09/2026). DRY POR DEFECTO.
//
//   node orquestador/scripts/proveedores-subcontratistas-dry.mjs            → muestra el plan, no escribe
//   node orquestador/scripts/proveedores-subcontratistas-dry.mjs --aplicar  → escribe, en una transacción
//
// El plan lo arma `planDeRubroSubcontratista` (puro, con tests). Con --aplicar actualiza rubro y firma de los
// que existen, crea al que falta y RELEE cada fila: la evidencia es el dato en la tabla, no el UPDATE.

import { query, withTx, closePool } from '../lib/db.mjs'
import { planDeRubroSubcontratista } from '../lib/rubro-subcontratista.mjs'

const APLICAR = process.argv.includes('--aplicar')

async function aplicar(plan) {
  await withTx(async (c) => {
    for (const p of plan) {
      if (p.accion === 'actualizar') {
        await c.query(`update public.proveedores set rubro = $2, rubro_declarado_por = $3, rubro_declarado_en = now()
                        where id = $1`, [p.id, p.despues.rubro, p.despues.rubro_declarado_por])
      } else if (p.accion === 'crear') {
        await c.query(`insert into public.proveedores (nombre, rubro, rubro_declarado_por, rubro_declarado_en, activo, es_prueba)
                       values ($1, $2, $3, now(), true, false)`, [p.nombre, p.despues.rubro, p.despues.rubro_declarado_por])
      }
    }
  })
  const leidas = (await query(`select nombre, rubro, rubro_declarado_por from public.proveedores
                                where rubro_declarado_por = 'dueño 14/09/2026' order by nombre`)).rows
  console.log('[aplicado] releído de la tabla:', JSON.stringify(leidas))
}

async function main() {
  const proveedores = (await query('select id, nombre, razon_social, rubro, rubro_declarado_por, es_prueba from public.proveedores')).rows
  const plan = planDeRubroSubcontratista(proveedores)
  console.log(`[${APLICAR ? 'aplicar' : 'dry'}] rubro Subcontratista, firma «dueño 14/09/2026»`)
  for (const p of plan) {
    const antes = p.antes ? `${p.antes.rubro ?? '∅'} / ${p.antes.rubro_declarado_por ?? '∅'}` : 'no existe'
    console.log(`  ${p.accion.padEnd(11)} ${p.nombre}${p.proveedor && p.proveedor !== p.nombre ? ` (${p.proveedor})` : ''}: ${antes} → Subcontratista / dueño 14/09/2026`)
  }
  if (APLICAR) await aplicar(plan)
  else console.log('[dry] no se escribió nada. FEMENIA queda afuera por decisión del dueño.')
  await closePool()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (e) => { console.error(e); await closePool(); process.exit(1) })
}
