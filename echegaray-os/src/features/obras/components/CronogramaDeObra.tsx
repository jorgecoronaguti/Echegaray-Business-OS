'use client'

// 07 · OBRA CRONOGRAMA — la pantalla, PORTADA LITERAL de `07 · Obra Cronograma.dc.html`.
//
// ═══ QUÉ DIBUJA, EN EL ORDEN DEL MOCKUP ═══
//
//   banda de nivel 3   las cuatro vistas de Trabajo y, a la derecha, el zoom y las dos capas
//   tarjeta            340px de tabla (actividad · desvío) + el Gantt, con scroll propio
//   franja             las cinco cifras del plazo, como tarjeta de celdas
//
// ═══ EL ESTADO DE LA VISTA VIVE EN EL NAVEGADOR, NO EN LA URL ═══
//
// Zoom, capas, rubro plegado y fila seleccionada no cambian lo que el cronograma DICE: cambian cómo
// se lo mira. La versión anterior los mandaba a la URL y cada clic en «Semana» era una vuelta
// completa al servidor —con la consulta de actividades otra vez— para mover unas barras que ya
// estaban en la pantalla. El dueño lo resumió así: «el sitio es lento, malo, poco funcional».
//
// ═══ LO QUE ESTA PANTALLA NO INVENTA ═══
//
// Sin línea base sellada la capa no dibuja nada y el control ofrece SELLARLA en el lugar; sin
// `forecast_fin` no hay proyección punteada ni desvío, y se dice «—» en vez de «en fecha». Ver
// `cronogramaPlan.ts`.

import { useMemo, useState, type ReactNode } from 'react'
import { Franja } from '@/shared/components/ds'
import { BotonAccion, type ResultadoAccion } from '@/shared/components/ui'
import type { Actividad } from '../types'
import {
  construirEscalaCronograma, UNIDADES, UNIDAD_LABEL, ventanaDe, type UnidadEscala,
} from '../services/escalaCronograma'
import { filasDelPlan, pares, resumenDelCronograma } from '../services/cronogramaPlan'
import { metricasDelCronogramaCargado } from '../services/metricasCronograma'
import { LienzoCronogramaObra } from './LienzoCronogramaObra'
import { SubNavTrabajo } from './SubNavTrabajo'
import { SellarLineaBase } from './AccionesMasivas'
import { C } from './canon/tokens'

export interface Props {
  obraId: string
  /** El cronograma vivo: las actividades NO archivadas, en el orden del tracker. */
  actividades: Actividad[]
  /** Los días que ESTA obra trabaja (isodow). Vacío = no se sombrea nada; asumir lunes a viernes
   *  pintaría de franco los sábados de una obra que trabaja los sábados. */
  diasHabiles?: readonly number[]
  /** Sellar la línea base de toda la obra. Sin acción, el control no se ofrece. */
  sellar?: () => Promise<ResultadoAccion>
  /** Las archivadas, para poder devolverlas. NO están en el mockup y están acá a propósito: ver
   *  `Archivadas`. Sin lista, no se dibuja nada. */
  archivadas?: Actividad[]
  /** `archivarActividad` atada a la obra: se la llama con `(id, false)` para restaurar. */
  restaurar?: (actividadId: string, archivada: boolean) => Promise<ResultadoAccion>
  /** La query `act`: qué actividad viene señalada en el link. Sólo la SELECCIÓN inicial —después la
   *  selección es local—, porque un cronograma se manda por chat apuntando a una actividad. */
  actividadAbierta?: string | null
  /** Sólo para fijar el día en un test. En la pantalla es hoy. */
  hoy?: string
}

