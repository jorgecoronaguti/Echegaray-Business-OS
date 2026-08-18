'use client'

// CRONOGRAMA — UNA pestaña con dos maneras de mirar LAS MISMAS actividades.
//
// ═══ POR QUÉ PLANIFICACIÓN DEJÓ DE SER UNA PESTAÑA ═══
//
// «Gantt» y «Planificación» eran dos solapas principales sobre el mismo cronograma: la primera lo
// dibujaba entero y la segunda mostraba el recorte de lo que viene. Separadas obligaban a volver al
// nivel de arriba para cruzar dos vistas del mismo trabajo, y hacían parecer que había dos planes.
// Son una herramienta con dos zooms, y por eso viven juntas.
//
// LAS ACTIVIDADES SON LAS MISMAS Y SE PASAN UNA VEZ. Acá no se vuelve a consultar nada ni se filtra
// con una regla propia: «Próximos trabajos» sale de `lookahead()` sobre esta lista.
//
// ═══ LA SUB-VISTA ES ESTADO LOCAL Y NO VA EN LA URL ═══
//
// Las solapas principales de la obra sí viajan por query string —cada vista es una URL que se
// comparte—. El zoom entre el Gantt y lo que viene es una preferencia de trabajo, no un destino: se
// cambia diez veces por sesión y no es lo que alguien manda por mensaje. Además el parámetro lo
// tendría que leer la página, y el cableado de la página no es de este componente.

import { useState } from 'react'
import { BotonAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
import type { Actividad, Dependencia, Persona, Restriccion } from '../types'
import { Gantt } from './Gantt'
import { VistaProximos } from './VistaProximos'
import { type AccionesCronograma } from './PanelActividad'

type SubVista = 'gantt' | 'proximos'

const SUBVISTAS: { id: SubVista; label: string }[] = [
  { id: 'gantt', label: 'Gantt' },
  { id: 'proximos', label: 'Próximos trabajos' },
]

export function TabCronograma({
  actividades,
  archivadas = [],
  restricciones = [],
  dependencias = [],
  personas = [],
  acciones,
  yaSellada = false,
  crearImpedimento,
  liberarImpedimento,
  restaurarActividad,
  hoy,
}: {
  /** El cronograma vivo: las NO archivadas, en el orden del tracker. */
  actividades: Actividad[]
  /** Las archivadas, para poder devolverlas. Si no se pasan, no se dibuja la lista. */
  archivadas?: Actividad[]
  restricciones?: Restriccion[]
  dependencias?: Dependencia[]
  personas?: Persona[]
  /** Sin `acciones` todo el cronograma queda de sólo lectura. */
  acciones?: AccionesCronograma
  yaSellada?: boolean
  crearImpedimento: AccionFormulario
  liberarImpedimento: (restriccionId: string) => Promise<ResultadoAccion>
  /** `archivarActividad` atada a la obra: se la llama con `(id, false)` para restaurar. */
  restaurarActividad?: (actividadId: string, archivada: boolean) => Promise<ResultadoAccion>
  /** Sólo para poder fijar el día en un test. En la pantalla es hoy. */
  hoy?: Date
}) {
  const [sub, setSub] = useState<SubVista>('gantt')

  return (
    <div className="space-y-4">
      {/* SEGUNDO NIVEL DE NAVEGACIÓN Y ÚLTIMO: área arriba, obra en el medio, y esto. Un cuarto nivel
          obligaría a decodificar la pantalla antes de leerla. Se desplaza en vez de empujar la
          página: en 390px las dos solapas y el ancho del contenedor no siempre entran. */}
      <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-line" aria-label="Vistas del cronograma">
        {SUBVISTAS.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => setSub(v.id)}
            aria-current={sub === v.id ? 'page' : undefined}
            data-testid={`subvista-${v.id}`}
            className={`shrink-0 border-b-2 px-3.5 py-2 text-[13px] ${
              sub === v.id ? 'border-accent font-medium text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >{v.label}</button>
        ))}
      </nav>

      {sub === 'gantt' ? (
        <>
          <Gantt
            actividades={actividades}
            restricciones={restricciones}
            dependencias={dependencias}
            personas={personas}
            acciones={acciones}
            yaSellada={yaSellada}
            {...(hoy ? { hoy } : {})}
          />
          {archivadas.length > 0 && restaurarActividad && (
            <details className="rounded-card border border-line bg-surface" data-testid="actividades-archivadas">
              <summary className="cursor-pointer px-4 py-2.5 text-[13px] text-muted">
                {archivadas.length} actividad(es) archivadas
              </summary>
              <ul className="divide-y divide-line/60 border-t border-line">
                {archivadas.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <span className="min-w-0 truncate text-[12px] text-muted">{a.nombre}</span>
                    <BotonAccion accion={restaurarActividad} args={[a.id, false]} testid="restaurar-actividad">
                      Restaurar
                    </BotonAccion>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      ) : (
        <VistaProximos
          actividades={actividades}
          impedimentos={restricciones}
          personas={personas}
          crear={crearImpedimento}
          liberar={liberarImpedimento}
          {...(hoy ? { hoy } : {})}
        />
      )}
    </div>
  )
}
