// LAS REGLAS DE LA PANTALLA 28 — antigüedad, previsión, comportamiento de pago y plan del día.
//
// ═══ LA ANTIGÜEDAD NO SE CALCULA ACÁ: LA PUBLICA LA VISTA ═══
//
// Este archivo la calculaba sobre la lista de certificados, con el argumento de que así la barra y
// la tabla de abajo no podían discrepar. Al integrar los frentes quedaron DOS definiciones del
// mismo aging y hay que quedarse con una: gana `public.cliente_cuenta_corriente`, y no por
// jerarquía sino por alcance.
//
//   · La vista suma TODAS las cuentas por cobrar (`public.cobranzas`, la réplica viva del Sheet).
//     `certificado_cliente` es un SUBCONJUNTO: el sync sólo materializa las filas que clasifica
//     como certificado y descarta los ajustes. Una barra armada sobre el subconjunto le diría al
//     dueño que se le debe menos de lo que se le debe.
//   · Las otras cuatro cifras de la misma pantalla —saldo, vencido, DSO, efectividad— ya salen de
//     la vista. Un aging de otra fuente puede no sumar el saldo que está escrito arriba, y una
//     pantalla que se contradice a sí misma no se usa para llamar a nadie.
//   · Es la única definición que también leen el chat y Claude Code. Realidad única.
//
// Lo que SÍ queda acá es `bandaDe`: en qué tramo cae UN documento, para poder filtrar la tabla al
// tocar la barra. No produce totales y no es una segunda definición del aging — es la pertenencia
// de una fila, con los mismos bordes y la misma fecha (la columna Q) que usa la vista.
//
// Todo lo de este archivo es función pura sobre datos ya leídos: sin `Date.now()`, sin huso, sin
// base. `hoy` entra como argumento ISO porque un test que depende del reloj de la máquina afirma
// el estado del mundo, no la regla.

import { diasEntre } from './cobranzaFormato.ts'
import type { CertificadoCliente, CuentaCorriente } from '../types/cobranzas.ts'

export type ClaveBanda = 'por_vencer' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90'

/** Los cinco tramos y su rótulo LITERAL del mockup (`28:139`): guion medio con espacios. */
export const BANDAS: { clave: ClaveBanda; rotulo: string }[] = [
  { clave: 'por_vencer', rotulo: 'Por vencer' },
  { clave: 'd1_30', rotulo: '1 – 30 días' },
  { clave: 'd31_60', rotulo: '31 – 60 días' },
  { clave: 'd61_90', rotulo: '61 – 90 días' },
  { clave: 'd90', rotulo: '+ 90 días' },
]

/**
 * Los documentos que TODAVÍA SE COBRAN. Un cobrado ya no es deuda.
 *
 * NO se filtra además por «retenido»: eso NO es un estado de certificado y la base no lo puede
 * guardar. El fondo de reparo es la columna `reparo` de un certificado que por lo demás sigue
 * emitido, tiene su propia cifra arriba, y la vista ya lo excluye del saldo por su lado.
 */
export const sigueEnLaCalle = (d: CertificadoCliente): boolean => d.estado !== 'cobrado'

/** En qué tramo cae un documento. `null` cuando no tiene vencimiento: NO se asume que vence hoy. */
export function bandaDe(vence: string | null, hoy: string): ClaveBanda | null {
  const d = diasEntre(vence, hoy)
  if (d === null) return null
  if (d <= 0) return 'por_vencer'
  if (d <= 30) return 'd1_30'
  if (d <= 60) return 'd31_60'
  if (d <= 90) return 'd61_90'
  return 'd90'
}

/** Los cinco tramos con su plata, listos para dibujar. */
export interface Banda {
  clave: ClaveBanda
  rotulo: string
  monto: number
  /** Porcentaje del ancho de la barra. Ver la regla del 2 % abajo. */
  ancho: number
}

/**
 * LA BARRA DE ANTIGÜEDAD Y SU LEYENDA, ARMADAS CON LOS NÚMEROS DE LA VISTA.
 *
 * Entra la fila de `cliente_cuenta_corriente` y sale el reparto de anchos. NO suma documentos: los
 * montos ya vienen calculados por Postgres (ver el bloque de arriba). Con `cuenta` en `null` —el
 * cliente no tiene ni un movimiento en Cobranzas— las cinco bandas van en cero y la barra se dibuja
 * gris entera, que es «no hay deuda registrada» y no «no se pudo leer»: eso lo dice la pantalla.
 *
 * EL ANCHO NO ES LA PROPORCIÓN PELADA. Un tramo sin deuda se dibuja igual, con 2 % y en gris
 * (`28:129`): sin ese resto, la barra tendría tres bloques y el que mira no sabría si «61–90» no
 * aparece porque está en cero o porque la pantalla no lo muestra. Los tramos con plata se reparten
 * lo que queda. Medido contra el mockup: 9,30 / 5,80 / 2,40 sobre 17,50 con dos tramos vacíos da
 * 51 / 32 / 13 + 2 + 2, que son exactamente los anchos del `.dc.html`.
 */
