import { Aviso } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import { alicuotasVigentes, multiplicadorDeCosto, proyectarQuincena } from '../../../services/costoHora'
import { getAlicuotas, getJornalesDelSheet, getPersonasProyectables, getValorHoraVigente } from '../../../services/costoLecturas'
import { getLiquidacionDeLaQuincena } from '../../../services/liquidacionQuincenaService'
import { horasEsperadasDeQuincena, totalesDeCuadro } from '../../../services/liquidacionQuincena'
import { correrQuincena, rotuloQuincena, type Quincena } from '../../../services/quincena'

// PANTALLA 9 · CAJA DE NÓMINA — cuánto efectivo hay que tener el viernes.
//
// ═══ EL NÚMERO DE HOY SALE DE LA MISMA FUENTE QUE EL CUADRO DE PAGOS ═══
//
// `EN EFECTIVO` se lee de `getLiquidacionDeLaQuincena`, no de una consulta propia. Dos consultas
// que calculan «el efectivo de la quincena» son dos definiciones del mismo concepto, y tarde o
// temprano dan distinto — que es exactamente lo que Realidad Única prohíbe.
//
// ═══ LA PROYECCIÓN ES UN PISO Y SE DICE ═══
//
// Se proyecta con las horas ESPERADAS (9 h de lunes a jueves, 8 el viernes) por el $/h vigente de
// cada persona en la empresa. No incluye horas extra, no incluye altas futuras y no incluye a
// quien no tenga tarifa cargada: esos se cuentan aparte en vez de valer cero.
//
// ═══ EL AGUINALDO NO SE ESTIMA (§8) ═══
//
// Sin la mejor remuneración del semestre en la base, cualquier número sería un invento — y un
// invento en la caja de nómina se convierte en un cheque que no entra.

const pesos = (n: number | null): string =>
  n == null ? '—' : `$${Math.round(n).toLocaleString('es-AR')}`

