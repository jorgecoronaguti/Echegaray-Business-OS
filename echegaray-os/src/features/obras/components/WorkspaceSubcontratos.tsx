'use client'

// ═══ 07 · SUBCONTRATOS — LA TABLA, LO QUE FRENA, Y EL PANEL DEL PAQUETE ELEGIDO ═══
//
// Porte literal de `erp-obras/07.html` y `M09.html` (dueño, 23/09/2026): la tabla de paquetes, debajo
// los bloques «<Tercero> · qué lo frena» (filas de 56px con borde izquierdo rojo o ámbar y «Ver»), y
// la nota «Con gente propia: sin análisis de costo». La primaria «Nuevo paquete» va en la cabecera
// de la obra en escritorio y fija al pie de 48px en el teléfono.
//
// ELEGIR UN PAQUETE ES ESTADO DEL CLIENTE. La URL se sigue sincronizando con `replaceState`
// (`?sel=`): el mismo enlace abre el mismo paquete y se manda por chat. El panel del paquete —con
// sus solapas de certificaciones, documentos y personal— no está dibujado en el 07 y se conserva:
// es la única puerta a esas escrituras.
//
// LAS ESCRITURAS NO CAMBIAN: siguen siendo las server actions que llegan por props.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Ico, P } from './canon/Ico'
import { C, MONO } from './canon/tokens'
import { useAnchoVentana } from './useAnchoVentana'
import { esAngosto } from '../services/anchoPantalla'
import { TablaSubcontratos } from './TablaSubcontratos'
import { PanelSubcontrato, type AccionesPaquete } from './PanelSubcontrato'
import { armarComparacion, queLoFrena } from '../services/subcontratosReglas'
import type { Paquete } from '../services/subcontratosService'

