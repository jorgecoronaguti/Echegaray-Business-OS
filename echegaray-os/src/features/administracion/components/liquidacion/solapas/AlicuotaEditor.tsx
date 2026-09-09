'use client'

import { useState, useTransition } from 'react'
import { V } from '@/shared/components/v2/patron'
import { guardarAlicuota } from '../../../services/liquidacionCostoActions'
import {
  ROTULO_CONCEPTO, type Alicuota, type ConceptoCosto,
} from '../../../services/costoHora'
import { ALTO_LIQ } from './tabla'

// LA FILA DE UNA ALÍCUOTA, EDITABLE EN LÍNEA.
//
// Editar NO pisa: guarda una VERSIÓN nueva con su `desde`. La obra vieja conserva la suya, y la
// base lo impone con `revoke update` — el formulario sólo hace visible una regla que ya existe.
// Por eso el campo de fecha es obligatorio y visible: sin él, «cambiar una alícuota» parecería
// reescribir el pasado.

const pct = (n: number): string => `${n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })} %`

export function FilaAlicuota({ concepto, vigente, historial, hoy }: {
  concepto: ConceptoCosto
  vigente: Alicuota | undefined
  historial: readonly Alicuota[]
  hoy: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [guardando, empezar] = useTransition()
  const [f, setF] = useState({
    desde: hoy,
    porcentaje: vigente ? String(vigente.porcentaje) : '',
    base: vigente?.base ?? 'declarado',
    fuente: '',
  })

  const guardar = () => empezar(async () => {
    const r = await guardarAlicuota({ concepto, ...f })
    setAviso(r.ok ? r.mensaje : r.error)
    if (r.ok) setAbierto(false)
  })

  return (
    <>
      <tr data-testid={`alicuota-${concepto}`} style={{ borderBottom: `1px solid ${V.lineaFila}` }}>
        <td style={{ ...celda, textAlign: 'left', color: V.tinta }}>{ROTULO_CONCEPTO[concepto]}</td>
        <td style={{ ...celda, color: vigente ? V.tinta : V.tenue }}>
          {/* R1 · SIN CARGAR NO ES 0 %. Un cero diría que ese concepto no cuesta nada. */}
          {vigente ? pct(vigente.porcentaje) : <span data-testid={`sin-cargar-${concepto}`}>sin cargar</span>}
        </td>
        <td style={{ ...celda, color: V.apagado, fontSize: '11.5px' }}>
          {vigente ? (vigente.base === 'total' ? 'sobre el total' : 'sobre lo declarado') : '—'}
        </td>
        <td style={{ ...celda, color: V.tenue, fontSize: '11.5px', fontFamily: 'var(--font-mono, monospace)' }}>
          {vigente ? vigente.desde : '—'}
        </td>
        <td style={{ ...celda, textAlign: 'left', color: V.tenue, fontSize: '11.5px' }}>
          {vigente?.fuente || '—'}
          {historial.length > 1 && (
            <span style={{ marginLeft: 8, color: V.inerte }}>· {historial.length} versiones</span>
          )}
        </td>
        <td style={{ ...celda }}>
          <button type="button" onClick={() => setAbierto((v) => !v)}
            data-testid={`editar-${concepto}`}
            style={{ background: 'none', border: 'none', color: V.apagado, fontSize: '11.5px', cursor: 'pointer', padding: 0 }}>
            {abierto ? 'cancelar' : vigente ? 'nueva versión' : 'cargar'}
          </button>
        </td>
      </tr>
      {abierto && (
        <tr style={{ background: V.hover }}>
          <td colSpan={6} style={{ padding: '10px 8px' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <Campo rotulo="Rige desde">
                <input type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })}
                  data-testid={`desde-${concepto}`} style={control} />
              </Campo>
              <Campo rotulo="Porcentaje">
                <input type="number" step="0.01" min="0" max="100" value={f.porcentaje}
                  onChange={(e) => setF({ ...f, porcentaje: e.target.value })}
                  data-testid={`porcentaje-${concepto}`} style={{ ...control, width: 90, textAlign: 'right' }} />
              </Campo>
              <Campo rotulo="Pesa sobre">
                <select value={f.base} onChange={(e) => setF({ ...f, base: e.target.value as 'declarado' | 'total' })}
                  data-testid={`base-${concepto}`} style={control}>
                  <option value="declarado">lo declarado</option>
                  <option value="total">el total pagado</option>
                </select>
              </Campo>
              <Campo rotulo="De dónde salió">
                <input type="text" value={f.fuente} onChange={(e) => setF({ ...f, fuente: e.target.value })}
                  placeholder="convenio, factura de ART, liquidación"
                  data-testid={`fuente-${concepto}`} style={{ ...control, width: 260 }} />
              </Campo>
              <button type="button" onClick={guardar} disabled={guardando}
                data-testid={`guardar-${concepto}`}
                style={{
                  background: V.marca, color: V.grafito, border: 'none', borderRadius: 6,
                  padding: '7px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', height: 30,
                }}>
                {guardando ? 'Guardando…' : 'Guardar versión'}
              </button>
            </div>
          </td>
        </tr>
      )}
      {aviso && (
        <tr><td colSpan={6} style={{ padding: '0 8px 8px', fontSize: '11.5px', color: V.apagado }}>{aviso}</td></tr>
      )}
    </>
  )
}

const celda = { padding: '0 8px', height: ALTO_LIQ.renglon, textAlign: 'right' as const, fontSize: '13px', whiteSpace: 'nowrap' as const }

const control = {
  height: 26, borderRadius: 6, border: `1px solid ${V.lineaFuerte}`, background: '#FFFFFF',
  padding: '0 8px', fontSize: '12.5px', color: V.tinta, fontFamily: 'inherit',
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: '10.5px', letterSpacing: '.06em', color: V.tenue, textTransform: 'uppercase' }}>{rotulo}</span>
      {children}
    </label>
  )
}
