'use client'

import { useState, useTransition } from 'react'
import { V } from '@/shared/components/v2/patron'
import { hs, leerHoras } from '../services/jornadaPorObra'
import type { CeldaObra, FilaQuincenaObra } from '../services/quincenaPorObra'
import { guardarJornada } from '../services/jornadaPorObraActions'
import { PanelCorreccionJornada, type ObraElegible } from './PanelCorreccionJornada'

// 02 · LA QUINCENA, POR OBRA. La misma jornada que el jefe carga en el teléfono, a la distancia de
// Administración: una fila por par (persona, obra) y una columna por día del período que se paga.
//
// ═══ LOS DÍAS QUE NO SE TRABAJAN SE VEN, PERO APAGADOS ═══
//
// Con quince o dieciséis columnas, los fines de semana son casi un tercio de la grilla. Sacarlos
// escondería el sábado trabajado —que existe y se paga—, así que se dibujan con la columna en el
// fondo hundido: presentes, sin competir por la lectura. Qué columna va apagada lo decide el
// servidor (`columnasTenues`) y no la celda: es una propiedad del DÍA, no de lo que hizo cada uno.
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
  if (c.estado === 'horas') return c.horas === null ? '' : hs(c.horas)
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

export function GrillaAsistenciaObra({
  filas, dias, etiquetas, titulos, columnasTenues, totalesDia, total, jornadaPorObra, obras,
  puedeCorregir,
}: {
  filas: FilaQuincenaObra[]
  dias: string[]
  /** `L 1`, `M 2`… Una por día de la quincena. */
  etiquetas: string[]
  /** El nombre completo del día, para el `title` de la columna: `L` y `M` solas son ambiguas. */
  titulos: string[]
  /** Fin de semana o feriado. Es del día, no de la persona: la columna entera se apaga. */
  columnasTenues: boolean[]
  totalesDia: (number | null)[]
  total: number
  jornadaPorObra: Record<string, number>
  /** Las obras a las que se puede mover un día. Vienen del servidor con el RLS ya aplicado. */
  obras: ObraElegible[]
  /** Sólo Administración corrige la obra de un día. La puerta de verdad es la policy; esto evita
   *  ofrecer un botón que va a rebotar contra un `permission denied`. */
  puedeCorregir: boolean
}) {
  const [borradores, setBorradores] = useState<Record<string, string>>({})
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [corrigiendo, setCorrigiendo] = useState<string | null>(null)
  const [, arrancar] = useTransition()

  const claveDe = (fila: FilaQuincenaObra, fecha: string) => `${fila.clave}·${fecha}`

  const guardar = (fila: FilaQuincenaObra, celda: CeldaObra, bruto: string) => {
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
    fila: FilaQuincenaObra,
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

  const abierta = puedeCorregir ? (filas.find((f) => f.clave === corrigiendo) ?? null) : null

  return (
    <>
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }} data-testid="grilla-asistencia">
        <thead>
          <tr style={{ borderBottom: `1px solid ${V.lineaFuerte}` }}>
            <Rotulo ancho="34%">Persona</Rotulo>
            <Rotulo ancho="18%">Obra</Rotulo>
            {etiquetas.map((e, i) => (
              <Rotulo key={dias[i]} centro tenue={columnasTenues[i]} titulo={titulos[i]}>{e}</Rotulo>
            ))}
            <Rotulo derecha>Horas</Rotulo>
            {puedeCorregir && <Rotulo />}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <tr key={fila.clave} style={{ borderBottom: `1px solid ${V.lineaFila}` }} data-testid="fila-quincena">
              <td style={{ padding: '7px 8px 7px 0', verticalAlign: 'top' }}>
                <span style={{ color: fila.repetida ? V.apagado : V.tinta }}>{fila.persona.nombre}</span>
                <span style={{ display: 'block', fontSize: '11.5px', color: fila.repetida ? V.tenue : V.apagado }}>
                  {fila.repetida ? 'la misma persona, la otra obra' : (fila.persona.nota ?? '')}
                </span>
              </td>
              <td style={{ padding: '7px 8px', color: V.apagado, verticalAlign: 'top' }}>{fila.obra.nombre}</td>

              {fila.celdas.map((celda, i) => {
                const k = claveDe(fila, celda.fecha)
                const valor = borradores[k] ?? textoDe(celda)
                const hueco = vacioDe(celda.estado)
                const editable = celda.estado !== 'no_laborable' && celda.estado !== 'futuro'
                return (
                  <td key={celda.fecha} style={{
                    padding: '4px 2px', textAlign: 'center', verticalAlign: 'top',
                    background: columnasTenues[i] ? V.fondo : undefined,
                  }}>
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
                color: fila.reclama.length > 0 ? ROJO : fila.horas === null ? V.inerte : V.tinta,
              }}>
                {/* `—` Y NO `0`: cero afirma que trabajó cero horas esa quincena; lo que hay es que
                    nadie declaró ninguna. */}
                {fila.horas === null ? '—' : hs(fila.horas)}
              </td>
              {puedeCorregir && (
                <td style={{ padding: '7px 0 7px 10px', textAlign: 'right' }}>
                  <button
                    type="button"
                    data-testid="abrir-correccion"
                    onClick={() => setCorrigiendo(corrigiendo === fila.clave ? null : fila.clave)}
                    style={{ fontSize: '11.5px', color: corrigiendo === fila.clave ? V.tinta : V.apagado }}
                  >
                    corregir
                  </button>
                </td>
              )}
            </tr>
          ))}

          <tr style={{ borderTop: `1px solid ${V.lineaFuerte}` }} data-testid="total-quincena">
            <td colSpan={2} style={{ padding: '8px 8px 8px 0', color: V.apagado }}>Total de la quincena</td>
            {totalesDia.map((t, i) => (
              <td key={dias[i]} style={{
                padding: '8px 2px', textAlign: 'center', fontVariantNumeric: 'tabular-nums',
                color: t === null ? V.inerte : V.tinta,
                background: columnasTenues[i] ? V.fondo : undefined,
              }}>
                {t === null ? '—' : hs(t)}
              </td>
            ))}
            <td style={{ padding: '8px 0 8px 8px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
              {hs(total)}
            </td>
            {puedeCorregir && <td />}
          </tr>
        </tbody>
      </table>
    </div>

    {/* FUERA DEL CONTENEDOR CON `overflow-x`. Un `position: fixed` adentro de un elemento que
        scrollea de costado se arrastra con el scroll en cuanto aparece un ancestro con
        `transform`: el panel quedaría a mitad de camino de la pantalla sin que nadie lo vea venir. */}
    {abierta && (
      <PanelCorreccionJornada
        fila={abierta}
        dias={dias}
        etiquetas={etiquetas}
        obras={obras}
        jornada={jornadaPorObra[abierta.obra.id] ?? 0}
        alCerrar={() => setCorrigiendo(null)}
      />
    )}
    </>
  )
}

function Rotulo({ children, ancho, centro, derecha, tenue, titulo }: {
  children?: React.ReactNode; ancho?: string; centro?: boolean; derecha?: boolean
  tenue?: boolean; titulo?: string
}) {
  return (
    <th title={titulo} style={{
      width: ancho,
      padding: '0 2px 8px',
      textAlign: derecha ? 'right' : centro ? 'center' : 'left',
      fontSize: '11px', fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
      color: V.tenue, height: 30,
      background: tenue ? V.fondo : undefined,
    }}>
      {children}
    </th>
  )
}
