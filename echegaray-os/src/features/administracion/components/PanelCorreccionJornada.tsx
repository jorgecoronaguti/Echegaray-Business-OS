'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Aviso, Boton, CAMPO, Campo, ChipsValor, Drawer, ErrorCampo } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { hs, leerHoras } from '../services/jornadaPorObra'
import { corregirJornada } from '../services/jornadaPorObraActions'
import { motivosDeDiaNoTrabajado } from '../services/motivoDeAusencia'
import { obraDestinoInicial } from '../services/destinoInicial'
import { jornadaDeReferenciaVisible, restoDeLaSemana, topeDelTramo } from '../services/ausenciaDeLaPersona'
import { jornadaPorDefecto } from '../services/jornadaPorDefecto'
import type { CeldaObra, FilaQuincena } from '../services/quincenaPorObra'

// EL ADMINISTRADOR CORRIGE TODO — el día de una persona: su obra, sus horas, si no vino, o sacarlo.
//
// ═══ POR QUÉ UN PANEL Y NO UN CONTROL MÁS EN CADA CELDA ═══
//
// La celda ya edita las horas al vuelo, que es el 95 % de las correcciones. Meterle además un
// selector de obra, un botón de ausencia y uno de borrar serían CUATRO controles por celda y
// treinta por fila: la grilla dejaría de leerse, que es para lo que existe. Lo que se hace poco y
// pesa mucho —mover un día de obra, borrarlo— va a un lugar donde se ve entero antes de tocarlo.
//
// ═══ AL COSTADO, Y NO SE CIERRA AL GUARDAR ═══
//
// El dueño: *"la forma de editar tiene q ser q se abra esa pantalla pero al costado"*. Abajo de la
// grilla el panel empujaba la tabla y quedaba fuera de pantalla en cuanto había más de diez filas:
// había que scrollear para corregir y volver a scrollear para ver si el número cambió.
//
// Al guardar se refresca la grilla —`router.refresh()`, que vuelve a correr el server component—
// y el panel QUEDA ABIERTO con el acuse. Corregir es una tarea de varios días seguidos de la misma
// persona: cerrar el panel en el primero obligaría a volver a buscar la fila para el segundo.
//
// ═══ LA ASIGNACIÓN NO FRENA LA CORRECCIÓN, Y TAMPOCO SE CREA SOLA ═══
//
// Corregir las horas de un día entra SIEMPRE, esté o no la persona asignada a esa obra ese día
// (decisión del dueño, 08/09: «una cosa es la asistencia y otra la cantidad de horas por día»). Si
// no lo estaba, el acuse lo dice.
//
// La casilla está siempre a la vista y siempre vacía: es la única forma de CREAR la asignación, y
// esa asignación es la que después decide a qué obra se le imputa el costo de esa persona. Antes
// aparecía sólo cuando la acción rechazaba; sin rechazo, atarla a él la habría hecho inalcanzable.

type Estado = 'presente' | 'ausente' | 'borrar'

/** Hasta cuándo dura lo que se está asentando. `dia` es el default y es lo que el panel hizo hasta
 *  el 08/09/2026: un día, una fila. */
type ModoTramo = 'dia' | 'semana' | 'fecha'

const TRAMOS: { valor: string; etiqueta: string }[] = [
  { valor: 'dia', etiqueta: 'Sólo este día' },
  { valor: 'semana', etiqueta: 'Resto de la semana' },
  { valor: 'fecha', etiqueta: 'Elegir fecha' },
]

export interface ObraElegible {
  id: string
  nombre: string
}

