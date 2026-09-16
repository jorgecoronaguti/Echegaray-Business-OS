'use client'

// EL CUADRO DE LA QUINCENA — BLANCO + NEGRO, Y CUÁNTO FALTA PAGAR (dueño, 14 y 15/09/2026).
//
// *«realmente no se entiende nada el cuadro de liq de hs, vamos a rehacer. revisar en cada caso el valor
// hs segun categoria q aparece en recibo de sueldo, esa es la parte en blanco … la otra es otro valor
// hora … q cubre el otro 50 en negro del salario»* (14/09), y después *«necesito al lado de banco y negro lo
// que se le ha pagado efectivamente y que vaya restando al total o incrementando en el otro llegado el caso;
// así no sirve, rehacer»* (15/09). La fila se lee en el orden en que se arma y se paga el sueldo:
//
//   Persona · días · Horas │ BLANCO · recibo: Hs · $/h cat. · Banco ✎ · Pagado ✎ · Saldo │
//   NEGRO: Hs ✎ · $/h negro ✎ · Importe ✎ · Pagado ✎ · Saldo │ Presentismo · Total · Pagado · Saldo
//
// ═══ DOS BANDAS SIMÉTRICAS Y NO DIEZ COLUMNAS SUELTAS ═══
//
// «Hs», «Pagado» y «Saldo» aparecen dos veces y significan dos cosas cada una. Sin la banda de arriba hay que
// adivinar cuál es cuál; con ella los dos lados se leen en paralelo, que es como se decide el pago.
//
// ═══ LO QUE NO ESTÁ Y POR QUÉ ═══
//
// Sin columnas de extras (dueño, 14/09: «las columnas de hs extra quitarlas»): las extras se siguen
// pagando con el coeficiente de JORNALES dentro de «Horas». Sin «Por banco» aparte: el banco ES el neto.
// Sin «Adelanto banco / embargos», «Adelanto efectivo» ni «Total efectivo» (15/09): un adelanto es un PAGO y
// vive en la columna Pagado de su lado — el porqué está sobre `PLATA`. El 50/50 acordado y el cotejo con la
// planilla siguen en el panel de la persona.
//
// ═══ NI UN NÚMERO SE CALCULA ACÁ ═══
//
// Las cifras son las de `getLiquidacionDeLaQuincena` (con `sueldoBlancoNegro` y `pagoDeLaQuincena`) y el
// cierre lo comprueba `cierreDeLaFila`. Este archivo decide anchos, colores y dónde va cada campo.

import { useEffect, useRef, useState } from 'react'
import { V } from '@/shared/components/v2/patron'
import { RotuloDeGrupo } from '../RotuloDeGrupo'
import { CeldaDeDia, CeldaHorasPagas, CeldaPresentismo, Leida } from './cuadro/CeldasDelEspejo'
import {
  CeldaHoraCategoria, CeldaHorasBlanco, CeldaHorasNegro, CeldaImporteNegro, CeldaNeto, CeldaPagado,
  CeldaPagadoTotal, CeldaSaldo, CeldaTotal,
} from './cuadro/CeldasBlancoNegro'
import { CeldaTarifa, rotuloCategoria } from './cuadro/CeldaTarifa'
import { PanelDeLaPersona } from './cuadro/PanelDeLaPersona'
import { MarcaDePago } from './cuadro/MarcaDePago'
import { filaPagada } from './cuadro/marcaDePago'
import { categoriasDeLaFila } from './cuadro/categoriasDeLaFila'
import { anchoArrastrado, anchoRecordado, CLAVE_ANCHO_PERSONA } from './cuadro/anchoDePersona'
import { horas as nHoras, pesos } from './formato'
import { CintaHorizontal } from '@/shared/components/v2/CintaHorizontal'
import { ALTO_LIQ, CANAL_SCROLL, COLUMNA_FIJA, MARCO_SCROLL, MONO, fondoDeColumnaFija } from './solapas/tabla'
import type { CampoEditable } from '../../services/liquidacionOverrides'
import type { FilaDelEspejo, TotalesDelEspejo } from '../../services/espejoDeJornales'
import { cierreDeTotales, type EntradaDeHistorial } from '../../services/cuadroDeJornales'
import { sumaDelRedondeo } from '../../services/efectivoRedondeado'
import { rotuloDelMensual } from '../../services/cobroMensual'
import type { DetalleLaboral } from '../../services/detalleLaboral'

export { FiltrosDelEspejo } from './cuadro/FiltrosDelEspejo'

const DIAS_CORTOS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'] as const

function rotuloDia(fecha: string): string {
  const [a, m, d] = fecha.split('-').map(Number)
  return `${DIAS_CORTOS[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]}${d}`
}

const corta = (iso: string | null): string =>
  iso == null ? 'alta sin cargar' : `alta ${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`

