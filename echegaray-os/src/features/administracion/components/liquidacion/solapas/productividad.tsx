// PANTALLA 7 · PRODUCTIVIDAD — HH CONTRA AVANCE.
//
// Va DENTRO de «Costo a la obra», debajo del bloque de costo, y es la pregunta que sigue: la obra ya
// sabe cuánto le costó la quincena; esto contesta si esas horas produjeron.
//
// ═══ HOY ESTA PANTALLA DICE CASI TODO «NO SE PUEDE MEDIR», Y ESO ES EL PRODUCTO ═══
//
// `registros_hh` no tiene dónde guardar la cantidad ejecutada ni su unidad (§7 del handoff: el
// pedido más caro y el más rentable). Sin ese dato no hay HH/unidad, y la pantalla lo escribe con
// todas las letras al lado de las horas que ya se gastaron. Es lo contrario de un cuadro vacío: pone
// el precio del dato que falta —cuántas horas están sin poder evaluarse— y dice qué lo destraba.
//
// Rellenar el hueco con el `pct` de avance daría un número que se lee igual que uno medido. No se
// hace, y hay un test que se pone rojo si alguien lo intenta (`productividadHH.test.ts`).

import { Aviso } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import { getProductividadDeLaQuincena } from '../../../services/productividadHHService'
import type { LineaProductividad } from '../../../services/productividadHH'
import { quincenaDe, esFechaISO } from '../../../services/quincena'
import { ALTO_LIQ, Cuadro, Cuerpo, Encabezado, Fila, Hueco, Titulo, Total, miles } from './tabla'

// `dc:526` — las siete columnas de la pantalla 7, al píxel.
// `minmax(0,…)` Y NO `minmax(240px,…)`: dentro del scroller de abajo la primera columna tiene que
// poder encogerse, si no el ancho mínimo real son 880 + 240 y el cuadro vuelve a empujar la página.
// Es la misma corrección que ya lleva `costo-obra.tsx` por el mismo motivo.
const COLS = 'minmax(0,1fr) 88px 84px 96px 132px 100px 140px'

/** Lo que suman las siete columnas del mockup. A 390 px no entran y no se encogen: ruedan. */
const ANCHO_MINIMO = 880

export async function SolapaProductividad({ quincenaPedida, hoy }: {
  quincenaPedida?: string; hoy: string
}) {
  const q = quincenaDe(esFechaISO(quincenaPedida) ? quincenaPedida : hoy)
  const supabase = await createClient()
  const { lineas, resumen, errores } = await getProductividadDeLaQuincena(supabase, q)

  return (
// EL TESTID DICE «PANTALLA», NO «SOLAPA», Y NO ES UN CAPRICHO: `BarraSolapas` ya emite
// `data-testid="solapa-<clave>"` para CADA PESTAÑA de la barra. Con el mismo nombre acá,
// `[data-testid="solapa-productividad"]` devolvía DOS nodos —la pestaña y el contenido— y cualquier
// aserción futura habría medido el botón creyendo que medía la pantalla.
    <section data-testid="pantalla-productividad">
      <Titulo numero="7" titulo="Productividad · HH contra avance"
        bajada="la única pregunta que convierte la liquidación en gestión." />

      {errores.map((e) => (
        <div key={e.que} style={{ paddingBottom: 10 }}>
          <Aviso tono="neg" testid="productividad-error" titulo={`No pude leer ${e.que}`}>{e.error}</Aviso>
        </div>
      ))}

      <Cuadro testid="cuadro-productividad">
        {/* A 390 px LAS SIETE COLUMNAS NO ENTRAN. Sin el scroller empujan la página entera y la
            fila de total queda fuera de pantalla — el mismo desborde que ya tenían «Costo a la
            obra» y la escalera. No se veía porque el cuadro sólo dibuja filas cuando hay horas
            imputadas, y hasta el 10/09/2026 la solapa las estaba perdiendo en la lectura. */}
        <div className="overflow-x-auto">
        <div style={{ minWidth: ANCHO_MINIMO }}>
        <Cuerpo>
          <Encabezado columnas={COLS} celdas={[
            'Actividad', 'Unidad', 'Ejecutado', 'HH gastadas', 'HH/un. real', 'HH/un. plan', 'Rendimiento',
          ]} />

          {lineas.length === 0 && (
            <Fila columnas={COLS} tenue celdas={[
              'Ninguna hora de esta quincena está imputada a una actividad.', '', '', '', '', '', '',
            ]} />
          )}

          {lineas.map((l) => <FilaActividad key={l.actividadId} l={l} />)}

          {/* LAS HORAS SIN ACTIVIDAD VIVEN EN SU PROPIA LÍNEA. Repartirlas entre las actividades
              cargadas movería el rendimiento de la obra que cargó el parte hacia la que no lo cargó. */}
          {resumen.hhSinActividad > 0 && (
            <Fila columnas={COLS} tenue testid="hh-sin-actividad" celdas={[
              `${miles(resumen.hhSinActividad, 1)} h sin actividad`, '', '',
              miles(resumen.hhSinActividad, 1), 'no se puede medir', '', '',
            ]} />
          )}

          <Total columnas={COLS} testid="total-productividad" celdas={[
            `${resumen.medidas + resumen.sinMedida} actividad(es)`, '', '',
            miles(resumen.hhConActividad + resumen.hhSinActividad, 1),
            resumen.medidas > 0 ? `${resumen.medidas} medida(s)` : 'ninguna medible', '', '',
          ]} />
        </Cuerpo>
        </div>
        </div>

        <QueLoDestraba resumen={resumen} />
      </Cuadro>
    </section>
  )
}

