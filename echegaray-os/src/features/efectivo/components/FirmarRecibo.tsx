'use client'

// FIRMAR EL RECIBO DE UN GASTO MANUAL — lo que firma el proveedor del servicio, en la pantalla de quien rinde.
//
// ═══ POR QUÉ ASÍ ═══
//
// El proveedor no es usuario de la app: quien rinde (jefe de obra o Administración) le alcanza el teléfono o la
// computadora y el proveedor firma con el dedo o el mouse, igual que quien recibe efectivo firma la conformidad.
// Lo que el proveedor LEE es la frase que armó el servidor (`fraseDelRecibo`), la misma que va al PDF.
// Un cierre nunca es mudo: al firmar la pantalla dice que quedó firmado, con fecha y hora, y ofrece el PDF.
//
// El mismo componente sirve al teléfono (390 px, pantalla propia) y a la computadora (panel al costado): lo único
// que cambia es el marco que lo contiene.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LienzoFirma } from '@/shared/firma/LienzoFirma'
import { validarFirmaDelRecibo, fechaHoraDeFirma } from '../logica/reciboFirma'
import { firmarReciboGastoManualAction } from '../services/reciboFirma'
import { Campo, ErrorPanel } from './Piezas'
import { urlReciboFirmado } from './ReciboParaFirmar'
import { TOQUE_TELEFONO, V, botonClaroGrande, botonOscuroGrande, campo, campoMonto } from './estilo'

export function FirmarRecibo({ rendicion, frase, volverA }: {
  rendicion: string
  /** «Recibí de … la suma de pesos …»: lo arma el servidor con `fraseDelRecibo`. */
  frase: string
  /** Adónde se vuelve al terminar. */
  volverA: string
}) {
  const router = useRouter()
  const [aclaracion, setAclaracion] = useState('')
  const [dni, setDni] = useState('')
  const [svg, setSvg] = useState<string | null>(null)
  const [reinicio, setReinicio] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [firmadoEn, setFirmadoEn] = useState<string | null>(null)

  const firmar = async () => {
    setError(null)
    const v = validarFirmaDelRecibo({ aclaracion, dni })
    if (!v.ok) { setError(v.error); return }
    if (!svg) { setError('Firmá arriba de la línea: el trazo es muy corto.'); return }
    setEnviando(true)
    const r = await firmarReciboGastoManualAction({ rendicion, trazo: svg, aclaracion, dni })
    setEnviando(false)
    if (!r.ok) { setError(r.error); return }
    setFirmadoEn(r.firmado_en)
    router.refresh()
  }

  if (firmadoEn) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }} className={TOQUE_TELEFONO} data-testid="recibo-firmado-ok">
        <div style={{ fontSize: '15px', fontWeight: 600, color: V.tinta }}>Recibo firmado</div>
        <div style={{ fontSize: '13px', color: V.apagado }}>
          Firmó {aclaracion.replace(/\s+/g, ' ').trim()} el {fechaHoraDeFirma(firmadoEn)}.
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a href={urlReciboFirmado(rendicion)} target="_blank" rel="noopener" style={{ ...botonClaroGrande, textDecoration: 'none' }} data-testid="recibo-ver-pdf">
            Ver el PDF
          </a>
          <button type="button" onClick={() => { router.push(volverA, { scroll: false }); router.refresh() }} style={botonOscuroGrande} data-testid="recibo-listo">
            Listo
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1 }} className={TOQUE_TELEFONO} data-testid="firmar-recibo">
      <div style={{ fontSize: '14px', lineHeight: 1.55, color: V.tinta }} data-testid="recibo-frase">{frase}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 14 }}>
        <Campo rotulo="Aclaración">
          <input
            value={aclaracion} onChange={(x) => { setAclaracion(x.target.value); setError(null) }} maxLength={120}
            placeholder="Nombre de quien firma" style={campo} aria-label="Aclaración" data-testid="recibo-aclaracion"
          />
        </Campo>
        <Campo rotulo="DNI (opcional)">
          <input
            value={dni} onChange={(x) => { setDni(x.target.value); setError(null) }} inputMode="numeric" maxLength={12}
            style={campoMonto} aria-label="DNI" data-testid="recibo-dni"
          />
        </Campo>
      </div>
      <LienzoFirma onCambio={(v) => { setSvg(v); if (v) setError(null) }} reinicio={reinicio} minAlto={200} testid="recibo-lienzo" />
      <ErrorPanel texto={error} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={firmar} disabled={enviando || !svg} style={{ ...botonOscuroGrande, opacity: enviando || !svg ? 0.6 : 1 }} data-testid="recibo-firmar">
          {enviando ? 'Guardando…' : 'Firmar'}
        </button>
        <button type="button" onClick={() => { setReinicio((n) => n + 1); setError(null) }} disabled={enviando} style={botonClaroGrande} data-testid="recibo-rehacer">
          Rehacer
        </button>
      </div>
    </div>
  )
}
