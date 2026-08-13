#!/usr/bin/env node
// SYNC del COMPARADOR DE FINANCIAMIENTO → public.finanzas_comparar_financiamiento.
//
// POR QUÉ (25/07). El motor compara TODAS las alternativas de financiamiento y elige la más barata
// factible (orquestador/lib/ingenieria-financiera.mjs · compararFinanciamiento). Es un calculador que
// necesita un escenario (monto + días). Para poder MOSTRARLO en la Web con datos reales, el sync deriva
// el escenario de la posición del día: el pico de descubierto que proyecta el calendario y por cuántos
// días la caja queda en rojo. Corre el motor con ese escenario y las tasas reales de la fuente única de
// condiciones (auto-carga, exactamente como el tool finanzas.comparar_financiamiento), y materializa el
// resultado. 0 recálculo en la Web: sólo pinta la alternativa que el motor eligió. El escenario queda
// guardado para que sea transparente de dónde salió el monto y los días. Lo que no tiene tasa se
// declara en faltan_datos; nunca se inventa.
//
// No necesita Google: el escenario sale del calendario ya materializado y las tasas de Supabase.
// Idempotente: upsert de la fila singleton id=1.
//
//   node orquestador/scripts/sync-comparar-financiamiento.mjs
import { query, closePool } from '../lib/db.mjs'
import { compararFinanciamiento } from '../lib/ingenieria-financiera.mjs'
import { condicionesVigentes, paramsParaMotor, costoEfectivo, advertenciaDeComparabilidad } from '../lib/condiciones-financieras.mjs'

const round = (n) => Math.round(Number(n) || 0)

/** Deriva un escenario REAL de financiamiento de la trayectoria del calendario y del modelo. */
function escenarioDesdeCalendario(payload) {
  const dias = payload?.dias || []
  const modelo = payload?.modelo || {}
  // El pico de descubierto proyectado: cuánto necesita la empresa de la línea en el peor día.
  const picoDescubierto = dias.reduce((max, d) => Math.max(max, round(d.descubierto_utilizado)), 0)
  const diasEnRojo = dias.filter((d) => round(d.descubierto_utilizado) > 0).length

  const caja = modelo.disponible?.estado === 'ok' ? round(modelo.disponible.caja_hoy) : null
  const lineaDisp = modelo.lineas?.descubierto?.disponible_aprox
  const cajaLibre = caja != null && caja > 0 ? caja : (caja === 0 ? 0 : null)

  if (picoDescubierto > 0) {
    return {
      monto: picoDescubierto,
      dias: Math.max(1, diasEnRojo),
      cajaLibre,
      limiteDescubiertoDisp: lineaDisp == null ? undefined : round(lineaDisp),
      origen: `pico de descubierto proyectado en el calendario (${diasEnRojo} día/s en rojo de ${dias.length})`,
    }
  }

  // Sin bache proyectado: si igual los vencimientos de 7 días superan la caja, ése es el escenario.
  const d = modelo.disponible
  if (d?.estado === 'ok' && d.vencimientos_7dias > d.caja_hoy) {
    const falta = round(d.vencimientos_7dias - d.caja_hoy)
    return {
      monto: falta, dias: 7, cajaLibre,
      limiteDescubiertoDisp: lineaDisp == null ? undefined : round(lineaDisp),
      origen: 'los vencimientos de 7 días superan la caja (bache de la semana)',
    }
  }
  return null
}

async function main() {
  const { rows } = await query(
    'select payload, generado_en from public.finanzas_calendario order by generado_en desc limit 1',
  )
  if (!rows.length) {
    console.log('comparar financiamiento: todavía no hay calendario materializado — no se actualiza el snapshot')
    return
  }
  const payload = rows[0].payload || {}
  const escenario = escenarioDesdeCalendario(payload)
  const calculadoEn = rows[0].generado_en || new Date().toISOString()

  let doc
  if (!escenario) {
    // No hay necesidad de financiamiento proyectada: la Web muestra "sin bache", no una comparación vacía.
    doc = {
      estado: 'sin_necesidad',
      nota: 'El calendario no proyecta un bache de caja ni un pico de descubierto: no hace falta financiamiento en el horizonte. Cuando aparezca una necesidad, esta comparación se llena sola.',
      generado_en: new Date().toISOString(),
    }
  } else {
    // MISMA lógica que el tool finanzas.comparar_financiamiento: las condiciones alimentan al motor y
    // el escenario (args) pisa lo cargado.
    let condiciones = []
    try { condiciones = await condicionesVigentes({}) } catch { condiciones = [] }
    const { params, faltan } = paramsParaMotor(condiciones)
    const args = { monto: escenario.monto, dias: escenario.dias }
    if (escenario.cajaLibre != null) args.cajaLibre = escenario.cajaLibre
    if (escenario.limiteDescubiertoDisp != null) args.limiteDescubiertoDisp = escenario.limiteDescubiertoDisp
    const merged = { ...params, ...args }
    const resultado = compararFinanciamiento(merged)
    const detalle = condiciones
      .filter((c) => ['descubierto', 'prestamo', 'descuento_cheque', 'tarjeta'].includes(c.tipo_financiacion))
      .map((c) => costoEfectivo(c, { monto: escenario.monto, dias: escenario.dias }))
    doc = {
      estado: 'ok',
      escenario: { monto: escenario.monto, dias: escenario.dias, origen: escenario.origen },
      ...resultado,
      condiciones: detalle,
      faltan_datos: faltan,
      // Igual que el tool: la Web tiene que poder decir cuáles de esos costos son un PISO.
      comparabilidad: advertenciaDeComparabilidad(detalle),
      generado_en: new Date().toISOString(),
    }
  }

  await query(
    `insert into public.finanzas_comparar_financiamiento (id, comparacion, calculado_en, actualizado_en)
     values (1, $1::jsonb, $2, now())
     on conflict (id) do update set
       comparacion = excluded.comparacion,
       calculado_en = excluded.calculado_en,
       actualizado_en = now()`,
    [JSON.stringify(doc), calculadoEn],
  )

  if (doc.estado === 'ok') {
    const rec = doc.recomendada?.nombre || 'sin recomendación'
    console.log(`✓ comparar financiamiento materializado · escenario $${doc.escenario.monto.toLocaleString('es-AR')} a ${doc.escenario.dias} día/s · recomendada: ${rec} · ${doc.faltan_datos?.length || 0} sin tasa`)
  } else {
    console.log('✓ comparar financiamiento: sin necesidad de financiamiento proyectada')
  }
}

main().then(() => closePool()).catch(async (e) => { console.error('sync-comparar-financiamiento falló:', e?.message ?? e); await closePool(); process.exit(1) })
