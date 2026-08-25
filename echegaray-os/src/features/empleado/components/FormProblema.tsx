'use client'

import { useActionState, useState } from 'react'
import { useRouter } from 'next/navigation'
import { C, R } from '@/shared/components/movil/tokens'
import { Icono, type NombreIcono } from '@/shared/components/movil/Iconos'
import { PieFijo, TarjetaLista, mono } from '@/shared/components/movil/Piezas'
import { reportarProblema } from '../services/acciones'
import { MOTIVOS, motivoDe } from '../services/problemas'
import type { MiImpedimento, MiTarea } from '../types'

// M07 · AVISAR UN PROBLEMA — porte literal de `M07 · Reportar problema.dc.html`.
//
// ═══ PROGRESSIVE DISCLOSURE, Y POR QUÉ NO ES UN CAPRICHO VISUAL ═══
//
// La nota del mockup: «El formulario aparece recién cuando eligió el motivo». Un formulario abierto
// —descripción, foto, ¿frena?— frente a alguien parado en el andamio con guantes es una pared de
// campos, y la pared se abandona. La primera pantalla es UNA pregunta con seis respuestas grandes.
//
// ═══ SEIS CATEGORÍAS CERRADAS, NO UN CAMPO LIBRE ═══
//
// «Se puede contar y comparar entre obras». El texto libre sigue existiendo, pero DEBAJO del
// motivo: el motivo clasifica, la descripción explica. Las claves que viajan a la base las traduce
// `problemas.ts`, y su test las contrasta contra el CHECK real de `obra_restriccion`.
//
// ═══ «¿DÓNDE?» ES UNA LISTA, NO UN DESPLEGABLE ═══
//
// El mockup dibuja filas con un círculo de 22px. El `<select>` nativo que había acá era correcto
// para 349 opciones; para las tres o cuatro tareas propias es un toque de más y esconde la
// respuesta hasta que se abre la rueda. Las tareas que se ofrecen siguen siendo SÓLO las propias.
//
// «FRENA EL TRABAJO» ES UNA PREGUNTA DE DOS OPCIONES, NO UNA CASILLA: una casilla sin marcar se lee
// como «no» sin que nadie lo haya dicho, y de esa respuesta depende que el jefe salga corriendo.

type EstadoForm = { error: string | null; mensaje?: string | null }

const ICONO_MOTIVO: Record<string, NombreIcono> = {
  material: 'material',
  equipo: 'equipo',
  gente: 'cuadrilla',
  clima: 'clima',
  plano: 'plano',
  seguridad: 'seguridad',
}

