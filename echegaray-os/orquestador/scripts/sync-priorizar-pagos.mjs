#!/usr/bin/env node
// SYNC de la PRIORIZACIÓN DE PAGOS → public.finanzas_priorizar_pagos.
//
// POR QUÉ (25/07). El motor ordena los pagos por prioridad real (vencimiento + costo de no pagar +
// criticidad del proveedor/obra + liquidez), NO por fecha, y reparte la caja: lo que no entra pasa a
// "esperar" (orquestador/lib/ingenieria-financiera.mjs · priorizarPagos). Para MOSTRARLO en la Web con
// datos reales, el sync toma la lista REAL de egresos que el calendario ya materializó (los próximos 30
// días), la caja real del modelo, corre el motor y guarda el orden con la decisión y el motivo. 0
// recálculo en la Web: sólo pinta el orden que el motor decidió.
//
// El mapeo movimiento→obligación es SÓLO dar forma a la entrada (proveedor/monto/días/criticidad); el
// SCORE y la decisión los pone el motor. No necesita Google: los egresos salen del calendario ya
// materializado. Idempotente: upsert de la fila singleton id=1.
//
//   node orquestador/scripts/sync-priorizar-pagos.mjs
import { query, closePool } from '../lib/db.mjs'
import { priorizarPagos } from '../lib/ingenieria-financiera.mjs'

const VENTANA_DIAS = 30
const round = (n) => Math.round(Number(n) || 0)

/** Da forma de obligación a un egreso del calendario, para priorizarPagos. Sólo entrada, sin score. */
function comoObligacion(mov, fecha, hoy) {
  const diasAVencer = Math.round((fecha.getTime() - hoy.getTime()) / 86400000)
  return {
    proveedor: mov.proveedor || mov.detalle || 'sin identificar',
    monto: Math.abs(round(mov.monto)),
    dias_a_vencer: mov.vencida ? -1 : diasAVencer,
    criticidad: mov.criticidad || (mov.obra ? 'obra' : undefined),
    obra: mov.obra || null,
    categoria: mov.categoria || null,
    medio: mov.medio || null,
    vencida: !!mov.vencida,
  }
}

async function main() {
  const { rows } = await query(
    'select payload, generado_en from public.finanzas_calendario order by generado_en desc limit 1',
  )
  if (!rows.length) {
    console.log('priorizar pagos: todavía no hay calendario materializado — no se actualiza el snapshot')
    return
  }
  const payload = rows[0].payload || {}
  const dias = payload.dias || []
  const modelo = payload.modelo || {}
  const calculadoEn = rows[0].generado_en || new Date().toISOString()

  const hoy = payload.desde ? new Date(payload.desde) : new Date()
  const limite = new Date(hoy.getTime() + VENTANA_DIAS * 86400000)

  // Egresos reales dentro de la ventana. La deuda vencida (traída al primer día) entra igual: es lo más
  // urgente de pagar.
  const obligaciones = []
  for (const d of dias) {
    const fecha = new Date(d.fecha)
    if (fecha > limite) continue
    for (const mov of d.movimientos || []) {
      if (mov.tipo !== 'egreso') continue
      if (Math.abs(round(mov.monto)) <= 0) continue
      obligaciones.push(comoObligacion(mov, fecha, hoy))
    }
  }

  const cajaDisponible = modelo.disponible?.estado === 'ok' ? round(modelo.disponible.caja_hoy) : null
  const pagos = priorizarPagos(obligaciones, cajaDisponible == null ? {} : { cajaDisponible })

  const totalPagar = pagos.filter((p) => p.decision === 'pagar').reduce((a, p) => a + p.monto, 0)
  const doc = {
    estado: obligaciones.length ? 'ok' : 'sin_pagos',
    ventana_dias: VENTANA_DIAS,
    caja_disponible: cajaDisponible,
    total: pagos.reduce((a, p) => a + p.monto, 0),
    total_a_pagar: totalPagar,
    pagos,
    nota: cajaDisponible == null
      ? 'Sin la caja del modelo, el orden es por prioridad pero no se reparte (todo queda "pagar"). Reconectar la caja para decidir qué espera.'
      : 'La caja se reparte por prioridad: lo que no entra pasa a "esperar".',
    generado_en: new Date().toISOString(),
  }

  await query(
    `insert into public.finanzas_priorizar_pagos (id, priorizacion, calculado_en, actualizado_en)
     values (1, $1::jsonb, $2, now())
     on conflict (id) do update set
       priorizacion = excluded.priorizacion,
       calculado_en = excluded.calculado_en,
       actualizado_en = now()`,
    [JSON.stringify(doc), calculadoEn],
  )

  console.log(`✓ priorizar pagos materializado · ${pagos.length} pagos · caja ${cajaDisponible == null ? 's/d' : '$' + cajaDisponible.toLocaleString('es-AR')} · a pagar $${round(totalPagar).toLocaleString('es-AR')}`)
}

main().then(() => closePool()).catch(async (e) => { console.error('sync-priorizar-pagos falló:', e?.message ?? e); await closePool(); process.exit(1) })
