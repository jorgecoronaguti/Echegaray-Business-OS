'use client'

import { useActionState, useRef, useState } from 'react'
import { Ayuda, Estado } from '@/shared/components/ds'
import { registrarMarca } from '../services/acciones'
import { hora, lecturaDelDia, siguienteAccion } from '../services/asistencia'
import type { DiaDeAsistencia } from '../types'

// ASISTENCIA EN «HOY» — una sola acción primaria, de 52px, y nada al lado.
//
// El handoff: «La acción es siempre una sola (Registrar entrada → Registrar salida)». Dos botones a
// la vez obligan a elegir, y a las siete de la mañana con guantes puestos la respuesta correcta es
// una sola. Cuál es, la decide el estado del día — y lo vuelve a decidir el servidor, porque un
// `tipo` mandado a mano cerraría un día que nunca se abrió.
//
// EL BOTÓN SE DESHABILITA MIENTRAS ENVÍA. Sin eso, dos toques nerviosos mandan dos entradas; la
// segunda rebota contra el único de Postgres y el operario ve un error rojo por haber tocado bien.

type EstadoForm = { error: string | null; mensaje?: string | null }

export function BloqueAsistencia({
  dia, obraId, compacto = false,
}: {
  dia: DiaDeAsistencia | null
  obraId: string | null
  /** En escritorio el bloque comparte fila con «Ver historial» y el botón no ocupa el ancho. */
  compacto?: boolean
}) {
  const formRef = useRef<HTMLFormElement>(null)
  // EL SEGUNDO SUBMIT TIENE QUE PASAR DE LARGO. `requestSubmit()` vuelve a disparar `onSubmit`: sin
  // esta marca, el formulario se intercepta a sí mismo para siempre y la entrada no se registra
  // nunca. Es un ref y no un estado a propósito — cambiarlo no tiene que redibujar nada.
  const yaUbicado = useRef(false)
  const [ubicando, setUbicando] = useState(false)

  const [estado, accion, enviando] = useActionState(
    async (_prev: EstadoForm, form: FormData): Promise<EstadoForm> => {
      const r = await registrarMarca(form)
      return r.ok ? { error: null, mensaje: r.mensaje ?? null } : { error: r.error }
    },
    { error: null },
  )

  /**
   * ═══ EL PUNTO SE PIDE ANTES DE MANDAR, Y NUNCA FRENA LA MARCA ═══
   *
   * El jefe de obra necesita saber desde dónde arrancó el día cada uno. Pero fichar es lo importante:
   * si el teléfono niega el permiso, no tiene señal de GPS o está adentro de un galpón de chapa, la
   * entrada se registra IGUAL y sin ubicación. Un operario que no puede marcar porque el navegador no
   * lo ubica es exactamente el modo de fallar que no se admite.
   *
   * Por eso hay tope de 8 segundos y `catch` que sigue: el permiso se pide, se espera un poco, y si
   * no llega se manda sin él. `maximumAge: 0` porque interesa DÓNDE ESTÁ AHORA, no dónde estuvo — una
   * coordenada cacheada de hace media hora es un dato viejo con cara de dato nuevo.
   */
  async function ubicar(): Promise<{ lat?: number; lon?: number; precision_m?: number }> {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return {}
    return new Promise((resolve) => {
      let listo = false
      const cerrar = (v: { lat?: number; lon?: number; precision_m?: number }) => {
        if (!listo) { listo = true; resolve(v) }
      }
      const reloj = setTimeout(() => cerrar({}), 8000)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(reloj)
          cerrar({
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
            precision_m: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : undefined,
          })
        },
        () => { clearTimeout(reloj); cerrar({}) },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
      )
    })
  }

  async function enviarConUbicacion(ev: React.FormEvent<HTMLFormElement>) {
    // Sólo la ENTRADA lleva punto: es «dónde dio el inicio del día». La salida no se pidió y no se
    // guarda — un dato personal que nadie mira no se junta.
    if (siguiente.tipo !== 'entrada') return
    if (yaUbicado.current) { yaUbicado.current = false; return }
    ev.preventDefault()
    setUbicando(true)
    const p = await ubicar().catch(() => ({}))
    setUbicando(false)
    const f = formRef.current
    if (!f) return
    yaUbicado.current = true
    for (const [k, v] of Object.entries(p)) {
      if (v == null) continue
      const input = document.createElement('input')
      input.type = 'hidden'; input.name = k; input.value = String(v)
      f.appendChild(input)
    }
    f.requestSubmit()
  }

  const siguiente = siguienteAccion(dia)
  const lectura = lecturaDelDia(dia)
  const entrada = hora(dia?.entrada ?? null)
  const salida = hora(dia?.salida ?? null)

  return (
    <div data-testid="bloque-asistencia">
      <div className="flex items-baseline gap-3">
        <Estado tono={lectura.tono} clave={dia?.estado ?? 'sin_registrar'} testid="estado-asistencia">
          {lectura.texto}
        </Estado>
        <span className="ml-auto font-mono text-[12.5px] tabular-nums text-muted">
          {entrada ? `entrada ${entrada}` : ''}
          {salida ? ` · salida ${salida}` : ''}
        </span>
      </div>

      {siguiente.tipo && (
        <form ref={formRef} action={accion} onSubmit={enviarConUbicacion} className={compacto ? 'mt-3' : 'mt-3.5'}>
          <input type="hidden" name="obra_id" value={obraId ?? ''} />
          <button
            type="submit"
            disabled={enviando || ubicando}
            data-testid="registrar-marca"
            data-tipo={siguiente.tipo}
            className={`flex h-[52px] items-center justify-center rounded-control bg-marca text-[15px] font-semibold text-[color:var(--os-on-marca)] disabled:opacity-60 ${
              compacto ? 'w-full lg:h-[40px] lg:w-auto lg:px-5' : 'w-full'
            }`}
          >
            {ubicando ? 'Tomando la ubicación…' : enviando ? 'Registrando…' : siguiente.texto}
          </button>
        </form>
      )}

      {estado.error && (
        <p className="mt-2 text-[12px] text-neg" data-testid="asistencia-error">{estado.error}</p>
      )}
      {estado.mensaje && !estado.error && (
        <p className="mt-2 text-[12px] text-muted" data-testid="asistencia-ok">{estado.mensaje}</p>
      )}
      {/* 22/08/2026 · EL TELÉFONO SE ABRE PARA APRETAR UN BOTÓN, DOS VECES POR DÍA. Dos líneas
          permanentes debajo del botón se leen la primera semana y después son ruido en la pantalla
          más chica del OS. La ubicación SÍ se queda a la vista y sólo en la entrada: es lo único
          que el botón hace además de registrar la marca, y eso hay que saberlo ANTES de apretarlo.
          El resto —qué pasa sin señal— se consulta cuando pasa, y cuando pasa el error lo dice. */}
      {!estado.error && !estado.mensaje && siguiente.tipo === 'entrada' && (
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          Al entrar se guarda desde dónde marcaste. Si el teléfono no puede ubicarte, se registra igual.
        </p>
      )}
      {!estado.error && !estado.mensaje && siguiente.tipo && (
        <Ayuda titulo="Qué pasa si no tengo señal" testid="ayuda-marca">
          Se guarda al instante. Sin señal no se envía: te lo va a decir, no lo da por hecho.
        </Ayuda>
      )}
    </div>
  )
}
