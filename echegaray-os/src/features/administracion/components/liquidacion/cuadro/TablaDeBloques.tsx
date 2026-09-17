'use client'

// UN CUADRO DE LA QUINCENA: título con su subtotal, saltos a cada bloque, encabezado en dos renglones (bloque arriba,
// columna abajo), fondo por bloque y la columna Persona fija. Lo usan los dos cuadros —jornaleros y mensuales—, que
// sólo cambian la definición de columnas y las filas.
//
// ═══ POR QUÉ HAY SALTOS A LOS BLOQUES (captura del 17/09/2026) ═══
//
// A 1440 el cuadro de jornaleros mide ~2.900 px: Persona, quince días y diecisiete columnas de plata. No entra, y sacar
// columnas no es una opción («lo pedido no se quita»). El defecto no era el scroll sino que no se veía que había más:
// Recibo negro y Resto quedaban fuera de pantalla sin nada que lo dijera. Los saltos nombran los cuatro bloques arriba,
// marcan en cuál se está, y llevan a cada uno con un clic; el rótulo del bloque sigue a la vista mientras se desplaza.
//
// ═══ EL FONDO DEL BLOQUE ES UNA CAPA DETRÁS DE LAS FILAS ═══
//
// Pintar cada celda deja blanco el aire de 8 px entre columnas y el bloque se lee como una reja. Una capa con la misma
// grilla, una caja por bloque, cubre los aires de adentro y deja en blanco el que separa un bloque del siguiente: ése
// es el corte. Las filas no tienen fondo propio (salvo la pagada, que se pinta entera) y la capa se ve a través.

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { V } from '@/shared/components/v2/patron'
import { CintaHorizontal } from '@/shared/components/v2/CintaHorizontal'
import { CANAL_SCROLL, COLUMNA_FIJA, MARCO_SCROLL, fondoDeColumnaFija } from '../solapas/tabla'
import {
  anchoDe, bloqueEnVista, columnasDe, corrimientoDelRotulo, desplazamientoHasta, tramosDeBloques, DIA,
  type DefinicionDeCuadro, type TonoDeBloque, type TramoDeBloque,
} from './columnasDelCuadro'
import type { Tirador } from './useAnchoDePersona'

// ═══ LA COLUMNA PERSONA MIDE DISTINTO EN EL TELÉFONO (dueño, 16/09/2026: «roto el diseño en liq hs») ═══
// 170 px angosto y 250 desde `md`; el ancho mínimo de la tabla se calcula con la misma variable.
export const VARIABLE_PERSONA = '[--liq-persona:170px] md:[--liq-persona:250px]'

/** El fondo de cada tono, de los tokens del tema: canvas y superficie hundida. Clases estáticas, no hex. */
// LIMPIEZA 17/09/2026 («mucho ruido visual»): el gris hundido y el canvas alternados se leían como franjas. Queda un solo
// tinte, el más claro del tema, en los bloques que antes eran hundidos; el corte entre bloques lo sigue haciendo el aire.
export const CLASE_DE_TONO: Record<TonoDeBloque, string> = { ninguno: '', claro: '', hundido: 'bg-canvas' }

/**
 * EL ✎ SIGUE EN LA DEFINICIÓN (`columnasDelCuadro.ts`: dice qué columna se escribe, y los tests lo leen) pero no se
 * dibuja: repetido en once rótulos era ruido, y la celda ya se ve editable al pasar el puntero o enfocarla.
 */
export const rotuloVisible = (rotulo: string): string => rotulo.replace(/\s*✎$/, '')

const DIAS_CORTOS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'] as const
function rotuloDia(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  return `${DIAS_CORTOS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]}${d}`
}

/**
 * LA CELDA FIJA OCUPA LA FILA ENTERA, de filo a filo: si sólo mide su contenido, por arriba y por abajo se ven pasar
 * los fondos de bloque y las celdas desplazadas (QA, 17/09/2026).
 */
export const PERSONA_ESTIRADA: React.CSSProperties = { alignSelf: 'stretch', display: 'flex', flexDirection: 'column', justifyContent: 'center' }

export const filaGrid = (columnas: string, alto: number): React.CSSProperties => ({
  display: 'grid', gridTemplateColumns: columnas, columnGap: 8, minHeight: alto, position: 'relative',
  alignItems: 'center', borderBottom: `1px solid ${V.linea}`, fontSize: '12.5px', fontVariantNumeric: 'tabular-nums',
})

