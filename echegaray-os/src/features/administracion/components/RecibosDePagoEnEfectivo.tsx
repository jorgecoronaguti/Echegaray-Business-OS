// LOS RECIBOS DE PAGO EN EFECTIVO DE LA PERSONA, EN SU LEGAJO (dueño, 02/10/2026) — sólo lectura.
//
// Son los RP de Efectivo emitidos a su nombre (`recibo_pago_efectivo.persona_id`): hoy, la diferencia de efectivo
// que se le pagó después de la quincena y firmó. Van en Retribución, al lado de los recibos de la quincena, porque
// dicen plata que cobró. Se emiten y se anulan en otro lado (Liquidación y Efectivo); acá se ven y se reimprimen
// con el mismo PDF, que sale de la foto guardada y no del formulario.
//
// Sin la migración la lista lo dice: «no hay recibos» afirmaría que no se emitió ninguno.

import { V } from '@/shared/components/v2/patron'
import { pesos } from './liquidacion/formato'
import { fechaImpresa } from '@/features/efectivo/logica/reciboPago'
import { MIGRACION_RECIBO_PAGO, type LecturaRecibos } from '@/features/efectivo/services/reciboPagoDatos'

const MONO = "'IBM Plex Mono', monospace"

export function RecibosDePagoEnEfectivo({ lectura }: { lectura: LecturaRecibos }) {
  return (
    <section data-testid="recibos-pago-efectivo" style={{ marginTop: 32 }}>
      <h3 style={{ fontSize: '13px', fontWeight: 600, color: V.tinta, marginBottom: 10 }}>Recibos de pago en efectivo</h3>
      {lectura.estado === 'falta_migracion' ? (
        <p style={{ fontSize: '12.5px', color: V.apagado }}>{`El recibo de pago todavía no está publicado en la base (migración ${MIGRACION_RECIBO_PAGO}).`}</p>
      ) : lectura.estado === 'error' ? (
        <p style={{ fontSize: '12.5px', color: V.warn }}>{`No se pudieron leer los recibos: ${lectura.mensaje}`}</p>
      ) : lectura.recibos.length === 0 ? (
        <p style={{ fontSize: '12.5px', color: V.apagado }}>No se le emitió ningún recibo de pago en efectivo.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
            <thead>
              <tr style={{ color: V.apagado, textAlign: 'left' }}>
                {['Código', 'Fecha', 'Importe', 'Concepto', 'Anulado', ''].map((t, i) => (
                  <th key={i} style={{ padding: '6px 8px', fontWeight: 500, borderBottom: `1px solid ${V.linea}`, textAlign: t === 'Importe' ? 'right' : 'left' }}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lectura.recibos.map((r) => (
                <tr key={r.id} data-testid={`recibo-pago-${r.codigo}`} style={{ color: r.anulado ? V.tenue : V.tinta, verticalAlign: 'top' }}>
                  <td style={{ padding: '6px 8px', fontFamily: MONO, whiteSpace: 'nowrap' }}>{r.codigo}</td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{fechaImpresa(r.fecha)}</td>
                  <td style={{ padding: '6px 8px', fontFamily: MONO, textAlign: 'right', whiteSpace: 'nowrap' }}>{pesos(r.importe)}</td>
                  <td style={{ padding: '6px 8px', minWidth: 220 }}>{r.concepto}</td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>{r.anulado ? `Sí${r.anuladoMotivo ? `: ${r.anuladoMotivo}` : ''}` : 'No'}</td>
                  <td style={{ padding: '6px 8px', whiteSpace: 'nowrap' }}>
                    <a href={`/administracion/compras/recibo-pago/${r.id}`} target="_blank" rel="noopener"
                      style={{ color: V.tinta, textDecoration: 'underline' }}>Volver a imprimir</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