/**
 * LAS COLUMNAS DE LA PLATA — DOS LADOS SIMÉTRICOS Y UN TOTAL (dueño, 15/09/2026).
 *
 * *«necesito al lado de banco y negro lo que se le ha pagado efectivamente y que vaya restando al total o
 * incrementando en el otro llegado el caso; así no sirve, rehacer»*. Las dos bandas pasan a tener las MISMAS
 * cinco columnas —cuánto, cuánto se pagó, cuánto falta— y al final la fila cierra con Total · Pagado · Saldo.
 *
 * ═══ LAS CUATRO COLUMNAS QUE SE FUERON, Y POR QUÉ ═══
 *
 *   «Adelanto banco / embargos»  ahora es PAGADO del lado blanco: un giro ya hecho no es un descuento del
 *                                sueldo, es plata entregada.
 *   «Adelanto efectivo»          ahora es PAGADO del lado negro. Era la queja textual: *«no considera
 *                                adelantos en efectivo y resta del efectivo total»*.
 *   «Total efectivo»             era cobra − adelantos − banco: una resta que no contestaba «¿cuánto le
 *                                entrego hoy?» cuando el adelanto superaba el negro. Ahora es SALDO, y el
 *                                exceso de un lado se descuenta del otro (`pagoDeLaQuincena.ts`).
 *   «Cobra total»                se llama TOTAL y sigue siendo `l.cobra`. El número que decide es el SALDO,
 *                                la última columna: se mueve con la cinta, no queda pegada (16/09).
 *
 * Sin «Cliente · Obra» (dueño, 14/09: «esa columna no te pedi en liq hs»). `banda` agrupa el encabezado.
 */
const PLATA = [
  // 72 Y 64: Horas y Hs negro se escriben (15/09/2026) y el campo con la marca «manual» no entra en 56 y 48.
  { clave: 'horas', rotulo: 'Horas ✎', px: 72 },
  { clave: 'hsBlanco', rotulo: 'Hs recibo ✎', px: 72, banda: 'blanco' },
  { clave: 'horaCategoria', rotulo: '$/h cat. ✎', px: 96, banda: 'blanco' },
  { clave: 'neto', rotulo: 'Banco ✎', px: 124, banda: 'blanco' },
  { clave: 'pagadoBanco', rotulo: 'Pagado ✎', px: 112, banda: 'blanco' },
  { clave: 'saldoBanco', rotulo: 'Saldo', px: 112, banda: 'blanco' },
  { clave: 'hsNegro', rotulo: 'Hs ✎', px: 64, banda: 'negro' },
  // 120: el botón del $/h con el «+8%» al lado. La marca del básico se mudó al $/h de categoría.
  { clave: 'horaNegro', rotulo: '$/h negro ✎', px: 120, banda: 'negro' },
  { clave: 'negro', rotulo: 'Importe ✎', px: 104, banda: 'negro' },
  { clave: 'pagadoEfectivo', rotulo: 'Pagado ✎', px: 112, banda: 'negro' },
  { clave: 'saldoEfectivo', rotulo: 'Saldo', px: 112, banda: 'negro' },
  // PRESENTISMO (dueño, 15/09/2026): la parte del cobra que una sola tardanza hace perder. Va después del
  // negro porque de ahí sale el descuento (el neto es del estudio). No es una columna de JORNALES.
  { clave: 'presentismo', rotulo: 'Presentismo', px: 112 },
  // SIN «Efect. red. ✎» (QA, 16/09/2026): el redondeo de los billetes no entra en ninguna cuenta de la fila y
  // en el cuadro era una columna editable más entre Presentismo y Total. Se sigue viendo sumado en el pie
  // («Efectivo redondeado») y se sigue escribiendo en el cuadro clásico (`CuadroLiquidacion`).
  { clave: 'total', rotulo: 'Total', px: 124 },
  { clave: 'pagado', rotulo: 'Pagado', px: 112 },
  { clave: 'saldo', rotulo: 'Saldo', px: 120 },
] as const

/** Cuántas columnas cubre cada banda. Blanco y negro tienen las mismas cinco: se leen en paralelo. */
const ANCHO_DE_BANDA = 5

const GAP = 8

/**
 * NINGUNA COLUMNA PEGADA A LA DERECHA (dueño, 16/09/2026, textual: «está mal la columna de "saldo" en liq de hs
 * porque esa queda fija, y la que has dejado tirada al último a la derecha sí se mueve como saldo: has hecho mal
 * eso, rehacer urgente»). Hasta hoy el Saldo total iba `sticky right` como espejo de `COLUMNA_FIJA`; leído con la
 * cinta desplazada, tapaba el Saldo del blanco y se confundía con él. Total · Pagado · Saldo son columnas comunes
 * al final de la cinta y se mueven con ella, como en el Sheet. Lo único fijo: el encabezado arriba y Persona a la
 * izquierda.
 */