export function TablaDeBloques({ testid, principal = false, titulo, resumen, definicion, dias, sellada, tirador, registrar, filas, total }: {
  testid: string
  /**
   * El cuadro de jornaleros conserva los testids de siempre (`espejo-cinta`, `espejo-tabla`, `espejo-encabezado`,
   * `banda-blanco`…): los E2E y el cotejo de la planilla los usan. El de mensuales lleva los suyos con prefijo.
   */
  principal?: boolean
  titulo: string
  /** El subtotal del cuadro, dicho en una línea al lado del título. */
  resumen: ReactNode
  definicion: DefinicionDeCuadro
  dias: readonly string[]
  sellada: boolean
  tirador: Tirador
  registrar: (el: HTMLElement | null) => void
  filas: (columnas: string) => ReactNode
  total: (columnas: string) => ReactNode
}) {
  const nDias = definicion.bloqueDeLosDias == null ? 0 : dias.length
  const columnas = columnasDe(definicion, dias.length)
  const ancho = anchoDe(definicion, dias.length)
  const tramos = tramosDeBloques(definicion, dias.length)
  const id = (propio: string) => (principal ? `espejo-${propio}` : `${testid}-${propio}`)
  return (
    <section data-testid={testid} data-cuadro={testid}>
      <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 16, rowGap: 4, padding: `16px ${CANAL_SCROLL}px 8px` }}>
        <h3 style={{ fontSize: '13px', fontWeight: 600, color: V.tinta, margin: 0 }}>{titulo}</h3>
        {resumen}
      </div>
      <CintaHorizontal
        testid={id('cinta')}
        marcoPropio={{ ...MARCO_SCROLL, padding: `0 ${CANAL_SCROLL}px` }}
        cabecera={(corrimiento) => (
          <div ref={registrar} className={VARIABLE_PERSONA} style={{ minWidth: ancho, padding: `0 ${CANAL_SCROLL}px`, background: fondoDeColumnaFija() }}>
            <Saltos testid={testid} cinta={id('cinta')} tramos={tramos} corrimiento={corrimiento} />
            <Encabezado columnas={columnas} definicion={definicion} dias={nDias > 0 ? dias : []} tramos={tramos}
              sellada={sellada} corrimiento={corrimiento} tirador={tirador} testid={id('encabezado')} banda={(clave) => (principal ? `banda-${clave}` : `${testid}-banda-${clave}`)} />
          </div>
        )}
      >
        <div ref={registrar} className={VARIABLE_PERSONA} data-testid={id('tabla')}
          style={{ minWidth: ancho, display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <FondosDeBloque columnas={columnas} tramos={tramos} />
          {filas(columnas)}
          {total(columnas)}
        </div>
      </CintaHorizontal>
    </section>
  )
}

/** La capa de fondos: una caja por bloque con tono, detrás de las filas. */
function FondosDeBloque({ columnas, tramos }: { columnas: string; tramos: readonly TramoDeBloque[] }) {
  return (
    <div aria-hidden style={{
      position: 'absolute', inset: 0, display: 'grid', gridTemplateColumns: columnas, gridTemplateRows: '100%', columnGap: 8, pointerEvents: 'none',
    }}>
      {tramos.filter((t) => t.tono !== 'ninguno').map((t) => (
        <div key={t.clave} data-fondo-bloque={t.clave} className={CLASE_DE_TONO[t.tono]}
          style={{ gridColumn: `${t.inicio} / span ${t.span}`, gridRow: 1, marginInline: -2 }} />
      ))}
    </div>
  )
}

/**
 * LOS SALTOS: un botón por bloque. Se contra-desplazan como «Persona» para quedar a la vista; el que está pegado a
 * Persona se marca. El desplazamiento lo hace la cinta de ESTE cuadro, buscada por su testid dentro de la sección.
 */
function Saltos({ testid, cinta: idCinta, tramos, corrimiento }: { testid: string; cinta: string; tramos: readonly TramoDeBloque[]; corrimiento: number }) {
  // EL ANCHO VISIBLE SE MIDE (cinta menos Persona): sin él no se sabe qué bloque ocupa la pantalla.
  const propio = useRef<HTMLDivElement | null>(null)
  const [anchoVisible, setAnchoVisible] = useState(0)
  useEffect(() => {
    const cuadro = propio.current?.closest('[data-cuadro]')
    const cinta = cuadro?.querySelector<HTMLElement>(`[data-testid="${idCinta}"]`)
    const persona = cuadro?.querySelector<HTMLElement>('[data-encabezado] > div')
    if (cinta && persona) setAnchoVisible(Math.max(0, cinta.clientWidth - persona.getBoundingClientRect().width))
  }, [corrimiento, idCinta])
  const enVista = bloqueEnVista(tramos, corrimiento, anchoVisible)
  const ir = (e: React.MouseEvent<HTMLButtonElement>, t: TramoDeBloque, i: number) => {
    const cinta = e.currentTarget.closest('[data-cuadro]')?.querySelector<HTMLElement>(`[data-testid="${idCinta}"]`)
    cinta?.scrollTo({ left: desplazamientoHasta(t, i === 0), behavior: 'smooth' })
  }
  return (
    <div ref={propio} data-testid={`${testid}-saltos`} style={{
      display: 'flex', alignItems: 'center', gap: 4, padding: '4px 0 8px', transform: `translateX(${corrimiento}px)`, width: 'max-content',
    }}>
      <span style={{ fontSize: '11px', color: V.tenue, marginRight: 4 }}>Ir a</span>
      {tramos.map((t, i) => (
        <button key={t.clave} type="button" onClick={(e) => ir(e, t, i)} data-testid={`${testid}-salto-${t.clave}`}
          aria-current={enVista === t.clave ? 'true' : undefined}
          className={[
            // SIN CÁPSULAS: un salto es navegación secundaria. Texto, y el bloque en vista con el fondo más suave.
            'h-7 max-[767px]:h-9 rounded-control px-2 text-[11.5px] leading-none whitespace-nowrap transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
            enVista === t.clave ? 'bg-surface-quiet text-ink font-semibold' : 'text-muted hover:text-ink',
          ].join(' ')}><span className="md:hidden">{t.corto}</span><span className="hidden md:inline">{t.rotulo}</span></button>
      ))}
    </div>
  )
}

