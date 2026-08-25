'use client'

// EL GANTT DE LA OBRA — PORTE LITERAL de `07 · Obra Cronograma.dc.html`.
//
// ═══ LAS MEDIDAS SON LAS DEL MOCKUP, NO LAS DEL DESIGN SYSTEM ═══
//
//   día        `DAYW = 26`px · fila `ROWH = 36`px · cabecera 46 partida en 22 (mes) + 24 (escala)
//   base       `top:6 h:4 r:2` gris #D7D5CF — lo prometido no compite con lo que está pasando
//   barra      `top:13 h:15 r:4` con fondo tenue y relleno de avance
//   resumen    `top:18 h:5 r:2` #B9B7B1 — el corchete plano de un rubro, que no se mide
//   proyección `top:13 h:15 r:4` punteado 1,5px #B42318, sin relleno
//   hoy        columna amarilla en la cabecera + línea de 1,5px al medio del día
//
// ═══ TRES CAPAS SUPERPUESTAS, Y CADA UNA ES OTRA AFIRMACIÓN ═══
//
// BASE lo que se prometió al sellar · PLAN lo cargado, con su avance · PROYECCIÓN lo que va a pasar
// al ritmo medido (`forecast_fin`). Se superponen porque el desvío ES la diferencia entre capas: en
// tres pantallas separadas hay que recordarla de memoria. La capa que no tiene dato NO se dibuja —
// un hueco es el dato, y una base copiada del plan sería una promesa inventada.
//
// ═══ LO QUE ESTA PANTALLA YA NO HACE, Y POR QUÉ ═══
//
// Arrastrar una barra para simular un corrimiento vivía acá y navegaba a `?mover=N` para que el
// motor de camino crítico contestara qué arrastra. Ese motor calcula las fechas DESDE LA SECUENCIA
// y hoy hay CERO precedencias cargadas en todas las obras: contestaba siempre «sin secuencia», y
// dibujaba todas las barras arrancando el mismo día. Este lienzo dibuja el plan COMO ESTÁ CARGADO
// (`cronogramaPlan.ts`); mover una fecha se hace donde se edita la actividad, en Tareas.

import { useMemo } from 'react'
import { tramoDe, type EscalaCronograma } from '../services/escalaCronograma'
import { bandasDePeriodo, divisionesDe, type DivisionEscala } from '../services/bandaCronograma'
import type { FilaPlan } from '../services/cronogramaPlan'
import { TablaCronogramaObra } from './TablaCronogramaObra'
import { C, MONO } from './canon/tokens'

/** El alto de la fila y el de la cabecera los leen las DOS columnas —la tabla y el lienzo— desde
 *  acá: el día que se separen, la barra deja de estar en la fila de su actividad y ningún test lo
 *  nota. Son `ROWH = 36` y la cabecera de 46 = 22 + 24 del mockup. */
const ALTO_FILA = 36
const ALTO_HEAD = 46
const ALTO_PERIODO = 22

/** Cómo se pinta una barra. Los cuatro casos del mockup, con una traducción declarada: el zip pinta
 *  de ámbar la actividad EN CURSO del camino crítico, y sin precedencias no hay camino crítico. El
 *  ámbar pasa a la que está en curso y PROYECTA ATRASO, que es el mismo aviso sobre el dato que sí
 *  existe. Ver `cronogramaPlan.ts`. */
export function pinturaDeBarra(f: FilaPlan): { relleno: string; fondo: string; borde: string } {
  const av = f.avancePct
  if (av != null && av >= 100) return { relleno: '#067647', fondo: '#E6F3EB', borde: '#CDE7D7' }
  if (av != null && av > 0) {
    return (f.desvio ?? 0) > 0
      ? { relleno: '#B54708', fondo: '#FBEFE1', borde: '#F0E1CD' }
      : { relleno: '#175CD3', fondo: '#E4EEFC', borde: '#CFE0FA' }
  }
  return { relleno: C.bordeFuerte, fondo: C.pistaPlan, borde: C.borde }
}

/** Qué filas se ven con estos rubros plegados. Un rubro cerrado se lleva sus hijas hasta el próximo
 *  rubro: las filas vienen planas y el nivel es la única jerarquía que tienen. */
export function visibles(filas: readonly FilaPlan[], cerrados: ReadonlySet<string>): FilaPlan[] {
  const salida: FilaPlan[] = []
  let ocultando = false
  for (const f of filas) {
    if (f.nivel === 0) {
      ocultando = cerrados.has(f.clave)
      salida.push(f)
      continue
    }
    if (!ocultando) salida.push(f)
  }
  return salida
}

