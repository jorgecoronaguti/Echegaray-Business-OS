#!/usr/bin/env node
// CONTROL DE OBRAS Fase 2 — Sincroniza el AVANCE FÍSICO real (tracker "Avances de Obra" en
// Drive) a public.avance_obra, para que la web lo muestre sin tocar Drive. Lee vía Service
// Account (0 API del modelo). Idempotente por obra (upsert). Honesto: las hojas sin % quedan
// estructurado=false con motivo, nunca inventa avance.
//   node orquestador/scripts/sync-avance-obra.mjs
import { avanceTodasLasObras, AVANCE_FILE_ID } from '../lib/avance-fisico.mjs'
import { registrarSincronizacion } from '../lib/registrar-sincronizacion.mjs'
import { query, closePool } from '../lib/db.mjs'

async function main() {
  const obras = await avanceTodasLasObras()
  let n = 0, conDato = 0
  for (const o of obras) {
    const detalle = Array.isArray(o.detalle) ? o.detalle.slice(0, 120) : []
    await query(
      `insert into public.avance_obra
         (obra, estructurado, motivo, actividades, completadas, avance_promedio, detalle, fuente, sincronizado_en)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,'avances_de_obra_drive', now())
       on conflict (obra) do update set
         estructurado=excluded.estructurado, motivo=excluded.motivo, actividades=excluded.actividades,
         completadas=excluded.completadas, avance_promedio=excluded.avance_promedio,
         detalle=excluded.detalle, sincronizado_en=now()`,
      [
        o.tab,
        !!o.estructurado,
        o.estructurado ? null : (o.motivo ?? null),
        o.actividades ?? 0,
        o.completadas ?? 0,
        o.estructurado ? (o.avancePromedio ?? null) : null,
        JSON.stringify(detalle),
      ],
    )
    n++; if (o.estructurado) conDato++
  }
  console.log(`sincronizadas ${n} obras (${conDato} con avance cargado)`)
  // Se leyó el archivo real de Avances de Obra: se registra para que la frescura no lo dé por
  // atrasado cuando el OS lo sincroniza. Mismo drive_file_id que la fila de fuentes_datos.
  const fr = await registrarSincronizacion({ query }, { driveFileId: AVANCE_FILE_ID })
  console.log(fr.ok ? `frescura: "${fr.nombre}" → ${fr.estado}` : `frescura no registrada: ${fr.motivo}`)
  await closePool()
}
main().catch((e) => { console.error('sync avance-obra falló:', e.message); process.exit(1) })
