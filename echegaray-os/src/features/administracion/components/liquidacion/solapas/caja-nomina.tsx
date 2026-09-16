import { Aviso } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import { alicuotasVigentes, multiplicadorDeCosto, proyectarQuincena } from '../../../services/costoHora'
import { getAlicuotas, getJornalesDelSheet, getPersonasProyectables, getValorHoraVigente } from '../../../services/costoLecturas'
import { horasEsperadasDeQuincena } from '../../../services/liquidacionQuincena'
import { leerCuadroDeLaQuincena } from '../../../services/cuadroDeLaQuincenaService'
import { totalesDelEspejo, type TotalesDelEspejo } from '../../../services/espejoDeJornales'
import { proyeccionDeQuincena } from '../../../services/proyeccionDeMasa'
import { correrQuincena, esFechaISO, quincenaDe, rotuloQuincena, type Quincena } from '../../../services/quincena'
import { horas as nHoras, pesos } from '../formato'
import { ALTO_LIQ } from './tabla'
import type { PropsDeSolapa } from './index'

// «CAJA Y PROYECCIÓN» — cuánta plata sale esta quincena, si el Flujo de Caja dice lo mismo, y cuánta
// sale en las dos que vienen.
//
// ═══ EL RENGLÓN DE TOTALES ES EL PIE DE LA QUINCENA, NO OTRA SUMA ═══
//
// Dueño, 14/09/2026: datos repetidos en «Más». Esta sección traía la tabla de Pagos entera —las
// mismas columnas que la fila del cuadro— y banco/efectivo/total tres veces, sumados con
// `totalesDeCuadro` mientras el pie de la Quincena sumaba con `totalesDelEspejo`. Ahora las filas las
// arma `leerCuadroDeLaQuincena` y se suman con `totalesDelEspejo`, igual que el pie. La única
// diferencia con el pie es a propósito: acá no aplican el recorte ni el buscador del cuadro.
//
// ═══ LA PROYECCIÓN ES UN PISO Y EL AGUINALDO NO SE ESTIMA (§8) ═══
//
// Horas esperadas por el $/h vigente: sin extras, sin altas futuras, y quien no tiene tarifa se cuenta
// aparte en vez de valer cero. Sin la mejor remuneración del semestre en la base, un aguinaldo sería
// un invento en el número que decide cuánta plata se junta.

export async function SolapaCaja({ quincenaPedida, hoy }: PropsDeSolapa) {
  const quincena = quincenaDe(esFechaISO(quincenaPedida) ? (quincenaPedida as string) : hoy)
  const supabase = await createClient()
  const [{ alicuotas, errores }, cuadro, jornales, { porPersona, error: errTarifa }] = await Promise.all([
    getAlicuotas(supabase),
    leerCuadroDeLaQuincena(supabase, quincena, hoy),
    getJornalesDelSheet(supabase, quincena),
    getValorHoraVigente(supabase, quincena.hasta),
  ])
  const { personas, error: errPlantel } = await getPersonasProyectables(supabase, porPersona)
  const m = multiplicadorDeCosto(alicuotasVigentes(alicuotas, quincena.hasta), 1)
  const totales = totalesDelEspejo(cuadro.filas)
  // LA MASA EN CURSO ERA UN ÚNICO DE «HORAS»: lo ya cargado más lo que falta si se cumplen los días.
  const enCurso = proyeccionDeQuincena(cuadro.grilla, cuadro.datos.personas, hoy)
  const siguientes = [1, 2].map((n) => {
    const q = correrQuincena(quincena, n)
    return { q, p: proyectarQuincena(personas, horasEsperadasDeQuincena(q), m.valor) }
  })
  const fallas = [
    ...errores, ...cuadro.datos.errores, ...cuadro.liquidacion.errores,
    ...(errTarifa ? [errTarifa] : []), ...(errPlantel ? [errPlantel] : []), ...(jornales.error ? [jornales.error] : []),
  ]

  return (
    <section data-testid="solapa-caja-nomina">
      {fallas.map((e, i) => (
        <div key={`${e.que}-${i}`} style={{ paddingBottom: 10 }}>
          <Aviso tono="neg" titulo={`No pude leer ${e.que}`}>{e.error}</Aviso>
        </div>
      ))}
      <Totales quincena={quincena} totales={totales}
        // CON BLANCO + NEGRO EL BANCO ES EL NETO, GIRADO O NO: el aviso «no cuenta como banco» sólo
        // vale para quien sigue la cadena de siempre (Oficina, finales).
        sinGiro={cuadro.filas.filter((f) => f.linea.reciboSinGiro && f.linea.sueldo == null).map((f) => f.nombre)}
        sinActividad={cuadro.liquidacion.sinActividad.length} />
      <Cotejo total={totales.cobra} quincena={quincena} delSheet={jornales.fila} />
      <Proyeccion quincena={quincena} enCurso={enCurso} siguientes={siguientes} personas={personas.length} />
    </section>
  )
}

