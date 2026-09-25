'use client'

// B01 — LA OBRA VACÍA Y EL PRIMER RUBRO.
//
//   aside 420: «Rubro nuevo» 11,5 faint · nombre 16/600 · eyebrow «Qué va a colgar» y los cuatro niveles
//   de abajo con su código (1.1 Épica «agrupa» · 1.1.1 Historia «uni · cant · costo MO» · 1.1.1.1 Tarea
//   «fechas · método · insumos» · — Subtarea «paso · checklist»); al pie «Crear y seguir con otro»
//   (primaria) y «Crear y bajar a épica».
//   debajo del árbol: eyebrow «Rubros de otras obras · propuesta» y chips de 32 «+ Metalurgia · 2 épicas».

import { C, MONO } from '../../canon/tokens'
import { Ico, P } from '../../canon/Ico'
import { EYEBROW, ESTILO_PRIMARIA_32, ESTILO_SECUNDARIA_32 } from './Piezas'
import type { RubroPropuesto } from '../../../services/insumosService'
import type { ModoEnvio } from './FormHistoria'

const NIVELES = [
  { cod: '1.1', nombre: 'Épica', que: 'agrupa', sangria: 0 },
  { cod: '1.1.1', nombre: 'Historia', que: 'uni · cant · costo MO', sangria: 14 },
  { cod: '1.1.1.1', nombre: 'Tarea', que: 'fechas · método · insumos', sangria: 28 },
  { cod: '—', nombre: 'Subtarea', que: 'paso · checklist', sangria: 42 },
]

export function AsideRubroNuevo({ nombre, pendiente, alEnviar, alCerrar }: {
  nombre: string; pendiente: boolean; alEnviar: (m: ModoEnvio) => void; alCerrar: () => void
}) {
  const listo = nombre.trim().length >= 2
  return (
    <aside className="hidden md:flex" data-testid="aside-rubro-nuevo" style={{ borderLeft: `1px solid ${C.borde}`, padding: '18px 24px 28px', flexDirection: 'column', gap: '18px', minHeight: '460px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <div style={{ fontSize: '11.5px', color: C.tenue, display: 'flex', justifyContent: 'space-between' }}>
          <span>Rubro nuevo</span>
          <button type="button" onClick={alCerrar} aria-label="Cerrar" style={{ border: 'none', background: 'none', color: C.tenue, cursor: 'pointer', display: 'flex', padding: 0 }}><Ico d={P.cerrar} s={14} /></button>
        </div>
        <div style={{ fontSize: '16px', fontWeight: 600, color: listo ? C.tinta : C.tenue }}>{nombre || 'sin nombre todavía'}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', borderTop: `1px solid ${C.borde}`, paddingTop: '14px' }}>
        <div style={{ ...EYEBROW, marginBottom: '6px' }}>Qué va a colgar</div>
        {NIVELES.map((n) => (
          <div key={n.nombre} style={{ height: '37px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: `1px solid ${C.bordeTarjeta}`, fontSize: '13.5px', color: C.tinta }}>
            <span style={{ paddingLeft: `${n.sangria}px`, fontFamily: MONO, fontSize: '11px', color: C.tenue, width: '46px', flexShrink: 0 }}>{n.cod}</span>
            <span style={{ flex: 1 }}>{n.nombre}</span>
            <span style={{ fontSize: '12px', color: C.tintaSuave }}>{n.que}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
        <button type="button" onClick={() => alEnviar('seguir')} disabled={!listo || pendiente} data-testid="rubro-crear-y-seguir" style={{ ...ESTILO_PRIMARIA_32, opacity: listo ? 1 : 0.5 }}>
          <Ico d={P.ok} s={13} />{pendiente ? 'Creando…' : 'Crear y seguir con otro'}
        </button>
        <button type="button" onClick={() => alEnviar('bajar')} disabled={!listo || pendiente} data-testid="rubro-crear-y-bajar" style={ESTILO_SECUNDARIA_32}>Crear y bajar a épica</button>
      </div>
    </aside>
  )
}

export function RubrosPropuestos({ rubros, alElegir }: { rubros: RubroPropuesto[]; alElegir: (nombre: string) => void }) {
  if (rubros.length === 0) return null
  return (
    <div className="hidden md:flex" data-testid="rubros-propuestos" style={{ padding: '14px 20px 30px', flexDirection: 'column', gap: '10px' }}>
      <div style={EYEBROW}>Rubros de otras obras · <span style={{ color: C.warn, textTransform: 'none', letterSpacing: 0 }}>propuesta</span></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {rubros.map((r) => (
          <button key={r.nombre} type="button" onClick={() => alElegir(r.nombre)} data-testid={`rubro-propuesto-${r.nombre}`}
            style={{ height: '34px', padding: '0 14px', display: 'inline-flex', alignItems: 'center', gap: '8px', border: `1px solid ${C.borde}`, borderRadius: '6px', background: C.superficie, font: 'inherit', fontSize: '13px', color: C.tinta, cursor: 'pointer' }}>
            <span style={{ color: C.tenue, display: 'flex' }}><Ico d={P.mas} s={12} /></span>{r.nombre}
            {r.epicas > 0 && <span style={{ fontSize: '12px', color: C.tenue }}>· {r.epicas} {r.epicas === 1 ? 'épica' : 'épicas'}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
