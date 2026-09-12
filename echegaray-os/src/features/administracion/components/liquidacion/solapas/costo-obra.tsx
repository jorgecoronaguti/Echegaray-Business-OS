import { Aviso, Vacio } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import { alicuotasVigentes, lineasDeObra, multiplicadorDeCosto, type LineaDeObra } from '../../../services/costoHora'
import { getAlicuotas, getHorasPorObra, getValorHoraVigente } from '../../../services/costoLecturas'
import { getLiquidacionDeLaQuincena } from '../../../services/liquidacionQuincenaService'
import { leyendaDeHoras } from '../../../services/horasDeLaQuincena'
import { rotuloQuincena, type Quincena } from '../../../services/quincena'
import { ALTO_LIQ } from './tabla'

// PANTALLA 6 · LA QUINCENA CARGADA A LA OBRA (handoff v2).
//
// Horas por obra × $/h × multiplicador, contra la mano de obra presupuestada. Es la pantalla que
// convierte «la obra recibió sus horas» en «la obra recibió su costo».
//
// ═══ EL CONSUMO % SÓLO EXISTE CON BASE ═══
//
// Sin mano de obra presupuestada dice «sin base», nunca 0 %. Un 0 % se lee como «esta obra no
// consumió nada de lo presupuestado» — lo contrario de lo que pasa, que es que nadie cargó el
// presupuesto. La diferencia es entre una obra sana y una obra sin control.
//
// ═══ UNA OBRA CON ALGUIEN SIN TARIFA NO PUBLICA COSTO ═══
//
// Sumar sólo a los que tienen $/h daría un costo que parece completo y le falta gente. Se dice
// cuántos faltan, que es lo que se puede resolver hoy.
//
// ═══ «SIN OBRA IMPUTADA» ES LA CIFRA QUE EL MOCKUP PONE ARRIBA EN ÁMBAR ═══
//
// Esas horas se pagan igual y no las paga ninguna obra: van a estructura. Sumadas al total y sin
// separar, cada obra parece más cara de lo que es y la estructura parece gratis.

const MONO = "'IBM Plex Mono', monospace"

const miles = (n: number | null): string =>
  n == null ? '—' : Math.round(n).toLocaleString('es-AR')

const horas = (n: number): string => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })

/**
 * EL COLOR DEL CONSUMO. Rojo sólo problema real: pasarse del presupuesto de mano de obra.
 *
 * El corte en ámbar es un CRITERIO DECLARADO, no una medición: el mockup pinta 31 % verde y 78 %
 * ámbar, así que la frontera está entre esos dos y se fija en 75 %. Que una sola quincena consuma
 * tres cuartos de toda la mano de obra presupuestada de la obra es algo que alguien tiene que mirar
 * hoy — que es exactamente lo que el ámbar significa en el README §2.
 */
const UMBRAL_AMBAR = 75

function colorDelConsumo(consumo: number): string {
  if (consumo > 100) return V.neg
  if (consumo >= UMBRAL_AMBAR) return V.warn
  return V.pos
}

