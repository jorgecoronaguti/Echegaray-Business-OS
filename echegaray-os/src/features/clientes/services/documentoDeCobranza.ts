// UNA FILA DE `public.cobranzas` COMO DOCUMENTO DE `planDeCobranza`.
//
// ═══ POR QUÉ EXISTE (auditoría de Analíticas, 17/09/2026, D10) ═══
//
// `planDeCobranza` decide la acción del día sobre documentos con la forma de `certificado_cliente`, y
// esa tabla es un SUBCONJUNTO de la deuda: San Francisco tenía 7 documentos en Cobranzas y 0
// certificados, La Estrella 1 y 0. Con $ 26,6 M que vencían al día siguiente, Analíticas decía «nada
// pendiente hoy». La fuente declarada de la deuda es Cobranzas —la misma de la que sale el saldo en
// `cuenta_corriente_de_clientes`—, así que la regla se aplica sobre sus filas a través de este
// adaptador. Vive al lado de la regla para que la ficha del cliente lo use igual (trabajo aparte).
//
// EL ESTADO ES EL GEMELO DE `estado_de_cobro()` (SQL) y de `estadoDeCertificado`
// (`orquestador/lib/portal/cobranzas-a-cliente.mjs`): `vencido` SÓLO si la fila es Pendiente con la
// fecha de cobro ya pasada. Un Facturado con fecha pasada no es mora declarada, y `estaVencido` exige
// el estado: si acá se marcara vencido por la fecha sola, el plan pediría un recordatorio que la
// cuenta corriente no respalda.
import type { CertificadoCliente } from '../types/cobranzas.ts'

/** Los estados de Cobranzas que son deuda (igual que `es_deuda` de la vista). */
export const ESTADOS_DE_DEUDA = ['Pendiente', 'Facturado'] as const

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
const dia = (v: unknown): string | null => {
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const t = texto(v)
  return t && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null
}

/**
 * Filas de `cobranzas` → documentos para `planDeCobranza`. Quedan afuera las que no son deuda, las que
 * no tienen cliente y las que no tienen monto: ninguna de las tres entra al saldo de la vista.
 */
export function documentosDeCobranzas(filas: unknown[], hoy: string): CertificadoCliente[] {
  return filas.flatMap((f): CertificadoCliente[] => {
    const r = f as Record<string, unknown>
    const estado = texto(r.estado)
    const clienteId = texto(r.cliente_id)
    const monto = r.total_bruto == null || r.total_bruto === '' ? null : Number(r.total_bruto)
    if (!clienteId || monto == null || !Number.isFinite(monto)) return []
    if (!ESTADOS_DE_DEUDA.some((e) => e.toLowerCase() === estado?.toLowerCase())) return []
    const vence = dia(r.fecha_cobro)
    const vencido = estado?.toLowerCase() === 'pendiente' && vence != null && vence < hoy
    return [{
      id: String(r.id ?? r.cobranza_id ?? ''), cliente_id: clienteId, obra_id: null, obra_nombre: texto(r.obra_cliente),
      numero: texto(r.numero_comprobante) ?? texto(r.factura) ?? texto(r.concepto) ?? 'sin número',
      factura: texto(r.factura), periodo_desde: null, periodo_hasta: null, avance_periodo: null,
      monto, reparo: null, emitido_at: dia(r.fecha_emision), vence,
      estado: vencido ? 'vencido' : 'emitido', observacion: null,
    } as CertificadoCliente]
  })
}
