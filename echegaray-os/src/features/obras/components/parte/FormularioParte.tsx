'use client'

// «¿QUÉ SE HIZO HOY?» — PORTE LITERAL del panel izquierdo del canónico «05 · Registrar avance».
//
// Cada medida de acá está leída del `.dc.html`: panel de 404 px con `padding:14px 16px 16px`,
// desplegable de actividad con el pendiente al borde derecho, grilla de medición `1fr 96px` con
// `gap:10px`, chips de `borderRadius:16px` `padding:5px 11px`, los de sólo icono redondos de 30 px,
// lista de gente de `maxHeight:236px` con casillas de 15 px, y la primaria a todo el ancho.
//
// ═══ LO QUE SE CARGA ACÁ NO SE VA A NINGUNA PANTALLA ═══
//
// Un parte escribe cuatro cosas por la MISMA acción (`registrarEjecucion`): la producción a
// `obra_ejecucion`, las horas de cada persona a `registros_hh`, el equipo a `obra_ejecucion_equipo`
// y —si lo hay— el impedimento y la evidencia. Nada de esto navega: el que carga a las 18:30 no
// vuelve a entrar si lo mandan a otra página.
//
// ═══ LOS PANELES SE OCULTAN, NO SE DESMONTAN ═══
//
// El mockup los dibuja con `sc-if`. Traducido literal, plegar el chip después de escribir borraría
// lo escrito sin decirlo: los campos dejan de existir en el DOM y no viajan en el envío. Se ocultan
// con `display:none`, que se ve igual y no pierde nada.

import { startTransition, useActionState, useState, type CSSProperties, type FormEvent } from 'react'
import type { AccionFormulario, ResultadoAccion } from '@/shared/components/ui'
import type { Actividad, Persona } from '../../types'
import { TIPO_RESTRICCION, TIPO_RESTRICCION_LABEL } from '../../types'
import {
  conDecimalesEnPunto, faltaParaRegistrar, nombreDeFrente, porDeclaracion, textoPendiente,
} from '../../services/parteDiario.ts'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Ico'
import { Hover } from '../canon/Piezas'
import { FilasDeEquipo } from '../FilasDeEquipo'
import { ListaDeGente } from './ListaDeGente'

const ROTULO: CSSProperties = { fontSize: '11px', color: C.tintaSuave, marginBottom: '5px' }
const CAJA: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '7px', border: `1px solid ${C.borde}`,
  borderRadius: '6px', padding: '7px 10px',
}
const ENTRADA: CSSProperties = {
  border: 'none', background: 'transparent', fontFamily: MONO, fontSize: '13px', color: C.tinta,
  width: '100%', padding: 0, outline: 'none',
}
/** El campo de texto plano de los paneles (impedimento, evidencia, nota): 12px, sin caja propia. */
const TEXTO: CSSProperties = {
  border: 'none', background: 'transparent', fontSize: '12px', color: C.tinta, width: '100%',
  padding: 0, outline: 'none', fontFamily: 'inherit',
}
const PANEL: CSSProperties = {
  marginTop: '11px', border: `1px solid ${C.borde}`, borderRadius: '8px', padding: '9px 10px',
}
const ELIPSIS: CSSProperties = {
  minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
}

/** Un chip con texto: píldora de 16 px. Sin texto: botón redondo de 30 px. Así los mide el zip. */
function ChipParte({ abierto, onClick, rotulo, texto, icono, falta = false, alerta = false, testid }: {
  abierto: boolean
  onClick: () => void
  rotulo: string
  texto?: string
  icono: React.ReactNode
  /** El aviso del zip cuando todavía no se eligió a nadie: borde y texto en tono de aviso. */
  falta?: boolean
  /** El chip del impedimento: abierto se pone rojo, como en el zip (`bordeImp`/`fondoImp`/`cImp`). */
  alerta?: boolean
  testid: string
}) {
  const enRojo = abierto && alerta
  const color = enRojo ? C.neg : falta ? C.warn : C.tinta
  const borde = enRojo ? C.neg : abierto ? C.grafito : falta ? C.warnBorde : C.borde
  const fondo = enRojo ? C.negFondo : falta ? C.warnFondo : C.superficie
  const forma: CSSProperties = texto
    ? { gap: '7px', borderRadius: '16px', padding: '5px 11px' }
    : { width: '30px', height: '30px', justifyContent: 'center', borderRadius: '15px' }
  return (
    <button
      type="button" onClick={onClick} title={rotulo} aria-label={rotulo} aria-expanded={abierto}
      data-testid={testid}
      style={{
        display: 'flex', alignItems: 'center', border: `1px solid ${borde}`, background: fondo,
        color, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.4, ...forma,
      }}
    >
      {icono}
      {texto && <span style={{ fontSize: '12px', fontWeight: 500, color }}>{texto}</span>}
    </button>
  )
}