const DIA = 36

// ═══ LA COLUMNA PERSONA MIDE DISTINTO EN EL TELÉFONO (dueño, 16/09/2026: «roto el diseño en liq hs») ═══
//
// Con 200 px fijos más el canal de 20, la celda pegajosa se comía 220 de los 390 px del teléfono y los días quedaban
// tapados debajo del nombre. La medida vive en una variable CSS que cambia por punto de corte —150 px angosto, 200 px
// desde `md`—, igual que `--gao-persona` en la grilla de Horas; el ancho mínimo de la tabla se calcula con la misma
// variable para que el `1fr` no la devuelva a 200.
const VARIABLE_PERSONA = '[--liq-persona:170px] md:[--liq-persona:250px]'

// LOS DÍAS ADELANTE, COMO EN LA PLANILLA: Persona · días · plata.
const columnasDe = (nDias: number): string =>
  `minmax(var(--liq-persona,200px),1fr) repeat(${nDias},${DIA}px) ${PLATA.map((c) => `${c.px}px`).join(' ')}`

/** El ancho mínimo de la tabla: la columna Persona (variable) más todo lo demás (fijo). */
const anchoDe = (nDias: number): string =>
  `calc(var(--liq-persona,200px) + ${nDias * DIA + PLATA.reduce((s, c) => s + c.px, 0) + (nDias + PLATA.length) * GAP}px)`

/** Cuántas columnas ocupan las dos bandas: la celda de un mensual las cubre enteras. */
const ANCHO_DE_LAS_BANDAS = PLATA.filter((c) => 'banda' in c).length

/** Dónde empieza cada banda en la grilla (1 = Persona, después los días). */
const inicioDe = (banda: 'blanco' | 'negro', nDias: number): number =>
  2 + nDias + PLATA.findIndex((c) => 'banda' in c && c.banda === banda)

const filaGrid = (columnas: string, alto: number): React.CSSProperties => ({
  display: 'grid', gridTemplateColumns: columnas, gap: GAP, minHeight: alto,
  alignItems: 'center', borderBottom: `1px solid ${V.linea}`,
  fontSize: '12.5px', fontVariantNumeric: 'tabular-nums',
})

export interface SeccionDelEspejo {
  clave: string
  rotulo: string
  filas: FilaDelEspejo[]
}

/** El % contra el valor anterior, sólo si el valor que rige empieza en esta quincena. */
function pctDeLaQuincena(historial: readonly EntradaDeHistorial[] | undefined, desde: string): number | null {
  const vigente = historial?.find((e) => e.vigente)
  return vigente && vigente.desde === desde ? vigente.pctAumento : null
}

