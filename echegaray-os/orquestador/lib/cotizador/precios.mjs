// UN RECURSO NO ES UN PRECIO — y un precio sin fecha no es un precio (§10, §11).
//
// ═══ POR QUÉ SE SEPARAN ═══
//
// Hoy el circuito trae el precio PEGADO al recurso: `composiciones()` hace
// `left join recurso_precio rp on rp.vigente` y devuelve `{codigo, nombre, tipo, costoUnitario}`.
// Eso alcanza para multiplicar y no alcanza para nada más. Un recurso es una COSA —cemento
// portland, oficial albañil, hormigonera— y existe aunque nadie la haya cotizado nunca. Un precio
// es una OBSERVACIÓN: alguien vio que esa cosa costaba tanto, en tal moneda, tal día, según tal
// fuente, y esa observación vence.
//
// Cuando las dos viven en el mismo objeto no hay forma de distinguir estas tres cosas:
//
//   · el recurso no está en el catálogo            → FALTA_DATO de catálogo
//   · el recurso está y nunca se cotizó            → SIN_PRECIO
//   · el recurso está, se cotizó, y hace 14 meses  → PRECIO_DESACTUALIZADO
//
// Las tres se ven iguales como `costoUnitario: null`, y las tres se resuelven distinto. La tercera
// además es la peligrosa: tiene número, suma, y el total sale con cara de completo.
//
// ═══ SIN_PRECIO NO ES CERO ═══
//
// Está dicho tres veces en el programa (§10, §14, §42) porque es el error que más plata mueve. Un
// subcontrato de sanitaria sin cotizar no cuesta $0: cuesta lo que va a costar, y todavía no se
// sabe. La única salida honesta es que el total NO SE AFIRME, y eso lo hace `costo.mjs` preguntando
// por `sumable()` del contrato.

import { ESTADO, TIPO_ISSUE, SEVERIDAD, issue } from './contrato.mjs'

/** Cuántos días vale un precio de material antes de que haya que volver a preguntarlo. No es una
 *  ley: es el corte con el que `plano/certeza.mjs` ya mide «plata en precios viejos», y se deja
 *  parametrizable porque en un mercado con inflación mensual 180 días es mucho. */
export const DIAS_VIGENCIA = 180

/** Los tipos de recurso que explota una composición (§9). Son los que ya usa `analisis_linea`. */
export const TIPO_RECURSO = Object.freeze({
  MANO_OBRA: 'mano_obra',
  CARGA_SOCIAL: 'carga_social',
  MATERIAL: 'material',
  EQUIPO: 'equipo',
  SUBCONTRATO: 'subcontrato',
  SERVICIO: 'servicio',
  OTRO: 'otro',
})

/**
 * UN RECURSO. Una cosa que se compra o se contrata. NO tiene precio, a propósito.
 * PURA, congelada.
 */
export function recurso({ codigo, nombre, tipo = TIPO_RECURSO.OTRO, unidad = null, desperdicio = 0 } = {}) {
  if (!codigo) throw new Error('un recurso sin código no se puede referenciar desde una composición')
  return Object.freeze({ codigo: String(codigo), nombre: nombre ?? String(codigo), tipo, unidad, desperdicio: Number(desperdicio) || 0 })
}

/**
 * UNA OBSERVACIÓN DE PRECIO. Alguien vio que esto costaba tanto, tal día, según tal fuente.
 *
 * `fuente` es obligatoria y no acepta `null`: un precio sin fuente no se puede defender delante de
 * un cliente ni volver a consultar cuando venza. «Base Maestra», «cotización de Ferretería X del
 * 12/08», «lista de precios ACINDAR» son fuentes; «el sistema» no lo es.
 *
 * PURA, congelada.
 */
export function observacionDePrecio({ recursoCodigo, precio, moneda = 'ARS', fuente, observadoEn, vigenciaDias = DIAS_VIGENCIA } = {}) {
  if (!recursoCodigo) throw new Error('una observación de precio sin recurso no se puede aplicar a nada')
  if (!fuente) throw new Error(`el precio de ${recursoCodigo} vino sin fuente: un precio que no se puede volver a consultar no es un precio`)
  if (!observadoEn) throw new Error(`el precio de ${recursoCodigo} vino sin fecha: sin fecha no se puede saber si venció`)
  return Object.freeze({
    recursoCodigo: String(recursoCodigo),
    precio: precio === null || precio === undefined ? null : Number(precio),
    moneda: String(moneda),
    fuente: String(fuente),
    observadoEn: String(observadoEn).slice(0, 10),
    vigenciaDias: Number(vigenciaDias),
  })
}

