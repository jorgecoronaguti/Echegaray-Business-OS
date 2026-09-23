'use client'

// ═══ M10 · OBRA PERSONAL EN EL TELÉFONO — PORTE LITERAL DE `erp-obras/M10.html` (dueño, 23/09/2026) ═══
//
// Dos azulejos («Hoy en obra 12 de 14 · 2 sin fichar» y «Semana 38 · 486 h · 7 personas · 2
// cuadrillas»), las pastillas Hoy · Asignados · Sin fichar · Horas de 36px, y filas de 56px con el
// nombre, «Cuadrilla · categoría · rol» y a la derecha «presente» / «sin fichar» y las horas de hoy.
//
// Es un componente de CLIENTE sólo por las pastillas: filtran una lista que ya viajó entera. Los
// datos —presencia, horas, asignaciones— los lee `TabPersonal` en el servidor y llegan aplanados.

import { useState } from 'react'
import { Ico, P } from './canon/Ico'
import { C, MONO } from './canon/tokens'

export interface FilaPersonalTelefono {
  personaId: string
  nombre: string
  sublinea: string
  /** `null` = la lectura de presencia falló: no se afirma ni presente ni ausente. */
  presente: boolean | null
  /** Horas imputadas hoy. `null` = sin imputar → «—». */
  horasHoy: number | null
}

export interface AzulejosTelefono {
  presentes: number | null
  asignados: number
  sinFichar: number | null
  numeroSemana: number
  hhSemana: number | null
  personasSemana: number
  cuadrillas: number
}

type Pastilla = 'hoy' | 'asignados' | 'sin_fichar' | 'horas'

const hh = (v: number) => `${v.toLocaleString('es-AR', { maximumFractionDigits: 1 })} h`

export function TabPersonalTelefono({ filas, azulejos, primaria }: {
  filas: FilaPersonalTelefono[]
  azulejos: AzulejosTelefono
  primaria: React.ReactNode
}) {
  const [pastilla, setPastilla] = useState<Pastilla>('hoy')
  const visibles = filas.filter((f) => (
    pastilla === 'asignados' ? true
      : pastilla === 'hoy' ? f.presente === true
        : pastilla === 'sin_fichar' ? f.presente === false
          : f.horasHoy != null
  ))
  const pastillas: { k: Pastilla; t: string; icono: React.ReactNode; n: number | null }[] = [
    { k: 'hoy', t: 'Hoy', icono: P.ok, n: azulejos.presentes },
    { k: 'asignados', t: 'Asignados', icono: P.cuadrilla, n: azulejos.asignados },
    { k: 'sin_fichar', t: 'Sin fichar', icono: P.alerta, n: azulejos.sinFichar },
    { k: 'horas', t: 'Horas', icono: P.hh, n: null },
  ]
  const eyebrow: React.CSSProperties = { fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', paddingBottom: '80px' }} data-testid="personal-telefono">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={eyebrow}>Hoy en obra</div>
          <div style={{ fontSize: '24px', fontWeight: 600, letterSpacing: '-.02em', color: C.tinta }}>
            {azulejos.presentes == null
              ? <span style={{ fontSize: '14px', color: C.tenue, fontStyle: 'italic', fontWeight: 400 }} data-nulo="">sin lectura</span>
              : <>{azulejos.presentes} <span style={{ fontSize: '14px', color: C.tintaSuave, fontWeight: 400 }}>de {azulejos.asignados}</span></>}
          </div>
          <div style={{ fontSize: '12px', color: C.tintaSuave }}>
            {azulejos.sinFichar == null ? 'presencia sin leer' : `${azulejos.sinFichar} sin fichar`}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <div style={eyebrow}>Semana {azulejos.numeroSemana}</div>
          <div style={{ fontSize: '24px', fontWeight: 600, letterSpacing: '-.02em', color: C.tinta }}>
            {azulejos.hhSemana == null
              ? <span style={{ fontSize: '14px', color: C.tenue, fontStyle: 'italic', fontWeight: 400 }} data-nulo="">sin registrar</span>
              : hh(azulejos.hhSemana)}
          </div>
          <div style={{ fontSize: '12px', color: C.tintaSuave }}>
            {azulejos.personasSemana} {azulejos.personasSemana === 1 ? 'persona' : 'personas'} · {azulejos.cuadrillas} {azulejos.cuadrillas === 1 ? 'cuadrilla' : 'cuadrillas'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginRight: '-16px', paddingRight: '16px', scrollbarWidth: 'none' }} data-testid="pastillas-personal">
        {pastillas.map((p) => {
          const activa = pastilla === p.k
          return (
            <button key={p.k} type="button" onClick={() => setPastilla(p.k)} aria-pressed={activa} data-testid={`pastilla-${p.k}`} style={{
              height: '36px', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', flexShrink: 0,
              border: `1px solid ${activa ? C.grafito : C.borde}`, borderRadius: '6px', fontSize: '12.5px', fontWeight: activa ? 500 : 400,
              color: activa ? C.tinta : C.tintaSuave, background: C.superficie, cursor: 'pointer', font: 'inherit', fontFamily: 'inherit',
            }}>
              <Ico d={p.icono} s={12} />{p.t}
              {p.n != null && <span style={{ fontFamily: MONO, fontSize: '11px', color: C.tenue }}>{p.n}</span>}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="lista-personal-telefono">
        {visibles.map((f) => (
          <div key={f.personaId} data-testid={`fila-persona-${f.personaId}`} style={{ minHeight: '56px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: `1px solid ${C.borde}` }}>
            <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.persona} s={14} /></span>
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ fontSize: '14px', color: C.tinta }}>{f.nombre}</div>
              <div style={{ fontSize: '12px', color: C.tintaSuave }}>{f.sublinea}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
              <span style={{ fontSize: '12px', color: f.presente === true ? C.tinta : f.presente === false ? C.warn : C.tenue }}>
                {f.presente === true ? 'presente' : f.presente === false ? 'sin fichar' : 'sin lectura'}
              </span>
              <span style={{ fontFamily: MONO, fontSize: '12px', color: C.tintaSuave }}>{f.horasHoy == null ? '—' : hh(f.horasHoy)}</span>
            </div>
          </div>
        ))}
        {visibles.length === 0 && <div style={{ padding: '18px 0', fontSize: '12.5px', color: C.tintaSuave }}>Nadie en esta lista.</div>}
      </div>

      <div style={{ position: 'fixed', left: 0, right: 0, bottom: '64px', padding: '12px 16px 18px', background: C.superficie, borderTop: `1px solid ${C.borde}`, zIndex: 19 }}>
        {primaria}
      </div>
    </div>
  )
}
