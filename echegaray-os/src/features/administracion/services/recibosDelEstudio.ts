// QUÉ RECIBOS DEL ESTUDIO CORRESPONDEN A UNA PERSONA EN LA QUINCENA QUE SE LIQUIDA. Una sola respuesta.
//
// Dueño, 02/10/2026: «hiciste mal lo de los mensualizados porque sólo me consideraste la 2da quincena, ellos tienen
// dos recibos pero se les paga por mes». El estudio emite DOS recibos por mes a todos (1ª y 2ª quincena), pero al
// mensualizado (jefes de obra, oficina) la empresa le paga UNA vez, por el mes entero: lo que se deposita es la suma
// de los dos netos. Hasta hoy cada punto del código elegía `nomina_recibo_neto` por el período de la quincena
// liquidada (`Q2-09/2026`) y el mensual quedaba con la mitad. Cuadro, saldos, recibo de pago, control contra el
// estudio y reimpresión piden acá los recibos: si cada uno eligiera por su cuenta, volverían a discrepar.
//
// NUNCA SE ASUME CERO. Si de los dos recibos del mes falta uno, `total` es `null` y `faltan` dice cuál: un banco
// armado con la mitad del mes es exactamente el error que esta función existe para impedir.

import { mismoCuil } from './cuil.ts'

export type ModalidadDeCobro = 'quincenal' | 'mensual'

export interface FilaDeRecibo { cuil: string | null; periodo: string; neto: number | string }

export interface ReciboDelEstudio { periodo: string; neto: number }

export interface RecibosDelEstudio {
  modalidad: ModalidadDeCobro
  /** Los períodos que corresponden (uno si es quincenal, los dos del mes si es mensual), en orden. */
  periodos: string[]
  /** Los que el estudio ya cargó, en el orden de `periodos`. */
  recibos: ReciboDelEstudio[]
  /** Los períodos que corresponden y el estudio todavía no cargó. */
  faltan: string[]
  /** Suma de los netos; `null` si falta alguno (no se asume cero). */
  total: number | null
}

const r2 = (n: number) => Math.round(n * 100) / 100

// ═══ QUIÉN COBRA POR MES, A ESTOS EFECTOS: LA TARIFA VIGENTE A ESA QUINCENA (dueño, 02/10/2026) ═══
//
// «Los cambios de los mensualizados son solamente desde sept». La primera versión decidía por el cuadro (jefe de obra
// por puesto → Oficina → mensual) y la 1ª quincena de AGOSTO de Maldonado mostraba los dos recibos sumados
// ($1.326.667,64), aunque hasta agosto se le liquidaba por hora. Lo que lo vuelve mensual es el neto mensual de
// `persona_tarifa` vigente a esa quincena (desde 2026-09-01), no el puesto: el puesto sigue decidiendo en qué cuadro
// cae (`cobraPorMes`), pero no cuántos recibos del estudio le corresponden.

/** Mensual sólo con neto mensual vigente. Una sola regla para el cuadro, el control del servidor y la reimpresión. */
export const modalidadDeCobro = (netoMensualVigente: number | null | undefined): ModalidadDeCobro =>
  netoMensualVigente != null && Number.isFinite(netoMensualVigente) ? 'mensual' : 'quincenal'

/** La modalidad que rige al `hasta` de una quincena, sobre las tarifas de la persona (la más nueva con `desde ≤ hasta`). */
export function modalidadDeCobroAl(
  tarifas: readonly { desde: string; netoMensual: number | null }[], hasta: string,
): ModalidadDeCobro {
  let vigente: { desde: string; netoMensual: number | null } | null = null
  for (const t of tarifas) if (t.desde <= hasta && (!vigente || t.desde > vigente.desde)) vigente = t
  return modalidadDeCobro(vigente?.netoMensual)
}

// ═══ EL MES SE LIQUIDA UNA VEZ, EN LA 2ª QUINCENA (dueño, 02/10/2026) ═══
//
// «Recién en la q2 me tenés que poner los valores de los mensuales, poneme lo que dice el saldo bancario de q1 y en
// q2 que sea q1+q2». La 1ª quincena mostraba el mes entero otra vez (sueldo, banco de los dos recibos, efectivo): con
// un recibo de pago o un «pagado» en cada quincena, el mes se pagaba dos veces. En la 1ª queda el recibo del estudio
// de esa quincena, como dato del banco; sueldo, efectivo y saldo son de la 2ª.

