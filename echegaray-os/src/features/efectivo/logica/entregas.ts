// EFECTIVO A RENDIR — lo que la pantalla deriva de lo que leyó. Puro: sin React, sin Supabase, sin reloj.
//
// La cuenta de cada entrega (entregado − rendido − devuelto) la hace la vista `efectivo_entrega_saldo`;
// acá NO se recalcula. Lo que vive acá es cómo se nombra cada estado, los totales de las tarjetas y la
// línea de tiempo de la ficha. El reloj entra por parámetro (`hoy`) para que se pruebe sin esperar días.
//
// ═══ LO QUE NO SE DERIVA, POR DECISIÓN DEL DUEÑO (22/09/2026) ═══
//
// No hay plazo de rendición, ni tope, ni bloqueo por rendición vencida. Por eso no existe un estado
// «Vencida»: una entrega vieja dice cuántos días lleva, y nada más. Una regla que no existe no se
// dibuja «por si acaso».

import { leerNumeroEsAR } from '../../../shared/lib/numeroEsAR.ts'
import type {
  Comprobante, Devolucion, Entrega, EstadoComprobante, FilaDeCompras, LeidoDelPapel, Rendicion,
} from '../types.ts'

export type Tono = 'pos' | 'warn' | 'neg' | 'neutro' | 'apagado'

const ZONA = 'America/Argentina/San_Juan'