function Totales({ quincena, totales, sinGiro, sinActividad }: {
  quincena: Quincena
  totales: TotalesDelEspejo
  sinGiro: readonly string[]
  sinActividad: number
}) {
  const aviso = { fontSize: '12px', color: V.warn } as const
  const p = totales.pago
  return (
    <div data-testid="caja-totales" style={{
      display: 'flex', alignItems: 'baseline', gap: 24, flexWrap: 'wrap', padding: '4px 0 12px', marginBottom: 22,
      borderBottom: `1px solid ${V.linea}`, fontSize: '13px', fontVariantNumeric: 'tabular-nums',
    }}>
      <span style={{ fontSize: '14.5px', fontWeight: 600, color: V.tinta }}>{rotuloQuincena(quincena)}</span>
      {/* LOS MISMOS NÚMEROS QUE EL PIE DE LA QUINCENA (QA, 16/09/2026): antes esta línea sumaba banco + efectivo SIN
          los sueldos mensuales y se llamaba «total», $424.795 menos que el cuadro. Banco + negro + mensuales = total. */}
      <Cifra testid="por-banco" rotulo="Banco" valor={totales.netoBandas} />
      <Cifra testid="efectivo-viernes" rotulo="Negro (efectivo)" valor={totales.negro} />
      {totales.mensuales > 0 && <Cifra testid="caja-mensuales" rotulo="Sueldos mensuales" valor={totales.mensuales} />}
      <Cifra testid="total-quincena" rotulo="Total quincena" valor={totales.cobra} fuerte />
      <Cifra testid="caja-pagado" rotulo="Pagado" valor={p.pagado} />
      <Cifra testid="caja-saldo" rotulo="Falta pagar" valor={p.saldoTotal ?? 0} fuerte />
      <span data-testid="caja-a-pagar" style={{ color: V.apagado }}>
        {'a pagar hoy: '}<strong style={{ color: V.tinta }}>{`efectivo ${pesos(p.aPagarEfectivo)} · banco ${pesos(p.aPagarBanco)}`}</strong>
      </span>
      {totales.sinTarifa > 0 && <span style={aviso}>{`${totales.sinTarifa} sin retribución: no suman`}</span>}
      {/* EL MISMO CONTEO QUE EL PIE DE LA QUINCENA: sin neto del blanco no hay total que sumar. */}
      {totales.sinNeto > 0 && <span data-testid="caja-sin-neto" style={aviso}>{`${totales.sinNeto} sin neto: no suman`}</span>}
      {/* R7 · UN RECIBO SIN GIRO NO CUENTA COMO BANCO: hasta que el lote aparece en el extracto, sale en efectivo. */}
      {sinGiro.length > 0 && (
        <span data-testid="pagos-recibo-sin-giro" style={aviso}>
          {`recibo sin giro, no cuenta como banco: ${sinGiro.join(', ')}`}
        </span>
      )}
      {sinActividad > 0 && (
        <span data-testid="pagos-sin-actividad" style={{ fontSize: '12px', color: V.apagado }}>{`${sinActividad} sin actividad`}</span>
      )}
    </div>
  )
}

