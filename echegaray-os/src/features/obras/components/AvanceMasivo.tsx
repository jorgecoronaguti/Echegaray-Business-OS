'use client'

// ═══ 06 · AVANCE MASIVO — PORTE LITERAL DE «06 · Avance masivo.dc.html» ═══
//
//   grilla    `18px minmax(0,1.6fr) 132px 140px minmax(0,260px) 116px`
//   cabecera  40px sobre `#FAFAF8`, casilla maestra de 18px con borde de 1,5px
//   fila      `minHeight:48px; padding:7px 14px`; marcada sobre `#FEF9E6`
//   opciones  `minWidth:44px; minHeight:30px; borderRadius:7px`, valor mono 11,5px/600
//   barra     fija abajo, con la primaria amarilla y `boxShadow:0 -2px 12px rgba(31,31,30,.06)`
//
// Es una pantalla aparte de la 03 y no una vista suya: acá el árbol se APLANA a propósito. Cuando
// lo que se está haciendo es cerrar veinte actividades de un frente, los rubros y los carets son
// pasos de más — la jerarquía queda en la sangría y nada se pliega.
//
// ═══ CADA FILA ELIGE SU PROPIO VALOR, Y ESO CAMBIÓ EL ENVÍO (24/08/2026) ═══
//
// Hasta hoy la pantalla aplicaba UN valor a toda la selección: `aplicarEnLote` recibe una operación
// y un valor para todos los ids. El canónico dibuja los botones POR FILA, y tiene razón —cerrar una
// jornada es «ésta al 80, ésta al 100, ésta al 30», no «todas al mismo número»—.
//
// La solución NO fue tocar el motor: se AGRUPAN las filas por el valor elegido y se llama a
// `aplicarEnLote` una vez por valor distinto. Cada llamada vuelve a validar del lado del servidor,
// vuelve a acotar por `obra_id` y revalida. Cuatro valores distintos son cuatro llamadas, no
// cuarenta; y el resultado que se informa es la SUMA de lo que cada una dijo haber tocado, nunca
// la cantidad de filas tildadas.
//
// ═══ LO QUE «QUEDA EN» PROMETE ES LO QUE SE ESCRIBE ═══
//
// La columna muestra, fila por fila, el valor que se va a escribir y con qué calidad de dato queda.
// Una actividad medida por PASOS no entra: su porcentaje lo produce el tildado de los pasos y un
// número general no lo movería (`operacionCompatible`). Su casilla queda apagada y dice por qué —
// prometerle una escritura que el servidor rechaza es peor que no ofrecerla.

import { useMemo, useState } from 'react'
import { C, ESTILO_PRIMARIA, MONO } from './canon/tokens'
import { Ico, P } from './canon/Ico'
import { Buscador, Chip, Hover, Tarjeta } from './canon/Piezas'
import { SubNavTrabajo } from './SubNavTrabajo'
import { cantidad as fmtCantidad, porcentaje } from './formato'
import { type NodoObra } from '../services/wbs'
import { coincide } from '../services/vistaArbol'
import { frenteDeCamino } from '../services/frente'
import {
  escalonesDeAvance, operacionCompatible, seleccionable, type CandidataMasiva,
} from '../services/avance'
import { METODO_CORTO } from '../types'
import type { ResultadoMasivo } from '../services/actionsMasivas'

const GRID = '18px minmax(0,1.6fr) 132px 140px minmax(0,260px) 116px'
const ROTULO: React.CSSProperties = { fontSize: '10px', color: C.tenue, letterSpacing: '.05em' }

/** Los tres cortes del canónico, con el texto del zip. */
const CORTES = [
  { k: 'curso', t: 'En curso' },
  { k: 'pend', t: 'Sin arrancar' },
  { k: 'todo', t: 'Todas' },
] as const
type Corte = (typeof CORTES)[number]['k']

function candidata(n: NodoObra): CandidataMasiva {
  return {
    id: n.id, metodo_avance: n.metodo_avance, cantidad_objetivo: n.cantidad_objetivo,
    avance_pct: n.avance_pct, es_contenedor: n.es_contenedor, es_subcontrato: n.es_subcontrato,
    n_pasos: n.n_pasos,
  }
}

