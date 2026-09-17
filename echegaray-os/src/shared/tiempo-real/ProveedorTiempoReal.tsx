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
//   · `visibilitychange` → volvió la pestaña; tras una ausencia larga refresca aunque no haya aviso.
//   · `keydown`/`input` → la última tecla: un foco quieto deja de frenar (`EDICION_INACTIVA_MS`).
//   · un latido cada 30 s → sólo con el canal caído, refresca (`motor.ts`).
//   · el estado del canal → una reconexión refresca una vez.
//   · la sesión → cuándo abrir; un rechazo de autorización corta sin reintentar (`conexion.ts`).
//
// El navegador sólo LEE el tópico (la política de `realtime.messages` no da INSERT): nadie puede
// fabricar un aviso desde una pestaña.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { SELECTOR_EN_EDICION, hayEdicionEnCurso } from './planDeRefresco'
import { LATIDO_SIN_CANAL_MS, crearMotor, type MotorDeTiempoReal } from './motor'
import { crearConexion, type AlEstado, type Apertura } from './conexion'
import {
  CLAVE_AVISO_RECARGA, CLAVE_ULTIMA_RECARGA, VERSION_DE_LA_PESTANA, hayVersionNueva, puedeRecargar,
} from './version'
import type { TablaConAviso } from './tablas'

export const TOPICO_DE_CAMBIOS = 'os:cambios'

const ContextoTiempoReal = createContext<MotorDeTiempoReal | null>(null)

function leerSesion(clave: string): string | null {
  try { return sessionStorage.getItem(clave) } catch { return null }
}
function escribirSesion(clave: string, valor: string | null) {
  try { if (valor == null) sessionStorage.removeItem(clave); else sessionStorage.setItem(clave, valor) } catch { /* sin storage */ }
}

/** Recarga la pestaña porque hay otra versión publicada, con freno de bucle y aviso para después. */
export function recargarPorVersionNueva(motivo: 'publicada' | 'accion') {
  const ahora = Date.now()
  if (!puedeRecargar(Number(leerSesion(CLAVE_ULTIMA_RECARGA)) || null, ahora)) return false
  escribirSesion(CLAVE_ULTIMA_RECARGA, String(ahora))
  if (motivo === 'accion') escribirSesion(CLAVE_AVISO_RECARGA, '1')
  window.location.reload()
  return true
}

// La última tecla de la pestaña: un foco olvidado en un buscador no frena el refresco para siempre.
let ultimaTecla = 0

function entornoDelNavegador() {
  return {
    editando: hayEdicionEnCurso({
      activo: document.activeElement,
      celdaMarcada: document.querySelector(SELECTOR_EN_EDICION) != null,
      msDesdeUltimaTecla: Date.now() - ultimaTecla,
    }),
    oculta: document.visibilityState === 'hidden',
  }
}

