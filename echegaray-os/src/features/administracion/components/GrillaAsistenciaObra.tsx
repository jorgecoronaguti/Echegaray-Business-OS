'use client'

import { useState, useTransition } from 'react'
import { V } from '@/shared/components/v2/patron'
import { leerHoras } from '../services/jornadaPorObra'
import type { CeldaObra, FilaSemanaObra } from '../services/semanaPorObra'
import { guardarJornada } from '../services/jornadaPorObraActions'

// 02 · LA SEMANA, POR OBRA. La misma jornada que el jefe carga en el teléfono, a la distancia de
// Administración: una fila por par (persona, obra) y una columna por día.
//
// ═══ CADA CELDA SE EDITA Y GUARDA AL SALIR DEL CAMPO ═══
//
// No hay botón de guardar. Cada celda es una jornada de una persona en una obra en un día — la
// misma unidad que escribe `/campo/asistencia` y con la misma acción. Un «Guardar todo» abajo
// obligaría a mandar 200 celdas para corregir una, y a decidir qué hacer con las 199 que nadie tocó.
//
// ═══ LOS SILENCIOS NO SE ESCRIBEN SOLOS ═══
//
// Una celda vacía se deja vacía: salir de ella sin escribir nada no guarda nada. Sólo un número
// escribe, y sólo esa celda.

const ROJO = '#B42318'

function textoDe(c: CeldaObra): string {
  if (c.estado === 'horas') return String(c.horas ?? '')
  if (c.estado === 'ausente') return 'A'
  return ''
}

/** Qué se ve cuando la celda no tiene horas ni ausencia. Cada silencio con su cara. */
function vacioDe(estado: CeldaObra['estado']): { texto: string; color: string; punteada: boolean } {
  if (estado === 'no_laborable') return { texto: '—', color: V.inerte, punteada: false }
  if (estado === 'sin_dato') return { texto: '—', color: V.inerte, punteada: false }
  if (estado === 'otra_obra') return { texto: '·', color: V.inerte, punteada: false }
  if (estado === 'futuro') return { texto: '', color: V.inerte, punteada: false }
  return { texto: '', color: ROJO, punteada: true }
}

