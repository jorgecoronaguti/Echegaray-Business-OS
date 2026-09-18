'use client'

// DESHACER CON CMD/CTRL+Z EN TODA LA PLATAFORMA — el proveedor, montado UNA vez en `app/(main)/layout.tsx`.
//
// Dueño, 15/09/2026: *«tendria q funcionar el cmd + z (ctrl +z en windows) para deshacer cambio en la plataforma»*
// y *«Deshacer con Cmd/Ctrl+Z … en TODA la plataforma»*. La lógica (pila, límite, atajo, conflicto, ruta) es pura y
// vive en `src/shared/lib/pilaDeDeshacer.ts`; esto la conecta con el teclado, la pantalla y un aviso chico.
//
//   · Cmd/Ctrl+Z con el foco FUERA de un input deshace el último guardado, con la MISMA acción del servidor.
//   · Dentro de un input, un textarea o un contenido editable no se intercepta: deshace el texto el navegador.
//     Un `<select>` sí se intercepta: el foco se queda en él después de elegir y no tiene texto que deshacer.
//   · NUNCA SE VACÍA UNA CELDA (18/09/2026): deshacer hacia `''` se rechaza salvo que la celda declare que el
//     vacío es un valor con contenido (`vacioRestaurable`). Y toda escritura de deshacer/rehacer viaja con
//     `esperado`: el servidor no escribe si la celda la cambió otra persona. La regla vive en `pilaDeDeshacer.ts`.
//   · Cmd/Ctrl+Shift+Z y Cmd/Ctrl+Y rehacen. El aviso dura 4 s, ofrece «Rehacer» Y DICE LA TECLA (dueño,
//     17/09/2026: el botón ya estaba y nadie sabía que existía el atajo).
//   · Al cambiar de path se descartan los pasos de otras pantallas; al deshacer se mira la ruta completa (con la
//     quincena o el filtro): lo que no está en pantalla no se toca.
//
// Cablear un guardado: `useGuardadoDeshacible` (lo usa `InlineEdit`, así lo heredan todos sus consumidores) o
// `useDeshacer().registrar` para celdas propias.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import {
  MENSAJE_CONFLICTO, apilar, atajoDeDeshacer, destinoEditable, esTecladoMac, hayConflicto, motivoParaNoRestaurar,
  pilaVacia, quitarPaso, sinPasosDeOtraRuta, textoDelAtajoDeRehacer, textoDelAviso, tomarParaDeshacer,
  tomarParaRehacer, type AccionDeDeshacer, type PasoDeEdicion, type PilaDeDeshacer,
} from '@/shared/lib/pilaDeDeshacer'

export type ResultadoReversible = { ok: true } | { ok: false; error: string }

/** Lo que acompaña a una escritura de deshacer/rehacer: lo que debería haber hoy (para no pisar) y qué se hace. */
export interface ContextoDeGuardado {
  esperado?: string
  accion?: AccionDeDeshacer
}

/** Vuelve a escribir `valor` con la misma acción. `esperado` es lo que debería haber hoy (para no pisar). */
export type Revertir = (valor: string, esperado: string, accion: AccionDeDeshacer) => Promise<ResultadoReversible>

/** Una celda en pantalla: qué valor muestra hoy y cómo mostrar el deshecho sin esperar al servidor. */
export interface CeldaViva {
  actual?: () => string | undefined
  aplicar?: (valor: string) => void
}

interface ApiDeDeshacer {
  registrar: (paso: Omit<PasoDeEdicion, 'id' | 'ruta'>, revertir: Revertir) => void
  celdaViva: (clave: string, viva: CeldaViva) => () => void
}

const Contexto = createContext<ApiDeDeshacer | null>(null)

const rutaActual = (): string => (typeof window === 'undefined' ? '' : `${window.location.pathname}${window.location.search}`)

