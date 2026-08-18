'use client'

// EL PANEL CONTEXTUAL DEL CRONOGRAMA — se selecciona una barra y aparece acá lo que se puede hacer
// con ella. No es una pantalla aparte: el cronograma tiene que seguir a la vista mientras se edita,
// porque lo que se está decidiendo es la fecha de esta actividad CONTRA las de al lado.
//
// ═══ POR QUÉ EL AVANCE TIENE SU PROPIO BOTÓN ═══
//
// Registrar avance es la edición que se hace todos los días, desde el teléfono y con la obra
// adelante. Si viviera dentro del formulario largo habría que pasar por diez campos para mover un
// número. Va arriba, con un toque, y usa `registrarAvance`, que sólo escribe `pct`: así el avance
// del jefe de obra nunca pisa una fecha por accidente.

import { useState } from 'react'
import { BotonAccion, Campo, CTRL, FormAccion, type ResultadoAccion } from '@/shared/components/ui'
import type { Actividad, Persona } from '../types'

export type AccionesCronograma = {
  crear: (form: FormData) => Promise<ResultadoAccion>
  editar: (actividadId: string, form: FormData) => Promise<ResultadoAccion>
  avance: (actividadId: string, pct: number) => Promise<ResultadoAccion>
  archivar: (actividadId: string, archivada: boolean) => Promise<ResultadoAccion>
  hito: (actividadId: string, esHito: boolean) => Promise<ResultadoAccion>
  sellar: () => Promise<ResultadoAccion>
}

const fmt = (v: string | number | null | undefined) => (v == null ? '' : String(v))

function SelectResponsable({ personas, valor }: { personas: Persona[]; valor: string | null }) {
  return (
    <select name="responsable_id" defaultValue={valor ?? ''} className={CTRL}>
      <option value="">sin responsable asignado</option>
      {personas.map((p) => (
        <option key={p.id} value={p.id}>{p.nombre_completo}</option>
      ))}
    </select>
  )
}

/** Los campos comunes al alta y a la edición. Uno solo: si se separaran, el alta y la edición
 *  terminarían aceptando cosas distintas y el desvío entre las dos se descubriría tarde. */