export interface Props {
  filas: FilaPlan[]
  escala: EscalaCronograma
  seleccionada: string | null
  alSeleccionar: (clave: string) => void
  cerrados: ReadonlySet<string>
  plegar: (clave: string) => void
  verBase: boolean
  verProyeccion: boolean
  /** Los días que ESTA obra trabaja (isodow). Los otros se sombrean: sin eso, diez días de barra
   *  sobre el calendario no se distinguen de diez días de trabajo. */
  diasHabiles?: readonly number[]
  /** El día de hoy, en ISO. Sólo para poder fijarlo en un test. */
  hoy: string
}

export function LienzoCronogramaObra({
  filas, escala, seleccionada, alSeleccionar, cerrados, plegar, verBase, verProyeccion,
  diasHabiles = [], hoy,
}: Props) {
  const alaVista = useMemo(() => visibles(filas, cerrados), [filas, cerrados])
  const divisiones = useMemo(
    () => divisionesDe(escala.columnas, hoy, diasHabiles),
    [escala.columnas, hoy, diasHabiles],
  )
  return (
    <div data-testid="cronograma" style={{
      background: C.superficie, border: `1px solid ${C.borde}`, borderRadius: '10px',
      display: 'flex', overflow: 'hidden',
    }}>
      <TablaCronogramaObra
        filas={alaVista} seleccionada={seleccionada} alSeleccionar={alSeleccionar}
        cerrados={cerrados} plegar={plegar} altoFila={ALTO_FILA} altoCabecera={ALTO_HEAD}
      />
      {/* EL SCROLL ES DEL LIENZO, NO DE LA PÁGINA: la tabla de actividades queda quieta. Leer una
          barra de noviembre sin ver de qué actividad es no sirve de nada. */}
      <div style={{ flex: 1, minWidth: 0, overflowX: 'auto' }}>
        <div style={{ width: `${escala.anchoPx}px`, position: 'relative' }}>
          <Encabezado escala={escala} divisiones={divisiones} />
          <div style={{ position: 'relative', height: `${alaVista.length * ALTO_FILA}px` }}>
            <Fondo divisiones={divisiones} />
            {escala.hoyX != null && (
              // LA LÍNEA VA DEBAJO DE LAS FILAS, como en el zip: se dibuja antes y sin `z-index`,
              // así una barra la tapa en vez de quedar cortada al medio por un pelo amarillo.
              <div aria-hidden data-testid="linea-hoy" style={{
                position: 'absolute', top: 0, bottom: 0, width: '1.5px', background: C.marca,
                left: `${escala.hoyX + escala.pxPorDia / 2}px`, pointerEvents: 'none',
              }} />
            )}
            {alaVista.map((f) => (
              <Renglon
                key={f.clave} fila={f} escala={escala} verBase={verBase} verProyeccion={verProyeccion}
                selecta={seleccionada === f.clave} alSeleccionar={alSeleccionar}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Las columnas del calendario, detrás de las barras: son la referencia para leer una barra, no
 *  contenido. Si se notan, compiten con lo único que la pantalla quiere que se mire. */
function Fondo({ divisiones }: { divisiones: DivisionEscala[] }) {
  return (
    <div aria-hidden data-testid="fondo-calendario" style={{ position: 'absolute', inset: 0 }}>
      {divisiones.map((d) => (
        <span key={d.clave} style={{
          position: 'absolute', top: 0, bottom: 0, left: `${d.izqPct}%`, width: `${d.anchoPct}%`,
          background: d.franco ? C.tenueFondo : C.superficie, borderRight: `1px solid ${C.bordeLista}`,
        }} />
      ))}
    </div>
  )
}

/** LA CABECERA DE DOS BANDAS: el período arriba (22px), las divisiones de la escala abajo (24px).
 *  Doce rótulos «S32 S33 S34…» no dicen en qué mes cae la obra, y esa es la pregunta que se hace
 *  primero. */
function Encabezado({ escala, divisiones }: { escala: EscalaCronograma; divisiones: DivisionEscala[] }) {
  const periodos = bandasDePeriodo(escala.desde, escala.hasta, escala.unidad)
  return (
    <div style={{ height: `${ALTO_HEAD}px`, borderBottom: `1px solid ${C.borde}`, background: C.tenueFondo }}>
      <div style={{ position: 'relative', height: `${ALTO_PERIODO}px` }}>
        {periodos.map((p) => (
          <span key={p.clave} style={{
            position: 'absolute', top: 0, bottom: 0, left: `${p.izqPct}%`, width: `${p.anchoPct}%`,
            borderRight: `1px solid ${C.borde}`, fontSize: '11px', fontWeight: 500, color: C.tintaMedia,
            display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
            whiteSpace: 'nowrap',
          }}>{p.etiqueta}</span>
        ))}
      </div>
      <div style={{ position: 'relative', height: `${ALTO_HEAD - ALTO_PERIODO}px` }}>
        {divisiones.map((d) => (
          <span key={d.clave} data-hoy={d.esHoy ? '1' : undefined} style={{
            position: 'absolute', top: 0, bottom: 0, left: `${d.izqPct}%`, width: `${d.anchoPct}%`,
            background: d.esHoy ? C.marca : 'transparent',
            color: d.esHoy ? C.tinta : d.franco ? C.apagado : C.tintaSuave,
            fontFamily: MONO, fontSize: '9.5px', fontWeight: d.esHoy ? 600 : 400,
            borderRadius: d.esHoy ? '4px' : 0, display: 'flex', alignItems: 'center',
            justifyContent: 'center', overflow: 'hidden',
          }}>{d.etiqueta}</span>
        ))}
      </div>
    </div>
  )
}

function Renglon({ fila, escala, verBase, verProyeccion, selecta, alSeleccionar }: {
  fila: FilaPlan
  escala: EscalaCronograma
  verBase: boolean
  verProyeccion: boolean
  selecta: boolean
  alSeleccionar: (clave: string) => void
}) {
  const tramo = tramoDe(escala, fila.inicio, fila.fin)
  const base = verBase ? tramoDe(escala, fila.inicioBase, fila.finBase) : null
  // La proyección es el tramo que se estira MÁS ALLÁ del plan. Con forecast anterior al fin de plan
  // no hay nada punteado que dibujar: la actividad va bien, y eso ya lo dice la columna de desvío.
  const proyeccion = verProyeccion && fila.fin && fila.finForecast && fila.finForecast > fila.fin
    ? tramoDe(escala, fila.fin, fila.finForecast)
    : null
  const esRubro = fila.nivel === 0
  const pintura = pinturaDeBarra(fila)
  return (
    <div
      data-fila={fila.clave}
      onClick={() => alSeleccionar(fila.clave)}
      style={{
        position: 'relative', height: `${ALTO_FILA}px`, borderBottom: `1px solid ${C.bordeFila}`,
        background: selecta ? C.marcaSuave : 'transparent', cursor: 'pointer',
      }}
    >
      {/* NULL NO ES CERO: una actividad sin fechas no se dibuja arrancando hoy, se dice. */}
      {!tramo && !esRubro && (
        <span style={{
          position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
          fontSize: '11px', color: C.warn,
        }}>sin fechas · falta análisis</span>
      )}
      {base && (
        <div aria-hidden data-testid="barra-base" style={{
          position: 'absolute', top: '6px', height: '4px', borderRadius: '2px',
          background: C.bordeFuerte, left: `${base.izqPct}%`, width: `${base.anchoPct}%`,
        }} />
      )}
      {proyeccion && (
        <div aria-hidden data-testid="barra-proyeccion" style={{
          position: 'absolute', top: '13px', height: '15px', borderRadius: '4px',
          border: `1.5px dashed ${C.neg}`, background: 'transparent',
          left: `${proyeccion.izqPct}%`, width: `${proyeccion.anchoPct}%`,
        }} />
      )}
      {tramo && esRubro && (
        <div aria-hidden data-testid="barra-resumen" style={{
          position: 'absolute', top: '18px', height: '5px', borderRadius: '2px', background: C.apagado,
          left: `${tramo.izqPct}%`, width: `${tramo.anchoPct}%`,
        }} />
      )}
      {tramo && !esRubro && (
        <div data-testid="barra-plan" title={`${fila.nombre} · ${fila.inicio} → ${fila.fin}`} style={{
          position: 'absolute', top: '13px', height: '15px', borderRadius: '4px', overflow: 'hidden',
          background: pintura.fondo, border: `1px solid ${pintura.borde}`,
          left: `${tramo.izqPct}%`, width: `${tramo.anchoPct}%`,
        }}>
          {fila.avancePct != null && fila.avancePct > 0 && (
            <div style={{
              height: '100%', width: `${Math.min(100, fila.avancePct)}%`, background: pintura.relleno,
            }} />
          )}
        </div>
      )}
      {/* EL ROMBO DEL HITO VA FUERA DE LA BARRA. Vivía adentro, con `-right-1` sobre un contenedor
          `overflow:hidden`: el navegador lo recortaba entero y ningún hito se veía nunca. */}
      {tramo && !esRubro && fila.esHito && (
        <span aria-hidden data-testid="hito" style={{
          position: 'absolute', top: '20.5px', height: '9px', width: '9px',
          transform: 'translate(-50%, -50%) rotate(45deg)', border: `1px solid ${C.superficie}`,
          background: C.tinta, left: `${tramo.izqPct + tramo.anchoPct}%`,
        }} />
      )}
    </div>
  )
}
