'use client'

// ═══ ACCIONES RÁPIDAS DE LA OBRA (22/08/2026 · overhaul UX) ═══
//
// Un solo botón en la cabecera que lleva a las cinco operaciones de todos los días sin buscar en
// qué solapa viven. No es un menú monstruoso: son enlaces a superficies que ya existen — acá no se
// crea nada, se llega. La lista es corta a propósito; si un día pide crecer, lo que pide en
// realidad es revisar la arquitectura de solapas, no un ítem más.
//
// ═══ ES EL «···» DEL ZIP, NO UNA SEGUNDA PRIMARIA (24/08/2026) ═══
//
// Era un botón amarillo «Acciones ▾» al lado del amarillo de la pantalla: dos amarillos en la misma
// línea hacen que el ojo lea dos acciones principales. El mockup 02 pone una sola primaria («Cargar
// parte») y, pegado, el ícono de tres puntos de 28×28 con `borderRadius:6px`. Eso es esto: mismo
// menú, mismos cinco destinos, el peso visual que el zip le da.

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { C } from './canon/tokens'
import { IcoMas } from './canon/Ico'

const ITEMS = (obraId: string) => [
  { label: 'Registrar avance', href: `/obras/${obraId}/avance-masivo`, testid: 'accion-avance' },
  { label: 'Parte diario', href: `/obras/${obraId}?vista=tareas&sub=parte`, testid: 'accion-parte' },
  { label: 'Nueva actividad', href: `/obras/${obraId}?vista=tareas&sub=gantt`, testid: 'accion-actividad' },
  { label: 'Asignar persona', href: `/obras/${obraId}?vista=personal`, testid: 'accion-persona' },
  { label: 'Anotar impedimento', href: `/obras/${obraId}?vista=operacion&sub=impedimentos`, testid: 'accion-impedimento' },
]

export function AccionesRapidas({ obraId }: { obraId: string }) {
  const [abierto, setAbierto] = useState(false)
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', esc)
    }
  }, [abierto])

  return (
    <div ref={caja} className="relative inline-block">
      <button
        type="button"
        aria-expanded={abierto}
        aria-label="Más acciones"
        title="Más acciones"
        data-testid="acciones-rapidas"
        onClick={() => setAbierto((v) => !v)}
        style={{
          width: '28px', height: '28px', borderRadius: '6px', display: 'flex',
          alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
          color: C.tintaSuave, border: 'none', background: abierto ? '#F2F1ED' : 'transparent',
        }}
      >
        <IcoMas s={16} r={1.7} />
      </button>
      {abierto && (
        <div className="absolute right-0 top-full z-40 mt-1 w-52 rounded-card border border-line bg-surface py-1 shadow-pop">
          {ITEMS(obraId).map((i) => (
            <Link
              key={i.href}
              href={i.href}
              data-testid={i.testid}
              onClick={() => setAbierto(false)}
              className="block px-3.5 py-2 text-[13px] text-ink hover:bg-surface-quiet"
            >
              {i.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
