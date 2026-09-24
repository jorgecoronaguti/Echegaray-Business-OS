'use client'

// ═══ M10 · OBRA PERSONAL EN EL TELÉFONO — PORTE LITERAL DE `erp-obras/M10.html` (dueño, 23/09/2026) ═══
//
// Dos azulejos («Hoy en obra 12 de 14 · 2 sin fichar» y «Semana 38 · 486 h · 7 personas · 2
// cuadrillas»), las pastillas Hoy · Asignados · Sin fichar · Horas de 36px, y filas de 56px con el
// nombre, «Cuadrilla · categoría · rol» y a la derecha «presente» / «sin fichar» y las horas de hoy.
//
// Es un componente de CLIENTE por las pastillas —filtran una lista que ya viajó entera— y por la
// hoja de la fila. Los datos —presencia, horas, asignaciones— los lee `TabPersonal` en el servidor
// y llegan aplanados; las dos escrituras (cerrar, quitar) llegan atadas a la obra con `.bind`.
//
// ═══ LA HOJA DE LA FILA (24/09/2026 — el M10 no la dibuja) ═══
//
// Tocar una persona abre una hoja desde abajo con lo que la fila no tiene lugar para decir
// (actividad, horas en la obra, desde/hasta, notas) y la acción que le toca, al pie y de 44px:
// «Cerrar asignación» si está vigente, «Quitar» si ya está cerrada. Las cerradas no entran en las
// pastillas —no están asignadas—: van plegadas al final, «Cerradas · N».

import { useState } from 'react'
import type { ResultadoAccion } from '@/shared/components/ui'
import { Ico, P } from './canon/Ico'
import { C, MONO } from './canon/tokens'
import { AccionFila } from './canon/AccionFila'

