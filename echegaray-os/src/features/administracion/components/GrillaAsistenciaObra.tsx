'use client'

import { Fragment, useState, useTransition } from 'react'
import Link from 'next/link'
import { V } from '@/shared/components/v2/patron'
import { hs, leerHoras } from '../services/jornadaPorObra'
import type { CeldaObra, FilaQuincena } from '../services/quincenaPorObra'
import { SIN_OBRA } from '../services/quincenaPorObra'
import { guardarJornada } from '../services/jornadaPorObraActions'
import { cambiarObraActual } from '../services/obraActualActions'
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
//
// ═══ UN DÍA REPARTIDO EN DOS OBRAS NO SE EDITA EN LA CELDA ═══
//
// La fila es la persona y la celda es la SUMA del día. Cuando ese día tiene dos obras, escribir un
// número obligaría a elegir a cuál de las dos se le imputa —y elegirla en silencio mueve el costo
// de mano de obra de una obra a otra sin que nadie lo decida—. Esas celdas muestran el total con un
// punto al lado y se corrigen desde el panel, que enseña el desglose antes de tocar nada.

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
  if (estado === 'futuro') return { texto: '', color: V.inerte, punteada: false }
  return { texto: '', color: ROJO, punteada: true }
}

export function GrillaAsistenciaObra({
  filas, dias, etiquetas, titulos, columnasTenues, totalesDia, total, jornadaPorObra, obras,
  puedeCorregir, puedeCambiarObra,
}: {
  filas: FilaQuincena[]
  dias: string[]
  /** `L 1`, `M 2`… Una por día de la quincena. */
  etiquetas: string[]
  /** El nombre completo del día, para el `title` de la columna: `L` y `M` solas son ambiguas. */
  titulos: string[]
  /** Fin de semana o feriado. Es del día, no de la persona: la columna entera se apaga. */
  columnasTenues: boolean[]
  totalesDia: (number | null)[]
  /** `null` cuando nadie declaró una hora. Un `0` afirmaría que la empresa trabajó cero. */
  total: number | null
  jornadaPorObra: Record<string, number>
  /** Las obras a las que se puede mover un día. Vienen del servidor con el RLS ya aplicado. */
  obras: ObraElegible[]
  /** Sólo Administración corrige la obra de un día. La puerta de verdad es la policy; esto evita
   *  ofrecer un botón que va a rebotar contra un `permission denied`. */
  puedeCorregir: boolean
  /** SEPARADO DE `puedeCorregir` A PROPÓSITO (dueño, 08/09/2026): el jefe de obra corrige la
   *  jornada —es su trabajo— pero NO mueve gente de obra. Son dos permisos distintos sobre la misma
   *  grilla, y unirlos en uno le daría al jefe el desplegable. La puerta es la acción. */
  puedeCambiarObra: boolean
}) {
  const [borradores, setBorradores] = useState<Record<string, string>>({})
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [corrigiendo, setCorrigiendo] = useState<string | null>(null)
  const [copia, setCopia] = useState<FilaQuincena | null>(null)
  // EL ACUSE ES POR PERSONA Y ES LO QUE DIJO LA BASE, no lo que se pidió: la acción devuelve el
  // texto ya armado con los nombres de las dos obras.
  const [acuses, setAcuses] = useState<Record<string, { texto: string; error: boolean }>>({})
  const [cambiando, setCambiando] = useState<string | null>(null)
  const [, arrancar] = useTransition()

  const cambiarObra = (fila: FilaQuincena, valor: string) => {
    if ((fila.obraPorDefecto?.id ?? '') === valor) return
    setCambiando(fila.clave)
    setAcuses((a) => { const n = { ...a }; delete n[fila.clave]; return n })
    arrancar(async () => {
      const r = await cambiarObraActual({ persona_id: fila.persona.id, obra_id: valor || null })
      setCambiando(null)
      setAcuses((a) => ({
        ...a,
        [fila.clave]: r.ok ? { texto: r.mensaje, error: false } : { texto: r.error, error: true },
      }))
    })
  }

  const claveDe = (fila: FilaQuincena, fecha: string) => `${fila.clave}·${fecha}`

  const guardar = (fila: FilaQuincena, celda: CeldaObra, bruto: string) => {
    const k = claveDe(fila, celda.fecha)
    const original = textoDe(celda)
    if (bruto.trim() === original.trim()) return
    // A QUÉ OBRA SE IMPUTA. La del tramo que ya existe ese día si hay uno solo —corregir no cambia
    // de obra—, y si no la obra activa de la persona. Sin ninguna de las dos no hay destino y no se
    // escribe: elegir una sería mover el costo de mano de obra sin que nadie lo decida.
    const destino = celda.tramos.length === 1
      ? { id: celda.tramos[0].obra_id, nombre: celda.tramos[0].nombre }
      : fila.obraPorDefecto
    if (!destino) {
      setErrores((e) => ({ ...e, [k]: 'Esa persona no tiene obra activa: la corrección se hace desde el panel' }))
      return
    }
    const letra = bruto.trim().toUpperCase()
    if (letra === 'A') {
      const jornada = jornadaPorObra[destino.id] ?? 0
      if (jornada <= 0) {
        setErrores((e) => ({ ...e, [k]: 'Esa obra no tiene jornada pactada: la ausencia no se puede medir' }))
        return
      }
      enviar(destino.id, celda.fecha, { persona_id: fila.persona.id, estado: 'ausente', horas: jornada }, k)
      return
    }
    const { horas, error } = leerHoras(bruto)
    if (error) { setErrores((e) => ({ ...e, [k]: error })); return }
    // En blanco NO borra: dejar de escribir no es una decisión de nadie. Borrar una jornada
    // cargada es un acto y necesita su propia puerta, que esta pantalla todavía no tiene.
    if (horas === null) { setBorradores((b) => ({ ...b, [k]: original })); return }
    enviar(destino.id, celda.fecha, { persona_id: fila.persona.id, estado: 'presente', horas }, k)
  }

  const enviar = (
    obraId: string,
    fecha: string,
    marca: { persona_id: string; estado: 'presente' | 'ausente'; horas: number },
    k: string,
  ) => {
    setErrores((e) => { const n = { ...e }; delete n[k]; return n })
    arrancar(async () => {
      const r = await guardarJornada({ obra_id: obraId, fecha, marcas: [marca] })
      if (!r.ok) setErrores((e) => ({ ...e, [k]: r.error }))
    })
  }

  // ═══ EL PANEL NO SE DESMONTA CUANDO LA FILA DESAPARECE ═══
  //
  // «Sacar lo cargado» sobre alguien sin asignación vigente lo saca de `filas`: la persona ya no
  // tiene ni asignación ni registros, así que la grilla deja de dibujarla. Con el panel atado sólo
  // a `filas`, `abierta` pasaba a `null`, React lo desmontaba y se llevaba el acuse de la escritura
  // que acababa de ocurrir. El usuario ve desaparecer el panel y no sabe si guardó.
  // La copia se toma AL ABRIR, en el propio clic. Mientras la fila siga existiendo manda la viva
  // —el panel ve el dato recién releído—; la copia sólo entra cuando la fila desapareció, y ahí lo
  // que muestra es su último estado conocido, que es todo lo que queda de ella. Un efecto que
  // sincronizara la copia en cada render encadenaría renders por nada.
  const viva = puedeCorregir ? (filas.find((f) => f.clave === corrigiendo) ?? null) : null
  const abierta = corrigiendo === null
    ? null
    : (viva ?? (copia?.clave === corrigiendo ? copia : null))

  return (
    <>
    {/* EL PANEL NO TAPA LA COLUMNA HORAS. Con el drawer abierto la grilla se reserva su ancho a la
        derecha desde 1024px: las quince columnas y el total siguen a la vista mientras se corrige,
        que es justo lo que hay que mirar. Abajo de 1024 el panel va entero encima — no hay ancho
        para dos zonas y reservar 400px dejaría la tabla en 0. */}
    <div className={abierta ? 'lg:pr-[400px]' : undefined} style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }} data-testid="grilla-asistencia">
        <thead>
          <tr style={{ borderBottom: `1px solid ${V.lineaFuerte}` }}>
            <Rotulo ancho="34%">Persona</Rotulo>
            {/* «ACTUAL» porque la obra de una persona cambia con el tiempo: acá se ve la de hoy; la de
                cada día queda guardada en su marca y se lee en la cronología de la persona (ficha → Horas). */}
            <Rotulo ancho="18%">Obra actual</Rotulo>
            {etiquetas.map((e, i) => (
              <Rotulo key={dias[i]} centro tenue={columnasTenues[i]} titulo={titulos[i]}>{e}</Rotulo>
            ))}
            <Rotulo derecha>Horas</Rotulo>
            {puedeCorregir && <Rotulo />}
          </tr>
        </thead>
        <tbody>
          {filas.map((fila) => (
            <Fragment key={fila.clave}>
            <tr style={{ borderBottom: `1px solid ${V.lineaFila}` }} data-testid="fila-quincena">
              <td style={{ padding: '7px 8px 7px 0', verticalAlign: 'top' }}>
                {/* EL NOMBRE ES LA PUERTA A SU CARPETA. El dueño: *"cada persona debe tener su
                    cronología de trabajo en su propia carpeta, no que se tiene que mostrar todo de
                    todos en la pantalla asistencia"*. Esta grilla es SÓLO la quincena elegida; el
                    año entero —lo importado de JORNALES incluido— vive en la ficha. */}
                <Link href={`/administracion/personas/${fila.persona.id}?v=horas`} prefetch={false}
                  data-testid="link-ficha-persona" style={{ color: V.tinta }}>
                  {fila.persona.nombre}
                </Link>
                <span style={{ display: 'block', fontSize: '11.5px', color: V.apagado }}>
                  {fila.persona.nota ?? ''}
                </span>
              </td>
              <td data-testid="celda-obra" style={{ padding: '7px 8px', color: V.apagado, verticalAlign: 'top' }}>
                {/* ═══ UN DESPLEGABLE, NO UN FORMULARIO (pedido del dueño, 08/09/2026) ═══
                    Elegir otra obra cambia la asignación vigente DESDE HOY: cierra la anterior y
                    abre la nueva. No pide rol, ni cuadrilla, ni actividad, ni fechas — eso es lo
                    que hacía la asignación imposible de entender. Lo que no se pregunta tiene un
                    valor honesto: rol «integrante» y desde hoy. */}
                {puedeCambiarObra ? (
                  <select
                    data-testid="select-obra-actual"
                    aria-label={`Obra actual de ${fila.persona.nombre}`}
                    value={fila.obraPorDefecto?.id ?? ''}
                    disabled={cambiando === fila.clave}
                    onChange={(e) => cambiarObra(fila, e.target.value)}
                    style={{
                      width: '100%', maxWidth: 210, fontSize: '12.5px', color: V.tinta,
                      background: 'transparent', border: `1px solid ${V.linea}`, borderRadius: 5,
                      padding: '3px 4px', opacity: cambiando === fila.clave ? 0.5 : 1,
                    }}
                  >
                    <option value="">Sin obra</option>
                    {obras.map((o) => (
                      <option key={o.id} value={o.id}>{o.nombre}</option>
                    ))}
                  </select>
                ) : (
                  fila.rotuloObra
                )}
                {/* SIN ASIGNACIÓN PERO CON HORAS. El desplegable dice «Sin obra» —que es la verdad
                    de la asignación—, y esta línea dice dónde están sus horas, que es el otro dato
                    real y el que explica por qué la persona aparece en la grilla. */}
                {puedeCambiarObra && !fila.obraPorDefecto && fila.rotuloObra !== SIN_OBRA && (
                  <span style={{ display: 'block', fontSize: '11px', color: V.tenue, marginTop: 2 }}>
                    horas en {fila.rotuloObra}
                  </span>
                )}
              </td>

              {fila.celdas.map((celda, i) => {
                const k = claveDe(fila, celda.fecha)
                const valor = borradores[k] ?? textoDe(celda)
                const hueco = vacioDe(celda.estado)
                const repartido = celda.tramos.length > 1
                const editable = celda.estado !== 'no_laborable' && celda.estado !== 'futuro'
                  && !repartido && (fila.obraPorDefecto !== null || celda.tramos.length === 1)
                return (
                  <td key={celda.fecha} style={{
                    padding: '4px 2px', textAlign: 'center', verticalAlign: 'top',
                    background: columnasTenues[i] ? V.fondo : undefined,
                  }}>
                    {editable ? (
                      <input
                        aria-label={`${fila.persona.nombre} · ${fila.rotuloObra} · ${celda.fecha}`}
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
                      <span
                        data-testid="celda-fija"
                        data-estado={celda.estado}
                        title={repartido ? celda.tramos.map((t) => `${t.nombre}: ${t.horas === null ? 'no vino' : `${hs(t.horas)} hs`}`).join(' · ') : undefined}
                        style={{ color: celda.estado === 'horas' ? V.tinta : hueco.color }}
                      >
                        {celda.estado === 'horas' ? hs(celda.horas ?? 0) : hueco.texto}
                      </span>
                    )}
                    {repartido && (
                      <span data-testid="celda-repartida" title={`${celda.tramos.length} obras ese día`}
                        style={{ display: 'block', fontSize: '9px', color: V.tenue, lineHeight: 1 }}>
                        ●
                      </span>
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
                    onClick={() => {
                      setCopia(fila)
                      setCorrigiendo(corrigiendo === fila.clave ? null : fila.clave)
                    }}
                    style={{ fontSize: '11.5px', color: corrigiendo === fila.clave ? V.tinta : V.apagado }}
                  >
                    corregir
                  </button>
                </td>
              )}
            </tr>
            {/* EL ACUSE VA DEBAJO DE LA FILA Y NO EN LA CELDA: «Desde hoy en SALÓN COMERCIAL · antes
                PISOS INDUSTRIALES» no entra en una columna del 18% sin partirse en cinco renglones.
                Queda hasta el próximo cambio: quien lo hizo tiene que poder leerlo después de que
                la fila se refrescó. */}
            {acuses[fila.clave] && (
              <tr data-testid="acuse-obra-actual">
                <td colSpan={dias.length + (puedeCorregir ? 4 : 3)} style={{
                  padding: '0 0 7px', fontSize: '11.5px',
                  color: acuses[fila.clave].error ? ROJO : V.apagado,
                }}>
                  {acuses[fila.clave].texto}
                </td>
              </tr>
            )}
            </Fragment>
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
            <td data-testid="total-quincena-valor" style={{
              padding: '8px 0 8px 8px', textAlign: 'right', fontWeight: 600,
              fontVariantNumeric: 'tabular-nums', color: total === null ? V.inerte : V.tinta,
            }}>
              {total === null ? '—' : hs(total)}
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
        jornadaPorObra={jornadaPorObra}
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