/** El día calendario de San Juan de un instante (`YYYY-MM-DD`). Una fecha sola se devuelve tal cual. */
export function diaAR(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** Días corridos entre dos días calendario. Nunca negativo: una fecha futura es «0». */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${diaAR(desde)}T00:00:00Z`)
  const b = Date.parse(`${diaAR(hasta)}T00:00:00Z`)
  if (Number.isNaN(a) || Number.isNaN(b)) return 0
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

/** «16/09». */
export function ddmm(iso: string | null | undefined): string {
  const d = iso ? diaAR(iso) : ''
  return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : ''
}

/** «16/09 09:12» en hora de San Juan. */
export function ddmmHora(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d)
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? ''
  return `${v('day')}/${v('month')} ${v('hour')}:${v('minute')}`
}

/** «1.365.200» — los centavos sólo si los hay. */
export function numero(n: number): string {
  const entero = Math.round(n * 100) % 100 === 0
  return new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: entero ? 0 : 2, maximumFractionDigits: entero ? 0 : 2,
  }).format(n)
}

/** «$ 1.365.200». */
export function pesos(n: number): string {
  return `${n < 0 ? '−' : ''}$ ${numero(Math.abs(n))}`
}

/** Días que lleva la entrega: hasta hoy si está abierta, hasta su cierre si se cerró. */
export function diasDeEntrega(e: Entrega, hoy: string): number {
  const fin = e.estado === 'cerrada' && e.cerrada_en ? e.cerrada_en : e.estado === 'anulada' && e.anulada_en ? e.anulada_en : hoy
  return diasEntre(e.fecha, fin)
}

/** El comprobante todavía no es una fila de Compras ni se descartó: es lo que espera. */
export function esperando(c: Pick<Comprobante, 'estado'>): boolean {
  return c.estado !== 'en_compras' && c.estado !== 'descartado'
}

/**
 * EL ESTADO DE UNA ENTREGA EN LA LISTA — D01, columna «Estado».
 *
 * Orden: anulada y cerrada mandan (ya no se mueven); después lo que pide trabajo (observados); después
 * la cuenta. «Lista para cerrar» es en su poder = 0 con todo imputado. Si rindió MÁS de lo entregado, la
 * cuenta queda negativa y se dice: es plata que la empresa le debe a la persona.
 */
export function estadoDeEntrega(e: Entrega, comprobantes: readonly Pick<Comprobante, 'estado'>[]): { texto: string; tono: Tono } {
  if (e.estado === 'anulada') return { texto: 'Anulada', tono: 'apagado' }
  if (e.estado === 'cerrada') return { texto: `Cerrada ${ddmm(e.cerrada_en)}`.trim(), tono: 'apagado' }
  const observados = comprobantes.filter((c) => c.estado === 'observado' || c.estado === 'duplicado' || c.estado === 'error').length
  if (observados > 0) return { texto: `${observados} ${observados === 1 ? 'observado' : 'observados'}`, tono: 'warn' }
  if (e.en_su_poder < 0) return { texto: `Rindió ${pesos(-e.en_su_poder)} de más`, tono: 'warn' }
  if (e.en_su_poder === 0 && !comprobantes.some(esperando)) return { texto: 'Lista para cerrar', tono: 'pos' }
  return { texto: 'Rindiendo', tono: 'neutro' }
}

export interface Resumen {
  /** Suma de «en su poder» de las abiertas con saldo. */
  enManos: number
  entregasConSaldo: number
  abiertas: number
  rendidoMes: number
  filasMes: number
  porImputar: number
  /** La abierta con saldo más vieja: sus días y su código. `null` si no hay ninguna. */
  masVieja: { dias: number; codigo: string; persona: string } | null
}

/** LAS TARJETAS DE D01. `hoy` es el día de San Juan; el mes de «rendido» es el de `hoy`. */
export function resumir(
  entregas: readonly Entrega[], comprobantes: readonly Comprobante[], rendiciones: readonly Rendicion[], hoy: string,
): Resumen {
  const abiertas = entregas.filter((e) => e.estado === 'abierta')
  const conSaldo = abiertas.filter((e) => e.en_su_poder > 0)
  const mes = hoy.slice(0, 7)
  const delMes = rendiciones.filter((r) => diaAR(r.imputada_en).slice(0, 7) === mes)
  const vieja = [...conSaldo].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.codigo.localeCompare(b.codigo))[0]
  return {
    enManos: conSaldo.reduce((s, e) => s + e.en_su_poder, 0),
    entregasConSaldo: conSaldo.length,
    abiertas: abiertas.length,
    rendidoMes: delMes.reduce((s, r) => s + Number(r.monto), 0),
    filasMes: delMes.length,
    porImputar: comprobantes.filter(esperando).length,
    masVieja: vieja ? { dias: diasDeEntrega(vieja, hoy), codigo: vieja.codigo, persona: vieja.persona } : null,
  }
}

export type FiltroLista = 'abiertas' | 'todas' | 'obra'

export function filtroDeLista(v: string | null | undefined): FiltroLista {
  return v === 'todas' || v === 'obra' ? v : 'abiertas'
}

/** Destino económico en dos líneas: la obra y su cliente, o «Estructura · sin obra». */
export function destinoDe(e: Pick<Entrega, 'estructura' | 'obra' | 'obra_id'>, clienteDeObra?: string | null): { linea: string; bajada: string | null } {
  if (e.estructura) return { linea: 'Estructura', bajada: null }
  return { linea: e.obra ?? e.obra_id ?? 'obra sin nombre', bajada: clienteDeObra ?? null }
}

/**
 * LA LISTA DE D01. «Abiertas» es lo que decide hoy; «Todas» suma las cerradas y anuladas; «Por obra»
 * son todas las abiertas agrupadas por destino (Estructura al final).
 */
export function ordenarLista(entregas: readonly Entrega[], filtro: FiltroLista): { grupo: string | null; entregas: Entrega[] }[] {
  const porCodigo = (a: Entrega, b: Entrega) => b.codigo.localeCompare(a.codigo)
  if (filtro === 'todas') {
    const rango = (e: Entrega) => (e.estado === 'abierta' ? 0 : e.estado === 'cerrada' ? 1 : 2)
    return [{ grupo: null, entregas: [...entregas].sort((a, b) => rango(a) - rango(b) || porCodigo(a, b)) }]
  }
  const abiertas = entregas.filter((e) => e.estado === 'abierta').sort(porCodigo)
  if (filtro === 'abiertas') return [{ grupo: null, entregas: abiertas }]
  const grupos = new Map<string, Entrega[]>()
  for (const e of abiertas) {
    const g = e.estructura ? 'Estructura' : (e.obra ?? e.obra_id ?? 'obra sin nombre')
    grupos.set(g, [...(grupos.get(g) ?? []), e])
  }
  return [...grupos.entries()]
    .sort(([a], [b]) => (a === 'Estructura' ? 1 : b === 'Estructura' ? -1 : a.localeCompare(b, 'es')))
    .map(([grupo, lista]) => ({ grupo, entregas: lista }))
}

/** Lo que la persona ya tiene sin rendir, para avisarlo al elegirla en D02. */
export function sinRendirDe(persona: string, entregas: readonly Entrega[]): { total: number; codigos: string[] } {
  const suyas = entregas.filter((e) => e.persona_id === persona && e.estado === 'abierta' && e.en_su_poder > 0)
  return { total: suyas.reduce((s, e) => s + e.en_su_poder, 0), codigos: suyas.map((e) => e.codigo) }
}

// ═══ LOS COMPROBANTES ═══

export const ROTULO_COMPROBANTE: Record<EstadoComprobante, { texto: string; tono: Tono }> = {
  leyendo: { texto: 'Por imputar', tono: 'warn' },
  en_compras: { texto: 'En Compras', tono: 'pos' },
  observado: { texto: 'Observado', tono: 'warn' },
  duplicado: { texto: 'Duplicado', tono: 'warn' },
  error: { texto: 'Falló la lectura', tono: 'neg' },
  descartado: { texto: 'Descartado', tono: 'apagado' },
}

/** Lo que el sistema leyó del papel: el primer comprobante del resultado del worker, o nada. */
export function leidoDe(c: Pick<Comprobante, 'resultado'>): LeidoDelPapel | null {
  const l = c.resultado?.comprobantes
  return Array.isArray(l) && l.length ? l[0] : null
}

/** El importe leído, como número. `null` si no se leyó o no se entiende. */
export function totalLeido(c: Pick<Comprobante, 'resultado' | 'monto_rendido'>): number | null {
  if (c.monto_rendido != null) return Number(c.monto_rendido)
  const t = leidoDe(c)?.total
  if (t == null || t === '') return null
  if (typeof t === 'number') return Number.isFinite(t) ? t : null
  const l = leerNumeroEsAR(String(t))
  return l.ok ? l.valor : null
}

/**
 * QUÉ FALTA EN UN COMPROBANTE — D05. Se deriva de lo leído, no se tipea: sin CUIT la clave es débil, sin
 * proveedor hay que completarlo, e importe y fecha se dicen cuando sí se leyeron.
 */
export function queFalta(c: Pick<Comprobante, 'resultado' | 'monto_rendido' | 'enviado_en'>): { texto: string; detalle: string; tono: Tono }[] {
  const l = leidoDe(c)
  const out: { texto: string; detalle: string; tono: Tono }[] = []
  if (!l?.cuit) out.push({ texto: 'El papel no imprime CUIT', detalle: 'clave débil', tono: 'warn' })
  if (!l?.proveedor) out.push({ texto: 'Sin nombre de proveedor legible', detalle: 'a completar', tono: 'warn' })
  const total = totalLeido(c)
  const fecha = l?.fecha ? ddmm(l.fecha) : ''
  if (total != null && fecha) out.push({ texto: 'Importe y fecha sí se leen', detalle: `${pesos(total)} · ${fecha}`, tono: 'pos' })
  else if (total != null) out.push({ texto: 'El importe sí se lee', detalle: pesos(total), tono: 'pos' })
  else out.push({ texto: 'No se leyó el importe', detalle: 'a completar', tono: 'warn' })
  return out
}

// ═══ LA ACTIVIDAD DE LA FICHA (D03) ═══

export interface Evento { en: string; texto: string }

/**
 * La línea de tiempo, de lo más nuevo a lo más viejo. Sale de las fechas que la base ya guarda: nada se
 * escribe para poder mostrarlo. La conformidad en papel no tiene hora en la base y por eso no entra acá
 * (la ficha la dice en su bajada).
 */
export function actividadDe(args: {
  entrega: Entrega
  creadaEn: string | null
  entregadaPor: string | null
  comprobantes: readonly Comprobante[]
  rendiciones: readonly Rendicion[]
  devoluciones: readonly Devolucion[]
}): Evento[] {
  const { entrega: e } = args
  const ev: Evento[] = []
  if (args.creadaEn) ev.push({ en: args.creadaEn, texto: `Entrega creada · ${pesos(e.entregado)}${args.entregadaPor ? ` · ${args.entregadaPor}` : ''}` })
  if (e.conformidad_en) ev.push({ en: e.conformidad_en, texto: `Conformidad firmada en el teléfono · ${e.persona}` })
  for (const c of args.comprobantes) {
    ev.push({ en: c.enviado_en, texto: `Comprobante ${c.canal === 'mattermost' ? 'por el canal' : 'por la app'}` })
    if (c.observado_en && c.observacion) ev.push({ en: c.observado_en, texto: `Observado: ${c.observacion}` })
    if (c.respondido_en && c.respuesta) ev.push({ en: c.respondido_en, texto: `Respondió: ${c.respuesta}` })
    if (c.descartado_en) ev.push({ en: c.descartado_en, texto: `Descartado${c.descartado_motivo ? `: ${c.descartado_motivo}` : ''}` })
  }
  for (const r of args.rendiciones) ev.push({ en: r.imputada_en, texto: `En Compras · ${pesos(Number(r.monto))}` })
  for (const d of args.devoluciones) ev.push({ en: d.registrada_en, texto: `Devolución · ${pesos(Number(d.monto))}` })
  if (e.cerrada_en) ev.push({ en: e.cerrada_en, texto: 'Entrega cerrada' })
  if (e.anulada_en) ev.push({ en: e.anulada_en, texto: `Anulada${e.anulada_motivo ? `: ${e.anulada_motivo}` : ''}` })
  return ev.sort((a, b) => b.en.localeCompare(a.en))
}

// ═══ EXPORTAR ═══

const csvCelda = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** La lista como CSV con `;` y coma decimal: lo que abre bien una planilla en es-AR. */
export function entregasCsv(entregas: readonly Entrega[], hoy: string): string {
  const num = (n: number) => String(n).replace('.', ',')
  const filas = entregas.map((e) => [
    e.codigo, e.fecha, e.persona, e.estructura ? 'Estructura' : (e.obra ?? ''), num(e.entregado), num(e.rendido),
    num(e.devuelto), num(e.en_su_poder), diasDeEntrega(e, hoy), e.estado, e.para_que ?? '',
  ])
  const cab = ['Entrega', 'Fecha', 'A cargo de', 'Destino', 'Entregado', 'Rendido', 'Devuelto', 'En su poder', 'Días', 'Estado', 'Para qué']
  return [cab, ...filas].map((f) => f.map(csvCelda).join(';')).join('\n')
}

// ═══ LAS FILAS DE LA FICHA (D03) ═══

export interface FilaDeFicha {
  /** El ticket, si la fila nació de uno. Una rendición vinculada por el canal puede no tenerlo. */
  comprobante: Comprobante | null
  fecha: string | null
  proveedor: string | null
  rubro: string | null
  importe: number | null
  estado: EstadoComprobante
  /** La fila de Compras que la rinde, si ya existe: la verdad del gasto es ésa. */
  fila: number | null
}

/**
 * LOS TICKETS DE UNA ENTREGA Y LAS FILAS DE COMPRAS QUE LA RINDEN, EN UNA LISTA.
 *
 * Cuando el ticket ya está en Compras manda la fila de Compras (proveedor, rubro, importe): el papel es
 * cómo llegó, la fila es lo que vale. Una rendición que no se puede atar a ningún ticket de la lista
 * (entró por el canal) aparece igual, como «En Compras», para que la suma de la ficha cierre con
 * «Rendido». Lo más nuevo arriba.
 */
export function filasDeLaFicha(
  comprobantes: readonly Comprobante[],
  rendiciones: readonly Rendicion[],
  compras: ReadonlyMap<string, FilaDeCompras>,
): FilaDeFicha[] {
  const atadas = new Set<string>()
  const out: FilaDeFicha[] = comprobantes.map((c) => {
    const r = rendiciones.find((x) => x.comprobante_id === c.id || (c.compra_clave != null && x.compra_clave === c.compra_clave))
    const clave = c.compra_clave ?? r?.compra_clave ?? null
    if (r) atadas.add(r.id)
    const f = clave ? compras.get(clave) : undefined
    const l = leidoDe(c)
    return {
      comprobante: c,
      fecha: f?.fecha ?? l?.fecha ?? c.enviado_en,
      proveedor: f?.proveedor ?? l?.proveedor ?? null,
      rubro: f?.concepto ?? null,
      importe: f?.total ?? (r ? Number(r.monto) : totalLeido(c)),
      estado: c.estado,
      fila: f?.fila ?? null,
    }
  })
  for (const r of rendiciones) {
    if (atadas.has(r.id)) continue
    const f = compras.get(r.compra_clave)
    out.push({
      comprobante: null, fecha: f?.fecha ?? r.imputada_en, proveedor: f?.proveedor ?? null, rubro: f?.concepto ?? null,
      importe: f?.total ?? Number(r.monto), estado: 'en_compras', fila: f?.fila ?? null,
    })
  }
  return out.sort((a, b) => diaAR(b.fecha ?? '').localeCompare(diaAR(a.fecha ?? '')))
}
