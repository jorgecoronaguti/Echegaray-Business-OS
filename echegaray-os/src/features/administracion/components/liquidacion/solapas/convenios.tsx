// PANTALLA 8 · EXPOSICIÓN DEL CONVENIO — CUANTIFICADA.
//
// *«Un renglón en rojo no es una decisión; un número sí.»* El cuadro de la izquierda dice quién cobra
// por debajo del piso de su convenio y cuánto cuesta la quincena de ponerlo en regla —diferencia por
// hora × horas esperadas—. El de la derecha dice lo que NO se puede afirmar, con lo que lo destraba.
//
// ═══ EL ROJO SÓLO SALE CON UN PISO REAL ═══
//
// `convenio_escala` nace vacía. Si «sin escala» cayera al mismo casillero que «cumple», la pantalla
// mostraría el plantel entero en regla y $ 0 para regularizar — el peor verde falso posible, porque
// un jornal por debajo del convenio es deuda laboral, no ahorro. Las líneas sin piso se cuentan
// aparte y se listan al final del cuadro, en gris.
//
// ═══ Y EL HUECO TRAE SU FORMULARIO AL LADO ═══
//
// No alcanza con declarar que falta la escala: mientras nadie la cargue, esas personas siguen sin
// control. El formulario de la derecha la carga en cinco campos, y el OS ofrece la escala del CCT
// 76/75 que ya tiene para copiarla con su fuente — ofrecerla, no aplicarla sola.

import { Aviso } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import { getExposicionDeLaQuincena } from '../../../services/exposicionConvenioService'
import type { LineaExposicion } from '../../../services/exposicionConvenio'
import { categoriaVisible } from '../../../services/vocabularioPersona'
import { esFechaISO, quincenaDe, rotuloQuincena, type Quincena } from '../../../services/quincena'
import { FormularioEscala } from './FormularioEscala'
import { ALTO_LIQ, Cuadro, Cuerpo, Encabezado, Fila, Hueco, Titulo, Total, miles } from './tabla'

// `dc:544` — las seis columnas de la pantalla 8.
const COLS = 'minmax(200px,1fr) 120px 90px 90px 88px 120px'