export function GrillaEspejoQuincena({
  dias, secciones, totales, quincena, camposEditables, sello,
  historiales = {}, historialCompleto = true, detalles = {},
}: {
  dias: readonly string[]
  secciones: readonly SeccionDelEspejo[]
  totales: TotalesDelEspejo
  quincena: { desde: string; hasta: string }
  camposEditables: readonly CampoEditable[]
  historiales?: Record<string, EntradaDeHistorial[]>
  historialCompleto?: boolean
  /** El detalle laboral de cada persona (`leerDetallesLaborales`). Viaja armado: el panel no lee. */
  detalles?: Record<string, DetalleLaboral>
  sello: React.ReactNode
}) {
  const [abierta, setAbierta] = useState<string | null>(null)
  const columnas = columnasDe(dias.length)
  const visibles = secciones.flatMap((s) => s.filas)
  const filaAbierta = abierta ? visibles.find((f) => f.personaId === abierta) : undefined
  // EL PIE DEL REDONDEO SUMA LO QUE SE VE: las mismas filas del recorte, guardado o sugerido. Sólo el pie: la
  // columna salió del cuadro el 16/09/2026 (ver `PLATA`).
  const redondeo = sumaDelRedondeo(visibles.map((f) => f.linea))
  const ancho = anchoDe(dias.length)
  // ═══ EL ANCHO DE PERSONA SE ARRASTRA (dueño, 16/09/2026: «permitime hacer más ancha la columna») ═══
  //
  // La medida se aplica IMPERATIVAMENTE a la variable CSS `--liq-persona` de las dos cajas de la cinta (cabecera y
  // tabla): no es estado de React —el servidor no sabe qué recordó este navegador y un estado hidrataría distinto—,
  // es el DOM sincronizado con lo recordado y con el arrastre. Doble clic en el tirador vuelve al ancho por corte.
  const cajaCabecera = useRef<HTMLDivElement | null>(null)
  const cajaTabla = useRef<HTMLDivElement | null>(null)
  const aplicarAncho = (w: number | null) => {
    for (const caja of [cajaCabecera.current, cajaTabla.current]) {
      if (!caja) continue
      if (w == null) caja.style.removeProperty('--liq-persona')
      else caja.style.setProperty('--liq-persona', `${w}px`)
    }
  }
  useEffect(() => { aplicarAncho(anchoRecordado((k) => window.localStorage.getItem(k))) }, [])
  const arrastre = useRef<{ x0: number; w0: number; w: number } | null>(null)
  const empezarArrastre = (e: React.PointerEvent<HTMLElement>) => {
    const celda = e.currentTarget.parentElement
    if (!celda) return
    const w0 = celda.getBoundingClientRect().width - CANAL_SCROLL
    arrastre.current = { x0: e.clientX, w0, w: w0 }
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
  }
  const moverArrastre = (e: React.PointerEvent<HTMLElement>) => {
    if (!arrastre.current) return
    arrastre.current.w = anchoArrastrado(arrastre.current.w0, e.clientX - arrastre.current.x0)
    aplicarAncho(arrastre.current.w)
  }
  const soltarArrastre = (e: React.PointerEvent<HTMLElement>) => {
    if (!arrastre.current) return
    const w = arrastre.current.w
    arrastre.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
    try { window.localStorage.setItem(CLAVE_ANCHO_PERSONA, String(w)) } catch { /* sin storage: vale hasta recargar */ }
  }
  const restablecer = () => { aplicarAncho(null); try { window.localStorage.removeItem(CLAVE_ANCHO_PERSONA) } catch { /* sin storage */ } }
  const tirador = { onPointerDown: empezarArrastre, onPointerMove: moverArrastre, onPointerUp: soltarArrastre, onPointerCancel: soltarArrastre, onDoubleClick: restablecer }
  return (
    // `overflow: clip` Y NO `hidden`: los dos recortan las esquinas redondeadas, pero `hidden` CREA UN
    // CONTENEDOR DE SCROLL y `position: sticky` se ancla al scrollport más cercano — el encabezado pegajoso
    // de adentro quedaría clavado a esta caja y se iría con la página. `clip` no crea scrollport.
    <div style={{ background: '#FFFFFF', border: `1px solid ${V.lineaFuerte}`, borderRadius: 10, overflow: 'clip' }}>
      {sello}
      {/* ═══ EL ENCABEZADO QUEDA FIJO (dueño, 15/09/2026: «quiero eso fijo en liq hs») ═══
          Los rótulos viven AFUERA del elemento que scrollea y se corren con él: es la única forma de que
          `sticky` funcione dentro de una tabla con scroll horizontal propio, y ya está resuelta y explicada
          en `CintaHorizontal`. El marco (degradado de borde + canal de 20 px que la columna fija necesita)
          sigue siendo el de Liquidación: por eso viaja como `marcoPropio` en vez de copiarse adentro. */}
      <CintaHorizontal
        testid="espejo-cinta"
        marcoPropio={{ ...MARCO_SCROLL, padding: `16px ${CANAL_SCROLL}px 0` }}
        cabecera={(corrimiento) => (
          <div ref={cajaCabecera} className={VARIABLE_PERSONA} style={{ minWidth: ancho, padding: `8px ${CANAL_SCROLL}px 0`, background: fondoDeColumnaFija() }}>
            <Encabezado columnas={columnas} dias={dias} sellada={visibles.some((f) => f.cerrada)} corrimiento={corrimiento} tirador={tirador} />
          </div>
        )}
      >
        <div ref={cajaTabla} data-testid="espejo-tabla" className={VARIABLE_PERSONA} style={{ minWidth: ancho, display: 'flex', flexDirection: 'column' }}>
          {secciones.map((sec, i) => (
            <div key={sec.clave} data-testid={`espejo-seccion-${sec.clave}`}>
              <RotuloDeGrupo texto={sec.rotulo} primero={i === 0} />
              {sec.filas.map((fila) => (
                <Fila key={fila.personaId} fila={fila} columnas={columnas} quincena={quincena}
                  camposEditables={camposEditables}
                  pct={pctDeLaQuincena(historiales[fila.personaId], quincena.desde)}
                  abrir={() => setAbierta(fila.personaId)} />
              ))}
            </div>
          ))}

          <Total columnas={columnas} dias={dias} totales={totales} />
        </div>
      </CintaHorizontal>
      <PieDelEspejo totales={totales} redondeo={redondeo} />
      {/* `key` = LA PERSONA. Sin la clave, abrir a otra persona reutiliza el mismo árbol y cada celda
          editable conserva lo tecleado para la anterior (dueño, 11/09/2026: «si cambiás de persona la
          hora se cambia»). */}
      {filaAbierta && (
        <PanelDeLaPersona key={filaAbierta.personaId} fila={filaAbierta} quincena={quincena} camposEditables={camposEditables}
          historial={historiales[filaAbierta.personaId] ?? []} historialCompleto={historialCompleto}
          detalle={detalles[filaAbierta.personaId]}
          onCerrar={() => setAbierta(null)} />
      )}
    </div>
  )
}