const diasEntre = (desde, hasta) => Math.floor((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000)
const iso = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10))

/**
 * EN QUÉ ESTADO ESTÁ ESTA OBSERVACIÓN HOY. PURA.
 *
 * Devuelve `{estado, antiguedadDias, porQue}`. `PRECIO_DESACTUALIZADO` NO es un estado de dominio
 * —los estados son once y no se agregan— así que sale como `HISTORICO`: el precio existió, es real,
 * y no sirve para cerrar un presupuesto sin que alguien lo confirme. Es exactamente la distinción
 * `HISTORICO ≠ VALIDADO` del §42 aplicada a un número que sí tiene valor.
 */
export function estadoDeObservacion(obs, { hoy = new Date() } = {}) {
  if (!obs) return { estado: ESTADO.FALTA_DATO, antiguedadDias: null, porQue: 'no hay ninguna observación de precio para este recurso' }
  if (obs.precio === null) return { estado: ESTADO.FALTA_DATO, antiguedadDias: null, porQue: `«${obs.fuente}» registró el recurso pero sin precio` }
  const dias = diasEntre(obs.observadoEn, iso(hoy))
  if (dias < 0) return { estado: ESTADO.ERROR, antiguedadDias: dias, porQue: `el precio está fechado el ${obs.observadoEn}, en el futuro` }
  if (dias > obs.vigenciaDias) {
    return { estado: ESTADO.HISTORICO, antiguedadDias: dias, porQue: `el precio es del ${obs.observadoEn} (${dias} días, vigencia ${obs.vigenciaDias}): sirve de referencia y no cierra un presupuesto` }
  }
  return { estado: ESTADO.EXTRAIDO, antiguedadDias: dias, porQue: null }
}

/**
 * EL PRECIO VIGENTE DE UN RECURSO, elegido entre todas sus observaciones. PURA.
 *
 * Gana la observación MÁS RECIENTE, y el desempate por fuente es alfabético para que dos corridas
 * con los mismos datos elijan la misma (§39). No se promedia: promediar dos observaciones de
 * fuentes distintas fabrica un precio que nadie vio nunca y que no se puede citar.
 */
