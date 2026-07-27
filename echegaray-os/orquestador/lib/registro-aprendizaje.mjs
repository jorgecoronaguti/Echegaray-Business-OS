// LA CAJA NEGRA — registro append-only de lo que el motor financiero predijo.
//
// ═══ QUÉ ES (26/07 · F0, cimiento del aprendizaje) ═══
//
// Los cuatro syncs financieros (estrategia, plan de tesorería, modelo de liquidez, calendario) producen
// en cada corrida una FOTO y la materializan a una tabla singleton que se PISA. Nunca queda registro de
// "qué predijo el OS el día X". Sin ese histórico no hay forma de medir después si el forecast fue bueno
// (eso lo necesita F2). Esta capacidad congela cada foto en public.finanzas_caja_negra, append-only.
//
// ═══ LO QUE ESTE MÓDULO NO HACE ═══
//
// NO recalcula un solo peso. NO lee el Sheet. NO inventa un número. CONSUME la foto que el motor ya
// produjo (fuente única intacta) y extrae de ella las predicciones medibles. Lo que la foto no trae se
// guarda como valor NULL con estado 'sin_dato' — el hueco queda en la historia, nunca tapado.
//
// ═══ NÚCLEO PURO vs. BORDE CON I/O ═══
//
//   extraerPredicciones(fuente, foto, opts)  → PURO. De una foto saca la lista de predicciones. Sin BD,
//                                              sin fecha externa, determinista. Es lo que se testea.
//   registrarFoto(deps, args)                → BORDE. Toma la lista y la inserta append-only (on conflict
//                                              do nothing). Cada llamada mina un corrida_id nuevo si no
//                                              se le pasa uno; re-registrar la misma corrida no duplica.

import { randomUUID } from 'node:crypto'

export const FUENTES = Object.freeze(['estrategia', 'plan', 'modelo', 'calendario'])