export function bandasAntiguedad(cuenta: CuentaCorriente | null): Banda[] {
  const monto: Record<ClaveBanda, number> = {
    por_vencer: cuenta?.aging_por_vencer ?? 0,
    d1_30: cuenta?.aging_1_30 ?? 0,
    d31_60: cuenta?.aging_31_60 ?? 0,
    d61_90: cuenta?.aging_61_90 ?? 0,
    d90: cuenta?.aging_mas_90 ?? 0,
  }
  const valores = Object.values(monto)
  const total = valores.reduce((s, x) => s + x, 0)
  const vacias = valores.filter((x) => x <= 0).length
  const repartible = 100 - vacias * 2
  return BANDAS.map(({ clave, rotulo }) => {
    const m = monto[clave]
    const ancho = total <= 0 ? 20 : m <= 0 ? 2 : Math.round((m / total) * repartible)
    return { clave, rotulo, monto: m, ancho }
  })
}

/**
 * LA PLATA DE LOS DOCUMENTOS QUE NO ENTRAN EN NINGUNA BANDA, porque no tienen vencimiento.
 *
 * Un control que no pudo mirar no dice «no hay»: la pantalla lo escribe al lado de la barra. Se
 * mide sobre los certificados y no sobre la vista a propósito — la vista no puede publicarlo,
 * porque una fila de Cobranzas sin fecha en la columna Q tampoco entra en su aging.
 */
export function sinVencimiento(documentos: CertificadoCliente[], hoy: string): number {
  return documentos
    .filter(sigueEnLaCalle)
    .filter((d) => bandaDe(d.vence, hoy) === null)
    .reduce((s, d) => s + d.monto, 0)
}

/**
 * LO QUE LA BARRA MUESTRA Y LA TABLA DE ABAJO NO PUEDE EXPLICAR.
 *
 * ═══ POR QUÉ HACE FALTA ESTE NÚMERO ═══
 *
 * La barra sale de `cliente_cuenta_corriente`, que suma TODAS las cuentas por cobrar de la réplica
 * viva de Cobranzas. La tabla sale de `certificado_cliente`, que es un SUBCONJUNTO: el sync sólo
 * materializa las filas que clasifica como certificado, descarta los ajustes y deja afuera las que
 * no resuelven a un cliente. Tener una sola definición del aging no hace que las dos listas tengan
 * las mismas filas — mueve el problema de «dos números que se contradicen» a «un número y una tabla
 * que no lo explica entera».
 *
 * Así que se mide y se escribe. `0` = la tabla explica el saldo completo. Positivo = hay plata al
 * cobro que no tiene certificado detrás, y la pantalla lo dice en vez de dejar que el que mira
 * sume la columna y crea que le faltan filas.
 *
 * Negativo se devuelve como 0: significaría que hay certificados por más plata que el saldo del
 * Sheet —normalmente, certificados nacidos en la app que todavía no llegaron a Cobranzas— y eso no
 * es un faltante de la tabla, que es lo único que esta función afirma.
 */
export function saldoSinCertificado(
  documentos: CertificadoCliente[], cuenta: CuentaCorriente | null,
): number {
  if (!cuenta) return 0
  const enCertificados = documentos.filter(sigueEnLaCalle).reduce((s, d) => s + d.monto, 0)
  return Math.max(0, Math.round(cuenta.saldo - enCertificados))
}

export interface SemanaPrevista {
  /** Lunes (o día de arranque) del tramo, ISO. Es el rótulo del eje. */
  desde: string
  monto: number
  /** Qué documentos caen en la semana, para el `title` de la barra. */
  documentos: CertificadoCliente[]
}

/**
 * LAS OCHO SEMANAS DE «PREVISIÓN DE COBRO» (`28:340`).
 *
 * Cada tramo va de `hoy+1+7k` a `hoy+7+7k`, que es lo que produce los rótulos 25/08 · 01/09 · …
 * del mockup con `hoy = 24/08`.
 *
 * LO QUE YA VENCIÓ NO SE DIBUJA EN EL FUTURO. El mockup ubica el certificado vencido en la semana
 * de su PROMESA de pago, y una promesa es un dato que hoy no tiene fuente en el OS. Antes que
 * elegirle una semana inventada, la plata vencida sale del gráfico y vuelve como `vencidoSinFecha`
 * — un número que la pantalla escribe al lado con todas las letras.
 */
export function previsionSemanal(
  documentos: CertificadoCliente[], hoy: string,
): { semanas: SemanaPrevista[]; vencidoSinFecha: number } {
  const base = Date.parse(`${hoy.slice(0, 10)}T00:00:00Z`)
  const semanas: SemanaPrevista[] = Array.from({ length: 8 }, (_, k) => ({
    desde: new Date(base + (1 + 7 * k) * 86_400_000).toISOString().slice(0, 10),
    monto: 0,
    documentos: [],
  }))
  let vencidoSinFecha = 0
  for (const d of documentos.filter(sigueEnLaCalle)) {
    const dias = diasEntre(hoy, d.vence)
    if (dias === null || dias <= 0) { vencidoSinFecha += d.monto; continue }
    const k = Math.floor((dias - 1) / 7)
    if (k > 7) continue
    semanas[k].monto += d.monto
    semanas[k].documentos.push(d)
  }
  return { semanas, vencidoSinFecha }
}

