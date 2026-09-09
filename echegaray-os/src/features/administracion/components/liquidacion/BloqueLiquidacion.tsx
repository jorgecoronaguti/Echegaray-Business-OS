import Link from 'next/link'
import { Aviso, Vacio } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import {
  correrQuincena, esFechaISO, quincenaDe, rotuloQuincena,
} from '../../services/quincena'
import { tarjetaDeQuincena, totalesDeCuadro } from '../../services/liquidacionQuincena'
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
  const { cuadros, estados, errores } = await getLiquidacionDeLaQuincena(supabase, quincena)

  const totales = cuadros.map((c) => totalesDeCuadro(c.lineas))
  const tarjeta = tarjetaDeQuincena(totales)
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

      <Tarjeta tarjeta={tarjeta} />

      {!conFilas ? (
        <Vacio>
          Nadie tiene horas cargadas ni tarifa vigente en esta quincena. Las horas se cargan en la
          solapa <Link href={hrefDe(quincena.desde).replace('liquidacion', 'asistencia')} className="underline">Asistencia</Link>.
        </Vacio>
      ) : cuadros.map((c, i) => (
        <CuadroLiquidacion
          key={c.grupo}
          cuadro={c}
          totales={totales[i]}
          quincena={{ desde: quincena.desde, hasta: quincena.hasta }}
          estado={estados[c.grupo]?.estado ?? 'abierta'}
          cerradaEn={estados[c.grupo]?.cerradaEn ?? null}
          puedeCerrar={puedeCerrar}
        />
      ))}
    </div>
  )
}

/**
 * LA TARJETA: POR BANCO · EN EFECTIVO · TOTAL de toda la quincena.
 *
 * El dueño lo pidió con esas palabras: «las dos primeras dan la tercera». Cuando NO cierra, la
 * tarjeta lo dice en vez de dibujar tres números que no se sostienen — un total que no cuadra y no
 * se avisa es peor que ningún total.
 */
function Tarjeta({ tarjeta }: {
  tarjeta: { porBanco: number; enEfectivo: number; total: number; cierra: boolean }
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

export const pesos = (n: number | null): string =>
  n == null ? '—' : `$${Number(n).toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
