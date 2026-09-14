'use client'

// LA CELDA DEL $/H (O DEL NETO MENSUAL) EN EL CUADRO DE LA QUINCENA.
//
// Dueño, 14/09/2026: *«no puedo modificar el valor hora»* → «En la celda + historial al lado».
//
// ═══ POR QUÉ PIDE CONFIRMACIÓN Y LAS OTRAS CELDAS NO ═══
//
// Un adelanto mal tecleado se corrige en la misma celda. Un valor hora mal tecleado NO: cada guardado
// es una FILA NUEVA de `persona_tarifa` que rige desde el primer día de la quincena y queda en el
// historial para siempre. Por eso la celda muestra, antes de escribir, desde cuándo rige y cuánto
// sube contra lo vigente: un 10× por un cero de más se ve como «+900%» antes de ser un dato.
//
// ═══ LA CADENA NO SE RECALCULA ACÁ ═══
//
// La acción revalida la ruta y el servidor vuelve a armar la línea con `getLiquidacionDeLaQuincena`.
// Lo que se ve después de confirmar es lo que la base devolvió, no lo que se tecleó.

import { useState, useTransition } from 'react'
import { V } from '@/shared/components/v2/patron'
import { pesos } from '../formato'
import { formaEditable, pctDeAumento } from '../../../services/cuadroDeJornales'
import type { FilaDelEspejo } from '../../../services/espejoDeJornales'
import { registrarTarifaDesdeLaQuincena } from '../../../services/tarifaDeLaQuincenaActions'

/** Quien cobra por debajo del básico de su convenio. Lo arma `exponerAlPiso`; la celda sólo lo dibuja. */
export interface MarcaDePiso {
  brechaPct: number
  diferenciaHora: number
  piso: number
  desde: string
  categoria: string
}

/** `oficial_especializado` → «Oficial especializado». El legajo guarda la clave; el texto es para leer. */
export const rotuloCategoria = (c: string): string => {
  const t = c.replace(/_/g, ' ').trim()
  return t.charAt(0).toUpperCase() + t.slice(1)
}

