// PANTALLA 1 DEL HANDOFF v2: «Horas · la quincena del plantel».
//
// 13 columnas de día × el plantel, con las horas esperadas por la JORNADA REAL (9 h de lunes a
// jueves, 8 los viernes) y no por un promedio. Las medidas salen del mockup
// `design/Liquidación de horas v2.dc.html`, que manda sobre el texto del README: fila 52–58 px,
// encabezado de columna 36 px alineado abajo, control 26 px, botón 30 px, filtros a la DERECHA.
//
// ═══ ES PRESENTACIONAL A PROPÓSITO ═══
//
// No lee la base y no escribe: recibe filas y resumen ya calculados por `grillaHorasQuincena.ts`,
// que es donde vive la regla y donde está probada. Una grilla que además consultara sería la
// segunda definición de «cuántas horas esperaba esta quincena».
//
// ═══ EL BOTÓN GRIS DICE POR QUÉ ═══
//
// Mientras haya una ausencia sin motivo, alguien sin retribución cargada o un día vencido sin
// cargar, cerrar está deshabilitado y debajo se publica la lista de lo que lo traba. Un botón
// apagado sin explicación obliga a adivinar, y lo que se adivina se cierra igual.

import Link from 'next/link'
import { V } from '@/shared/components/v2/patron'
import type {
  CeldaDeGrilla, EstadoDeFila, FilaDeGrilla, ResumenDeGrilla,
} from '../../services/grillaHorasQuincena'
import { ALTO_LIQ } from './solapas/tabla'

const COLUMNAS = 'minmax(230px,1fr) repeat(13,30px) 50px 56px 58px'

const DIAS_CORTOS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'] as const

/** `L7`, `V11`: la inicial del día y el número, como en el mockup. */
function rotuloDia(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  return `${DIAS_CORTOS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]}${d}`
}

const numero = (n: number): string => n.toLocaleString('es-AR', { maximumFractionDigits: 1 })

const ESTADOS: Record<EstadoDeFila, { texto: string; color: string }> = {
  'al-dia': { texto: 'al día', color: '#067647' },
  motivo: { texto: 'motivo', color: V.neg },
  tarifa: { texto: 'tarifa', color: V.warn },
  'sin-cargar': { texto: 'sin cargar', color: V.warn },
  licencia: { texto: 'lic.', color: V.apagado },
}

const filaGrid = (alto: number): React.CSSProperties => ({
  display: 'grid', gridTemplateColumns: COLUMNAS, gap: 6, minHeight: alto,
  alignItems: 'center', borderBottom: `1px solid ${V.linea}`,
  fontSize: '12.5px', fontVariantNumeric: 'tabular-nums',
})

/** La celda de un día. `·` gris es «nadie cargó»; NO es una falta (R3 del handoff). */
function Celda({ celda }: { celda: CeldaDeGrilla }) {
  if (celda.marca === 'sin-cargar') {
    return <div style={{ textAlign: 'center', color: V.lineaFuerte }}>·</div>
  }
  if (celda.marca === 'ausencia') {
    return <div style={{ textAlign: 'center', color: V.neg, fontWeight: 500 }}>A</div>
  }
  if (celda.marca === 'licencia') {
    return <div style={{ textAlign: 'center', color: '#175CD3' }}>L</div>
  }
  return <div style={{ textAlign: 'center' }}>{numero(celda.horas ?? 0)}</div>
}

function Fila({ fila, abrir, abierta }: {
  fila: FilaDeGrilla
  /** Abrir la persona NO NAVEGA (handoff v2 §4): el panel se despliega al costado. */
  abrir?: (personaId: string) => void
  abierta?: boolean
}) {
  const estado = ESTADOS[fila.estado]
  return (
    <div
      style={{
        ...filaGrid(58),
        cursor: abrir ? 'pointer' : undefined,
        background: abierta ? '#FAFAF8' : undefined,
        // LA BARRA AMARILLA DE 3 px MARCA LA FILA ABIERTA. Es la única marca de marca del cuadro.
        // El mockup (línea 176) la mete DENTRO del cuadro: 12 px de padding compensados con 12 px
        // de margen negativo, para que la barra quede pegada al filo y el nombre no se corra.
        boxShadow: abierta ? `inset 3px 0 0 ${V.marca}` : undefined,
        paddingLeft: abierta ? 12 : undefined,
        marginLeft: abierta ? -12 : undefined,
        borderRadius: abierta ? '0 6px 6px 0' : undefined,
        fontWeight: abierta ? 500 : undefined,
      }}
      data-testid={`fila-${fila.personaId}`}
      onClick={abrir ? () => abrir(fila.personaId) : undefined}
    >
      <div>{fila.nombre}</div>
      {fila.celdas.map((c) => <Celda key={c.fecha} celda={c} />)}
      <div style={{ textAlign: 'right', fontWeight: 600 }}>{numero(fila.cargadas)}</div>
      <div style={{ textAlign: 'right', color: V.apagado }}>{numero(fila.esperadas)}</div>
      <div style={{ textAlign: 'right', fontSize: '11px', color: estado.color }}>
        {/* «18 lic.» — el mockup publica las HORAS de licencia delante del rótulo: «lic.» sola no
            dice cuánto no se va a pagar. */}
        {fila.estado === 'licencia' ? `${numero(fila.horasDeLicencia)} ${estado.texto}` : estado.texto}
      </div>
    </div>
  )
}