/** ¿Es la 1ª quincena de alguien que cobra por mes? Entonces no liquida: lo hace la 2ª. */
export const seLiquidaEnLa2da = (modalidad: ModalidadDeCobro, desde: string): boolean =>
  modalidad === 'mensual' && Number(desde.slice(8, 10)) === 1

/** Lo que se le dice a quien intenta emitir el recibo de pago desde la 1ª quincena. Corto: el dueño no quiere más. */
export const MOTIVO_SE_LIQUIDA_EN_LA_2DA = 'Se liquida en la 2ª quincena.'

/** Lo pagado en la 1ª quincena a quien cobra por mes: en la 2ª cuenta contra el mes. */
export interface PagadoDeLa1ra { banco: number; efectivo: number }

/**
 * LO REGISTRADO MANDA (`pagado_banco`, `pagado_efectivo` de la 1ª); sin registro por banco, lo que el extracto muestra
 * girado en la ventana de la 1ª (el depósito de su recibo, un adelanto). Un 0 registrado es «nada anotado», igual que
 * en `pagoAlMarcarPagada`: marcar pagada la 1ª de un mensual no tiene saldo que dar y escribe 0, y ese 0 no puede
 * tapar un giro que el banco sí hizo. `null` = no hay nada pagado que llevar.
 */
export function pagadoDeLa1ra(d: {
  registradoBanco: number | null; registradoEfectivo: number | null; giradoEnLa1ra: number
}): PagadoDeLa1ra | null {
  const hay = (n: number | null): n is number => n != null && Number.isFinite(n) && n !== 0
  const banco = r2(hay(d.registradoBanco) ? d.registradoBanco : d.giradoEnLa1ra)
  const efectivo = r2(hay(d.registradoEfectivo) ? d.registradoEfectivo : 0)
  return banco === 0 && efectivo === 0 ? null : { banco, efectivo }
}

/** `2026-09-16` → `Q2-09/2026`, la clave de período de `nomina_recibo_neto`. */
export const periodoDeLaQuincena = (desde: string): string =>
  `Q${Number(desde.slice(8, 10)) === 1 ? 1 : 2}-${desde.slice(5, 7)}/${desde.slice(0, 4)}`

/** Quincenal: la de esa quincena. Mensual: las dos del mes de esa quincena. */
export function periodosQueCorresponden(modalidad: ModalidadDeCobro, desde: string): string[] {
  if (modalidad === 'quincenal') return [periodoDeLaQuincena(desde)]
  const mes = `${desde.slice(5, 7)}/${desde.slice(0, 4)}`
  return [`Q1-${mes}`, `Q2-${mes}`]
}

export function recibosDelEstudio(d: {
  cuil: string | null; modalidad: ModalidadDeCobro; desde: string; filas: readonly FilaDeRecibo[]
}): RecibosDelEstudio {
  const periodos = periodosQueCorresponden(d.modalidad, d.desde)
  const recibos: ReciboDelEstudio[] = []
  const faltan: string[] = []
  for (const periodo of periodos) {
    // `find`: la primera carga, como siempre. Dos cargas del mismo período no se suman (serían el mismo recibo).
    const f = d.cuil ? d.filas.find((x) => x.periodo === periodo && mismoCuil(x.cuil, d.cuil)) : undefined
    const neto = f == null ? NaN : Number(f.neto)
    if (Number.isFinite(neto)) recibos.push({ periodo, neto }); else faltan.push(periodo)
  }
  const total = faltan.length === 0 ? r2(recibos.reduce((s, r) => s + r.neto, 0)) : null
  return { modalidad: d.modalidad, periodos, recibos, faltan, total }
}

/**
 * ¿Esta resta de `liquidacion_arrastre` es el neto de un recibo que el banco ya trae entero? Al mensual el recibo de la
 * 1ª quincena ya está sumado en su banco: sumarle además «Saldo 1ª quincena» lo contaría dos veces. Un origen mezclado
 * («Q1-09/2026, Q2-08/2026») no se descarta entero: trae plata de otro recibo que sí falta.
 */
export function arrastreYaIncluido(periodoOrigen: string, periodosDelBanco: readonly string[]): boolean {
  const origenes = periodoOrigen.split(',').map((p) => p.trim()).filter(Boolean)
  return origenes.length > 0 && origenes.every((o) => periodosDelBanco.includes(o))
}
