'use client'

// EL NIVEL 2 DE HERRAMIENTAS — `D01:24-33`: 38px, texto 12,5, la activa subrayada en grafito, el
// buscador a la derecha.
//
// Orden del dueño (21/09): Resumen · Inventario · Ubicaciones · Movimientos · Mantenimiento · Rodados ·
// Controles. Controles NO se dibuja en la etapa 1: una solapa que lleva a una pantalla vacía enseña que
// la app promete lo que no tiene.
//
// SIN LECTURA NO HAY CONTADOR. `null` = no se pudo contar (o la migración falta): el número no aparece.

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { IcoBuscar } from './iconos'
import { MONO, V } from './estilo'

export interface CuentasNav {
  mantenimiento: number | null
  rodados: number | null
}

const SOLAPAS = [
  { clave: 'resumen', label: 'Resumen', href: '/herramientas' },
  { clave: 'inventario', label: 'Inventario', href: '/herramientas/inventario' },
  { clave: 'ubicaciones', label: 'Ubicaciones', href: '/herramientas/ubicaciones' },
  { clave: 'movimientos', label: 'Movimientos', href: '/herramientas/movimientos' },
  { clave: 'mantenimiento', label: 'Mantenimiento', href: '/herramientas/mantenimiento' },
  { clave: 'rodados', label: 'Rodados', href: '/herramientas/rodados' },
] as const

/** Qué solapa enciende una ruta. Etiquetas no tiene solapa propia: cuelga del Inventario (`D14`). */
export function solapaDeHerramientas(pathname: string): string | null {
  if (pathname === '/herramientas') return 'resumen'
  if (pathname.startsWith('/herramientas/etiquetas')) return 'inventario'
  const s = SOLAPAS.find((x) => x.href !== '/herramientas' && (pathname === x.href || pathname.startsWith(`${x.href}/`)))
  return s?.clave ?? null
}

export function NavHerramientas({ cuentas, derecha }: { cuentas: CuentasNav; derecha?: React.ReactNode }) {
  const activa = solapaDeHerramientas(usePathname())
  const router = useRouter()
  const [q, setQ] = useState('')
  return (
    <div
      data-testid="nav-herramientas" data-no-imprimir
      style={{
        // Fija debajo del header de la app (44 px, `sticky top-0 h-11`): dueño, 22/09, «dejar fijo todo el
        // header a medida q te vas moviendo por el listado».
        position: 'sticky', top: 44, zIndex: 20,
        minHeight: 38, display: 'flex', alignItems: 'center', gap: 22, padding: '0 20px', flexWrap: 'wrap',
        borderBottom: `1px solid ${V.linea}`, fontSize: '12.5px', background: '#FFFFFF',
      }}
    >
      <nav aria-label="Herramientas" style={{ display: 'flex', alignItems: 'center', gap: 22, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {SOLAPAS.map((s) => {
          const on = s.clave === activa
          const cuenta = s.clave === 'mantenimiento' ? cuentas.mantenimiento : s.clave === 'rodados' ? cuentas.rodados : null
          return (
            <Link
              key={s.clave} href={s.href} prefetch={false} data-testid={`ir-${s.clave}`}
              aria-current={on ? 'page' : undefined} className="hover:text-ink"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 38, whiteSpace: 'nowrap',
                color: on ? V.tinta : V.apagado, fontWeight: on ? 500 : 400,
              }}
            >
              <span style={{ boxShadow: on ? `inset 0 -1.5px 0 ${V.grafito}` : 'none', paddingBottom: 2 }}>{s.label}</span>
              {cuenta != null && cuenta > 0 && (
                <span style={{ fontFamily: MONO, fontSize: '11px', color: s.clave === 'mantenimiento' ? V.warn : V.tenue }}>{cuenta}</span>
              )}
            </Link>
          )
        })}
      </nav>
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* D06 pone sus filtros donde las demás ponen el buscador: uno u otro, nunca los dos. */}
        {derecha}
        {!derecha && <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault()
            const t = q.trim()
            router.push(t ? `/herramientas/inventario?clase=todo&q=${encodeURIComponent(t)}` : '/herramientas/inventario')
          }}
          style={{
            width: 250, height: 28, padding: '0 10px', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6,
            display: 'flex', alignItems: 'center', gap: 7, color: V.tenue,
          }}
        >
          <IcoBuscar tam={13} />
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar activo, obra o código"
            aria-label="Buscar activo, obra o código" data-testid="buscar-herramientas"
            style={{ border: 0, outline: 'none', fontSize: '12.5px', color: V.tinta, width: '100%', background: 'transparent' }}
          />
        </form>}
      </div>
    </div>
  )
}