/**
 * UNA ACTIVIDAD. El rendimiento sólo se pinta cuando existe: verde si rindió mejor que el plan, rojo
 * si peor. Sin medida no hay color — un gris no acusa a nadie y un rojo sí.
 */
function FilaActividad({ l }: { l: LineaProductividad }) {
  const r = l.rendimientoPct
  return (
    <Fila columnas={COLS} alto={l.porQueNoSeMide ? ALTO_LIQ.filaAlta : ALTO_LIQ.fila} testid={`prod-${l.actividadId}`} celdas={[
      <span key="n" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {l.etiqueta}
      </span>,
      l.unidad ?? <Hueco key="u" />,
      // El avance FÍSICO se muestra porque es el dato que sí existe — y con su signo de %, para que
      // nadie lo lea como una cantidad ejecutada.
      l.cantidadEjecutada != null ? miles(l.cantidadEjecutada) : <Hueco key="e">{l.pct != null ? `${miles(l.pct)} %` : '—'}</Hueco>,
      miles(l.hh, 1),
      l.hhPorUnidadReal != null
        ? <span key="r" style={{ fontWeight: 500 }}>{miles(l.hhPorUnidadReal, 2)}</span>
        : <Hueco key="r">{l.porQueNoSeMide}</Hueco>,
      l.hhPorUnidadPlan != null ? <Hueco key="p">{miles(l.hhPorUnidadPlan, 2)}</Hueco> : <Hueco key="p" />,
      r == null
        ? <Hueco key="d" />
        : <span key="d" style={{ color: r >= 0 ? '#067647' : V.neg }}>
            {miles(Math.abs(r), 1)} % {r >= 0 ? 'mejor' : 'peor'}
          </span>,
    ]} />
  )
}

/**
 * EL PRECIO DEL DATO QUE FALTA. No es una nota al pie: es cuántas horas de esta quincena quedaron
 * sin poder evaluarse, que es exactamente el argumento para cargar la cantidad ejecutada.
 */
function QueLoDestraba({ resumen }: {
  resumen: { sinMedida: number; hhConActividad: number; hhSinActividad: number; medidas: number }
}) {
  if (resumen.sinMedida === 0 && resumen.hhSinActividad === 0) return null
  return (
    <p data-testid="productividad-destraba" style={{
      margin: 0, fontSize: '11.5px', color: V.apagado, lineHeight: 1.6,
    }}>
      {resumen.sinMedida > 0 && (
        <>
          <strong style={{ color: V.warn, fontWeight: 600 }}>{resumen.sinMedida} actividad(es) sin medir.</strong>{' '}
          Lo destraba cargar la <strong>cantidad ejecutada y su unidad</strong> al cargar el día:
          hoy <code>registros_hh</code> no tiene dónde guardarlas.{' '}
        </>
      )}
      {resumen.hhSinActividad > 0 && (
        <>
          <strong style={{ color: V.warn, fontWeight: 600 }}>{miles(resumen.hhSinActividad, 1)} h sin actividad.</strong>{' '}
          Lo destraba elegir la actividad al cargar el día.
        </>
      )}
      <br />
      Con dos quincenas de cantidad cargada, la base maestra deja de estimar rendimientos y empieza a medirlos.
    </p>
  )
}
