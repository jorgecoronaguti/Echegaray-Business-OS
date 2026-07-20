// ESTADO DE LA EMPRESA — la capacidad del área Gestión General, la última de las 8.
//
// Responde "¿cómo venimos?" con números reales, no con una sensación. Es COMPOSICIÓN, no cálculo:
// cada número sale de la fuente única que ya lo define (obligacion_resumen, obra_panel,
// comprobante_sin_registrar, cobranzas). Acá no se recalcula NADA — si un número difiere del que da
// otra pantalla, es un bug de arquitectura, no una diferencia a explicar.
//
// Criterio de diseño: un semáforo que no dice qué hacer es decoración. Cada indicador declara su
// lectura y, cuando está en rojo, la palanca concreta.

/** Clasifica un indicador. PURA. `mejorEsMenor` invierte el sentido del umbral. */
export function semaforo(valor, { verde, rojo, mejorEsMenor = false }) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return 'sin_dato'
  if (mejorEsMenor) return valor <= verde ? 'verde' : valor >= rojo ? 'rojo' : 'amarillo'
  return valor >= verde ? 'verde' : valor <= rojo ? 'rojo' : 'amarillo'
}

const $ = (v) => `$${Math.round(Number(v) || 0).toLocaleString('es-AR')}`

/**
 * NÚCLEO PURO: arma el estado a partir de números ya leídos.
 * @param {object} d caja_disponible, obligaciones_saldo, obligaciones_vencido, cobranzas_vencidas,
 *                   obras_activas, costo_obras_activas, gasto_sin_imputar, obras_sin_contratado
 */
export function componerEstado(d = {}) {
  const ind = []
  const push = (area, nombre, valor, estado, lectura, palanca = null) =>
    ind.push({ area, nombre, valor, estado, lectura, palanca })

  // ---- CAJA: la palanca #1. Cobertura = caja disponible sobre lo vencido + lo que ya se debe.
  const exigible = (Number(d.obligaciones_vencido) || 0) + (Number(d.cobranzas_vencidas) || 0)
  if (d.caja_disponible !== null && d.caja_disponible !== undefined) {
    const cobertura = exigible > 0 ? Number(d.caja_disponible) / exigible : null
    // El indicador NO es el monto de caja: es la COBERTURA de lo ya vencido. Tener $10M suena bien
    // hasta que lo vencido son $40M. Sin exigible, alcanza con que la caja no esté en rojo.
    push('Finanzas', 'Caja disponible', Number(d.caja_disponible),
      cobertura === null
        ? semaforo(Number(d.caja_disponible), { verde: 1, rojo: 0 })
        : semaforo(cobertura, { verde: 1, rojo: 0.7 }),
      cobertura === null
        ? `${$(d.caja_disponible)} disponibles, sin exigible vencido.`
        : `${$(d.caja_disponible)} disponibles contra ${$(exigible)} exigible vencido (cobertura ${cobertura.toFixed(1)}×).`,
      cobertura !== null && cobertura < 1 ? 'La caja no cubre lo ya vencido: priorizar cobranza antes que cualquier pago nuevo.' : null)
  } else {
    push('Finanzas', 'Caja disponible', null, 'sin_dato', 'No hay posición de caja calculable.')
  }

  // ---- DEUDA vencida
  const venc = Number(d.obligaciones_vencido) || 0
  push('Finanzas', 'Obligaciones vencidas', venc,
    semaforo(venc, { verde: 0, rojo: 1, mejorEsMenor: true }),
    venc > 0 ? `${$(venc)} vencidos e impagos, sobre un saldo total de ${$(d.obligaciones_saldo)}.` : `Sin obligaciones vencidas (saldo total ${$(d.obligaciones_saldo)}).`,
    venc > 0 ? 'Cada día sin decisión sobre una deuda vencida es riesgo de corte de crédito del proveedor.' : null)

  // ---- COBRANZA vencida
  const cob = Number(d.cobranzas_vencidas) || 0
  push('Comercial', 'Cobranzas vencidas', cob,
    semaforo(cob, { verde: 0, rojo: 1, mejorEsMenor: true }),
    cob > 0 ? `${$(cob)} facturados y no cobrados pasada la fecha esperada.` : 'Sin cobranzas vencidas.',
    cob > 0 ? 'Plata ya ganada que no entró: asignar responsable de reclamo con fecha.' : null)

  // ---- OBRAS en ejecución
  const n = Number(d.obras_activas) || 0
  push('Obras', 'Obras activas', n,
    semaforo(n, { verde: 1, rojo: 0 }),
    n ? `${n} obra(s) en ejecución, ${$(d.costo_obras_activas)} de costo real acumulado.` : 'Ninguna obra activa.',
    n === 0 ? 'Sin obra en ejecución no hay producción: el cuello de botella es comercial.' : null)

  // ---- CONFIABILIDAD del dato: gasto real que no está imputado a ninguna obra
  const sinImputar = Number(d.gasto_sin_imputar) || 0
  push('Administración', 'Gasto sin imputar a obra', sinImputar,
    semaforo(sinImputar, { verde: 0, rojo: 1, mejorEsMenor: true }),
    sinImputar > 0
      ? `${$(sinImputar)} registrados en ARCA que no están en la pestaña Compras.`
      : 'Todo el gasto de ARCA está imputado.',
    sinImputar > 0 ? 'Mientras ese gasto no tenga obra, el margen por obra que muestra el OS está sobreestimado.' : null)

  // ---- MARGEN: sólo se habla si hay con qué. Un margen sin contratado es una fantasía.
  if (Number(d.obras_sin_contratado) > 0) {
    push('Dirección', 'Margen por obra', null, 'sin_dato',
      `${d.obras_sin_contratado} de ${n} obra(s) activa(s) no tienen monto contratado cargado: no se puede calcular margen.`,
      'Cargar el contratado de cada obra activa es lo que desbloquea toda la lectura económica.')
  }

  const cuenta = (e) => ind.filter((i) => i.estado === e).length
  return {
    indicadores: ind,
    resumen: { rojo: cuenta('rojo'), amarillo: cuenta('amarillo'), verde: cuenta('verde'), sin_dato: cuenta('sin_dato') },
    // La restricción principal: el primer rojo por orden de palanca económica (caja manda).
    cuello_de_botella: ind.find((i) => i.estado === 'rojo' && i.palanca)?.nombre ?? null,
  }
}