export interface FiltroDeGrilla {
  rotulo: string
  /** `href` convierte la opción en un recorte navegable; sin él es una etiqueta y no promete nada. */
  opciones: { texto: string; detalle: string; activa?: boolean; alerta?: boolean; href?: string }[]
}

function Filtro({ filtro }: { filtro: FiltroDeGrilla }) {
  return (
    <div style={{
      padding: '15px 15px 13px', display: 'flex', flexDirection: 'column', gap: 8,
      borderBottom: `1px solid ${V.linea}`,
    }}>
      <div style={{
        fontFamily: 'var(--font-mono, "IBM Plex Mono", monospace)', fontSize: '10px',
        letterSpacing: '.06em', color: V.tenue, textTransform: 'uppercase',
      }}>{filtro.rotulo}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, fontSize: '12.5px' }}>
        {filtro.opciones.map((o) => (
          <FilaFiltro key={o.texto} href={o.href} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            height: 29, padding: '0 9px', margin: '0 -9px', borderRadius: 6,
            background: o.activa ? '#FFFFFF' : 'transparent',
            boxShadow: o.activa ? `inset 3px 0 0 ${V.marca}` : undefined,
            fontWeight: o.activa ? 500 : 400,
            color: o.activa ? V.tinta : V.apagado,
          }}>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.texto}</span>
            <span style={{
              fontSize: '11px', fontVariantNumeric: 'tabular-nums',
              color: o.alerta ? V.warn : V.tenue, fontWeight: o.alerta ? 500 : 400,
            }}>{o.detalle}</span>
          </FilaFiltro>
        ))}
      </div>
    </div>
  )
}

/** La misma caja para la opción navegable y la que no lo es: dos formas darían dos alturas. */
function FilaFiltro({ href, style, children }: {
  href?: string
  style: React.CSSProperties
  children: React.ReactNode
}) {
  if (!href) return <div style={style}>{children}</div>
  return (
    <Link href={href} prefetch={false} style={{ ...style, textDecoration: 'none', color: style.color }}>
      {children}
    </Link>
  )
}

