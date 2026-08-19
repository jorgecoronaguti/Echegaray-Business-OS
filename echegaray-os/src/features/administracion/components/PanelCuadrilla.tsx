// LA CUADRILLA ABIERTA — sus integrantes, su capataz, y a qué obra mandarla.
//
// ═══ LA OBRA DE LA CUADRILLA NO SE GUARDA ═══
//
// Mandarla a una obra NO escribe un campo `obra_id` en la cuadrilla: crea una asignación por cada
// integrante vigente, todas con `cuadrilla_id`. Por eso la obra puede sacar a uno sin desarmar la
// cuadrilla, y por eso «obras actuales» no puede quedar desactualizado — se deriva de esas mismas
// asignaciones cada vez que se lee.

import Link from 'next/link'
import {
  BotonAccion, Campo, CTRL, FormAccion,
  type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import type { Cuadrilla, Integrante } from '../types'

interface Plantel { id: string; nombre_completo: string }
interface Obra { id: string; nombre: string }

function CamposCuadrilla({ cuadrilla, plantel }: { cuadrilla: Cuadrilla | null; plantel: Plantel[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Campo label="Nombre" ancho="col-span-2">
        <input
          name="nombre" required maxLength={120} className={CTRL}
          defaultValue={cuadrilla?.nombre ?? ''} data-testid="cuadrilla-nombre"
        />
      </Campo>
      <Campo label="Responsable / capataz" ancho="col-span-2" ayuda="Una persona del legajo, no un texto.">
        <select name="responsable_id" defaultValue={cuadrilla?.responsable_id ?? ''} className={CTRL}>
          <option value="">sin responsable</option>
          {plantel.map((p) => <option key={p.id} value={p.id}>{p.nombre_completo}</option>)}
        </select>
      </Campo>
      <Campo label="Notas" ancho="col-span-2">
        <input name="notas" maxLength={300} className={CTRL} defaultValue={cuadrilla?.notas ?? ''} />
      </Campo>
    </div>
  )
}

export function PanelCuadrilla({
  cuadrilla, integrantes, plantel, obras, editar, archivar, agregar, quitar, asignarAObra, cerrarHref,
}: {
  cuadrilla: Cuadrilla
  integrantes: Integrante[]
  plantel: Plantel[]
  obras: Obra[]
  editar: AccionFormulario
  archivar: (activa: boolean) => Promise<ResultadoAccion>
  agregar: AccionFormulario
  quitar: (integranteId: string) => Promise<ResultadoAccion>
  asignarAObra: AccionFormulario
  cerrarHref: string
}) {
  const vigentes = integrantes.filter((i) => !i.hasta)
  const salidos = integrantes.filter((i) => i.hasta)

  return (
    <aside
      data-testid="panel-cuadrilla"
      className="w-full shrink-0 border-t border-line bg-surface-quiet px-4 py-4 lg:w-[380px] lg:border-l lg:border-t-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-faint">
            {cuadrilla.activa ? 'Cuadrilla activa' : 'Archivada'}
          </p>
          <p className="truncate text-[14px] font-semibold text-ink">{cuadrilla.nombre}</p>
          <p className="mt-0.5 text-[11px] text-faint">
            {cuadrilla.obras_actuales
              ? `en ${cuadrilla.obras_actuales}`
              : 'sin obra asignada hoy'}
          </p>
        </div>
        <Link href={cerrarHref} data-testid="cerrar-panel" className="shrink-0 text-[12px] text-muted hover:text-ink">
          cerrar
        </Link>
      </div>

      <div className="mt-4">
        <FormAccion accion={editar} testid="form-cuadrilla-editar" enviar="Guardar">
          <CamposCuadrilla cuadrilla={cuadrilla} plantel={plantel} />
        </FormAccion>
      </div>

      <div className="mt-5 border-t border-line pt-3">
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">
          Integrantes ({vigentes.length})
        </p>
        {vigentes.length === 0
          ? <p className="text-[12px] text-muted">Sin integrantes.</p>
          : (
              <ul data-testid="integrantes" className="space-y-1.5">
                {vigentes.map((i) => (
                  <li key={i.id} className="flex items-baseline justify-between gap-3 text-[12px]">
                    <Link href={`/administracion/personas/${i.persona_id}`} className="min-w-0 truncate text-ink hover:underline">
                      {i.nombre_completo ?? i.persona_id}
                    </Link>
                    <BotonAccion accion={quitar} args={[i.id]} testid="quitar-integrante">Sacar</BotonAccion>
                  </li>
                ))}
              </ul>
            )}

        <div className="mt-3">
          <FormAccion accion={agregar} testid="form-integrante" enviar="Sumar" limpiarAlOk mensajeOk="Sumado.">
            <div className="grid grid-cols-2 gap-2.5">
              <Campo
                label="Sumar a la cuadrilla" ancho="col-span-2"
                ayuda="Si venía de otra cuadrilla, ese período se cierra el día anterior."
              >
                <select name="persona_id" required defaultValue="" className={CTRL}>
                  <option value="" disabled>elegir del plantel</option>
                  {plantel.map((p) => <option key={p.id} value={p.id}>{p.nombre_completo}</option>)}
                </select>
              </Campo>
              <Campo label="Desde"><input type="date" name="desde" className={CTRL} /></Campo>
            </div>
          </FormAccion>
        </div>

        {salidos.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer text-[11px] text-faint">
              Ya no están · {salidos.length}
            </summary>
            <ul className="mt-1.5 space-y-1" data-testid="integrantes-historial">
              {salidos.map((i) => (
                <li key={i.id} className="flex items-baseline justify-between gap-3 text-[11px] text-faint">
                  <span className="min-w-0 truncate">{i.nombre_completo ?? i.persona_id}</span>
                  <span className="shrink-0 tabular-nums">{i.desde} → {i.hasta}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <div className="mt-5 border-t border-line pt-3">
        <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">Mandar a una obra</p>
        {vigentes.length === 0
          ? <p className="text-[12px] text-muted">Sin integrantes vigentes no hay a quién asignar.</p>
          : (
              <FormAccion accion={asignarAObra} testid="form-cuadrilla-obra" enviar="Asignar">
                <input type="hidden" name="cuadrilla_id" value={cuadrilla.id} />
                <div className="grid grid-cols-2 gap-2.5">
                  <Campo label="Obra" ancho="col-span-2">
                    <select name="obra_id" required defaultValue="" className={CTRL}>
                      <option value="" disabled>elegir obra</option>
                      {obras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Desde"><input type="date" name="desde" className={CTRL} /></Campo>
                </div>
              </FormAccion>
            )}
      </div>

      <div className="mt-5 border-t border-line pt-3">
        <p className="mb-2 text-[12px] text-muted">
          {cuadrilla.activa
            ? 'Archivar la saca de las listas operativas. No borra nada: las asignaciones a obra ya cargadas la siguen referenciando.'
            : 'Está archivada: no aparece para asignar.'}
        </p>
        <BotonAccion
          accion={archivar} args={[!cuadrilla.activa]}
          testid={cuadrilla.activa ? 'archivar-cuadrilla' : 'reactivar-cuadrilla'}
          tono={cuadrilla.activa ? 'peligro' : 'neutral'}
        >{cuadrilla.activa ? 'Archivar' : 'Reactivar'}</BotonAccion>
      </div>
    </aside>
  )
}
