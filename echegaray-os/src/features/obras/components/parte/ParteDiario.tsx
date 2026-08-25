'use client'

// ═══ 05 · REGISTRAR AVANCE — «Parte diario» ═══
//
// PORTE LITERAL de `05 · Registrar avance.dc.html`: la banda de sub-navegación con el navegador de
// día a la derecha, y debajo dos columnas separadas por 12 px sobre `padding:14px 20px 24px` — el
// formulario de 404 px fijos y, al lado, «Cargado hoy» y «Frentes en curso».
//
// ═══ LA JORNADA MANDA SOBRE LAS DOS COLUMNAS ═══
//
// El canónico pone el día en la banda —‹ · Hoy 23/08 · ›— y no adentro del formulario, porque
// gobierna las dos: el parte se carga en ese día y la lista muestra ese día. Adentro del panel
// parecía un campo más, y el que retrocedía un día no entendía por qué le cambiaba la lista.
//
// El chip conserva un `input[type=date]` real por encima del texto: las flechas resuelven el 95%
// (ayer) y una carga atrasada de una semana no puede exigir siete clics. El texto que se LEE es el
// nuestro en dd/mm — el formato de un `input date` lo dibuja el navegador, y en un Chrome en
// inglés el parte del 23 de agosto se leía «08/23/2026».
//
// LO QUE NO ESTÁ ACÁ Y ESTABA ANTES: el plegable «Todos los partes». No está en el canónico y su
// trabajo lo hace el navegador de día —cualquier jornada es un clic en el calendario, y cada fila
// sigue teniendo su «···» para corregir una carga—.

import { useMemo, useState } from 'react'
import type { AccionFormulario, ResultadoAccion } from '@/shared/components/ui'
import type { Actividad, ParteEjecucion, Persona } from '../../types'
import { jornadaHH, kpisDelDia, type HoraDeJornada } from '../../services/ejecucionService'
import { correr, frentesDelParte } from '../../services/parteDiario.ts'
import { fechaCorta } from '../formato'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Ico'
import { SubNavTrabajo } from '../SubNavTrabajo'
import { FormularioParte } from './FormularioParte'
import { CargadoHoy } from './CargadoHoy'
import { FrentesEnCurso } from './FrentesEnCurso'

const FLECHA = {
  width: '27px', height: '27px', borderRadius: '6px', border: `1px solid ${C.borde}`,
  background: C.superficie, display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer', padding: 0,
} as const

export function ParteDiario({
  obraId, actividades, partes, personas, cuadrillas, integrantes, hoy, equipos = [], registrosHH,
  registrar, borrarParte,
}: {
  obraId: string
  actividades: Actividad[]
  partes: ParteEjecucion[]
  personas: Persona[]
  cuadrillas: { id: string; nombre: string }[]
  integrantes: Record<string, string[]>
  hoy: string
  /** El catálogo de equipos, como ayuda de carga. Sale de `herramientas`, el espejo del Sheet. */
  equipos?: string[]
  /** `registros_hh` de la obra, para HH y PERSONAS de la jornada. OPCIONAL a propósito: sin él la
   *  cabecera dice «sin registrar», que es la verdad —no cero—. Ver `jornadaHH`. */
  registrosHH?: HoraDeJornada[]
  registrar: AccionFormulario
  borrarParte: (parteId: string) => Promise<ResultadoAccion>
}) {
  const [dia, setDia] = useState(hoy)
  const [elegida, setElegida] = useState('')
  const [soloCurso, setSoloCurso] = useState(true)

  const cargables = useMemo(() => frentesDelParte(actividades, false), [actividades])
  const enCurso = useMemo(() => frentesDelParte(actividades, true), [actividades])
  const porActividad = useMemo(() => new Map(cargables.map((a) => [a.id, a])), [cargables])
  const delDia = useMemo(() => partes.filter((p) => p.fecha === dia), [partes, dia])
  const jornada = useMemo(() => jornadaHH(registrosHH, dia), [registrosHH, dia])
  const kpis = useMemo(() => kpisDelDia(partes, actividades, dia), [partes, actividades, dia])

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <SubNavTrabajo obraId={obraId} sub="parte" derecha={
        <>
          <button
            type="button" title="Día anterior" aria-label="Día anterior" data-testid="dia-anterior"
            onClick={() => setDia((d) => correr(d, -1))} style={{ ...FLECHA, color: C.tintaSuave }}
          ><Ico d={<path d="M15 6l-6 6 6 6" />} s={14} /></button>

          <label style={{
            position: 'relative', display: 'flex', alignItems: 'center', gap: '7px',
            background: C.superficie, border: `1px solid ${C.borde}`, borderRadius: '6px',
            padding: '4px 10px',
          }}>
            <span style={{ display: 'flex', color: C.tintaSuave }}><Ico d={P.fecha} s={13} /></span>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: C.tinta }}>
              {dia === hoy ? 'Hoy' : dia === correr(hoy, -1) ? 'Ayer' : 'Día'}
            </span>
            <span style={{ fontFamily: MONO, fontSize: '11.5px', color: C.tintaSuave }}>{fechaCorta(dia)}</span>
            <input
              type="date" value={dia} max={hoy} data-testid="dia-ejecucion"
              onChange={(e) => e.target.value && setDia(e.target.value)} aria-label="Jornada del parte"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
            />
          </label>

          {/* UN PARTE DE MAÑANA NO ES UN HECHO: la flecha de adelante muere en hoy, y el zip la
              dibuja en gris claro justamente ahí. */}
          <button
            type="button" title="Día siguiente" aria-label="Día siguiente" data-testid="dia-siguiente"
            onClick={() => setDia((d) => correr(d, 1))} disabled={dia >= hoy}
            style={{ ...FLECHA, color: dia >= hoy ? C.bordeFuerte : C.tintaSuave }}
          ><Ico d={P.derecha} s={14} /></button>
        </>
      } />

      {/* `flexWrap` + el ancho mínimo de la derecha son el único agregado al canónico: en una
          ventana más angosta que 404 + 12 + 360 la columna derecha baja en vez de aplastarse. En
          1280 y en 1440 —las dos geometrías del dueño— las dos columnas entran y nada se mueve. */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '14px 20px 24px',
        flexWrap: 'wrap',
      }}>
        <FormularioParte
          frentes={cargables} personas={personas} cuadrillas={cuadrillas} integrantes={integrantes}
          equipos={equipos} dia={dia} elegida={elegida} elegir={setElegida} registrar={registrar}
        />
        <div style={{
          flex: 1, minWidth: 'min(360px, 100%)', display: 'flex', flexDirection: 'column', gap: '12px',
        }}>
          <CargadoHoy
            dia={dia} esHoy={dia === hoy} delDia={delDia} porActividad={porActividad}
            jornada={jornada} borrarParte={borrarParte}
          />
          <FrentesEnCurso
            frentes={soloCurso ? enCurso : cargables} elegida={elegida} soloCurso={soloCurso}
            verCurso={setSoloCurso} elegir={setElegida} sinParte={kpis.sinParte}
          />
        </div>
      </div>
    </div>
  )
}
