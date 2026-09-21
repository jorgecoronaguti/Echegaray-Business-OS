// LOS COBROS PRÓXIMOS — qué entra, cuándo y de quién.
//
// ═══ POR QUÉ EXISTE (dueño, 21/09/2026) ═══
//
// «La pestaña de Cobranza del módulo Analíticas no es de utilidad si no me marca con claridad los
// cobros próximos». La vista contestaba la antigüedad de lo vencido (por vencer / 31–60 / 61–90 /
// +90) y el 21/09/2026 TODA la deuda estaba «por vencer»: la pantalla decía «al día $ 221,11 M» y
// nada más. Con eso no se sabe que el 22/09 entran $ 29,06 M de Messina ni que en 30 días entran
// $ 128,50 M. La antigüedad mira para atrás; esto mira para adelante.
//
// ═══ LA FUENTE ES LA DEUDA COMPLETA ═══
//
// Las filas llegan de `cliente_cobranza` —la vista fila por fila de `public.cobranzas`, réplica del
// Sheet— a través de `documentosDeCobranzas`, el MISMO adaptador que usa la acción del día. No se
// lee `certificado_cliente`: es un subconjunto y ya mintió (San Francisco, 7 documentos en Cobranzas
// y 0 certificados, con $ 26,6 M que vencían al día siguiente, salía como «nada pendiente hoy» —
// auditoría 17/09/2026, D10).
//
// La fecha es la columna Q de Cobranzas (`fecha_cobro`), la única fecha de cobro que existe: no hay
// promesa de pago en ninguna fuente. Un documento SIN esa fecha no se acomoda en ningún día —no se
// asume que vence hoy—: se cuenta aparte y la pantalla lo dice.
//
// Rutas relativas con extensión: `node --test` no resuelve el alias `@/`.
import type { CertificadoCliente } from '../../clientes/types/cobranzas.ts'
import { diasEntre } from '../../clientes/services/cobranzaFormato.ts'

export interface CobroProximo {
  id: string
  clienteId: string
  /** Nombre comercial del cliente; `null` cuando la cuenta corriente no lo trae. */
  cliente: string | null
  /** Número de comprobante, factura o concepto: lo que identifica el documento en Cobranzas. */
  documento: string
  /** Fecha de cobro (columna Q), ISO. */
  fecha: string
  /** Días desde hoy: `0` hoy, `> 0` futuro, `< 0` ya vencido. */
  dias: number
  monto: number
  vencido: boolean
}

export interface AgendaDeCobro {
  /** Vencidos primero y después por fecha: lo que hay que mirar, en orden. */
  filas: CobroProximo[]
  /** Documentos de deuda sin fecha de cobro. Nunca se reparten en un día. */
  sinFecha: { n: number; total: number }
  vencido: { n: number; total: number }
  /** Lo que entra dentro de N días contados desde hoy, inclusive. */
  en7: number
  en15: number
  en30: number
  /** El primer día con plata (`null` si no hay ninguno con fecha). */
  primero: { fecha: string; dias: number; total: number } | null
}

/** Días desde `hoy` hasta `fecha`: negativo si ya pasó. */
export const diasHasta = (fecha: string, hoy: string): number | null => {
  const d = diasEntre(fecha, hoy)
  return d == null ? null : -d
}

/**
 * LA AGENDA DE COBRO a partir de los documentos de deuda. Función pura: `hoy` entra como argumento
 * ISO y nunca se lee el reloj, porque un test que depende de la máquina afirma el estado del mundo.
 *
 * Un documento entra una sola vez y con su monto entero: no se prorratea ni se agrupa por cliente
 * —cada comprobante tiene su fecha y su plata— igual que cada pago tiene su fila en Compras.
 */
export function agendaDeCobro(docs: CertificadoCliente[], nombres: Map<string, string>, hoy: string): AgendaDeCobro {
  const filas: CobroProximo[] = []
  let sinFechaN = 0
  let sinFechaTotal = 0
  for (const d of docs) {
    const dias = d.vence ? diasHasta(d.vence, hoy) : null
    if (d.vence == null || dias == null) {
      sinFechaN += 1
      sinFechaTotal += d.monto
      continue
    }
    filas.push({
      id: d.id, clienteId: d.cliente_id, cliente: nombres.get(d.cliente_id) ?? null,
      documento: d.numero, fecha: d.vence, dias, monto: d.monto, vencido: d.estado === 'vencido',
    })
  }
  filas.sort((a, b) => (a.fecha === b.fecha ? b.monto - a.monto : a.fecha.localeCompare(b.fecha)))
  const dentroDe = (n: number): number =>
    filas.filter((f) => f.dias >= 0 && f.dias <= n).reduce((s, f) => s + f.monto, 0)
  const futuras = filas.filter((f) => f.dias >= 0)
  const primeraFecha = futuras[0]?.fecha ?? null
  return {
    filas,
    sinFecha: { n: sinFechaN, total: sinFechaTotal },
    vencido: {
      n: filas.filter((f) => f.dias < 0).length,
      total: filas.filter((f) => f.dias < 0).reduce((s, f) => s + f.monto, 0),
    },
    en7: dentroDe(7), en15: dentroDe(15), en30: dentroDe(30),
    primero: primeraFecha == null ? null : {
      fecha: primeraFecha,
      dias: futuras[0].dias,
      total: futuras.filter((f) => f.fecha === primeraFecha).reduce((s, f) => s + f.monto, 0),
    },
  }
}

/** «hoy» · «mañana» · «en 8 días» · «vencido hace 3 días». El tiempo en palabras, no en un número pelado. */
export function cuando(dias: number): string {
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'mañana'
  if (dias > 1) return `en ${dias} días`
  return dias === -1 ? 'vencido ayer' : `vencido hace ${-dias} días`
}

/** El próximo cobro de cada cliente, para la tabla por cliente. Vencido primero; si no, el más cercano. */
export function proximoPorCliente(a: AgendaDeCobro): Map<string, CobroProximo> {
  const m = new Map<string, CobroProximo>()
  for (const f of a.filas) if (!m.has(f.clienteId)) m.set(f.clienteId, f)
  return m
}
