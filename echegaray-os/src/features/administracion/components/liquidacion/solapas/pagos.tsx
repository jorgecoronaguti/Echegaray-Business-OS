import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import { quincenaDe, rotuloQuincena, type Quincena } from '../../../services/quincena'
import { tarjetaDeQuincena, totalesDeCuadro, type LineaLiquidada } from '../../../services/liquidacionQuincena'
import { getLiquidacionDeLaQuincena } from '../../../services/liquidacionQuincenaService'
import { pesos } from '../BloqueLiquidacion'

// 4 · PAGOS · LA CADENA DE LA QUINCENA.
//
// Las cuatro celdas que se ESCRIBEN (adelanto, ya transferido, por banco, efectivo redondeado) y
// las tres que se CALCULAN (cobra, en efectivo, total). El orden de las columnas es el de R5, que es
// el orden en que el dueño hace la resta a mano.
//
// ═══ POR QUÉ ESTA SOLAPA NO ES LA GRILLA DE HORAS CON MÁS COLUMNAS ═══
//
// Porque contesta otra pregunta. «Horas» pregunta cuánto trabajó cada uno; «Pagos» pregunta por qué
// canal sale cada peso y cuánto tiene que haber en el sobre. Los totales de abajo son de BANCO y
// EFECTIVO, no de horas.
//
// ═══ EL RECIBO SIN GIRO NO CUENTA COMO BANCO (R7) ═══
//
// Que el estudio haya liquidado un neto no dice que el banco lo haya movido. Hasta que el lote
// aparece en el extracto esa plata sigue por pagar y tiene que salir en efectivo. La fila lo marca
// y el total de BANCO no la incluye — contarla giraría de menos en el sobre de esa persona.

export async function SolapaPagos({ quincenaPedida, hoy }: { quincenaPedida?: string; hoy: string }) {
  const quincena = quincenaDe(quincenaPedida && /^\d{4}-\d{2}-\d{2}$/.test(quincenaPedida) ? quincenaPedida : hoy)
  const supabase = await createClient()
  const { cuadros, sinActividad } = await getLiquidacionDeLaQuincena(supabase, quincena)
  const totales = cuadros.map((c) => totalesDeCuadro(c.lineas))
  const tarjeta = tarjetaDeQuincena(totales)
  const lineas = cuadros.flatMap((c) => c.lineas)

  return (
    <div data-testid="solapa-pagos">
      <Encabezado quincena={quincena} tarjeta={tarjeta} />
      <Tabla lineas={lineas} />
      {sinActividad.length > 0 && (
        <p data-testid="pagos-sin-actividad" style={{ fontSize: '11.5px', color: V.apagado, margin: '10px 0 0' }}>
          {sinActividad.length} sin actividad esta quincena · no aparecen acá y no se dieron de baja.
        </p>
      )}
      <p style={{ fontSize: '11px', color: V.tenue, lineHeight: 1.6, margin: '12px 0 0' }}>
        Se escriben ADELANTO · YA TRANSFERIDO · POR BANCO · EFECT. RED. — el resto es la cadena.
        {' '}Un giro hecho antes de armar el lote va en YA TRANSFERIDO, no en ADELANTO.
      </p>
    </div>
  )
}

function Encabezado({ quincena, tarjeta }: {
  quincena: Quincena
  tarjeta: { porBanco: number; enEfectivo: number; total: number; cierra: boolean }
}) {
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'baseline',
      border: `1px solid ${V.linea}`, borderRadius: 10, padding: '14px 18px', marginBottom: 18,
      background: '#FFFFFF',
    }}>
      <span style={{ fontSize: '16px', color: V.tinta, marginRight: 'auto' }}>
        {rotuloQuincena(quincena)}
      </span>
      <Cifra rotulo="POR BANCO" valor={tarjeta.porBanco} testid="pagos-por-banco" />
      <Cifra rotulo="EN EFECTIVO" valor={tarjeta.enEfectivo} testid="pagos-en-efectivo" />
      <Cifra rotulo="TOTAL" valor={tarjeta.total} testid="pagos-total" fuerte />
    </div>
  )
}

