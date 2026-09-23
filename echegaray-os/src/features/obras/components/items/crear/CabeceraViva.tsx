'use client'

// LAS DOS PIEZAS QUE LA PÁGINA MONTA EN LA CABECERA DE LA OBRA: una cifra que la pantalla de abajo
// va cambiando, y la primaria de la pantalla (C02 «Convertir 14 partidas en plan», C03 «Crear 38
// ítems», C05 «Guardar el reparto», C10 «Sellar línea base»). Miden lo que mide el botón de la
// cabecera en el diseño: 32px, `padding:0 14px`, 13px/600, radio 6; apagada sobre `line` con texto
// faint (C10, MC11).

import { C } from '../../canon/tokens'
import { Ico, P } from '../../canon/Ico'
import { useCifra, usePrimaria } from './estadoCabecera'

export function CifraViva({ clave, falta }: { clave: string; falta: string }) {
  const v = useCifra(clave)
  if (v == null) return <span style={{ color: C.tenue, fontStyle: 'italic', fontFamily: 'inherit' }} data-nulo="">{falta}</span>
  if (typeof v === 'string') return <span data-testid={`cifra-${clave}`}>{v}</span>
  return <span data-testid={`cifra-${clave}`} style={{ color: v.tono === 'warn' ? C.warn : C.pos }}>{v.texto}</span>
}

const ICONO = { mas: P.mas, flecha: P.flecha, ok: P.ok } as const

export function PrimariaViva() {
  const p = usePrimaria()
  if (!p) return null
  return (
    <button type="button" onClick={p.alPulsar} disabled={p.apagada || p.pendiente} data-testid={p.testid}
      title={p.apagada && p.motivo ? p.motivo : undefined} aria-disabled={p.apagada}
      style={{
        height: '32px', padding: '0 14px', border: 0, borderRadius: '6px',
        background: p.apagada ? C.borde : C.marca, color: p.apagada ? C.tenue : C.grafito,
        font: 'inherit', fontSize: '13px', fontWeight: 600, cursor: p.apagada ? 'default' : 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: '7px', whiteSpace: 'nowrap', opacity: p.pendiente ? 0.7 : 1,
      }}>
      <Ico d={ICONO[p.icono]} s={13} />{p.pendiente ? 'Guardando…' : p.rotulo}
    </button>
  )
}