/** Dos niveles: arriba las bandas BLANCO · recibo y NEGRO; abajo el rótulo de cada columna. */
function Encabezado({ columnas, dias, sellada, corrimiento = 0, tirador }: {
  columnas: string; dias: readonly string[]; sellada: boolean
  /** Cuánto se desplazó la tabla. El rótulo «Persona» se contra-desplaza para no despegarse de su columna. */
  corrimiento?: number
  /** Los manejadores del tirador que ensancha Persona. Sin él, la cabecera no se arrastra (sellada, pruebas). */
  tirador?: Pick<React.HTMLAttributes<HTMLElement>, 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onDoubleClick'>
}) {
  const mono = { fontFamily: MONO, fontSize: '9.5px', letterSpacing: '.04em', textTransform: 'uppercase' as const }
  const banda = (inicio: number, texto: string, testid: string) => (
    <div data-testid={testid} style={{
      gridColumn: `${inicio} / span ${ANCHO_DE_BANDA}`, gridRow: 1, borderBottom: `1px solid ${V.grafito}`, paddingBottom: 4,
      color: V.tinta, fontWeight: 600, ...mono,
    }}>{texto}{sellada && (
      // LA FOTO SELLADA NO SE RECALCULA: el negro es total − neto del recibo (`negroDeLaFila`).
      <span data-testid={`${testid}-sellada`} style={{ marginLeft: 8, fontWeight: 400, color: V.apagado, textTransform: 'none' }}>sellada</span>
    )}</div>
  )
  return (
    <div data-testid="espejo-encabezado" style={{
      display: 'grid', gridTemplateColumns: columnas, columnGap: GAP, rowGap: 4, alignItems: 'end',
      paddingBottom: 8, borderBottom: `1px solid ${V.linea}`, color: V.tenue, ...mono,
    }}>
      {/* «PERSONA» NO SE VA CON EL SCROLL, igual que los nombres de abajo. Acá no puede ser `sticky` —este
          envoltorio no es un scrollport y el movimiento es un `transform`—: se contra-desplaza, y por eso
          `position: relative` en vez del `sticky` de `COLUMNA_FIJA` (que ahí no ancla nada).
          UNA SOLA CELDA PARA LOS DOS RENGLONES (QA, 16/09/2026): eran dos, y la de abajo medía una altura fija
          de 18 px. Cuando un rótulo envuelve («HS RECIBO» en dos líneas) el renglón 2 es más alto que eso, la
          celda quedaba pegada al piso y por la franja de arriba asomaba el rótulo desplazado —se leía «S RECIBO»
          debajo de «Persona»—. Cubriendo los dos renglones entera y estirada, tapa todo lo que pasa por debajo,
          sea cual sea el alto que tomen los rótulos. */}
      <div style={{
        ...COLUMNA_FIJA, position: 'relative', gridColumn: 1, gridRow: '1 / span 2', alignSelf: 'stretch',
        display: 'flex', alignItems: 'end', transform: `translateX(${corrimiento}px)`,
      }}>
        Persona
        {/* EL TIRADOR: el borde derecho de la celda. Arrastrar ensancha o angosta la columna; doble clic la devuelve
            al ancho por defecto. Es un control, no un adorno: `role=separator` con su rótulo. */}
        {tirador && (
          <div
            data-testid="ancho-persona"
            role="separator"
            aria-orientation="vertical"
            aria-label="Ancho de la columna Persona: arrastrar para cambiar, doble clic para restablecer"
            title="Arrastrá para ensanchar · doble clic: ancho por defecto"
            className="group"
            style={{ position: 'absolute', top: 0, right: -4, width: 9, height: '100%', cursor: 'col-resize', touchAction: 'none', zIndex: 2 }}
            {...tirador}
          >
            <div className="h-full w-px bg-line-strong group-hover:bg-ink" style={{ margin: '0 auto' }} />
          </div>
        )}
      </div>
      {banda(inicioDe('blanco', dias.length), 'Blanco · recibo', 'banda-blanco')}
      {banda(inicioDe('negro', dias.length), 'Negro', 'banda-negro')}
      {dias.map((f, i) => <div key={f} style={{ gridColumn: 2 + i, gridRow: 2, textAlign: 'center' }} title={f}>{rotuloDia(f)}</div>)}
      {PLATA.map((c, i) => (
        <div key={c.clave} style={{ gridColumn: 2 + dias.length + i, gridRow: 2, textAlign: 'right' }}>{c.rotulo}</div>
      ))}
    </div>
  )
}

