'use client'

// LA CELDA DEL $/H (O DEL NETO MENSUAL) EN EL CUADRO DE LA QUINCENA.
//
// Dueño, 14/09/2026: *«no me permite editar el valor hora de manera fácil»*. Y sobre cómo corregir:
// clic en la celda, escribir, Enter. Sin confirmaciones que molesten; el % al lado, no en un paso extra.
//
// ═══ QUÉ PASA AL APRETAR ENTER ═══
//
// `registrarTarifaDesdeLaQuincena` decide con `planDeTarifa`: si la quincena no tenía fila propia,
// crea una desde su primer día (un aumento); si ya la tenía y está abierta, la corrige y deja el
// rastro. La cadena NO se recalcula acá: la acción revalida la ruta y el servidor vuelve a armar la
// línea. Lo que queda en la celda es lo que la base devolvió.

import { useState, useTransition } from 'react'
import { V } from '@/shared/components/v2/patron'
import { pesos } from '../formato'
import { formaEditable } from '../../../services/cuadroDeJornales'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales'
import { registrarTarifaDesdeLaQuincena } from '../../../services/tarifaDeLaQuincenaActions'

/** `oficial_especializado` → «Oficial especializado». El legajo guarda la clave; el texto es para leer. */
export const rotuloCategoria = (c: string): string => {
  const t = c.replace(/_/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** «$ 6.100,50» → 6100.5. `null` si no es un número positivo: la celda no manda basura. */
function importeTecleado(texto: string): number | null {
  const n = Number(texto.trim().replace(/[$\s.]/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

const conSigno = (p: number): string => `${p > 0 ? '+' : ''}${p.toLocaleString('es-AR')}%`

export function CeldaTarifa({ fila, quincena, pct }: {
  fila: FilaDelEspejo
  quincena: { desde: string; hasta: string }
  /** % contra el valor anterior, sólo cuando el valor vigente empieza en esta quincena. */
  pct: number | null
}) {
  const l = fila.linea
  const forma = formaEditable(fila.grupo)
  const actual = forma === 'mensual' ? l.netoMensual : (forma === 'hora' ? l.valorHora : (l.valorHora ?? l.netoMensual))
  const editable = forma != null && !fila.cerrada
  const [texto, setTexto] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, empezar] = useTransition()

  const guardar = () => {
    if (texto == null || forma == null) return
    const valor = importeTecleado(texto)
    if (texto.trim() === '' || valor === actual) { setTexto(null); setError(null); return }
    if (valor == null) { setError('Escribí un importe mayor a cero.'); return }
    empezar(async () => {
      const r = await registrarTarifaDesdeLaQuincena({
        ...quincena, grupo: fila.grupo, persona_id: fila.personaId, forma, valor,
      })
      if (r.ok) { setTexto(null); setError(null) } else setError(r.error)
    })
  }

  const titulo = error
    ?? `${forma === 'mensual' ? 'Neto mensual' : '$/h'} · ${l.origenTarifa ?? 'sin origen'}`
  return (
    <div title={titulo} style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
      {texto != null ? (
        <input
          autoFocus inputMode="decimal" value={texto} disabled={guardando}
          aria-label={`Valor de ${fila.nombre}`} data-testid={`tarifa-input-${fila.personaId}`}
          onChange={(e) => setTexto(e.target.value)}
          onBlur={guardar}
          onKeyDown={(e) => {
            if (e.key === 'Enter') guardar()
            if (e.key === 'Escape') { setTexto(null); setError(null) }
          }}
          style={{
            width: 88, height: 28, textAlign: 'right', fontSize: '12.5px', padding: '0 6px',
            border: `1px solid ${error ? V.neg : V.grafito}`, borderRadius: 4, background: '#FFFFFF',
            color: V.tinta, fontVariantNumeric: 'tabular-nums',
          }}
        />
      ) : editable ? (
        <button type="button" data-testid={`tarifa-${fila.personaId}`} aria-label={`Cambiar el valor de ${fila.nombre}`}
          onClick={() => { setError(null); setTexto(actual == null ? '' : String(actual)) }}
          style={{
            minHeight: 28, padding: '0 6px', border: `1px solid ${error ? V.neg : V.lineaFuerte}`, borderRadius: 4,
            background: '#FFFFFF', color: actual == null ? V.tenue : V.tinta, cursor: 'text',
            fontSize: '12.5px', fontVariantNumeric: 'tabular-nums',
          }}>{actual == null ? 'sin tarifa' : pesos(actual)}</button>
      ) : (
        <span style={{ color: V.apagado }}>{actual == null ? '—' : pesos(actual)}</span>
      )}
      {/* UN 0% NO DICE NADA: aparece cuando el Sheet sembró la quincena con el mismo valor. */}
      {pct != null && pct !== 0 && texto == null && (
        <span data-testid={`tarifa-pct-${fila.personaId}`} style={{ fontSize: '10.5px', color: pct < 0 ? V.neg : V.apagado }}>
          {conSigno(pct)}
        </span>
      )}
    </div>
  )
}
