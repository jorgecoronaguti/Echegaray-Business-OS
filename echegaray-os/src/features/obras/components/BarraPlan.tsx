'use client'

// LA BARRA DE VISTA DE PLANIFICACIÓN — 48px: las cuatro vistas a la izquierda, lo que se puede
// HACER sobre el plan a la derecha.
//
// ═══ POR QUÉ LAS ACCIONES NO VIVEN ADENTRO DEL GANTT ═══
//
// «+ Nueva actividad» vivía en la barra del Gantt, así que desde Lista, Tablero o Próximos no se
// podía crear nada: había que volver al Gantt para agregar una fila que después se iba a mirar
// desde otra vista. Crear trabajo no es una función del Gantt, es una función del PLAN — y las
// cuatro vistas son cuatro maneras de mirar el mismo plan. Lo mismo con el filtro: uno que se
// pierde al cambiar de vista hace que cambiar de vista cambie lo que se ve sin que nadie lo pida.
//
// ═══ UNA SOLA PRIMARIA ═══
//
// `+ Nueva actividad` es el único botón lleno de la pantalla: es lo que se hace acá. Todo lo demás
// —Detalle, escala, línea base, Filtros, + Nuevo rubro— es secundario y se dibuja igual entre sí,
// porque darle peso a los seis hacía que ninguno se leyera primero.
//
// ═══ LOS RUBROS SE GESTIONAN, Y NO SON UNA TABLA ═══
//
// Crear, renombrar, subir, bajar y archivar. Todo eso escribe `obra_actividad` —una fila
// `tipo='resumen'` y la `seccion` de sus hijas—: no hay una entidad `rubro` que mantener al día.

