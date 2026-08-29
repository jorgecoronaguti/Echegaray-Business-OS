// EL COMMAND LAYER — el enchufe donde después entra la conversación (§19).
//
// ═══ LO QUE ESTE ARCHIVO NO HACE, Y ES SU RAZÓN DE SER ═══
//
// **No llama a ningún modelo.** Ni acá ni en ningún módulo de `cotizador/`. El LLM produce una
// INTENCIÓN —`{action, target, value, unit}` de la lista cerrada del contrato— y la deja en la
// puerta. Todo lo que pasa después es código de este repo:
//
//     AUTORIZACIÓN → VALIDACIÓN → REGLAS → OUTLIER → MUTACIÓN → RECÁLCULO → PERSISTENCIA
//
// Las primeras cuatro están implementadas y testeadas acá. Las tres últimas se INYECTAN: `mutar`,
// `recalcular` y `persistir` los pone quien usa el motor, porque tocan el estado y la base, y este
// módulo tiene que poder probarse entero sin red.
//
// ═══ POR QUÉ EL ORDEN NO SE NEGOCIA ═══
//
// La autorización va PRIMERA. Si va después de la validación, un jefe de obra que pide
// «beneficio 19 %» recibe «19 % no es un porcentaje válido para pctBeneficio» en vez de «no tenés
// permiso» — y ese mensaje ya le confirmó que el campo existe y qué forma tiene. §40 dice que no ve
// lo comercial NI POR UN ERROR.
//
// El outlier va DESPUÉS de las reglas y ANTES de la mutación. Después, porque no tiene sentido
// preguntar si 5.200 m² es mucho cuando la partida no existe. Antes, porque un cambio material que
// se aplica y después se pregunta ya movió el precio.
//
// ═══ LOS SIETE CASOS CANÓNICOS DEL §19 ═══
//
//   «la mampostería son 520 m²»        → update_quantity, unidad compatible, outlier
//   «sacá pintura»                     → exclude_scope, recalcula
//   «sanitaria 8,5M»                   → AMBIGUO: NO se asume subcontrato, se pregunta
//   «la sanitaria la hace X por 8,5M»  → set_subcontract con proveedor
//   «beneficio 19 %»                   → commercial_override de ESTA quote
//   «¿de dónde salen 47,2 m³?»         → evidence_query
//   «¿qué me falta para enviar?»       → blockers_query

import { ESTADO, ACCION, autorizar, intencion } from './contrato.mjs'
import { leerCantidad, compatibleConPartida } from './unidades.mjs'
import { evaluarCambio } from './outlier.mjs'
import { evento } from './eventos.mjs'
import { rechazarEscrituraDeCoeficiente, PARAMETROS, esNormativo } from './comercial.mjs'
import { queMeFaltaParaEnviar } from './atencion.mjs'

/** El resultado de un comando. Siempre la misma forma, resuelto o no. PURA. */
const salida = (x) => Object.freeze({
  ok: false, etapaQueParo: null, porQue: null, pregunta: null,
  eventos: Object.freeze([]), resultado: null, veredicto: null, ...x,
})

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2 · VALIDACIÓN — por acción, y sin tocar el estado
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ¿LA INTENCIÓN ESTÁ BIEN FORMADA Y APUNTA A ALGO QUE EXISTE? PURA.
 *
 * `estado` es una foto de sólo lectura del presupuesto: `{partidas, politica, alcance, cola,
 * costoConocido}`. Se lee, no se toca.
 */
