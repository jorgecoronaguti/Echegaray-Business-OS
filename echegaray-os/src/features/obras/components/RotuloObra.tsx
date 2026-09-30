'use client'

// EL RÓTULO ÚNICO DE OBRA: «OB-0012 · NOMBRE» y, debajo, el estado (dueño, 29/09/2026).
//
// Lo dibujan la Tabla y el Gantt de Obras, el escritorio del jefe (`/obras/hoy`) y el teléfono: si cada
// vista arma su propia celda, la primera que se escriba distinto vuelve a dejar dos rótulos para la misma
// obra. QA en vivo a 390 px: el nombre se cortaba con «…» y en las obras principales no se veía el estado,
// porque la sublínea del teléfono decía sólo la etapa.
//
// EN EL TELÉFONO EL NOMBRE ENVUELVE, NO SE CORTA: un nombre truncado no distingue «ME - PLAYÓN DE AZUFRE»
// de «ME - PLAYÓN DE AZUFRE II». En escritorio sigue en una línea con «…» (con `title`), como siempre:
// por eso el envoltorio va en clases `max-md:` y no en el estilo base.
import Link from 'next/link'
import type { ReactNode } from 'react'
import { rotuloDeObra } from '@/shared/utils/obra'
import { C } from './canon/tokens'
import { colorDeEstado, estadoDeCartera, type ObraDeCartera } from '../services/carteraCanon'
import { ESTILO_CODO, ESTILO_NOMBRE_FILA, SANGRIA_HIJA } from '@/shared/components/cartera/estiloCartera'

export interface DatosDelRotulo extends ObraDeCartera {
  nombre: string
  codigo?: string | null
}

/** Lo que el teléfono deja pasar para que el nombre se lea entero. `anywhere` parte un nombre sin espacios
 *  largo en vez de empujar la fila fuera de la pantalla. */
const ENVUELVE_EN_TELEFONO = 'max-md:!overflow-visible max-md:!whitespace-normal max-md:![overflow-wrap:anywhere]'

export function RotuloObra({ o, nivel = 0, href, sangria = nivel ? SANGRIA_HIJA : 0, etapa = null, nota = null, scroll = true, testid = 'rotulo-obra', tactil = false }: {
  o: DatosDelRotulo
  /** 1 = adicional: lleva «└» y «· adicional». */
  nivel?: 0 | 1
  /** Con `href` el nombre es un enlace; sin él, la fila entera es la que se pulsa (teléfono). */
  href?: string
  sangria?: number
  /** La etapa, en tenue detrás del estado. El Gantt del teléfono no la lleva: son 130 px. */
  etapa?: string | null
  /** Lo que cuelga del estado y no es estado: «· asignada» en el escritorio del jefe. */
  nota?: ReactNode
  /** `false` = elegir la obra no salta al principio de la página (la tabla del jefe muestra el día debajo). */
  scroll?: boolean
  testid?: string
  /** El nombre es un control pulsable con el pulgar: mínimo 44 px de alto (sólo la tabla del jefe). */
  tactil?: boolean
}) {
  const e = estadoDeCartera(o)
  const rotulo = rotuloDeObra(o)
  const nombre: ReactNode = <>{nivel ? <span style={ESTILO_CODO}>└</span> : null}{rotulo}</>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1, paddingLeft: sangria }}>
      {href
        ? (
          <Link href={href} prefetch={false} scroll={scroll} onClick={(ev) => ev.stopPropagation()} title={rotulo}
            className={ENVUELVE_EN_TELEFONO} data-testid={testid} style={{ ...ESTILO_NOMBRE_FILA, textDecoration: 'none', ...(tactil ? { paddingBlock: 12, marginBlock: -12 } : null) }}>
            {nombre}
          </Link>
        )
        : <div title={rotulo} className={ENVUELVE_EN_TELEFONO} data-testid={testid} style={ESTILO_NOMBRE_FILA}>{nombre}</div>}
      <div style={{ fontSize: '12px', color: colorDeEstado(o) }} data-testid="estado-obra">
        {e.t}
        {nivel ? <span style={{ color: C.tenue }}> · adicional</span> : null}
        {etapa ? <span style={{ color: C.tenue }}> · {etapa}</span> : null}
        {nota}
      </div>
    </div>
  )
}
