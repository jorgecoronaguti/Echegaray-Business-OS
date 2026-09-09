import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import { quincenaDe, rotuloQuincena, type Quincena } from '../../../services/quincena'
import { totalesDeCuadro } from '../../../services/liquidacionQuincena'
import { getLiquidacionDeLaQuincena } from '../../../services/liquidacionQuincenaService'
import { compararValorHora, estadoDeCierre, type LineaParaCerrar } from '../../../services/liquidacionCierre'
import { pesos } from '../BloqueLiquidacion'
import { BotonCerrar, FlujoReapertura } from './AccionesDeCierre'
import { ALTO_LIQ } from './tabla'

// 10 · CERRAR y 11 · CERRADA — la misma solapa, porque son el mismo objeto en dos estados.
//
// ═══ LO QUE QUEDA CONGELADO ═══
//
// R6: las horas de cada día, el valor hora usado, la categoría y el convenio con los que se liquidó,
// las cuatro celdas escritas y el costo cargado a cada obra. La lista se muestra ANTES de cerrar
// porque cerrar es lo único de este módulo que no se deshace sin dejar firma.
//
// ═══ EL BOTÓN DESHABILITADO DICE POR QUÉ ═══
//
// Un botón gris sin explicación manda a la persona a adivinar cuál de las 17 filas lo está trabando.
// Los pendientes salen con nombre propio de `estadoDeCierre`, que es núcleo puro y está probado.
//
// ═══ EL FALTANTE DECLARADO SE MUESTRA, NO SE ESCONDE ═══
//
// Las 10 quincenas de 2026 que entraron parciales tienen su `monto_excluido` escrito en la cabecera
// (migración 20260909T1800). Un total corto sin la marca de que lo es se lee igual que uno completo.

interface FaltanteDeclarado {
  monto: number
  cuantas: number
}

export async function SolapaCierre({ quincenaPedida, hoy, puedeCerrar }: {
  quincenaPedida?: string
  hoy: string
  puedeCerrar: boolean
}) {
  const quincena = quincenaDe(quincenaPedida && /^\d{4}-\d{2}-\d{2}$/.test(quincenaPedida) ? quincenaPedida : hoy)
  const supabase = await createClient()
  const [{ cuadros, estados }, faltante, sellado] = await Promise.all([
    getLiquidacionDeLaQuincena(supabase, quincena),
    leerFaltante(supabase, quincena),
    leerSellado(supabase, quincena),
  ])
  const lineas: LineaParaCerrar[] = cuadros.flatMap((c) => c.lineas)
  const estado = estadoDeCierre(lineas)
  const cerrada = Object.values(estados).some((e) => e.estado === 'cerrada')
  const cerradaEn = Object.values(estados).find((e) => e.cerradaEn)?.cerradaEn ?? null
  const totalHoras = cuadros.map((c) => totalesDeCuadro(c.lineas)).reduce((a, t) => a + t.horas, 0)

  return (
    <div data-testid="solapa-cierre">
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 12, marginBottom: 16,
      }}>
        <span style={{ fontSize: '16px', color: V.tinta }}>{rotuloQuincena(quincena)}</span>
        <span data-testid="cierre-estado" style={{
          fontSize: '11.5px', padding: '2px 8px', borderRadius: 6,
          border: `1px solid ${V.lineaFuerte}`, color: cerrada ? V.tinta : V.apagado,
          background: cerrada ? V.seleccion : 'transparent',
        }}>
          {cerrada ? `cerrada${cerradaEn ? ` el ${cerradaEn.slice(8, 10)}/${cerradaEn.slice(5, 7)}` : ''}` : 'abierta'}
        </span>
      </div>

      <Resumen estado={estado} horas={totalHoras} faltante={faltante} />

      {cerrada
        ? <Cerrada lineas={lineas} puedeCerrar={puedeCerrar} sellado={sellado} quincena={quincena} />
        : <Abierta estado={estado} puedeCerrar={puedeCerrar} quincena={quincena} />}
    </div>
  )
}

/** El faltante que la carga desde JORNALES dejó declarado. `null` = la quincena no se cargó de ahí. */
async function leerFaltante(
  supabase: Awaited<ReturnType<typeof createClient>>, q: Quincena,
): Promise<FaltanteDeclarado | null> {
  const { data } = await supabase.from('liquidacion_quincena')
    .select('monto_excluido, excluidas').eq('desde', q.desde).eq('hasta', q.hasta)
  const fila = (data ?? [])[0] as { monto_excluido: number | string | null; excluidas: unknown } | undefined
  const monto = Number(fila?.monto_excluido ?? Number.NaN)
  if (!Number.isFinite(monto) || monto <= 0) return null
  return { monto, cuantas: Array.isArray(fila?.excluidas) ? fila.excluidas.length : 0 }
}