function Fila({ fila, columnas, quincena, camposEditables, pct, abrir }: {
  fila: FilaDelEspejo
  columnas: string
  quincena: { desde: string; hasta: string }
  camposEditables: readonly CampoEditable[]
  pct: number | null
  abrir: () => void
}) {
  const l = fila.linea
  // LA FILA PAGADA SE PINTA ENTERA (dueño, 16/09/2026: «que marque un poco el color distinto»): verde suave = estado
  // positivo. La celda fija lo repite OPACA, porque con `undefined` los días pasarían por debajo del nombre.
  const fondo = filaPagada(l.pagadaEn) ? V.posSuave : undefined
  return (
    // `data-fila-edicion`: Tab en una celda pasa a la siguiente editable de ESTA fila (`InlineEdit`).
    <div data-testid={`espejo-fila-${fila.personaId}`} data-fila-edicion="" data-pagada={fondo ? '1' : undefined}
      style={{ ...filaGrid(columnas, ALTO_LIQ.filaAlta), background: fondo }}>
      <div style={{ ...COLUMNA_FIJA, background: fondoDeColumnaFija(fondo) }}>
        {/* EL NOMBRE OCUPA EL RENGLÓN ENTERO; la marca va en el segundo renglón, al lado de la categoría (QA, 16/09/2026:
            «✓ Pagada 16/09» al lado del nombre lo truncaba a «ZOGBE RAM…»). */}
        <button type="button" onClick={abrir} data-testid={`espejo-nombre-${fila.personaId}`} title={`${fila.nombre} · ${corta(fila.alta)} · abrir el detalle`}
          style={{
            display: 'block', border: 0, background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left',
            color: V.tinta, font: 'inherit', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{fila.nombre}</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* LAS DOS CATEGORÍAS CON SU $/H (dueño, 16/09/2026): la del recibo, que paga el blanco, y la de plataforma,
              que paga el negro. Un renglón cada una; el period del recibo y el veredicto van en el title. La fecha de alta
              pasó al title del nombre y al panel. */}
          {(() => {
            const s = l.sueldo
            const c = categoriasDeLaFila({
              plataforma: fila.categoria ? rotuloCategoria(fila.categoria) : null,
              pisoPlataforma: s?.pisoCategoria ?? null,
              categoriaRecibo: s?.categoriaRecibo, valorHoraRecibo: s?.valorHoraCategoria, periodoRecibo: s?.periodoRecibo,
              estado: s?.estado ?? null,
            })
            return (
              <div data-testid={`categorias-${fila.personaId}`} data-coinciden={c.coinciden ? '1' : '0'} title={c.titulo}
                style={{ flex: 1, minWidth: 0, fontSize: '11px', lineHeight: '13px', color: V.apagado }}>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.recibo}</div>
                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: c.coinciden ? V.apagado : V.tintaSuave }}>
                  {c.plataforma}
                  {/* QUIEN YA NO ESTÁ NUNCA DESAPARECE DE SU QUINCENA (dueño, 14/09/2026): marca chica y apagada. */}
                  {fila.baja && (
                    <span data-testid={`baja-${fila.personaId}`} title={fila.baja.titulo} style={{ marginLeft: 6, color: V.tenue }}>{fila.baja.texto}</span>
                  )}
                </div>
              </div>
            )
          })()}
          {/* UN CLIC Y ESTÁ PAGADA (dueño, 16/09/2026). Sólo donde la base ya tiene la marca (`camposEditables` trae
              las celdas de pago cuando 20260915T2340 está; la marca es de 20260916T1300 y la acción avisa si falta). */}
          {camposEditables.includes('pagadoBanco') && (
            <MarcaDePago personaId={fila.personaId} grupo={fila.grupo} quincena={quincena} pagadaEn={l.pagadaEn} cerrada={fila.cerrada} />
          )}
        </div>
      </div>
      {fila.celdas.map((c) => <CeldaDeDia key={c.fecha} celda={c} personaId={fila.personaId} nombre={fila.nombre} />)}
      <CeldaHorasPagas fila={fila} edicion={{ quincena, camposEditables }} />
      {l.modalidad === 'mensual' ? (
        // POR MODALIDAD, NO POR NETO: el jefe sin neto cargado cobra por mes igual (dueño, 15/09/2026).
        // UN MENSUAL NO VA EN LAS BANDAS (QA, 14/09/2026): su sueldo fijo en «$/h negro» sumaba al Total
        // sin estar en Neto ni en Negro. Una celda propia ocupa las seis columnas; su neto mensual se
        // sigue editando acá, y el pie lo suma en «Sueldos mensuales».
        <div data-testid={`mensual-${fila.personaId}`} style={{
          gridColumn: `span ${ANCHO_DE_LAS_BANDAS}`, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8,
        }}>
          <span data-testid={`rotulo-mensual-${fila.personaId}`} style={{ fontSize: '11px', color: V.apagado }}>{rotuloDelMensual(l) ?? 'mensual'}</span>
          <CeldaTarifa fila={fila} quincena={quincena} pct={pct} />
        </div>
      ) : (
        <>
          {/* TODO SE ESCRIBE EN LA ABIERTA (dueño, 14 y 15/09/2026): Hs recibo, $/h cat., Neto, Hs negro e Importe.
              Lo que no está escrito sigue derivado de lo que sí. */}
          <CeldaHorasBlanco fila={fila} edicion={{ quincena, camposEditables }} />
          <CeldaHoraCategoria fila={fila} edicion={{ quincena, camposEditables }} />
          <CeldaNeto fila={fila} edicion={{ quincena, camposEditables }} />
          <CeldaPagado campo="pagadoBanco" fila={fila} edicion={{ quincena, camposEditables }} />
          <CeldaSaldo fila={fila} lado="banco" />
          <CeldaHorasNegro fila={fila} edicion={{ quincena, camposEditables }} />
          <CeldaTarifa fila={fila} quincena={quincena} pct={pct} />
          <CeldaImporteNegro fila={fila} edicion={{ quincena, camposEditables }} />
          <CeldaPagado campo="pagadoEfectivo" fila={fila} edicion={{ quincena, camposEditables }} />
          <CeldaSaldo fila={fila} lado="efectivo" />
        </>
      )}
      <CeldaPresentismo fila={fila} />
      <CeldaTotal fila={fila} edicion={{ quincena, camposEditables }} />
      <CeldaPagadoTotal fila={fila} />
      <CeldaSaldo fila={fila} lado="total" />
    </div>
  )
}

