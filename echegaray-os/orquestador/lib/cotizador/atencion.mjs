// LA COLA DE ATENCIÓN Y LO QUE BLOQUEA (§22, §23).
//
// ═══ LA COLA SE DERIVA, NO SE MANTIENE ═══
//
// No hay una tabla de «pendientes» que alguien tenga que acordarse de actualizar. La cola es una
// FUNCIÓN del estado del presupuesto: si una partida no tiene precio, hay un issue; en cuanto lo
// tiene, el issue desaparece solo. Una lista mantenida a mano se desincroniza el primer día y
// después miente en las dos direcciones — muestra resuelto lo que falta y falta lo que se resolvió.
//
// ═══ BLOQUEAR ES UNA REGLA DE DOMINIO, NO UN COLOR DE PANTALLA (§23) ═══
//
// «Cantidad crítica ausente bloquea, subcontrato crítico sin precio bloquea, conflicto crítico
// bloquea, dato menor no.» Eso tiene que ser código con tests, no un `if` dentro de un componente
// de React: hoy el único freno para congelar un presupuesto incompleto vive en los botones de la
// pantalla, y un PATCH de PostgREST lo saltea. Ya pasó exactamente eso con la edición de una
// cotización congelada, y la migración 20260821T4400 lo arregló poniendo el freno en la BASE.
//
// ═══ QUÉ ES «CRÍTICO» ═══
//
// No es un adjetivo del que escribe el issue: es MATERIALIDAD. Una partida que pesa más del umbral
// sobre el costo conocido es crítica; una que pesa menos, no. Y cuando NO SE SABE cuánto pesa,
// cuenta como crítica — porque el desconocido no se puede declarar chico.

import { ESTADO, TIPO_ISSUE, SEVERIDAD, ordenarCola } from './contrato.mjs'

/** Cuánto tiene que pesar una partida sobre el costo conocido para que su hueco bloquee. 2 % sobre
 *  una obra de $180 M son $3,6 M: es plata que nadie regala por descuido. */
export const UMBRAL_MATERIALIDAD = 0.02

/** Los tipos de issue que bloquean SIEMPRE, sin importar cuánto pesen. Un conflicto de alcance o de
 *  evidencia no se resuelve con plata: se resuelve con una decisión, y hasta que no exista, el
 *  presupuesto está diciendo dos cosas. */
export const BLOQUEAN_SIEMPRE = Object.freeze([
  TIPO_ISSUE.CONFLICTO,
  TIPO_ISSUE.UNIDAD_INCOMPATIBLE,
  TIPO_ISSUE.FUGA_ENTRE_CLIENTES,
])

/** Los que bloquean SI SON MATERIALES. Un clavo sin precio no frena una oferta de $180 M; la
 *  instalación sanitaria sin cotizar sí. */
export const BLOQUEAN_SI_MATERIALES = Object.freeze([
  TIPO_ISSUE.SUBCONTRATO_SIN_PRECIO,
  TIPO_ISSUE.SIN_PRECIO,
  TIPO_ISSUE.CANTIDAD_CRITICA_AUSENTE,
  TIPO_ISSUE.SIN_PARTIDA,
  TIPO_ISSUE.AMBIGUO,
])

/**
 * LOS QUE BLOQUEAN SALVO OVERRIDE COMERCIAL EXPLÍCITO Y AUDITADO.
 *
 * ═══ POR QUÉ EL PRECIO VENCIDO CAMBIÓ DE LADO ═══
 *
 * Antes era una advertencia si no era material. La auditoría adversarial mostró a dónde llevaba:
 * el motor traducía HISTORICO a EXTRAIDO para poder sumarlo, y la versión terminaba SELLADA como
 * VALIDADA con precios de catorce meses. `HISTORICO ≠ VALIDADO` es el §42 y no admite una lectura
 * por materialidad: un precio vencido de $900 tampoco vuelve válida una oferta, sólo la vuelve
 * barata de arreglar.
 *
 * Lo que SÍ admite es que alguien con permiso comercial diga «lo asumo». Ese override no es un
 * flag: exige `autorizadoPor` y queda como evento con actor (§21). Sin quién, no hay override.
 */
