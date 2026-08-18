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
// ═══ LA SUB-VISTA Y LA VENTANA VIAJAN EN LA URL; LA SELECCIÓN DE UNA BARRA NO ═══
//
// «Estoy mirando el Gantt» y «estoy mirando las próximas dos semanas» son VISTAS: se mandan por
// mensaje, se abren de nuevo mañana y tienen que volver iguales. Van en la query, como las solapas
// principales de la obra.
//
// Seleccionar una barra NO. En el Gantt se toca una actividad tras otra para comparar fechas: si
// cada clic escribiera la URL, cada clic sería una vuelta al servidor y el cronograma se sentiría
// pegajoso justo en lo que más se usa. Entra por `actividadAbierta` —para que un enlace pueda abrir
// una actividad concreta— y a partir de ahí la selección es local.
//
// Los tres props son OPCIONALES: sin ellos el componente se gobierna solo y sigue funcionando. Así
// la página puede cablearlos cuando quiera sin que este archivo deje de compilar en el medio.

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { BotonAccion, type ResultadoAccion } from '@/shared/components/ui'
import type { Actividad, Dependencia, Persona, Restriccion } from '../types'
import { Gantt } from './Gantt'
import { VistaProximos, type Ventana } from './VistaProximos'
import { type AccionesCronograma } from './PanelActividad'
import { type AccionesEnLote } from './AccionesMasivas'

type SubVista = 'gantt' | 'proximos'

const SUBVISTAS: { id: SubVista; label: string }[] = [
  { id: 'gantt', label: 'Gantt' },
  { id: 'proximos', label: 'Próximos trabajos' },
]

export function TabCronograma({
  actividades,
  obraId,
  archivadas = [],
  restricciones = [],
  dependencias = [],
  personas = [],
  acciones,
  masivas,
  yaSellada = false,
  restaurarActividad,
  sub,
  semanas,
  actividadAbierta = null,
  hoy,
}: {
  /** El cronograma vivo: las NO archivadas, en el orden del tracker. */
  actividades: Actividad[]
  /** Para poder mandar a Operación, donde se anotan y se liberan los impedimentos. */
  obraId: string
  /** Las archivadas, para poder devolverlas. Si no se pasan, no se dibuja la lista. */
  archivadas?: Actividad[]
  restricciones?: Restriccion[]
  dependencias?: Dependencia[]
  personas?: Persona[]
  /** Sin `acciones` todo el cronograma queda de sólo lectura. */
  acciones?: AccionesCronograma
  /** Las acciones en lote del Gantt. Opcional por la misma razón que `acciones`: sin ellas no se
   *  dibuja una sola casilla de selección, en vez de dibujar controles que no escriben. */
  masivas?: AccionesEnLote
  yaSellada?: boolean
  /** `archivarActividad` atada a la obra: se la llama con `(id, false)` para restaurar. */
  restaurarActividad?: (actividadId: string, archivada: boolean) => Promise<ResultadoAccion>
  /** Query `sub`. Si no viene, la sub-vista se gobierna sola y no toca la URL. */
  sub?: SubVista
  /** Query `semanas`. Ventana de «Próximos trabajos». */
  semanas?: Ventana
  /** Query `act`: qué actividad abrir al entrar. Después la selección es local. */
  actividadAbierta?: string | null
  /** Sólo para poder fijar el día en un test. En la pantalla es hoy. */
  hoy?: Date
}) {
  const router = useRouter()
  const params = useSearchParams()
  const [subLocal, setSubLocal] = useState<SubVista>(sub ?? 'gantt')
  const [semanasLocal, setSemanasLocal] = useState<Ventana>(semanas ?? '2')

  // Controlado cuando la página pasa el valor; libre cuando no. El estado local se actualiza igual
  // para que la pantalla responda en el acto y no espere la vuelta del servidor.
  const subActual = sub ?? subLocal
  const ventanaActual = semanas ?? semanasLocal

  /** Se reescribe SÓLO el parámetro que cambió: `vista` y el resto de la query quedan como estaban.
   *  Construir la URL entera desde acá obligaría a saber cómo se llama la solapa en la página, que
   *  es justo lo que este componente no tiene por qué saber. */
  const irA = (clave: string, valor: string) => {
    const p = new URLSearchParams(params.toString())
    p.set(clave, valor)
    router.replace(`?${p.toString()}`, { scroll: false })
  }

  const cambiarSub = (v: SubVista) => { setSubLocal(v); irA('sub', v) }
  const cambiarSemanas = (v: Ventana) => { setSemanasLocal(v); irA('semanas', v) }

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
            onClick={() => cambiarSub(v.id)}
            aria-current={subActual === v.id ? 'page' : undefined}
            data-testid={`subvista-${v.id}`}
            className={`shrink-0 border-b-2 px-3.5 py-2 text-[13px] ${
              subActual === v.id ? 'border-accent font-medium text-ink' : 'border-transparent text-muted hover:text-ink'
            }`}
          >{v.label}</button>
        ))}
      </nav>

      {subActual === 'gantt' ? (
        <>
          <Gantt
            actividades={actividades}
            restricciones={restricciones}
            dependencias={dependencias}
            personas={personas}
            acciones={acciones}
            masivas={masivas}
            yaSellada={yaSellada}
            seleccionInicial={actividadAbierta}
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
          obraId={obraId}
          personas={personas}
          semanas={ventanaActual}
          alCambiarSemanas={cambiarSemanas}
          {...(hoy ? { hoy } : {})}
        />
      )}
    </div>
  )
}
