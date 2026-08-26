'use client'

// EL BUSCADOR DEL PATRÓN v2: un filo inferior de 216px que se oscurece cuando hay texto.
//
// ═══ POR QUÉ NO ES `ds/BuscadorURL` ═══
//
// El comportamiento sí es el mismo y se reusa: filtra al teclear con la MISMA espera (`ESPERA_MS`,
// importada de ahí, no copiada) y deja el filtro en la URL. Lo que cambia es la geometría, y no por
// gusto: `ds/Buscador` dibuja `h-control` (34px) con texto de 13px, y el v2 mide `padding:3px 2px`
// con texto de 12px, ancho fijo de 216px y lupa de 13px (`22v2:90-92`). Encima el borde inferior es
// un ESTADO —#E7E6E2 vacío, #30302F con texto (`22v2:388`)—, que el del DS no tiene.
//
// Agregarle una cuarta variante al componente compartido habría metido la geometría de una pantalla
// dentro del control de doce. La espera, que es la decisión de comportamiento, sigue viviendo en un
// solo lugar.

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ESPERA_MS } from '@/shared/components/ds'
import { urlDeBusqueda } from '@/shared/utils/busqueda'
import { IconoBuscar } from '@/shared/components/iconos'
import { V } from './patron'

export function BuscadorFilo({ accion, q, placeholder, oculto, testid = 'buscar' }: {
  accion: string
  q?: string
  placeholder: string
  /** Lo que hay que preservar al buscar: la sub-vista abierta, el filtro puesto, el panel. */
  oculto?: Record<string, string | undefined>
  testid?: string
}) {
  const router = useRouter()
  const [texto, setTexto] = useState(q ?? '')
  const [navegando, iniciar] = useTransition()
  // Lo último que ESTE campo mandó a la URL: sin esa referencia el campo se pisa a sí mismo con la
  // `q` del render anterior mientras se escribe, y «messina» termina en «m».
  const enviado = useRef(q ?? '')
  const ocultoClave = JSON.stringify(oculto ?? {})

  useEffect(() => {
    const entrante = q ?? ''
    if (entrante === enviado.current) return
    enviado.current = entrante
    setTexto(entrante)
  }, [q])

  useEffect(() => {
    if (texto.trim() === enviado.current.trim()) return
    const t = setTimeout(() => {
      enviado.current = texto
      const fijos = JSON.parse(ocultoClave) as Record<string, string | undefined>
      // `replace`, no `push`: con `push` el botón de atrás desharía la búsqueda letra por letra.
      iniciar(() => router.replace(urlDeBusqueda(accion, fijos, texto), { scroll: false }))
    }, ESPERA_MS)
    return () => clearTimeout(t)
  }, [texto, accion, ocultoClave, router])

  return (
    <form
      method="get"
      action={accion}
      onSubmit={(e) => e.preventDefault()}
      aria-busy={navegando || undefined}
      data-testid={`${testid}-form`}
      style={{
        display: 'flex', alignItems: 'center', gap: 7, width: 216, maxWidth: '100%',
        // El filo dice si hay un filtro puesto. `22v2:388`.
        borderBottom: `1px solid ${texto ? V.grafito : V.linea}`, padding: '3px 2px',
      }}
    >
      {Object.entries(oculto ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <span style={{ display: 'flex', color: V.lupa, flexShrink: 0 }}>
        <IconoBuscar className="h-[13px] w-[13px]" />
      </span>
      <input
        type="search"
        name="q"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        data-testid={testid}
        style={{
          border: 'none', background: 'transparent', fontSize: '12px',
          color: V.tinta, width: '100%', padding: 0, outline: 'none',
        }}
      />
    </form>
  )
}
