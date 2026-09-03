// EL INSPECTOR — cajón derecho de 560 px POR ENCIMA del presupuesto vivo.
//
// ═══ ES ESTADO DE URL, NO UN MODAL ═══
//
// `?insp=partida:<id>`. Un panel que vive en el estado de React no se puede mandar por chat, y la
// mitad del trabajo de una cotización es «mirá esta partida». Con la URL, el enlace abre exactamente
// lo que el otro estaba mirando. El cierre vuelve a la misma URL sin `insp`, no a la raíz: la vista
// y la cola abiertas se conservan.
//
// ═══ NO SE MONTA COMO MODAL PORQUE NO INTERRUMPE ═══
//
// El presupuesto sigue visible y con su scroll a la izquierda del cajón. Un modal centrado obligaría
// a cerrarlo para mirar la fila de al lado, que es justo lo que se está comparando.

import Link from 'next/link'
import { C } from '@/shared/components/canon'

export interface MigaInspector {
  texto: string
  /** `undefined` en el nivel actual: el último tramo no es un enlace a sí mismo. */
  href?: string
}

export function CajonInspector({ miga, hrefCerrar, children }: {
  miga: MigaInspector[]
  hrefCerrar: string
  children: React.ReactNode
}) {
  return (
    <aside
      data-testid="cajon-inspector"
      style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 560, maxWidth: '100%',
        background: C.superficie, borderLeft: `1px solid ${C.lineaFuerte}`,
        display: 'flex', flexDirection: 'column', zIndex: 5,
      }}
    >
      <div style={{
        flex: 'none', height: 52, display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 20px', borderBottom: `1px solid ${C.linea}`,
      }}>
        {miga.map((m, i) => (
          <span key={m.texto} style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            {i > 0 && <span style={{ color: C.inerte, fontSize: 12 }}>/</span>}
            {m.href ? (
              <Link href={m.href} style={{ fontSize: 12.5, color: C.apagado }}>{m.texto}</Link>
            ) : (
              <span style={{
                fontSize: 12.5, fontWeight: 500, color: C.tinta, whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {m.texto}
              </span>
            )}
          </span>
        ))}
        <div style={{ flex: 1 }} />
        <Link
          href={hrefCerrar}
          data-testid="cerrar-inspector"
          aria-label="Cerrar el inspector"
          style={{ display: 'flex', color: C.apagado, fontSize: 16, lineHeight: 1, padding: 4 }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: '20px 20px 40px', minHeight: 0 }}>
        {children}
      </div>
    </aside>
  )
}
