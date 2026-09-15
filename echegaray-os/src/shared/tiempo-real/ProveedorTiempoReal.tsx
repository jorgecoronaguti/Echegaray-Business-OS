'use client'

// TIEMPO REAL EN TODA LA PLATAFORMA — el proveedor, montado UNA vez por marco (`(main)` y `(jefe)`).
//
// Dueño, 15/09/2026: «necesito que la plataforma app.ecsas.com.ar se actualice en tiempo real cuando
// más de un usuario está editando cosas al mismo tiempo en ella».
//
// Abre UN canal privado, `os:cambios`, por pestaña. Por ahí llegan avisos `{tabla, op}` que manda la
// base (migración 20260915T2100) — nunca datos. Cada página declara de qué tablas depende con
// `<RefrescarEnVivo tablas={…} />`; cuando cambia una, se hace `router.refresh()`: el servidor vuelve
// a leer con la RLS de siempre, y React reconcilia sin desmontar lo que está abierto.
//
// El cuándo lo decide `planDeRefresco.ts` (silencio, espera máxima, intervalo mínimo, desfase) y el
// cableado `motor.ts`. Acá sólo se pegan los eventos del navegador:
//   · `focusout` → quizá terminó la edición que frenaba un refresco.
//   · `visibilitychange` → volvió la pestaña.
//   · el estado del canal → una reconexión refresca una vez.
//
// El navegador sólo LEE el tópico (la política de `realtime.messages` no da INSERT): nadie puede
// fabricar un aviso desde una pestaña.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { SELECTOR_EN_EDICION, hayEdicionEnCurso } from './planDeRefresco'
import { crearMotor, type MotorDeTiempoReal } from './motor'
import type { TablaConAviso } from './tablas'

export const TOPICO_DE_CAMBIOS = 'os:cambios'

const ContextoTiempoReal = createContext<MotorDeTiempoReal | null>(null)

function entornoDelNavegador() {
  return {
    editando: hayEdicionEnCurso({
      activo: document.activeElement,
      celdaMarcada: document.querySelector(SELECTOR_EN_EDICION) != null,
    }),
    oculta: document.visibilityState === 'hidden',
  }
}

export function ProveedorTiempoReal({ children }: { children: ReactNode }) {
  const router = useRouter()
  // El motor tiene que existir ANTES de que los hijos registren sus tablas (sus efectos corren antes que
  // el de este componente), por eso nace en el inicializador y no en el efecto. No toca `window` al nacer.
  const [motor] = useState(() => crearMotor({
    refrescar: () => router.refresh(),
    ahora: () => Date.now(),
    azar: () => Math.random(),
    entorno: entornoDelNavegador,
    programar: (fn, ms) => setTimeout(fn, ms),
    cancelar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
  }))

  useEffect(() => {
    const supabase = createClient()
    let canal: RealtimeChannel | null = null
    let vigente = true

    void (async () => {
      // EL CANAL PRIVADO NECESITA EL JWT DE LA SESIÓN. Sin argumentos toma el de la cookie; los
      // refrescos del token los propaga supabase-js solo. Sin sesión, la política rechaza el join y la
      // página sigue funcionando como antes: con los refrescos de cada guardado.
      try { await supabase.realtime.setAuth() } catch { /* el join va a fallar y queda como estaba */ }
      if (!vigente) return
      canal = supabase
        .channel(TOPICO_DE_CAMBIOS, { config: { private: true } })
        .on('broadcast', { event: 'cambio' }, (mensaje) => motor.alAviso(mensaje.payload))
        .subscribe((estado) => motor.alEstadoDelCanal(estado))
    })()

    // En `focusout` el foco todavía no llegó al campo siguiente: se mira en la vuelta siguiente del
    // bucle, así pasar de una celda a otra con Tab no cuenta como «dejó de editar».
    const alSalirDelFoco = () => { setTimeout(motor.alPoderRefrescar, 0) }
    document.addEventListener('focusout', alSalirDelFoco)
    document.addEventListener('visibilitychange', motor.alPoderRefrescar)

    return () => {
      vigente = false
      document.removeEventListener('focusout', alSalirDelFoco)
      document.removeEventListener('visibilitychange', motor.alPoderRefrescar)
      motor.detener()
      if (canal) void supabase.removeChannel(canal)
    }
  }, [motor])

  return <ContextoTiempoReal.Provider value={motor}>{children}</ContextoTiempoReal.Provider>
}

/**
 * Declara que lo que está en pantalla depende de estas tablas: cuando otro usuario (o un timer) las
 * escribe, la página se vuelve a leer sola. No dibuja nada. Fuera del proveedor no hace nada.
 */
export function RefrescarEnVivo({ tablas }: { tablas: readonly TablaConAviso[] }) {
  const motor = useContext(ContextoTiempoReal)
  // La CLAVE y no el arreglo: cada render del servidor manda un arreglo nuevo con las mismas tablas, y
  // registrar de nuevo en cada refresco no cambia nada.
  const clave = [...tablas].sort().join(',')
  useEffect(() => {
    if (!motor || clave === '') return
    return motor.registrar(clave.split(','))
  }, [motor, clave])
  return null
}