export function FormProblema({
  tareas, obraId, tareaId, yaAvisado, jefe,
}: {
  tareas: MiTarea[]
  obraId: string
  tareaId: string | null
  /** Lo que esta persona ya reportó. Cierra el círculo: sin esto vuelve a avisar lo mismo. */
  yaAvisado: MiImpedimento[]
  /** A quién le llega. Sale de `mi_obra.jefe_obra`: si la obra no lo declara, se dice. */
  jefe: string | null
}) {
  const router = useRouter()
  const [motivo, setMotivo] = useState('')
  const [elegida, setElegida] = useState(tareaId ?? '')
  const [frena, setFrena] = useState<'si' | 'no' | ''>('')
  const [adjunto, setAdjunto] = useState<string | null>(null)

  const [estado, accion, enviando] = useActionState(
    async (_prev: EstadoForm, form: FormData): Promise<EstadoForm> => {
      const r = await reportarProblema(form)
      if (!r.ok) return { error: r.error }
      router.push('/mi-trabajo')
      return { error: null, mensaje: r.mensaje ?? null }
    },
    { error: null },
  )

  const m = motivoDe(motivo)
  const tarea = tareas.find((t) => t.id === elegida) ?? null
  const listo = m != null && frena !== ''

  return (
    <form action={accion} data-testid="form-problema">
      <input type="hidden" name="obra_id" value={tarea?.obra_id ?? obraId} />
      <input type="hidden" name="actividad_id" value={elegida} />
      <input type="hidden" name="motivo" value={motivo} />
      <input type="hidden" name="frena" value={frena} />

      <h2 style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>¿Qué está frenando el trabajo?</h2>

      {/* DOS COLUMNAS DE 92px. El mockup los dibuja así y la razón es el pulgar: seis objetivos de
          media pantalla se tocan sin mirar, y una lista de seis renglones no. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 12 }} data-testid="motivos">
        {MOTIVOS.map((o) => {
          const activo = o.id === motivo
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => setMotivo(activo ? '' : o.id)}
              data-testid={`motivo-${o.id}`}
              aria-pressed={activo}
              style={{
                background: activo ? C.marcaSuave : C.surface,
                border: `1.5px solid ${activo ? C.marca : C.linea}`,
                borderRadius: R.tarjeta, padding: '14px 10px', display: 'flex',
                flexDirection: 'column', alignItems: 'center', gap: 8, minHeight: 92,
                justifyContent: 'center', cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <span style={{ display: 'flex', color: activo ? C.ink : C.muted }}>
                <Icono nombre={ICONO_MOTIVO[o.id] ?? 'alerta'} tamano={24} />
              </span>
              <span style={{ fontSize: 13, fontWeight: activo ? 600 : 400, color: C.ink, textAlign: 'center' }}>
                {o.label}
              </span>
            </button>
          )
        })}
      </div>

      {/* EL RESTO DEL FORMULARIO: RECIÉN ACÁ. Sin motivo, una sola línea que dice qué pasa después —
          y no un formulario apagado, que se lee como un sistema roto. */}
      {!m ? (
        <p
          data-testid="pista-motivos"
          style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 20, fontSize: 13, color: C.faint }}
        >
          <Icono nombre="info" tamano={16} />
          Elegí qué pasa y se abre el resto.
        </p>
      ) : (
        <div data-testid="detalle-problema" style={{ marginTop: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>¿Dónde?</div>
          <div style={{ marginTop: 8 }}>
            <TarjetaLista>
              <FilaElegir
                texto="Toda la obra: no es de una tarea"
                on={elegida === ''}
                onClick={() => setElegida('')}
                testid="elegir-obra"
              />
              {tareas.map((t) => (
                <FilaElegir
                  key={t.id}
                  texto={t.nombre}
                  on={elegida === t.id}
                  onClick={() => setElegida(t.id)}
                  testid="elegir-tarea"
                />
              ))}
            </TarjetaLista>
          </div>

          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginTop: 16 }}>
            ¿Está parado el frente?
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            {([
              ['si', 'Sí, parado', 'bloqueo', C.neg, C.negFondo] as const,
              ['no', 'No, sigue', 'ok', C.pos, C.posFondo] as const,
            ]).map(([v, l, icono, color, fondo]) => {
              const on = frena === v
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setFrena(v)}
                  data-testid={`frena-${v}`}
                  aria-pressed={on}
                  style={{
                    flex: 1, minHeight: 48, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', gap: 8,
                    border: `1.5px solid ${on ? color : C.linea}`,
                    background: on ? fondo : C.surface,
                    color: on ? color : C.inkSuave,
                    borderRadius: R.control, fontSize: 14, fontWeight: on ? 600 : 400,
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <Icono nombre={icono} tamano={18} />
                  {l}
                </button>
              )
            })}
          </div>

          {/* FOTO Y TEXTO EN LA MISMA FILA, 1:2 como el mockup. La foto es opcional y va primero
              porque en obra se saca antes de escribir. */}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <label
              title="Sacar foto"
              style={{
                flex: 1, background: C.surface, border: `1px solid ${C.linea}`, borderRadius: R.tarjeta,
                padding: '16px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 7, minHeight: 88, justifyContent: 'center', cursor: 'pointer',
              }}
            >
              <span style={{ display: 'flex', color: adjunto ? C.pos : C.muted }}>
                <Icono nombre={adjunto ? 'ok' : 'foto'} tamano={24} />
              </span>
              <span style={{ fontSize: 12.5, fontWeight: 500, color: C.ink }}>Foto</span>
              <input
                type="file"
                name="foto"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                data-testid="foto-problema"
                onChange={(ev) => setAdjunto(ev.target.files?.[0]?.name ?? null)}
              />
            </label>
            <div style={{
              flex: 2, background: C.surface, border: `1px solid ${C.linea}`, borderRadius: R.tarjeta,
              padding: '12px 14px', display: 'flex', alignItems: 'flex-start', gap: 9,
            }}>
              <span style={{ display: 'flex', color: C.faint, marginTop: 3, flexShrink: 0 }}>
                <Icono nombre="nota" tamano={18} />
              </span>
              <textarea
                name="descripcion"
                rows={3}
                required
                minLength={5}
                data-testid="descripcion-problema"
                placeholder={m.pista}
                style={{
                  border: 'none', background: 'transparent', fontSize: 14, color: C.ink,
                  width: '100%', padding: 0, resize: 'none', outline: 'none', fontFamily: 'inherit',
                }}
              />
            </div>
          </div>
          {adjunto && (
            <p style={{ ...mono, marginTop: 6, fontSize: 11.5, color: C.muted }} data-testid="foto-adjunta">{adjunto}</p>
          )}

          {/* A QUIÉN LE LLEGA, CON NOMBRE. Sale de `mi_obra.jefe_obra`; si la obra no lo declara se
              dice, en vez de inventar un destinatario. */}
          <div style={{
            marginTop: 16, background: C.surface, border: `1px solid ${C.linea}`, borderRadius: R.tarjeta,
            padding: '13px 14px', display: 'flex', alignItems: 'center', gap: 11,
          }} data-testid="destinatario">
            <span style={{ display: 'flex', color: C.faint, flexShrink: 0 }}><Icono nombre="gente" tamano={18} /></span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 12, color: C.muted }}>Le llega a</div>
              <div style={{ fontSize: 14, color: jefe ? C.ink : C.faint }}>
                {jefe ? `${jefe} · jefe de obra` : 'la obra no tiene jefe de obra cargado'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ LO QUE YA AVISASTE — cierra el círculo ═══
          La nota del mockup: «El empleado ve el estado de lo que avisó». Sin esto, el que reportó
          ayer no sabe si alguien lo miró y vuelve a reportar lo mismo. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 24 }}>
        <span style={{ display: 'flex', color: C.muted }}><Icono nombre="historial" tamano={16} /></span>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Lo que ya avisaste</div>
      </div>
      <div style={{ marginTop: 8 }} data-testid="ya-avisaste">
        <TarjetaLista>
          {yaAvisado.length === 0 ? (
            <p style={{ padding: '14px', fontSize: 12.5, color: C.faint }} data-testid="sin-avisos">
              No avisaste nada todavía. Lo que reportes queda acá con su estado.
            </p>
          ) : yaAvisado.map((i) => {
            const resuelto = i.estado === 'resuelta'
            return (
              <div
                key={i.id}
                data-testid="aviso-previo"
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px',
                  borderBottom: `1px solid ${C.divisor}`, minHeight: 56,
                }}
              >
                <span style={{ display: 'flex', color: resuelto ? C.pos : C.neg, flexShrink: 0 }}>
                  <Icono nombre={resuelto ? 'ok' : 'alerta'} tamano={18} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {i.descripcion ?? 'Sin describir'}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {i.creado_en.slice(8, 10)}/{i.creado_en.slice(5, 7)} · {i.actividad ?? 'problema de la obra'}
                  </div>
                </div>
                {/* EL ESTADO CON SU PALABRA, NO CON UN PUNTITO: un impedimento que nadie cerró está
                    abierto aunque diga otra cosa. */}
                <span style={{ fontSize: 11.5, fontWeight: 500, color: resuelto ? C.pos : C.neg, flexShrink: 0 }}>
                  {resuelto ? 'Resuelto' : 'Abierto'}
                </span>
              </div>
            )
          })}
        </TarjetaLista>
      </div>

      {estado.error && (
        <p style={{ marginTop: 14, fontSize: 12.5, color: C.neg }} data-testid="problema-error">{estado.error}</p>
      )}

      <PieFijo testid="pie-problema">
        <button
          type="submit"
          disabled={enviando || !listo}
          data-testid="enviar-problema"
          style={{
            width: '100%', minHeight: 52, borderRadius: R.control,
            background: listo && !enviando ? C.marca : C.inerte,
            color: listo && !enviando ? C.ink : C.faint,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
            fontSize: 16, fontWeight: 600, border: 'none', fontFamily: 'inherit',
            cursor: listo && !enviando ? 'pointer' : 'not-allowed',
          }}
        >
          <Icono nombre="enviar" tamano={20} />
          {enviando ? 'Avisando…' : !m ? 'Elegí qué pasa' : frena === '' ? 'Decinos si está parado' : 'Avisar al jefe'}
        </button>
      </PieFijo>
    </form>
  )
}

/** Una fila con círculo de 22px: la respuesta a «¿Dónde?». Verde cuando está elegida, como M07. */
function FilaElegir({ texto, on, onClick, testid }: {
  texto: string
  on: boolean
  onClick: () => void
  testid: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testid}
      aria-pressed={on}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px', width: '100%',
        borderBottom: `1px solid ${C.divisor}`, minHeight: 48, background: on ? C.quiet : 'transparent',
        border: 'none', borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: C.divisor,
        textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
      }}
    >
      <span style={{
        width: 22, height: 22, borderRadius: 11, flexShrink: 0,
        border: `2px solid ${on ? C.pos : C.lineaFuerte}`, background: on ? C.pos : C.surface,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.surface,
      }}>
        {on && <Icono nombre="ok" tamano={13} grosor={3} />}
      </span>
      <span style={{
        fontSize: 14, color: C.ink, minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {texto}
      </span>
    </button>
  )
}
