'use client'

// UNA FILA DEL ÁRBOL DE LA OBRA — PORTE LITERAL DE LA FILA DEL MOCKUP 03.
//
//   fila       `height:34px; borderBottom:1px solid #F1F0EC; padding:0 10px`
//   grilla     `minmax(0,1fr) 116px 104px 44px` con fechas · `minmax(0,1fr) 116px 44px` sin ellas
//   sangría    `niv * 15px`, con tope a los seis niveles
//   jerarquía  sector 11,5px/600 con `letterSpacing:.05em`; nivel y frente 12,5px/600;
//              la actividad 12,5px/400 — todo en `#1F1F1E`, la jerarquía se lee por peso, no por color
//   abierta    `background:#FEF9E6`; hover `#FAFAF8`
//
// ═══ NO HAY CASILLA DE SELECCIÓN, Y ES DELIBERADO (24/08/2026) ═══
//
// La fila tenía una columna de checkbox para las acciones en lote. El canónico 03 no la dibuja, y
// no es un olvido del zip: la selección múltiple tiene su propia pantalla —«06 · Avance masivo»,
// con su casilla de 18px, su cabecera de «seleccionar todo» y su barra fija de guardado—. Dos
// mecanismos para lo mismo en dos pantallas distintas es cómo empiezan a contestar distinto. La
// columna que se libera se la lleva el tiempo, que es lo que el canónico pone en el centro.
//
// ═══ ABRIR ES UN CALLBACK, NO UNA NAVEGACIÓN (23/08 · Design §16) ═══
//
// El material del panel ya vino con el árbol; un viaje al servidor por clic era lo que hacía tardar
// segundos el gesto más usado de la pantalla.
//
// ═══ SE EDITA DONDE SE LEE, Y NO EN OTRA PANTALLA (pedido del dueño) ═══
//
// Un clic simple sigue ABRIENDO el panel. La edición entra por el lápiz que aparece al pasar el
// mouse y convierte la fila en una TIRA DE CELDAS EDITABLES, sin agregar una fila ni una columna:
// la lista y el Gantt están alineados 1:1 a 34px, y una fila más alta correría todas las barras de
// abajo respecto de su actividad — el Gantt pasaría a afirmar fechas que no son.
//
// Los controles de esa tira son los `InlineEdit` del design system y NO un porte del zip: el mockup
// dibuja la fila en lectura y no tiene un estado de edición que medir. Queda declarado.

import { useState } from 'react'
import { InlineEdit } from '@/shared/components/ds'
import { C, MONO } from './canon/tokens'
import { Ico, P } from './canon/Ico'
import { Pastilla } from './canon/Piezas'
import { fechaCorta, porcentaje } from './formato'
import { estadoDeFila, type ClaveEstado, type FilaVisible } from '../services/vistaArbol'
import type { ResultadoInline } from '@/shared/components/ds'
import type { Solapa } from '../services/solapasTarea'
import { oracionDeActividad } from '../services/nombreDeActividad'
import { ALTO_FILA } from './GanttTareas'

/** El tono de pastilla de cada estado, con los colores del zip. */
const TONO: Record<ClaveEstado, 'neg' | 'pos' | 'warn' | 'curso' | 'neutro'> = {
  impedimento: 'neg',
  hecha: 'pos',
  en_curso_critica: 'warn',
  en_curso: 'curso',
  sin_analisis: 'warn',
  sin_cuadrilla: 'warn',
  sin_plan: 'neutro',
  pendiente: 'neutro',
}

export interface EdicionDeFila {
  /** La misma acción del panel, ya atada a la obra y a la actividad. */
  editarCampo: (campo: string, valor: string) => Promise<ResultadoInline>
  cuadrillas: { id: string; nombre: string }[]
  alTerminar: () => void
}

/** Las dos grillas del mockup (`cols` del `renderVals`). */
export const COLS_CON_FECHAS = 'minmax(0,1fr) 116px 104px 44px'
export const COLS_SIN_FECHAS = 'minmax(0,1fr) 116px 44px'