export function CronogramaDeObra({
  obraId, actividades, diasHabiles = [], sellar, hoy, actividadAbierta = null,
  archivadas = [], restaurar,
}: Props) {
  const dia = hoy ?? new Date().toISOString().slice(0, 10)
  const [unidad, setUnidad] = useState<UnidadEscala>('dia')
  const [verBase, setVerBase] = useState(true)
  const [verProyeccion, setVerProyeccion] = useState(true)
  const [seleccionada, setSeleccionada] = useState<string | null>(actividadAbierta)
  const [cerrados, setCerrados] = useState<ReadonlySet<string>>(new Set())

  const filas = useMemo(() => filasDelPlan(actividades), [actividades])
  const ventana = useMemo(() => ventanaDe(pares(filas)), [filas])
  const escala = useMemo(
    () => (ventana ? construirEscalaCronograma(ventana, unidad, dia) : null),
    [ventana, unidad, dia],
  )
  const resumen = useMemo(() => resumenDelCronograma(filas), [filas])
  const selladaEn = useMemo(
    () => actividades.map((a) => a.sellada_en).filter((x): x is string => Boolean(x)).sort().at(-1) ?? null,
    [actividades],
  )
  const hayBase = resumen.finBase != null
  const hayForecast = resumen.finForecast != null

  const plegar = (clave: string) => setCerrados((p) => {
    const s = new Set(p)
    if (s.has(clave)) s.delete(clave); else s.add(clave)
    return s
  })

  return (
    <>
      <SubNavTrabajo obraId={obraId} sub="gantt" derecha={
        <>
          <Zoom unidad={unidad} alCambiar={setUnidad} />
          {/* SIN BASE SELLADA NO HAY CAPA QUE ENCENDER, HAY UNA BASE QUE SELLAR. El control dice
              cuál de las dos cosas pasa, y la segunda se hace acá mismo. */}
          {hayBase || !sellar
            ? (
              <Capa
                activa={verBase && hayBase} testid="capa-base" rotulo="Línea base"
                disponible={hayBase}
                ayuda={hayBase
                  ? 'Lo que se prometió al sellar la línea base'
                  : 'Ninguna actividad tiene línea base sellada'}
                alTocar={() => setVerBase((v) => !v)}
                muestra={<span style={{ width: '10px', height: '4px', borderRadius: '2px', background: C.bordeFuerte }} />}
              />
              )
            : <SellarLineaBase sellar={sellar} yaSellada={false} />}
          <Capa
            activa={verProyeccion && hayForecast} testid="capa-proyeccion" rotulo="Proyección"
            disponible={hayForecast}
            ayuda={hayForecast
              ? 'Cuándo termina cada actividad al ritmo medido (forecast)'
              : 'Ninguna actividad tiene forecast: no hay proyección que dibujar'}
            alTocar={() => setVerProyeccion((v) => !v)}
            muestra={<span style={{ width: '10px', height: '13px', borderTop: `1.5px dashed ${C.neg}` }} />}
          />
        </>
      } />

      {/* El aire de la pantalla es el del mockup: `padding:14px 20px 20px`. */}
      <div style={{ padding: '14px 20px 20px' }}>
        {escala
          ? (
            <LienzoCronogramaObra
              filas={filas} escala={escala} diasHabiles={diasHabiles} hoy={dia}
              seleccionada={seleccionada} alSeleccionar={setSeleccionada}
              cerrados={cerrados} plegar={plegar}
              verBase={verBase && hayBase} verProyeccion={verProyeccion && hayForecast}
            />
            )
          : <SinFechas obraId={obraId} n={actividades.length} />}
        {/* AL PIE Y NO ARRIBA: el plan es el trabajo y va primero. Las cifras salen de las MISMAS
            filas que se acaban de dibujar. */}
        <div style={{ marginTop: '12px' }}>
          <Franja testid="franja-cronograma" metricas={metricasDelCronogramaCargado(resumen, selladaEn)} />
        </div>
        {restaurar && archivadas.length > 0 && <Archivadas archivadas={archivadas} restaurar={restaurar} />}
      </div>
    </>
  )
}

/** EL CONMUTADOR DE ZOOM — `Día | Semana | Mes`, segmentado y en grafito. El amarillo queda para
 *  hoy y para la fila seleccionada: el zoom es una vista, no la acción principal de la pantalla. */
function Zoom({ unidad, alCambiar }: { unidad: UnidadEscala; alCambiar: (u: UnidadEscala) => void }) {
  return (
    <div data-testid="escala-cronograma" style={{
      display: 'flex', alignItems: 'center', border: `1px solid ${C.borde}`, borderRadius: '6px',
      overflow: 'hidden', background: C.superficie,
    }}>
      {UNIDADES.map((u, i) => (
        <button
          key={u} type="button" onClick={() => alCambiar(u)} data-activa={unidad === u ? '1' : undefined}
          aria-pressed={unidad === u}
          style={{
            fontSize: '12px', padding: '5px 11px', cursor: 'pointer', fontFamily: 'inherit',
            background: unidad === u ? C.grafito : C.superficie,
            color: unidad === u ? C.superficie : C.tintaMedia,
            fontWeight: unidad === u ? 600 : 400, border: 'none',
            borderRight: i === UNIDADES.length - 1 ? 'none' : `1px solid ${C.borde}`,
          }}
        >{UNIDAD_LABEL[u]}</button>
      ))}
    </div>
  )
}

