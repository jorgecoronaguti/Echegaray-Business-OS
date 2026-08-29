// CONGELAR — el gate que va ANTES, y la huella de lo que se congeló (§24).
//
// ═══ EL DEFECTO QUE ESTE ARCHIVO ARREGLA, MEDIDO EN LA BASE ═══
//
// `public.congelar_presupuesto` (migración 20260821T4400) hace su trabajo bien: copia la
// composición, fija costos, marca `congelada_en` y devuelve un `jsonb` con `n_sin_analisis` y
// `n_subcontratadas_sin_precio`. El problema es CUÁNDO: informa los faltantes DESPUÉS de haber
// congelado. Y congelar es irreversible por diseño —los triggers `*_congelada_solo_lectura`
// impiden editar después—, así que un presupuesto con tres paquetes sin precio queda congelado,
// sin precio, y para arreglarlo hay que crear una versión nueva.
//
// El gate va antes y devuelve `{ready, blocking_issues, warnings}`. NO un booleano opaco: «no se
// puede congelar» sin decir qué falta obliga a que alguien lea el código para entenderlo.
//
// ═══ LA HUELLA (FINGERPRINT) ═══
//
// Al congelar se guarda la huella de las ENTRADAS: qué documentos, qué cantidades, qué precios, qué
// política. Sirve para dos cosas distintas y las dos importan:
//
//   · REPRODUCIBILIDAD (§39): dos corridas con los mismos inputs tienen que dar la misma huella.
//   · REVISIÓN (§26): cuando llega documentación nueva, comparar la huella de hoy con la congelada
//     dice EXACTAMENTE qué cambió, sin tener que diffear dos presupuestos enteros.
//
// La huella es del INPUT, no del output. Una huella del resultado no distingue «cambió el precio
// del cemento» de «cambió la política comercial»: las dos mueven el total.

import crypto from 'node:crypto'
import { ESTADO, ETAPA, STATUS, resultadoEtapa } from './contrato.mjs'
import { colaDeAtencion } from './atencion.mjs'

/**
 * LA HUELLA DE LAS ENTRADAS. PURA y estable.
 *
 * Todo se ordena antes de serializar. Sin eso, dos corridas idénticas que recorrieran las partidas
 * en distinto orden producirían huellas distintas y la reproducibilidad diría que falló cuando no
 * falló — el mismo motivo por el que `seleccion.mjs` desempata por código y `ordenarCola` desempata
 * por entidad.
 */
export function huellaDeEntradas({ documentos = [], partidas = [], precios = [], politica = null, alcance = [], fx = null } = {}) {
  const partes = {
    documentos: [...documentos].map((d) => `${d.hash ?? d.id ?? d.nombre}`).sort(),
    partidas: [...partidas].map((p) => `${p.codigo ?? p.id}|${p.cantidad ?? '-'}|${p.unidad ?? '-'}|${p.alcance ?? '-'}`).sort(),
    precios: [...precios].map((o) => `${o.recursoCodigo}|${o.precio}|${o.moneda}|${o.observadoEn}|${o.fuente}`).sort(),
    politica: politica ? ['pctGastosGenerales', 'pctBeneficio', 'pctFinanciero', 'factorFinanciero', 'pctIibb', 'pctGanancias', 'pctCheque', 'pctIva'].map((k) => `${k}=${politica[k]}`).join(';') : null,
    alcance: [...alcance].map((e) => `${e.patron}|${e.estado}|${e.fuente}`).sort(),
    fx: fx ? `${fx.par}|${fx.tasa}|${fx.observadoEn}|${fx.fuente}` : null,
  }
  const texto = JSON.stringify(partes)
  return Object.freeze({
    sha256: crypto.createHash('sha256').update(texto).digest('hex'),
    partes: Object.freeze(partes),
    /** El detalle legible, para que una diferencia de huella se pueda EXPLICAR y no sólo detectar. */
    resumen: `${partes.documentos.length} documentos · ${partes.partidas.length} partidas · ${partes.precios.length} precios · política ${politica?.version ?? '—'}`,
  })
}

/** Qué cambió entre dos huellas. PURA. Es lo que hace útil a la huella en la revisión (§26). */
export function diferenciaDeHuellas(a, b) {
  if (!a || !b) return { iguales: false, cambiaron: ['no hay huella con qué comparar'] }
  if (a.sha256 === b.sha256) return { iguales: true, cambiaron: [] }
  const cambiaron = []
  for (const k of Object.keys(a.partes)) {
    if (JSON.stringify(a.partes[k]) !== JSON.stringify(b.partes[k])) cambiaron.push(k)
  }
  return { iguales: false, cambiaron }
}

/**
 * EL GATE. PURA. Devuelve `{ready, blocking_issues, warnings, porQue}`.
 *
 * Es determinístico: mismas entradas, misma respuesta. No consulta nada y no escribe nada — quien
 * congela decide qué hacer con la respuesta, y la persistencia es de otro. Eso permite que la
 * pantalla muestre el gate EN VIVO mientras se arma el presupuesto, en vez de enterarse al final.
 */
