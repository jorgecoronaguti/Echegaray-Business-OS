'use client'

import { useActionState, useState } from 'react'
import { C, HOVER_CANVAS, HOVER_MARCA, R, pct } from '@/shared/components/movil/tokens'
import { Icono } from '@/shared/components/movil/Iconos'
import {
  AvisoError, Azulejo, BotonAncho, PieFijo, RotuloSeccion, TarjetaLista, Vacio, mono,
} from '@/shared/components/movil/Piezas'
import { AVISO_CRITERIO, ROTULO_METODO, VALORES_MASIVOS, controlDe } from '../services/medicion'
import type { Metodo } from '../services/medicion'
import type { ActividadDelJefe, Impedimento, ParteDeTarea, PasoDeActividad } from '../services/jefeService'
import { plazoDe, produccionDe, rendimientoDe } from '../services/tarea'
import { desvioDe, validarCausa } from '../services/causa'
import { avancePorPasos } from '@/features/obras/services/avance'
import type { Esperado } from '@/features/administracion/services/presencia'

// J06 · EL FRENTE (una tarea) — porte literal de `J06 · Jefe Frente.dc.html`.
//
// El mockup titula «Columna de encadenado H17 / Eje 5–8 · Cuadrilla 2»: lo que dibuja es UNA
// ACTIVIDAD con su frente y su cuadrilla debajo, no un contenedor del árbol. Por eso J06 se porta
// sobre esta pantalla —`/obra/avance?actividad=…`— y no sobre `/obra/frente`, que agrupa tareas y
// no tiene pasos que marcar.
//
// ═══ EL MÉTODO DECIDE EL CONTROL, Y NO HAY UN CONTROL «UNIVERSAL» ═══
//
// Pasos → la lista de círculos de 26px de J06. Cantidad → el −/+ sin teclado de M04. Partes y
// manual → los valores de un toque de J04. Ofrecer siempre un porcentaje sería más simple de
// programar y mucho peor: en una tarea medida por producción ese porcentaje no mueve nada y el jefe
// se va convencido de que cargó el día. El porqué está en `medicion.ts`.
//
// ═══ LO QUE SE AGREGA AL MOCKUP, Y POR QUÉ ═══
//
// «Quién lo hizo» (las horas por persona) no está en J06. Se queda porque es la ÚNICA forma de
// imputar HH desde el teléfono y ya funciona: sacarla para parecerse más al dibujo apagaría una
// escritura real. Va con su rótulo y su línea: son horas, no avance.
//
// ═══ LO QUE NO SE PUDO PORTAR ═══
//
// El botón de cámara del pie queda APAGADO. Una foto no tiene dónde guardarse: `obra_ejecucion`
// acepta un enlace de Drive (`evidencia`) y no una carga de archivo, y no hay bucket para esto.
//
// ═══ LO QUE SE AGREGA DESPUÉS DEL PORTE: POR QUÉ SE DESVIÓ ═══
//
// J06 dibuja «RENDIMIENTO 1,32× · 32 % arriba» en ámbar y no pregunta nada. `obra_causa_desvio`
// tenía UNA fila en dieciocho obras justamente por eso: el modelo sabe medir el desvío desde
// agosto y ninguna pantalla pedía la causa. El bloque va PEGADO a los azulejos —debajo del número
// que está en rojo— y sólo aparece cuando ese número está en rojo (`desvioDe`, puro y probado).
//
// Es lista cerrada + nota, nunca texto libre solo: diecinueve maneras de escribir «faltó material»
// no se pueden contar, y lo que no se puede contar no entra en la próxima cotización. Las causas
// salen de `public.causa_desvio` con su `orden`; el largo de la lista es una decisión del dueño
// sobre la columna `activa`, no un recorte de esta pantalla.

type Estado = { ok: boolean; mensaje: string } | null

