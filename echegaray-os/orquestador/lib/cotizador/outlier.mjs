// EL DETECTOR DE VALORES ATÍPICOS — por política, no por «10×» (§20).
//
// ═══ POR QUÉ NO ALCANZA CON UN FACTOR ═══
//
// «Si el valor nuevo es 10 veces el viejo, preguntá» tiene dos problemas y los dos se ven en la
// conversación real:
//
//   · DEJA PASAR LO CARO. Cambiar 520 m² por 5.200 m² es 10× y salta. Cambiar el precio del
//     hormigón de $180.000 a $260.000 es 1,44× y no salta — y sobre 800 m³ son $64 M.
//   · FRENA LO QUE NO IMPORTA. Cambiar 2 unidades por 20 es 10× y salta, aunque sean matafuegos de
//     $40.000. Preguntar por eso entrena a la gente a apretar «sí» sin leer, que es peor que no
//     preguntar.
//
// Las cinco señales que sí sirven, y ninguna sola alcanza:
//
//   1. RELATIVA   — cuánto se movió respecto de lo que había.
//   2. ABSOLUTA   — cuánto se movió en unidades de la magnitud (un salto de 0,1 a 0,8 en un
//                   espesor es 8× y son 70 cm de hormigón).
//   3. IMPACTO    — cuánta plata mueve el cambio. Es la señal que manda.
//   4. DOMINIO    — ¿el valor es posible? Un espesor de losa de 3 m no es un outlier, es un error.
//   5. EVIDENCIA  — ¿el valor nuevo contradice lo que dice el plano? Ahí no hay que preguntar si
//                   está seguro: hay que mostrarle la cita.
//
// ═══ MATERIAL ⇒ RESOLUCIÓN · NO MATERIAL ⇒ APLICAR CON UNDO ═══
//
// Un cambio no material se aplica y se registra: frenarlo cuesta más de lo que protege, y el undo
// existe. Un cambio material NO se aplica solo, y la diferencia entre las dos cosas es plata
// medida, no intuición.

import { ESTADO, TIPO_ISSUE, SEVERIDAD, issue } from './contrato.mjs'
import { normalizarUnidad, mismaDimension } from './unidades.mjs'

/** Qué tan grande tiene que ser un salto RELATIVO para mirarlo. 3× es deliberadamente más bajo que
 *  el 10× habitual: la señal que decide es el impacto, y ésta sólo sirve para llamar la atención. */
export const SALTO_RELATIVO = 3

/** Cuánta plata tiene que mover un cambio para exigir resolución, como fracción del costo conocido. */
export const IMPACTO_MATERIAL = 0.02

/**
 * RANGOS FÍSICAMENTE POSIBLES, por lo que la magnitud MIDE.
 *
 * No son rangos «típicos de obra»: son los límites de lo posible, y por eso se pueden afirmar sin
 * conocer el proyecto. Un espesor de losa de 3 m no es raro, es imposible; una superficie de
 * 800.000 m² no es una obra de Echegaray. Lo que caiga afuera sale ERROR, no OUTLIER — la
 * diferencia importa: un outlier se confirma, un error se corrige.
 */
export const POSIBLE = Object.freeze({
  LONGITUD: { min: 0.001, max: 5_000 },
  SUPERFICIE: { min: 0.01, max: 200_000 },
  VOLUMEN: { min: 0.001, max: 100_000 },
  MASA: { min: 0.001, max: 5_000_000 },
  CONTEO: { min: 0, max: 100_000 },
  TIEMPO_TRABAJO: { min: 0, max: 1_000_000 },
  CAPACIDAD: { min: 0.1, max: 1_000_000 },
  MONEDA: { min: 0, max: 100_000_000_000 },
})

const rel = (a, b) => {
  const x = Math.abs(Number(a))
  const y = Math.abs(Number(b))
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const menor = Math.min(x, y)
  const mayor = Math.max(x, y)
  if (menor === 0) return mayor === 0 ? 1 : Infinity
  return mayor / menor
}

/**
 * EVALUAR UN CAMBIO. PURA. Devuelve `{veredicto, señales, porQue, issue}`.
 *
 * `veredicto` ∈ `APLICAR` · `APLICAR_CON_AVISO` · `RESOLVER` · `RECHAZAR`.
 *
 *   APLICAR            — nada llamó la atención.
 *   APLICAR_CON_AVISO  — se movió mucho pero mueve poca plata: se aplica y queda el aviso + undo.
 *   RESOLVER           — mueve plata material o contradice la evidencia: NO se aplica solo.
 *   RECHAZAR           — el valor es imposible o la unidad no corresponde: no es una duda, es un
 *                        error, y aceptarlo «bajo confirmación» sería aceptar un dato roto.
 */
