'use client'

import { useActionState } from 'react'
import { Aviso, Boton, CAMPO, Campo, ErrorCampo } from '@/shared/components/ds'
import { anotarImpedimentoAction, type EstadoForm } from '../acciones'

// ANOTAR UN IMPEDIMENTO DESDE LA OBRA.
//
// RESPONSABLE Y FECHA COMPROMETIDA SON OBLIGATORIOS, y no es burocracia del formulario: es la regla
// que ya impone `crearImpedimento`. Un impedimento sin responsable y sin fecha no se resuelve solo —
// es una queja anotada. El formulario los pide para que el rebote no llegue después de escribir todo.
//
// La actividad es opcional: quien está en el andamio sabe que faltan bloques mucho antes de saber a
// qué línea del plan corresponde. Colgarlo de la obra ya sirve.

const INICIAL: EstadoForm = { error: null }

const TIPOS = [
  ['material', 'Falta material'],
  ['equipo', 'Falta equipo o herramienta'],
  ['mano_de_obra', 'Falta gente'],
  ['trabajo_previo', 'Falta un trabajo previo'],
  ['informacion', 'Falta información o plano'],
  ['ingenieria_cliente', 'Depende del cliente'],
  ['permiso', 'Falta un permiso'],
  ['seguridad', 'Seguridad'],
  ['acceso', 'No hay acceso'],
  ['otro', 'Otro'],
] as const

export interface ActividadDelImpedimento {
  id: string
  nombre: string
  codigo: string | null
}

export function FormImpedimento({
  obraId,
  obraNombre,
  actividades,
  hoy,
}: {
  obraId: string
  obraNombre: string
  actividades: ActividadDelImpedimento[]
  hoy: string
}) {
  const [state, action, guardando] = useActionState(anotarImpedimentoAction, INICIAL)

  return (
    <form action={action} className="space-y-4" data-testid="form-impedimento">
      <input type="hidden" name="obra_id" value={obraId} />

      <Campo rotulo="¿Qué está frenando el trabajo?">
        <textarea
          name="descripcion"
          rows={3}
          required
          minLength={3}
          placeholder="Faltan bloques 18×18 para seguir el muro sur"
          className={`${CAMPO} h-auto py-2`}
          data-testid="impedimento-descripcion"
        />
      </Campo>

      <Campo rotulo="Tipo">
        <select name="tipo" defaultValue="material" required className={CAMPO}>
          {TIPOS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Campo>

      <Campo rotulo="Quién lo resuelve" ayuda="Una persona con nombre. Un área no libera nada.">
        <input name="responsable" required minLength={2} className={CAMPO} data-testid="impedimento-responsable" />
      </Campo>

      <Campo rotulo="¿Para cuándo se compromete?">
        <input
          type="date"
          name="fecha_compromiso"
          defaultValue={hoy}
          required
          className={CAMPO}
          data-testid="impedimento-compromiso"
        />
      </Campo>

      {actividades.length > 0 && (
        <Campo rotulo="Actividad" ayuda="Opcional: si sabés a qué actividad frena, queda colgado de ella.">
          <select name="actividad_id" defaultValue="" className={CAMPO}>
            <option value="">sin actividad</option>
            {actividades.map((a) => (
              <option key={a.id} value={a.id}>
                {a.codigo ? `${a.codigo} · ${a.nombre}` : a.nombre}
              </option>
            ))}
          </select>
        </Campo>
      )}

      {state.ok && state.mensaje && (
        <Aviso tono="info" titulo="Anotado" testid="impedimento-ok">
          {state.mensaje}
        </Aviso>
      )}
      {state.error && <ErrorCampo>{state.error}</ErrorCampo>}

      <div className="border-t border-line pt-3">
        <Boton
          type="submit"
          variante="primaria"
          disabled={guardando}
          className="h-[48px] w-full text-[15px]"
          data-testid="guardar-impedimento"
        >
          {guardando ? 'Guardando…' : `Anotar el impedimento en ${obraNombre}`}
        </Boton>
      </div>
    </form>
  )
}