export function GrillaAsistenciaObra({ filas, dias, etiquetas, totalesDia, total, jornadaPorObra }: {
  filas: FilaSemanaObra[]
  dias: string[]
  etiquetas: string[]
  totalesDia: (number | null)[]
  total: number
  jornadaPorObra: Record<string, number>
}) {
  const [borradores, setBorradores] = useState<Record<string, string>>({})
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [, arrancar] = useTransition()

  const claveDe = (fila: FilaSemanaObra, fecha: string) => `${fila.clave}·${fecha}`

  const guardar = (fila: FilaSemanaObra, celda: CeldaObra, bruto: string) => {
    const k = claveDe(fila, celda.fecha)
    const original = textoDe(celda)
    if (bruto.trim() === original.trim()) return
    const letra = bruto.trim().toUpperCase()
    if (letra === 'A') {
      const jornada = jornadaPorObra[fila.obra.id] ?? 0
      if (jornada <= 0) {
        setErrores((e) => ({ ...e, [k]: 'Esa obra no tiene jornada pactada: la ausencia no se puede medir' }))
        return
      }
      enviar(fila, celda.fecha, { persona_id: fila.persona.id, estado: 'ausente', horas: jornada }, k)
      return
    }
    const { horas, error } = leerHoras(bruto)
    if (error) { setErrores((e) => ({ ...e, [k]: error })); return }
    // En blanco NO borra: dejar de escribir no es una decisión de nadie. Borrar una jornada
    // cargada es un acto y necesita su propia puerta, que esta pantalla todavía no tiene.
    if (horas === null) { setBorradores((b) => ({ ...b, [k]: original })); return }
    enviar(fila, celda.fecha, { persona_id: fila.persona.id, estado: 'presente', horas }, k)
  }

  const enviar = (
    fila: FilaSemanaObra,
    fecha: string,
    marca: { persona_id: string; estado: 'presente' | 'ausente'; horas: number },
    k: string,
  ) => {
    setErrores((e) => { const n = { ...e }; delete n[k]; return n })
    arrancar(async () => {
      const r = await guardarJornada({ obra_id: fila.obra.id, fecha, marcas: [marca] })
      if (!r.ok) setErrores((e) => ({ ...e, [k]: r.error }))
    })
  }

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }} data-testid="grilla-asistencia">
        <thead>
          <tr style={{ borderBottom: `1px solid ${V.lineaFuerte}` }}>
            <Rotulo ancho="34%">Persona</Rotulo>
            <Rotulo ancho="18%">Obra</Rotulo>
            {etiquetas.map((e) => <Rotulo key={e} centro>{e}</Rotulo>)}
            <Rotulo derecha>Horas</Rotulo>
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.clave} style={{ borderBottom: `1px solid ${V.lineaFila}` }} data-testid="fila-semana">
              <td style={{ padding: '7px 8px 7px 0', verticalAlign: 'top' }}>
                <span style={{ color: fila.repetida ? V.apagado : V.tinta }}>{fila.persona.nombre}</span>
                <span style={{ display: 'block', fontSize: '11.5px', color: fila.repetida ? V.tenue : V.apagado }}>
                  {fila.repetida ? 'la misma persona, la otra obra' : (fila.persona.nota ?? '')}
                </span>
              </td>
              <td style={{ padding: '7px 8px', color: V.apagado, verticalAlign: 'top' }}>{fila.obra.nombre}</td>

              {fila.celdas.map((celda) => {
                const k = claveDe(fila, celda.fecha)
                const valor = borradores[k] ?? textoDe(celda)
                const hueco = vacioDe(celda.estado)
                const editable = celda.estado !== 'no_laborable' && celda.estado !== 'futuro'
                return (
                  <td key={celda.fecha} style={{ padding: '4px 2px', textAlign: 'center', verticalAlign: 'top' }}>
                    {editable ? (
                      <input
                        aria-label={`${fila.persona.nombre} · ${fila.obra.nombre} · ${celda.fecha}`}
                        data-testid="celda-hora"
                        data-estado={celda.estado}
                        value={valor}
                        placeholder={hueco.texto}
                        onChange={(e) => setBorradores((b) => ({ ...b, [k]: e.target.value }))}
                        onBlur={(e) => guardar(fila, celda, e.target.value)}
                        style={{
                          width: 44, height: 28, textAlign: 'center', fontSize: '13px',
                          color: celda.estado === 'ausente' ? V.tinta : V.tintaSuave,
                          background: celda.estado === 'ausente' ? V.lineaFila : 'transparent',
                          border: errores[k]
                            ? `1px solid ${ROJO}`
                            : celda.estado === 'sin_marcar' ? `1px dashed ${ROJO}` : '1px solid transparent',
                          borderRadius: 5,
                        }}
                      />
                    ) : (
                      <span style={{ color: hueco.color }}>{hueco.texto}</span>
                    )}
                    {errores[k] && (
                      <span style={{ display: 'block', fontSize: '10.5px', color: ROJO, maxWidth: 90 }}>
                        {errores[k]}
                      </span>
                    )}
                  </td>
                )
              })}

              <td style={{
                padding: '7px 0 7px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                color: fila.reclama.length > 0 ? ROJO : V.tinta,
              }}>
                {fila.horas}
              </td>
            </tr>
          ))}

          <tr style={{ borderTop: `1px solid ${V.lineaFuerte}` }} data-testid="total-semana">
            <td colSpan={2} style={{ padding: '8px 8px 8px 0', color: V.apagado }}>Total de la semana</td>
            {totalesDia.map((t, i) => (
              <td key={dias[i]} style={{
                padding: '8px 2px', textAlign: 'center', fontVariantNumeric: 'tabular-nums',
                color: t === null ? V.inerte : V.tinta,
              }}>
                {t === null ? '—' : t}
              </td>
            ))}
            <td style={{ padding: '8px 0 8px 8px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {total}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function Rotulo({ children, ancho, centro, derecha }: {
  children?: React.ReactNode; ancho?: string; centro?: boolean; derecha?: boolean
}) {
  return (
    <th style={{
      width: ancho,
      padding: '0 2px 8px',
      textAlign: derecha ? 'right' : centro ? 'center' : 'left',
      fontSize: '11px', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
      color: V.tenue, height: 30,
    }}>
      {children}
    </th>
  )
}