export interface FilaPersonalTelefono {
  asignacionId: string
  personaId: string
  nombre: string
  sublinea: string
  /** `null` = la lectura de presencia falló: no se afirma ni presente ni ausente. */
  presente: boolean | null
  /** Horas imputadas hoy. `null` = sin imputar → «—». */
  horasHoy: number | null
  /** «toda la obra», el nombre de la actividad o «actividad archivada». */
  actividad: string
  /** Horas imputadas en la obra por esta asignación. `null` = sin imputar. */
  hhObra: number | null
  desde: string | null
  /** `null` = vigente. */
  hasta: string | null
  notas: string | null
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

/** Los renglones de la hoja: lo que falta se dice («sin imputar», «sin fecha») y va en tenue. */
function datosDeHoja(f: FilaPersonalTelefono): { rotulo: string; valor: string; nulo: boolean }[] {
  return [
    { rotulo: 'Actividad', valor: f.actividad, nulo: false },
    { rotulo: 'HH en la obra', valor: f.hhObra == null ? 'sin imputar' : hh(f.hhObra), nulo: f.hhObra == null },
    { rotulo: 'Desde', valor: f.desde ?? 'sin fecha', nulo: f.desde == null },
    ...(f.hasta ? [{ rotulo: 'Hasta', valor: f.hasta, nulo: false }] : []),
    ...(f.notas ? [{ rotulo: 'Notas', valor: f.notas, nulo: false }] : []),
  ]
}

export function TabPersonalTelefono({ filas, cerradas, azulejos, primaria, cerrar, quitar }: {
  filas: FilaPersonalTelefono[]
  cerradas: FilaPersonalTelefono[]
  azulejos: AzulejosTelefono
  primaria: React.ReactNode
  cerrar: (asignacionId: string) => Promise<ResultadoAccion>
  quitar: (asignacionId: string) => Promise<ResultadoAccion>
}) {
  const [pastilla, setPastilla] = useState<Pastilla>('hoy')
  const [abierta, setAbierta] = useState<string | null>(null)
  const [verCerradas, setVerCerradas] = useState(false)
  // Se busca por id en las dos listas: después de cerrar, la misma asignación pasa a «cerradas» y la
  // hoja muestra su estado nuevo («Quitar») en vez de desaparecer sin decir qué pasó.
  const hoja = abierta ? ([...filas, ...cerradas].find((f) => f.asignacionId === abierta) ?? null) : null
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }} data-testid="personal-telefono">
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
              font: 'inherit', height: '36px', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', flexShrink: 0,
              border: `1px solid ${activa ? C.grafito : C.borde}`, borderRadius: '6px', fontSize: '12.5px', fontWeight: activa ? 500 : 400,
              color: activa ? C.tinta : C.tintaSuave, background: C.superficie, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <Ico d={p.icono} s={12} />{p.t}
              {p.n != null && <span style={{ fontFamily: MONO, fontSize: '11px', color: C.tenue }}>{p.n}</span>}
            </button>
          )
        })}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="lista-personal-telefono">
        {visibles.map((f) => (
          <button key={f.asignacionId} type="button" onClick={() => setAbierta(f.asignacionId)} data-testid={`fila-persona-${f.personaId}`} style={{
            font: 'inherit', textAlign: 'left', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            minHeight: '56px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: `1px solid ${C.borde}`,
          }}>
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
          </button>
        ))}
        {visibles.length === 0 && <div style={{ padding: '18px 0', fontSize: '12.5px', color: C.tintaSuave }}>Nadie en esta lista.</div>}
      </div>

      {cerradas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }} data-testid="cerradas-telefono">
          <button type="button" onClick={() => setVerCerradas((v) => !v)} aria-expanded={verCerradas} data-testid="ver-cerradas-telefono" style={{
            font: 'inherit', fontSize: '12.5px', color: C.tintaSuave, background: 'none', border: 'none', padding: 0, cursor: 'pointer',
            height: '44px', display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <Ico d={verCerradas ? P.abajo : P.derecha} s={12} />Cerradas
            <span style={{ fontFamily: MONO, fontSize: '11px', color: C.tenue }}>{cerradas.length}</span>
          </button>
          {verCerradas && cerradas.map((f) => (
            <button key={f.asignacionId} type="button" onClick={() => setAbierta(f.asignacionId)} data-testid={`fila-cerrada-${f.asignacionId}`} style={{
              font: 'inherit', textAlign: 'left', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              minHeight: '52px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: `1px solid ${C.borde}`,
            }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ fontSize: '14px', color: C.tintaSuave }}>{f.nombre}</div>
                <div style={{ fontSize: '12px', color: C.tenue }}>{f.sublinea}</div>
              </div>
              <span style={{ fontSize: '12px', color: C.tintaSuave, whiteSpace: 'nowrap' }}>hasta {f.hasta}</span>
            </button>
          ))}
        </div>
      )}

      {hoja && (
        <>
          <div onClick={() => setAbierta(null)} aria-hidden style={{ position: 'fixed', inset: 0, background: C.grafito, opacity: 0.32, zIndex: 60 }} />
          <div role="dialog" aria-label={hoja.nombre} data-testid="hoja-asignacion" style={{
            position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 61, background: C.superficie,
            borderTop: `1px solid ${C.borde}`, borderRadius: '12px 12px 0 0', padding: '16px 16px 24px',
            display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '80vh', overflowY: 'auto',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <div style={{ fontSize: '16px', fontWeight: 600, color: C.tinta }}>{hoja.nombre}</div>
                <div style={{ fontSize: '12.5px', color: C.tintaSuave }}>{hoja.sublinea}</div>
              </div>
              <button type="button" onClick={() => setAbierta(null)} aria-label="Cerrar" style={{
                font: 'inherit', width: '44px', height: '44px', margin: '-10px -10px 0 0', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', color: C.tenue, cursor: 'pointer',
              }}><Ico d={P.cerrar} s={16} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {datosDeHoja(hoja).map(({ rotulo, valor, nulo }) => (
                <div key={rotulo} style={{ minHeight: '44px', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: `1px solid ${C.bordeTarjeta}`, fontSize: '13.5px' }}>
                  <span style={{ width: '104px', flexShrink: 0, fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', textTransform: 'uppercase', color: C.tenue }}>{rotulo}</span>
                  <span style={{ flex: 1, minWidth: 0, color: nulo ? C.tenue : C.tinta }}>{valor}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
              {hoja.hasta
                ? <AccionFila accion={quitar} args={[hoja.asignacionId]} testid="quitar-asignacion-telefono" tono="peligro" alto={44}>Quitar asignación</AccionFila>
                : <AccionFila accion={cerrar} args={[hoja.asignacionId]} testid="cerrar-asignacion-telefono" alto={44}>Cerrar asignación</AccionFila>}
              <span style={{ fontSize: '12px', color: C.tenue, textAlign: 'center' }}>
                {hoja.hasta ? 'Borra la fila: sólo para un alta hecha por error.' : 'Conserva el período y sus horas.'}
              </span>
            </div>
          </div>
        </>
      )}

      <div style={{ position: 'fixed', left: 0, right: 0, bottom: '64px', padding: '12px 16px 18px', background: C.superficie, borderTop: `1px solid ${C.borde}`, zIndex: 19 }}>
        {primaria}
      </div>
    </div>
  )
}