/** La fila de total: suma las filas VISIBLES, columna por columna de plata. Cierra igual que cada fila. */
function Total({ columnas, dias, totales }: {
  columnas: string; dias: readonly string[]; totales: TotalesDelEspejo
}) {
  const cierre = cierreDeTotales(totales)
  const noCierra = cierre?.cierra === false
  return (
    <div data-testid="espejo-total" style={{
      ...filaGrid(columnas, ALTO_LIQ.filaAlta), borderBottom: 'none', borderTop: `1px solid ${V.grafito}`, fontWeight: 600,
    }}>
      <div style={COLUMNA_FIJA}>{totales.personas} persona{totales.personas === 1 ? '' : 's'}</div>
      {dias.map((f, i) => (
        <div key={f} style={{ textAlign: 'center', color: totales.porDia[i] == null ? V.tenue : V.tinta }}>
          {totales.porDia[i] == null ? '·' : nHoras(totales.porDia[i])}
        </div>
      ))}
      <Leida valor={totales.horasPagas} unidad="horas" testid="espejo-total-hs" />
      <div />
      <div />
      <Leida valor={totales.netoBandas} testid="espejo-total-neto" />
      <Leida valor={totales.pago.pagadoBanco} testid="espejo-total-pagado-banco" />
      <SaldoTotal valor={totales.pago.saldoBanco} testid="espejo-total-saldo-banco" />
      <div />
      <div />
      <Leida valor={totales.negro} testid="espejo-total-negro" />
      <Leida valor={totales.pago.pagadoEfectivo} testid="espejo-total-pagado-efectivo" />
      <SaldoTotal valor={totales.pago.saldoEfectivo} testid="espejo-total-saldo-efectivo" />
      {/* EL TOTAL DE LA COLUMNA ES LO PERDIDO, en ámbar: es lo que cambió la plata. Lo en juego va al pie. */}
      <div data-testid="espejo-total-presentismo" style={{ textAlign: 'right', whiteSpace: 'nowrap', color: totales.presentismoPerdido > 0 ? V.warn : V.tenue }}
        title={totales.presentismoPerdido > 0 ? `${totales.presentismoPerdidos} perdieron el presentismo` : 'nadie perdió el presentismo'}>
        {totales.presentismoPerdido > 0 ? `−${pesos(totales.presentismoPerdido)}` : '·'}
      </div>
      <div data-testid="espejo-total-cobra" style={{ textAlign: 'right', whiteSpace: 'nowrap', color: noCierra ? V.neg : V.tinta }}
        title={noCierra ? `No cierra por ${pesos(cierre?.diferencia ?? null)}` : undefined}>{pesos(totales.cobra)}</div>
      <Leida valor={totales.pago.pagado} testid="espejo-total-pagado" />
      <div data-testid="espejo-total-saldo"
        style={{ textAlign: 'right', fontSize: '14px', whiteSpace: 'nowrap', color: totales.pago.saldoTotal < 0 ? V.warn : V.tinta }}>{pesos(totales.pago.saldoTotal)}</div>
    </div>
  )
}

