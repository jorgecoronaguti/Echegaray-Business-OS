import Link from 'next/link'
import { Aviso, Vacio } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { pesos } from './formato'
import { createClient } from '@/lib/supabase/server'
import {
  correrQuincena, esFechaISO, quincenaDe, rotuloQuincena,
} from '../../services/quincena'
import {
  desgloseDeQuincena, tarjetaDeQuincena, totalesDeCuadro, type ParteDeLaTarjeta,
} from '../../services/liquidacionQuincena'
import { getLiquidacionDeLaQuincena } from '../../services/liquidacionQuincenaService'
import { CuadroLiquidacion } from './CuadroLiquidacion'

// LA SOLAPA «LIQUIDACIÓN» — qué cobra cada persona en esta quincena y por qué canal sale.
//
// Es lo que hasta hoy contesta la pestaña «Nómina» del Flujo de Caja. Vive al lado de Asistencia
// porque es la MISMA quincena mirada un paso después: ahí se cargan las horas, acá se convierten en
// plata. Una pantalla aparte obligaría a elegir desde el menú entre dos vistas del mismo período.
//
// ═══ LO QUE ESTA PANTALLA NO HACE, Y ESTÁ ESCRITO PORQUE ES LO QUE LA MANTIENE EN NIVEL D ═══
//
// No escribe en el Sheet. No marca la quincena como pagada —eso sigue siendo la columna «Pagado el»
// de «Jornales por Quincena»—. No genera recibos: los hace el contador. «Cerrar quincena» congela
// las cifras calculadas y nada más.
//
// ═══ LAS HORAS SON LAS CARGADAS, NO LAS PROYECTADAS AL DÍA DE PAGO ═══
//
// La pestaña del Sheet completa los días que faltan de la quincena con la jornada, porque el dueño
// necesita saber cuánto va a firmar el día de pago. Esta pantalla NO lo hace: muestra lo que está
// cargado, y dice hasta qué día. Las dos respuestas son legítimas y distintas, y mezclarlas sería
// publicar horas que nadie trabajó todavía como si fueran un hecho. Cuál de las dos rige el pago lo
// decide el dueño; hasta entonces, la que no inventa nada.

export async function BloqueLiquidacion({ quincenaPedida, hoy, hrefDe, puedeCerrar }: {
  quincenaPedida?: string
  hoy: string
  hrefDe: (quincena: string) => string
  /** Congelar una quincena es de Dirección y Administración. La RLS decide de verdad. */
  puedeCerrar: boolean
}) {
  const quincena = quincenaDe(esFechaISO(quincenaPedida) ? quincenaPedida : hoy)
  const supabase = await createClient()
  const { cuadros, camposEditables, estados, errores, sinActividad } = await getLiquidacionDeLaQuincena(supabase, quincena)

  const totales = cuadros.map((c) => totalesDeCuadro(c.lineas))
  const tarjeta = tarjetaDeQuincena(totales)
  const desglose = desgloseDeQuincena(cuadros.map((c, i) => ({ titulo: c.titulo, totales: totales[i] })))
  const conFilas = cuadros.some((c) => c.lineas.length > 0)

  return (
    <div data-testid="bloque-liquidacion">
      {/* UNA FUENTE QUE NO SE PUDO LEER SE DICE CON SU ERROR. Un cuadro en cero porque la RLS
          rechazó la consulta es indistinguible de una quincena sin cargar, y la diferencia entre
          las dos es toda la plata. */}
      {errores.map((e) => (
        <div key={e.que} style={{ padding: '0 0 10px' }}>
          <Aviso tono="neg" testid={`liquidacion-error`} titulo={`No pude leer ${e.que}`}>{e.error}</Aviso>
        </div>
      ))}

      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10, padding: '4px 0 12px',
      }}>
        <span style={{ fontSize: '13px', color: V.tinta }} data-testid="rotulo-quincena-liquidacion">
          {rotuloQuincena(quincena)}
        </span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, fontSize: '12px' }}>
          <Link href={hrefDe(correrQuincena(quincena, -1).desde)} prefetch={false}
            data-testid="liquidacion-quincena-anterior" style={{ color: V.apagado }}>‹ anterior</Link>
          <Link href={hrefDe(correrQuincena(quincena, 1).desde)} prefetch={false}
            data-testid="liquidacion-quincena-siguiente" style={{ color: V.apagado }}>siguiente ›</Link>
        </span>
      </div>

      <Tarjeta tarjeta={tarjeta} desglose={desglose} />

      <SinActividad personas={sinActividad} />

      {!conFilas ? (
        <Vacio>
          Nadie tiene horas cargadas ni tarifa vigente en esta quincena. Las horas se cargan en la
          solapa <Link href={hrefDe(quincena.desde).replace('liquidacion', 'asistencia')} className="underline">Horas</Link>.
        </Vacio>
      ) : (
        <>
          {cuadros.map((c, i) => (
            <CuadroLiquidacion
              key={c.grupo}
              cuadro={c}
              totales={totales[i]}
              quincena={{ desde: quincena.desde, hasta: quincena.hasta }}
              estado={estados[c.grupo]?.estado ?? 'abierta'}
              cerradaEn={estados[c.grupo]?.cerradaEn ?? null}
              puedeCerrar={puedeCerrar}
              camposEditables={camposEditables}
            />
          ))}
          <Origenes adelantoSinFuente={cuadros.some((c) => c.adelantoSinFuente)} />
        </>
      )}
    </div>
  )
}