const corta = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`

/** «$ 6.100,50» → 6100.5. `null` si no es un número positivo: la celda no guarda basura. */
function importeTecleado(texto: string): number | null {
  const n = Number(texto.trim().replace(/[$\s.]/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

type Paso = { tipo: 'leyendo' } | { tipo: 'escribiendo'; texto: string } | { tipo: 'confirmando'; valor: number }

export function CeldaTarifa({ fila, quincena, piso, abrirHistorial }: {
  fila: FilaDelEspejo
  quincena: { desde: string; hasta: string }
  piso?: MarcaDePiso
  abrirHistorial: () => void
}) {
  const l = fila.linea
  const forma = formaEditable(fila.grupo)
  const actual = forma === 'mensual' ? l.netoMensual : (forma === 'hora' ? l.valorHora : (l.valorHora ?? l.netoMensual))
  const editable = forma != null && !fila.cerrada
  const [paso, setPaso] = useState<Paso>({ tipo: 'leyendo' })
  const [error, setError] = useState<string | null>(null)
  const [guardando, empezar] = useTransition()

  const aConfirmar = (texto: string) => {
    const valor = importeTecleado(texto)
    if (texto.trim() === '' || valor === actual) { setPaso({ tipo: 'leyendo' }); return }
    if (valor == null) { setError('Escribí un importe mayor a cero.'); return }
    setError(null)
    setPaso({ tipo: 'confirmando', valor })
  }

  const confirmar = (valor: number) => {
    if (forma == null) return
    empezar(async () => {
      const r = await registrarTarifaDesdeLaQuincena({
        ...quincena, grupo: fila.grupo, persona_id: fila.personaId, forma, valor,
      })
      if (r.ok) { setError(null); setPaso({ tipo: 'leyendo' }) } else setError(r.error)
    })
  }

  const pct = paso.tipo === 'confirmando' ? pctDeAumento(actual, paso.valor) : null
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4 }}
      title={l.netoMensual != null ? `Neto mensual · ${l.origenTarifa ?? 'sin origen'}` : (l.origenTarifa ?? undefined)}>
      {paso.tipo === 'escribiendo' ? (
        <input
          autoFocus inputMode="decimal" value={paso.texto} aria-label={`Nuevo valor de ${fila.nombre}`}
          data-testid={`tarifa-input-${fila.personaId}`}
          onChange={(e) => setPaso({ tipo: 'escribiendo', texto: e.target.value })}
          onBlur={() => aConfirmar(paso.texto)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') aConfirmar(paso.texto)
            if (e.key === 'Escape') { setError(null); setPaso({ tipo: 'leyendo' }) }
          }}
          style={{
            width: 88, height: 28, textAlign: 'right', fontSize: '12.5px', padding: '0 6px',
            border: `1px solid ${error ? V.neg : V.grafito}`, borderRadius: 4, background: '#FFFFFF',
            color: V.tinta, fontVariantNumeric: 'tabular-nums',
          }}
        />
      ) : (
        <Valor fila={fila} actual={actual} piso={piso} editable={editable}
          alEntrar={() => setPaso({ tipo: 'escribiendo', texto: actual == null ? '' : String(actual) })} />
      )}
      <button type="button" onClick={abrirHistorial} data-testid={`tarifa-historial-${fila.personaId}`}
        aria-label={`Historial del valor hora de ${fila.nombre}`} title="Historial del valor hora"
        style={{
          width: 20, height: 20, border: 0, borderRadius: 4, background: 'transparent', cursor: 'pointer',
          color: V.tenue, fontSize: '12px', lineHeight: 1, padding: 0,
        }}>⋯</button>
      {(paso.tipo === 'confirmando' || error) && (
        <div data-testid={`tarifa-confirmar-${fila.personaId}`} style={{
          position: 'absolute', top: '100%', right: 0, zIndex: 5, marginTop: 4, width: 248,
          padding: 8, background: '#FFFFFF', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6,
          fontSize: '12px', color: V.tinta, textAlign: 'left', whiteSpace: 'normal',
        }}>
          {paso.tipo === 'confirmando' && (
            <div style={{ marginBottom: 8 }}>
              <strong>{pesos(paso.valor)}{forma === 'mensual' ? ' mensual' : '/h'}</strong>
              {` desde el ${corta(quincena.desde)}`}
              {pct != null && (
                <span style={{ color: pct < 0 ? V.neg : V.apagado }}>{` · ${pct > 0 ? '+' : ''}${pct.toLocaleString('es-AR')}%`}</span>
              )}
            </div>
          )}
          {error && <div style={{ color: V.neg, marginBottom: 8 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" onClick={() => { setError(null); setPaso({ tipo: 'leyendo' }) }}
              style={{ border: 0, background: 'transparent', color: V.apagado, cursor: 'pointer', fontSize: '12px' }}>
              Cancelar
            </button>
            {paso.tipo === 'confirmando' && (
              <button type="button" disabled={guardando} onClick={() => confirmar(paso.valor)}
                data-testid={`tarifa-ok-${fila.personaId}`}
                style={{
                  border: 0, borderRadius: 4, padding: '4px 12px', background: V.grafito, color: '#FFFFFF',
                  fontWeight: 600, fontSize: '12px', cursor: guardando ? 'wait' : 'pointer',
                }}>{guardando ? 'Guardando…' : 'Confirmar'}</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/** El importe en reposo, con la marca «bajo el básico» cuando corresponde. */
function Valor({ fila, actual, piso, editable, alEntrar }: {
  fila: FilaDelEspejo; actual: number | null; piso?: MarcaDePiso; editable: boolean; alEntrar: () => void
}) {
  const texto = actual == null ? 'sin tarifa' : pesos(actual)
  const contenido = piso ? (
    // BAJO EL BÁSICO DEL CONVENIO: el % en rojo al lado del $/h, y el piso con su fecha al pasar.
    // Rojo sólo para problemas (skill de diseño §2): cobrar debajo del convenio es riesgo laboral.
    <span data-testid={`espejo-bajo-piso-${fila.personaId}`} style={{ whiteSpace: 'nowrap' }}
      title={`Bajo el básico UOCRA: ${rotuloCategoria(piso.categoria)} ${pesos(piso.piso)}/h desde ${piso.desde}. Faltan ${pesos(piso.diferenciaHora)}/h.`}>
      <span>{texto}</span>
      <span style={{ color: V.neg, fontSize: '10.5px', fontWeight: 600, marginLeft: 4 }}>
        {`${Math.round(piso.brechaPct)}%`}
      </span>
    </span>
  ) : <span style={{ whiteSpace: 'nowrap', color: actual == null ? V.tenue : undefined }}>{texto}</span>
  if (!editable) return <span style={{ color: V.apagado }}>{contenido}</span>
  return (
    <button type="button" onClick={alEntrar} data-testid={`tarifa-${fila.personaId}`}
      aria-label={`Cambiar el valor de ${fila.nombre}`}
      style={{
        minHeight: 28, padding: '0 6px', border: `1px solid ${V.lineaFuerte}`, borderRadius: 4,
        background: '#FFFFFF', color: V.tinta, cursor: 'text', fontSize: '12.5px',
        fontVariantNumeric: 'tabular-nums',
      }}>{contenido}</button>
  )
}
