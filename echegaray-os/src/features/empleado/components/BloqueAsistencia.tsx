'use client'

import { useActionState } from 'react'
import { Estado } from '@/shared/components/ds'
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
  const [estado, accion, enviando] = useActionState(
    async (_prev: EstadoForm, form: FormData): Promise<EstadoForm> => {
      const r = await registrarMarca(form)
      return r.ok ? { error: null, mensaje: r.mensaje ?? null } : { error: r.error }
    },
    { error: null },
  )

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
        <form action={accion} className={compacto ? 'mt-3' : 'mt-3.5'}>
          <input type="hidden" name="obra_id" value={obraId ?? ''} />
          <button
            type="submit"
            disabled={enviando}
            data-testid="registrar-marca"
            data-tipo={siguiente.tipo}
            className={`flex h-[52px] items-center justify-center rounded-control bg-marca text-[15px] font-semibold text-[color:var(--os-on-marca)] disabled:opacity-60 ${
              compacto ? 'w-full lg:h-[40px] lg:w-auto lg:px-5' : 'w-full'
            }`}
          >
            {enviando ? 'Registrando…' : siguiente.texto}
          </button>
        </form>
      )}

      {estado.error && (
        <p className="mt-2 text-[12px] text-neg" data-testid="asistencia-error">{estado.error}</p>
      )}
      {estado.mensaje && !estado.error && (
        <p className="mt-2 text-[12px] text-muted" data-testid="asistencia-ok">{estado.mensaje}</p>
      )}
      {!estado.error && !estado.mensaje && siguiente.tipo && (
        <p className="mt-2 text-[11px] text-faint">
          Se guarda al instante. Sin señal no se envía: te lo va a decir, no lo da por hecho.
        </p>
      )}
    </div>
  )
}
