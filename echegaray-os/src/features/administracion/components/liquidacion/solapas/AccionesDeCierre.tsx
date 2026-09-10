'use client'

import { useState, useTransition } from 'react'
import { V } from '@/shared/components/v2/patron'
import { cerrarQuincenaAction } from '../../../services/liquidacionCierreActions'

// EL BOTÓN QUE CIERRA. Todo lo que decide vive en el servidor.
//
// ═══ EL BLOQUEO SE DECIDE DOS VECES, A PROPÓSITO ═══
//
// Acá para poder DECIR POR QUÉ sin ir al servidor, y en `cerrarQuincenaAction` para que valga.
// El `disabled` es un cartel, no una cerradura: esta acción se invoca con lo que viaja en el HTML.
//
// ═══ REABRIR NO ESTÁ ACÁ, Y NO ES UN OLVIDO ═══
//
// La reapertura ya vive entera en `ReabrirQuincena.tsx` + `reabrirQuincena` (liquidacionActions):
// muestra la diferencia calculada en el servidor ANTES de guardar y escribe la firma antes de
// abrir. Un segundo panel de reapertura serían dos definiciones de la misma decisión sobre plata
// que ya se pagó.

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
