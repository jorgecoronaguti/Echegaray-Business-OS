// «QUÉ HICIERON EN EL PORTAL» (`31:174`–`31:222`).
//
//   fila   `padding:12px 0`, filo `#EFEEEA` (la última sin filo)
//   cuándo mono 11px `#91918B`, ancho fijo 78px — «hoy 08:14» o «22/08»
//   ícono  15px del color del tipo de acción
//   texto  12,5px y, debajo, el detalle en 11px `#91918B`
//
// ES EL REGISTRO DE LO QUE HIZO LA CONTRAPARTE. Que Marta Ruiz aprobó el certificado 4 es un hecho
// contractual: habilita la factura. Por eso esta lista no se resume ni se agrupa — se lee entera.

import type { ReactNode } from 'react'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Iconos'
import { TituloBloque, Vacio } from '../canon/Piezas'
import { momentoCorto, montoM } from '../../services/cobranzaFormato'
import { diaMes } from '../../services/cobranzaFormato'
import type { ActividadPortal, TipoActividadPortal } from '../../types/cobranzas'

const PINTA: Record<TipoActividadPortal, { color: string; d: ReactNode; verbo: string }> = {
  aprobo_certificado: { color: C.pos, d: P.ok, verbo: 'aprobó' },
  observo_certificado: { color: C.warn, d: P.chat, verbo: 'observó' },
  descargo_factura: { color: C.tintaSuave, d: P.bajar, verbo: 'descargó' },
  habilitado: { color: C.tintaSuave, d: P.mail, verbo: 'habilitó' },
  ingreso: { color: C.curso, d: P.ojo, verbo: 'entró al portal' },
  consulta: { color: C.warn, d: P.chat, verbo: 'consultó' },
  informo_transferencia: { color: C.pos, d: P.publicar, verbo: 'informó una transferencia' },
}

export function ActividadDelPortal({ actividad, hoy }: { actividad: ActividadPortal[]; hoy: string }) {
  return (
    <div data-testid="actividad-portal">
      <TituloBloque icono={<Ico d={P.historial} s={15} />} titulo="Qué hicieron en el portal" conFilo />
      {actividad.map((a, k) => {
        const pinta = PINTA[a.tipo]
        return (
          <div
            key={a.id}
            style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0',
              borderBottom: k === actividad.length - 1 ? undefined : `1px solid ${C.bordeFila}`,
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: '11px', color: C.tenue, width: '78px', flexShrink: 0 }}>
              {momentoCorto(a.at, hoy) ?? diaMes(a.at.slice(0, 10)) ?? ''}
            </span>
            <span style={{ display: 'flex', color: pinta.color, flexShrink: 0 }}>
              <Ico d={pinta.d} s={15} />
            </span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: '12.5px', color: C.tinta }}>
                {[a.persona, pinta.verbo, a.referencia].filter(Boolean).join(' ')}
              </div>
              {(a.detalle || a.monto != null) && (
                <div style={{ fontSize: '11px', color: C.tenue, marginTop: '1px' }}>
                  {[a.monto != null ? montoM(a.monto) : null, a.detalle].filter(Boolean).join(' · ')}
                </div>
              )}
            </div>
          </div>
        )
      })}
      {actividad.length === 0 && (
        <Vacio testid="actividad-portal-vacia">
          Todavía no hay actividad en el portal de este cliente.
        </Vacio>
      )}
    </div>
  )
}
