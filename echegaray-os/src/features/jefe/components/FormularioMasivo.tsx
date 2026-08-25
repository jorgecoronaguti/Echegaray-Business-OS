'use client'

import { useActionState, useRef, useState } from 'react'
import { C, HOVER_SUAVE, R, pct } from '@/shared/components/movil/tokens'
import { Icono } from '@/shared/components/movil/Iconos'
import {
  AvisoError, FranjaFiltros, TopBarDetalle, Vacio, mono,
} from '@/shared/components/movil/Piezas'
import {
  AVISO_CRITERIO, VISTAS_MASIVAS, avisoDePrecision, enVista, opcionesMasivas, renglones, vistaInicial,
} from '../services/medicion'
import type { Renglon, VistaMasiva } from '../services/medicion'
import type { ActividadDelJefe } from '../services/jefeService'

// J04 · AVANCE DEL DÍA — porte literal de `J04 · Jefe Avance masivo.dc.html`.
//
// ═══ CADA TAREA CON SU PROPIO PORCENTAJE — ES EL CAMBIO DE FONDO ═══
//
// La versión anterior tenía UN valor para toda la selección: se marcaban diez tareas y las diez
// iban al mismo número. El mockup pone los pasos DENTRO de cada tarjeta y en su ejemplo guarda una
// al 80 % y otra al 65 % en el mismo envío. Eso es lo que hace que la pantalla sirva para cerrar un
// día real, donde cada frente llegó hasta donde llegó. La regla del formato de envío —`id:80,id:65`—
// vive en `medicion.ts` con su test, y el servidor la vuelve a validar.
//
// ═══ LA TAREA QUE NO SE PUEDE APLICAR SE MUESTRA APAGADA, NO SE ESCONDE ═══
//
// Una medida por cantidad o por pasos no se mueve con un porcentaje: la vista la calcula de otra
// manera y la fila entraría sin efecto. Esconderla dejaría al jefe buscando una tarea que él sabe
// que existe; mostrarla tocable produciría un éxito informado con el dato quieto, que es peor.
//
// ═══ EL PIE DICE QUÉ HACER CUANDO NO HAY NADA ELEGIDO ═══
//
// Sin selección el mockup no dibuja un botón apagado: dibuja la instrucción, «Tocá los frentes que
// avanzaron hoy». Un botón que no puede hacer nada enseña a ignorar los botones.

type Estado = { ok: boolean; mensaje: string } | null