function Cotejo({ total, quincena, delSheet }: {
  total: number
  quincena: Quincena
  delSheet: Awaited<ReturnType<typeof getJornalesDelSheet>>['fila']
}) {
  // UN ESPEJO SINCRONIZADO ANTES DE QUE LA QUINCENA EMPEZARA NO LA PROYECTA: restarlo daría una
  // «diferencia» del tamaño del total (medido 09/09/2026: total 1,04 sincronizado el 20/07). Se muestra
  // con su fecha, pero no se resta.
  const espejoUtil = delSheet?.sincronizadoEn != null && delSheet.sincronizadoEn >= quincena.desde
  const difiere = espejoUtil && delSheet?.total != null && Math.abs(delSheet.total - total) > 1
  return (
    <>
      <h4 style={titulo}>Contra la línea Jornales del Flujo de Caja</h4>
      {/* A 390 px la tabla rueda dentro de su caja en vez de empujar la página. */}
      <div className="overflow-x-auto" style={{ marginBottom: 24 }}>
        <table style={{ ...tabla, minWidth: 420, maxWidth: 720 }}>
          <tbody>
            <Renglon testid="cf-os" rotulo="Este módulo (total quincena)" valor={pesos(total || null)} />
            {/* UN ESPEJO VIEJO NO MUESTRA SU CIFRA (QA, 16/09/2026): «$1,04» al lado de $10 M era un número sin sentido. */}
            <Renglon testid="cf-sheet" rotulo={`Sheet · línea Jornales${delSheet ? ` (${delSheet.estado})` : ''}`}
              valor={delSheet?.total == null || !espejoUtil ? 'sin espejo de esta quincena' : pesos(delSheet.total)}
              nota={delSheet?.sincronizadoEn
                ? (espejoUtil ? `espejo del ${delSheet.sincronizadoEn}` : `el último espejo es del ${delSheet.sincronizadoEn}, anterior a esta quincena`)
                : 'no hay fila del Sheet para esta ventana'} />
            {difiere && delSheet?.total != null && (
              <Renglon testid="cf-diferencia" fuerte rotulo="Diferencia" valor={pesos(delSheet.total - total)}
                nota="el Sheet completa con la jornada los días que faltan" />
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

function Proyeccion({ quincena, enCurso, siguientes, personas }: {
  quincena: Quincena
  enCurso: ReturnType<typeof proyeccionDeQuincena>
  siguientes: { q: Quincena; p: ReturnType<typeof proyectarQuincena> }[]
  personas: number
}) {
  const sinTarifa = (n: number) => n > 0 && <span style={{ marginLeft: 6, fontSize: '11.5px', color: V.warn }}>+{n} sin tarifa</span>
  return (
    <>
      <h4 style={titulo}>Proyección · piso</h4>
      <div className="overflow-x-auto">
        <table style={{ ...tabla, minWidth: 560, maxWidth: 900 }}>
          <thead>
            <tr>
              {['Quincena', 'Personas', 'Horas', 'Bolsillo', 'Costo estimado'].map((c, i) => (
                <th key={c} style={{ ...th, textAlign: i === 0 ? 'left' : 'right' }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr data-testid="caja-masa-en-curso" style={{ borderBottom: `1px solid ${V.lineaFila}` }}>
              <td style={{ ...celda, textAlign: 'left' }}>{`${rotuloQuincena(quincena)} · en curso`}</td>
              <td style={celda}>{enCurso.personas - enCurso.sinTarifa}{sinTarifa(enCurso.sinTarifa)}</td>
              <td style={celda}>{nHoras(enCurso.horasProyectadas)}</td>
              <td style={celda} title={`ya cargado ${pesos(enCurso.masaCargada)} · por cumplir ${pesos(enCurso.masaPorCumplir)}`}>
                {pesos(enCurso.masaProyectada || null)}
              </td>
              <td style={{ ...celda, color: V.tenue }}>—</td>
            </tr>
            {siguientes.map(({ q, p }) => (
              <tr key={q.desde} data-testid="fila-proyeccion" style={{ borderBottom: `1px solid ${V.lineaFila}` }}>
                <td style={{ ...celda, textAlign: 'left' }}>{rotuloQuincena(q)}</td>
                <td style={celda}>{personas - p.sinTarifa}{sinTarifa(p.sinTarifa)}</td>
                <td style={celda}>{nHoras(p.horasEsperadas)}</td>
                <td style={celda}>{pesos(p.bolsillo || null)}</td>
                <td style={{ ...celda, fontWeight: 600 }}>{pesos(p.costoReal)}</td>
              </tr>
            ))}
            <tr data-testid="aguinaldo-sin-base">
              <td style={{ ...celda, textAlign: 'left', color: V.tenue }}>Aguinaldo</td>
              <td colSpan={4} style={{ ...celda, textAlign: 'left', color: V.tenue, fontSize: '11.5px' }}>
                sin base: falta la mejor remuneración del semestre
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  )
}

const titulo = { fontSize: '13px', fontWeight: 600, color: V.tinta, margin: '0 0 4px' }
const tabla = { width: '100%', borderCollapse: 'collapse' as const, fontVariantNumeric: 'tabular-nums' as const }
const th = {
  fontSize: '11px', fontWeight: 600, letterSpacing: '.06em', color: V.tenue, textTransform: 'uppercase' as const,
  borderBottom: `1px solid ${V.lineaFuerte}`, padding: '0 8px 8px', height: 30, verticalAlign: 'bottom' as const,
  whiteSpace: 'nowrap' as const,
}
const celda = { padding: '0 8px', height: ALTO_LIQ.fila, textAlign: 'right' as const, fontSize: '13px', whiteSpace: 'nowrap' as const }

function Cifra({ rotulo, valor, testid, fuerte }: { rotulo: string; valor: number; testid: string; fuerte?: boolean }) {
  return (
    <span data-testid={testid} style={fuerte ? { fontSize: '14px' } : undefined}>
      <span style={{ color: V.apagado }}>{`${rotulo} `}</span>
      <strong style={{ color: V.tinta }}>{pesos(valor)}</strong>
    </span>
  )
}

function Renglon({ rotulo, valor, nota, fuerte, testid }: {
  rotulo: string; valor: string; nota?: string; fuerte?: boolean; testid: string
}) {
  return (
    <tr data-testid={testid} style={{ borderBottom: `1px solid ${V.lineaFila}` }}>
      <td style={{ ...celda, textAlign: 'left', color: V.tinta, fontWeight: fuerte ? 600 : 400 }}>
        {rotulo}
        {nota && <span style={{ marginLeft: 8, fontSize: '11.5px', color: V.tenue }}>{nota}</span>}
      </td>
      <td style={{ ...celda, fontWeight: fuerte ? 600 : 400 }}>{valor}</td>
    </tr>
  )
}
