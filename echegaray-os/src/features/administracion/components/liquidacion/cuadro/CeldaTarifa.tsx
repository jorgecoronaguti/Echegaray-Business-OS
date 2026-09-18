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

import { useRef, useState, useTransition } from 'react'
import { V } from '@/shared/components/v2/patron'
import { pesos } from '../formato'
import { leerNumeroEsAR } from '@/shared/lib/numeroEsAR'
import { useDeshacer } from '@/shared/components/deshacer/DeshacerProvider'
import { formaEditable } from '../../../services/cuadroDeJornales'
import { sinSello } from './estadoDelPago'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales'
import { registrarTarifaDesdeLaQuincena } from '../../../services/tarifaDeLaQuincenaActions'

/** `oficial_especializado` → «Oficial especializado». El legajo guarda la clave; el texto es para leer. */
export const rotuloCategoria = (c: string): string => {
  const t = c.replace(/_/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** «$ 6.100,50» → 6100.5. `null` si no es un número positivo: la celda no manda basura. */
function importeTecleado(texto: string): number | null {
  const leido = leerNumeroEsAR(texto)
  return leido.ok && leido.valor != null && leido.valor > 0 ? leido.valor : null
}

const conSigno = (p: number): string => `${p > 0 ? '+' : ''}${p.toLocaleString('es-AR')}%`

export function CeldaTarifa({ fila, quincena, pct, sinValor = 'sin tarifa' }: {
  fila: FilaDelEspejo
  quincena: { desde: string; hasta: string }
  /** % contra el valor anterior, sólo cuando el valor vigente empieza en esta quincena. */
  pct: number | null
  /** Qué dice el botón sin valor. Un jefe mensual no está «sin tarifa»: le falta el sueldo cargado. */
  sinValor?: string
}) {
  const l = fila.linea
  const forma = formaEditable(fila.grupo)
  const actual = forma === 'mensual' ? l.netoMensual : (forma === 'hora' ? l.valorHora : (l.valorHora ?? l.netoMensual))
  const editable = forma != null && !fila.cerrada
  const [texto, setTexto] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [guardando, empezar] = useTransition()
  const deshacer = useDeshacer()
  const cancelado = useRef(false)

  const guardar = () => {
    if (texto == null || forma == null) return
    const valor = importeTecleado(texto)
    if (texto.trim() === '' || valor === actual) { setTexto(null); setError(null); return }
    if (valor == null) { setError('Escribí un importe mayor a cero.'); return }
    empezar(async () => {
      const r = await registrarTarifaDesdeLaQuincena({
        ...quincena, grupo: fila.grupo, persona_id: fila.personaId, forma, valor,
      })
      if (r.ok) {
        setTexto(null); setError(null)
        // CMD/CTRL+Z: la tarifa anterior vuelve con la misma escritura (queda en el historial de correcciones).
        const f = forma
        deshacer?.registrar({
          clave: `tarifa-${fila.personaId}`, rotulo: `${f === 'mensual' ? 'Neto mensual' : '$/h negro'} de ${fila.nombre}`,
          anterior: actual == null ? '' : String(actual), nuevo: String(valor),
          anteriorTexto: pesos(actual), nuevoTexto: pesos(valor),
        }, async (v) => {
          const n = Number(v)
          if (v === '' || !(n > 0)) return { ok: false, error: 'no había un valor anterior que restaurar' }
          return registrarTarifaDesdeLaQuincena({ ...quincena, grupo: fila.grupo, persona_id: fila.personaId, forma: f, valor: n })
        })
      } else setError(r.error)
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
          // ESCAPE NO GUARDA DE REBOTE: el input se desmonta y el `blur` que emite todavía ve el texto tecleado.
          onBlur={() => { if (cancelado.current) { cancelado.current = false; return } guardar() }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') guardar()
            if (e.key === 'Escape') { e.preventDefault(); cancelado.current = true; setTexto(null); setError(null) }
          }}
          style={{
            width: 88, height: 32, textAlign: 'right', fontSize: '12.5px', padding: '0 6px',
            border: `1px solid ${error ? V.neg : V.grafito}`, borderRadius: 4, background: '#FFFFFF',
            color: V.tinta, fontVariantNumeric: 'tabular-nums',
          }}
        />
      ) : editable ? (
        <button type="button" data-testid={`tarifa-${fila.personaId}`} aria-label={`Cambiar el valor de ${fila.nombre}`}
          onClick={() => { setError(null); setTexto(actual == null ? '' : String(actual)) }}
          style={{
            // MISMO MARCO SUAVE QUE EL RESTO DE LAS CELDAS ESCRIBIBLES (limpieza 17/09/2026). El error sigue en rojo.
            minHeight: 32, padding: '0 6px', border: `1px solid ${error ? V.neg : V.linea}`, borderRadius: 4,
            background: '#FFFFFF', color: actual == null ? V.tenue : V.tinta, cursor: 'text',
            fontSize: '12.5px', fontVariantNumeric: 'tabular-nums',
          }}>{actual == null ? sinValor : pesos(actual)}</button>
      ) : (
        // EL MISMO TESTID QUE EL BOTÓN: en una quincena cerrada la celda no se escribe, pero el valor tiene que poder
        // medirse igual (17/09/2026: el «—» de las quincenas anteriores no lo veía ningún test porque no tenía testid).
        // SIN VALOR EN LA CERRADA SE DICE POR QUÉ (18/09/2026): «sin dato sellado» o «sin línea sellada», nunca la tarifa de hoy.
        <span data-testid={`tarifa-${fila.personaId}`} data-solo-lectura="1" data-sin-sello={actual == null && sinSello(l) ? '1' : undefined}
          style={{ color: actual == null ? V.tenue : V.apagado, fontSize: actual == null ? '11px' : undefined }}>
          {actual == null ? (sinSello(l) ?? '—') : pesos(actual)}
        </span>
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
