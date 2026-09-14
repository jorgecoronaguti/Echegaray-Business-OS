// LA BARRA DE LIQUIDACIÓN — UNA PANTALLA Y UN «MÁS».
//
// Dueño, 14/09/2026: *«son demasiadas secciones y no puedo empezar a trabajar… era tan simple con un
// solo cuadro en sheet jornales»*. Siete solapas del mismo peso obligaban a elegir antes de ver nada.
// Ahora hay UNA puerta —«Quincena», el cuadro de JORNALES— y el resto vive en un desplegable «Más» con
// tres secciones (caja y proyección, costo y convenio, cierre y recibos). Eran seis; lo que repetían
// del cuadro se sacó el 14/09/2026 (ver `index.ts`).
//
// `<details>` y no un menú con estado: es un Server Component, abre sin JavaScript y se cierra solo
// al navegar. Los testids `solapa-<clave>` se conservan en cada enlace: los E2E los usan.

import Link from 'next/link'
import { V } from '@/shared/components/v2/patron'
import { SOLAPAS, SOLAPA_POR_DEFECTO, type ClaveDeSolapa } from './index'

export function BarraSolapas({ activa, hrefDe }: {
  activa: ClaveDeSolapa
  hrefDe: (solapa: ClaveDeSolapa) => string
}) {
  const principal = SOLAPAS.find((s) => s.clave === SOLAPA_POR_DEFECTO)!
  const resto = SOLAPAS.filter((s) => s.clave !== SOLAPA_POR_DEFECTO && s.Componente)
  const enPrincipal = activa === SOLAPA_POR_DEFECTO
  const otra = resto.find((s) => s.clave === activa)

  return (
    <div
      data-testid="solapas-liquidacion"
      style={{
        display: 'flex', alignItems: 'center', gap: 16, padding: '11px 0',
        fontSize: '13px', borderBottom: `1px solid ${V.linea}`, position: 'relative',
      }}
    >
      {/* EN LA VISTA PRINCIPAL NO SE ROTULA «QUINCENA»: ya lo dicen la solapa «Liquidación» y el
          título del cuadro. Un rótulo más era un cuarto nivel de navegación (máximo dos, skill de
          diseño §2). El testid queda para los E2E. */}
      {enPrincipal
        ? <span data-testid={`solapa-${principal.clave}`} hidden />
        : (
          <Link href={hrefDe(principal.clave)} prefetch={false} data-testid={`solapa-${principal.clave}`}
            style={{ ...inactivo, color: V.tinta }}>← {principal.titulo}</Link>
        )}
      {otra && <span data-testid="solapa-activa" style={activo}>{otra.titulo}</span>}

      <details data-testid="liquidacion-mas" style={{ marginLeft: 'auto', position: 'relative' }}>
        <summary style={{
          cursor: 'pointer', listStyle: 'none', padding: '4px 10px', borderRadius: 6,
          border: `1px solid ${V.lineaFuerte}`, color: V.tintaSuave, fontSize: '12.5px',
        }}>Más ▾</summary>
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 20, minWidth: 190,
          background: '#FFFFFF', border: `1px solid ${V.lineaFuerte}`, borderRadius: 8,
          boxShadow: '0 6px 20px rgba(0,0,0,.08)', padding: 6, display: 'flex', flexDirection: 'column',
        }}>
          {/* EL MENÚ NO CAMBIA SEGÚN DÓNDE ESTÁS (dueño, 14/09/2026: «es confuso el movimiento de
              secciones… deja quieto lo q contiene»). Antes la sección abierta se sacaba de la lista y
              el resto se corría. Ahora siempre están todas, en el mismo orden, y la abierta va marcada. */}
          {resto.map((s) => {
            const esLaAbierta = s.clave === activa
            return (
              <Link key={s.clave} href={hrefDe(s.clave)} prefetch={false} data-testid={`solapa-${s.clave}`}
                aria-current={esLaAbierta ? 'page' : undefined}
                style={{
                  padding: '7px 10px', borderRadius: 5, color: V.tinta, textDecoration: 'none', fontSize: '12.5px',
                  fontWeight: esLaAbierta ? 600 : 400, background: esLaAbierta ? V.linea : 'transparent',
                }}>
                {s.titulo}
              </Link>
            )
          })}
        </div>
      </details>
    </div>
  )
}

const inactivo: React.CSSProperties = { paddingBottom: 3, fontWeight: 400, color: V.apagado, textDecoration: 'none' }
const activo: React.CSSProperties = {
  paddingBottom: 3, fontWeight: 600, color: V.tinta, boxShadow: `inset 0 -1.5px 0 ${V.grafito}`,
}