/** Dos renglones: arriba el bloque (con su fondo y su rótulo que sigue al desplazamiento), abajo cada columna. */
function Encabezado({ columnas, definicion, dias, tramos, sellada, corrimiento, tirador, testid, banda }: {
  columnas: string; definicion: DefinicionDeCuadro; dias: readonly string[]; tramos: readonly TramoDeBloque[]
  sellada: boolean; corrimiento: number; tirador: Tirador; testid: string; banda: (clave: string) => string
}) {
  // RÓTULOS EN CAJA NORMAL (limpieza 17/09/2026): treinta rótulos en monoespaciada mayúscula competían con los números.
  const rotulo = { fontSize: '11px', lineHeight: '14px' }
  return (
    <div data-testid={testid} data-encabezado="" style={{
      display: 'grid', gridTemplateColumns: columnas, columnGap: 8, gridTemplateRows: 'auto auto', alignItems: 'end',
      borderBottom: `1px solid ${V.lineaFuerte}`, color: V.tenue, ...rotulo,
    }}>
      {/* «PERSONA» NO SE VA CON EL SCROLL: se contra-desplaza (acá no hay scrollport que ancle un sticky). Una sola
          celda para los dos renglones, estirada, para que tape todo lo que pasa por debajo. */}
      <div style={{
        // `left: 0`: `COLUMNA_FIJA` trae `left: -20` para el sticky de las filas; con `relative` ese mismo `left` corría
        // la celda 20 px más a la izquierda que su columna y por el hueco asomaban los rótulos desplazados (QA, 17/09/2026).
        ...COLUMNA_FIJA, position: 'relative', left: 0, gridColumn: 1, gridRow: '1 / span 2', alignSelf: 'stretch', zIndex: 2,
        display: 'flex', alignItems: 'end', paddingBottom: 8, transform: `translateX(${corrimiento}px)`,
      }}>
        Persona
        <div data-testid="ancho-persona" role="separator" aria-orientation="vertical"
          aria-label="Ancho de la columna Persona: arrastrar para cambiar, doble clic para restablecer"
          title="Arrastrá para ensanchar · doble clic: ancho por defecto" className="group"
          style={{ position: 'absolute', top: 0, right: -5, width: 11, height: '100%', cursor: 'col-resize', touchAction: 'none', zIndex: 2, display: 'flex' }}
          {...tirador}>
          <div className="mx-auto h-full w-[3px] rounded-full bg-line-strong group-hover:bg-ink group-active:bg-ink" />
        </div>
      </div>
      {tramos.map((t) => (
        <div key={t.clave} data-testid={banda(t.clave)} className={CLASE_DE_TONO[t.tono]} style={{
          gridColumn: `${t.inicio} / span ${t.span}`, gridRow: '1 / span 2', alignSelf: 'stretch', marginInline: -2,
          borderTop: `1px solid ${V.linea}`, overflow: 'clip',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'baseline', gap: 8, padding: '8px 4px 0', color: V.tintaSuave, fontWeight: 600,
            whiteSpace: 'nowrap', transform: `translateX(${corrimientoDelRotulo(corrimiento, t)}px)`,
          }}>
            {t.rotulo}
            {sellada && <span style={{ fontWeight: 400, color: V.apagado }}>sellada</span>}
          </div>
        </div>
      ))}
      {dias.map((f, i) => (
        <div key={f} title={f} style={{ gridColumn: 2 + i, gridRow: 2, textAlign: 'center', padding: '28px 0 8px', minWidth: DIA }}>{rotuloDia(f)}</div>
      ))}
      {definicion.columnas.map((c, i) => (
        <div key={c.clave} style={{ gridColumn: 2 + dias.length + i, gridRow: 2, textAlign: 'right', padding: '28px 0 8px' }}>{rotuloVisible(c.rotulo)}</div>
      ))}
    </div>
  )
}