/** UNA CAPA ES SU PROPIA LEYENDA (mockup 07): la muestra de color dice con qué se dibuja lo que el
 *  botón enciende. Antes eran un interruptor y, aparte, una leyenda de seis muestras al pie: las
 *  mismas seis cosas dichas dos veces. */
function Capa({ activa, disponible, rotulo, ayuda, muestra, testid, alTocar }: {
  activa: boolean
  disponible: boolean
  rotulo: string
  ayuda: string
  muestra: ReactNode
  testid: string
  alTocar: () => void
}) {
  return (
    <button
      type="button" title={ayuda} data-testid={testid} disabled={!disponible}
      data-activa={activa ? '1' : undefined} aria-pressed={activa}
      onClick={alTocar}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontFamily: 'inherit',
        border: `1px solid ${activa ? C.grafito : C.borde}`,
        background: activa ? '#F2F1ED' : C.superficie,
        color: disponible ? (activa ? C.tinta : C.tintaSuave) : C.apagado,
        borderRadius: '6px', padding: '4px 9px', cursor: disponible ? 'pointer' : 'default',
      }}
    >
      {muestra}
      {rotulo}
    </button>
  )
}

/**
 * LAS ARCHIVADAS — la única puerta que hay en todo el OS para devolver una actividad.
 *
 * NO está en el canónico 07 y por eso va plegada y en un renglón: archivar NO es borrar —la fila
 * sale del cronograma y de los promedios, y su historia queda—, y hasta hoy el único lugar donde se
 * podía deshacer era el Gantt anterior, que esta pantalla reemplaza. Quattropani tiene CIEN
 * actividades archivadas contra 35 vivas: retirar el bloque junto con el Gantt las habría dejado
 * sin manera de volver, sin un solo error y sin que nadie se entere.
 *
 * Su lugar natural es el árbol de Tareas (mockup 03), que es el que gobierna la estructura. Mudarlo
 * es una decisión de ese frente; mientras tanto vive acá, declarado.
 */
function Archivadas({ archivadas, restaurar }: {
  archivadas: Actividad[]
  restaurar: (actividadId: string, archivada: boolean) => Promise<ResultadoAccion>
}) {
  return (
    <details data-testid="actividades-archivadas" style={{ marginTop: '10px' }}>
      <summary style={{ fontSize: '12px', color: C.tintaSuave, cursor: 'pointer' }}>
        {archivadas.length} actividad(es) archivadas
      </summary>
      <ul style={{ marginTop: '6px', border: `1px solid ${C.borde}`, borderRadius: '10px', background: C.superficie }}>
        {archivadas.map((a, i) => (
          <li key={a.id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
            padding: '7px 14px', borderTop: i === 0 ? 'none' : `1px solid ${C.bordeFila}`,
          }}>
            <span style={{
              minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontSize: '12.5px', color: C.tintaSuave,
            }}>{a.nombre}</span>
            <BotonAccion accion={restaurar} args={[a.id, false]} testid="restaurar-actividad">
              Restaurar
            </BotonAccion>
          </li>
        ))}
      </ul>
    </details>
  )
}

/** NINGUNA FECHA NO ES UN LIENZO VACÍO: es trabajo sin programar, y se dice con el número y con la
 *  puerta para ir a cargarlo. */
function SinFechas({ obraId, n }: { obraId: string; n: number }) {
  return (
    <div data-testid="cronograma-sin-fechas" style={{
      background: C.superficie, border: `1px solid ${C.borde}`, borderRadius: '10px',
      padding: '20px', fontSize: '13px', color: C.tintaSuave,
    }}>
      {n === 0
        ? 'Esta obra todavía no tiene actividades cargadas.'
        : `Ninguna de las ${n} actividades tiene fechas de plan, línea base ni proyección: no hay barras que dibujar.`}{' '}
      <a href={`/obras/${obraId}?vista=tareas&sub=arbol`} style={{ color: C.tinta, fontWeight: 500, textDecoration: 'underline' }}>
        Cargar las fechas en Tareas
      </a>
    </div>
  )
}