export function FormularioAvance({
  actividad, frente, pasos, plantel, fecha, partes, impedimentos, causas, accion,
}: {
  actividad: ActividadDelJefe
  /** El frente sale del ÁRBOL, no de `rubro`: son dos jerarquías y no coinciden. Ver `frentes.ts`. */
  frente: string | null
  pasos: PasoDeActividad[]
  plantel: Esperado[]
  fecha: string
  partes: ParteDeTarea[]
  impedimentos: Impedimento[]
  /** El catálogo cerrado de `public.causa_desvio`, ya ordenado y sin las dadas de baja. */
  causas: { clave: string; nombre: string }[]
  accion: (estado: Estado, form: FormData) => Promise<Estado>
}) {
  const metodo = (actividad.metodo_avance ?? 'manual') as Metodo
  const control = controlDe(metodo)

  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(pasos.filter((p) => p.hecho_en).map((p) => p.id)))
  const [objetivo, setObjetivo] = useState<number | null>(null)
  const [cantidad, setCantidad] = useState(0)
  const [criterio, setCriterio] = useState('')
  const [gente, setGente] = useState<Record<string, string>>({})
  const [causa, setCausa] = useState('')
  const [nota, setNota] = useState('')
  const [estado, enviar, enviando] = useActionState(accion, null)

  // LA CUENTA NO SE REPITE ACÁ. `avancePorPasos` es la misma función que usa la vista y la
  // escritura; recalcularla en el formulario dejaba tres implementaciones de «peso hecho sobre peso
  // total», y la del formulario es la que la persona ve mientras decide.
  const pctPasos = avancePorPasos(pasos.map((p) => ({ peso: p.peso, hecho: marcados.has(p.id) })))
  const pesoTotal = pasos.reduce((s, p) => s + p.peso, 0)
  const pctVivo = control === 'pasos' ? pctPasos : actividad.avance_pct

  const faltaCriterio = metodo === 'manual' && criterio.trim() === ''
  const hayCambio = control === 'pasos'
    ? pasos.some((p) => marcados.has(p.id) !== !!p.hecho_en)
    : control === 'cantidad' ? cantidad > 0
      : objetivo != null && objetivo !== (actividad.avance_pct ?? -1)

  const rend = rendimientoDe(actividad)
  const plazo = plazoDe(actividad)
  const prod = produccionDe(actividad)
  const parado = impedimentos.length > 0
  const desvio = desvioDe(actividad)
  // La misma función que corre en la Server Action: acá avisa antes de enviar, allá decide.
  const avisoCausa = validarCausa({ causa, nota })

  return (
    <form action={enviar}>
      <input type="hidden" name="actividad_id" value={actividad.actividad_id} />
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="pasos" value={[...marcados].join(',')} />
      <input type="hidden" name="tipo_hora" value="normal" />
      <input type="hidden" name="causa_desvio" value={desvio.pedir ? causa : ''} />
      <input type="hidden" name="comentario" value={desvio.pedir ? nota : ''} />
      {control === 'cantidad' && <input type="hidden" name="cantidad" value={cantidad} />}
      {control === 'porcentaje' && <input type="hidden" name="avance_pct" value={objetivo ?? ''} />}

      <div style={{ padding: '16px 16px 104px' }}>
        {estado?.ok && (
          <div
            data-testid="resultado-avance"
            style={{
              background: C.posFondo, border: `1px solid ${C.posBorde}`, borderRadius: R.tarjeta,
              padding: '12px 14px', marginBottom: 12, display: 'flex', gap: 9, alignItems: 'center',
              fontSize: 13, color: C.pos,
            }}
          >
            <Icono nombre="ok" tamano={18} />
            {estado.mensaje}
          </div>
        )}
        {estado && !estado.ok && <AvisoError testid="resultado-avance">{estado.mensaje}</AvisoError>}

        {/* ── EL PROBLEMA PRIMERO. Si la tarea está frenada, es lo primero de la pantalla. ── */}
        {parado && (
          <div
            data-testid="tarea-parada"
            style={{
              background: C.negFondo, border: `1px solid ${C.negBorde}`, borderRadius: R.tarjeta,
              padding: 14, display: 'flex', alignItems: 'center', gap: 11, minHeight: 64, marginBottom: 14,
            }}
          >
            <span style={{ display: 'flex', color: C.neg, flexShrink: 0 }}><Icono nombre="bloqueo" tamano={22} /></span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>Frente parado</div>
              <div style={{ fontSize: 12.5, color: C.muted, marginTop: 1 }}>
                {impedimentos[0].descripcion?.trim() || 'Impedimento sin descripción'}
                {impedimentos.length > 1 ? ` · y ${impedimentos.length - 1} más` : ''}
              </div>
            </div>
          </div>
        )}

        {/* ── EL AVANCE, CON SU BARRA DE 9px Y SU PRODUCCIÓN ─────────────────────────── */}
        <div style={{ background: C.surface, border: `1px solid ${C.linea}`, borderRadius: R.tarjeta, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12.5, color: C.muted }}>Avance</span>
            <span style={{ ...mono, fontSize: 24, fontWeight: 600, color: C.ink }} data-testid="avance-tarea">
              {pctVivo == null ? '—' : pct(pctVivo)}
            </span>
          </div>
          <div style={{ height: 9, background: C.pista, borderRadius: 5, marginTop: 8, overflow: 'hidden' }}>
            {pctVivo != null && (
              <div style={{
                height: '100%', width: `${Math.max(0, Math.min(100, pctVivo))}%`,
                background: parado ? C.neg : pctVivo >= 100 ? C.pos : C.info,
              }} />
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 10 }}>
            <span style={{ ...mono, fontSize: 12.5, color: C.muted }}>
              {prod ? `${prod.texto}${prod.derivado ? ' (del %)' : ''}` : 'sin medición'}
            </span>
            <span style={{ ...mono, fontSize: 12.5, color: plazo.alerta ? C.warn : C.muted }}>
              {actividad.fin_plan ? `plan ${actividad.fin_plan.slice(8, 10)}/${actividad.fin_plan.slice(5, 7)}` : 'sin plan'}
            </span>
          </div>
        </div>

        {/* ── LOS TRES AZULEJOS DE J06 ───────────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, marginTop: 12 }} data-testid="tarea-metricas">
          <Azulejo
            icono="reloj" rotulo="HH REALES" tamanoValor={17} colorIcono={C.faint}
            valor={actividad.hh_real == null ? '—' : n1(actividad.hh_real)}
            detalle={actividad.hh_plan == null ? 'sin plan' : `de ${n1(actividad.hh_plan)} plan`}
          />
          <Azulejo
            icono="avance" rotulo="RENDIMIENTO" tamanoValor={17} colorIcono={C.faint}
            valor={rend.texto} colorValor={rend.alerta ? C.warn : C.ink}
            detalle={rend.detalle ?? 'sin las dos puntas'}
          />
          <Azulejo
            icono="fecha" rotulo="PLAZO" tamanoValor={17} colorIcono={C.faint}
            valor={plazo.texto} colorValor={plazo.alerta ? C.neg : C.ink} detalle={plazo.detalle}
          />
        </div>

        {/* ── ¿POR QUÉ SE DESVIÓ? — pegado al azulejo que está en rojo, y sólo cuando lo está ─ */}
        {desvio.pedir && (
          <div
            data-testid="causa-desvio"
            style={{
              marginTop: 12, background: C.warnFondo, border: `1px solid ${C.warnBorde}`,
              borderRadius: R.tarjeta, padding: 14,
            }}
          >
            <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <span style={{ display: 'flex', color: C.warn, flexShrink: 0, marginTop: 1 }}>
                <Icono nombre="alerta" tamano={18} />
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>¿Por qué se desvió?</div>
                <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2, lineHeight: 1.45 }}>
                  {desvio.motivo}. Elegí la causa: es lo que hace que la próxima cotización no
                  repita el error.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }} data-testid="causas">
              {causas.length === 0 ? (
                <Vacio testid="causas-vacio">
                  El catálogo de causas no cargó. Se puede guardar el avance igual; la causa queda sin
                  registrar.
                </Vacio>
              ) : causas.map((c) => {
                const on = causa === c.clave
                return (
                  <button
                    key={c.clave}
                    type="button"
                    data-testid="causa"
                    aria-pressed={on}
                    onClick={() => setCausa(on ? '' : c.clave)}
                    style={{
                      display: 'flex', alignItems: 'center', fontSize: 12.5, minHeight: 36,
                      border: `1px solid ${on ? C.grafito : C.linea}`,
                      background: on ? C.grafito : C.surface, color: on ? C.surface : C.inkSuave,
                      borderRadius: R.pastilla, padding: '7px 12px', cursor: 'pointer',
                      fontFamily: 'inherit', textAlign: 'left',
                    }}
                  >
                    {c.nombre}
                  </button>
                )
              })}
            </div>

            {/* LA NOTA ES OPCIONAL SALVO EN «otra causa»: sin nombre, «otro» es el texto libre que
                el catálogo vino a evitar, con forma de clave. Sólo aparece con una causa elegida —
                un campo de texto vacío arriba de todo invita a escribir en vez de a clasificar. */}
            {causa !== '' && (
              <div
                style={{
                  marginTop: 10, background: C.surface, borderRadius: R.controlChico, padding: 11,
                  border: `1px solid ${avisoCausa ? C.warn : C.linea}`,
                }}
              >
                <textarea
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  rows={2}
                  data-testid="causa-nota"
                  placeholder={causa === 'otro'
                    ? 'Escribí cuál fue la causa'
                    : 'Opcional: qué pasó, en dos palabras'}
                  style={{
                    border: 'none', background: 'transparent', fontSize: 14, color: C.ink,
                    width: '100%', padding: 0, resize: 'none', outline: 'none', fontFamily: 'inherit',
                  }}
                />
              </div>
            )}
            {avisoCausa && (
              <p data-testid="aviso-causa" style={{ marginTop: 6, fontSize: 11.5, color: C.warn, lineHeight: 1.5 }}>
                {avisoCausa}
              </p>
            )}
          </div>
        )}

        {/* ── EL CONTROL, SEGÚN EL MÉTODO ────────────────────────────────────────────── */}
        {control === 'pasos' && (
          <>
            <RotuloSeccion icono="paso" extra={`${marcados.size} de ${pasos.length}`}>Pasos</RotuloSeccion>
            <div style={{ marginTop: 9 }}>
              <TarjetaLista testid="pasos">
                {pasos.length === 0 ? (
                  <Vacio>Se mide por pasos y no tiene pasos cargados. Se definen en la planificación.</Vacio>
                ) : pasos.map((p) => {
                  const on = marcados.has(p.id)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      data-testid="paso"
                      aria-pressed={on}
                      onClick={() => setMarcados(alternar(marcados, p.id))}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px',
                        borderBottom: `1px solid ${C.divisor}`, minHeight: 52, width: '100%',
                        background: on ? C.quiet : 'transparent', border: 'none',
                        borderBottomWidth: 1, borderBottomStyle: 'solid', borderBottomColor: C.divisor,
                        textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      <span style={{
                        width: 26, height: 26, borderRadius: 13,
                        border: `2px solid ${on ? C.pos : C.lineaFuerte}`, background: on ? C.pos : C.surface,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                        color: C.surface,
                      }}>
                        {on && <Icono nombre="ok" tamano={14} grosor={3} />}
                      </span>
                      <span style={{
                        fontSize: 14, color: on ? C.inkSuave : C.ink, minWidth: 0, flex: 1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {p.nombre}
                        {p.tiempo_tecnico && <span style={{ color: C.warn }}> · no se apura</span>}
                      </span>
                      <span style={{ ...mono, fontSize: 12.5, color: C.muted, flexShrink: 0 }}>
                        {pesoTotal > 0 ? `${Math.round((p.peso / pesoTotal) * 100)} %` : `peso ${p.peso}`}
                      </span>
                    </button>
                  )
                })}
              </TarjetaLista>
            </div>
          </>
        )}

        {control === 'cantidad' && (
          <>
            <RotuloSeccion icono="paso">¿Cuánto se hizo hoy?</RotuloSeccion>
            <div style={{
              marginTop: 10, background: C.surface, border: `1px solid ${C.lineaFuerte}`,
              borderRadius: R.tarjeta, padding: 14,
            }} data-testid="cantidad">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <BotonRedondo etiqueta="Menos" onClick={() => setCantidad((v) => Math.max(0, v - 1))}>
                  <Icono nombre="menos" tamano={22} grosor={2.4} />
                </BotonRedondo>
                <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
                  <div style={{ ...mono, fontSize: 30, fontWeight: 600, color: C.ink, lineHeight: 1.1 }} data-testid="campo-cantidad">
                    {n2(cantidad)}
                  </div>
                  <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
                    {actividad.unidad ?? 'unidades'} de hoy
                  </div>
                </div>
                <BotonRedondo etiqueta="Más" marca onClick={() => setCantidad((v) => v + 1)}>
                  <Icono nombre="mas" tamano={22} grosor={2.4} />
                </BotonRedondo>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {[5, 10, 15, 20].map((v) => (
                  <button
                    key={v}
                    type="button"
                    data-testid="atajo-cantidad"
                    onClick={() => setCantidad((x) => x + v)}
                    style={{
                      flex: 1, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: `1px solid ${C.linea}`, background: C.surface, color: C.ink,
                      borderRadius: R.controlChico, ...mono, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    +{v}
                  </button>
                ))}
              </div>
              <p style={{
                display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12.5,
                color: cantidad > 0 ? C.pos : C.faint,
              }}>
                <Icono nombre={cantidad > 0 ? 'ok' : 'info'} tamano={15} />
                {cantidad > 0
                  ? `${n2(cantidad)} ${actividad.unidad ?? ''} de hoy, sobre lo que ya estaba cargado`.trim()
                  : 'tocá + o un atajo para cargar'}
              </p>
            </div>
          </>
        )}

        {control === 'porcentaje' && (
          <>
            <RotuloSeccion icono="paso">¿A cuánto llegó?</RotuloSeccion>
            <div style={{
              marginTop: 10, background: C.surface, border: `1px solid ${C.lineaFuerte}`,
              borderRadius: R.tarjeta, padding: 14,
            }} data-testid="porcentaje">
              <div style={{ display: 'flex', gap: 7 }}>
                {VALORES_MASIVOS.map((v) => {
                  const on = objetivo === v
                  return (
                    <button
                      key={v}
                      type="button"
                      data-testid="valor-avance"
                      aria-pressed={on}
                      onClick={() => setObjetivo(v)}
                      style={{
                        flex: 1, minHeight: 44, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: 1,
                        border: `1px solid ${on ? C.grafito : C.linea}`,
                        background: on ? C.grafito : C.surface, color: on ? C.surface : C.ink,
                        borderRadius: R.controlChico, cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      <span style={{ ...mono, fontSize: 13, fontWeight: 600 }}>{v}%</span>
                    </button>
                  )
                })}
              </div>
              <p style={{ marginTop: 10, fontSize: 12, color: C.faint, lineHeight: 1.5 }}>
                Total de la tarea, no lo de hoy. Venía en {actividad.avance_pct == null ? 'sin medir' : pct(actividad.avance_pct)}.
                Se mide por {ROTULO_METODO[metodo].toLowerCase()}.
              </p>
            </div>
          </>
        )}

        {metodo === 'manual' && (
          <div style={{
            marginTop: 12, background: C.surface, border: `1px solid ${faltaCriterio ? C.warnBorde : C.lineaFuerte}`,
            borderRadius: R.tarjeta, padding: 12,
          }}>
            <textarea
              name="criterio"
              value={criterio}
              onChange={(e) => setCriterio(e.target.value)}
              rows={3}
              data-testid="campo-criterio"
              placeholder="Con qué criterio: 3 de 4 paños terminados, falta el del eje sur"
              style={{
                border: 'none', background: 'transparent', fontSize: 14, color: C.ink, width: '100%',
                padding: 0, resize: 'none', outline: 'none', fontFamily: 'inherit',
              }}
            />
            {faltaCriterio && (
              <p data-testid="aviso-criterio" style={{ marginTop: 6, fontSize: 11.5, color: C.warn, lineHeight: 1.5 }}>
                {AVISO_CRITERIO}
              </p>
            )}
          </div>
        )}

        {/* ── QUIÉN LO HIZO — HORAS, NO AVANCE ───────────────────────────────────────── */}
        <RotuloSeccion icono="cuadrilla" extra={frente ?? 'sin frente'}>Quién lo hizo</RotuloSeccion>
        <div style={{ marginTop: 9 }}>
          <TarjetaLista testid="quien">
            {plantel.length === 0 ? (
              <Vacio>Nadie asignado a esta obra. Las asignaciones las carga Administración, desde Personal.</Vacio>
            ) : plantel.map((p) => (
              <label
                key={p.id}
                data-testid="persona-hh"
                style={{
                  display: 'flex', alignItems: 'center', gap: 11, padding: '11px 13px',
                  borderBottom: `1px solid ${C.divisor}`, minHeight: 56,
                }}
              >
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 14, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.nombre_completo}
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, color: C.muted, marginTop: 1 }}>
                    {p.categoria ?? 'sin categoría'}
                  </span>
                </span>
                <input
                  name={`hh_${p.id}`}
                  inputMode="decimal"
                  value={gente[p.id] ?? ''}
                  onChange={(e) => setGente({ ...gente, [p.id]: e.target.value })}
                  placeholder="—"
                  aria-label={`Horas de ${p.nombre_completo}`}
                  style={{
                    height: 48, width: 72, flexShrink: 0, borderRadius: R.controlChico,
                    border: `1px solid ${C.linea}`, background: C.quiet, textAlign: 'center',
                    ...mono, fontSize: 16, color: C.ink, outline: 'none',
                  }}
                />
                <span style={{ flexShrink: 0, fontSize: 12.5, color: C.muted }}>hs</span>
              </label>
            ))}
          </TarjetaLista>
        </div>
        <p style={{ marginTop: 7, fontSize: 11, color: C.faint, lineHeight: 1.5 }}>
          Son horas: van a las HH y no mueven el avance.
        </p>

        {/* ── ÚLTIMOS PARTES ─────────────────────────────────────────────────────────── */}
        <RotuloSeccion icono="historial">Últimos partes</RotuloSeccion>
        <div style={{ marginTop: 9 }}>
          <TarjetaLista testid="ultimos-partes">
            {partes.length === 0 ? (
              <Vacio>Todavía nadie cargó un parte contra esta tarea.</Vacio>
            ) : partes.map((p) => (
              <div
                key={p.id}
                data-testid="parte"
                style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderBottom: `1px solid ${C.divisor}` }}
              >
                <span style={{ ...mono, fontSize: 12, color: C.faint, width: 42, flexShrink: 0 }}>
                  {p.fecha.slice(8, 10)}/{p.fecha.slice(5, 7)}
                </span>
                <span style={{ ...mono, fontSize: 13.5, fontWeight: 600, color: C.ink }}>
                  {p.cantidad != null
                    ? `+${n2(p.cantidad)} ${actividad.unidad ?? ''}`.trim()
                    : p.avance_pct != null ? `+${n1(p.avance_pct)} %` : 'paso marcado'}
                </span>
                <span style={{ ...mono, marginLeft: 'auto', fontSize: 12.5, color: C.muted, flexShrink: 0 }}>
                  {p.metodo ?? '—'}
                </span>
              </div>
            ))}
          </TarjetaLista>
        </div>
      </div>

      <PieFijo>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            {/* LA CAUSA NO BLOQUEA EL PARTE, PERO LA OMISIÓN QUEDA ESCRITA EN EL BOTÓN. Perder la
                producción del día —medida en obra, cara— para no perder su clasificación —barata—
                sería cambiar lo importante por lo accesorio. Lo que NO se puede es que el jefe se
                vaya creyendo que explicó algo. `otro` sin nombre sí frena: no clasifica nada. */}
            <BotonAncho
              activo={!enviando && !faltaCriterio && !avisoCausa && hayCambio}
              icono="ok"
              testid="guardar-avance"
            >
              {enviando ? 'Guardando…'
                : faltaCriterio ? 'Falta el criterio'
                  : avisoCausa ? 'Falta cuál fue la causa'
                    : !hayCambio ? (control === 'pasos' ? 'Marcá el paso alcanzado' : 'Poné cuánto se hizo')
                      : desvio.pedir && causa === '' ? 'Guardar sin explicar el desvío'
                        : 'Guardar avance'}
            </BotonAncho>
          </div>
          {/* SIN DESTINO NO HAY BOTÓN VIVO. Una foto no tiene dónde guardarse: queda a la vista,
              apagado, con el motivo en su `title`. Un hueco declarado se resuelve; uno borrado se
              olvida. */}
          <span
            data-testid="sacar-foto"
            title="Sacar foto — todavía no hay dónde guardarla: la evidencia viaja como enlace de Drive"
            aria-disabled
            style={{
              width: 52, minHeight: 52, borderRadius: R.control, border: `1px solid ${C.linea}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.tenue,
              flexShrink: 0, cursor: 'not-allowed',
            }}
          >
            <Icono nombre="foto" tamano={21} />
          </span>
        </div>
      </PieFijo>
    </form>
  )
}

/** El círculo de 48 de M04: «−» en hairline, «+» en amarillo de marca. */
function BotonRedondo({ children, etiqueta, marca, onClick }: {
  children: React.ReactNode
  etiqueta: string
  marca?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={etiqueta}
      aria-label={etiqueta}
      onClick={onClick}
      className={marca ? HOVER_MARCA : HOVER_CANVAS}
      style={{
        width: 48, height: 48, borderRadius: 24, flexShrink: 0,
        border: marca ? 'none' : `1px solid ${C.linea}`, background: marca ? C.marca : C.surface,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink, cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function alternar(s: Set<string>, id: string): Set<string> {
  const n = new Set(s)
  if (n.has(id)) n.delete(id)
  else n.add(id)
  return n
}

const n1 = (v: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(v)
const n2 = (v: number) =>
  new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)
