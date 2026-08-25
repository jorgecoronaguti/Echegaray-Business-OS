import { iniciales } from '@/shared/components/canon'
import type { ObraDelSelector, QuienMira } from '../types'
import { P } from '../estilos'
import { Avatar } from './piezas'
import { IcoChevron, IcoObraSelector } from './iconos'
import { SelectorObra } from './SelectorObra'

// LA BARRA DE ARRIBA DEL PORTAL — `29`, líneas 24–39.
//
// Isotipo de 24px, «ECHEGARAY CONSTRUCCIONES» a 11,5/600 con `letterSpacing:.04em`, «Portal de
// clientes» a 11px en #91918B, y a la derecha el selector de obra, un divisor de 1×20 y el avatar.
//
// ═══ NO ES `AppHeader` ═══
//
// El header del OS dibuja las dos áreas del ERP y sus pantallas. Acá hay tres cosas: quién es la
// empresa, qué obra estoy mirando y quién soy yo. Que se parezcan no las hace la misma barra: ésta
// no puede tener una sola entrada de navegación interna, y por eso no se reusa.
//
// En el teléfono (`30:66`) esta barra desaparece: su lugar lo toma la cabecera compacta con el
// nombre de la obra y el avatar. La marca queda en el renglón de arriba, donde el mockup del
// teléfono dibuja la hora del sistema —que es del sistema operativo, no nuestra—.

export function HeaderPortal({ acceso, obras, obraActual }: {
  acceso: QuienMira | null
  obras: ObraDelSelector[]
  obraActual: { obra_id: string; nombre: string } | null
}) {
  const quien = iniciales(acceso?.persona_contacto ?? acceso?.cliente_nombre ?? null)

  return (
    <div
      data-testid="header-portal"
      className="portal-escritorio"
      style={{
        background: P.superficie, borderBottom: `1px solid ${P.linea}`,
        display: 'flex', alignItems: 'center', gap: 22, padding: '0 24px', flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 0' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/isotipo.png" alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
        <span style={{ fontSize: '11.5px', fontWeight: 600, color: P.tinta, letterSpacing: '.04em' }}>
          ECHEGARAY CONSTRUCCIONES
        </span>
        <span style={{ fontSize: '11px', color: P.tenue }}>Portal de clientes</span>
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 14 }}>
        {obraActual && (
          <SelectorObra obras={obras} actual={obraActual.obra_id} estilo={{ gap: 7 }}>
            <span style={{ display: 'flex', color: P.apagado }}><IcoObraSelector /></span>
            <span style={{ fontSize: '12.5px', color: P.tinta }}>{obraActual.nombre}</span>
            {obras.length > 1 && (
              <span style={{ display: 'flex', color: P.tenue }}><IcoChevron /></span>
            )}
          </SelectorObra>
        )}
        <div style={{ width: 1, height: 20, background: P.linea }} />
        <Avatar iniciales={quien} />
      </div>
    </div>
  )
}
