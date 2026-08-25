import type { ReactNode } from 'react'
import { C } from '@/shared/components/movil/tokens'
import { Icono } from '@/shared/components/movil/Iconos'

// EL MARCO DE LAS PANTALLAS SIN SESIÓN — porte literal de `M01 · Login.dc.html`.
//
// ═══ QUÉ MIDE EL MOCKUP, Y QUÉ CAMBIÓ ═══
//
// M01 no es la columna de 384px centrada verticalmente que había acá: es una pantalla de teléfono
// de 390px sobre FONDO BLANCO —no sobre el canvas gris—, con `padding:56px 24px 24px`, el isotipo
// de 44px al lado del wordmark en dos renglones de 12,5/600 con `letterSpacing:.04em`, el título a
// 24/600 a 40px del logo, y la ayuda al pie separada por un hairline `#EFEEEA`.
//
// El logo COMPLETO se fue: el mockup usa el isotipo más el nombre compuesto en texto. No es un
// capricho — `logo.png` mide 578×432 y a 188px de ancho ocupa 140px de alto, que en 844px de
// teléfono es un sexto de la pantalla antes de que aparezca el primer campo.
//
// ═══ LO QUE ESTE MARCO NO PUEDE ARREGLAR ═══
//
// M01 dibuja TELÉFONO + CÓDIGO de cuatro dígitos. El OS autentica con email y contraseña de
// Supabase. Cambiar eso no es un porte de diseño: cambia quién puede entrar, cómo se recupera el
// acceso y qué manda Supabase a quién — es una decisión del dueño, con efecto de seguridad. Lo que
// sí se cumple del artboard es todo lo demás, y el formulario que va adentro respeta sus medidas.

export function MarcoAuth({
  titulo, bajada, ayuda, children,
}: {
  titulo: string
  /** Una línea que dice qué es esta pantalla. No es un eslogan: es lo que hay que hacer acá. */
  bajada: string
  /** La salida del pie: a quién pedirle cuando el acceso no funciona. */
  ayuda?: ReactNode
  children: ReactNode
}) {
  return (
    <div
      style={{
        minHeight: '100vh', margin: '0 auto', maxWidth: 430, background: C.surface,
        padding: '56px 24px 24px', display: 'flex', flexDirection: 'column',
      }}
      data-testid="marco-auth"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/marca/isotipo.png" alt="" style={{ width: 44, height: 44, objectFit: 'contain' }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, letterSpacing: '.04em', lineHeight: 1.3 }}>
            ECHEGARAY<br />CONSTRUCCIONES
          </div>
        </div>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 600, color: C.ink, marginTop: 40, lineHeight: 1.25 }}>
        {titulo}
      </h1>
      <p style={{ fontSize: 14, color: C.muted, marginTop: 6 }}>{bajada}</p>

      <div style={{ marginTop: 28 }}>{children}</div>

      <div style={{ marginTop: 'auto', paddingTop: 32 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0',
          borderTop: `1px solid ${C.inerte}`,
        }}>
          <span style={{ display: 'flex', color: C.faint, flexShrink: 0 }}><Icono nombre="info" tamano={18} /></span>
          <div style={{ fontSize: 12.5, color: C.muted, minWidth: 0 }}>
            {ayuda ?? 'Si no podés entrar, pedile a la oficina que revise tu acceso.'}
          </div>
        </div>
      </div>
    </div>
  )
}