export function FormularioParte({
  frentes, personas, cuadrillas, integrantes, equipos, dia, elegida, elegir, registrar,
}: {
  /** Las actividades cargables, ya ordenadas (`frentesDelParte`). */
  frentes: Actividad[]
  personas: Persona[]
  cuadrillas: { id: string; nombre: string }[]
  /** Quiénes integran cada cuadrilla: elegir una recorta la lista a los suyos. */
  integrantes: Record<string, string[]>
  equipos: string[]
  dia: string
  elegida: string
  elegir: (actividadId: string) => void
  registrar: AccionFormulario
}) {
  const [abierto, setAbierto] = useState<'acts' | 'gente' | 'equipos' | 'foto' | 'imp' | null>(null)
  const [cant, setCant] = useState('')
  const [hh, setHH] = useState('')
  const [cuadrilla, setCuadrilla] = useState('')
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set())
  /** Las horas que alguien corrigió persona por persona. Sin corrección, manda el campo HH. */
  const [horas, setHoras] = useState<Record<string, string>>({})
  /** Sube de a uno con cada parte guardado: es la llave que vacía los campos SUELTOS —nota,
   *  evidencia, impedimento, equipos— desmontándolos. Sin esto, el impedimento del parte anterior
   *  se vuelve a mandar con el siguiente y queda anotado dos veces. */
  const [version, setVersion] = useState(0)

  const [estado, ejecutar, pendiente] = useActionState<ResultadoAccion | null, FormData>(
    (_previo, datos) => registrar(datos), null)
  const [visto, setVisto] = useState<ResultadoAccion | null>(null)

  // EL FORMULARIO SE VACÍA CUANDO GUARDÓ, NO CUANDO SE MANDÓ: React 19 resetea solo todo
  // `<form action>` en cuanto la acción termina, haya guardado o no, y un parte rebotado dejaría la
  // cantidad recién tipeada en blanco. Se vacía acá, mirando el resultado, y en RENDER y no en un
  // efecto: `react-hooks/set-state-in-effect` prohíbe lo segundo, y el estado derivado de un
  // resultado nuevo es exactamente el caso que React resuelve ajustando en el render.
  if (estado !== visto) {
    setVisto(estado)
    if (estado?.ok) {
      setCant(''); setHH(''); setHoras({}); setVersion((v) => v + 1)
    }
  }

  const sel = frentes.find((a) => a.id === elegida) ?? null
  const declara = sel != null && porDeclaracion(sel)
  const falta = faltaParaRegistrar(sel, cant.trim() !== '')
  const listo = falta === null && !pendiente

  const horasDe = (id: string) => horas[id] ?? hh
  const abrir = (cual: typeof abierto) => setAbierto((v) => (v === cual ? null : cual))

  // `preventDefault` apaga el reseteo automático de React 19: lo que se manda se conserva hasta
  // que el servidor conteste, que es lo único que prueba que el parte entró.
  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const datos = conDecimalesEnPunto(new FormData(e.currentTarget), ['cantidad', 'avance_pct'])
    startTransition(() => ejecutar(datos))
  }

  return (
    // `maxWidth` NO afloja el ancho del canónico: en 1280 y 1440 el panel mide los 404 px medidos.
    // Es el freno para una ventana angosta, donde 404 px fijos empujarían la página a scrollear en
    // horizontal — y una pantalla que se corre de costado no se puede usar con una mano en obra.
    <form key={version} onSubmit={enviar} data-testid="form-ejecucion" style={{
      width: '404px', flexShrink: 0, maxWidth: '100%', background: C.superficie,
      border: `1px solid ${C.borde}`, borderRadius: '10px', padding: '14px 16px 16px',
    }}>
      <input type="hidden" name="fecha" value={dia} />
      <input type="hidden" name="actividad_id" value={elegida} />

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: C.tinta }}>¿Qué se hizo hoy?</div>
        {estado?.ok === true && (
          <span data-testid="parte-guardado" style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '5px',
            fontSize: '11px', color: C.pos,
          }}><Ico d={P.ok} s={13} w={2.2} />guardado</span>
        )}
      </div>

      {/* ═══ LA ACTIVIDAD, CON SU PENDIENTE AL BORDE ═══
          El pendiente es el número que decide cuánto cargar: buscarlo en otra pantalla es abandonar
          el parte a la mitad. */}
      <div style={{ marginTop: '13px' }}>
        <div style={ROTULO}>Actividad</div>
        <button
          type="button" onClick={() => abrir('acts')} data-testid="parte-actividad"
          aria-expanded={abierto === 'acts'} aria-label="Elegí la actividad"
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
            border: `1px solid ${abierto === 'acts' ? C.grafito : C.borde}`, background: C.superficie,
            borderRadius: '6px', padding: '8px 10px', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <span style={{ fontSize: '12.5px', color: sel ? C.tinta : C.tenue, ...ELIPSIS }}>
            {sel ? nombreDeFrente(sel) : 'Elegí la actividad'}
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', color: C.tenue, flexShrink: 0 }}>
            <Ico d={P.abajo} s={14} />
          </span>
        </button>
        {abierto === 'acts' && (
          <div data-testid="parte-actividades" style={{
            border: `1px solid ${C.borde}`, borderTop: 'none', borderRadius: '0 0 6px 6px',
            maxHeight: '212px', overflowY: 'auto',
          }}>
            {frentes.length === 0 && (
              <div style={{ padding: '8px 10px', fontSize: '12.5px', color: C.tenue }}>
                Esta obra todavía no tiene actividades cargadas. Se crean en Cronograma.
              </div>
            )}
            {frentes.map((a) => (
              <Hover key={a.id} hover={{ background: C.tenueFondo }} base={{
                display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px',
                borderBottom: `1px solid ${C.bordeLista}`, cursor: 'pointer',
                background: a.id === elegida ? C.marcaSuave : 'transparent',
              }}>
                <button
                  type="button" data-testid={`parte-actividad-${a.id}`}
                  onClick={() => { elegir(a.id); setAbierto(null) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
                    border: 'none', background: 'none', padding: 0, cursor: 'pointer',
                    fontFamily: 'inherit', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: '12.5px', color: C.tinta, ...ELIPSIS }}>{nombreDeFrente(a)}</span>
                  <span style={{
                    marginLeft: 'auto', fontFamily: MONO, fontSize: '11px', color: C.tenue,
                    flexShrink: 0,
                  }}>{textoPendiente(a)}</span>
                </button>
              </Hover>
            ))}
          </div>
        )}
      </div>

      {/* ═══ LA MEDICIÓN Y LAS HORAS ═══
          CANTIDAD Y AVANCE SON EXCLUYENTES: se dibuja UNO, el que mueve el número de ESTA
          actividad. El otro nombre no existe en el DOM, así que no se puede colar un 0 en una
          actividad que no se mide así. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 96px', gap: '10px', marginTop: '12px' }}>
        <div>
          <div style={ROTULO}>{declara ? 'Avance del día' : 'Cantidad ejecutada'}</div>
          <div style={CAJA}>
            <input
              name={declara ? 'avance_pct' : 'cantidad'} type="text" inputMode="decimal"
              placeholder="0,00" value={cant} onChange={(e) => setCant(e.target.value)}
              aria-label={declara ? 'Avance del día' : 'Cantidad ejecutada'}
              data-testid={declara ? 'parte-avance' : 'parte-cantidad'} style={ENTRADA}
            />
            <span style={{ fontSize: '11.5px', color: C.tenue, flexShrink: 0 }}>
              {/* SIN ACTIVIDAD ELEGIDA NO HAY UNIDAD: una palabra ahí es una afirmación sobre una
                  actividad que todavía nadie eligió. */}
              {declara ? '%' : sel?.unidad ?? ''}
            </span>
          </div>
        </div>
        <div>
          <div style={ROTULO}>HH</div>
          <div style={{ ...CAJA, gap: '6px' }}>
            <input
              name="hh_del_dia" type="text" inputMode="decimal" placeholder="0" value={hh}
              onChange={(e) => setHH(e.target.value)} data-testid="parte-hh"
              aria-label="Horas de cada persona" style={ENTRADA}
            />
          </div>
        </div>
      </div>
      {/* EL AVISO DEL NO-OP SILENCIOSO: en una actividad medida por pasos la cantidad se guarda y su
          porcentaje NO se mueve —lo produce el tildado de los pasos—. Éxito informado con el dato
          quieto es el peor modo de falla. */}
      {sel?.metodo_avance === 'pasos' && (
        <div data-testid="aviso-pasos" style={{
          display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: C.warn,
          marginTop: '6px',
        }}>
          <Ico d={P.alerta} s={13} />
          Se mide por pasos: su avance sale de tildarlos, no de este parte
        </div>
      )}

      {/* ═══ LO SECUNDARIO ES UN CHIP, NO UN BLOQUE ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px', marginTop: '14px', flexWrap: 'wrap',
      }}>
        <ChipParte
          testid="parte-personal" rotulo="Elegir quién trabajó" abierto={abierto === 'gente'}
          onClick={() => abrir('gente')} icono={<Ico d={P.cuadrilla} s={14} />}
          texto={marcadas.size > 0 ? `${marcadas.size} personas` : 'elegir personas'}
          falta={marcadas.size === 0}
        />
        <ChipParte
          testid="parte-equipos" rotulo="Equipos utilizados" abierto={abierto === 'equipos'}
          onClick={() => abrir('equipos')} icono={<Ico d={P.equipo} s={14} />} texto="equipos"
        />
        <ChipParte
          testid="parte-evidencia" rotulo="Adjuntar foto o remito" abierto={abierto === 'foto'}
          onClick={() => abrir('foto')} icono={<Ico d={P.foto} s={15} />}
        />
        <ChipParte
          testid="parte-impedimento" rotulo="Anotar impedimento" abierto={abierto === 'imp'} alerta
          onClick={() => abrir('imp')} icono={<Ico d={P.alerta} s={15} />}
        />
      </div>

      {/* LAS HORAS SON LAS MISMAS DE PERSONAL: viajan con el mismo contrato (`horas_<uuid>`) que la
          carga masiva de la pestaña Personal y las escribe la misma acción. La misma hora se carga
          UNA vez. */}
      <div style={{ display: abierto === 'gente' ? 'block' : 'none' }} data-testid="parte-gente">
        <ListaDeGente
          personas={personas} cuadrillas={cuadrillas} integrantes={integrantes}
          cuadrilla={cuadrilla} elegirCuadrilla={setCuadrilla} marcadas={marcadas}
          marcar={(id) => setMarcadas((s) => {
            const c = new Set(s)
            if (c.has(id)) c.delete(id); else c.add(id)
            return c
          })}
          horasDe={horasDe} ponerHoras={(id, v) => setHoras((h) => ({ ...h, [id]: v }))}
        />
      </div>

      {/* EL EQUIPO NO ES UNA PERSONA: las horas de una persona van a `registros_hh` —de donde sale
          la liquidación— y las de una máquina a `obra_ejecucion_equipo`. */}
      <div style={{ display: abierto === 'equipos' ? 'block' : 'none', ...PANEL }}>
        <FilasDeEquipo catalogo={equipos} />
      </div>

      {/* LA EVIDENCIA NO SE COPIA: la foto se sube a la carpeta de la obra en Drive y acá se pega el
          enlace — el OS guarda el vínculo, no una copia. El panel lo dice en vez de ofrecer un
          botón de adjuntar que no existe. */}
      <div style={{ display: abierto === 'foto' ? 'block' : 'none', ...PANEL }}>
        <div style={ROTULO}>Enlace de Drive de la foto o el remito</div>
        <input name="evidencia" placeholder="https://drive.google.com/file/d/…" style={TEXTO}
          data-testid="parte-evidencia-enlace" />
        <div style={{ ...ROTULO, marginTop: '9px' }}>Nombre (si no está en el índice de Drive)</div>
        <input name="evidencia_nombre" maxLength={300} style={TEXTO} />
      </div>

      {/* EL IMPEDIMENTO SE ANOTA CUANDO PASA: el que hay que ir a cargar a otra pantalla se anota
          mañana o nunca. Sale por la MISMA acción que lo anota en Operación, atado a la actividad
          de este parte — y por eso pide responsable y fecha, que es lo que esa acción exige: sin
          eso no es gestión, es una queja anotada, y la base lo rechaza. */}
      <div style={{
        display: abierto === 'imp' ? 'block' : 'none', ...PANEL,
        border: `1px solid ${C.negBorde}`, background: C.negFondo,
      }}>
        <input name="impedimento" maxLength={300} placeholder="¿Qué frenó el trabajo?" style={TEXTO}
          data-testid="parte-impedimento-desc" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '9px' }}>
          <select name="impedimento_tipo" defaultValue="material" aria-label="Tipo de impedimento"
            style={{ ...TEXTO, fontSize: '11.5px' }}>
            {TIPO_RESTRICCION.map((t) => <option key={t} value={t}>{TIPO_RESTRICCION_LABEL[t]}</option>)}
          </select>
          <input name="impedimento_responsable" maxLength={120} placeholder="Quién lo resuelve"
            style={{ ...TEXTO, fontSize: '11.5px' }} />
        </div>
        <input type="date" name="impedimento_compromiso" aria-label="Para cuándo"
          style={{ ...TEXTO, fontSize: '11.5px', marginTop: '8px' }} />
      </div>

      <div style={{
        marginTop: '12px', border: `1px solid ${C.borde}`, borderRadius: '8px', padding: '9px 10px',
        display: 'flex', alignItems: 'flex-start', gap: '8px',
      }}>
        <span style={{ marginTop: '2px', flexShrink: 0, color: C.tenue }}><Ico d={P.nota} s={14} /></span>
        <textarea name="comentario" maxLength={500} rows={2} placeholder="Nota del día"
          aria-label="Nota del día" data-testid="parte-comentario"
          style={{ ...TEXTO, resize: 'none' }} />
      </div>

      <button type="submit" disabled={!listo} data-testid="form-ejecucion-enviar" style={{
        marginTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: '7px', width: '100%', border: 'none', background: listo ? C.marca : C.pistaPlan,
        color: listo ? C.tinta : C.tenue, fontSize: '13px', fontWeight: 600, borderRadius: '6px',
        padding: '10px', cursor: listo ? 'pointer' : 'default', fontFamily: 'inherit',
      }}>
        <Ico d={P.ok} s={15} w={2.2} />
        {pendiente ? 'Registrando…' : falta ?? 'Registrar'}
      </button>

      {/* EL RESULTADO DEL SERVIDOR, COMPLETO. El zip sólo dibuja el ✓ «guardado», y con eso un
          parte que entró con las horas rebotadas —«ya tenían esas horas cargadas ese día»— se
          leería como un éxito limpio. */}
      {estado != null && (
        <p data-testid={estado.ok ? 'form-ejecucion-ok' : 'form-ejecucion-error'} style={{
          marginTop: '9px', fontSize: '11.5px', color: estado.ok ? C.pos : C.neg,
        }}>{estado.ok ? estado.mensaje ?? 'Parte registrado.' : estado.error}</p>
      )}
    </form>
  )
}