export function precioVigente(recursoCodigo, observaciones = [], { hoy = new Date() } = {}) {
  const propias = observaciones
    .filter((o) => o.recursoCodigo === recursoCodigo && o.precio !== null)
    .sort((a, b) => String(b.observadoEn).localeCompare(String(a.observadoEn)) || String(a.fuente).localeCompare(String(b.fuente)))
  const elegida = propias[0] ?? null
  const est = estadoDeObservacion(elegida, { hoy })
  return Object.freeze({
    recursoCodigo,
    valor: est.estado === ESTADO.ERROR || est.estado === ESTADO.FALTA_DATO ? null : elegida.precio,
    moneda: elegida?.moneda ?? null,
    fuente: elegida?.fuente ?? null,
    observadoEn: elegida?.observadoEn ?? null,
    estado: est.estado,
    antiguedadDias: est.antiguedadDias,
    porQue: est.porQue,
    descartadas: propias.length - (elegida ? 1 : 0),
  })
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// FX EXPLÍCITO (§11)
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * UN TIPO DE CAMBIO OBSERVADO. Cinco datos y ninguno opcional: `pair`, `rate`, `source`,
 * `observedAt`, y el `appliedAt` lo pone quien lo aplica, no quien lo observa.
 *
 * ═══ POR QUÉ NO ALCANZA CON UN NÚMERO ═══
 *
 * `base-maestra-ajuste.mjs` ya aprendió esto por la vía cara: la planilla tenía coeficientes
 * sueltos que PARECÍAN tipos de cambio, y `clasificarAjuste` devuelve UNKNOWN cuando no puede
 * probar que lo sean. Un coeficiente histórico no probado NO se reinterpreta como FX — se declara
 * desconocido. Este módulo es el otro lado de esa regla: cuando SÍ es un tipo de cambio, viaja con
 * todo lo que hace falta para volver a verificarlo.
 *
 * PURA, congelada.
 */
export function tipoDeCambio({ par, tasa, fuente, observadoEn } = {}) {
  if (!par || !/^[A-Z]{3}\/[A-Z]{3}$/.test(par)) throw new Error(`el par de monedas se escribe «USD/ARS», no «${par}»`)
  if (!Number.isFinite(Number(tasa)) || Number(tasa) <= 0) throw new Error(`«${tasa}» no es un tipo de cambio`)
  if (!fuente) throw new Error('un tipo de cambio sin fuente no se puede verificar')
  if (!observadoEn) throw new Error('un tipo de cambio sin fecha no dice de cuándo es')
  return Object.freeze({ par, tasa: Number(tasa), fuente: String(fuente), observadoEn: String(observadoEn).slice(0, 10) })
}

/**
 * CONVERTIR UN MONTO CON UN FX DECLARADO. PURA.
 *
 * Si no hay FX para el par, NO convierte y NO devuelve el monto original disfrazado: devuelve
 * `FALTA_DATO`. Un monto en dólares sumado a pesos como si fueran la misma unidad es el mismo error
 * que multiplicar m³ por un precio por m², con la diferencia de que este da un número plausible.
 */
export function aplicarFx({ monto, desde, hasta, fx = null, aplicadoEn = null } = {}) {
  if (desde === hasta) return { valor: Number(monto), moneda: hasta, estado: ESTADO.CALCULADO, fx: null }
  const par = `${desde}/${hasta}`
  if (!fx) {
    return { valor: null, moneda: null, estado: ESTADO.FALTA_DATO, fx: null, porQue: `hay un monto en ${desde} y el presupuesto va en ${hasta}: falta el tipo de cambio ${par}` }
  }
  if (fx.par === par) {
    return { valor: Number(monto) * fx.tasa, moneda: hasta, estado: ESTADO.CALCULADO, fx: Object.freeze({ ...fx, aplicadoEn: aplicadoEn ?? iso(new Date()) }), formula: `${monto} ${desde} × ${fx.tasa} (${fx.fuente}, ${fx.observadoEn})` }
  }
  if (fx.par === `${hasta}/${desde}`) {
    return { valor: Number(monto) / fx.tasa, moneda: hasta, estado: ESTADO.CALCULADO, fx: Object.freeze({ ...fx, aplicadoEn: aplicadoEn ?? iso(new Date()) }), formula: `${monto} ${desde} ÷ ${fx.tasa} (${fx.fuente}, ${fx.observadoEn})` }
  }
  return { valor: null, moneda: null, estado: ESTADO.FALTA_DATO, fx: null, porQue: `el tipo de cambio disponible es ${fx.par} y hace falta ${par}` }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// LOS ISSUES QUE SALEN DE ACÁ
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * DE UN PRECIO RESUELTO A UN ISSUE DE LA COLA, O A NADA. PURA.
 *
 * `impacto` es la plata en juego —cantidad × lo que costaría— y se pasa desde afuera porque este
 * módulo no sabe cuánta cantidad hay. Cuando no se puede calcular va `null`, NUNCA cero: el issue
 * de un recurso sin precio y sin cantidad conocida es el más peligroso de todos y mandarlo al fondo
 * de la cola con un cero sería enterrarlo (ver el comentario de `issue()` en el contrato).
 */
export function issueDePrecio(precio, { impacto = null, critico = false } = {}) {
  if (precio.estado === ESTADO.EXTRAIDO) return null
  if (precio.estado === ESTADO.HISTORICO) {
    return issue({
      type: TIPO_ISSUE.PRECIO_DESACTUALIZADO,
      severity: critico ? SEVERIDAD.ALTA : SEVERIDAD.MEDIA,
      entity: precio.recursoCodigo, impact: impacto,
      evidence: { fuente: precio.fuente, observadoEn: precio.observadoEn, antiguedadDias: precio.antiguedadDias },
      recommended_action: 'set_resource_price',
      detalle: precio.porQue,
    })
  }
  return issue({
    type: TIPO_ISSUE.SIN_PRECIO,
    severity: critico ? SEVERIDAD.BLOQUEANTE : SEVERIDAD.ALTA,
    entity: precio.recursoCodigo, impact: impacto,
    evidence: precio.fuente ? { fuente: precio.fuente, observadoEn: precio.observadoEn } : null,
    recommended_action: 'set_resource_price',
    detalle: precio.porQue,
  })
}