export async function SolapaCostoObra({ quincena }: { quincena: Quincena; hoy?: string }) {
  const supabase = await createClient()
  const { alicuotas, errores } = await getAlicuotas(supabase)
  const { porPersona, error: errTarifa } = await getValorHoraVigente(supabase, quincena.hasta)
  const { obras, presupuesto, errores: errHoras } = await getHorasPorObra(supabase, quincena, porPersona)
  // ═══ POR QUÉ ESTE TOTAL NO ES EL DE «HORAS» NI EL DE «PAGOS» (QA visual, 11/09/2026) ═══
  //
  // Acá decía 1.227, «Horas» 1.289 y «Pagos» 1.129, los tres bajo el mismo rótulo y en solapas
  // seguidas. Los tres correctos: a una obra se le cargan las horas TRABAJADAS, y las licencias
  // pagas —62 h— las paga la empresa. Cuesta una tanda de lecturas más y ése es el precio de que la
  // resta esté escrita UNA vez: calcularla acá sería el cuarto número.
  const { horas: horasQ } = await getLiquidacionDeLaQuincena(supabase, quincena)

  const m = multiplicadorDeCosto(alicuotasVigentes(alicuotas, quincena.hasta), 1)
  const lineas = lineasDeObra(obras, presupuesto, m.valor)
  const fallas = [...errores, ...errHoras, ...(errTarifa ? [errTarifa] : [])]

  const totalHoras = lineas.reduce((s, l) => s + l.horas, 0)
  const gente = lineas.reduce((s, l) => Math.max(s, l.gente), 0)
  const conCosto = lineas.filter((l) => l.costoReal != null)
  const totalCosto = conCosto.length === 0 ? null : conCosto.reduce((s, l) => s + (l.costoReal as number), 0)
  const totalBolsillo = lineas.some((l) => l.bolsillo == null)
    ? null
    : lineas.reduce((s, l) => s + (l.bolsillo as number), 0)
  const estructura = lineas.find((l) => l.obraId == null)?.costoReal ?? null
  const aObra = totalCosto == null ? null : totalCosto - (estructura ?? 0)
  const conObra = lineas.filter((l) => l.obraId != null).length

  return (
    <section data-testid="solapa-costo-obra">
      {fallas.map((e) => (
        <div key={e.que} style={{ paddingBottom: 10 }}>
          <Aviso tono="neg" titulo={`No pude leer ${e.que}`}>{e.error}</Aviso>
        </div>
      ))}

      <h3 style={titulo}>La quincena cargada a la obra</h3>
      <p style={bajada}>
        Las horas ya se imputan; la plata todavía no. Esto lo cierra.
        {m.valor == null
          ? ' Falta el multiplicador: cargá las alícuotas arriba para que estas horas se conviertan en costo.'
          : ''}
      </p>

      {lineas.length === 0 ? (
        <Vacio>No hay horas cargadas en esta quincena. Se cargan en la solapa Asistencia.</Vacio>
      ) : (
        <div data-testid="cuadro-costo-obra" style={cuadro}>
          <div style={cabecera}>
            <div style={{ fontSize: '14.5px', fontWeight: 600 }}>{rotuloQuincena(quincena)} · por obra</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 28, flexWrap: 'wrap' }}>
              <Cifra rotulo="A OBRA" valor={miles(aObra)} testid="total-a-obra" />
              <Cifra rotulo="A ESTRUCTURA" valor={miles(estructura)} tono={V.warn} testid="total-a-estructura" />
            </div>
          </div>

          {/* A 390 px LAS SIETE COLUMNAS NO ENTRAN Y NO SE ENCOGEN: sin el scroller empujan la
              página entera y la fila de total queda fuera de pantalla. Rueda dentro de su caja. */}
          <div className="overflow-x-auto" style={{ padding: '18px 22px 0' }}>
          <div style={{ minWidth: 700, display: 'flex', flexDirection: 'column', fontSize: '12.5px', fontVariantNumeric: 'tabular-nums' }}>
            <div data-testid="encabezado-obras" style={{ ...renglon, height: ALTO_LIQ.renglonBajo, alignItems: 'end', paddingBottom: 9, borderBottom: `1px solid ${V.linea}`, ...rotuloColumna }}>
              <div>Obra</div>
              <div style={{ textAlign: 'right' }}>HH</div>
              <div style={{ textAlign: 'right' }}>Gente</div>
              <div style={{ textAlign: 'right' }}>Bolsillo</div>
              <div style={{ textAlign: 'right' }}>Costo real</div>
              <div style={{ textAlign: 'right' }}>MO presupuestada</div>
              <div style={{ textAlign: 'right' }}>Consumido</div>
            </div>

            {lineas.map((l) => <FilaDeObra key={l.obraId ?? 'sin-obra'} l={l} />)}

            <div data-testid="total-obras" style={{ ...renglon, height: ALTO_LIQ.filaTotalAlta, alignItems: 'center', borderTop: `1px solid ${V.grafito}`, fontWeight: 600 }}>
              <div>{conObra} obra{conObra === 1 ? '' : 's'} · {gente} persona{gente === 1 ? '' : 's'}</div>
              <div style={{ textAlign: 'right' }}>{horas(totalHoras)}</div>
              <div />
              <div style={{ textAlign: 'right' }}>{miles(totalBolsillo)}</div>
              <div style={{ textAlign: 'right' }}>{miles(totalCosto)}</div>
              {/* NO SE SUMA UN TOTAL DE PRESUPUESTO: sumar el de las obras que sí tienen base daría
                  un consumo global contra un denominador incompleto. */}
              <div />
              <div />
            </div>
          </div>
          </div>
          <div style={{ height: 20 }} />
        </div>
      )}

      {/* LA RESTA CONTRA «HORAS», DICHA. Sin esto, 1.227 al lado de 1.289 en la solapa anterior se
          lee como un error de alguna de las dos. */}
      {leyendaDeHoras(horasQ, 'aObra') && (
        <p data-testid="costo-obra-leyenda-horas" style={{ fontSize: '11px', color: V.apagado, margin: '10px 0 0' }}>
          {leyendaDeHoras(horasQ, 'aObra')}.
        </p>
      )}

      {lineas.length > conCosto.length && (
        <p data-testid="obras-sin-costo" style={{ fontSize: '11.5px', color: V.warn, margin: '10px 0 0' }}>
          {lineas.length - conCosto.length} obra(s) sin costo publicable: falta el $/h de alguien o el multiplicador.
        </p>
      )}
    </section>
  )
}