function CamposActividad({ a, personas }: { a?: Actividad; personas: Persona[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      <Campo label="Actividad" ancho="col-span-2">
        <input name="nombre" defaultValue={fmt(a?.nombre)} required minLength={2} maxLength={200} className={CTRL} />
      </Campo>
      {!a && (
        <Campo label="Sección" ancho="col-span-2" ayuda="Agrupa la actividad en el cronograma. Es parte de su identidad: no se puede cambiar después.">
          <input name="seccion" maxLength={120} className={CTRL} placeholder="opcional" />
        </Campo>
      )}
      <Campo label="Inicio previsto"><input type="date" name="inicio_plan" defaultValue={fmt(a?.inicio_plan)} className={CTRL} /></Campo>
      <Campo label="Fin previsto"><input type="date" name="fin_plan" defaultValue={fmt(a?.fin_plan)} className={CTRL} /></Campo>
      <Campo label="Días"><input type="number" name="dias_plan" min={0} step={1} defaultValue={fmt(a?.dias_plan)} className={CTRL} /></Campo>
      <Campo label="Avance %"><input type="number" name="pct" min={0} max={100} step={1} defaultValue={fmt(a?.pct)} className={CTRL} /></Campo>
      <Campo label="HH plan"><input type="number" name="hh_plan" min={0} step="0.5" defaultValue={fmt(a?.hh_plan)} className={CTRL} /></Campo>
      <Campo label="HH real"><input type="number" name="hh_real" min={0} step="0.5" defaultValue={fmt(a?.hh_real)} className={CTRL} /></Campo>
      <Campo label="Responsable" ancho="col-span-2"><SelectResponsable personas={personas} valor={a?.responsable_id ?? null} /></Campo>
      <Campo label="Cuadrilla" ancho="col-span-2"><input name="cuadrilla" defaultValue={fmt(a?.cuadrilla)} maxLength={120} className={CTRL} /></Campo>
      <Campo label="Comentario" ancho="col-span-2"><input name="comentario" defaultValue={fmt(a?.comentario)} maxLength={400} className={CTRL} /></Campo>
      {!a && (
        <label className="col-span-2 flex items-center gap-2 text-[12px] text-muted">
          <input type="checkbox" name="es_hito" className="h-3.5 w-3.5" /> Es un hito (una fecha, sin duración)
        </label>
      )}
    </div>
  )
}

/**
 * El avance rápido: un toque para los valores de siempre, y un campo para el resto.
 *
 * El campo arranca en el avance que tiene la actividad, y el componente se REMONTA por `key` cuando
 * cambia la actividad o su avance —no se sincroniza con un efecto—. Sin eso, al pasar de una barra a
 * otra el campo se quedaba con el número de la anterior, y el botón de registrar habría escrito el
 * avance de una actividad sobre otra.
 */
function AvanceRapido({ a, avance }: { a: Actividad; avance: AccionesCronograma['avance'] }) {
  const [valor, setValor] = useState<string>(a.pct == null ? '' : String(a.pct))

  return (
    <div className="rounded-control border border-line bg-white p-2.5" data-testid="avance-rapido">
      <p className="text-[11px] uppercase tracking-wide text-faint">Avance</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {[0, 25, 50, 75, 100].map((p) => (
          <BotonAccion key={p} accion={() => avance(a.id, p)} testid={`avance-${p}`}>{p}%</BotonAccion>
        ))}
        <input
          type="number" min={0} max={100} step={1} value={valor}
          onChange={(e) => setValor(e.target.value)}
          data-testid="avance-valor"
          className="w-16 rounded-control border border-line px-2 py-1 text-[12px] tabular-nums"
        />
        <BotonAccion
          accion={() => avance(a.id, Number(valor))}
          testid="avance-guardar"
          tono="fuerte"
        >Registrar</BotonAccion>
      </div>
    </div>
  )
}

export function PanelActividad({
  actividad, personas, acciones, alCerrar,
}: {
  actividad: Actividad
  personas: Persona[]
  acciones: AccionesCronograma
  alCerrar: () => void
}) {
  const a = actividad
  return (
    <aside
      data-testid="panel-actividad"
      className="w-full shrink-0 border-t border-line bg-slate-50/70 p-3.5 lg:w-[330px] lg:border-l lg:border-t-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[11px] uppercase tracking-wide text-faint">
            {[a.seccion, a.codigo, a.tipo].filter(Boolean).join(' · ')}
          </p>
          <p className="text-[14px] font-semibold leading-tight text-ink">{a.nombre}</p>
        </div>
        <button type="button" onClick={alCerrar} className="shrink-0 text-[12px] text-muted hover:text-ink">cerrar</button>
      </div>

      {/* LA LÍNEA BASE SE DICE SIEMPRE: es contra qué se mide el desvío, y "sin sellar" no es lo
          mismo que "en fecha". */}
      <p className="mt-2 text-[11px] text-faint">
        Línea base: {a.inicio_base ? `${a.inicio_base} → ${a.fin_base ?? '—'}` : 'sin sellar'}
      </p>

      <div className="mt-3 space-y-3">
        <AvanceRapido key={`${a.id}:${a.pct}`} a={a} avance={acciones.avance} />

        <details className="rounded-control border border-line bg-white">
          <summary className="cursor-pointer px-2.5 py-1.5 text-[12px] font-medium text-ink">Editar la actividad</summary>
          <div className="border-t border-line p-2.5">
            <FormAccion
              accion={(form) => acciones.editar(a.id, form)}
              testid="form-editar-actividad"
              enviar="Guardar cambios"
              mensajeOk="Actividad guardada."
            >
              <CamposActividad a={a} personas={personas} />
            </FormAccion>
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-2">
          {a.tipo !== 'resumen' && (
            <BotonAccion accion={() => acciones.hito(a.id, a.tipo !== 'hito')} testid="marcar-hito">
              {a.tipo === 'hito' ? 'Dejar de ser hito' : 'Marcar como hito'}
            </BotonAccion>
          )}
          <BotonAccion accion={() => acciones.archivar(a.id, true)} testid="archivar-actividad" tono="peligro">
            Archivar
          </BotonAccion>
        </div>
        <p className="text-[11px] text-faint">
          Archivar la saca del cronograma y de los promedios; no la borra. Su avance y su línea base quedan.
        </p>
      </div>
    </aside>
  )
}

/** El alta. Vive en el mismo archivo que la edición porque comparten los campos. */
export function FormNuevaActividad({
  personas, crear,
}: {
  personas: Persona[]
  crear: AccionesCronograma['crear']
}) {
  return (
    <FormAccion accion={crear} testid="form-nueva-actividad" enviar="Crear actividad" limpiarAlOk mensajeOk="Actividad creada.">
      <CamposActividad personas={personas} />
    </FormAccion>
  )
}