export function validar(intent, estado = {}) {
  const def = ACCION[intent.action]
  const faltan = def.campos.filter((c) => intent[c] === null || intent[c] === undefined)

  if (intent.action === 'update_quantity') {
    const partida = (estado.partidas ?? []).find((p) => coincide(p, intent.target))
    if (!partida) return { ok: false, porQue: `no encuentro ninguna partida que se llame «${intent.target}»`, pregunta: '¿a qué partida te referís?' }
    // La cantidad puede venir como texto («520 m2») o ya partida en value + unit.
    const leida = intent.unit ? { valor: Number(intent.value), unidad: intent.unit, estado: ESTADO.EXTRAIDO } : leerCantidad(String(intent.value ?? ''), { contexto: 'MAGNITUD' })
    if (leida.estado === ESTADO.AMBIGUO) {
      return { ok: false, porQue: leida.porQue, pregunta: `¿«${intent.textoOriginal ?? intent.value}» son ${leida.lecturas?.map((l) => `${l.valor} ${l.unidad ?? '(sin unidad)'}`).join(' o ')}?`, lecturas: leida.lecturas }
    }
    if (!Number.isFinite(Number(leida.valor))) return { ok: false, porQue: `«${intent.value}» no es una cantidad` }
    const compat = compatibleConPartida({ unidad: leida.unidad, unidadPartida: partida.unidad })
    if (!compat.ok) return { ok: false, porQue: compat.porQue, estado: compat.estado }
    return { ok: true, partida, valor: Number(leida.valor) * (compat.factor ?? 1), unidad: partida.unidad, unidadEsperada: partida.unidad, anterior: partida.cantidad }
  }

  if (intent.action === 'exclude_scope' || intent.action === 'include_scope') {
    const tocadas = (estado.partidas ?? []).filter((p) => coincide(p, intent.target))
    if (!tocadas.length) return { ok: false, porQue: `«${intent.target}» no toca ninguna partida del presupuesto`, pregunta: '¿lo agregamos al alcance igual, para que quede declarado?' }
    return { ok: true, partidas: tocadas, anterior: tocadas.map((p) => p.alcance ?? null) }
  }

  if (intent.action === 'set_subcontract') {
    const partida = (estado.partidas ?? []).find((p) => coincide(p, intent.target))
    if (!partida) return { ok: false, porQue: `no encuentro ninguna partida que se llame «${intent.target}»` }
    // ═══ EL CASO «sanitaria 8,5M» ═══
    // Sin proveedor NO es un subcontrato: es un número al lado de un rubro. Asumirlo subcontratado
    // es inventar una decisión comercial —a quién se le compra— que nadie tomó.
    if (!intent.supplier) {
      // SE CITA EL TEXTO ORIGINAL, NO SE RECONSTRUYE. Concatenar `target` + `textoOriginal` daba
      // «sanitaria sanitaria 8,5M»: el original YA trae el rubro, porque de ahí salió el target. El
      // QA visual lo leyó en pantalla el 29/08/2026. Cuando no hay original —una intención que armó
      // el modelo— se compone, que es el único caso donde hace falta.
      const dicho = intent.textoOriginal ?? `${intent.target} ${intent.value}`
      return { ok: false, porQue: `«${dicho}» no dice QUIÉN lo hace: un monto al lado de un rubro no es un subcontrato`, pregunta: `¿${intent.target} la hace un tercero? ¿Quién?` }
    }
    const leida = intent.unit === 'ARS' || intent.unit === 'USD'
      ? { valor: Number(intent.value), unidad: intent.unit, estado: ESTADO.EXTRAIDO }
      : leerCantidad(String(intent.value ?? ''), { contexto: 'MONETARIO' })
    if (!Number.isFinite(Number(leida.valor))) return { ok: false, porQue: `«${intent.value}» no es un precio` }
    // La unidad de ESTE campo es la MONEDA, no la unidad de la partida. Pasarle `un` al detector
    // de atípicos hacía que $8.500.000 cayera fuera del rango de un CONTEO y se rechazara como
    // «físicamente imposible»: un precio no se mide en la unidad de lo que compra.
    return { ok: true, partida, valor: Number(leida.valor), unidad: leida.unidad ?? 'ARS', unidadEsperada: 'ARS', moneda: leida.unidad ?? 'ARS', proveedor: intent.supplier, anterior: partida.subcontrato ?? null }
  }

  if (intent.action === 'commercial_override' || intent.action === 'set_global_policy') {
    const rechazo = rechazarEscrituraDeCoeficiente(intent.target)
    if (rechazo) return { ok: false, porQue: rechazo.porQue, pregunta: `¿cuál querés mover? ${rechazo.componentes.join(', ')}` }
    if (!PARAMETROS.includes(intent.target)) return { ok: false, porQue: `«${intent.target}» no es un parámetro de la política comercial` }
    if (intent.action === 'commercial_override' && esNormativo(intent.target)) {
      return { ok: false, porQue: `el ${intent.target} es normativo: no se negocia por cotización` }
    }
    const v = Number(intent.value)
    // «19 %» y «0,19» son lo mismo y la gente escribe las dos. Un 19 crudo sería un 1.900 %.
    const valor = v > 1 ? v / 100 : v
    if (!Number.isFinite(valor) || valor < 0) return { ok: false, porQue: `«${intent.value}» no es un porcentaje` }
    return { ok: true, parametro: intent.target, valor, anterior: estado.politica?.[intent.target] ?? null }
  }

  if (faltan.length) return { ok: false, porQue: `faltan datos para «${intent.action}»: ${faltan.join(', ')}` }
  return { ok: true }
}

