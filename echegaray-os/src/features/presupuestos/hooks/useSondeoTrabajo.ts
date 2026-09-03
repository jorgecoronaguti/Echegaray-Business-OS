'use client'

// EL SONDEO DEL TRABAJO — cada 1,5 s mientras esté ENCOLADO o LEYENDO, y SE PARA DE VERDAD.
//
// El formulario viejo esperaba la respuesta entera en el mismo request: con un legajo grande, eso
// es el timeout que se vino a corregir. Acá el POST contesta con un `id` en <3 s y este hook
// pregunta por afuera. Para de sondear al llegar a LISTO/ERROR, y al desmontar — un intervalo que
// sigue corriendo después de que el usuario se fue de la pantalla es la fuga clásica de este patrón.
//
// UNA SOLA PIEZA DE ESTADO, Y LLEVA ADENTRO A QUÉ `id` CONTESTA — el mismo criterio que
// `BuscadorGlobal`: el estado del trabajo ANTERIOR («rehacer» + arrancar de nuevo) no se resetea
// con un `setState` suelto al tope del efecto (`react-hooks/set-state-in-effect` lo prohíbe, con
// razón: son renders en cascada). Se guarda junto con el `id` al que corresponde, y si no coincide
// con el `id` vigente se trata como si no hubiera nada — sin una segunda pasada de render.
//
// ═══ UN FALLO TRANSITORIO NO ES UN ERROR TERMINAL ═══
//
// Un solo timeout de red frenaba el sondeo PARA SIEMPRE: el `catch` guardaba el motivo y hacía
// `return` sin reprogramar el `setTimeout`, así que el worker podía seguir trabajando perfecto y
// la pantalla quedaba congelada en «Midiendo» sin aviso ni reintento (auditoría 03/09/2026). Ahora
// reintenta con backoff y un tope: recién se rinde de verdad después de `MAX_FALLOS_SEGUIDOS`
// consecutivos, y mientras tanto `errorSondeo` sigue viajando para que la pantalla pueda avisar
// «problema de red, reintentando» sin depender de que `trabajo.estado` sea `'ERROR'` — ese estado
// lo pone el SERVIDOR, nunca el sondeo.

import { useEffect, useRef, useState } from 'react'
import { consultarLectura } from '../services/trabajoCotizarApi'
import type { TrabajoLectura } from '../services/trabajoLectura'

const INTERVALO_MS = 1500
const MAX_FALLOS_SEGUIDOS = 5

type Sondeo = { id: string; trabajo: TrabajoLectura | null; error: string | null }

export function useSondeoTrabajo(id: string | null) {
  const [estado, setEstado] = useState<Sondeo | null>(null)
  const vivo = useRef(true)

  useEffect(() => {
    vivo.current = true
    if (!id) return undefined
    let timer: ReturnType<typeof setTimeout> | null = null
    let fallosSeguidos = 0

    const preguntar = async () => {
      try {
        const t = await consultarLectura(id)
        if (!vivo.current) return
        fallosSeguidos = 0
        setEstado({ id, trabajo: t, error: null })
        if (t.estado === 'LISTO' || t.estado === 'ERROR') return
      } catch (e) {
        if (!vivo.current) return
        fallosSeguidos += 1
        const motivo = e instanceof Error ? e.message : 'no se pudo consultar el trabajo'
        setEstado((prev) => ({ id, trabajo: prev?.id === id ? prev.trabajo : null, error: motivo }))
        // Se agotaron los reintentos: recién ahí se para de verdad. Antes de eso, el trabajo
        // puede seguir avanzando en el worker aunque esta consulta puntual haya fallado.
        if (fallosSeguidos >= MAX_FALLOS_SEGUIDOS) return
        timer = setTimeout(preguntar, INTERVALO_MS * fallosSeguidos)
        return
      }
      timer = setTimeout(preguntar, INTERVALO_MS)
    }
    void preguntar()

    return () => { vivo.current = false; if (timer) clearTimeout(timer) }
  }, [id])

  // Estado de un `id` anterior no se muestra: para el `id` vigente, "todavía no hay nada" es null.
  const vigente = estado?.id === id ? estado : null
  return { trabajo: vigente?.trabajo ?? null, errorSondeo: vigente?.error ?? null }
}