/**
 * EL $/h QUE QUEDÓ SELLADO, por persona. Es el ÚNICO contra el que la pantalla 11 puede comparar:
 * `l.valorHora` es la tarifa VIGENTE, y compararla contra sí misma dice «igual» siempre.
 */
async function leerSellado(
  supabase: Awaited<ReturnType<typeof createClient>>, q: Quincena,
): Promise<Map<string, number | null>> {
  const { data } = await supabase.from('liquidacion_quincena')
    .select('id, liquidacion_linea(persona_id, valor_hora, sellado_en)')
    .eq('desde', q.desde).eq('hasta', q.hasta)
  type Fila = { persona_id: string; valor_hora: number | string | null; sellado_en: string | null }
  const cabs = (data ?? []) as { liquidacion_linea: Fila[] | null }[]
  const porPersona = new Map<string, number | null>()
  for (const c of cabs) {
    for (const l of c.liquidacion_linea ?? []) {
      // SIN `sellado_en` NO HAY SELLO: la fila existe desde antes (el redondeo la crea) y su
      // `valor_hora` sería el de un cálculo, no el de un cierre.
      if (l.sellado_en == null) continue
      porPersona.set(l.persona_id, l.valor_hora == null ? null : Number(l.valor_hora))
    }
  }
  return porPersona
}

function Resumen({ estado, horas, faltante }: {
  estado: ReturnType<typeof estadoDeCierre>
  horas: number
  faltante: FaltanteDeclarado | null
}) {
  const filas: [string, string][] = [
    ['Personas que quedan liquidadas', `${estado.liquidadas} de ${estado.personas}`],
    ['Horas de la quincena', horas.toLocaleString('es-AR')],
    ['Total a pagar sellado', pesos(estado.totalSellado)],
  ]
  return (
    <div data-testid="cierre-resumen" style={{
      border: `1px solid ${V.lineaFuerte}`, borderRadius: 10, background: '#FFFFFF',
      padding: '4px 16px', marginBottom: 18,
    }}>
      {filas.map(([k, v]) => (
        <div key={k} style={{
          display: 'flex', justifyContent: 'space-between', gap: 16, minHeight: ALTO_LIQ.renglonAlto,
          alignItems: 'center', borderBottom: `1px solid ${V.lineaFila}`, fontSize: '13px',
        }}>
          <span style={{ color: V.apagado }}>{k}</span>
          <span style={{ color: V.tinta, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
        </div>
      ))}
      {/* NO ES UN CERO MUDO: la fuente pagó esta plata y la base NO tiene la línea. */}
      {faltante && (
        <div data-testid="cierre-sin-cargar" style={{
          display: 'flex', justifyContent: 'space-between', gap: 16, minHeight: ALTO_LIQ.renglonAlto,
          alignItems: 'center', fontSize: '13px',
        }}>
          <span style={{ color: V.warn }}>
            Sin cargar · {faltante.cuantas} persona{faltante.cuantas === 1 ? '' : 's'} inactiva{faltante.cuantas === 1 ? '' : 's'}
          </span>
          <span style={{ color: V.warn, fontVariantNumeric: 'tabular-nums' }}>{pesos(faltante.monto)}</span>
        </div>
      )}
    </div>
  )
}

const CONGELA = [
  'las horas de cada día', 'el valor hora usado', 'la categoría y el convenio',
  'las cuatro celdas escritas', 'el costo cargado a cada obra',
]

function Abierta({ estado, puedeCerrar, quincena }: {
  estado: ReturnType<typeof estadoDeCierre>; puedeCerrar: boolean; quincena: Quincena
}) {
  const bloqueado = !estado.puedeCerrar || !puedeCerrar
  return (
    <div>
      <p style={{ fontSize: '12.5px', color: V.apagado, margin: '0 0 12px' }}>
        Cerrar congela {CONGELA.join(' · ')}. Reabrir pide motivo escrito y queda con autor y fecha.
      </p>
      {/* ═══ EL PENDIENTE ES UN RENGLÓN, NO UNA CAJA DE COLOR ═══
          El mockup (pantalla 10, línea 611) dibuja lo que traba el cierre como una fila más de la
          lista, con el TEXTO en ámbar y nada de fondo. `Aviso tono="warn"` pinta una superficie
          entera de `--os-warn-soft` (#FDF0E4), que además es un color que no está en la lista del
          README §2 — y §2 prohíbe la superficie grande coloreada sin excepción. Con fondo, tres
          pendientes convierten la pantalla de cierre en un semáforo y el botón deja de leerse. */}
      {estado.pendientes.length > 0 && (
        <div data-testid="cierre-pendientes" style={{ marginBottom: 16 }}>
          {estado.pendientes.map((p) => (
            <div key={p.clave} data-testid={`cierre-pendiente-${p.clave}`} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
              minHeight: ALTO_LIQ.renglon, borderBottom: `1px solid ${V.linea}`, fontSize: '12.5px',
              color: V.warn,
            }}>
              <span>{p.texto}</span>
            </div>
          ))}
        </div>
      )}
      <BotonCerrar
        quincena={{ desde: quincena.desde, hasta: quincena.hasta }}
        bloqueado={bloqueado}
        porque={!puedeCerrar
          ? 'Cerrar una quincena es de Dirección y Administración.'
          : estado.pendientes.length
            ? `${estado.pendientes.length} pendiente(s) arriba: sellar una línea incompleta la vuelve indistinguible de una correcta.`
            : 'No hay ninguna línea que cerrar.'}
      />
    </div>
  )
}