// Un número o null — nunca NaN, nunca un string. Preserva el valor tal cual lo trajo la foto (redondeo
// y criterio son de la fuente; acá no se toca).
function num(v) {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Arma un registro de predicción. Si el valor es null y la unidad es numérica, el estado degrada a
// 'sin_dato': la foto no trajo la cifra y no se inventa. Un metric de texto (valor null pero detalle
// con contenido) queda 'ok' — su "valor" vive en detalle.
function pred({ clave, metrica, horizonte = null, fecha_objetivo = null, valor = null, unidad = 'pesos', detalle = null, estado }) {
  const est = estado || (unidad !== 'texto' && valor === null ? 'sin_dato' : 'ok')
  return { clave, metrica, horizonte, fecha_objetivo, valor, unidad, detalle, estado: est }
}

// ════════════════════════════════════════════════════════════════════════════
// NÚCLEO PURO — de cada foto, qué predicciones se extraen
// ════════════════════════════════════════════════════════════════════════════

/**
 * De una foto del motor saca la lista de predicciones a congelar. Determinista: misma foto → misma
 * lista, con claves ÚNICAS dentro de la corrida (idempotencia por corrida). No consulta la BD ni la
 * hora: todo sale de la foto.
 *
 * @param {'estrategia'|'plan'|'modelo'|'calendario'} fuente
 * @param {object} foto la salida cruda del motor (lo mismo que el sync materializa)
 * @param {object} [opts] {horizonte} etiqueta del horizonte pedido en la corrida (para el plan)
 * @returns {Array<object>} predicciones {clave, metrica, horizonte, fecha_objetivo, valor, unidad, estado, detalle}
 */
export function extraerPredicciones(fuente, foto, opts = {}) {
  if (!FUENTES.includes(fuente)) throw new Error(`fuente desconocida: ${fuente}`)
  // Sin foto: se registra el hecho de que no hubo predicción ese día (también es historia).
  if (foto === null || foto === undefined) {
    return [pred({ clave: `${fuente}:_foto`, metrica: '_foto', unidad: 'texto', estado: 'sin_foto', detalle: { motivo: 'el motor no devolvió foto' } })]
  }
  // Foto degradada por el propio contrato del motor ('sin dato' con espacio en estrategia; 'sin_dato'
  // en otros): se registra el gap entero, no un cuadro de ceros inventados.
  const estadoFoto = String(foto.estado || '').replace(' ', '_')
  if (estadoFoto === 'sin_dato') {
    return [pred({ clave: `${fuente}:_foto`, metrica: '_foto', unidad: 'texto', estado: 'sin_dato', detalle: { motivo: foto.motivo || 'foto sin dato' } })]
  }

  if (fuente === 'modelo') return extraerModelo(foto)
  if (fuente === 'plan') return extraerPlan(foto, opts.horizonte || null)
  if (fuente === 'estrategia') return extraerEstrategia(foto)
  if (fuente === 'calendario') return extraerCalendario(foto)
  return []
}

// MODELO ÚNICO DE LIQUIDEZ — posición de hoy + los baches a la vista. Cada bloque puede venir 'sin dato'
// (su fuente no respondió): en ese caso la métrica se congela con valor null y estado 'sin_dato'.
function extraerModelo(m) {
  const d = m.disponible || {}
  const o = m.comprometido || {}
  const c = m.deuda_comercial || {}
  const dOk = d.estado === 'ok'
  const oOk = o.estado === 'ok'
  const cOk = c.estado === 'ok'
  const mk = (metrica, valor, horizonte = null) => pred({ clave: `modelo:${metrica}`, metrica, valor, horizonte })
  return [
    mk('caja_hoy', dOk ? num(d.caja_hoy) : null),
    mk('colchon_total', num(m.colchon_total)),
    mk('vencimientos_7dias', dOk ? num(d.vencimientos_7dias) : null, 'dias_7'),
    mk('proyeccion_7dias', dOk ? num(d.proyeccion_7dias) : null, 'dias_7'),
    mk('cobranzas_vencidas', dOk ? num(d.cobranzas_vencidas) : null),
    mk('cobranzas_por_cobrar_mes', dOk ? num(d.cobranzas_por_cobrar_mes) : null, 'mes'),
    mk('comprometido_saldo', oOk ? num(o.saldo_total) : null),
    mk('comprometido_vencido', oOk ? num(o.vencido) : null),
    mk('deuda_comercial_vencida', cOk ? num(c.vencido) : null),
  ]
}

// PLAN DE TESORERÍA — la posición global y, por cada horizonte del plan, el saldo proyectado al final y
// el costo financiero esperado (las dos cifras que F2 puede contrastar contra la caja real de esa
// ventana). El horizonte pedido en la corrida etiqueta las métricas de posición.
function extraerPlan(p, horizonteCorrida) {
  const out = []
  const pos = p.posicion || {}
  const posOk = pos.estado !== 'sin dato' && pos.estado !== 'sin_dato'
  const mk = (metrica, valor) => pred({ clave: `plan:${metrica}`, metrica, valor, horizonte: horizonteCorrida })
  out.push(mk('colchon_total', posOk ? num(pos.colchon_total) : null))
  out.push(mk('vencido_fiscal', posOk ? num(pos.vencido_fiscal) : null))
  out.push(mk('vencido_comercial', posOk ? num(pos.vencido_comercial) : null))

  const horizontes = p.horizontes || {}
  // Orden estable de claves para que la extracción sea determinista independientemente del motor.
  for (const clave of Object.keys(horizontes).sort()) {
    const r = horizontes[clave]?.resumen || {}
    const mkH = (metrica, valor) => pred({ clave: `plan:${clave}:${metrica}`, metrica, valor, horizonte: clave })
    out.push(mkH('saldo_proyectado_final', num(r.saldo_proyectado_final)))
    out.push(mkH('costo_financiero_total', num(r.costo_financiero_total)))
    out.push(mkH('linea_maxima_usada', num(r.linea_maxima_usada)))
  }
  return out
}

// ESTRATEGIA FINANCIERA — mayormente cualitativa. Se congela lo medible (colchón diagnosticado, costo
// financiero esperado) y, como predicción categórica, la estrategia ELEGIDA: F2 podrá preguntar después
// si esa fue la jugada correcta. La elegida es texto → su "valor" vive en detalle, valor numérico null.
function extraerEstrategia(e) {
  const gob = e.horizonte_gobernante?.clave || null
  const diag = e.diagnostico_liquidez || {}
  const diagOk = diag.estado !== 'sin dato' && diag.estado !== 'sin_dato'
  return [
    pred({ clave: 'estrategia:colchon_total', metrica: 'colchon_total', horizonte: gob, valor: diagOk ? num(diag.colchon_total) : null }),
    pred({ clave: 'estrategia:costo_financiero_esperado', metrica: 'costo_financiero_esperado', horizonte: gob, valor: num(e.costo_financiero_esperado) }),
    pred({
      clave: 'estrategia:estrategia_elegida', metrica: 'estrategia_elegida', horizonte: gob, unidad: 'texto', valor: null,
      detalle: { elegida: e.eleccion?.elegida ?? null, confianza: e.nivel_confianza?.nivel ?? null },
    }),
  ]
}

// CALENDARIO FINANCIERO — la predicción más medible de todas: el saldo proyectado para CADA día futuro
// concreto (fecha_objetivo real). F2 lo contrasta contra el saldo bancario efectivo de ese día. No se
// re-extrae el modelo que el payload trae adentro: de eso se ocupa la fuente 'modelo' (una-fuente).
function extraerCalendario(cal) {
  const out = []
  out.push(pred({ clave: 'calendario:caja_inicial', metrica: 'caja_inicial', fecha_objetivo: cal.desde || null, valor: num(cal.caja_inicial) }))
  for (const d of cal.dias || []) {
    if (!d?.fecha) continue
    out.push(pred({
      clave: `calendario:saldo_final:${d.fecha}`, metrica: 'saldo_final_proyectado',
      fecha_objetivo: d.fecha, valor: num(d.saldo_final),
      detalle: { ingresos: num(d.ingresos), egresos: num(d.egresos), riesgo: d.riesgo ?? null },
    }))
  }
  return out
}

// ════════════════════════════════════════════════════════════════════════════
// BORDE CON I/O — congelar la foto en la caja negra (append-only)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Registra una foto del motor en la caja negra. Append-only: cada predicción se inserta con
 * `on conflict (corrida_id, clave) do nothing`, así re-correr la misma corrida no duplica y NUNCA pisa
 * una predicción anterior. Distintas corridas conviven (eso es el histórico).
 *
 * No falla el ciclo del que la llama por su cuenta: devuelve el resumen; si la BD lanza, propaga el
 * error para que el sync lo reporte, pero la materialización de la foto vigente ya ocurrió antes.
 *
 * @param {object} deps {query?} inyectable para test; por defecto usa orquestador/lib/db.mjs
 * @param {object} args {fuente, foto, corridaId?, calculadoEn?, horizonte?}
 * @returns {Promise<{corrida_id:string, fuente:string, n_predicciones:number, estado_foto:string}>}
 */
export async function registrarFoto(deps = {}, args = {}) {
  const { fuente, foto, corridaId, calculadoEn, horizonte } = args
  if (!FUENTES.includes(fuente)) throw new Error(`registrarFoto: fuente desconocida: ${fuente}`)
  const query = deps.query || (await import('./db.mjs')).query

  const cid = corridaId || randomUUID()
  const preds = extraerPredicciones(fuente, foto, { horizonte })
  // calculado_en: la marca real del cálculo si el motor la trae; si no, ahora. Nunca se inventa una
  // fecha "linda" — se usa la del proceso como último recurso honesto.
  const ts = calculadoEn ? new Date(calculadoEn).toISOString() : new Date().toISOString()

  for (const p of preds) {
    await query(
      `insert into public.finanzas_caja_negra
        (corrida_id, fuente, clave, metrica, horizonte, fecha_objetivo, valor, unidad, estado, detalle, calculado_en)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11)
       on conflict (corrida_id, clave) do nothing`,
      [cid, fuente, p.clave, p.metrica, p.horizonte, p.fecha_objetivo, p.valor, p.unidad, p.estado, JSON.stringify(p.detalle ?? null), ts],
    )
  }

  const estadoFoto = preds.length === 1 && preds[0].metrica === '_foto' ? preds[0].estado : 'ok'
  return { corrida_id: cid, fuente, n_predicciones: preds.length, estado_foto: estadoFoto }
}

/**
 * Envoltorio resiliente para los syncs: congela la foto SIN poder romper el ciclo que lo llama. La
 * caja negra es aditiva — la foto vigente ya quedó materializada antes; si el registro histórico falla
 * (BD transitoria), se avisa fuerte por consola y el sync sigue. No se traga el error en silencio.
 *
 * @returns {Promise<object|null>} el resumen de registrarFoto, o null si falló
 */
export async function registrarFotoSeguro(deps = {}, args = {}) {
  try {
    const r = await registrarFoto(deps, args)
    const marca = r.estado_foto === 'ok' ? `${r.n_predicciones} predicciones` : `foto ${r.estado_foto}`
    console.log(`  ↳ caja negra: ${args.fuente} congelado (${marca}, corrida ${r.corrida_id})`)
    return r
  } catch (e) {
    console.error(`  ⚠ caja negra: NO se congeló la foto de ${args.fuente} (${String(e?.message ?? e).slice(0, 140)}) — la foto vigente sí quedó materializada`)
    return null
  }
}