/** ¿Este texto nombra a esta partida? PURA. El mismo criterio grueso que usa el alcance. */
function coincide(partida, texto) {
  const n = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const t = n(texto)
  if (!t) return false
  return [partida?.codigo, partida?.descripcion, partida?.rubro].filter(Boolean).some((c) => n(c).includes(t) || t.includes(n(c)))
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL PIPELINE COMPLETO
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * EJECUTAR UNA INTENCIÓN. Devuelve qué pasó y en qué etapa paró. PURA salvo por lo inyectado.
 *
 * `mutar` recibe `{intent, validado, estado}` y devuelve el estado nuevo. `recalcular` y
 * `persistir` son opcionales. Ninguno de los tres existe en este módulo a propósito: son los que
 * tocan el mundo, y el punto de este archivo es que TODO lo que decide se pueda probar sin tocarlo.
 */
export function ejecutar({
  intent, rol, actor, estado = {}, correlationId = null,
  mutar = null, recalcular = null, persistir = null, confirmado = false,
} = {}) {
  // ── 1 · AUTORIZACIÓN. Primera, siempre. Ver el encabezado.
  const auth = autorizar({ rol, action: intent.action })
  if (!auth.ok) return salida({ etapaQueParo: 'AUTORIZACION', porQue: auth.motivo })

  // ── 2 · VALIDACIÓN
  const val = validar(intent, estado)
  if (!val.ok) return salida({ etapaQueParo: 'VALIDACION', porQue: val.porQue, pregunta: val.pregunta ?? null, resultado: val.lecturas ? { lecturas: val.lecturas } : null })

  // Las CONSULTAS terminan acá: no mutan, no pasan por outlier, no generan evento.
  if (!auth.muta) return salida({ ok: true, etapaQueParo: null, resultado: consultar({ intent, estado }) })

  // ── 3 · REGLAS + 4 · OUTLIER
  const impacto = estimarImpacto({ intent, val, estado })
  const ev = evaluarCambio({
    campo: campoDe(intent), entidad: intent.target ?? 'cotización',
    valorAnterior: val.anterior ?? null, valorNuevo: val.valor ?? intent.value,
    // La unidad de comparación la declara la VALIDACIÓN, no la partida: el precio de un
    // subcontrato se mide en pesos aunque la partida se cotice en m³.
    unidad: val.unidad ?? null,
    unidadEsperada: val.unidadEsperada ?? null,
    impacto, costoConocido: estado.costoConocido ?? null,
    evidencia: val.partida?.evidencia ?? null,
  })
  if (ev.veredicto === 'RECHAZAR') return salida({ etapaQueParo: 'OUTLIER', porQue: ev.porQue, veredicto: ev.veredicto, resultado: ev })
  if (ev.veredicto === 'RESOLVER' && !confirmado) {
    return salida({
      etapaQueParo: 'OUTLIER', porQue: ev.porQue, veredicto: ev.veredicto, resultado: ev,
      pregunta: `${ev.porQue}. ¿Lo aplico igual?`,
    })
  }

  // ── 5 · MUTACIÓN + 6 · RECÁLCULO + 7 · PERSISTENCIA
  const e = evento({
    accion: intent.action, entidad: entidadCanonica(intent, val), campo: campoDe(intent),
    antes: val.anterior ?? null, despues: val.valor ?? intent.value,
    actor, motivo: intent.textoOriginal ?? null, correlationId,
  })
  const nuevo = mutar ? mutar({ intent, validado: val, estado, evento: e }) : estado
  const recalculado = recalcular ? recalcular(nuevo) : nuevo
  if (persistir) persistir({ estado: recalculado, eventos: [e] })

  return salida({
    ok: true, veredicto: ev.veredicto, eventos: Object.freeze([e]), resultado: recalculado,
    porQue: ev.veredicto === 'APLICAR_CON_AVISO' ? ev.porQue : null,
  })
}

/**
 * LA ENTIDAD DEL EVENTO ES LA PARTIDA, NO EL TEXTO QUE ESCRIBIÓ LA PERSONA. PURA.
 *
 * ═══ EL DEFECTO QUE ESTO ARREGLA ═══
 *
 * El evento se armaba con `String(intent.target)`, o sea el texto crudo: «mamposteria», «la
 * mamposteria» y «01.01» son la MISMA partida y dejaban tres entidades distintas en el historial.
 * Con eso, `historiaDe()` no puede reconstruir el estado de una partida y el undo del §21 no puede
 * agrupar lo que fue un solo pedido — que es justo lo que el correlation_id existe para permitir.
 *
 * La validación YA resolvió a qué partida apunta el texto. Acá se usa esa resolución en vez de
 * volver a confiar en cómo lo escribieron.
 */
export function entidadCanonica(intent, val) {
  if (val?.partida) return String(val.partida.codigo ?? val.partida.id)
  // `exclude_scope` puede tocar varias: la entidad es la lista, ordenada para que dos pedidos
  // equivalentes escritos distinto den la misma clave.
  if (val?.partidas?.length) return val.partidas.map((p) => String(p.codigo ?? p.id)).sort().join('+')
  if (val?.parametro) return String(val.parametro)
  return String(intent.target ?? 'cotización')
}

/** Qué campo toca cada acción. PURA. */
function campoDe(intent) {
  if (intent.action === 'update_quantity') return 'cantidad'
  if (intent.action === 'exclude_scope' || intent.action === 'include_scope') return 'alcance'
  if (intent.action === 'set_subcontract') return 'subcontrato'
  if (intent.action === 'commercial_override' || intent.action === 'set_global_policy') return intent.target
  return null
}

/**
 * CUÁNTA PLATA MUEVE ESTE CAMBIO. PURA.
 *
 * Devuelve `null` cuando no se puede estimar — nunca cero. Un cambio de impacto desconocido lo
 * trata `evaluarCambio` como material, que es la dirección segura.
 */
function estimarImpacto({ intent, val, estado }) {
  if (intent.action === 'update_quantity' && val.partida?.costoUnitario) {
    const delta = Math.abs(Number(val.valor) - Number(val.anterior ?? 0))
    return delta * Number(val.partida.costoUnitario)
  }
  if (intent.action === 'exclude_scope') return (val.partidas ?? []).reduce((a, p) => a + (Number(p.subtotal) || 0), 0) || null
  if (intent.action === 'set_subcontract') return Number(val.valor) || null
  if (intent.action === 'commercial_override' && Number.isFinite(Number(estado.costoConocido))) {
    return Math.abs(Number(val.valor) - Number(val.anterior ?? 0)) * Number(estado.costoConocido)
  }
  return null
}

/** Las consultas del §19. PURA — no mutan y no pasan por outlier. */
function consultar({ intent, estado }) {
  if (intent.action === 'blockers_query') return { faltan: estado.cola ? queMeFaltaParaEnviar(estado.cola) : [] }
  if (intent.action === 'evidence_query') {
    const partida = (estado.partidas ?? []).find((p) => coincide(p, intent.target))
    return partida ? { entidad: partida.codigo, genealogia: partida.genealogia ?? null, evidencia: partida.evidencia ?? null } : { porQue: `no encuentro «${intent.target}»` }
  }
  if (intent.action === 'cost_query' || intent.action === 'commercial_query') {
    const partida = (estado.partidas ?? []).find((p) => coincide(p, intent.target))
    return partida ? { entidad: partida.codigo, subtotal: partida.subtotal ?? null, costoUnitario: partida.costoUnitario ?? null } : { porQue: `no encuentro «${intent.target}»` }
  }
  return null
}

export { intencion }
