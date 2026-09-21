// LO QUE TRABA EL CIERRE, CON NOMBRE PROPIO Y UN ENLACE A LA FILA QUE LO RESUELVE.
//
// Los pendientes salen de `estadoDeCierre` y de ningún otro lado. Esta pieza sólo los dibuja: un
// renglón en ámbar sin fondo (mockup pantalla 10) y, cuando el pendiente es de días, las personas con
// sus fechas. Cada nombre abre la Quincena filtrada a esa persona, que es donde se carga el día o se
// pone el motivo — antes eso vivía en la grilla de «Horas», que repetía la Quincena.

import Link from 'next/link'
import { V } from '@/shared/components/v2/patron'
import type { Pendiente } from '../../../services/liquidacionCierre'
import type { PropsDeSolapa } from './index'
import { ALTO_LIQ } from './tabla'

const ddmm = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

export function PendientesDeCierre({ pendientes, hrefDe }: {
  pendientes: readonly Pendiente[]
  hrefDe: PropsDeSolapa['hrefDe']
}) {
  if (pendientes.length === 0) return null
  return (
    <div data-testid="cierre-pendientes" style={{ marginBottom: 16 }}>
      {pendientes.map((pendiente) => (
        <div key={pendiente.clave} data-testid={`cierre-pendiente-${pendiente.clave}`} style={{
          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, padding: '6px 0',
          minHeight: ALTO_LIQ.renglon, borderBottom: `1px solid ${V.linea}`, fontSize: '12.5px',
        }}>
          {/* EL QUE TRABA VA EN ÁMBAR; EL QUE SÓLO AVISA, EN TINTA. Pintarlos igual haría creer que
              una ausencia sin motivo apaga el botón, y desde el 21/09/2026 no lo apaga. */}
          <span style={{ color: pendiente.traba ? V.warn : V.tinta }}>{pendiente.texto}</span>
          {pendiente.personas && pendiente.personas.length > 0 && (
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 16px', fontSize: '12px' }}>
              {pendiente.personas.map((p) => (
                <Link key={p.personaId} href={hrefDe({ solapa: 'quincena', buscar: p.nombre })} prefetch={false}
                  data-testid={`pendiente-${pendiente.clave}-${p.personaId}`}
                  style={{ color: V.tinta, textDecoration: 'underline', textDecorationColor: V.lineaFuerte }}>
                  {p.nombre}
                  <span style={{ color: V.apagado }}>{` · ${p.fechas.map(ddmm).join(' ')}`}</span>
                </Link>
              ))}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