export interface Comportamiento {
  /** Días promedio entre emitir y cobrar, de la vista. `null` = no cobró nada en la ventana. */
  diasCobroPromedio: number | null
  /** Cuántos documentos observó sobre cuántos se le emitieron. */
  observados: number
  emitidos: number
}

/**
 * CÓMO PAGA ESTE CLIENTE.
 *
 * ═══ «PAGA A TIEMPO» Y «ATRASO PROMEDIO» NO ESTÁN, Y NO ES UN RECORTE ═══
 *
 * Se calculaban comparando la fecha de cobro contra la de vencimiento. Las dos son LA MISMA CELDA:
 * la columna Q de Cobranzas guarda la fecha esperada mientras el cobro está pendiente y se PISA con
 * la real al cobrarse. La resta daba cero siempre — un 100 % de puntualidad que se cumplía solo,
 * para cualquier cliente, incluido el que paga con noventa días de atraso.
 *
 * Lo que sí es medible con esta fuente es `dias_cobro_promedio` (emisión → cobro), que la vista ya
 * publica y es el comportamiento REALMENTE observado. La tasa de pago en término queda computable
 * hacia adelante, cuando `esquema_pago.reprogramaciones` acumule las fechas prometidas.
 *
 * «PAGA EL TOTAL» del mockup tampoco está: para afirmar que pagó el 96 % de lo facturado hace falta
 * el importe cobrado de cada documento, y `certificado_cliente` guarda el emitido y el estado.
 */
export function comportamientoDePago(
  documentos: CertificadoCliente[], cuenta: CuentaCorriente | null,
): Comportamiento {
  return {
    diasCobroPromedio: cuenta?.dias_cobro_promedio ?? null,
    observados: documentos.filter((d) => d.observacion != null && d.observacion !== '').length,
    emitidos: documentos.length,
  }
}

export type AccionPlan = 'remedicion' | 'recordatorio' | 'aviso'

export interface ItemPlan {
  documento: CertificadoCliente
  tono: 'neg' | 'warn' | 'curso'
  /** Por qué está en el plan, escrito con datos del documento. Nunca prosa inventada. */
  motivo: string
  accion: AccionPlan
  rotulo: string
}

const ROTULO: Record<AccionPlan, string> = {
  remedicion: 'Coordinar remedición',
  recordatorio: 'Enviar recordatorio',
  aviso: 'Programar aviso',
}

/**
 * EL PLAN DE COBRANZA DE HOY (`28:367`) — qué documento pide una acción y cuál.
 *
 * El orden es el del daño: lo trabado primero (no avanza sin una decisión), después lo vencido
 * (cada día cuesta), y al final lo que vence pronto y todavía se puede evitar. Dentro de cada
 * grupo manda el monto.
 *
 * EL «POR QUÉ» SE ARMA CON LOS DATOS DEL DOCUMENTO. El mockup escribe frases de gestión («Sosa
 * comprometió el pago…») que salen de un historial de llamadas y promesas que el OS todavía no
 * guarda; escribirlas igual sería inventar. Acá el motivo dice los días, el monto y la observación
 * del cliente, que son hechos.
 */
export function planDeCobranza(documentos: CertificadoCliente[], hoy: string): ItemPlan[] {
  const items: ItemPlan[] = []
  for (const d of documentos.filter(sigueEnLaCalle)) {
    const dias = diasEntre(d.vence, hoy)
    const vencido = dias != null && dias > 0
    if (d.estado === 'en_disputa' || d.estado === 'observado') {
      const cola = d.observacion ? ` · ${d.observacion}` : ''
      items.push({
        documento: d, tono: 'warn', accion: 'remedicion', rotulo: ROTULO.remedicion,
        motivo: `${vencido ? `${dias} días vencido y ` : ''}observado por el cliente${cola}`,
      })
    } else if (vencido) {
      items.push({
        documento: d, tono: 'neg', accion: 'recordatorio', rotulo: ROTULO.recordatorio,
        motivo: `${dias} días vencido. Sin cobro registrado.`,
      })
    } else if (dias != null && dias >= -30) {
      items.push({
        documento: d, tono: 'curso', accion: 'aviso', rotulo: ROTULO.aviso,
        motivo: `Vence en ${-dias} días. Sin aviso previo programado.`,
      })
    }
  }
  const peso = { warn: 0, neg: 1, curso: 2 }
  return items.sort((a, b) => peso[a.tono] - peso[b.tono] || b.documento.monto - a.documento.monto)
}