/** Texto para el chat. PURO. */
export function formatEstado(r) {
  if (!r) return 'sin datos'
  const icono = { verde: '🟢', amarillo: '🟡', rojo: '🔴', sin_dato: '⚪' }
  const L = [`ESTADO DE LA EMPRESA — ${r.resumen.rojo} en rojo, ${r.resumen.amarillo} en amarillo, ${r.resumen.verde} en verde, ${r.resumen.sin_dato} sin dato`]
  for (const i of r.indicadores) {
    L.push(`\n${icono[i.estado]} [${i.area}] ${i.nombre}`)
    L.push(`   ${i.lectura}`)
    if (i.palanca) L.push(`   → ${i.palanca}`)
  }
  if (r.cuello_de_botella) L.push(`\nRESTRICCIÓN PRINCIPAL HOY: ${r.cuello_de_botella}`)
  return L.join('\n')
}

/** Lee las fuentes únicas y compone. No recalcula ninguna de ellas. */
export async function estadoEmpresa({ cajaDisponible } = {}) {
  const { query } = await import('./db.mjs')
  const uno = async (sql, def = null) => { try { return (await query(sql)).rows[0] ?? def } catch { return def } }

  const obl = await uno(`select coalesce(sum(saldo_pendiente),0) saldo,
      coalesce(sum(saldo_pendiente) filter (where fecha_vencimiento < now()),0) vencido
      from public.obligacion_resumen`, { saldo: 0, vencido: 0 })
  const cob = await uno(`select coalesce(sum(total_bruto),0) v from public.cobranzas
      where estado not in ('Cobrado','Efectivo') and fecha_cobro < now()`, { v: 0 })
  const obras = await uno(`select count(*) filter (where estado='activa') activas,
      coalesce(sum(costo_real) filter (where estado='activa'),0) costo,
      count(*) filter (where estado='activa' and monto_contratado is null) sin_contratado
      from public.obra_panel`, { activas: 0, costo: 0, sin_contratado: 0 })
  const sinImp = await uno('select coalesce(sum(imp_total),0) m from public.comprobante_sin_registrar', { m: 0 })
  // CAJA: NO se recalcula acá. La posición de caja tiene UNA fuente (el ledger de saldos del Flujo
  // de Caja, vía cashBriefing) y sumar movimientos_caja daba $0 — un rojo FALSO que hacía aparecer
  // a la caja como la restricción principal cuando el número ni siquiera existía. Si el llamador no
  // la trae, se declara sin dato: mejor un hueco honesto que un semáforo mentiroso.
  const caja_disponible = typeof cajaDisponible === 'number' ? cajaDisponible : null

  return componerEstado({
    caja_disponible,
    obligaciones_saldo: Number(obl.saldo),
    obligaciones_vencido: Number(obl.vencido),
    cobranzas_vencidas: Number(cob.v),
    obras_activas: Number(obras.activas),
    costo_obras_activas: Number(obras.costo),
    obras_sin_contratado: Number(obras.sin_contratado),
    gasto_sin_imputar: Number(sinImp.m),
  })
}