/** El corte, sobre el avance ya publicado. «Sin arrancar» incluye el avance NULO: nadie lo midió,
 *  y esconderlo dejaría afuera justo a las que hay que cargar. */
function pasaElCorte(n: NodoObra, corte: Corte): boolean {
  if (corte === 'todo') return true
  const a = n.avance_pct
  if (corte === 'curso') return a !== null && a > 0 && a < 100
  return !n.es_contenedor && (a === null || a === 0)
}

/** La calidad con la que queda el dato — la sub-línea de «QUEDA EN» del zip. */
function calidadDe(n: NodoObra): { t: string; c: string } {
  if (n.metodo_avance === 'cantidad') return { t: 'medido', c: C.pos }
  return { t: 'estimado', c: C.warn }
}

/** El ícono y el color del método (zip: pasos verde · cantidad tinta · manual y sin definir ámbar). */
function metaMetodo(n: NodoObra, puedo: boolean) {
  if (!puedo) return { d: P.alerta, c: C.warn, t: 'Sin definir', tip: 'No tiene medición cargada' }
  if (n.metodo_avance === 'pasos') return { d: P.paso, c: C.pos, t: 'Pasos', tip: 'El % sale de pasos definidos' }
  if (n.metodo_avance === 'cantidad') return { d: P.cantidad, c: C.tintaMedia, t: 'Cantidad', tip: 'Se carga cantidad ejecutada' }
  return { d: P.editar, c: C.warn, t: METODO_CORTO[n.metodo_avance], tip: 'Estimación manual: dato menos preciso' }
}

