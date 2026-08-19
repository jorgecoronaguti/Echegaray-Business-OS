'use client'

// LA BARRA DE PLANIFICACIÓN — lo que se puede HACER sobre el plan, arriba de las cuatro vistas.
//
// ═══ POR QUÉ ESTÁ ACÁ Y NO ADENTRO DEL GANTT ═══
//
// «+ Nueva actividad» vivía en la barra del Gantt, así que desde Lista, Tablero o Próximos no se
// podía crear nada: había que volver al Gantt para agregar una fila que después se iba a mirar desde
// otra vista. Crear trabajo no es una función del Gantt, es una función del PLAN — y las cuatro
// vistas son cuatro maneras de mirar el mismo plan.
//
// Lo mismo con los filtros: un filtro que se aplica en una vista y se pierde al cambiar de solapa
// haría que cambiar de vista cambie lo que se ve sin que nadie lo haya pedido.
//
// ═══ LOS RUBROS SE GESTIONAN, Y NO SON UNA TABLA ═══
//
// Crear, renombrar, subir, bajar y archivar. Todo eso escribe `obra_actividad` —una fila
// `tipo='resumen'` y la `seccion` de sus hijas—: no hay una entidad `rubro` que mantener al día.
// Ver `services/rubros.ts`.

import { useState } from 'react'
import {
  BotonAccion, Campo, CTRL, FormAccion,
  type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import type { Persona } from '../types'
import type { Rubro } from '../services/rubros'
import { cuantosFiltros, type FiltroPlan } from '../services/filtroPlan'
import { ESTADO_LABEL, COLUMNAS_TABLERO } from '../types'

export interface AccionesPlan {
  crearRubro?: AccionFormulario
  renombrarRubro?: (nombre: string, form: FormData) => Promise<ResultadoAccion>
  moverRubro?: (nombre: string, direccion: 'arriba' | 'abajo') => Promise<ResultadoAccion>
  archivarRubro?: (nombre: string, archivar: boolean) => Promise<ResultadoAccion>
}

/** Un renglón de la lista de rubros: renombrar, subir, bajar, archivar. */
function FilaRubro({ r, acciones }: { r: Rubro; acciones: AccionesPlan }) {
  const [renombrando, setRenombrando] = useState(false)
  return (
    <li className="px-2.5 py-1.5" data-testid="fila-rubro">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[12px] text-ink" title={r.nombre}>{r.nombre}</span>
        <span className="shrink-0 text-[11px] tabular-nums text-faint">{r.n}</span>
        {acciones.moverRubro && (
          <>
            <BotonAccion accion={acciones.moverRubro} args={[r.nombre, 'arriba']} testid="subir-rubro">↑</BotonAccion>
            <BotonAccion accion={acciones.moverRubro} args={[r.nombre, 'abajo']} testid="bajar-rubro">↓</BotonAccion>
          </>
        )}
        {acciones.renombrarRubro && (
          <button
            type="button"
            onClick={() => setRenombrando((v) => !v)}
            data-testid="renombrar-rubro"
            className="shrink-0 text-[11px] text-muted hover:text-ink"
          >{renombrando ? 'cancelar' : 'renombrar'}</button>
        )}
        {acciones.archivarRubro && (
          <BotonAccion accion={acciones.archivarRubro} args={[r.nombre, true]} testid="archivar-rubro" tono="peligro">
            archivar
          </BotonAccion>
        )}
      </div>
      {renombrando && acciones.renombrarRubro && (
        <div className="mt-1.5">
          {/* RENOMBRAR TOCA LA CABECERA Y LA `seccion` DE TODAS SUS HIJAS. El vínculo es texto: si
              sólo cambiara el rótulo, el cronograma mostraría dos grupos donde había uno. */}
          <FormAccion
            accion={acciones.renombrarRubro.bind(null, r.nombre)}
            testid="form-renombrar-rubro"
            enviar="Renombrar"
            mensajeOk="Rubro renombrado."
          >
            <input name="nombre" defaultValue={r.nombre} required minLength={2} maxLength={120} className={CTRL} />
          </FormAccion>
        </div>
      )}
    </li>
  )
}

export function BarraPlan({
  rubros, personas, filtro, alFiltrar, acciones, alta, altaRubroAbierta = false,
}: {
  rubros: Rubro[]
  personas: Persona[]
  filtro: FiltroPlan
  alFiltrar: (f: FiltroPlan) => void
  acciones: AccionesPlan
  /** El formulario de alta de actividad, ya armado por el cronograma. Entra como nodo para que esta
   *  barra no tenga que conocer los campos de una actividad. */
  alta?: React.ReactNode
  altaRubroAbierta?: boolean
}) {
  const [abierto, setAbierto] = useState<'' | 'actividad' | 'rubros' | 'filtros'>(
    altaRubroAbierta ? 'rubros' : '',
  )
  const n = cuantosFiltros(filtro)
  const alternar = (v: typeof abierto) => setAbierto((p) => (p === v ? '' : v))
  const boton = (v: Exclude<typeof abierto, ''>, texto: string, testid: string, insignia?: number) => (
    <button
      type="button"
      onClick={() => alternar(v)}
      data-testid={testid}
      aria-expanded={abierto === v}
      className={`shrink-0 rounded-control border px-2.5 py-1 text-[12px] ${
        abierto === v ? 'border-line-strong bg-surface-sunken text-ink' : 'border-line text-ink hover:bg-surface-sunken'
      }`}
    >
      {texto}
      {insignia ? <span className="ml-1.5 rounded bg-marca px-1 text-[10px] font-medium text-ink">{insignia}</span> : null}
    </button>
  )

  return (
    <div className="rounded-card border border-line bg-surface" data-testid="barra-plan">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        {alta && boton('actividad', '+ Nueva actividad', 'nueva-actividad')}
        {acciones.crearRubro && boton('rubros', '+ Nuevo rubro', 'nuevo-rubro')}
        <div className="flex-1" />
        {boton('filtros', 'Filtros', 'boton-filtros', n)}
        {n > 0 && (
          <button
            type="button"
            onClick={() => alFiltrar({ rubro: '', estado: '', responsable: '' })}
            data-testid="limpiar-filtros"
            className="shrink-0 text-[12px] text-muted hover:text-ink"
          >limpiar</button>
        )}
      </div>

      {abierto === 'actividad' && alta && (
        <div className="border-t border-line bg-surface-quiet p-3" data-testid="alta-actividad">{alta}</div>
      )}

      {abierto === 'rubros' && (
        <div className="border-t border-line bg-surface-quiet p-3" data-testid="panel-rubros">
          {acciones.crearRubro && (
            <FormAccion accion={acciones.crearRubro} testid="form-rubro" enviar="Crear rubro" limpiarAlOk mensajeOk="Rubro creado.">
              <input
                name="nombre" required minLength={2} maxLength={120} className={CTRL}
                placeholder="Estructura · Mampostería · Instalaciones…" data-testid="rubro-nombre"
              />
            </FormAccion>
          )}
          {rubros.length > 0 && (
            <ul className="mt-3 divide-y divide-line/60 rounded-card border border-line bg-surface" data-testid="lista-rubros">
              {rubros.map((r) => <FilaRubro key={r.nombre} r={r} acciones={acciones} />)}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-faint">
            Archivar un rubro archiva también su trabajo: sale del cronograma y de los promedios, y
            no se borra nada. Renombrar, ordenar o archivar deja esas actividades PROTEGIDAS del
            tracker de Drive: lo que se toca acá ya no lo vuelve a pisar la planilla.
          </p>
        </div>
      )}

      {abierto === 'filtros' && (
        <div className="border-t border-line bg-surface-quiet p-3" data-testid="panel-filtros">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <Campo label="Rubro">
              <select
                value={filtro.rubro}
                onChange={(e) => alFiltrar({ ...filtro, rubro: e.target.value })}
                className={CTRL}
                data-testid="filtro-rubro"
              >
                <option value="">todos</option>
                {rubros.map((r) => <option key={r.nombre} value={r.nombre}>{r.nombre}</option>)}
              </select>
            </Campo>
            <Campo label="Estado">
              <select
                value={filtro.estado}
                onChange={(e) => alFiltrar({ ...filtro, estado: e.target.value })}
                className={CTRL}
                data-testid="filtro-estado"
              >
                <option value="">todos</option>
                {COLUMNAS_TABLERO.map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
              </select>
            </Campo>
            <Campo label="Responsable">
              <select
                value={filtro.responsable}
                onChange={(e) => alFiltrar({ ...filtro, responsable: e.target.value })}
                className={CTRL}
                data-testid="filtro-responsable"
              >
                <option value="">todos</option>
                <option value="sin">sin responsable</option>
                {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre_completo}</option>)}
              </select>
            </Campo>
          </div>
        </div>
      )}
    </div>
  )
}