export function ProveedorTiempoReal({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [avisoRecarga, setAvisoRecarga] = useState(false)
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
    // Un canal que se cortó tarda en irse (`leave` espera el ok del servidor) y `channel()` devuelve el
    // que ya existe con ese tópico: abrir antes de que termine sería suscribir uno que se está yendo.
    let retiro: Promise<unknown> = Promise.resolve()

    const abrir = (alEstado: AlEstado): Apertura => {
      let canal: RealtimeChannel | null = null
      let cerrada = false
      void (async () => {
        await retiro
        // EL CANAL PRIVADO NECESITA EL JWT DE LA SESIÓN. Sin argumentos toma el de la cookie; los
        // refrescos del token los propaga supabase-js solo.
        try { await supabase.realtime.setAuth() } catch { /* el join va a fallar y queda como estaba */ }
        if (cerrada) return
        canal = supabase
          .channel(TOPICO_DE_CAMBIOS, { config: { private: true } })
          .on('broadcast', { event: 'cambio' }, (mensaje) => motor.alAviso(mensaje.payload))
          .subscribe((estado, error) => alEstado(estado, error))
      })()
      return {
        cerrar: () => {
          cerrada = true
          if (canal) retiro = supabase.removeChannel(canal)
        },
      }
    }

    // Una sesión sin permiso (un usuario `campo`) recibe un rechazo y el canal se corta hasta que
    // cambie el token: ver `conexion.ts`. Mientras, la página funciona como antes del tiempo real.
    const conexion = crearConexion({ abrir, alEstado: motor.alEstadoDelCanal })
    // supabase-js advierte no llamar a Supabase dentro de este callback (retiene el lock de auth):
    // se difiere a la vuelta siguiente del bucle.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      const token = sesion?.access_token ?? null
      setTimeout(() => conexion.alCambiarSesion(token), 0)
    })

    // En `focusout` el foco todavía no llegó al campo siguiente: se mira en la vuelta siguiente del
    // bucle, así pasar de una celda a otra con Tab no cuenta como «dejó de editar».
    const alSalirDelFoco = () => { setTimeout(() => { motor.alPoderRefrescar(); recargarSiSePuede() }, 0) }
    const alTeclear = () => { ultimaTecla = Date.now() }
    let ocultaDesde: number | null = document.visibilityState === 'hidden' ? Date.now() : null
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'hidden') { ocultaDesde ??= Date.now(); return }
      const ms = ocultaDesde == null ? 0 : Date.now() - ocultaDesde
      ocultaDesde = null
      motor.alVolverAVerse(ms)
      void preguntarVersion()
    }
    // LA PESTAÑA VIEJA (`version.ts`): si se publicó otra versión, recargar en cuanto nadie escribe.
    let versionNueva = false
    const recargarSiSePuede = () => {
      if (versionNueva && !entornoDelNavegador().editando) recargarPorVersionNueva('publicada')
    }
    const preguntarVersion = async () => {
      try {
        const r = await fetch('/api/version', { cache: 'no-store' })
        const { version } = (await r.json()) as { version?: string }
        if (hayVersionNueva(VERSION_DE_LA_PESTANA, version)) { versionNueva = true; recargarSiSePuede() }
      } catch { /* sin red: se vuelve a preguntar en el próximo latido */ }
    }
    let latidos = 0
    const latido = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      motor.alLatido()
      // CADA 5 MINUTOS y al volver a la pestaña, no cada minuto (17/09/2026): cada pregunta es una
      // invocación en Vercel, y con una pestaña abierta todo el día eran ~600 por día por pestaña.
      if (++latidos % 10 === 0) void preguntarVersion()
      else recargarSiSePuede()
    }, LATIDO_SIN_CANAL_MS)
    void preguntarVersion()
    if (leerSesion(CLAVE_AVISO_RECARGA)) {
      escribirSesion(CLAVE_AVISO_RECARGA, null)
      setTimeout(() => setAvisoRecarga(true), 0)
      setTimeout(() => setAvisoRecarga(false), 10_000)
    }
    document.addEventListener('focusout', alSalirDelFoco)
    document.addEventListener('keydown', alTeclear, true)
    document.addEventListener('input', alTeclear, true)
    document.addEventListener('visibilitychange', alCambiarVisibilidad)

    return () => {
      subscription.unsubscribe()
      clearInterval(latido)
      document.removeEventListener('focusout', alSalirDelFoco)
      document.removeEventListener('keydown', alTeclear, true)
      document.removeEventListener('input', alTeclear, true)
      document.removeEventListener('visibilitychange', alCambiarVisibilidad)
      motor.detener()
      conexion.detener()
    }
  }, [motor])

  return (
    <ContextoTiempoReal.Provider value={motor}>
      {children}
      {avisoRecarga && (
        <div
          role="status"
          data-testid="aviso-recarga-por-version"
          className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-[480px] rounded-card bg-ink px-4 py-3 text-[13px] leading-snug text-surface shadow-lg"
        >
          Se actualizó la app y lo último que tocaste no llegó a guardarse. Repetilo, por favor.
        </div>
      )}
    </ContextoTiempoReal.Provider>
  )
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