export const BLOQUEAN_SALVO_OVERRIDE = Object.freeze([
  TIPO_ISSUE.PRECIO_DESACTUALIZADO,
  // ═══ SACAR PLATA DEL TOTAL EXIGE UNA FIRMA ═══
  //
  // Este tipo NO estaba en ninguna de las tres listas, así que la cola lo degradaba a ALTA y
  // `bloquea: false`. Punta a punta eso significaba que un corpus con dos documentos que dijeran lo
  // mismo sacaba $650.000 del total con `gate.ready: true` y la versión se sellaba CONFIRMADA — el
  // ataque original, textual. El override acá es la CONFIRMACIÓN HUMANA de la exclusión: una
  // entrada de alcance cargada por una persona ya la trae (`decididoPor`); una que salió de leer
  // dos PDFs, no.
  TIPO_ISSUE.EXCLUSION_CON_COMPUTO,
])

/** ¿Hay un override AUDITADO para este issue? PURA. Un override sin quién lo autorizó no existe. */
export function overrideDe(issue, overrides = []) {
  // ═══ NO HAY COMODÍN ═══
  // Había un `o.entidad === '*'` que destrababa TODO con una sola fila. `cotizacion_override_precio`
  // no puede expresarlo —su unique es `(cotizacion_id, recurso_codigo)`— así que era una capacidad
  // que sólo existía en memoria, sin contraparte en la base y sin un test que la mirara. Un override
  // es por entidad o no es.
  //
  // El `startsWith` sí se conserva y es necesario: la entidad de un issue de precio es
  // `codigo (NOMBRE)` y el override se firma por código.
  return overrides.find((o) => o?.autorizadoPor
    && (o.entidad === issue.entity || String(issue.entity).startsWith(`${o.entidad} `))) ?? null
}

/**
 * ¿ESTE ISSUE ES MATERIAL? PURA.
 *
 * `impact === null` devuelve `true`: no saber cuánto cuesta un hueco NO lo vuelve chico. Es la misma
 * decisión que toma `issue()` al negarse a escribir cero en `impact`, aplicada acá. La forma de
 * dejar de bloquear por un hueco desconocido es MEDIRLO, no ignorarlo.
 */
export function esMaterial(issue, { costoConocido = null, umbral = UMBRAL_MATERIALIDAD } = {}) {
  if (issue.impact === null || issue.impact === undefined) return true
  if (!Number.isFinite(Number(costoConocido)) || Number(costoConocido) <= 0) return true
  return Number(issue.impact) / Number(costoConocido) >= umbral
}

/**
 * ¿ESTE ISSUE BLOQUEA? PURA. Devuelve `{bloquea, porQue}` — nunca un booleano pelado, porque un
 * «no podés congelar» sin motivo obliga a leer el código para entender qué falta.
 */
export function bloquea(issue, opciones = {}) {
  if (BLOQUEAN_SIEMPRE.includes(issue.type)) {
    return { bloquea: true, porQue: `${issue.type} sobre «${issue.entity}»: no se resuelve con plata, se resuelve con una decisión` }
  }
  if (BLOQUEAN_SALVO_OVERRIDE.includes(issue.type)) {
    const ov = overrideDe(issue, opciones.overrides ?? [])
    if (ov) return { bloquea: false, porQue: `${issue.type} sobre «${issue.entity}» asumido por ${ov.autorizadoPor}${ov.motivo ? `: ${ov.motivo}` : ''}`, override: ov }
    return {
      bloquea: true,
      porQue: issue.type === TIPO_ISSUE.EXCLUSION_CON_COMPUTO
        ? `${issue.type} sobre «${issue.entity}»: sacar plata del total exige una firma. Corroborar entre documentos alcanza para proponerlo, no para aplicarlo`
        : `${issue.type} sobre «${issue.entity}»: un precio vencido NO cierra un presupuesto (§42 HISTORICO ≠ VALIDADO). Lo destraba un override comercial con quién lo autoriza`,
    }
  }
  if (!BLOQUEAN_SI_MATERIALES.includes(issue.type)) return { bloquea: false, porQue: null }
  const material = esMaterial(issue, opciones)
  if (!material) return { bloquea: false, porQue: `${issue.type} sobre «${issue.entity}» pesa ${((issue.impact / opciones.costoConocido) * 100).toFixed(2)} % del costo conocido: no bloquea` }
  return {
    bloquea: true,
    porQue: issue.impact === null
      ? `${issue.type} sobre «${issue.entity}» y no se sabe cuánto pesa: un hueco sin medir no se puede declarar chico`
      : `${issue.type} sobre «${issue.entity}» pesa $${Number(issue.impact).toLocaleString('es-AR')} sobre un costo conocido de $${Number(opciones.costoConocido ?? 0).toLocaleString('es-AR')}`,
  }
}