export async function SolapaConvenios({ quincenaPedida, hoy }: {
  quincenaPedida?: string; hoy: string
}) {
  const q = quincenaDe(esFechaISO(quincenaPedida) ? quincenaPedida : hoy)
  const supabase = await createClient()
  const exp = await getExposicionDeLaQuincena(supabase, q)
  const { lineas, resumen, horasEsperadas, errores } = exp
  const conPiso = lineas.filter((l) => l.porQueNoSeCompara == null)
  const sinComparar = lineas.filter((l) => l.porQueNoSeCompara != null)

  return (
// EL TESTID DICE «PANTALLA», NO «SOLAPA», Y NO ES UN CAPRICHO: `BarraSolapas` ya emite
// `data-testid="solapa-<clave>"` para CADA PESTAÑA de la barra. Con el mismo nombre acá,
// `[data-testid="solapa-convenios"]` devolvía DOS nodos —la pestaña y el contenido— y cualquier
// aserción futura habría medido el botón creyendo que medía la pantalla.
    <section data-testid="pantalla-convenios">
      <Titulo numero="8" titulo="Exposición del convenio · cuantificada"
        bajada="un renglón en rojo no es una decisión; un número sí." />

      {errores.map((e) => (
        <div key={e.que} style={{ paddingBottom: 10 }}>
          <Aviso tono="neg" testid="convenio-error" titulo={`No pude leer ${e.que}`}>{e.error}</Aviso>
        </div>
      ))}

      <Cuadro testid="cuadro-convenios">
        <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 520, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Quién está bajo el piso, y cuánto cuesta arreglarlo</span>
              <span style={{ fontSize: '11px', color: V.tenue }}>
                {rotuloQuincena(q)} · {miles(horasEsperadas, 0)} h esperadas
              </span>
            </div>

            <Cuerpo>
              <Encabezado columnas={COLS} celdas={['Persona', 'Categoría', 'Paga', 'Piso', 'Brecha', 'Regularizar']} />
              {lineas.length === 0 && (
                <Fila columnas={COLS} tenue celdas={['No hay nadie en el plantel para esta quincena.', '', '', '', '', '']} />
              )}
              {conPiso.map((l) => <FilaPersona key={l.personaId} l={l} />)}
              {sinComparar.map((l) => <FilaSinPiso key={l.personaId} l={l} />)}
              <Total columnas={COLS} testid="total-regularizar" celdas={[
                `${resumen.bajoElPiso} bajo el piso · ${resumen.comparadas} comparada(s)`,
                '', '', '',
                resumen.sinPiso > 0
                  ? <span key="s" style={{ color: V.warn, fontWeight: 400, fontSize: '11.5px' }}>{resumen.sinPiso} sin piso</span>
                  : '',
                <span key="t" style={{ color: resumen.bajoElPiso > 0 ? V.neg : V.tinta }}>
                  {miles(resumen.regularizarTotal)} /q
                </span>,
              ]} />
            </Cuerpo>
          </div>

          <div style={{ width: 400, flex: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <span style={{ fontSize: '12.5px', fontWeight: 600 }}>Lo que no se puede afirmar todavía</span>
            <NoDibujable resumen={resumen} />
            <div style={{ borderTop: `1px solid ${V.linea}`, paddingTop: 14 }}>
              <span style={{ fontSize: '12.5px', fontWeight: 600, display: 'block', paddingBottom: 10 }}>
                Cargar un piso de escala
              </span>
              <FormularioEscala
                convenios={exp.conveniosDelPlantel.length > 0 ? exp.conveniosDelPlantel : ['0076/75 UOCRA']}
                categorias={categoriasDelCuadro(lineas, exp.sugerencia)}
                sugerencia={exp.sugerencia}
                desdePorDefecto={desdeSugerido(q)}
              />
            </div>
          </div>
        </div>
      </Cuadro>
    </section>
  )
}

/** Una persona comparada contra su piso. El rojo sale SÓLO cuando el piso es real y está debajo. */
function FilaPersona({ l }: { l: LineaExposicion }) {
  return (
    <Fila columnas={COLS} alto={ALTO_LIQ.filaPersona} testid={`convenio-${l.personaId}`} celdas={[
      <span key="n" title={l.origenTarifa ?? undefined} style={{
        display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{l.nombre}</span>,
      <Hueco key="c">{categoriaVisible(l.categoria, null)}</Hueco>,
      miles(l.valorHora),
      <Hueco key="p" >{miles(l.piso?.valorHora ?? null)}</Hueco>,
      <span key="b" style={{ color: l.bajoElPiso ? V.neg : V.apagado }}>
        {l.brechaPct == null ? '—' : `${l.brechaPct > 0 ? '+' : '−'}${miles(Math.abs(l.brechaPct), 1)} %`}
      </span>,
      l.bajoElPiso
        ? <span key="r">{miles(l.regularizar)} /q</span>
        : <Hueco key="r">al día</Hueco>,
    ]} />
  )
}

/**
 * Una persona que no se pudo comparar. Gris, sin importe y con el motivo escrito entero.
 *
 * LLEVA SU PROPIA REJILLA A PROPÓSITO: el motivo es una frase —«sin piso: la escala de X no está
 * cargada»— y en la columna de 90 px del piso se partía en cinco renglones, con filas de 110 px que
 * enterraban a los que sí se compararon. Acá las tres últimas columnas se funden en una sola.
 */
const COLS_SIN_PISO = 'minmax(200px,1fr) 120px 90px minmax(280px,1fr)'

function FilaSinPiso({ l }: { l: LineaExposicion }) {
  return (
    <Fila columnas={COLS_SIN_PISO} alto={ALTO_LIQ.renglon} tenue testid={`convenio-${l.personaId}`} celdas={[
      <span key="n" style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {l.nombre}
      </span>,
      categoriaVisible(l.categoria, null),
      l.valorHora == null ? '—' : miles(l.valorHora),
      l.porQueNoSeCompara,
    ]} />
  )
}

/** §8 del handoff, con los números de ESTA quincena donde el OS los tiene. */
function NoDibujable({ resumen }: {
  resumen: { sinPiso: number; conveniosSinEscala: string[] }
}) {
  const fila = (que: string, estado: string) => (
    <div key={que} style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14,
      minHeight: ALTO_LIQ.renglon, borderBottom: `1px solid ${V.linea}`, fontSize: '12.5px',
    }}>
      <span style={{ color: V.apagado }}>{que}</span>
      <span style={{ fontSize: '11.5px', color: V.tenue, textAlign: 'right' }}>{estado}</span>
    </div>
  )
  return (
    <div data-testid="no-dibujable" style={{ display: 'flex', flexDirection: 'column' }}>
      {resumen.conveniosSinEscala.length > 0
        ? resumen.conveniosSinEscala.map((c) =>
          fila(`Escala de ${c}`, `sin cargar · ${resumen.sinPiso} persona(s) sin piso`))
        : fila('Escala de los convenios', 'cargada para todo el plantel')}
      {fila('Recibo bajo el piso de 50 h', 'falta el neto por quincena')}
      {fila('F931 al día', 'sin integración con ARCA')}
      {fila('Libro de Sueldos y Jornales', 'no se localizó en Drive')}
    </div>
  )
}

/** Las categorías que ofrece el formulario: las del plantel más las que trae la escala del OS. */
function categoriasDelCuadro(
  lineas: readonly LineaExposicion[], sugerencia: readonly { categoria: string }[],
): string[] {
  const del = lineas
    .map((l) => categoriaVisible(l.categoria, null))
    .filter((c): c is string => typeof c === 'string' && c !== '' && c !== '—')
  return [...new Set([...sugerencia.map((s) => s.categoria), ...del])].sort()
}

/** El primer día de la quincena: es la vigencia que casi siempre corresponde y se puede cambiar. */
const desdeSugerido = (q: Quincena): string => q.desde