export function PanelCorreccionJornada({ fila, dias, etiquetas, obras, jornadaPorObra, alCerrar }: {
  fila: FilaQuincena
  dias: string[]
  etiquetas: string[]
  obras: ObraElegible[]
  /** `obra_canonica.jornada_horas` por obra. Es lo que vale una ausencia en la obra elegida. */
  jornadaPorObra: Record<string, number>
  alCerrar: () => void
}) {
  const primero = fila.celdas.find((c) => c.estado === 'horas' || c.estado === 'ausente') ?? fila.celdas[0]
  const [fecha, setFecha] = useState(primero?.fecha ?? dias[0])
  const celda = fila.celdas.find((c) => c.fecha === fecha) ?? null
  const tramos = celda?.tramos ?? []
  // DE QUÉ OBRA SON LAS HORAS QUE SE ESTÁN CORRIGIENDO. Con la fila por persona, un día puede tener
  // dos tramos: sin elegir cuál, «Sacar lo cargado» borraría el que el código eligió primero.
  const [origen, setOrigen] = useState<string | null>(tramos[0]?.obra_id ?? null)
  const tramo = tramos.find((t) => t.obra_id === origen) ?? tramos[0] ?? null
  const cargado = tramo !== null

  // Sólo una obra ELEGIBLE puede ser el valor inicial: ver `obraDestinoInicial`.
  const [obraDestino, setObraDestino] = useState(
    obraDestinoInicial(tramos[0]?.obra_id, fila.obraPorDefecto?.id, obras))
  const [estado, setEstado] = useState<Estado>(tramos[0]?.ausente ? 'ausente' : 'presente')
  const [texto, setTexto] = useState(tramos[0]?.horas != null ? hs(tramos[0].horas) : '')
  // ═══ UNA AUSENCIA LLEVA HORAS, Y SE VEN (dueño, 08/09/2026 16:16) ═══
  //
  // Textual: *«las ausencias que tienen motivo registrado dan la posibilidad de que se le registre
  // hs, como pasa con los accidentes laborales»*. Antes el panel mandaba la jornada de la obra sin
  // mostrarla: quien corregía un accidente de trabajo no tenía forma de ver ni de cambiar las horas
  // que se le iban a reconocer. Nace PRELLENADO con la jornada de referencia —un campo vacío se
  // guarda vacío— y se puede editar. Vaciarlo NO registra cero: `registros_hh` exige horas > 0 y el
  // servidor vuelve a la jornada de referencia (`horasDeLaAusencia`).
  const [textoAusencia, setTextoAusencia] = useState(
    hs(horasDeLaAusenciaVisibles(fecha, celda, tramos, fila.obraPorDefecto?.id, jornadaPorObra)))
  const [asignar, setAsignar] = useState(false)
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [motivo, setMotivo] = useState<string | null>(null)
  // ═══ HASTA CUÁNDO (dueño, 08/09/2026 16:51) ═══
  //
  // Textual: *«si ya sé que no va a haber por X cantidad de días, ya puedo dejarlo asentado»*. El
  // panel corregía UN día: un parte médico de diez obligaba a abrirlo diez veces, y los días que
  // todavía no llegaron ni siquiera se podían elegir. `null` es «sólo este día» — el default, para
  // que el tramo no se asiente por descuido.
  const [hasta, setHasta] = useState<string | null>(null)
  const [modoTramo, setModoTramo] = useState<ModoTramo>('dia')
  const [pendiente, arrancar] = useTransition()
  const motivos = motivosDeDiaNoTrabajado()
  const router = useRouter()

  // AL CAMBIAR DE DÍA, EL FORMULARIO SE RELLENA CON LO DE ESE DÍA. Sin esto, elegir el jueves y
  // guardar escribiría en el jueves las horas que se estaban viendo del lunes.
  const elegirDia = (f: string) => {
    const c = fila.celdas.find((x) => x.fecha === f) ?? null
    const t = c?.tramos[0] ?? null
    setFecha(f)
    setOrigen(t?.obra_id ?? null)
    // LA MISMA REGLA QUE AL ABRIR (`obraDestinoInicial`): sólo una obra ELEGIBLE puede quedar como
    // destino. El `?? obras[0]?.id` de antes proponía una obra cualquiera cuando el día estaba
    // vacío — y con «No vino» eso le habría imputado la ausencia a la primera de la lista.
    setObraDestino(obraDestinoInicial(t?.obra_id, fila.obraPorDefecto?.id, obras))
    setEstado(t?.ausente ? 'ausente' : 'presente')
    setTexto(t?.horas != null ? hs(t.horas) : '')
    setAviso(null)
    setAsignar(false)
    // EL TRAMO NO SOBREVIVE AL CAMBIO DE DÍA. Sin esto, elegir el jueves después de haber puesto
    // «hasta el 19» asentaría un tramo que arranca donde nadie lo pidió.
    setHasta(null)
    setModoTramo('dia')
  }

  /** El chip elegido decide el «hasta»; escribir una fecha a mano cae siempre en «Elegir fecha». */
  const elegirTramo = (m: ModoTramo) => {
    setModoTramo(m)
    setHasta(m === 'dia' ? null : m === 'semana' ? restoDeLaSemana(fecha) : hasta ?? fecha)
  }

  /** Cambiar de tramo rellena el formulario con lo de ESE tramo, igual que cambiar de día. */
  const elegirOrigen = (obraId: string) => {
    const t = tramos.find((x) => x.obra_id === obraId) ?? null
    setOrigen(obraId)
    setObraDestino(obraDestinoInicial(obraId, fila.obraPorDefecto?.id, obras))
    setEstado(t?.ausente ? 'ausente' : 'presente')
    setTexto(t?.horas != null ? hs(t.horas) : '')
    setTextoAusencia(hs(horasDeLaAusenciaVisibles(fecha, celda, tramos, fila.obraPorDefecto?.id, jornadaPorObra)))
    setAviso(null)
  }

  const { horas, error } = leerHoras(texto)
  // LAS HORAS DE LA AUSENCIA SE LEEN CON EL MISMO PARSER que las trabajadas: la coma decimal, el
  // tope de 24 y el «no es un número» son la misma regla, y dos lecturas distintas del mismo campo
  // discrepan el día que se toca una.
  const ausencia = leerHoras(textoAusencia)
  const invalido = (estado === 'presente' && (error !== null || horas === null))
    || (estado === 'ausente' && ausencia.error !== null)

  const guardar = () => {
    setAviso(null)
    arrancar(async () => {
      const r = await corregirJornada({
        persona_id: fila.persona.id,
        fecha,
        // ORIGEN: de dónde salen HOY las horas. `null` cuando el día no tiene nada cargado — sin
        // origen no hay movimiento, y un borrado sin origen barrería filas de otras obras.
        obra_origen: tramo?.obra_id ?? null,
        // LA OBRA NO SE USA CUANDO NO VINO. Una ausencia es de la PERSONA (dueño, 08/09/2026) y la
        // acción la escribe SIN obra: lo que viaje acá sólo sirve para saber cuánto vale la jornada
        // de ese día. Antes la acción DEDUCÍA una obra para poder escribir, y el acuse decía «la
        // ausencia quedó imputada a La Estrella» — que es lo que el dueño rechazó.
        obra_destino: obraDestino === '' ? null : obraDestino,
        estado,
        // `null` deja que la acción use la jornada de referencia (ver `ausenciaDeLaPersona.ts`: la
        // jornada legal por categoría es un dato pendiente). Un 1 fijo registraría una ausencia de
        // una hora sobre una jornada de nueve.
        // LAS HORAS QUE CORRESPONDEN, TAL COMO SE VEN EN EL CAMPO. `null` cuando quedó vacío: el
        // servidor usa la jornada de referencia (`horasDeLaAusencia`), que es la misma que este
        // panel prellenó. Nunca un cero — la base lo prohíbe y el dueño lo dijo al revés: «se le
        // suma hs porque corresponde por ley».
        horas: estado === 'ausente' ? ausencia.horas : horas,
        // EL MOTIVO DECIDE SI ES AUSENCIA O LICENCIA. Vacaciones y parte médico son licencia;
        // faltar sin avisar, ausencia. Ninguna suma horas trabajadas.
        motivo: estado === 'ausente' ? motivo : null,
        // EL TRAMO VIAJA SÓLO CUANDO SE PUEDE VER. El campo aparece con «No vino» y un motivo
        // elegido; mandarlo desde un estado donde la pantalla no lo muestra sería asentar días que
        // nadie vio.
        hasta: estado === 'ausente' && motivo !== null ? hasta : null,
        asignar,
      })
      if (r.ok) {
        setAviso({ ok: true, texto: r.mensaje })
        // LA GRILLA SE VUELVE A LEER DE LA BASE. Sin esto el panel dice «guardado» y la celda de
        // atrás sigue mostrando el número viejo: la pantalla afirmaría dos cosas distintas del
        // mismo día. No se pinta un optimista — se relee el destino, que es la única evidencia.
        router.refresh()
        return
      }
      setAviso({ ok: false, texto: r.error })
    })
  }

  return (
    <Drawer
      testid="panel-correccion"
      titulo={fila.persona.nombre}
      subtitulo={`Corregir un día · ${fila.rotuloObra}`}
      onCerrar={alCerrar}
      pie={
        <Boton type="button" variante="primaria" onClick={guardar}
          disabled={pendiente || invalido}
          data-testid="guardar-correccion">
          {pendiente ? 'Guardando…' : 'Guardar la corrección'}
        </Boton>
      }
    >
      <div style={{ display: 'grid', gap: 10 }}>
        <Campo rotulo="Día">
          <select value={fecha} onChange={(e) => elegirDia(e.target.value)} className={CAMPO} data-testid="correccion-dia">
            {dias.map((d, i) => (
              <option key={d} value={d}>{etiquetas[i]}{marcaDe(fila.celdas.find((c) => c.fecha === d))}</option>
            ))}
          </select>
        </Campo>

        {tramos.length > 0 && (
          <Campo rotulo="Qué hora de ese día" ayuda="El día está repartido en más de una obra: se corrige de a una.">
            <select value={origen ?? ''} onChange={(e) => elegirOrigen(e.target.value)}
              className={CAMPO} data-testid="correccion-origen">
              {tramos.map((t) => (
                <option key={t.obra_id} value={t.obra_id}>
                  {t.nombre} · {t.ausente ? 'no vino' : `${hs(t.horas ?? 0)} hs`}
                </option>
              ))}
            </select>
          </Campo>
        )}

        {/* LA OBRA SÓLO SE PIDE PARA UN DÍA TRABAJADO. Ver el bloque «LA AUSENCIA ES DE LA
            PERSONA» arriba: con «No vino» el selector desaparece y la obra la deduce la acción. */}
        {estado !== 'ausente' && (
          <Campo rotulo="Obra" ayuda="Cambiarla mueve esas horas a la obra elegida.">
            <select value={obraDestino} onChange={(e) => setObraDestino(e.target.value)}
              className={CAMPO} data-testid="correccion-obra">
              {obraDestino === '' && (
                <option value="" disabled>
                  {tramo ? `Elegí la obra — las horas están en ${tramo.nombre}, que no está activa` : 'Elegí la obra'}
                </option>
              )}
              {obras.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}
            </select>
          </Campo>
        )}

        <Campo rotulo="Qué pasó ese día">
          <select value={estado} onChange={(e) => setEstado(e.target.value as Estado)}
            className={CAMPO} data-testid="correccion-estado">
            <option value="presente">Trabajó</option>
            <option value="ausente">No vino</option>
            <option value="borrar" disabled={!cargado}>Sacar lo cargado</option>
          </select>
        </Campo>

        {estado === 'presente' && (
          <Campo rotulo="Horas" ayuda="La unidad es la hora. Se acepta la coma: 8,8.">
            <input value={texto} onChange={(e) => setTexto(e.target.value)} inputMode="decimal"
              className={CAMPO} data-testid="correccion-horas" />
          </Campo>
        )}
        {estado === 'presente' && error && <ErrorCampo>{error}</ErrorCampo>}
        {estado === 'ausente' && (
          <Campo rotulo="Por qué no vino" ayuda="Vacaciones, parte médico y ART quedan como licencia.">
            <select value={motivo ?? ''} onChange={(e) => setMotivo(e.target.value || null)}
              className={CAMPO} data-testid="correccion-motivo">
              <option value="">Sin declarar todavía</option>
              {motivos.map((m) => (
                <option key={m.clave} value={m.clave}>
                  {m.etiqueta}{m.tipo === 'licencia' ? ' · licencia' : ''}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {/* HASTA CUÁNDO, DEBAJO DEL MOTIVO. Sólo con motivo declarado: una enfermedad o un
            accidente se sabe cuánto dura; «sin declarar todavía» no dura nada todavía. */}
        {estado === 'ausente' && motivo !== null && (
          <Campo rotulo="Hasta (opcional)" ayuda="Se asienta cada día hábil del tramo, sin domingos.">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
              <ChipsValor valores={TRAMOS} activo={modoTramo} testid="tramo"
                alElegir={(v) => elegirTramo(v as ModoTramo)} />
            </div>
            {/* EL `max` ES EL MISMO TOPE QUE VALIDA EL SERVIDOR (`TOPE_DE_TRAMO_DIAS`): la pantalla
                no ofrece lo que la acción va a rechazar, y un 2027 tecleado por error no se
                convierte en 365 filas de licencia. */}
            <input type="date" value={hasta ?? ''} min={fecha} max={topeDelTramo(fecha)}
              onChange={(e) => {
                setHasta(e.target.value || null)
                setModoTramo(e.target.value ? 'fecha' : 'dia')
              }}
              className={CAMPO} data-testid="correccion-hasta" />
          </Campo>
        )}
        {estado === 'ausente' && (
          <Campo rotulo="Horas que corresponden"
            ayuda="Las que se le reconocen por ley. Vacío deja la jornada de referencia.">
            <input value={textoAusencia} onChange={(e) => setTextoAusencia(e.target.value)}
              inputMode="decimal" className={`${CAMPO} font-mono tabular-nums`}
              data-testid="correccion-horas-ausencia" />
          </Campo>
        )}
        {estado === 'ausente' && ausencia.error && <ErrorCampo>{ausencia.error}</ErrorCampo>}
        {estado === 'ausente' && (
          <p style={{ fontSize: '11.5px', color: V.tenue }} data-testid="correccion-ausencia-sin-obra">
            {/* LA FRASE ES DEL DUEÑO (08/09/2026): las horas se reconocen a la PERSONA y no se
                cargan a ninguna obra. `tipo_hora = 'ausencia' | 'licencia'` es lo que hace que no
                cuenten como trabajo de nadie. */}
            La ausencia es de la persona, no de una obra. Las horas que correspondan por ley se le
            reconocen a la persona y no se cargan a ninguna obra.
          </p>
        )}

        {/* ASIGNAR A UNA OBRA ES DECIDIR DÓNDE TRABAJA DE ACÁ EN ADELANTE: no tiene nada que ver
            con que un día no haya venido, y ofrecerlo ahí invita a mover a alguien de obra por
            haberse enfermado. */}
        {estado !== 'ausente' && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: '12.5px', color: V.tinta }}>
            <input type="checkbox" checked={asignar} onChange={(e) => setAsignar(e.target.checked)}
              data-testid="correccion-asignar" style={{ marginTop: 3 }} />
            <span>Asignarla también a esa obra, desde ese día.</span>
          </label>
        )}

        {aviso && (
          <Aviso tono={aviso.ok ? 'info' : 'neg'} testid="acuse-correccion">{aviso.texto}</Aviso>
        )}
      </div>
    </Drawer>
  )
}

/** Lo que ya tiene ese día, al lado del nombre del día. Sin esto hay que cerrar el panel para saber
 *  sobre qué se está por escribir. */
function marcaDe(c: CeldaObra | undefined): string {
  if (!c) return ''
  if (c.tramos.length > 1) return ` · ${c.tramos.length} obras · ${hs(c.horas ?? 0)} hs`
  if (c.estado === 'horas') return ` · ${hs(c.horas ?? 0)} hs`
  if (c.estado === 'ausente') return ' · no vino'
  // La licencia se NOMBRA con su motivo: «no vino» a secas borra que estuvo autorizada.
  if (c.estado === 'licencia') return ` · licencia${c.motivo ? `: ${c.motivo.toLowerCase()}` : ''}`
  // «no laborable» y no «feriado»: desde que la grilla es por quincena, este estado también lo
  // tienen los sábados, que no son feriados de nadie. El domingo ya no llega hasta acá.
  if (c.estado === 'no_laborable') return ' · no laborable'
  return ' · sin cargar'
}

/**
 * Las horas que el campo de la ausencia muestra al abrir: las que YA están registradas si el día es
 * una ausencia, y si no la jornada de referencia. El orden de las candidatas es el mismo que usa el
 * servidor (`jornadaDeReferencia`): la obra donde el día ya está cargado primero.
 */
function horasDeLaAusenciaVisibles(
  fecha: string,
  celda: CeldaObra | null,
  tramos: { obra_id: string }[],
  /** Su obra vigente: la última candidata antes de la jornada estándar, igual que en el servidor. */
  obraVigente: string | undefined,
  jornadaPorObra: Record<string, number>,
): number {
  if ((celda?.estado === 'ausente' || celda?.estado === 'licencia') && celda.horas !== null) {
    return celda.horas
  }
  // LA JORNADA POR DEFECTO ES DEL DÍA DE LA SEMANA (dueño, 08/09/2026): 9 hs de lunes a jueves, 8
  // los viernes. Va PRIMERA, antes que `jornada_horas` de la obra: aquélla es la jornada de un
  // contrato de obra y ésta es la de la persona, que es de quien es la ausencia. El sábado no tiene
  // default y ahí siguen valiendo las candidatas de siempre.
  return jornadaDeReferenciaVisible([
    jornadaPorDefecto(fecha),
    ...tramos.map((t) => jornadaPorObra[t.obra_id]),
    obraVigente ? jornadaPorObra[obraVigente] : null,
  ])
}