export function FormularioMasivo({
  actividades, frentes, fecha, obraNombre, volver, accion,
}: {
  actividades: ActividadDelJefe[]
  /** `actividad_id` → nombre del frente, sacado del ÁRBOL. Ver el porqué en `frentes.ts`. */
  frentes: Record<string, string>
  fecha: string
  obraNombre: string
  volver: { href: string; label: string }
  accion: (estado: Estado, form: FormData) => Promise<Estado>
}) {
  const filas = renglones(actividades)
  const porId = new Map(actividades.map((a) => [a.actividad_id, a]))
  const [vista, setVista] = useState<VistaMasiva>(() => vistaInicial(filas))
  const [elegidas, setElegidas] = useState<Record<string, number>>({})
  const [criterio, setCriterio] = useState('')
  const [estado, enviar, enviando] = useActionState(accion, null)
  // La barra aplica con `requestSubmit()` porque el botón vive fuera del flujo del formulario.
  const formulario = useRef<HTMLFormElement | null>(null)

  // TRAS UN GUARDADO EXITOSO LA SELECCIÓN SE VACÍA — y con ella se va la barra. Dejarla abierta
  // ofreciendo «Guardar N avances» invita a un segundo toque, y como el guardado escribe
  // INCREMENTOS ese segundo toque no es inocuo: duplica el avance (defecto observado el 24/08).
  // Estado DERIVADO en render, no en un efecto: un `useEffect` con `setState` pinta un frame con la
  // selección vieja antes de vaciarla, y además es el anti-patrón que marca eslint.
  const [ultimoOk, setUltimoOk] = useState<Estado>(null)
  if (estado?.ok && estado !== ultimoOk) {
    setUltimoOk(estado)
    setElegidas({})
  }

  const visibles = filas.filter((f) => enVista(f, vista))
  const aplicables = visibles.filter((f) => f.aplicable)
  const ids = Object.keys(elegidas)
  const seleccion = filas.filter((f) => ids.includes(f.actividad_id))
  const aviso = avisoDePrecision(seleccion)
  const exigeCriterio = seleccion.some((f) => f.metodo === 'manual')
  const faltaCriterio = exigeCriterio && criterio.trim() === ''

  const alternar = (f: Renglon) => setElegidas((prev) => {
    const copia = { ...prev }
    if (copia[f.actividad_id] != null) delete copia[f.actividad_id]
    else copia[f.actividad_id] = opcionesMasivas(f.avance_pct)[0]
    return copia
  })

  return (
    <form action={enviar} ref={formulario}>
      <input type="hidden" name="fecha" value={fecha} />
      <input type="hidden" name="tareas" value={ids.map((id) => `${id}:${elegidas[id]}`).join(',')} />
      {exigeCriterio && <input type="hidden" name="criterio" value={criterio} />}

      <TopBarDetalle
        volver={volver}
        testidVolver="volver-jefe"
        titulo="Avance del día"
        sub={`${obraNombre} · ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`}
        accion={aplicables.length > 0 ? (
          <button
            type="button"
            data-testid="todas-ninguna"
            title={ids.length > 0 ? 'Deseleccionar todo' : 'Seleccionar lo que está en curso'}
            onClick={() => setElegidas(ids.length > 0
              ? {}
              // «Todas» marca LO QUE SE VE, no lo que existe: con la vista filtrada, guardar tareas
              // fuera de pantalla es exactamente la escritura que nadie pidió.
              : Object.fromEntries(aplicables.map((f) => [f.actividad_id, opcionesMasivas(f.avance_pct)[0]])))}
            className={HOVER_SUAVE}
            style={{
              width: 44, height: 44, borderRadius: 22, display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: C.muted, flexShrink: 0, border: 'none',
              background: 'transparent', cursor: 'pointer',
            }}
          >
            <Icono nombre={ids.length > 0 ? 'ninguno' : 'masivo'} tamano={20} />
          </button>
        ) : undefined}
      />

      {filas.length > 0 && (
        <FranjaFiltros testid="vistas-masivo">
          {VISTAS_MASIVAS.map(([id, label]) => {
            const activa = vista === id
            return (
              <button
                key={id}
                type="button"
                data-testid={`vista-${id}`}
                aria-pressed={activa}
                // CAMBIAR DE VISTA SUELTA LA SELECCIÓN: sin esto, una tarea marcada en «En curso» se
                // guarda desde «Sin arrancar» sin estar en pantalla.
                onClick={() => { setVista(id); setElegidas({}) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5,
                  border: `1px solid ${activa ? C.grafito : C.linea}`,
                  background: activa ? C.grafito : C.surface,
                  color: activa ? C.surface : C.inkSuave,
                  borderRadius: R.pastilla, padding: '7px 12px', whiteSpace: 'nowrap', minHeight: 36,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                {label}
                <span style={{ ...mono, fontSize: 11, color: activa ? C.grafitoTenue : C.faint }}>
                  {filas.filter((f) => enVista(f, id)).length}
                </span>
              </button>
            )
          })}
        </FranjaFiltros>
      )}

      <div style={{ padding: '14px 16px 152px' }}>
        {estado?.ok && (
          <div
            data-testid="resultado-masivo"
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
        {estado && !estado.ok && <AvisoError testid="resultado-masivo">{estado.mensaje}</AvisoError>}

        {filas.length === 0 ? (
          <Vacio testid="masivo-vacio">
            Esta obra no tiene tareas que se puedan medir. Los frentes agrupan, no se miden: el
            avance se carga en las tareas que cuelgan de ellos.
          </Vacio>
        ) : visibles.length === 0 ? (
          <Vacio testid="masivo-sin-vista">Nada en este filtro.</Vacio>
        ) : visibles.map((f) => {
          const valor = elegidas[f.actividad_id]
          const on = valor != null
          const a = porId.get(f.actividad_id)
          return (
            <div
              key={f.actividad_id}
              data-testid={f.aplicable ? 'tarea-masiva' : 'tarea-no-aplicable'}
              style={{
                background: C.surface, border: `1.5px solid ${on ? C.marca : C.linea}`,
                borderRadius: R.tarjeta, padding: '13px 14px', marginBottom: 10,
                opacity: f.aplicable ? 1 : 0.72,
              }}
            >
              <button
                type="button"
                disabled={!f.aplicable}
                aria-pressed={on}
                onClick={() => alternar(f)}
                style={{
                  display: 'flex', alignItems: 'flex-start', gap: 11, width: '100%',
                  background: 'transparent', border: 'none', padding: 0, textAlign: 'left',
                  cursor: f.aplicable ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
                }}
              >
                <span style={{
                  width: 44, height: 44, marginLeft: -9, marginTop: -9, display: 'flex',
                  alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <span style={{
                    width: 24, height: 24, borderRadius: 7,
                    border: `2px solid ${on ? C.marca : C.lineaFuerte}`,
                    background: on ? C.marca : C.surface, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: C.ink,
                  }}>
                    {on && <Icono nombre="ok" tamano={14} grosor={3} />}
                  </span>
                </span>
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: C.ink, lineHeight: 1.3 }}>
                    {f.nombre}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12, color: C.muted }}>{frentes[f.actividad_id] ?? 'sin frente'}</span>
                    <span style={{ color: C.lineaFuerte }}>·</span>
                    <span style={{ ...mono, fontSize: 12, color: f.aplicable ? C.muted : C.warn }}>
                      {f.motivo ?? restanteDe(a)}
                    </span>
                  </span>
                </span>
                <span style={{ textAlign: 'right', flexShrink: 0 }}>
                  <span style={{ ...mono, display: 'block', fontSize: 15, fontWeight: 600, color: (f.avance_pct ?? 0) > 0 ? C.ink : C.faint }}>
                    {f.avance_pct == null ? '—' : pct(f.avance_pct)}
                  </span>
                  {on && valor > (f.avance_pct ?? 0) && (
                    <span style={{ ...mono, display: 'flex', alignItems: 'center', gap: 3, fontSize: 11.5, color: C.pos, justifyContent: 'flex-end' }}>
                      <Icono nombre="tope" tamano={11} grosor={2.6} />
                      {valor}%
                    </span>
                  )}
                </span>
              </button>

              {on && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.divisorSuave}` }}>
                  <div style={{ display: 'flex', gap: 7 }}>
                    {opcionesMasivas(f.avance_pct).map((v) => {
                      const elegido = valor === v
                      return (
                        <button
                          key={v}
                          type="button"
                          data-testid="paso-masivo"
                          aria-pressed={elegido}
                          onClick={() => setElegidas((prev) => ({ ...prev, [f.actividad_id]: v }))}
                          style={{
                            flex: 1, minHeight: 44, display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center', gap: 1,
                            border: `1px solid ${elegido ? C.grafito : C.linea}`,
                            background: elegido ? C.grafito : C.surface,
                            color: elegido ? C.surface : C.ink,
                            borderRadius: R.controlChico, cursor: 'pointer', fontFamily: 'inherit',
                          }}
                        >
                          <span style={{ ...mono, fontSize: 13, fontWeight: 600 }}>{v}%</span>
                          <span style={{ fontSize: 9.5, color: elegido ? C.grafitoTenue : C.faint, whiteSpace: 'nowrap' }}>
                            {f.metodo === 'manual' ? 'manual' : '%'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  {f.pierdePrecision && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9, fontSize: 11.5, color: C.warn }}>
                      <Icono nombre="alerta" tamano={14} />
                      medición manual: queda registrado como estimado
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {ids.length === 0 ? (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, margin: '0 auto', maxWidth: 430,
          background: C.surface, borderTop: `1px solid ${C.linea}`, padding: '14px 16px 18px',
          display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: C.faint, zIndex: 20,
        }} data-testid="sin-eleccion">
          <Icono nombre="info" tamano={16} />
          {aplicables.length === 0
            ? 'Ninguna tarea de este filtro se puede cargar por porcentaje.'
            : 'Tocá los frentes que avanzaron hoy'}
        </div>
      ) : (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, margin: '0 auto', maxWidth: 430,
          background: C.surface, borderTop: `1px solid ${C.linea}`, padding: '12px 16px 16px', zIndex: 20,
        }} data-testid="barra-masivo">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
              {ids.length} {ids.length === 1 ? 'frente' : 'frentes'}
            </span>
            <span style={{ fontSize: 12.5, color: C.muted }}>·</span>
            <span style={{ fontSize: 12.5, color: aviso ? C.warn : C.muted, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {faltaCriterio ? AVISO_CRITERIO : aviso ?? 'con pasos definidos'}
            </span>
            <button
              type="button"
              onClick={() => setElegidas({})}
              style={{ marginLeft: 'auto', fontSize: 12.5, color: C.muted, padding: 6, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Cancelar
            </button>
          </div>
          {exigeCriterio && (
            <textarea
              value={criterio}
              onChange={(e) => setCriterio(e.target.value)}
              rows={2}
              data-testid="criterio-masivo"
              placeholder="Con qué criterio (lo exige el método manual)"
              style={{
                width: '100%', borderRadius: R.controlChico, border: `1px solid ${C.lineaFuerte}`,
                padding: '8px 10px', fontSize: 13, color: C.ink, marginBottom: 10, resize: 'none',
                outline: 'none', fontFamily: 'inherit',
              }}
            />
          )}
          <button
            type="button"
            disabled={enviando || faltaCriterio}
            data-testid="guardar-masivo"
            onClick={() => formulario.current?.requestSubmit()}
            style={{
              width: '100%', minHeight: 52, borderRadius: R.control,
              background: enviando || faltaCriterio ? C.inerte : C.marca,
              color: enviando || faltaCriterio ? C.faint : C.ink,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
              fontSize: 16, fontWeight: 600, border: 'none', fontFamily: 'inherit',
              cursor: enviando || faltaCriterio ? 'not-allowed' : 'pointer',
            }}
          >
            <Icono nombre="ok" tamano={20} grosor={2.4} />
            {enviando ? 'Guardando…' : `Guardar ${ids.length} ${ids.length === 1 ? 'avance' : 'avances'}`}
          </button>
        </div>
      )}
    </form>
  )
}

/**
 * «24,96 m² restantes» — el renglón que J04 pone al lado del frente.
 *
 * Sin objetivo o sin porcentaje NO se escribe un número: con una sola punta daría 0 («no falta
 * nada», o sea terminada) o el objetivo entero («no se hizo nada»), y las dos mentiras son
 * creíbles. Se dice con qué se mide, que es lo que sí se sabe.
 */
function restanteDe(a: ActividadDelJefe | undefined): string {
  if (!a) return 'sin datos'
  if (a.cantidad_objetivo == null || a.avance_pct == null) {
    return a.avance_pct == null ? 'sin medición' : `${100 - a.avance_pct} % restante`
  }
  const falta = Math.max(0, a.cantidad_objetivo * (1 - a.avance_pct / 100))
  const n = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(falta)
  return `${n}${a.unidad ? ` ${a.unidad}` : ''} restantes`
}