export function WorkspaceSubcontratos({
  paquetes, economia, obraId, selInicial, acciones, formularioNuevo, nuevoInicial = false,
}: {
  paquetes: Paquete[]
  economia: boolean
  obraId: string
  selInicial: string | null
  acciones: AccionesPaquete
  /** El `<FormNuevoPaquete>` del servidor: una sola definición del alta, abierta desde acá. */
  formularioNuevo: ReactNode
  /** `?nuevo=1`: la primaria de la cabecera pide el formulario abierto. */
  nuevoInicial?: boolean
}) {
  const telefono = esAngosto(useAnchoVentana())
  const [sel, setSel] = useState<string | null>(selInicial)
  const [nuevo, setNuevo] = useState(nuevoInicial)
  const cajaNuevo = useRef<HTMLDivElement>(null)

  // EL PLEGABLE DEL ALTA SE ABRE SOLO cuando alguien pidió «Nuevo paquete»: el formulario es el
  // mismo `<details>` de siempre, sin segunda definición del alta.
  useEffect(() => {
    if (!nuevo) return
    const det = cajaNuevo.current?.querySelector('details')
    if (det) det.open = true
    cajaNuevo.current?.scrollIntoView({ block: 'nearest' })
  }, [nuevo])

  const sincronizarUrl = (id: string | null) => {
    const p = new URLSearchParams(window.location.search)
    if (id) p.set('sel', id); else p.delete('sel')
    p.delete('nuevo')
    const qs = p.toString()
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`)
  }
  const elegir = (id: string) => {
    const siguiente = id === sel ? null : id
    setSel(siguiente)
    sincronizarUrl(siguiente)
  }

  const seleccionado = sel ? paquetes.find((p) => p.id === sel) ?? null : null
  const comparacion = useMemo(
    () => (seleccionado ? armarComparacion(insumosDe(seleccionado), economia) : null),
    [seleccionado, economia],
  )
  const frenados = paquetes.map((p) => ({ p, frenos: queLoFrena(p) })).filter((x) => x.frenos.length > 0)

  const bloquesQueFrenan = frenados.map(({ p, frenos }) => (
    <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }} data-testid={`que-lo-frena-${p.id}`}>
      <div style={{ fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue, textTransform: 'uppercase' }}>
        {p.proveedor ?? p.nombre} · qué lo frena
      </div>
      {frenos.map((f, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: '10px', minHeight: '56px', borderBottom: `1px solid ${C.borde}`,
          paddingLeft: '10px', borderLeft: `2px solid ${f.tono === 'neg' ? C.neg : C.warn}`,
        }}>
          <span style={{ color: f.tono === 'neg' ? C.neg : C.warn, display: 'flex' }}><Ico d={f.tono === 'neg' ? P.bloqueo : P.doc} s={14} /></span>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ fontSize: '13.5px', color: C.tinta }}>{f.texto}</div>
            <div style={{ fontSize: '12px', color: C.tintaSuave }}>{p.nombre}</div>
          </div>
          <button type="button" onClick={() => { setSel(p.id); sincronizarUrl(p.id) }}
            style={{ font: 'inherit', fontSize: '12px', color: f.tono === 'neg' ? C.neg : C.warn, fontWeight: 500, whiteSpace: 'nowrap', border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}>
            Ver
          </button>
        </div>
      ))}
    </div>
  ))

  const nota = (
    <div style={{ fontSize: '12px', color: C.tenue }}>
      Con gente propia: <span style={{ color: C.tenue, fontStyle: 'italic' }}>sin análisis de costo</span>
    </div>
  )

  const panel = seleccionado && (
    <PanelSubcontrato
      paquete={seleccionado}
      economia={economia}
      obraId={obraId}
      comparacion={comparacion ?? []}
      onCerrar={() => { setSel(null); sincronizarUrl(null) }}
      acciones={acciones}
    />
  )

  const formulario = nuevo && <div ref={cajaNuevo} data-testid="caja-nuevo-paquete">{formularioNuevo}</div>

  if (telefono) {
    return (
      <div style={{ padding: '16px', paddingBottom: '96px', display: 'flex', flexDirection: 'column', gap: '14px', background: C.superficie }} data-testid="subcontratos">
        {formulario}
        <TablaSubcontratos paquetes={paquetes} seleccionado={sel} economia={economia} onSeleccionar={elegir} telefono />
        {panel}
        {bloquesQueFrenan}
        {nota}
        <div style={{ position: 'fixed', left: 0, right: 0, bottom: '64px', padding: '12px 16px 18px', background: C.superficie, borderTop: `1px solid ${C.borde}`, zIndex: 19 }}>
          <button type="button" onClick={() => setNuevo(true)} data-testid="nuevo-paquete" style={{
            font: 'inherit', width: '100%', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: '6px',
            background: C.marca, color: C.grafito, fontSize: '14px', fontWeight: 600, border: 0, cursor: 'pointer', fontFamily: 'inherit',
          }}><Ico d={P.mas} s={15} />Nuevo paquete</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '22px 30px 32px', display: 'flex', flexDirection: 'column', gap: '26px', background: C.superficie }} data-testid="subcontratos">
      {formulario}
      <div style={{ display: 'grid', gridTemplateColumns: seleccionado ? 'minmax(0,1fr) 384px' : 'minmax(0,1fr)', gap: '26px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '26px', minWidth: 0 }}>
          <TablaSubcontratos paquetes={paquetes} seleccionado={sel} economia={economia} onSeleccionar={elegir} />
          {bloquesQueFrenan.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', maxWidth: '88ch' }}>{bloquesQueFrenan}</div>
          )}
          {nota}
        </div>
        {panel}
      </div>
    </div>
  )
}

/** Los insumos de la comparación, tal como los espera `armarComparacion`. */
const insumosDe = (p: Paquete) => ({
  paquete: {
    cantidad: p.cantidad,
    unidad: p.unidad,
    precio_contratado: p.precio_contratado,
    aportes: p.aportes_total,
    costo_real: p.costo_real,
    hh_apoyo: p.hh_apoyo,
    personas_externas: p.personas_externas,
    fecha_inicio_plan: p.fecha_inicio_plan,
    fecha_fin_plan: p.fecha_fin_plan,
  },
  actividad: p.vinculos[0] ?? null,
})