function FilaDeObra({ l }: { l: LineaDeObra }) {
  const sinObra = l.obraId == null
  return (
    <div data-testid="fila-obra" style={{
      ...renglon, minHeight: sinObra ? 58 : 52, alignItems: 'center',
      borderBottom: `1px solid ${V.linea}`, background: sinObra ? V.hover : undefined,
    }}>
      <div style={{ color: V.tinta }}>
        {l.rotulo}
        {l.sinTarifa > 0 && (
          <span data-testid="obra-sin-tarifa" style={{ marginLeft: 8, fontSize: '11.5px', color: V.warn }}>
            {l.sinTarifa} sin tarifa
          </span>
        )}
      </div>
      <div style={{ textAlign: 'right', color: sinObra ? V.warn : V.tinta }}>{horas(l.horas)}</div>
      <div style={{ textAlign: 'right', color: V.apagado }}>{l.gente}</div>
      <div style={{ textAlign: 'right' }}>{miles(l.bolsillo)}</div>
      <div style={{ textAlign: 'right', fontWeight: 500, color: sinObra ? V.warn : V.tinta }}>{miles(l.costoReal)}</div>
      <div style={{ textAlign: 'right', color: V.tenue }}>
        {/* LA OBRA QUE NO EXISTE NO PUEDE TENER PRESUPUESTO: «—», no «sin cargar». */}
        {sinObra ? '—' : l.presupuesto == null
          ? <span data-testid="sin-cargar-mo">sin cargar</span>
          : <span style={{ color: V.apagado }}>{miles(l.presupuesto)}</span>}
      </div>
      <div style={{ textAlign: 'right', color: l.consumo == null ? V.tenue : colorDelConsumo(l.consumo) }}>
        {sinObra ? '—' : l.consumo == null
          ? <span data-testid="sin-base">sin base</span>
          : `${l.consumo.toLocaleString('es-AR', { maximumFractionDigits: 0 })} %`}
      </div>
    </div>
  )
}

function Cifra({ rotulo, valor, tono, testid }: { rotulo: string; valor: string; tono?: string; testid: string }) {
  return (
    <div data-testid={testid} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontSize: '11px', color: tono ?? V.tenue, fontFamily: MONO, letterSpacing: '.05em' }}>{rotulo}</span>
      <span style={{ fontSize: '16px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: tono ?? V.tinta }}>{valor}</span>
    </div>
  )
}

const titulo = { fontSize: '15px', fontWeight: 600, color: V.tinta, margin: '0 0 4px' }
const bajada = { fontSize: '12.5px', color: V.apagado, margin: '0 0 16px', maxWidth: 760 }
const cuadro = {
  maxWidth: 1240, background: '#FFFFFF', border: `1px solid ${V.lineaFuerte}`,
  borderRadius: 10, overflow: 'hidden' as const,
}
const cabecera = {
  padding: '20px 22px 17px', display: 'flex', alignItems: 'flex-end' as const,
  justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' as const,
  borderBottom: `1px solid ${V.linea}`,
}
// LAS SIETE COLUMNAS DEL MOCKUP. `minmax(0,…)` en vez de `minmax(220px,…)`: a 390 px un mínimo de
// 220 más las otras seis columnas desbordaba el cuadro y la fila de total quedaba fuera de pantalla.
const renglon = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 62px 60px 108px 110px 130px 110px',
  gap: 14,
}
const rotuloColumna = {
  fontFamily: MONO, fontSize: '9.5px', letterSpacing: '.04em', color: V.tenue,
  textTransform: 'uppercase' as const,
}
