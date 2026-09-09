import { Aviso, Vacio } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import { alicuotasVigentes, lineasDeObra, multiplicadorDeCosto } from '../../../services/costoHora'
import { getAlicuotas, getHorasPorObra, getValorHoraVigente } from '../../../services/costoLecturas'
import { rotuloQuincena, type Quincena } from '../../../services/quincena'

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

const pesos = (n: number | null): string =>
  n == null ? '—' : `$${Math.round(n).toLocaleString('es-AR')}`

const horas = (n: number): string => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })

export async function SolapaCostoObra({ quincena }: { quincena: Quincena; hoy?: string }) {
  const supabase = await createClient()
  const { alicuotas, errores } = await getAlicuotas(supabase)
  const { porPersona, error: errTarifa } = await getValorHoraVigente(supabase, quincena.hasta)
  const { obras, presupuesto, errores: errHoras } = await getHorasPorObra(supabase, quincena, porPersona)

  const m = multiplicadorDeCosto(alicuotasVigentes(alicuotas, quincena.hasta), 1)
  const lineas = lineasDeObra(obras, presupuesto, m.valor)
  const fallas = [...errores, ...errHoras, ...(errTarifa ? [errTarifa] : [])]

  const totalHoras = lineas.reduce((s, l) => s + l.horas, 0)
  const conCosto = lineas.filter((l) => l.costoReal != null)
  const totalCosto = conCosto.length === 0 ? null : conCosto.reduce((s, l) => s + (l.costoReal as number), 0)

  return (
    <section data-testid="solapa-costo-obra">
      {fallas.map((e) => (
        <div key={e.que} style={{ paddingBottom: 10 }}>
          <Aviso tono="neg" titulo={`No pude leer ${e.que}`}>{e.error}</Aviso>
        </div>
      ))}

      <h3 style={titulo}>La quincena cargada a la obra</h3>
      <p style={bajada}>
        {rotuloQuincena(quincena)} · horas de <code style={code}>registros_hh</code> por el $/h vigente
        {m.valor == null
          ? ' — falta el multiplicador: cargá las alícuotas en «Costo a la obra» para que estas horas se conviertan en costo.'
          : ` por el multiplicador × ${m.valor.toLocaleString('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}.`}
      </p>

      {lineas.length === 0 ? (
        <Vacio>No hay horas cargadas en esta quincena. Se cargan en la solapa Asistencia.</Vacio>
      ) : (
        <table style={tabla}>
          <thead>
            <tr>
              {['Obra', 'Horas', 'Bolsillo', 'Costo real', 'Mano de obra presupuestada', 'Consumo'].map((c, i) => (
                <th key={c} style={{ ...th, textAlign: i === 0 ? 'left' : 'right' }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.obraId ?? 'sin-obra'} data-testid="fila-obra" style={{ borderBottom: `1px solid ${V.lineaFila}` }}>
                <td style={{ ...celda, textAlign: 'left', color: l.obraId == null ? V.warn : V.tinta }}>
                  {l.rotulo}
                  {l.sinTarifa > 0 && (
                    <span data-testid="obra-sin-tarifa" style={{ marginLeft: 8, fontSize: '11.5px', color: V.warn }}>
                      {l.sinTarifa} sin tarifa
                    </span>
                  )}
                </td>
                <td style={celda}>{horas(l.horas)}</td>
                <td style={celda}>{pesos(l.bolsillo)}</td>
                <td style={{ ...celda, fontWeight: 600 }}>{pesos(l.costoReal)}</td>
                <td style={celda}>
                  {l.presupuesto == null
                    ? <span data-testid="sin-base" style={{ color: V.tenue }}>sin base</span>
                    : pesos(l.presupuesto)}
                </td>
                <td style={{ ...celda, color: l.consumo == null ? V.tenue : l.consumo > 100 ? V.neg : V.tinta }}>
                  {l.consumo == null
                    ? 'sin base'
                    : `${l.consumo.toLocaleString('es-AR', { maximumFractionDigits: 1 })} %`}
                </td>
              </tr>
            ))}
            <tr data-testid="total-obras" style={{ borderTop: `1px solid ${V.grafito}` }}>
              <td style={{ ...celda, textAlign: 'left', fontWeight: 600 }}>⇒ {lineas.length} obra(s)</td>
              <td style={{ ...celda, fontWeight: 600 }}>{horas(totalHoras)}</td>
              <td style={celda} />
              <td style={{ ...celda, fontWeight: 600 }}>{pesos(totalCosto)}</td>
              <td colSpan={2} style={{ ...celda, textAlign: 'left', fontSize: '11.5px', color: V.apagado }}>
                {/* NO SE SUMA UN TOTAL DE PRESUPUESTO: sumar el de las obras que sí tienen base
                    daría un consumo global contra un denominador incompleto. */}
                {lineas.length - conCosto.length > 0
                  ? `${lineas.length - conCosto.length} obra(s) sin costo publicable`
                  : ''}
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  )
}

const titulo = { fontSize: '15px', fontWeight: 600, color: V.tinta, margin: '0 0 4px' }
const bajada = { fontSize: '12.5px', color: V.apagado, margin: '0 0 16px', maxWidth: 760 }
const code = { fontFamily: 'var(--font-mono, monospace)', fontSize: '11.5px', color: V.apagado }
const tabla = { width: '100%', borderCollapse: 'collapse' as const, fontVariantNumeric: 'tabular-nums' as const }
const th = {
  fontSize: '11px', fontWeight: 600, letterSpacing: '.06em', color: V.tenue, textTransform: 'uppercase' as const,
  borderBottom: `1px solid ${V.lineaFuerte}`, padding: '0 8px 8px', height: 30, verticalAlign: 'bottom' as const,
  whiteSpace: 'nowrap' as const,
}
const celda = { padding: '0 8px', height: 52, textAlign: 'right' as const, fontSize: '13px', whiteSpace: 'nowrap' as const }