export function gateDeCongelado({ cascada = null, cola = null, issues = [], costoConocido = null } = {}) {
  const c = cola ?? colaDeAtencion({ issues, costoConocido })
  const warnings = c.noBloqueantes.map((i) => ({ tipo: i.type, entidad: i.entity, detalle: i.detalle, impacto: i.impact }))
  const blocking = c.bloqueantes.map((i) => ({ tipo: i.type, entidad: i.entity, detalle: i.detalle ?? i.porQueBloquea, impacto: i.impact, accion: i.recommended_action }))

  // Un presupuesto sin precio calculable no se congela aunque no haya un solo issue: congelar es
  // fijar un número, y no hay número que fijar. Es una condición aparte de la cola porque puede
  // pasar sin que ningún módulo haya emitido un issue —una cotización con cero partidas, por
  // ejemplo—, y ahí la cola vacía diría que todo está bien.
  if (!cascada || cascada.ventaSinIva === null || cascada.ventaSinIva === undefined) {
    blocking.push({ tipo: 'SIN_PRECIO_CALCULABLE', entidad: 'cotización', detalle: cascada?.porQue ?? 'no hay cascada comercial calculada: congelar es fijar un número y no hay número que fijar', impacto: null, accion: null })
  }

  return Object.freeze({
    ready: blocking.length === 0,
    blocking_issues: Object.freeze(blocking),
    warnings: Object.freeze(warnings),
    porQue: blocking.length === 0
      ? `listo para congelar${warnings.length ? ` — con ${warnings.length} advertencia(s) que NO bloquean y quedan registradas` : ''}`
      : `NO se congela: ${blocking.length} bloqueo(s). ${blocking.slice(0, 3).map((b) => `${b.tipo}/${b.entidad}`).join(', ')}${blocking.length > 3 ? '…' : ''}`,
  })
}

/**
 * LA VERSIÓN CONGELADA. PURA — devuelve el objeto, no lo escribe.
 *
 * Lanza si el gate no está listo. Que sea una excepción y no un valor de retorno es deliberado:
 * congelar sin gate no es un caso de borde que alguien pueda decidir tolerar, es el defecto que
 * este archivo existe para impedir, y un valor de retorno se puede ignorar.
 *
 * `FROZEN ≠ DRAFT` (§42): el objeto sale congelado con `Object.freeze` en toda su profundidad
 * relevante. No es una decoración — es la única forma de que un consumidor no pueda mutar la oferta
 * ya emitida por accidente, que es exactamente lo que la base tuvo que arreglar con triggers.
 */
export function congelar({ cotizacionId, cascada, huella, gate, congeladoPor, congeladoEn = null, version = 1 } = {}) {
  if (!gate?.ready) {
    throw new Error(`no se puede congelar: ${gate?.porQue ?? 'no se corrió el gate'}`)
  }
  if (!congeladoPor) throw new Error('congelar sin decir quién congeló deja una oferta sin dueño')
  if (!huella?.sha256) throw new Error('congelar sin huella de entradas hace imposible la revisión: no se podría decir qué cambió')
  return Object.freeze({
    cotizacionId, version,
    congeladoEn: congeladoEn ?? new Date().toISOString(),
    congeladoPor,
    huella,
    cascada: Object.freeze({ ...cascada }),
    advertencias: gate.warnings,
    estado: ESTADO.VALIDADO,
    esBorrador: false,
  })
}

/** La etapa FREEZE con la forma del contrato. PURA. */
export function etapaFreeze({ cascada, cola, huella, congeladoPor = null } = {}) {
  const gate = gateDeCongelado({ cascada, cola })
  if (!gate.ready) {
    return resultadoEtapa({
      etapa: ETAPA.FREEZE, status: STATUS.BLOQUEADA, result: gate,
      blocking_issues: gate.blocking_issues,
      next_actions: [...new Set(gate.blocking_issues.map((b) => b.accion).filter(Boolean))],
      confidence: 0,
    })
  }
  if (!congeladoPor) {
    return resultadoEtapa({
      etapa: ETAPA.FREEZE, status: STATUS.OK, result: gate,
      next_actions: ['freeze'],
      provenance: [huella?.resumen].filter(Boolean),
    })
  }
  const congelada = congelar({ cotizacionId: null, cascada, huella, gate, congeladoPor })
  return resultadoEtapa({
    etapa: ETAPA.FREEZE, status: STATUS.OK, result: congelada,
    evidence: [{ huella: huella.sha256, resumen: huella.resumen }],
    provenance: [`congelada por ${congeladoPor} el ${congelada.congeladoEn}`],
    missing_data: gate.warnings.map((w) => `${w.tipo}/${w.entidad}`),
    confidence: gate.warnings.length ? 0.9 : 1,
  })
}
