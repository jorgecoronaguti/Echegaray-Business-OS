import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import { quincenaDe, rotuloQuincena, type Quincena } from '../../../services/quincena'
import { totalesDeCuadro } from '../../../services/liquidacionQuincena'
import { getLiquidacionDeLaQuincena } from '../../../services/liquidacionQuincenaService'
import {
  avisoDeReapertura, estadoDeCierre, filasDeQuincenaCerrada,
  type AvisoDeReapertura, type FilaDeQuincenaCerrada, type LineaParaCerrar, type SelloDeLinea,
} from '../../../services/liquidacionCierre'
import { getValorHoraVigente } from '../../../services/costoLecturas'
import { ReabrirQuincena, type VentanaDeReapertura } from './ReabrirQuincena'
import { BotonCerrar } from './AccionesDeCierre'
import { pesos } from '../BloqueLiquidacion'
import { ALTO_LIQ } from './tabla'
import { agruparPorRolOrganizacional } from '../../../services/vocabularioPersona'
import { RotuloDeGrupo } from '../../RotuloDeGrupo'

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
  const [{ cuadros, estados }, faltante, sellado, { porPersona: vigenteHoy }] = await Promise.all([
    getLiquidacionDeLaQuincena(supabase, quincena),
    leerFaltante(supabase, quincena),
    leerSellado(supabase, quincena),
    // LA TARIFA DE HOY, NO LA DE LA QUINCENA. La columna «$/h hoy» compara contra el legajo ACTUAL:
    // pedirla al último día de la quincena la haría comparar el sello contra sí mismo.
    getValorHoraVigente(supabase, hoy),
  ])
  const lineas: LineaParaCerrar[] = cuadros.flatMap((c) => c.lineas)
  const estado = estadoDeCierre(lineas)
  const cerrada = Object.values(estados).some((e) => e.estado === 'cerrada')
  const cerradaEn = Object.values(estados).find((e) => e.cerradaEn)?.cerradaEn ?? null
  const totalHoras = cuadros.map((c) => totalesDeCuadro(c.lineas)).reduce((a, t) => a + t.horas, 0)

  // LAS FILAS DE LA PANTALLA 11 SON LAS SELLADAS, NO LAS RECALCULADAS. Lo que se pagó vive en
  // `liquidacion_linea`; recalcularlo al dibujar haría que cambiar una tarifa hoy reescribiera la
  // quincena de agosto, que es exactamente lo que cerrar existe para impedir.
  // QUIÉN ES JEFE VIENE CON LA LÍNEA, no se vuelve a leer: es el mismo `esJefeDeObra(puesto)` que
  // ya trajo `getLiquidacionDeLaQuincena`. La foto de la quincena cerrada se dibuja con los mismos
  // dos grupos y en el mismo orden que Plantel, Asistencia y Horas (dueño, 10/09/2026).
  const jefes = new Set(lineas.filter((l) => l.esJefe).map((l) => l.personaId))
  // El orden ya llega del servicio (Oficina/jefes primero, alfabético en español): esto mapea 1:1.
  const filasCerradas = filasDeQuincenaCerrada(lineas, sellado, vigenteHoy)
  const aviso = avisoDeReapertura(
    filasCerradas.map((f) => ({
      personaId: f.personaId, nombre: f.nombre, horas: f.horas,
      valorHoraSellado: f.valorHoraSellado, cobraSellado: f.cobra,
    })),
    (id) => vigenteHoy.get(id) ?? null,
  )
  const ventanas: VentanaDeReapertura[] = Object.entries(estados)
    .filter(([, e]) => e.estado === 'cerrada')
    .map(([grupo]) => ({ desde: quincena.desde, hasta: quincena.hasta, grupo }))

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
        ? <Cerrada filas={filasCerradas} esJefe={jefes} cerradaEn={cerradaEn} aviso={aviso} ventanas={ventanas} puedeCerrar={puedeCerrar} />
        : <Abierta estado={estado} puedeCerrar={puedeCerrar} quincena={quincena} />}
    </div>
  )
}

