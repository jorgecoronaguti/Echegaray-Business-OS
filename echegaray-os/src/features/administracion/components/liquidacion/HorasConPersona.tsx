'use client'

// LA GRILLA Y LA PERSONA ABIERTA, JUNTAS. Es la única pieza de cliente de la solapa «Horas».
//
// Existe porque abrir una persona NO NAVEGA (handoff v2 §4): el estado de «qué fila está abierta»
// vive en el navegador y no en la URL. Con un query param, cada clic sobre una fila sería una
// carga de pantalla entera —nueve consultas— para mostrar datos que ya estaban en el HTML.
//
// LA GRILLA SIGUE SIN LEER NADA: recibe filas y resumen calculados en el servidor.

import { useState } from 'react'
import { GrillaHorasQuincena, type FiltroDeGrilla } from './GrillaHorasQuincena'
import { PanelDePersona, type LineaDeLaPersona, type PersonaAbierta } from './PanelDePersona'
import type { CampoEditable } from '../../services/liquidacionOverrides'
import type { FilaDeGrilla, ResumenDeGrilla } from '../../services/grillaHorasQuincena'
import type { CorreccionDeDia } from '../../services/panelDePersona'

export function HorasConPersona({
  titulo, jornadaTexto, filas, resumen, filtros, accion, personas, correcciones, cerrada, quincena,
  lineas, camposEditables,
}: {
  titulo: string
  jornadaTexto: string
  filas: FilaDeGrilla[]
  resumen: ResumenDeGrilla
  filtros: FiltroDeGrilla[]
  accion?: React.ReactNode
  /** El legajo y los días de cada persona, ya leídos con la quincena. */
  personas: Record<string, Omit<PersonaAbierta, 'cargadas'>>
  correcciones: Record<string, CorreccionDeDia[]>
  cerrada: boolean
  quincena: { desde: string; hasta: string }
  /** La línea del cuadro de Pagos de cada persona: la MISMA fila que se edita allá. */
  lineas: Record<string, LineaDeLaPersona>
  camposEditables: CampoEditable[]
}) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const datos = abierta ? personas[abierta] : undefined
  const fila = abierta ? filas.find((f) => f.personaId === abierta) : undefined
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <GrillaHorasQuincena
        titulo={titulo}
        jornadaTexto={jornadaTexto}
        filas={filas}
        resumen={resumen}
        filtros={filtros}
        accion={accion}
        abierta={abierta}
        abrir={(id) => setAbierta(id === abierta ? null : id)}
      />
      {datos && (
        <PanelDePersona
          persona={{ ...datos, cargadas: fila?.cargadas ?? 0 }}
          cerrada={cerrada}
          correcciones={correcciones}
          quincena={quincena}
          linea={lineas[abierta!]}
          camposEditables={camposEditables}
          cerrar={() => setAbierta(null)}
        />
      )}
    </div>
  )
}