export function AvanceMasivo({ obraId, nodos, aplicarEnLote }: {
  obraId: string
  nodos: NodoObra[]
  /** Las cuadrillas siguen llegando por compatibilidad con quien monta la pantalla; esta versión no
   *  reasigna cuadrillas — eso es una operación del panel de la tarea, no del cierre de jornada. */
  cuadrillas?: { id: string; nombre: string }[]
  aplicarEnLote: (form: FormData) => Promise<ResultadoMasivo>
}) {
  const [query, setQuery] = useState('')
  // ARRANCA EN «TODAS» y no en «En curso» como el zip: medido contra la base, las actividades de
  // las obras vivas están sin medición y su avance es NULO, así que «En curso» abriría la pantalla
  // vacía justo donde se entra a cargar el primer avance. El corte sigue estando, a un clic.
  const [corte, setCorte] = useState<Corte>('todo')
  /** id → porcentaje elegido. Presente = fila marcada; el valor ES la selección. */
  const [elegido, setElegido] = useState<Record<string, number>>({})
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<string | null>(null)

  // LOS RUBROS NO ENTRAN. El canónico 06 lista actividades planas con su frente como sub-línea, y
  // un contenedor no se puede seleccionar nunca: dibujarlo con las cinco celdas vacías y la casilla
  // apagada es ruido en la pantalla donde se cierra la jornada. La jerarquía no se pierde — viaja
  // en la sub-línea de cada fila (`frenteDeCamino`).
  const visibles = useMemo(
    () => nodos.filter((n) => !n.es_contenedor
      && coincide(n, n.avance_pct, 'todo', query, '') && pasaElCorte(n, corte)),
    [nodos, query, corte],
  )
  const aplicables = visibles.filter((n) => operacionCompatible(candidata(n), 'avance'))
  const ids = Object.keys(elegido)
  const seleccionadas = nodos.filter((n) => elegido[n.id] !== undefined)
  const estimadas = seleccionadas.filter((n) => n.metodo_avance !== 'cantidad').length

  const marcar = (n: NodoObra) => {
    if (!operacionCompatible(candidata(n), 'avance')) return
    setElegido((p) => {
      const c = { ...p }
      if (c[n.id] !== undefined) delete c[n.id]
      else c[n.id] = escalonesDeAvance(n.avance_pct)[0] ?? 100
      return c
    })
  }

  const guardar = async () => {
    setEnviando(true)
    setResultado(null)
    // UNA LLAMADA POR VALOR DISTINTO. El motor recibe una operación y un valor por lote; agrupar es
    // lo que deja que cada fila tenga el suyo sin tocar la escritura ni su validación.
    const porValor = new Map<number, string[]>()
    for (const [id, v] of Object.entries(elegido)) {
      const previos = porValor.get(v) ?? []
      previos.push(id)
      porValor.set(v, previos)
    }
    let tocadas = 0
    let salteadas = 0
    for (const [v, lote] of porValor) {
      const form = new FormData()
      form.set('operacion', 'avance')
      form.set('valor', String(v))
      for (const id of lote) form.append('id', id)
      const r = await aplicarEnLote(form)
      // UN FALLO PARCIAL SE DICE ENSEGUIDA Y NO SE SIGUE: lo ya escrito quedó escrito, y decir
      // «guardé 20» sobre un lote que falló a la mitad es exactamente la mentira que esta pantalla
      // existe para no cometer.
      if (!r.ok) {
        setResultado(`Se registraron ${tocadas} y falló el resto: ${r.error}`)
        setEnviando(false)
        return
      }
      tocadas += r.tocadas
      salteadas += r.salteadas
    }
    setElegido({})
    setEnviando(false)
    setResultado(
      `${tocadas} avance${tocadas === 1 ? '' : 's'} registrado${tocadas === 1 ? '' : 's'}`
      + (salteadas > 0 ? ` · ${salteadas} sin tocar: se miden por pasos o no tienen cantidad objetivo` : ''),
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <SubNavTrabajo obraId={obraId} sub="arbol" derecha={
        <>
          <Buscador valor={query} alCambiar={setQuery} alLimpiar={() => { setQuery(''); setCorte('todo') }}
            ancho={208} placeholder="Buscar actividad" testid="buscar-masivo" />
          {CORTES.map((c) => (
            <Chip key={c.k} activo={corte === c.k} onClick={() => setCorte(c.k)}
              n={String(nodos.filter((n) => pasaElCorte(n, c.k)).length)}>{c.t}</Chip>
          ))}
        </>
      } />

      <div style={{ padding: '14px 20px 96px' }}>
        {resultado && (
          <p data-testid="masivo-resultado" style={{
            margin: '0 0 10px', borderLeft: `3px solid ${C.pos}`, background: C.posFondo,
            padding: '8px 12px', fontSize: '12.5px', color: C.pos,
          }}>{resultado}</p>
        )}

        <Tarjeta testid="tabla-masiva">
          <div style={{
            display: 'grid', gridTemplateColumns: GRID, gap: '10px', alignItems: 'center',
            height: '40px', borderBottom: `1px solid ${C.borde}`, background: C.tenueFondo,
            padding: '0 14px',
          }}>
            {/* LA CASILLA MAESTRA MARCA LO VISIBLE, no la obra entera: lo que se ve es lo que se
                promete. Con un filtro puesto, «todo» significa «todo esto». */}
            <Casilla marcada={ids.length > 0} testid="sel-todo"
              etiqueta={ids.length > 0 ? 'Quitar la selección' : 'Seleccionar todo lo visible'}
              onClick={() => setElegido(ids.length > 0
                ? {}
                : Object.fromEntries(aplicables.map((n) => [n.id, escalonesDeAvance(n.avance_pct)[0] ?? 100])))} />
            <span style={ROTULO}>ACTIVIDAD</span>
            <span style={ROTULO}>MÉTODO</span>
            <span style={{ ...ROTULO, textAlign: 'right' }}>ACUMULADO</span>
            <span style={ROTULO}>HOY</span>
            <span style={{ ...ROTULO, textAlign: 'right' }}>QUEDA EN</span>
          </div>

          {visibles.map((n) => {
            const puedo = operacionCompatible(candidata(n), 'avance')
            const medible = seleccionable(candidata(n))
            const v = elegido[n.id]
            const on = v !== undefined
            const m = metaMetodo(n, medible)
            const cal = calidadDe(n)
            return (
              <Hover key={n.id} data-testid={`masivo-fila-${n.id}`}
                onClick={() => marcar(n)}
                base={{
                  display: 'grid', gridTemplateColumns: GRID, gap: '10px', alignItems: 'center',
                  minHeight: '48px', borderBottom: `1px solid ${C.bordeFila}`, padding: '7px 14px',
                  cursor: puedo ? 'pointer' : 'default',
                  background: on ? C.marcaSuave : 'transparent',
                }}
                hover={on ? {} : { background: C.tenueFondo }}>
                <Casilla marcada={on} apagada={!puedo} testid={`masivo-sel-${n.id}`}
                  etiqueta={`Seleccionar ${n.nombre}`}
                  titulo={puedo ? undefined : n.metodo_avance === 'pasos'
                    ? 'Se mide por pasos: su % sale de tildar los pasos en el panel de la actividad'
                    : 'No tiene medición cargada: no hay porcentaje que calcular'}
                  onClick={() => marcar(n)} />
                <div style={{ minWidth: 0, paddingLeft: Math.min(n.nivel, 6) * 8 }}>
                  <div style={{
                    fontSize: '12.5px', color: C.tinta, overflow: 'hidden', textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap', fontWeight: n.es_contenedor ? 600 : 400,
                  }}>{n.nombre}</div>
                  {/* EL FRENTE, NO LA RUTA ENTERA: `camino` incluye el nombre propio y repetirlo
                      debajo del nombre es la línea que el canónico saca de todas las tablas. */}
                  <div style={{
                    fontSize: '11px', color: C.tenue, marginTop: '1px', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{(!n.es_contenedor && frenteDeCamino(n.camino, n.nombre)) || ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                  {!n.es_contenedor && (
                    <>
                      <span style={{ display: 'flex', color: m.c, flexShrink: 0 }} title={m.tip}>
                        <Ico d={m.d} s={14} />
                      </span>
                      <span style={{
                        fontSize: '11.5px', color: m.c, overflow: 'hidden', textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>{m.t}</span>
                    </>
                  )}
                </div>
                <div style={{ textAlign: 'right', minWidth: 0 }}>
                  {!n.es_contenedor && (
                    <>
                      <div style={{ fontFamily: MONO, fontSize: '12px', color: C.tinta }}>
                        {n.cantidad_objetivo !== null
                          ? `${fmtCantidad(n.cantidad_ejecutada ?? 0)} / ${fmtCantidad(n.cantidad_objetivo, n.unidad)}`
                          : porcentaje(n.avance_pct) ?? 'sin medición'}
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: '11px', color: C.tenue }}>
                        {porcentaje(n.avance_pct) ?? 'sin medir'}
                      </div>
                    </>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0, flexWrap: 'wrap' }}>
                  {on ? escalonesDeAvance(n.avance_pct).map((o) => (
                    <button key={o} type="button" data-testid={`masivo-opcion-${n.id}-${o}`}
                      onClick={(e) => { e.stopPropagation(); setElegido((p) => ({ ...p, [n.id]: o })) }}
                      aria-pressed={v === o}
                      style={{
                        minWidth: '44px', minHeight: '30px', display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        border: `1px solid ${v === o ? C.grafito : C.borde}`,
                        background: v === o ? C.grafito : C.superficie,
                        color: v === o ? C.superficie : C.tinta,
                        borderRadius: '7px', padding: '2px 7px',
                      }}>
                      <span style={{ fontFamily: MONO, fontSize: '11.5px', fontWeight: 600 }}>{o}%</span>
                      {o === 100 && (
                        <span style={{ fontSize: '9px', color: v === o ? C.apagado : C.tenue, whiteSpace: 'nowrap' }}>
                          terminada
                        </span>
                      )}
                    </button>
                  )) : <span style={{ fontSize: '11.5px', color: C.fantasma }}>—</span>}
                </div>
                <div style={{ textAlign: 'right', minWidth: 0 }}>
                  {on && v > (n.avance_pct ?? 0) ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px' }}>
                        <span style={{ display: 'flex', color: C.pos }}><Ico d={P.sube} s={11} w={2.6} /></span>
                        <span style={{ fontFamily: MONO, fontSize: '13px', fontWeight: 600, color: C.tinta }}>{v} %</span>
                      </div>
                      <div style={{ fontFamily: MONO, fontSize: '10.5px', color: cal.c }}>{cal.t}</div>
                    </>
                  ) : <span style={{ fontSize: '11.5px', color: C.fantasma }}>—</span>}
                </div>
              </Hover>
            )
          })}

          {visibles.length === 0 && (
            <div style={{ padding: '26px 14px', fontSize: '12.5px', color: C.tintaSuave }}>
              Nada coincide.{' '}
              <button type="button" onClick={() => { setQuery(''); setCorte('todo') }} style={{
                color: C.tinta, fontWeight: 500, cursor: 'pointer', textDecoration: 'underline',
                border: 'none', background: 'none', font: 'inherit', padding: 0,
              }}>Ver todo</button>
            </div>
          )}
        </Tarjeta>
      </div>

      {ids.length > 0 ? (
        <div data-testid="masivo-barra" style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, background: C.superficie,
          borderTop: `1px solid ${C.bordeFuerte}`, padding: '12px 20px', display: 'flex',
          alignItems: 'center', gap: '14px', flexWrap: 'wrap', boxShadow: '0 -2px 12px rgba(31,31,30,.06)',
          zIndex: 30,
        }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: C.tinta }}>
            {ids.length} {ids.length === 1 ? 'actividad' : 'actividades'}
          </span>
          <span style={{ fontSize: '12.5px', color: C.tintaSuave }}>
            {ids.length - estimadas} medidas por cantidad · {estimadas} estimadas
          </span>
          {estimadas > 0 && (
            <span style={{
              display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: C.warn,
              border: `1px solid ${C.warnBorde}`, background: C.warnFondo, borderRadius: '6px', padding: '4px 9px',
            }}>
              <Ico d={P.alerta} s={14} />
              {estimadas} sin medición por cantidad: el % queda como estimado
            </span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button type="button" onClick={() => setElegido({})} data-testid="masivo-cancelar"
              style={{ fontSize: '12.5px', color: C.tintaSuave, cursor: 'pointer', padding: '8px 10px', border: 'none', background: 'none' }}>
              Cancelar
            </button>
            <button type="button" onClick={guardar} disabled={enviando} data-testid="masivo-guardar"
              style={{ ...ESTILO_PRIMARIA, padding: '9px 15px', fontSize: '13px', opacity: enviando ? 0.6 : 1 }}>
              <Ico d={P.ok} s={16} w={2.2} />
              {enviando ? 'Guardando…' : `Guardar ${ids.length} ${ids.length === 1 ? 'avance' : 'avances'}`}
            </button>
          </div>
        </div>
      ) : (
        <div data-testid="masivo-sin-seleccion" style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, background: C.superficie,
          borderTop: `1px solid ${C.borde}`, padding: '14px 20px', display: 'flex',
          alignItems: 'center', gap: '9px', fontSize: '12.5px', color: C.tenue, zIndex: 30,
        }}>
          <Ico d={P.info} s={15} />
          Marcá las actividades que avanzaron hoy y elegí el valor alcanzado.
        </div>
      )}
    </div>
  )
}

/** La casilla de 18px del zip: radio 5, borde de 1,5px, amarilla cuando está marcada. */
function Casilla({ marcada, apagada = false, onClick, etiqueta, titulo, testid }: {
  marcada: boolean; apagada?: boolean; onClick: () => void
  etiqueta: string; titulo?: string; testid?: string
}) {
  return (
    <button type="button" role="checkbox" aria-checked={marcada} aria-label={etiqueta} title={titulo}
      disabled={apagada} data-testid={testid}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      style={{
        width: '18px', height: '18px', borderRadius: '5px',
        border: `1.5px solid ${marcada ? C.marca : C.bordeFuerte}`,
        background: marcada ? C.marca : C.superficie,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: apagada ? 'not-allowed' : 'pointer', color: C.tinta, padding: 0,
        opacity: apagada ? 0.35 : 1, flexShrink: 0,
      }}>
      {marcada && <Ico d={P.ok} s={11} w={3} />}
    </button>
  )
}
