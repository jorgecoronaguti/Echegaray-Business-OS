'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { logoutAction } from '@/features/auth/services/actions'
import { C } from './tokens'

// EL CÍRCULO DE INICIALES ABRE LA CUENTA (dueño, 24/09/2026: «los 3 niveles de usuario en computadora y
// mobile tienen que tener la posibilidad de cerrar sesión, algo que ahora no existe»). Al jefe y al
// operario el «Hoy» les llega en este marco también en la computadora, y no tienen el avatar del
// encabezado de escritorio: la única salida quedaba al fondo de «Mi cuenta». El círculo de J01/M02 es
// el lugar que el diseño ya le da a la persona; ahora abre «Mi información» y «Cerrar sesión», igual
// que el avatar de Administración.
export function MenuIniciales({ iniciales }: { iniciales: string }) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!abierto) return
    const cerrar = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) setAbierto(false) }
    document.addEventListener('mousedown', cerrar)
    return () => document.removeEventListener('mousedown', cerrar)
  }, [abierto])

  return (
    <div ref={caja} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        data-testid="iniciales"
        aria-label="Mi cuenta"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        // EL BOTÓN MIDE 44 Y EL CÍRCULO SIGUE DE 34 (auditoría por nivel, 25/09/2026): el margen de -5 devuelve
        // el lugar, así el topbar no crece. Lo que se ve es el mismo círculo grafito.
        style={{
          width: 44, height: 44, margin: -5, padding: 0, background: 'transparent', border: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}
      >
        <span style={{
          width: 34, height: 34, borderRadius: 17, background: C.grafito, color: C.surface,
          fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {iniciales}
        </span>
      </button>
      {abierto && (
        <div
          data-testid="menu-iniciales"
          style={{
            position: 'absolute', right: 0, top: 40, zIndex: 50, minWidth: 190, background: C.surface,
            border: `1px solid ${C.linea}`, borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,.12)', overflow: 'hidden',
          }}
        >
          <Link
            href="/mi-informacion"
            prefetch={false}
            onClick={() => setAbierto(false)}
            style={{ display: 'flex', alignItems: 'center', minHeight: 44, padding: '0 14px', fontSize: 14, color: C.ink, textDecoration: 'none' }}
          >
            Mi información
          </Link>
          <form action={logoutAction} style={{ borderTop: `1px solid ${C.linea}` }}>
            <button
              type="submit"
              data-testid="salir-iniciales"
              style={{ width: '100%', minHeight: 44, padding: '0 14px', textAlign: 'left', fontSize: 14, color: C.neg, background: 'transparent', border: 0, cursor: 'pointer' }}
            >
              Cerrar sesión
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
