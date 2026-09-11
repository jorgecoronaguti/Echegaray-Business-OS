'use client'

// LA GRILLA Y LA PERSONA ABIERTA, JUNTAS. Es la única pieza de cliente de la solapa «Horas».
//
// Existe porque abrir una persona NO NAVEGA (handoff v2 §4): el estado de «qué fila está abierta»
// vive en el navegador y no en la URL. Con un query param, cada clic sobre una fila sería una
// carga de pantalla entera —nueve consultas— para mostrar datos que ya estaban en el HTML.
//
// LA GRILLA SIGUE SIN LEER NADA: recibe filas y resumen calculados en el servidor.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  GrillaHorasQuincena, type PendienteDeGrilla, type PeriodoDeGrilla,
} from './GrillaHorasQuincena'
import { claveDeCelda, indiceDeEdicion } from '../../services/edicionDeGrillaHoras'
import { PanelDePersona, type LineaDeLaPersona, type PersonaAbierta } from './PanelDePersona'
import type { CampoEditable } from '../../services/liquidacionOverrides'
import type { FilaDeGrilla, ResumenDeGrilla } from '../../services/grillaHorasQuincena'
import type { ProyeccionDeQuincena } from '../../services/proyeccionDeMasa'
import type { CorreccionDeDia } from '../../services/panelDePersona'

export function HorasConPersona({
  titulo, estado, jornadaTexto, habilesTexto, hoy, filas, resumen, proyeccion, periodos,
  pendientes, hrefSinRecorte, convenios, accion, personas,
  correcciones, cerrada, quincena, lineas, camposEditables, multiplicador,
}: {
  titulo: string
  estado?: string
  jornadaTexto: string
  habilesTexto?: string
  hoy?: string
  filas: FilaDeGrilla[]
  resumen: ResumenDeGrilla
  /** La masa salarial estimada del PLANTEL ENTERO, calculada en el servidor como el resumen. */
  proyeccion?: ProyeccionDeQuincena
  periodos: PeriodoDeGrilla[]
  pendientes: PendienteDeGrilla[]
  hrefSinRecorte: string
  convenios?: string
  accion?: React.ReactNode
  /** El legajo y los días de cada persona, ya leídos con la quincena. */
  personas: Record<string, Omit<PersonaAbierta, 'cargadas'>>
  correcciones: Record<string, CorreccionDeDia[]>
  cerrada: boolean
  quincena: { desde: string; hasta: string }
  /** La línea del cuadro de Pagos de cada persona: la MISMA fila que se edita allá. */
  lineas: Record<string, LineaDeLaPersona>
  camposEditables: CampoEditable[]
  /** Multiplicador de costo vigente. `null` = alícuotas sin cargar → «sin base», nunca un número. */
  multiplicador?: number | null
}) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const datos = abierta ? personas[abierta] : undefined
  const fila = abierta ? filas.find((f) => f.personaId === abierta) : undefined

  // ═══ ABRIR UNA PERSONA TIENE QUE VERSE, Y ANTES NO SE VEÍA ═══
  //
  // El panel se dibuja DEBAJO de la tabla y la tabla mide diecisiete filas: con el plantel real son
  // 1.100 px. Al hacer clic en la primera persona la pantalla no se movía y lo único que cambiaba
  // era la barra amarilla de 3 px de la fila. El panel estaba ahí —el spec de fidelidad lo
  // encontraba con `toBeVisible()` porque Playwright no necesita mirarlo— pero para quien liquida
  // no había pasado nada. Es parte de «no se puede editar nada»: el lugar donde se edita el día de
  // una persona quedaba fuera de la pantalla.
  //
  // POR QUÉ SIGUE ABAJO Y NO A LA DERECHA. El panel es ancho por dentro: el detalle día a día
  // (fecha · obra · actividad · clase · quién cargó · HH) más la columna de legajo no entran en los
  // 320 px que dejó libres el menú de filtros que se fue. Meterlo ahí sería repetir el error que el
  // dueño acaba de señalar —una columna estrecha con el rótulo cortado—, así que se queda ancho y
  // lo que se arregla es llegar a él.
  //
  // `block: 'start'` y no `center`: el encabezado del panel —el nombre y «Cerrar»— tiene que quedar
  // arriba de todo, que es de donde se lee hacia abajo.
  // QUÉ CELDA SE CORRIGE EN LÍNEA. La regla vive en `edicionDeGrillaHoras.ts`, pura y con tests:
  // adentro de este archivo `node --test` no la alcanzaba, y una regla que decide sobre qué fila de
  // la base se escribe no puede ser una condición suelta en un JSX (auditoría 11/09/2026).
  //
  // No hace falta una lectura nueva: los días de cada persona YA viajan en `personas` —es lo que
  // dibuja el panel— con su `id` y su fecha. Si el panel deja de dejar editar un día, la celda de la
  // grilla deja de dejarlo en el mismo momento y por la misma razón.
  const indice = useMemo(() => indiceDeEdicion(personas, { cerrada }), [personas, cerrada])
  const edicionDe = useMemo(
    () => (personaId: string, fecha: string) => indice.get(claveDeCelda(personaId, fecha)) ?? null,
    [indice],
  )

  const panelRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!abierta) return
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [abierta])

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <GrillaHorasQuincena
        titulo={titulo}
        estado={estado}
        jornadaTexto={jornadaTexto}
        habilesTexto={habilesTexto}
        hoy={hoy}
        filas={filas}
        resumen={resumen}
        proyeccion={proyeccion}
        periodos={periodos}
        pendientes={pendientes}
        hrefSinRecorte={hrefSinRecorte}
        convenios={convenios}
        accion={accion}
        abierta={abierta}
        abrir={(id) => setAbierta(id === abierta ? null : id)}
        // LA QUINCENA CERRADA YA LA APAGA `indiceDeEdicion`, que devuelve el índice vacío: no se
        // decide dos veces. La acción además lo rebota contra la base.
        edicionDe={edicionDe}
      />
      {/* `scrollMarginTop` DEJA PASAR LA BARRA PEGAJOSA. Con 12 px el nombre de la persona —lo
          primero que hay que leer— quedaba medio tapado por la barra de navegación, que mide unos
          44 px y no se va con el scroll. 72 px la despejan con aire. */}
      {datos && (
        <div ref={panelRef} style={{ scrollMarginTop: 72 }}>
        <PanelDePersona
          persona={{ ...datos, cargadas: fila?.cargadas ?? 0 }}
          fila={fila}
          habilesTexto={habilesTexto}
          multiplicador={multiplicador}
          cerrada={cerrada}
          correcciones={correcciones}
          quincena={quincena}
          linea={lineas[abierta!]}
          camposEditables={camposEditables}
          cerrar={() => setAbierta(null)}
        />
        </div>
      )}
    </div>
  )
}
