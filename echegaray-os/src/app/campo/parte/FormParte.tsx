'use client'

import { useActionState, useState } from 'react'
import { Aviso, Boton, CAMPO, Campo, ErrorCampo, Nulo } from '@/shared/components/ds'
import { cargarParteAction, type EstadoForm } from '../acciones'

// EL PARTE DEL DÍA, EN EL TELÉFONO.
//
// ═══ EL MÉTODO DE LA ACTIVIDAD DECIDE QUÉ SE PREGUNTA ═══
//
// Una actividad que se mide en m² pide CANTIDAD; una que se mide por avance pide PORCENTAJE. Mostrar
// los dos campos siempre invita a llenar el que no corresponde, y un número cargado en la columna
// equivocada no mueve el avance: alguien carga partes toda la semana y la obra sigue quieta.
//
// La regla vive en el servidor (`registrarEjecucion` la vuelve a verificar contra la base). Acá sólo
// se PREGUNTA lo que corresponde — el formulario no es el guarda.

export interface ActividadDelParte {
  id: string
  nombre: string
  codigo: string | null
  unidad: string | null
  metodo: string
}

const INICIAL: EstadoForm = { error: null }

export function FormParte({
  obraId,
  obraNombre,
  actividades,
  hoy,
}: {
  obraId: string
  obraNombre: string
  actividades: ActividadDelParte[]
  hoy: string
}) {
  const [state, action, guardando] = useActionState(cargarParteAction, INICIAL)
  const [actividadId, setActividadId] = useState('')
  const actividad = actividades.find((a) => a.id === actividadId) ?? null
  const porCantidad = actividad?.metodo === 'cantidad'

  if (actividades.length === 0) {
    return (
      <Aviso tono="warn" titulo="Esta obra no tiene actividades cargadas.">
        Un parte se carga contra una actividad del plan. Hasta que la obra tenga su planificación, no hay contra qué
        cargarlo — se prepara desde Obras, en el escritorio.
      </Aviso>
    )
  }

  return (
    <form action={action} className="space-y-4" data-testid="form-parte">
      <input type="hidden" name="obra_id" value={obraId} />

      <Campo rotulo="Actividad">
        <select
          name="actividad_id"
          required
          value={actividadId}
          onChange={(e) => setActividadId(e.target.value)}
          className={CAMPO}
          data-testid="parte-actividad"
        >
          <option value="">Elegí la actividad</option>
          {actividades.map((a) => (
            <option key={a.id} value={a.id}>
              {a.codigo ? `${a.codigo} · ${a.nombre}` : a.nombre}
            </option>
          ))}
        </select>
      </Campo>

      <Campo rotulo="Día">
        <input type="date" name="fecha" defaultValue={hoy} required className={CAMPO} data-testid="parte-fecha" />
      </Campo>

      {actividad === null ? (
        <p className="text-[12.5px] text-faint">Elegí la actividad y te pido lo que esa actividad mide.</p>
      ) : porCantidad ? (
        <Campo
          rotulo={`Cantidad ejecutada${actividad.unidad ? ` (${actividad.unidad})` : ''}`}
          ayuda="Lo de HOY, no el acumulado: el acumulado lo suma el OS."
        >
          <input
            name="cantidad"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            required
            className={CAMPO}
            data-testid="parte-cantidad"
          />
        </Campo>
      ) : (
        <Campo rotulo="Avance del día (%)" ayuda="Cuánto avanzó HOY esa actividad, de 0 a 100.">
          <input
            name="avance_pct"
            type="number"
            step="0.1"
            min="0"
            max="100"
            inputMode="decimal"
            required
            className={CAMPO}
            data-testid="parte-avance"
          />
        </Campo>
      )}

      <Campo rotulo="Comentario" ayuda="Qué pasó: lo que no entra en un número.">
        <textarea name="comentario" rows={3} maxLength={500} className={`${CAMPO} h-auto py-2`} />
      </Campo>

      {state.ok && state.mensaje && (
        <Aviso tono="info" titulo="Cargado" testid="parte-ok">
          {state.mensaje}
        </Aviso>
      )}
      {state.error && <ErrorCampo>{state.error}</ErrorCampo>}

      <div className="space-y-2 border-t border-line pt-3">
        <Boton
          type="submit"
          variante="primaria"
          disabled={guardando}
          className="h-[48px] w-full text-[15px]"
          data-testid="guardar-parte"
        >
          {guardando ? 'Guardando…' : `Guardar el parte de ${obraNombre}`}
        </Boton>
        <p className="text-center text-[11px] text-faint">
          Se guarda al instante contra la base. Si el teléfono no tiene señal, el guardado falla y te lo dice: nada
          queda «en camino» sin que lo sepas. <Nulo>La cola sin conexión todavía no existe.</Nulo>
        </p>
      </div>
    </form>
  )
}
