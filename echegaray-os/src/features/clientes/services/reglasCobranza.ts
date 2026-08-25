// LAS REGLAS DE LA PANTALLA 28 — antigüedad, previsión, comportamiento de pago y plan del día.
//
// ═══ POR QUÉ SE CALCULAN ACÁ Y NO EN LA VISTA DE POSTGRES ═══
//
// `cliente_cuenta_corriente` publica saldo, vencido, DSO, efectividad y fondo de reparo: cinco
// cifras que necesitan noventa días de historia y que la lista de documentos abierta NO tiene. La
// ANTIGÜEDAD es otra cosa: sale exactamente de los mismos documentos que dibuja la tabla de abajo,
// y por eso se calcula UNA vez, acá, sobre esa lista. Si la vista también la calculara, la barra y
// la tabla podrían discrepar — y el día que discrepen, nadie va a saber cuál de las dos miente.
//
// Todo lo de este archivo es función pura sobre datos ya leídos: sin `Date.now()`, sin huso, sin
// base. `hoy` entra como argumento ISO porque un test que depende del reloj de la máquina afirma
// el estado del mundo, no la regla.

import { diasEntre } from './cobranzaFormato.ts'
import type { CertificadoCliente } from '../types/cobranzas.ts'

export type ClaveBanda = 'por_vencer' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90'

/** Los cinco tramos y su rótulo LITERAL del mockup (`28:139`): guion medio con espacios. */
export const BANDAS: { clave: ClaveBanda; rotulo: string }[] = [
  { clave: 'por_vencer', rotulo: 'Por vencer' },
  { clave: 'd1_30', rotulo: '1 – 30 días' },
  { clave: 'd31_60', rotulo: '31 – 60 días' },
  { clave: 'd61_90', rotulo: '61 – 90 días' },
  { clave: 'd90', rotulo: '+ 90 días' },
]

/** Los documentos que TODAVÍA SE COBRAN. Un cobrado ya no es deuda y un retenido no es exigible:
 *  el fondo de reparo tiene su propia cifra arriba y sumarlo a la antigüedad diría que el cliente
 *  está en mora por una plata que el contrato dice que no puede pedir. */
export const sigueEnLaCalle = (d: CertificadoCliente): boolean =>
  d.estado !== 'cobrado' && d.estado !== 'retenido'

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

export interface Banda {
  clave: ClaveBanda
  rotulo: string
  monto: number
  /** Porcentaje del ancho de la barra. Ver la regla del 2 % abajo. */
  ancho: number
}

/**
 * LA BARRA DE ANTIGÜEDAD Y SU LEYENDA.
 *
 * EL ANCHO NO ES LA PROPORCIÓN PELADA. Un tramo sin deuda se dibuja igual, con 2 % y en gris
 * (`28:129`): sin ese resto, la barra tendría tres bloques y el que mira no sabría si «61–90» no
 * aparece porque está en cero o porque la pantalla no lo muestra. Los tramos con plata se reparten
 * lo que queda. Medido contra el mockup: 9,30 / 5,80 / 2,40 sobre 17,50 con dos tramos vacíos da
 * 51 / 32 / 13 + 2 + 2, que son exactamente los anchos del `.dc.html`.
 *
 * `sinVencimiento` es la plata que NO entró en ninguna banda porque el documento no tiene fecha.
 * Se devuelve aparte para que la pantalla lo declare: un control que no pudo mirar no puede decir
 * «no hay».
 */
export function bandasAntiguedad(
  documentos: CertificadoCliente[], hoy: string,
): { bandas: Banda[]; sinVencimiento: number } {
  const monto = new Map<ClaveBanda, number>(BANDAS.map((b) => [b.clave, 0]))
  let sinVencimiento = 0
  for (const d of documentos.filter(sigueEnLaCalle)) {
    const b = bandaDe(d.vence, hoy)
    if (b === null) sinVencimiento += d.monto
    else monto.set(b, (monto.get(b) ?? 0) + d.monto)
  }
  const total = [...monto.values()].reduce((s, x) => s + x, 0)
  const vacias = [...monto.values()].filter((x) => x <= 0).length
  const repartible = 100 - vacias * 2
  const bandas = BANDAS.map(({ clave, rotulo }) => {
    const m = monto.get(clave) ?? 0
    const ancho = total <= 0 ? 20 : m <= 0 ? 2 : Math.round((m / total) * repartible)
    return { clave, rotulo, monto: m, ancho }
  })
  return { bandas, sinVencimiento }
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
  /** % de documentos cobrados en fecha o antes. `null` = todavía no cobró ninguno. */
  pagaATiempoPct: number | null
  /** Días promedio de atraso de lo cobrado (los adelantos cuentan 0, no restan). */
  atrasoPromedioDias: number | null
  /** Cuántos documentos observó sobre cuántos se le emitieron. */
  observados: number
  emitidos: number
}

/**
 * CÓMO PAGA ESTE CLIENTE — sale de los documentos ya cobrados, no de una encuesta.
 *
 * «PAGA EL TOTAL» DEL MOCKUP NO ESTÁ ACÁ y no es un olvido: para afirmar que pagó el 96 % de lo
 * facturado hace falta el importe cobrado de cada documento, y `certificado_cliente` guarda el
 * monto emitido y el estado, no el pago parcial. Se declara sin fuente en la pantalla antes que
 * publicar un porcentaje que nadie puede reproducir.
 */
export function comportamientoDePago(documentos: CertificadoCliente[]): Comportamiento {
  const cobrados = documentos.filter((d) => d.estado === 'cobrado' && d.cobrado_at && d.vence)
  const atrasos = cobrados.map((d) => Math.max(0, diasEntre(d.vence, d.cobrado_at) ?? 0))
  const aTiempo = atrasos.filter((x) => x === 0).length
  return {
    pagaATiempoPct: cobrados.length ? Math.round((aTiempo / cobrados.length) * 100) : null,
    atrasoPromedioDias: atrasos.length
      ? Math.round(atrasos.reduce((s, x) => s + x, 0) / atrasos.length)
      : null,
    observados: documentos.filter((d) => d.observacion != null && d.observacion !== '').length,
    emitidos: documentos.length,
  }
}

/** El ancho de la barra de atraso: 30 días de mora llenan la barra (medido en `28:625`, donde
 *  9 días pintan el 30 %). Más de 30 no la desborda: satura. */
export const anchoDeAtraso = (dias: number | null): number =>
  dias == null ? 0 : Math.min(100, Math.round((dias / 30) * 100))

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
