import { Aviso } from '@/shared/components/ds'
import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import {
  alicuotasVigentes, costoDeHora, multiplicadorDeCosto, CONCEPTOS_COSTO, ROTULO_CONCEPTO,
  type Alicuota,
} from '../../../services/costoHora'
import { getAlicuotas } from '../../../services/costoLecturas'
import { getLiquidacionDeLaQuincena } from '../../../services/liquidacionQuincenaService'
import { totalesDeCuadro } from '../../../services/liquidacionQuincena'
import type { Quincena } from '../../../services/quincena'
import { FilaAlicuota } from './AlicuotaEditor'
import { ALTO_LIQ } from './tabla'

// PANTALLA 5 · EL COSTO REAL DE UNA HORA (handoff v2 §5, R9).
//
// Lo que la obra recibe hoy es el $/h de bolsillo, y eso subestima la mano de obra un 52 %. Esta
// pantalla hace visible el multiplicador y quién lo compone.
//
// ═══ SIN ALÍCUOTAS NO SE INVENTA UN 1,524 ═══
//
// El número del handoff es el EJEMPLO del dueño, no un default: sembrarlo acá convertiría una
// ilustración en un costo cargado a una obra real. Con la tabla vacía la pantalla dice «sin
// cargar» y qué lo destraba, y el impacto en la quincena no se publica.

const pesos = (n: number | null): string =>
  n == null ? '—' : `$${Math.round(n).toLocaleString('es-AR')}`