const COLUMNAS = ['Persona', 'Horas', '$/h', 'Cobra', 'Adelanto', 'Ya transf.', 'Por banco', 'Efectivo', 'Total', 'Efect. red.']

function Tabla({ lineas }: { lineas: readonly LineaLiquidada[] }) {
  const grilla = '1.6fr repeat(9, minmax(72px, .75fr))'
  return (
    <div data-testid="pagos-tabla" style={{ border: `1px solid ${V.lineaFuerte}`, borderRadius: 10, background: '#FFFFFF' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: grilla, gap: 16, padding: '0 16px 9px',
        alignItems: 'end', minHeight: 34, borderBottom: `1px solid ${V.linea}`, paddingTop: 12,
      }}>
        {COLUMNAS.map((c, i) => (
          <span key={c} style={{
            fontSize: '10.5px', letterSpacing: '.06em', textTransform: 'uppercase',
            color: V.tenue, textAlign: i === 0 ? 'left' : 'right',
          }}>{c}</span>
        ))}
      </div>
      {lineas.map((l) => (
        <div key={l.personaId} style={{
          display: 'grid', gridTemplateColumns: grilla, gap: 16, padding: '0 16px',
          alignItems: 'center', minHeight: 52, borderBottom: `1px solid ${V.linea}`,
          fontSize: '13px', fontVariantNumeric: 'tabular-nums',
        }}>
          <span style={{ color: V.tinta }}>
            {l.nombre}
            {l.reciboSinGiro && (
              <span data-testid="pagos-recibo-sin-giro" style={{ display: 'block', fontSize: '10.5px', color: V.warn }}>
                recibo sin giro · no cuenta como banco
              </span>
            )}
          </span>
          <Celda valor={l.horas} />
          <Celda valor={l.valorHora} />
          <Celda valor={l.cobra} />
          <Escribible valor={l.adelanto} />
          <Escribible valor={l.yaTransferido} />
          <Escribible valor={l.porBanco} />
          <Celda valor={l.enEfectivo} />
          <Celda valor={l.total} fuerte />
          <Escribible valor={l.efectivoRedondeado} />
        </div>
      ))}
    </div>
  )
}

/** Una celda calculada. `null` se dibuja «—»: falta el dato, no es cero (R1). */
function Celda({ valor, fuerte = false }: { valor: number | null; fuerte?: boolean }) {
  return (
    <span style={{ textAlign: 'right', color: valor == null ? V.tenue : V.tinta, fontWeight: fuerte ? 600 : 400 }}>
      {valor == null ? '—' : pesos(valor)}
    </span>
  )
}

/**
 * Una celda que se escribe. Se dibuja con el marco del control aunque acá sea de sólo lectura: es
 * la diferencia que la pantalla tiene que enseñar entre «esto lo decidís vos» y «esto es una
 * cuenta». El `<input>` real lo monta la grilla editable.
 */
function Escribible({ valor }: { valor: number | null }) {
  return (
    <span style={{
      textAlign: 'right', border: `1px solid ${V.lineaFuerte}`, borderRadius: 6,
      padding: '3px 8px', minHeight: 26, color: valor == null || valor === 0 ? V.tenue : V.tinta,
    }}>
      {valor == null ? '—' : pesos(valor)}
    </span>
  )
}

function Cifra({ rotulo, valor, testid, fuerte = false }: {
  rotulo: string; valor: number; testid: string; fuerte?: boolean
}) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: '10.5px', letterSpacing: '.06em', color: V.tenue }}>{rotulo}</span>
      <span data-testid={testid} style={{
        fontSize: fuerte ? '21px' : '18px', fontWeight: fuerte ? 600 : 500,
        color: V.tinta, fontVariantNumeric: 'tabular-nums',
      }}>{pesos(valor)}</span>
    </span>
  )
}
