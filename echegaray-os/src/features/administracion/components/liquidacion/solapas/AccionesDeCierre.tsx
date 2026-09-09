'use client'

import { useState, useTransition } from 'react'
import { V } from '@/shared/components/v2/patron'
import {
  cerrarQuincenaAction, confirmarReapertura, previsualizarReapertura,
} from '../../../services/liquidacionCierreActions'
import type { AvisoDeReapertura } from '../../../services/liquidacionCierre'
import { pesos } from '../BloqueLiquidacion'

// LOS DOS BOTONES QUE ESCRIBEN. Todo lo que deciden vive en el servidor.
//
// ═══ EL BLOQUEO SE DECIDE DOS VECES, A PROPÓSITO ═══
//
// Acá para poder DECIR POR QUÉ sin ir al servidor, y en `cerrarQuincenaAction` para que valga.
// El `disabled` es un cartel, no una cerradura: esta acción se invoca con lo que viaja en el HTML.
//
// ═══ REABRIR ES DOS PASOS Y NO SE PUEDEN JUNTAR ═══
//
// R6: «recalcula con la retribución vigente y avisa la diferencia ANTES de guardar». Un solo botón
// que reabra y después muestre el resultado le pide a alguien que compare contra un número que ya
// no existe. Por eso el motivo sólo aparece DESPUÉS de ver la diferencia.

interface QuincenaProp { desde: string; hasta: string }

const boton = (habilitado: boolean) => ({
  height: 32, padding: '0 16px', borderRadius: 6, border: 'none',
  background: habilitado ? V.marca : V.lineaFuerte,
  color: habilitado ? V.grafito : V.apagado,
  fontSize: '12.5px', fontWeight: 600, cursor: habilitado ? 'pointer' : 'not-allowed',
})

const aviso = (color: string) => ({ fontSize: '11.5px', color, marginLeft: 12 })

export function BotonCerrar({ quincena, bloqueado, porque }: {
  quincena: QuincenaProp; bloqueado: boolean; porque: string
}) {
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)
  const [cerrando, empezar] = useTransition()

  const cerrar = () => empezar(async () => {
    const r = await cerrarQuincenaAction(quincena)
    setResultado(r.ok ? { ok: true, texto: r.mensaje } : { ok: false, texto: r.error })
  })

  return (
    <div>
      <button
        type="button" data-testid="cierre-boton" disabled={bloqueado || cerrando}
        onClick={cerrar} style={boton(!bloqueado && !cerrando)}
      >
        {cerrando ? 'Sellando…' : 'Cerrar y sellar'}
      </button>
      {bloqueado && (
        <span data-testid="cierre-porque-no" style={aviso(V.apagado)}>{porque}</span>
      )}
      {resultado && (
        <span data-testid="cierre-resultado" style={aviso(resultado.ok ? V.tinta : V.neg)}>
          {resultado.texto}
        </span>
      )}
    </div>
  )
}

/** El aviso de la reapertura: primero cuánto cambia, después el motivo. */
export function FlujoReapertura({ quincena }: { quincena: QuincenaProp }) {
  const [av, setAv] = useState<AvisoDeReapertura | null>(null)
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [trabajando, empezar] = useTransition()

  const ver = () => empezar(async () => {
    const r = await previsualizarReapertura(quincena)
    setError(r.ok ? null : r.error)
    setAv(r.ok ? r.aviso : null)
  })

  const confirmar = () => empezar(async () => {
    const r = await confirmarReapertura({ ...quincena, motivo })
    if (r.ok) { setHecho(r.mensaje); setAv(null) } else setError(r.error)
  })

  if (hecho) return <p data-testid="reapertura-hecha" style={{ fontSize: '12.5px', color: V.tinta }}>{hecho}</p>

  return (
    <div data-testid="reapertura" style={{ marginTop: 16 }}>
      {!av && (
        <button type="button" data-testid="reapertura-ver" onClick={ver} disabled={trabajando}
          style={{ ...boton(!trabajando), background: 'transparent', border: `1px solid ${V.lineaFuerte}`, color: V.tinta }}>
          {trabajando ? 'Calculando…' : 'Reabrir · ver qué cambia'}
        </button>
      )}
      {av && <Diferencia av={av} />}
      {av && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
          <input
            data-testid="reapertura-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por qué se reabre (mínimo 10 caracteres)"
            style={{
              height: 26, flex: 1, maxWidth: 460, padding: '0 8px', borderRadius: 6,
              border: `1px solid ${V.lineaFuerte}`, fontSize: '12.5px', color: V.tinta,
            }}
          />
          <button type="button" data-testid="reapertura-confirmar" onClick={confirmar}
            disabled={trabajando || motivo.trim().length < 10} style={boton(motivo.trim().length >= 10 && !trabajando)}>
            Reabrir
          </button>
        </div>
      )}
      {error && <p data-testid="reapertura-error" style={{ fontSize: '11.5px', color: V.neg }}>{error}</p>}
    </div>
  )
}

/** Lo que cambiaría, por persona y en total. Nada escrito todavía. */
function Diferencia({ av }: { av: AvisoDeReapertura }) {
  if (av.sinCambios) {
    return (
      <p data-testid="reapertura-sin-cambios" style={{ fontSize: '12.5px', color: V.apagado, margin: '8px 0 0' }}>
        Recalcular con la retribución vigente no mueve un peso. Reabrir igual queda registrado.
      </p>
    )
  }
  return (
    <div data-testid="reapertura-diferencia" style={{ marginTop: 8 }}>
      {av.cambian.map((f) => (
        <div key={f.personaId} style={{
          display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: '12.5px',
          padding: '4px 0', borderBottom: `1px solid ${V.lineaFila}`, fontVariantNumeric: 'tabular-nums',
        }}>
          <span style={{ color: V.tinta }}>{f.nombre}</span>
          {/* R1 · SIN DATO NO ES CERO: sin tarifa vigente no se puede decir cuánto cambia. */}
          <span style={{ color: f.diferencia == null ? V.warn : V.tinta }}>
            {f.diferencia == null ? 'sin tarifa vigente: no se puede recalcular' : pesos(f.diferencia)}
          </span>
        </div>
      ))}
      <div style={{
        display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: '13px',
        padding: '8px 0 0', borderTop: `1px solid ${V.grafito}`, fontVariantNumeric: 'tabular-nums',
      }}>
        <span style={{ color: V.apagado }}>Diferencia total si se reabre</span>
        <span style={{ color: V.tinta }}>{pesos(av.total)}</span>
      </div>
    </div>
  )
}
