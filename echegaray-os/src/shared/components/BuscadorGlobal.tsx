'use client'

// LA LUPA DE LA BARRA DE APLICACIÓN — pantalla 00 del canónico.
//
// ═══ QUÉ SE PORTÓ, MEDIDO ═══
//
// `00 · Home Navegación.dc.html`, línea del header: el botón es 28×28, radio 6, `color:#6B6B67`,
// hover `background:#F2F1ED;color:#1F1F1E`, y adentro el SVG de 15×15 con `strokeWidth="2"`. Esos
// valores van literales —no por `IconoBuscar`, que dibuja el mismo trazado a 1,6— porque el peso
// del trazo a 15px es exactamente lo que distingue el header del mockup del que había.
//
// ═══ Y BUSCA DE VERDAD ═══
//
// El comentario que este cambio reemplaza decía *"una lupa que no busca es peor que ninguna"*, y
// tenía razón. Detrás hay `buscarEnTodo` → `entradaService.buscarGlobal`: cliente + persona +
// proveedor en una sola tanda, con la RLS de quien mira. Cada resultado abre SU ficha.
//
// LA CONSULTA NO SALE POR TECLA. 220 ms de espera después de la última: escribir «corralón» son
// ocho teclas y ocho viajes de red, de los cuales siete se descartan antes de pintarse. Y las
// respuestas viejas se tiran (`pedido.current`): sin eso, la respuesta de «cor» que llegó tarde
// pisa la de «corralón» y la lista muestra otra cosa que lo que dice el campo.

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { buscarEnTodo } from '@/features/administracion/services/buscadorGlobalActions'
import type { Hallazgo } from '@/features/administracion/services/entradaService'
import { agrupar, estadoDeLupa, leyenda, MINIMO } from '@/features/administracion/services/buscadorGlobal'

const ESPERA_MS = 220

export function BuscadorGlobal() {
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState('')
  // UNA SOLA PIEZA DE ESTADO, Y LLEVA ADENTRO A QUÉ PREGUNTA CONTESTA.
  //
  // Con `hallazgos` y `cargando` por separado había que APAGARLOS a mano cada vez que cambiaba el
  // término —tres `setState` en el cuerpo de un efecto, que es lo que `react-hooks/set-state-in-effect`
  // prohíbe y con razón: son renders en cascada—. Guardando la respuesta junto con SU término, «esto
  // ya no contesta lo que estoy escribiendo» se deduce comparando, no reseteando.
  const [respuesta, setRespuesta] = useState<{ q: string; hallazgos: Hallazgo[] | null; error: string | null } | null>(null)
  const caja = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLInputElement>(null)

  // Clic afuera y Escape — el mismo cierre que `MenuUsuario`, que vive tres funciones más abajo en
  // `AppHeader`. Se repite por lo mismo que allá: lo que hay adentro no entra en `{ label, onClick }`.
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

  useEffect(() => {
    if (abierto) campo.current?.focus()
  }, [abierto])

  const termino = q.trim()

  useEffect(() => {
    if (!abierto || termino.length < MINIMO) return
    let vivo = true
    const id = setTimeout(async () => {
      const r = await buscarEnTodo(termino)
      // LA RESPUESTA VIEJA SE TIRA. Sin esto, la de «cor» que llegó tarde pisa la de «corralón» y
      // la lista muestra otra cosa que lo que dice el campo.
      if (!vivo) return
      setRespuesta(r.ok
        ? { q: termino, hallazgos: r.hallazgos, error: null }
        : { q: termino, hallazgos: null, error: r.error })
    }, ESPERA_MS)
    return () => { vivo = false; clearTimeout(id) }
  }, [termino, abierto])

  // LO QUE HAY EN PANTALLA CONTESTA A LO QUE DICE EL CAMPO, O NO CUENTA.
  const alDia = respuesta?.q === termino ? respuesta : null
  const estado = estadoDeLupa({
    q, cargando: alDia === null, error: alDia?.error ?? null, hallazgos: alDia?.hallazgos ?? null,
  })
  const texto = leyenda(estado, q, alDia?.error ?? null)
  const grupos = agrupar(alDia?.hallazgos ?? [])

  return (
    <div ref={caja} className="relative">
      <button
        type="button"
        data-testid="buscar-global"
        title="Buscar en todo"
        aria-label="Buscar en todo"
        aria-expanded={abierto}
        onClick={() => setAbierto((v) => !v)}
        // 28×28 · radio 6 · #6B6B67 · hover #F2F1ED — medido de `00 · Home Navegación.dc.html`.
        className={`flex h-[28px] w-[28px] items-center justify-center rounded-md transition-colors ${
          abierto ? 'bg-[#F2F1ED] text-ink' : 'text-muted hover:bg-[#F2F1ED] hover:text-ink'
        }`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4.3-4.3" />
        </svg>
      </button>

      {abierto && (
        // 372px es el ancho del panel lateral del canónico 00: la barra de aplicación y el panel de
        // la cartera no tienen por qué inventar dos anchos distintos para la misma clase de caja.
        <div
          data-testid="panel-buscar-global"
          className="absolute right-0 top-full z-40 mt-1.5 w-[372px] overflow-hidden rounded-[10px] border border-line bg-surface shadow-pop"
        >
          <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#91918B" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4.3-4.3" />
            </svg>
            <input
              ref={campo}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar cliente, persona o proveedor"
              data-testid="campo-buscar-global"
              className="w-full border-none bg-transparent p-0 text-[12px] text-ink outline-none placeholder:text-faint"
            />
          </div>

          <div className="max-h-[340px] overflow-y-auto">
            {texto && (
              <p
                data-testid={`lupa-${estado}`}
                className={`px-3 py-3 text-[12px] ${estado === 'error' ? 'text-neg' : 'text-muted'}`}
              >
                {texto}
              </p>
            )}
            {grupos.map((g) => (
              <div key={g.maestro}>
                {/* EL MAESTRO SE DICE. Dos personas y un proveedor pueden llamarse parecido, y sin
                    el rótulo la lista es adivinanza (`entradaService`, §El buscador global). */}
                <div className="bg-surface-quiet px-3 py-1.5 text-[10px] uppercase tracking-[0.05em] text-faint">
                  {g.titulo}
                </div>
                {g.hallazgos.map((x) => (
                  <Link
                    key={x.clave}
                    href={x.href}
                    prefetch={false}
                    onClick={() => setAbierto(false)}
                    data-testid="hallazgo"
                    className="flex items-center gap-2 border-b border-[#F5F4F0] px-3 py-2 last:border-0 hover:bg-surface-quiet"
                  >
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{x.nombre}</span>
                    {x.detalle && <span className="shrink-0 truncate text-[11px] text-faint">{x.detalle}</span>}
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