export function DeshacerProvider({ children }: { children: ReactNode }) {
  const [pila, setPila] = useState<PilaDeDeshacer>(pilaVacia)
  const pilaRef = useRef(pila)
  const revertires = useRef(new Map<string, Revertir>())
  const vivas = useRef(new Map<string, Set<CeldaViva>>())
  const contador = useRef(0)
  const [aviso, setAviso] = useState<{ texto: string; rehacer: boolean; id: number } | null>(null)
  const pathname = usePathname()
  // SE MIRA UNA VEZ, AL MONTAR, CON UN INICIALIZADOR PEREZOSO: `navigator` no existe en el servidor. No hay
  // riesgo de hidratación porque el aviso no se dibuja hasta que alguien deshace algo — o sea, mucho
  // después de que el HTML del servidor y el del cliente se compararon.
  const [atajoRehacer] = useState(() =>
    textoDelAtajoDeRehacer(typeof navigator === 'undefined' ? false : esTecladoMac(navigator.userAgent)))

  const cambiarPila = useCallback((siguiente: PilaDeDeshacer) => {
    pilaRef.current = siguiente
    setPila(siguiente)
    // LA PODA VA CON LA PILA (auditoría D6, 18/09/2026): `revertires` sólo crecía. Cada revertir cierra sobre
    // su celda, su fila y su acción, así que una tarde clasificando documentos dejaba cientos de clausuras
    // vivas que ya no se podían usar. Si el paso no está en ninguna de las dos pilas, su revertir se va.
    const vivos = new Set([...siguiente.deshacer, ...siguiente.rehacer].map((p) => p.id))
    for (const id of revertires.current.keys()) if (!vivos.has(id)) revertires.current.delete(id)
  }, [])

  // OTRA PANTALLA: lo que se editó en otra ruta ya no se ve, y no se deshace a ciegas.
  useEffect(() => {
    const filtrada = sinPasosDeOtraRuta(pilaRef.current, rutaActual())
    if (filtrada.deshacer.length !== pilaRef.current.deshacer.length || filtrada.rehacer.length !== pilaRef.current.rehacer.length) {
      cambiarPila(filtrada)
    }
  }, [pathname, cambiarPila])

  const avisar = useCallback((texto: string, rehacer: boolean) => {
    contador.current += 1
    setAviso({ texto, rehacer, id: contador.current })
  }, [])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso((a) => (a?.id === aviso.id ? null : a)), 4000)
    return () => clearTimeout(t)
  }, [aviso])

  // UNO A LA VEZ (auditoría D7, 18/09/2026). Con dos Cmd+Z seguidos, el segundo tomaba el paso previo mientras
  // el primero seguía viajando: la celda todavía mostraba el valor intermedio, `hayConflicto` daba true y el paso
  // se descartaba con «la celda la cambió otra persona» — una afirmación falsa sobre algo que hizo la misma
  // persona. Mientras hay uno en vuelo, el atajo no toma otro: se ignora, no se encola.
  const enVuelo = useRef(false)

  const ejecutarUno = useCallback(async (accion: AccionDeDeshacer) => {
    const tomado = accion === 'deshacer' ? tomarParaDeshacer(pilaRef.current) : tomarParaRehacer(pilaRef.current)
    // PILA VACÍA: NO SE PINTA NADA (QA de producción, 15/09/2026: el aviso de pila vacía quedaba segundos en pantalla
    // después de un Ctrl+Z que no tenía nada que hacer).
    if (!tomado) return

    const { paso } = tomado
    if (paso.ruta !== rutaActual()) {
      cambiarPila(quitarPaso(tomado.pila, paso.id))
      avisar('Eso ya no está en pantalla: no se deshizo', false)
      return
    }
    const destino = accion === 'deshacer' ? paso.anterior : paso.nuevo
    const esperado = accion === 'deshacer' ? paso.nuevo : paso.anterior
    const enPantalla = [...(vivas.current.get(paso.clave) ?? [])]
    const visto = enPantalla.map((v) => v.actual?.()).find((x) => x !== undefined)
    const revertir = revertires.current.get(paso.id)
    if (hayConflicto(visto, esperado) || !revertir) {
      cambiarPila(quitarPaso(tomado.pila, paso.id))
      avisar(MENSAJE_CONFLICTO, false)
      return
    }
    // NO HABÍA UN VALOR ANTERIOR: no se escribe NULL sobre la celda. El paso se descarta y se dice por qué.
    const motivo = motivoParaNoRestaurar(accion, paso)
    if (motivo) {
      cambiarPila(quitarPaso(tomado.pila, paso.id))
      avisar(motivo, false)
      return
    }
    // SE MUEVE ANTES DE ESPERAR AL SERVIDOR: dos Cmd+Z seguidos no pueden tomar el mismo paso.
    cambiarPila(tomado.pila)
    const r = await revertir(destino, esperado, accion)
    if (!r.ok) {
      cambiarPila(quitarPaso(pilaRef.current, paso.id))
      avisar(r.error === MENSAJE_CONFLICTO ? MENSAJE_CONFLICTO : `No se pudo deshacer: ${r.error}`, false)
      return
    }
    for (const v of enPantalla) v.aplicar?.(destino)
    avisar(textoDelAviso(accion, paso), accion === 'deshacer')
  }, [avisar, cambiarPila])

  const ejecutar = useCallback(async (accion: AccionDeDeshacer) => {
    if (enVuelo.current) return
    enVuelo.current = true
    try {
      await ejecutarUno(accion)
    } finally {
      enVuelo.current = false
    }
  }, [ejecutarUno])

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      const accion = atajoDeDeshacer({
        key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, altKey: e.altKey, enEditable: destinoEditable(document.activeElement as HTMLElement | null),
      })
      if (!accion) return
      e.preventDefault()
      void ejecutar(accion)
    }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [ejecutar])

  const api = useMemo<ApiDeDeshacer>(() => ({
    registrar: (paso, revertir) => {
      contador.current += 1
      const id = `paso-${contador.current}`
      revertires.current.set(id, revertir)
      cambiarPila(apilar(pilaRef.current, { ...paso, id, ruta: rutaActual() }))
    },
    celdaViva: (clave, viva) => {
      const set = vivas.current.get(clave) ?? new Set<CeldaViva>()
      set.add(viva)
      vivas.current.set(clave, set)
      return () => { set.delete(viva); if (set.size === 0) vivas.current.delete(clave) }
    },
  }), [cambiarPila])

  return (
    <Contexto.Provider value={api}>
      {children}
      {/* EL AVISO: chico, abajo, grafito, 4 s. Sin tarjetas. `pila` no se dibuja: sólo el último movimiento. */}
      {aviso && (
        <div role="status" data-testid="aviso-deshacer" data-pasos={pila.deshacer.length}
          className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-control bg-ink px-3 py-2 text-[12.5px] text-white">
          <span>{aviso.texto}</span>
          {aviso.rehacer && (
            <>
              <button type="button" onClick={() => void ejecutar('rehacer')} className="font-semibold underline underline-offset-2">Rehacer</button>
              {/* LA TECLA, AL LADO DEL BOTÓN: es la única manera de que alguien la aprenda. En `white/60` para que
                  no compita con la acción — se lee, no se toca. */}
              <kbd data-testid="aviso-deshacer-atajo" className="font-mono text-[11px] text-white/60">{atajoRehacer}</kbd>
            </>
          )}
        </div>
      )}
    </Contexto.Provider>
  )
}