export function GrillaHorasQuincena({
  titulo, jornadaTexto, habilesTexto, hoy, filas, resumen, filtros, accion, abrir, abierta,
}: {
  /** «1 al 15 de septiembre». */
  titulo: string
  /** «9 h L a J · 8 h los viernes» — el prop del mockup, para poder validar R2 contra el dato real. */
  jornadaTexto: string
  /** «7 de 11 hábiles transcurridos» — cuánto de la quincena ya pasó. */
  habilesTexto?: string
  /** Para teñir la columna del día en curso. Sin él, el encabezado no distingue hoy. */
  hoy?: string
  filas: readonly FilaDeGrilla[]
  resumen: ResumenDeGrilla
  filtros: readonly FiltroDeGrilla[]
  /** El botón de cierre. Se dibuja siempre; lo habilita `resumen.puedeCerrar`. */
  accion?: React.ReactNode
  /** Sin `abrir`, la grilla sigue siendo lo que era: una tabla que no responde al clic. */
  abrir?: (personaId: string) => void
  abierta?: string | null
}) {
  return (
    // EN EL TELÉFONO LOS FILTROS VAN ABAJO Y LA GRILLA SE DESLIZA. El mockup está dibujado a
    // 1240-1440 px; a 390 la columna de 230 px se le come la mitad al cuadro y las trece columnas de
    // día quedan cortadas sin forma de llegar a ellas. Es la misma salida que ya usa la grilla de
    // Asistencia: apilar y dejar que el ancho real se recorra.
    <div className="flex flex-col-reverse items-stretch lg:flex-row-reverse">

      <aside
        className="w-full border-t lg:w-[230px] lg:flex-none lg:border-l lg:border-t-0"
        style={{
          borderColor: V.lineaFuerte, background: '#FAFAF8',
          display: 'flex', flexDirection: 'column',
        }}>
        {filtros.map((f) => <Filtro key={f.rotulo} filtro={f} />)}
        <div style={{ marginTop: 'auto', padding: 15, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Resumen rotulo="Cargadas" valor={numero(resumen.cargadas)} />
          <Resumen rotulo="Esperadas" valor={numero(resumen.esperadas)} />
          {accion ?? (
            <button
              type="button"
              disabled={!resumen.puedeCerrar}
              data-testid="cerrar-quincena"
              style={{
                height: 30, border: 0, borderRadius: 6,
                background: resumen.puedeCerrar ? V.marca : '#EDECE8',
                color: resumen.puedeCerrar ? V.grafito : V.tenue,
                fontSize: '12px', fontWeight: 600,
                cursor: resumen.puedeCerrar ? 'pointer' : 'not-allowed',
              }}
            >Cerrar quincena</button>
          )}
          {/* EL PORQUÉ, SIEMPRE AL LADO DEL BOTÓN GRIS. */}
          {!resumen.puedeCerrar && (
            <div data-testid="por-que-no" style={{ fontSize: '11px', color: V.apagado, lineHeight: 1.5 }}>
              {resumen.porQueNo}
            </div>
          )}
        </div>
      </aside>

      <div className="min-w-0 flex-1" style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: '20px 20px 16px', display: 'flex', alignItems: 'center', gap: 16,
          borderBottom: `1px solid ${V.linea}`,
        }}>
          <div style={{ fontSize: '14.5px', fontWeight: 600 }}>{titulo}</div>
          <div style={{ fontSize: '11.5px', color: V.apagado }} data-testid="grilla-subtitulo">
            {habilesTexto ? `${habilesTexto} · ${jornadaTexto}` : jornadaTexto}
          </div>
        </div>

        {/* EL ANCHO REAL DE LA GRILLA SE RECORRE, no se aplasta: trece columnas de 30 px más el
            nombre no entran en 390 y encogerlas dejaría celdas ilegibles. */}
        <div className="overflow-x-auto" style={{ padding: '0 20px' }}>
        <div style={{ minWidth: 760, display: 'flex', flexDirection: 'column' }}>
          <div data-testid="encabezado-columnas" style={{
            display: 'grid', gridTemplateColumns: COLUMNAS, gap: 6, height: ALTO_LIQ.encabezadoAncho, alignItems: 'end',
            borderBottom: `1px solid ${V.linea}`, paddingBottom: 9,
            fontFamily: 'var(--font-mono, "IBM Plex Mono", monospace)', fontSize: '9.5px',
            letterSpacing: '.03em', color: V.tenue, textTransform: 'uppercase',
          }}>
            <div>Persona</div>
            {/* EL ENCABEZADO DEL DÍA DICE SI HAY ALGO ADENTRO. Mockup línea 145: el día que nadie
                cargó va en gris de línea (#D7D5CF) y el día en curso en tinta plena. Un encabezado
                todo del mismo gris obliga a bajar la vista para saber dónde está parado uno. */}
            {resumen.dias.map((f, i) => (
              <div key={f} style={{
                textAlign: 'center',
                color: f === hoy ? V.tinta : (resumen.porDia[i] == null ? V.lineaFuerte : V.tenue),
              }}>{rotuloDia(f)}</div>
            ))}
            <div style={{ textAlign: 'right' }}>Carg.</div>
            <div style={{ textAlign: 'right' }}>Esper.</div>
            <div style={{ textAlign: 'right' }}>Estado</div>
          </div>

          {filas.map((f) => (
            <Fila key={f.personaId} fila={f} abrir={abrir} abierta={f.personaId === abierta} />
          ))}

          <div style={{
            ...filaGrid(56), borderBottom: 'none', borderTop: `1px solid ${V.grafito}`, fontWeight: 600,
          }} data-testid="total-grilla">
            <div>
              {resumen.personas} persona{resumen.personas === 1 ? '' : 's'}
              {resumen.sinRetribucion > 0 && ` · ${resumen.sinRetribucion} sin retribución`}
            </div>
            {resumen.porDia.map((n, i) => (
              // NULL NO ES CERO: un día que nadie cargó queda vacío, no en 0.
              <div key={resumen.dias[i]} style={{ textAlign: 'center' }}>{n == null ? '' : numero(n)}</div>
            ))}
            <div style={{ textAlign: 'right' }}>{numero(resumen.cargadas)}</div>
            <div style={{ textAlign: 'right' }}>{numero(resumen.esperadas)}</div>
            <div />
          </div>
        </div>
        </div>

        <div style={{ padding: '12px 20px 20px', fontSize: '11px', color: V.apagado }}>
          <strong style={{ color: V.neg, fontWeight: 600 }}>A</strong> ausencia ·{' '}
          <strong style={{ color: '#175CD3', fontWeight: 600 }}>L</strong> licencia ·{' '}
          <strong style={{ color: V.lineaFuerte }}>·</strong> sin horas cargadas
        </div>
      </div>
    </div>
  )
}

function Resumen({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', fontSize: '12.5px' }}>
      <span style={{ color: V.apagado }}>{rotulo}</span>
      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{valor}</span>
    </div>
  )
}