const mult = (n: number | null): string =>
  n == null ? '—' : n.toLocaleString('es-AR', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

export async function SolapaCostoHora({ quincena, hoy }: { quincena: Quincena; hoy: string }) {
  const supabase = await createClient()
  const [{ alicuotas, errores }, liq] = await Promise.all([
    getAlicuotas(supabase),
    getLiquidacionDeLaQuincena(supabase, quincena),
  ])

  // LA FECHA DE LA VERSIÓN ES EL ÚLTIMO DÍA DE LA QUINCENA, NO HOY. Mirar una quincena de marzo
  // tiene que mostrar la alícuota de marzo: es toda la razón por la que la tabla se versiona.
  const vigentes = alicuotasVigentes(alicuotas, quincena.hasta)
  const entero = multiplicadorDeCosto(vigentes, 1)
  const mitad = multiplicadorDeCosto(vigentes, 0.5)

  const bolsillo = liq.cuadros
    .map((c) => totalesDeCuadro(c.lineas).cobra)
    .reduce((s, n) => s + n, 0)

  const historial = (c: Alicuota['concepto']): Alicuota[] =>
    alicuotas.filter((a) => a.concepto === c)

  return (
    <section data-testid="solapa-costo-hora">
      {errores.map((e) => (
        <div key={e.que} style={{ paddingBottom: 10 }}>
          <Aviso tono="neg" titulo={`No pude leer ${e.que}`}>{e.error}</Aviso>
        </div>
      ))}

      <h3 style={titulo}>El costo real de una hora</h3>
      <p style={bajada}>
        El $/h que cobra la persona no es lo que la hora le cuesta a la obra. Cambiar una alícuota
        guarda una versión nueva con su fecha: la obra vieja conserva la suya.
      </p>

      <table style={tabla}>
        <thead>
          <tr>
            {['Concepto', 'Alícuota', 'Pesa sobre', 'Rige desde', 'Fuente', ''].map((c, i) => (
              <th key={c} style={{ ...th, textAlign: i === 0 || i === 4 ? 'left' : 'right' }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CONCEPTOS_COSTO.map((c) => (
            <FilaAlicuota key={c} concepto={c} vigente={vigentes[c]} historial={historial(c)} hoy={hoy} />
          ))}
          <tr data-testid="multiplicador" style={{ borderTop: `1px solid ${V.grafito}` }}>
            <td style={{ ...celda, textAlign: 'left', fontWeight: 600, color: V.tinta }}>Multiplicador</td>
            <td style={{ ...celda, fontWeight: 600, color: entero.valor == null ? V.warn : V.tinta }}>
              {entero.valor == null ? 'sin cargar' : `× ${mult(entero.valor)}`}
            </td>
            <td colSpan={4} style={{ ...celda, textAlign: 'left', color: V.apagado, fontSize: '11.5px' }}>
              {entero.valor == null
                ? `Faltan las ${entero.faltan.length} alícuotas. Cargalas y la obra empieza a recibir su costo, no sólo sus horas.`
                : entero.faltan.length > 0
                  ? `Suma lo cargado. Falta: ${entero.faltan.map((f) => ROTULO_CONCEPTO[f]).join(', ')}.`
                  : 'Todo lo que se paga por encima del bolsillo.'}
            </td>
          </tr>
        </tbody>
      </table>

      {/* EL MATIZ DE LA MITAD DECLARADA — §5. Con mitad recibo / mitad efectivo sólo lo blanco
          genera cargas, y el multiplicador efectivo baja. No es una opinión: sale de la columna
          `base` de cada fila cargada. */}
      <div style={{ display: 'flex', gap: 36, padding: '18px 8px 6px', flexWrap: 'wrap' }}>
        <Dato rotulo="Multiplicador si todo va por recibo" valor={entero.valor == null ? 'sin cargar' : `× ${mult(entero.valor)}`}
          testid="mult-declarado" />
        <Dato rotulo="Multiplicador con mitad recibo / mitad efectivo" valor={mitad.valor == null ? 'sin cargar' : `× ${mult(mitad.valor)}`}
          testid="mult-mitad"
          nota="sólo la mitad declarada genera cargas; los conceptos marcados «sobre el total» pesan igual" />
      </div>

      <h4 style={{ ...titulo, fontSize: '13px', marginTop: 22 }}>Impacto en esta quincena</h4>
      <table style={{ ...tabla, maxWidth: 620 }}>
        <tbody>
          <Renglon rotulo="Bolsillo de la quincena" valor={pesos(bolsillo || null)} testid="impacto-bolsillo" />
          <Renglon rotulo="Costo real a las obras" testid="impacto-costo"
            valor={pesos(costoDeHora(bolsillo || null, entero.valor))}
            nota={entero.valor == null ? 'sin alícuotas cargadas no se publica un costo' : undefined} />
          <Renglon rotulo="Costo real con mitad declarada" testid="impacto-costo-mitad"
            valor={pesos(costoDeHora(bolsillo || null, mitad.valor))} fuerte />
        </tbody>
      </table>
    </section>
  )
}

const titulo = { fontSize: '15px', fontWeight: 600, color: V.tinta, margin: '0 0 4px' }
const bajada = { fontSize: '12.5px', color: V.apagado, margin: '0 0 16px', maxWidth: 720 }
const tabla = { width: '100%', borderCollapse: 'collapse' as const, fontVariantNumeric: 'tabular-nums' as const }
const th = {
  fontSize: '11px', fontWeight: 600, letterSpacing: '.06em', color: V.tenue, textTransform: 'uppercase' as const,
  borderBottom: `1px solid ${V.lineaFuerte}`, padding: '0 8px 8px', height: 30, verticalAlign: 'bottom' as const,
  whiteSpace: 'nowrap' as const,
}
const celda = { padding: '0 8px', height: ALTO_LIQ.filaPersona, textAlign: 'right' as const, fontSize: '13px', whiteSpace: 'nowrap' as const }

function Dato({ rotulo, valor, nota, testid }: { rotulo: string; valor: string; nota?: string; testid: string }) {
  return (
    <div data-testid={testid}>
      <div style={{ fontSize: '11px', letterSpacing: '.06em', color: V.tenue, textTransform: 'uppercase' }}>{rotulo}</div>
      <div style={{ fontSize: '21px', color: V.tinta, fontVariantNumeric: 'tabular-nums', marginTop: 4 }}>{valor}</div>
      {nota && <div style={{ fontSize: '11.5px', color: V.tenue, marginTop: 2, maxWidth: 340 }}>{nota}</div>}
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
        {nota && <span style={{ marginLeft: 8, fontSize: '11.5px', color: V.warn }}>{nota}</span>}
      </td>
      <td style={{ ...celda, fontWeight: fuerte ? 600 : 400, color: V.tinta }}>{valor}</td>
    </tr>
  )
}