/** La API del proveedor, o `null` fuera de él (pantallas fuera de `(main)`): los guardados siguen andando. */
export function useDeshacer(): ApiDeDeshacer | null {
  return useContext(Contexto)
}

/**
 * ENVUELVE UN GUARDADO PARA QUE SE PUEDA DESHACER. Devuelve una función que guarda `nuevo` con la acción de siempre
 * y, si salió bien, apila { valor anterior → nuevo } con la forma de revertirlo: la misma acción, con `esperado`
 * (lo que esta persona vio; el servidor rechaza si la celda cambió por otra mano) y con `accion`, para que la
 * celda pueda restaurar lo que la ida tocó de más (Pedidos: el `origen`).
 *
 * `valorAnterior` TIENE QUE SER LO QUE LA BASE TIENE HOY según la pantalla, resincronizado con cada refresco
 * (`useEstadoDelServidor` o `EstadoInline`): un `useState(inicial)` que no adopta la prop apila un anterior falso.
 */
export function useGuardadoDeshacible<R extends { ok: boolean }>(opciones: {
  clave: string
  rotulo: string
  valorAnterior: string
  guardar: (valor: string, contexto?: ContextoDeGuardado) => Promise<R>
  formato?: (valor: string) => string
  /** `''` no vacía la celda (vuelve al calculado) y el servidor verifica `esperado`. Sin esto, no se deshace a `''`. */
  vacioRestaurable?: boolean
  /**
   * `guardar` MANDA `contexto.esperado` Y LA ACCIÓN LO COMPRUEBA CONTRA LA BASE. Es una declaración, no se
   * deduce: el hook no puede saber si la acción mira el contexto. Sin esto, el paso no rehace hacia vacío.
   */
  protegido?: boolean
}): (nuevo: string) => Promise<R> {
  const api = useDeshacer()
  const ref = useRef(opciones)
  useEffect(() => { ref.current = opciones })
  return useCallback(async (nuevo: string) => {
    const { clave, rotulo, valorAnterior, guardar, formato, vacioRestaurable, protegido } = ref.current
    const r = await guardar(nuevo)
    if (r.ok && api) {
      const texto = (v: string) => (formato ? formato(v) : v)
      api.registrar(
        {
          clave, rotulo, anterior: valorAnterior, nuevo, anteriorTexto: texto(valorAnterior), nuevoTexto: texto(nuevo),
          vacioRestaurable: vacioRestaurable === true, protegido: protegido === true,
        },
        async (valor, esperado, accion) => {
          const x = await guardar(valor, { esperado, accion })
          return x.ok ? { ok: true } : { ok: false, error: String((x as { error?: unknown }).error ?? 'no se pudo') }
        },
      )
    }
    return r
  }, [api])
}

/** Anota una celda en pantalla: lo que muestra y cómo mostrar al instante lo deshecho. */
export function useCeldaViva(clave: string, viva: CeldaViva): void {
  const api = useDeshacer()
  const ref = useRef(viva)
  useEffect(() => { ref.current = viva })
  useEffect(() => {
    if (!api) return
    return api.celdaViva(clave, { actual: () => ref.current.actual?.(), aplicar: (v) => ref.current.aplicar?.(v) })
  }, [api, clave])
}