/**
 * QUIÉNES NO ESTÁN EN LA LISTA — porque una lista que se acorta en silencio es indistinguible de
 * una que se rompió.
 *
 * Dueño, 09/09/2026: «solo dejame en plantel quienes estén activos esta quincena». No se dio de baja
 * a nadie: el padrón está intacto y estos nombres están acá, a un clic de distancia.
 */
function SinActividad({ personas }: { personas: { id: string; nombre: string }[] }) {
  if (personas.length === 0) return null
  return (
    <details data-testid="liquidacion-sin-actividad" style={{ margin: '0 0 14px' }}>
      <summary style={{ fontSize: '11.5px', color: V.apagado, cursor: 'pointer' }}>
        {personas.length} sin actividad esta quincena · no se dieron de baja
      </summary>
      <p style={{ fontSize: '11.5px', color: V.tenue, margin: '6px 0 0', lineHeight: 1.6 }}>
        {personas.map((p) => p.nombre).join(' · ')}
      </p>
    </details>
  )
}

/**
 * DE DÓNDE SALE CADA COLUMNA. Una sola vez al pie, no repetido en cada cuadro.
 *
 * Es la regla del dueño —ningún importe sin origen— y no es prosa: son cuatro nombres de tabla. Lo
 * que falta se dice con el mismo peso que lo que está: el ADELANTO en efectivo no tiene tabla, y un
 * cero mudo en una columna que se RESTA le paga dos veces a quien ya recibió plata.
 */
function Origenes({ adelantoSinFuente }: { adelantoSinFuente: boolean }) {
  return (
    <p data-testid="origenes" style={{ fontSize: '11px', color: V.tenue, lineHeight: 1.6, margin: 0 }}>
      COBRA <code>registros_hh</code> + <code>asistencia_dia</code> × <code>persona_tarifa</code>
      {' · '}YA TRANSFERIDO <code>nomina_adelanto</code>
      {' · '}POR BANCO <code>nomina_recibo_neto</code> confirmado contra el lote del extracto
      {' · '}EFECTIVO redondeado lo escribís vos
      {adelantoSinFuente && (
        <>
          <br />
          <span style={{ color: V.warn }}>
            ADELANTO en efectivo: sin fuente en el OS — sigue en la columna Z de JORNALES.
          </span>
        </>
      )}
    </p>
  )
}

/**
 * LA TARJETA: POR BANCO · EN EFECTIVO · TOTAL de toda la quincena.
 *
 * El dueño lo pidió con esas palabras: «las dos primeras dan la tercera». Cuando NO cierra, la
 * tarjeta lo dice en vez de dibujar tres números que no se sostienen — un total que no cuadra y no
 * se avisa es peor que ningún total.
 */
function Tarjeta({ tarjeta, desglose }: {
  tarjeta: { porBanco: number; enEfectivo: number; total: number; cierra: boolean }
  desglose: ParteDeLaTarjeta[]
}) {
  return (
    <div
      data-testid="tarjeta-liquidacion"
      style={{
        display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'baseline',
        border: `1px solid ${V.linea}`, borderRadius: 6, padding: '14px 18px', marginBottom: 18,
        background: '#FFFFFF',
      }}
    >
      <Cifra rotulo="POR BANCO" valor={tarjeta.porBanco} testid="tarjeta-por-banco" />
      <Cifra rotulo="EN EFECTIVO" valor={tarjeta.enEfectivo} testid="tarjeta-en-efectivo" />
      <Cifra rotulo="TOTAL DE LA QUINCENA" valor={tarjeta.total} testid="tarjeta-total" fuerte />
      {!tarjeta.cierra && (
        <span style={{ fontSize: '12px', color: V.neg }} data-testid="tarjeta-no-cierra">
          Por banco + en efectivo no da el total.
        </span>
      )}
      {/* DE DÓNDE SALE EL TOTAL. Sin esto, el pie de Obreros y la tarjeta se leen como dos
          respuestas a la misma pregunta y una de las dos tiene que estar mal. */}
      {desglose.length > 0 && (
        <span data-testid="tarjeta-desglose" style={{
          flexBasis: '100%', fontSize: '11.5px', color: V.tenue, fontVariantNumeric: 'tabular-nums',
        }}>
          {desglose.map((d) => `${d.rotulo}: ${pesos(d.total)}`).join('  ·  ')}
        </span>
      )}
    </div>
  )
}

function Cifra({ rotulo, valor, testid, fuerte = false }: {
  rotulo: string; valor: number; testid: string; fuerte?: boolean
}) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: '11px', letterSpacing: '.06em', color: V.tenue }}>{rotulo}</span>
      <span
        data-testid={testid}
        style={{
          fontSize: fuerte ? '20px' : '17px',
          fontWeight: fuerte ? 600 : 500,
          color: V.tinta,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {pesos(valor)}
      </span>
    </span>
  )
}

// EL FORMATO VIVE EN `formato.ts` Y SE RE-EXPORTA DESDE ACÁ. Las celdas editables son de cliente y
// este archivo es de servidor: un módulo `'use client'` no puede prestarle una función a un
// componente de servidor. Se re-exporta en vez de mudar el import de cada llamador porque `pesos`
// desde «el bloque de liquidación» es el camino que el resto del módulo ya conoce.
export { pesos } from './formato'