export async function SolapaCajaNomina({ quincena }: { quincena: Quincena; hoy?: string }) {
  const supabase = await createClient()
  const [{ alicuotas, errores }, liq, jornales] = await Promise.all([
    getAlicuotas(supabase),
    getLiquidacionDeLaQuincena(supabase, quincena),
    getJornalesDelSheet(supabase, quincena),
  ])
  const { porPersona, error: errTarifa } = await getValorHoraVigente(supabase, quincena.hasta)
  const { personas, error: errPlantel } = await getPersonasProyectables(supabase, porPersona)

  const m = multiplicadorDeCosto(alicuotasVigentes(alicuotas, quincena.hasta), 1)
  const totales = liq.cuadros.map((c) => totalesDeCuadro(c.lineas))
  const efectivo = totales.reduce((s, t) => s + t.enEfectivo, 0)
  const porBanco = totales.reduce((s, t) => s + t.porBanco, 0)
  const sinTarifaHoy = totales.reduce((s, t) => s + t.sinTarifa, 0)

  const siguientes = [1, 2].map((n) => {
    const q = correrQuincena(quincena, n)
    return { q, p: proyectarQuincena(personas, horasEsperadasDeQuincena(q), m.valor) }
  })

  const fallas = [...errores, ...liq.errores, ...(errTarifa ? [errTarifa] : []), ...(errPlantel ? [errPlantel] : []), ...(jornales.error ? [jornales.error] : [])]
  const delSheet = jornales.fila
  const totalPropio = efectivo + porBanco
  // UN ESPEJO SINCRONIZADO ANTES DE QUE LA QUINCENA EMPEZARA NO PROYECTA ESTA VENTANA, y restarle
  // el cálculo daría una «diferencia» del tamaño del total entero. Medido el 09/09/2026: la fila
  // del Sheet para el 1-15 de septiembre trae total 1,04 y `sincronizado_en` del 20/07 — es un
  // residuo, no un pronóstico. Se muestra igual (con su fecha), pero no se resta.
  const espejoUtil = delSheet?.sincronizadoEn != null && delSheet.sincronizadoEn >= quincena.desde
  const difiere = espejoUtil && delSheet?.total != null && Math.abs(delSheet.total - totalPropio) > 1

  return (
    <section data-testid="solapa-caja-nomina">
      {fallas.map((e, i) => (
        <div key={`${e.que}-${i}`} style={{ paddingBottom: 10 }}>
          <Aviso tono="neg" titulo={`No pude leer ${e.que}`}>{e.error}</Aviso>
        </div>
      ))}

      <h3 style={titulo}>Caja de nómina</h3>
      <p style={bajada}>{rotuloQuincena(quincena)} · lo que hay que tener en billetes el día de pago.</p>

      <div style={{ display: 'flex', gap: 44, padding: '4px 0 22px', flexWrap: 'wrap' }}>
        <Dato testid="efectivo-viernes" rotulo="Efectivo el día de pago" valor={pesos(efectivo || null)}
          nota={sinTarifaHoy > 0 ? `${sinTarifaHoy} persona(s) sin tarifa no están en este número` : undefined} />
        <Dato testid="por-banco" rotulo="Por banco" valor={pesos(porBanco || null)} />
        <Dato testid="total-quincena" rotulo="Total de la quincena" valor={pesos(totalPropio || null)} />
      </div>

      {/* EL SHEET PROYECTA LA MISMA LÍNEA. Si difieren se muestran las dos con la fecha del espejo:
          una fuente congelada explica casi todas las diferencias, y sin la fecha se leería como un
          error del cálculo. */}
      <h4 style={{ ...titulo, fontSize: '13px' }}>Contra la línea Jornales del Flujo de Caja</h4>
      <table style={{ ...tabla, maxWidth: 720, marginBottom: 24 }}>
        <tbody>
          <Renglon testid="cf-os" rotulo="Este módulo (horas cargadas)" valor={pesos(totalPropio || null)} />
          <Renglon testid="cf-sheet" rotulo={`Sheet · línea Jornales${delSheet ? ` (${delSheet.estado})` : ''}`}
            valor={delSheet?.total == null ? 'sin espejo' : pesos(delSheet.total)}
            nota={delSheet?.sincronizadoEn
              ? `espejo del ${delSheet.sincronizadoEn}${espejoUtil ? '' : ' — anterior a esta quincena: no la proyecta'}`
              : 'no hay fila del Sheet para esta ventana'} />
          {difiere && delSheet?.total != null && (
            <Renglon testid="cf-diferencia" fuerte rotulo="Diferencia" valor={pesos(delSheet.total - totalPropio)}
              nota="el Sheet completa los días que faltan con la jornada; este módulo sólo muestra lo cargado" />
          )}
        </tbody>
      </table>

      <h4 style={{ ...titulo, fontSize: '13px' }}>Las próximas quincenas · piso proyectado</h4>
      <table style={{ ...tabla, maxWidth: 900 }}>
        <thead>
          <tr>
            {['Quincena', 'Personas', 'Horas esperadas', 'Bolsillo', 'Costo real'].map((c, i) => (
              <th key={c} style={{ ...th, textAlign: i === 0 ? 'left' : 'right' }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {siguientes.map(({ q, p }) => (
            <tr key={q.desde} data-testid="fila-proyeccion" style={{ borderBottom: `1px solid ${V.lineaFila}` }}>
              <td style={{ ...celda, textAlign: 'left' }}>{rotuloQuincena(q)}</td>
              <td style={celda}>
                {personas.length - p.sinTarifa}
                {p.sinTarifa > 0 && (
                  <span style={{ marginLeft: 6, fontSize: '11.5px', color: V.warn }}>+{p.sinTarifa} sin tarifa</span>
                )}
              </td>
              <td style={celda}>{p.horasEsperadas.toLocaleString('es-AR', { maximumFractionDigits: 1 })}</td>
              <td style={celda}>{pesos(p.bolsillo || null)}</td>
              <td style={{ ...celda, fontWeight: 600 }}>{pesos(p.costoReal)}</td>
            </tr>
          ))}
          <tr data-testid="aguinaldo-sin-base">
            <td style={{ ...celda, textAlign: 'left', color: V.tenue }}>Aguinaldo</td>
            <td colSpan={4} style={{ ...celda, textAlign: 'left', color: V.tenue, fontSize: '11.5px' }}>
              sin base — falta la mejor remuneración del semestre en la base. Estimarlo sería un
              invento en un número que decide cuánta plata se junta.
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  )
}

const titulo = { fontSize: '15px', fontWeight: 600, color: V.tinta, margin: '0 0 4px' }
const bajada = { fontSize: '12.5px', color: V.apagado, margin: '0 0 12px', maxWidth: 760 }
const tabla = { width: '100%', borderCollapse: 'collapse' as const, fontVariantNumeric: 'tabular-nums' as const }
const th = {
  fontSize: '11px', fontWeight: 600, letterSpacing: '.06em', color: V.tenue, textTransform: 'uppercase' as const,
  borderBottom: `1px solid ${V.lineaFuerte}`, padding: '0 8px 8px', height: 30, verticalAlign: 'bottom' as const,
  whiteSpace: 'nowrap' as const,
}
const celda = { padding: '0 8px', height: 52, textAlign: 'right' as const, fontSize: '13px', whiteSpace: 'nowrap' as const }

function Dato({ rotulo, valor, nota, testid }: { rotulo: string; valor: string; nota?: string; testid: string }) {
  return (
    <div data-testid={testid}>
      <div style={{ fontSize: '11px', letterSpacing: '.06em', color: V.tenue, textTransform: 'uppercase' }}>{rotulo}</div>
      <div style={{ fontSize: '21px', color: V.tinta, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{valor}</div>
      {nota && <div style={{ fontSize: '11.5px', color: V.warn, marginTop: 2, maxWidth: 320 }}>{nota}</div>}
    </div>
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
