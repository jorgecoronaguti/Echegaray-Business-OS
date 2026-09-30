'use client'

// RENDIR UN GASTO SIN FOTO (dueño, 30/09/2026: «sigo sin poder hacer rendiciones manuales, cargarlas
// editarlas, modificarlas… tengo q tener abm de todo en efectivo»).
//
// Un gasto pagado con la plata de una entrega que no tiene ticket (o lo tiene ilegible) se rinde a mano:
// fecha, importe, concepto, y si se sabe, proveedor y CUIT. La base (`rendir_gasto_manual`, migración
// 20261001T0010) lo encola como fila «A rendir» de Compras y lo ata a la entrega en el acto: el saldo baja
// ya, y la fila la escribe el worker en menos de un minuto. Mismo formulario en la PC (panel de la ficha)
// y en el teléfono (`/mi-informacion/efectivo/rendir/sin-foto`): los dos jefes de obra y Administración
// rinden igual.

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { validarMonto } from '../logica/formularios'
import { rendirGastoManualAction } from '../services/edicion'
import { Campo, ErrorPanel } from './Piezas'
import { V, botonClaroGrande, botonOscuroGrande, campo, campoMonto, MONO } from './estilo'

export interface EntregaParaRendir {
  id: string
  codigo: string
  /** «Galpón 8 · Rubén Sosa»: adónde va el gasto y de quién es la plata. */
  rotulo: string
  enSuPoder: number
}

/** Hoy en la fecha del navegador, como `YYYY-MM-DD` (la base rechaza más de un día a futuro). */
function hoyIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function FormularioGastoManual({ entregas, entregaInicial, volverA, alGuardar, testid = 'gasto-manual' }: {
  /** Las entregas abiertas entre las que se elige. Con una sola, no se pregunta. */
  entregas: EntregaParaRendir[]
  entregaInicial?: string | null
  /** Adónde vuelve «Cancelar». */
  volverA: string
  /** Adónde va al guardar (por defecto, a `volverA`). */
  alGuardar?: string
  testid?: string
}) {
  const router = useRouter()
  const [entrega, setEntrega] = useState(entregaInicial && entregas.some((e) => e.id === entregaInicial) ? entregaInicial : entregas[0]?.id ?? '')
  const [fecha, setFecha] = useState(hoyIso)
  const [total, setTotal] = useState('')
  const [concepto, setConcepto] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [cuit, setCuit] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, empezar] = useTransition()
  const elegida = entregas.find((e) => e.id === entrega) ?? null
  const m = validarMonto(total)
  const excede = elegida && m.ok && m.dato > elegida.enSuPoder

  const guardar = () => empezar(async () => {
    setError(null)
    if (!elegida) { setError('Elegí de qué entrega salió la plata'); return }
    if (!fecha) { setError('Poné la fecha del gasto'); return }
    if (!m.ok) { setError(m.error); return }
    if (!concepto.trim()) { setError('Decí qué se compró o pagó'); return }
    const r = await rendirGastoManualAction(elegida.id, { fecha, total, concepto, proveedor, cuit })
    if (!r.ok) { setError(r.error); return }
    router.push(alGuardar ?? volverA, { scroll: false })
    router.refresh()
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }} data-testid={testid}>
      {entregas.length > 1 ? (
        <Campo rotulo="De qué entrega">
          <select value={entrega} onChange={(x) => { setEntrega(x.target.value); setError(null) }} style={campo} aria-label="De qué entrega" data-testid={`${testid}-entrega`}>
            {entregas.map((e) => <option key={e.id} value={e.id}>{e.codigo} · {e.rotulo}</option>)}
          </select>
        </Campo>
      ) : elegida ? (
        <div style={{ fontSize: '12.5px', color: V.apagado }} data-testid={`${testid}-entrega-fija`}>
          <span style={{ fontFamily: MONO }}>{elegida.codigo}</span> · {elegida.rotulo}
        </div>
      ) : (
        <div style={{ fontSize: '12.5px', color: V.apagado }}>No hay ninguna entrega abierta para rendir.</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 14 }}>
        <Campo rotulo="Fecha del gasto">
          <input type="date" value={fecha} max={hoyIso()} onChange={(x) => { setFecha(x.target.value); setError(null) }} style={campo} aria-label="Fecha del gasto" data-testid={`${testid}-fecha`} />
        </Campo>
        <Campo rotulo="Importe">
          <input value={total} onChange={(x) => { setTotal(x.target.value); setError(null) }} inputMode="decimal" placeholder="0" style={campoMonto} aria-label="Importe" data-testid={`${testid}-total`} />
        </Campo>
      </div>
      {excede && (
        <div style={{ fontSize: '12.5px', color: V.warn }} data-testid={`${testid}-excede`}>
          Rinde más de lo que le queda en esta entrega. Se guarda igual: el saldo queda en negativo hasta que se aclare.
        </div>
      )}
      <Campo rotulo="Qué se compró o pagó">
        <input value={concepto} onChange={(x) => { setConcepto(x.target.value); setError(null) }} maxLength={400} placeholder="Flete de arena · Pintura para el frente" style={campo} aria-label="Qué se compró o pagó" data-testid={`${testid}-concepto`} />
      </Campo>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: 14 }}>
        <Campo rotulo="Proveedor (si se sabe)">
          <input value={proveedor} onChange={(x) => setProveedor(x.target.value)} maxLength={200} style={campo} aria-label="Proveedor" data-testid={`${testid}-proveedor`} />
        </Campo>
        <Campo rotulo="CUIT (si se sabe)">
          <input value={cuit} onChange={(x) => { setCuit(x.target.value); setError(null) }} inputMode="numeric" maxLength={13} placeholder="20-12345678-9" style={campoMonto} aria-label="CUIT" data-testid={`${testid}-cuit`} />
        </Campo>
      </div>
      <div style={{ fontSize: '12px', color: V.apagado, lineHeight: 1.5 }}>
        Va a Compras como «A rendir» sin comprobante y baja el saldo de la entrega ahora. Después se edita o se borra desde la ficha.
      </div>
      <ErrorPanel texto={error} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={guardar} disabled={pendiente || !elegida} style={{ ...botonOscuroGrande, opacity: pendiente || !elegida ? 0.6 : 1 }} data-testid={`${testid}-guardar`}>
          {pendiente ? 'Guardando…' : 'Rendir el gasto'}
        </button>
        <button type="button" onClick={() => router.push(volverA, { scroll: false })} style={botonClaroGrande}>Cancelar</button>
      </div>
    </div>
  )
}