/**
 * LA COLA COMPLETA, DERIVADA DEL ESTADO. PURA.
 *
 * Toma los issues que produjeron las etapas, les recalcula la severidad según materialidad, y los
 * ordena. La severidad que traía el issue de origen es una SUGERENCIA del módulo que lo emitió; la
 * decisión de si bloquea la toma acá, con el costo total a la vista, que es la única escala en la
 * que «material» significa algo.
 */
export function colaDeAtencion({ issues = [], costoConocido = null, umbral = UMBRAL_MATERIALIDAD, overrides = [] } = {}) {
  const evaluados = issues.filter(Boolean).map((i) => {
    const b = bloquea(i, { costoConocido, umbral, overrides })
    return Object.freeze({
      ...i,
      severity: b.bloquea ? SEVERIDAD.BLOQUEANTE : (i.severity === SEVERIDAD.BLOQUEANTE ? SEVERIDAD.ALTA : i.severity),
      bloquea: b.bloquea,
      porQueBloquea: b.porQue,
      // Quién asumió el riesgo, cuando lo hubo. Va en el issue para que la advertencia no diga
      // sólo «no bloquea» sino «no bloquea PORQUE fulano lo asumió».
      asumidoPor: b.override?.autorizadoPor ?? null,
    })
  })
  const ordenada = ordenarCola(evaluados)
  const bloqueantes = ordenada.filter((i) => i.bloquea)
  return Object.freeze({
    issues: Object.freeze(ordenada),
    bloqueantes: Object.freeze(bloqueantes),
    noBloqueantes: Object.freeze(ordenada.filter((i) => !i.bloquea)),
    total: ordenada.length,
    nBloqueantes: bloqueantes.length,
    /** La plata CONOCIDA que cuelga de issues bloqueantes. `null` si ninguno la trae — no cero:
     *  un cero acá se leería como «bloquea pero no cuesta nada», que es lo contrario de la verdad. */
    plataEnRiesgo: bloqueantes.some((i) => i.impact !== null)
      ? bloqueantes.reduce((a, i) => a + (i.impact ?? 0), 0)
      : null,
    /** Cuántos bloqueantes NO tienen impacto medido. Es la métrica honesta del §30: lo que importa
     *  no es tener menos NULL, es tener menos incertidumbre NO DECLARADA. */
    bloqueantesSinMedir: bloqueantes.filter((i) => i.impact === null).length,
  })
}

/**
 * LAS PREGUNTAS DIRIGIDAS que salen de la cola, en el orden en que conviene hacerlas. PURA.
 *
 * Es lo que contesta «¿qué me falta para enviar?» (§19, `blockers_query`). No devuelve la cola
 * cruda: devuelve una lista corta, con la acción concreta al lado, ordenada por lo que destraba
 * más. Un listado de 60 issues no es una respuesta a esa pregunta.
 */
export function queMeFaltaParaEnviar(cola, { limite = 10 } = {}) {
  return Object.freeze(cola.bloqueantes.slice(0, limite).map((i) => Object.freeze({
    que: i.entity,
    porQue: i.detalle ?? i.porQueBloquea,
    cuantoPesa: i.impact,
    accion: i.recommended_action,
    tipo: i.type,
  })))
}

/** ¿El presupuesto puede seguir a la etapa siguiente? PURA. Un estado, no un booleano. */
export const estadoDeCola = (cola) => (cola.nBloqueantes > 0 ? ESTADO.FALTA_DATO : ESTADO.CONFIRMADO)