export function evaluarCambio({
  campo, valorAnterior = null, valorNuevo, unidad = null, unidadEsperada = null,
  impacto = null, costoConocido = null, evidencia = null, entidad = 'sin nombre',
  umbralRelativo = SALTO_RELATIVO, umbralImpacto = IMPACTO_MATERIAL,
} = {}) {
  const senales = []
  const salida = (veredicto, porQue, extra = {}) => Object.freeze({
    veredicto, campo, entidad, valorAnterior, valorNuevo, unidad,
    senales: Object.freeze(senales), porQue, ...extra,
  })

  // ═══ 4 · DOMINIO — primero, porque un valor imposible no merece las otras cuatro preguntas ═══
  if (unidadEsperada && unidad && !mismaDimension(unidad, unidadEsperada)) {
    senales.push({ senal: 'UNIDAD', detalle: `${unidad} vs ${unidadEsperada}` })
    return salida('RECHAZAR', `«${valorNuevo} ${unidad}» no se puede usar donde se espera ${unidadEsperada}: miden cosas distintas y convertir no existe`, {
      issue: issue({ type: TIPO_ISSUE.UNIDAD_INCOMPATIBLE, severity: SEVERIDAD.BLOQUEANTE, entity: entidad, impact: impacto, detalle: `se propuso ${valorNuevo} ${unidad} sobre un campo en ${unidadEsperada}` }),
      estado: ESTADO.ERROR,
    })
  }
  const u = normalizarUnidad(unidad ?? unidadEsperada)
  const rango = u ? POSIBLE[u.dimension] : null
  if (rango && Number.isFinite(Number(valorNuevo)) && (Number(valorNuevo) < rango.min || Number(valorNuevo) > rango.max)) {
    senales.push({ senal: 'DOMINIO', detalle: `fuera de [${rango.min}, ${rango.max}] ${u.canonica}` })
    return salida('RECHAZAR', `${valorNuevo} ${u.canonica} está fuera de lo físicamente posible para ${u.dimension.toLowerCase()} (${rango.min} a ${rango.max}): no es un valor raro, es un error`, {
      issue: issue({ type: TIPO_ISSUE.AMBIGUO, severity: SEVERIDAD.BLOQUEANTE, entity: entidad, impact: impacto, detalle: `valor imposible: ${valorNuevo} ${u.canonica}` }),
      estado: ESTADO.ERROR,
    })
  }

  // ═══ 5 · EVIDENCIA — el plano dice otra cosa ═══
  if (evidencia?.textoLiteral && evidencia?.valorDeclarado !== null && evidencia?.valorDeclarado !== undefined
      && Number(evidencia.valorDeclarado) !== Number(valorNuevo)) {
    senales.push({ senal: 'EVIDENCIA', detalle: `el documento dice ${evidencia.valorDeclarado}` })
    return salida('RESOLVER', `el valor propuesto (${valorNuevo}) contradice lo que dice «${evidencia.archivo ?? 'el documento'}»: «${evidencia.textoLiteral}». Acá no corresponde preguntar si está seguro: corresponde mostrarle la cita`, {
      issue: issue({ type: TIPO_ISSUE.CONFLICTO, severity: SEVERIDAD.BLOQUEANTE, entity: entidad, impact: impacto, evidence: evidencia, detalle: `propuesto ${valorNuevo}, documentado ${evidencia.valorDeclarado}` }),
      estado: ESTADO.CONFLICTO,
    })
  }

  // ═══ 1 y 2 · RELATIVA Y ABSOLUTA ═══
  const factor = valorAnterior === null ? null : rel(valorAnterior, valorNuevo)
  const salto = factor !== null && factor >= umbralRelativo
  if (salto) senales.push({ senal: 'RELATIVA', detalle: `×${Number.isFinite(factor) ? factor.toFixed(2) : '∞'}` })

  // ═══ 3 · IMPACTO — la que manda ═══
  const material = impacto === null
    ? salto   // sin impacto medido, sólo el salto puede llamar la atención
    : (Number.isFinite(Number(costoConocido)) && Number(costoConocido) > 0
      ? Math.abs(Number(impacto)) / Number(costoConocido) >= umbralImpacto
      : true)
  if (impacto !== null) senales.push({ senal: 'IMPACTO', detalle: `$${Number(impacto).toLocaleString('es-AR')}` })

  if (material && (salto || impacto !== null)) {
    return salida('RESOLVER', salto
      ? `«${campo}» pasa de ${valorAnterior} a ${valorNuevo} (×${Number.isFinite(factor) ? factor.toFixed(2) : '∞'})${impacto !== null ? ` y mueve $${Number(impacto).toLocaleString('es-AR')}` : ''}: no se aplica solo`
      : `«${campo}» mueve $${Number(impacto).toLocaleString('es-AR')} sobre un costo conocido de $${Number(costoConocido ?? 0).toLocaleString('es-AR')}: no se aplica solo`, {
      issue: issue({ type: TIPO_ISSUE.OUTLIER_PENDING, severity: SEVERIDAD.ALTA, entity: entidad, impact: impacto, detalle: `${campo}: ${valorAnterior} → ${valorNuevo}` }),
      estado: ESTADO.PROPUESTO,
    })
  }
  if (salto) {
    return salida('APLICAR_CON_AVISO', `«${campo}» pasa de ${valorAnterior} a ${valorNuevo} (×${Number.isFinite(factor) ? factor.toFixed(2) : '∞'}) pero mueve poca plata: se aplica y queda el aviso. Se puede deshacer`, { estado: ESTADO.CONFIRMADO })
  }
  return salida('APLICAR', null, { estado: ESTADO.CONFIRMADO })
}

/** ¿Este veredicto deja pasar la mutación? PURA. */
export const dejaPasar = (v) => v === 'APLICAR' || v === 'APLICAR_CON_AVISO'