/** El total de una columna de saldo. Ámbar en negativo: ahí el cuadro pagó de más y hay que mirarlo. */
function SaldoTotal({ valor, testid }: { valor: number; testid: string }) {
  return (
    <div data-testid={testid} style={{ textAlign: 'right', whiteSpace: 'nowrap', color: valor < 0 ? V.warn : V.tinta }}
      title={valor < 0 ? 'pagado de más por este canal: se descuenta del otro' : undefined}>{pesos(valor)}</div>
  )
}

/**
 * EL PIE: los totales de cada columna de plata —lo que va al lote del banco, lo del negro, los sobres— y lo
 * que el total no pudo sumar. Recorta con el filtro, porque sale de los mismos totales.
 */
function PieDelEspejo({ totales, redondeo }: { totales: TotalesDelEspejo; redondeo: number }) {
  const cierre = cierreDeTotales(totales)
  const p = totales.pago
  const avisos: string[] = []
  if (cierre?.cierra === false) avisos.push(`el total no cierra por ${pesos(cierre.diferencia)}`)
  // LO QUE EL PIE NO PUDO SUMAR SE CUENTA, no se omite: un saldo que parece completo y le falta gente manda a
  // pagar de menos. Los sueldos mensuales quedan fuera del reparto banco/efectivo y por eso van aparte.
  if (p.sinSaldo > 0) avisos.push(`${p.sinSaldo} sin saldo: no se pudo afirmar cuánto falta`)
  if (totales.sinNeto > 0) avisos.push(`${totales.sinNeto} sin neto: sin recibo previo, no suman`)
  if (totales.sinTarifa > 0) avisos.push(`${totales.sinTarifa} sin retribución cargada (no suman a la plata)`)
  if (totales.estimados > 0) avisos.push(`${totales.estimados} con blanco estimado`)
  const cifra = (rotulo: string, valor: number | null, testid: string) => (
    <span data-testid={testid}><span style={{ color: V.apagado }}>{`${rotulo} `}</span><strong>{pesos(valor)}</strong></span>
  )
  return (
    <div data-testid="espejo-pie" style={{
      display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 16, rowGap: 4, padding: '12px 20px 16px',
      fontSize: '12.5px', fontVariantNumeric: 'tabular-nums',
    }}>
      {/* EL MISMO ORDEN QUE LAS COLUMNAS. BANCO + NEGRO + SUELDOS MENSUALES = TOTAL QUINCENA, exacto. */}
      {cifra('Banco', totales.netoBandas, 'pie-neto')}
      {cifra('Pagado banco', p.pagadoBanco, 'pie-pagado-banco')}
      {cifra('Saldo banco', p.saldoBanco, 'pie-saldo-banco')}
      {cifra('Negro', totales.negro, 'pie-negro')}
      {cifra('Pagado efectivo', p.pagadoEfectivo, 'pie-pagado-efectivo')}
      {cifra('Saldo efectivo', p.saldoEfectivo, 'pie-saldo-efectivo')}
      {totales.mensuales > 0 && cifra('Sueldos mensuales', totales.mensuales, 'pie-mensuales')}
      {/* PRESENTISMO: lo que está en juego en las filas visibles y lo que se perdió. Se dicen los dos porque el
          dueño decide con los dos: cuánto pesa la regla y cuánto costó esta quincena. */}
      {cifra('Presentismo en juego', totales.presentismoEnJuego, 'pie-presentismo')}
      {totales.presentismoPerdidos > 0 && (
        <span data-testid="pie-presentismo-perdido" style={{ color: V.warn }}>
          <span>{`Presentismo perdido (${totales.presentismoPerdidos}) `}</span><strong>{`−${pesos(totales.presentismoPerdido)}`}</strong>
        </span>
      )}
      {cifra('Efectivo redondeado', redondeo > 0 ? redondeo : null, 'pie-redondeo')}
      {cifra('Total', totales.cobra, 'pie-total')}
      {cifra('Pagado', p.pagado, 'pie-pagado')}
      {cifra('Saldo', p.saldoTotal, 'pie-saldo')}
      {/* LA LÍNEA QUE CONTESTA LA PREGUNTA DEL DÍA DE PAGO: con la caja en la mano, cuánto sale por cada canal.
          El exceso de un lado ya está descontado del otro, así que estas dos SUMAN el saldo y no más. */}
      <span data-testid="pie-a-pagar" style={{ fontWeight: 600 }}>
        <span style={{ color: V.apagado }}>A pagar hoy: </span>
        {`efectivo ${pesos(p.aPagarEfectivo)} · banco ${pesos(p.aPagarBanco)}`}
      </span>
      {avisos.length > 0 && (
        <span style={{ fontSize: '11.5px', color: cierre?.cierra === false ? V.neg : V.apagado }}>{avisos.join(' · ')}</span>
      )}
    </div>
  )
}