/** 11 · CERRADA. Sólo lectura, con «$/h hoy» comparado contra el legajo. */
function Cerrada({ lineas, puedeCerrar, sellado, quincena }: {
  lineas: readonly LineaParaCerrar[]
  puedeCerrar: boolean
  sellado: Map<string, number | null>
  quincena: Quincena
}) {
  const grilla = '1.6fr repeat(5, minmax(80px, .8fr))'
  return (
    <div>
      <div data-testid="cierre-cerrada" style={{
        border: `1px solid ${V.lineaFuerte}`, borderRadius: 10, background: '#FFFFFF',
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: grilla, gap: 16, padding: '12px 16px 9px',
          borderBottom: `1px solid ${V.linea}`, alignItems: 'end',
        }}>
          {['Persona', '$/h sellado', 'Cobró', 'Por banco', 'Efectivo', '$/h hoy'].map((c, i) => (
            <span key={c} style={{
              fontSize: '10.5px', letterSpacing: '.06em', textTransform: 'uppercase',
              color: V.tenue, textAlign: i === 0 ? 'left' : 'right',
            }}>{c}</span>
          ))}
        </div>
        {lineas.map((l) => {
          // EL SELLADO SALE DE LA BASE Y EL VIGENTE DEL LEGAJO. Comparar `l.valorHora` contra sí
          // mismo decía «igual» siempre, que es la peor de las dos respuestas: afirma que no pasó
          // nada. `undefined` = esa línea no llegó a sellarse.
          const valorSellado = sellado.get(l.personaId) ?? null
          const comparacion = compararValorHora(valorSellado, l.valorHora)
          return (
            <div key={l.personaId} style={{
              display: 'grid', gridTemplateColumns: grilla, gap: 16, padding: '0 16px',
              alignItems: 'center', minHeight: ALTO_LIQ.fila, borderBottom: `1px solid ${V.lineaFila}`,
              fontSize: '13px', fontVariantNumeric: 'tabular-nums',
            }}>
              <span style={{ color: V.tinta }}>{l.nombre}</span>
              <span style={{ textAlign: 'right' }}>{valorSellado == null ? '—' : pesos(valorSellado)}</span>
              <span style={{ textAlign: 'right' }}>{l.cobra == null ? '—' : pesos(l.cobra)}</span>
              <span style={{ textAlign: 'right' }}>{pesos(l.porBanco)}</span>
              <span style={{ textAlign: 'right' }}>{l.enEfectivo == null ? '—' : pesos(l.enEfectivo)}</span>
              <span data-testid={`cierre-hoy-${l.personaId}`}
                style={{ textAlign: 'right', color: comparacion === 'cambió' ? V.warn : V.apagado }}>
                {l.valorHora == null ? `— · ${comparacion}` : `${pesos(l.valorHora)} · ${comparacion}`}
              </span>
            </div>
          )
        })}
      </div>
      <p style={{ fontSize: '11.5px', color: V.apagado, margin: '12px 0 0' }}>
        «$/h hoy» compara contra el legajo actual: es informativa y no cambia lo pagado.
        {puedeCerrar && ' Reabrir pide motivo escrito, recalcula con la retribución vigente y avisa la diferencia antes de guardar.'}
      </p>
      {puedeCerrar && <FlujoReapertura quincena={{ desde: quincena.desde, hasta: quincena.hasta }} />}
    </div>
  )
}