import { useState, type ReactNode } from 'react'
import { Boton, SubTabs } from '@/shared/components/ds'
import {
  BotonAccion, Campo, CTRL, FormAccion,
  type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import type { Persona } from '../types'
import type { Rubro } from '../services/rubros'
import type { Escala } from '../services/escala'
import { cuantosFiltros, type FiltroPlan } from '../services/filtroPlan'
import { SUBVISTAS, type SubVista } from '../services/subvistas'
import { ESTADO_LABEL, COLUMNAS_TABLERO } from '../types'

export interface AccionesPlan {
  crearRubro?: AccionFormulario
  renombrarRubro?: (nombre: string, form: FormData) => Promise<ResultadoAccion>
  moverRubro?: (nombre: string, direccion: 'arriba' | 'abajo') => Promise<ResultadoAccion>
  archivarRubro?: (nombre: string, archivar: boolean) => Promise<ResultadoAccion>
}

const DISCRETO = 'shrink-0 text-[12.5px] text-muted transition-colors hover:text-ink'

/** Un renglón de la lista de rubros: renombrar, subir, bajar, archivar. */
function FilaRubro({ r, acciones }: { r: Rubro; acciones: AccionesPlan }) {
  const [renombrando, setRenombrando] = useState(false)
  return (
    <li className="py-1.5" data-testid="fila-rubro">
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink" title={r.nombre}>{r.nombre}</span>
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-faint">{r.n}</span>
        {acciones.moverRubro && (
          <>
            <BotonAccion accion={acciones.moverRubro} args={[r.nombre, 'arriba']} testid="subir-rubro">↑</BotonAccion>
            <BotonAccion accion={acciones.moverRubro} args={[r.nombre, 'abajo']} testid="bajar-rubro">↓</BotonAccion>
          </>
        )}
        {acciones.renombrarRubro && (
          <button type="button" onClick={() => setRenombrando((v) => !v)} data-testid="renombrar-rubro" className={DISCRETO}>
            {renombrando ? 'cancelar' : 'renombrar'}
          </button>
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
  sub, alCambiarSub, detalleCerrado = false, alAbrirDetalle, escala, alCambiarEscala, sellar,
}: {
  rubros: Rubro[]
  personas: Persona[]
  filtro: FiltroPlan
  alFiltrar: (f: FiltroPlan) => void
  acciones: AccionesPlan
  /** El formulario de alta de actividad, ya armado por el cronograma. Entra como nodo para que esta
   *  barra no tenga que conocer los campos de una actividad. */
  alta?: ReactNode
  altaRubroAbierta?: boolean
  sub: SubVista
  alCambiarSub: (v: SubVista) => void
  /** `Detalle ‹` sólo aparece con el panel cerrado: es la puerta para volver a abrirlo. */
  detalleCerrado?: boolean
  alAbrirDetalle?: () => void
  /** La escala del calendario. Es una preferencia de vista, y por eso vive con las otras. */
  escala?: Escala
  alCambiarEscala?: (e: Escala) => void
  /** Sellar la línea base: acción de Administración sobre TODO el plan, no sobre una actividad. */
  sellar?: ReactNode
}) {
  const [abierto, setAbierto] = useState<'' | 'actividad' | 'rubros' | 'filtros'>(
    altaRubroAbierta ? 'rubros' : '',
  )
  const n = cuantosFiltros(filtro)
  const alternar = (v: typeof abierto) => setAbierto((p) => (p === v ? '' : v))

  return (
    <div data-testid="barra-plan">
      <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2 py-1">
        <SubTabs
          testid="subvistas-plan"
          items={SUBVISTAS.map((v) => ({
            label: v.label,
            onClick: () => alCambiarSub(v.id),
            activo: sub === v.id,
            testid: `subvista-${v.id}`,
          }))}
        />
        <div className="flex-1" />
        {detalleCerrado && alAbrirDetalle && (
          <button type="button" onClick={alAbrirDetalle} className={DISCRETO} data-testid="abrir-detalle">Detalle ‹</button>
        )}
        {sub === 'gantt' && escala && alCambiarEscala && (
          <span className="hidden shrink-0 items-center gap-2.5 text-[12.5px] md:flex" data-testid="escala-gantt">
            <span className="text-faint">Escala</span>
            {(['semana', 'mes'] as Escala[]).map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => alCambiarEscala(e)}
                aria-pressed={escala === e}
                className={escala === e ? 'border-b-[1.5px] border-ink font-medium text-ink' : 'text-muted hover:text-ink'}
              >{e === 'semana' ? 'día' : 'mes'}</button>
            ))}
          </span>
        )}
        {sellar}
        <button type="button" onClick={() => alternar('filtros')} aria-expanded={abierto === 'filtros'} data-testid="boton-filtros" className={DISCRETO}>
          Filtros{n > 0 ? ` · ${n}` : ''}
        </button>
        {n > 0 && (
          <button type="button" onClick={() => alFiltrar({ rubro: '', estado: '', responsable: '' })} data-testid="limpiar-filtros" className={DISCRETO}>
            limpiar
          </button>
        )}
        {acciones.crearRubro && (
          <button type="button" onClick={() => alternar('rubros')} aria-expanded={abierto === 'rubros'} data-testid="nuevo-rubro" className={DISCRETO}>
            + Nuevo rubro
          </button>
        )}
        {alta && (
          <Boton type="button" variante="primaria" onClick={() => alternar('actividad')} aria-expanded={abierto === 'actividad'} data-testid="nueva-actividad">
            + Nueva actividad
          </Boton>
        )}
      </div>

      {abierto === 'actividad' && alta && (
        <div className="border-t border-line py-3" data-testid="alta-actividad">{alta}</div>
      )}

      {abierto === 'rubros' && (
        <div className="border-t border-line py-3" data-testid="panel-rubros">
          {acciones.crearRubro && (
            <FormAccion accion={acciones.crearRubro} testid="form-rubro" enviar="Crear rubro" limpiarAlOk mensajeOk="Rubro creado.">
              <input
                name="nombre" required minLength={2} maxLength={120} className={CTRL}
                placeholder="Estructura · Mampostería · Instalaciones…" data-testid="rubro-nombre"
              />
            </FormAccion>
          )}
          {rubros.length > 0 && (
            <ul className="mt-3 divide-y divide-[#EFEEEA] border-t border-line" data-testid="lista-rubros">
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
        <div className="border-t border-line py-3" data-testid="panel-filtros">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <Campo label="Rubro">
              <select value={filtro.rubro} onChange={(e) => alFiltrar({ ...filtro, rubro: e.target.value })} className={CTRL} data-testid="filtro-rubro">
                <option value="">todos</option>
                {rubros.map((r) => <option key={r.nombre} value={r.nombre}>{r.nombre}</option>)}
              </select>
            </Campo>
            <Campo label="Estado">
              <select value={filtro.estado} onChange={(e) => alFiltrar({ ...filtro, estado: e.target.value })} className={CTRL} data-testid="filtro-estado">
                <option value="">todos</option>
                {COLUMNAS_TABLERO.map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
              </select>
            </Campo>
            <Campo label="Responsable">
              <select value={filtro.responsable} onChange={(e) => alFiltrar({ ...filtro, responsable: e.target.value })} className={CTRL} data-testid="filtro-responsable">
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