const num = (v: unknown): number | null => {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * LO QUE QUEDÓ SELLADO EN `liquidacion_linea`.
 *
 * Sin esta lectura la pantalla 11 comparaba `l.valorHora` contra `l.valorHora` y decía «igual»
 * siempre: un control que no puede dar rojo. Y «igual» es la peor de las dos respuestas, porque
 * afirma que la retribución no se movió cuando nadie la miró.
 */
async function leerSellado(
  supabase: Awaited<ReturnType<typeof createClient>>, q: Quincena,
): Promise<Map<string, SelloDeLinea>> {
  const { data } = await supabase.from('liquidacion_quincena')
    .select('liquidacion_linea(persona_id, horas, valor_hora, cobra, por_banco, en_efectivo, total)')
    .eq('desde', q.desde).eq('hasta', q.hasta).eq('estado', 'cerrada')
  const salida = new Map<string, SelloDeLinea>()
  for (const cab of (data ?? []) as { liquidacion_linea: Record<string, unknown>[] | null }[]) {
    for (const l of cab.liquidacion_linea ?? []) {
      salida.set(String(l.persona_id), {
        horas: num(l.horas),
        valorHora: num(l.valor_hora),
        cobra: num(l.cobra),
        porBanco: num(l.por_banco),
        enEfectivo: num(l.en_efectivo),
        total: num(l.total),
      })
    }
  }
  return salida
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
      {/* EL BOTÓN ESCRIBE. `disabled` es el cartel; la cerradura la vuelve a poner
          `cerrarQuincenaAction` (rol, pendientes releídos y el orden sellar→cerrar), porque una
          server action se invoca con lo que viaja en el HTML sin abrir jamás la pantalla. */}
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

/**
 * 11 · CERRADA. Sólo lectura, con «$/h hoy» comparado contra el legajo ACTUAL.
 *
 * Las ocho columnas del mockup (liqhs v2:638): Persona · Horas · $/h sellado · Cobró · Por banco ·
 * Efectivo · Total · $/h hoy. La última es informativa y no cambia lo pagado.
 */
function Cerrada({ filas, esJefe, cerradaEn, aviso, ventanas, puedeCerrar }: {
  filas: readonly FilaDeQuincenaCerrada[]
  /** `personaId` de los jefes de obra, para los mismos dos grupos que el resto del módulo. */
  esJefe: ReadonlySet<string>
  cerradaEn: string | null
  aviso: AvisoDeReapertura
  ventanas: readonly VentanaDeReapertura[]
  puedeCerrar: boolean
}) {
  const grilla = 'minmax(0, 1fr) 50px 80px 100px 92px 96px 100px 118px'
  const totales = filas.reduce((a, f) => ({
    horas: a.horas + (f.horas ?? 0),
    cobra: a.cobra + (f.cobra ?? 0),
    porBanco: a.porBanco + (f.porBanco ?? 0),
    enEfectivo: a.enEfectivo + (f.enEfectivo ?? 0),
    total: a.total + (f.total ?? 0),
  }), { horas: 0, cobra: 0, porBanco: 0, enEfectivo: 0, total: 0 })

  return (
    <div>
      <div data-testid="cierre-cerrada" style={{
        maxWidth: 1240, border: `1px solid ${V.lineaFuerte}`, borderRadius: 10, background: '#FFFFFF',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '20px 22px 17px', display: 'flex', alignItems: 'center', gap: 16,
          flexWrap: 'wrap', borderBottom: `1px solid ${V.linea}`,
        }}>
          <div style={{ fontSize: '14.5px', fontWeight: 600 }}>Lo pagado no se mueve cuando cambia la retribución</div>
          {cerradaEn && (
            <div style={{ fontSize: '12px', color: V.apagado }}>
              cerrada el {cerradaEn.slice(8, 10)}/{cerradaEn.slice(5, 7)}
            </div>
          )}
          {/* REABRIR ES DE QUIEN LIQUIDA. Sin el permiso ni siquiera se dibuja el botón: ofrecer una
              acción que la acción va a rechazar es prometer algo que no se puede cumplir. */}
          {puedeCerrar && ventanas.length > 0 && (
            <ReabrirQuincena
              ventanas={ventanas} cambian={aviso.cambian} total={aviso.total} sinCambios={aviso.sinCambios}
            />
          )}
        </div>

        <div style={{ padding: '18px 22px 0', display: 'flex', flexDirection: 'column', fontSize: '12.5px', fontVariantNumeric: 'tabular-nums' }}>
          <div data-testid="encabezado-cerrada" style={{
            display: 'grid', gridTemplateColumns: grilla, gap: 14, height: ALTO_LIQ.renglonBajo, alignItems: 'end',
            paddingBottom: 9, borderBottom: `1px solid ${V.linea}`,
            fontFamily: "'IBM Plex Mono', monospace", fontSize: '9.5px', letterSpacing: '.04em',
            color: V.tenue, textTransform: 'uppercase',
          }}>
            {['Persona', 'Horas', '$/h sellado', 'Cobró', 'Por banco', 'Efectivo', 'Total', '$/h hoy'].map((c, i) => (
              <div key={c} style={{ textAlign: i === 0 ? 'left' : 'right' }}>{c}</div>
            ))}
          </div>

          {agruparPorRolOrganizacional(filas, (f) => esJefe.has(f.personaId)).map((g, iG, gs) => (
            <div key={g.clave} data-testid={`grupo-cerrada-${g.clave}`}>
              {/* CON UN SOLO GRUPO NO HAY RÓTULO, igual que en Plantel y en la grilla de Horas: un
                  rótulo solitario encima de la lista entera no separa nada. */}
              {gs.length > 1 && <RotuloDeGrupo texto={g.rotulo} primero={iG === 0} />}
              {g.integrantes.map((f) => {
            const comparacion = f.comparacion
            return (
              <div key={f.personaId} data-testid="fila-cerrada" style={{
                display: 'grid', gridTemplateColumns: grilla, gap: 14, minHeight: ALTO_LIQ.fila,
                alignItems: 'center', borderBottom: `1px solid ${V.linea}`,
              }}>
                <span style={{ color: V.tinta }}>{f.nombre}</span>
                <span style={derecha}>{f.horas == null ? '—' : f.horas.toLocaleString('es-AR')}</span>
                <span style={{ ...derecha, fontWeight: 500 }}>{pesos(f.valorHoraSellado)}</span>
                <span style={derecha}>{pesos(f.cobra)}</span>
                <span style={derecha}>{pesos(f.porBanco)}</span>
                <span style={derecha}>{pesos(f.enEfectivo)}</span>
                <span style={derecha}>{pesos(f.total)}</span>
                <span data-testid={`hoy-${f.personaId}`} style={{
                  ...derecha, fontSize: '11.5px',
                  color: comparacion === 'cambió' ? V.warn : V.apagado,
                }}>
                  {/* «SIN DATO» NO ES «IGUAL». Si hoy la persona no tiene tarifa vigente, decir
                      «igual» afirmaría que la retribución se mantuvo: lo que pasó es que desapareció. */}
                  {f.valorHoraHoy == null
                    ? `— · ${comparacion}`
                    : `${pesos(f.valorHoraHoy)} · ${comparacion}`}
                </span>
              </div>
            )
              })}
            </div>
          ))}

          <div data-testid="total-cerrada" style={{
            display: 'grid', gridTemplateColumns: grilla, gap: 14, height: ALTO_LIQ.filaTotalAlta,
            alignItems: 'center', borderTop: `1px solid ${V.grafito}`, fontWeight: 600,
          }}>
            <span>{filas.length} persona{filas.length === 1 ? '' : 's'}</span>
            <span style={derecha}>{totales.horas.toLocaleString('es-AR')}</span>
            <span />
            <span style={derecha}>{pesos(totales.cobra)}</span>
            <span style={derecha}>{pesos(totales.porBanco)}</span>
            <span style={derecha}>{pesos(totales.enEfectivo)}</span>
            <span style={derecha}>{pesos(totales.total)}</span>
            <span />
          </div>
        </div>
        <div style={{ height: 20 }} />
      </div>
      <p style={{ fontSize: '11.5px', color: V.apagado, margin: '12px 0 0' }}>
        «$/h hoy» compara el valor sellado contra la tarifa vigente del legajo: es informativa y no
        cambia lo pagado.
      </p>
    </div>
  )
}

const derecha = { textAlign: 'right' as const }