export function FilaWbs({
  fila, abierta, alPlegar, alAbrir, verFechas, puedeEditar = false, alEditar, edicion = null,
}: {
  fila: FilaVisible
  abierta: boolean
  alPlegar: () => void
  /** Abre el panel en el cliente; `sol` fuerza la solapa (el % abre en Avance). */
  alAbrir: (sol?: Solapa) => void
  /** `verFechas = !verGantt` del mockup: con el Gantt al lado, la misma fecha se lee dos veces. */
  verFechas: boolean
  /** Sin permiso no se ofrece el lápiz. La acción lo vuelve a chequear del lado del servidor. */
  puedeEditar?: boolean
  alEditar?: () => void
  /** Presente = esta fila está en edición. */
  edicion?: EdicionDeFila | null
}) {
  const [hover, setHover] = useState(false)
  const n = fila.nodo
  const est = estadoDeFila(n, fila.avance)
  const sangria = Math.min(n.nivel, 6) * 15
  const esSector = n.es_contenedor && n.nivel === 0
  const cols = verFechas ? COLS_CON_FECHAS : COLS_SIN_FECHAS

  // ═══ LA FILA EN EDICIÓN: la MISMA altura, la fila entera como tira de celdas ═══
  if (edicion) {
    const campo = (c: string) => (v: string) => edicion.editarCampo(c, v)
    return (
      <div data-testid={`fila-edicion-${n.id}`} style={{
        height: `${ALTO_FILA}px`, borderBottom: `1px solid ${C.bordeFila}`, padding: '0 10px',
        background: C.marcaSuave, display: 'flex', alignItems: 'center',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '4px', overflowX: 'auto',
          whiteSpace: 'nowrap', paddingLeft: sangria, width: '100%',
        }}>
          <InlineEdit valor={n.nombre} tipo="texto" ancho="w-[168px]" etiqueta={`Nombre de ${n.nombre}`}
            testid={`ed-nombre-${n.id}`} guardar={campo('nombre')} />
          {/* CANTIDAD Y UNIDAD VAN JUNTAS: la base rechaza medir por cantidad con una sola de las
              dos (`obra_actividad_medible_completa`), y separarlas en dos gestos deja la mitad
              cargada esperando a la otra. */}
          <InlineEdit valor={n.cantidad_objetivo} tipo="numero" alineado="right" ancho="w-[62px]"
            falta="cant." etiqueta={`Cantidad objetivo de ${n.nombre}`}
            testid={`ed-cantidad-${n.id}`} guardar={campo('cantidad_objetivo')} />
          <InlineEdit valor={n.unidad} tipo="texto" ancho="w-[52px]" falta="un."
            etiqueta={`Unidad de ${n.nombre}`} testid={`ed-unidad-${n.id}`} guardar={campo('unidad')} />
          <InlineEdit valor={n.inicio_plan} tipo="fecha" ancho="w-[92px]" falta="inicio"
            etiqueta={`Inicio de plan de ${n.nombre}`} testid={`ed-inicio-${n.id}`}
            guardar={campo('inicio_plan')} />
          <InlineEdit valor={n.fin_plan} tipo="fecha" ancho="w-[92px]" falta="fin"
            etiqueta={`Fin de plan de ${n.nombre}`} testid={`ed-fin-${n.id}`} guardar={campo('fin_plan')} />
          <InlineEdit valor={n.cuadrilla_id} tipo="seleccion" ancho="w-[124px]" falta="sin asignar"
            opciones={[{ valor: '', etiqueta: 'sin asignar' },
              ...edicion.cuadrillas.map((c) => ({ valor: c.id, etiqueta: c.nombre }))]}
            etiqueta={`Cuadrilla de ${n.nombre}`} testid={`ed-cuadrilla-${n.id}`}
            guardar={campo('cuadrilla_id')} />
          {/* «Listo» y no una ✕: no cancela nada. Cada celda ya guardó al salir; esto sólo
              devuelve la fila a su forma de lectura. */}
          <button type="button" onClick={edicion.alTerminar} data-testid={`ed-listo-${n.id}`}
            style={{
              marginLeft: 'auto', flexShrink: 0, border: `1px solid ${C.borde}`, borderRadius: '6px',
              padding: '1px 8px', fontSize: '11.5px', color: C.tintaSuave, background: C.superficie,
              cursor: 'pointer',
            }}>Listo</button>
        </div>
      </div>
    )
  }

  return (
    <div data-testid={`fila-wbs-${n.id}`} onClick={() => alAbrir()}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid', gridTemplateColumns: cols, alignItems: 'center', height: `${ALTO_FILA}px`,
        borderBottom: `1px solid ${C.bordeFila}`, padding: '0 10px', cursor: 'pointer',
        background: abierta ? C.marcaSuave : hover ? C.tenueFondo : 'transparent',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, paddingLeft: sangria }}>
        <span style={{ display: 'flex', width: '12px', flexShrink: 0, color: C.tenue }}>
          {fila.plegable && (
            <button type="button" onClick={(e) => { e.stopPropagation(); alPlegar() }}
              aria-expanded={!fila.plegado} data-testid={`caret-${n.id}`}
              aria-label={`${fila.plegado ? 'Desplegar' : 'Plegar'} ${n.nombre}`}
              style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'inherit', display: 'flex' }}>
              <Ico d={P.derecha} s={11} w={2.4}
                style={{ transform: fila.plegado ? 'rotate(0deg)' : 'rotate(90deg)' }} />
            </button>
          )}
        </span>
        {/* SE LEE EN ORACIÓN, SE GUARDA COMO SE CARGÓ. La carga viene en mayúsculas y 350 filas
            gritadas no tienen silueta: todas las palabras miden igual y hay que leerlas letra por
            letra. La corrección es de pantalla — el dato no se toca. */}
        <span data-testid={`fila-${n.id}`} style={{
          fontSize: esSector ? '11.5px' : '12.5px',
          fontWeight: n.es_contenedor ? 600 : 400,
          color: C.tinta,
          letterSpacing: esSector ? '.05em' : 0,
          minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{oracionDeActividad(n.nombre)}</span>
        {n.es_subcontrato && (
          <span title={`Subcontratado${n.subcontratista ? ` · ${n.subcontratista}` : ''}`}
            style={{ display: 'flex', flexShrink: 0, color: C.tintaSuave }}>
            <Ico d={P.cuadrilla} s={12} />
          </span>
        )}
        {/* EL AVISO DEL ZIP: el triángulo ámbar de 12,5px cuando la actividad tiene una deuda de
            carga que la traba. No se dibuja sobre las subcontratadas —el zip las excluye— porque
            un paquete de un tercero nunca estuvo en deuda de cuadrilla. */}
        {!n.es_contenedor && !n.es_subcontrato
          && (est.clave === 'sin_analisis' || est.clave === 'sin_cuadrilla') && (
          <span title={est.clave === 'sin_analisis' ? 'Sin análisis de precio' : 'Sin cuadrilla asignada'}
            style={{ display: 'flex', flexShrink: 0, color: C.warn }}>
            <Ico d={P.alerta} s={12.5} />
          </span>
        )}
        {n.partida_codigo && (
          <span style={{ flexShrink: 0, fontFamily: MONO, fontSize: '10px', color: C.tenue }}>
            {n.partida_codigo}
          </span>
        )}
        {/* EL LÁPIZ NO COMPITE CON EL CLIC: aparece al pasar el mouse (y con el foco de teclado, que
            si no la edición no existiría para quien no usa mouse) y es otro objetivo. */}
        {puedeEditar && alEditar && !n.es_contenedor && (
          <button type="button" onClick={(e) => { e.stopPropagation(); alEditar() }}
            data-testid={`editar-${n.id}`} aria-label={`Editar ${n.nombre} en la lista`} title="Editar acá"
            style={{
              flexShrink: 0, border: 'none', background: 'none', padding: '2px', cursor: 'pointer',
              color: C.tenue, opacity: hover ? 1 : 0, display: 'flex',
            }} onFocus={() => setHover(true)}>
            <Ico d={P.editar} s={12} />
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
        <span data-testid={`estado-${n.id}`} data-clave={est.clave}>
          <Pastilla tono={TONO[est.clave]}>{est.label}</Pastilla>
        </span>
      </div>

      {verFechas && (() => {
        const ini = n.es_contenedor ? null : n.inicio_plan
        const fin = n.es_contenedor ? fila.agregado?.fin_plan ?? null : n.fin_plan
        const t = ini && fin ? `${fechaCorta(ini)} → ${fechaCorta(fin)}` : fin ? fechaCorta(fin) : null
        return (
          <div style={{
            fontFamily: MONO, fontSize: '11.5px', textAlign: 'right',
            color: t ? C.tintaMedia : C.tenue,
          }}>{t ?? 'sin plan'}</div>
        )
      })()}

      {/* EL AVANCE ES UNA PUERTA: tocarlo abre el panel en la solapa Avance. El contenedor no la
          ofrece: su avance se agrega, no se carga. */}
      <div style={{
        fontFamily: MONO, fontSize: '11.5px', fontWeight: n.es_contenedor ? 600 : 400,
        textAlign: 'right',
        color: fila.avance === null ? C.tenue : fila.avance >= 100 ? C.pos : C.tinta,
      }}>
        {n.es_contenedor ? (
          fila.avance === null ? '—' : porcentaje(fila.avance)
        ) : (
          <button type="button" onClick={(e) => { e.stopPropagation(); alAbrir('avance') }}
            aria-label={`Avance de ${n.nombre}`} data-testid={`avance-${n.id}`}
            style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit' }}>
            {fila.avance === null ? '—' : porcentaje(fila.avance)}
          </button>
        )}
      </div>
    </div>
  )
}
