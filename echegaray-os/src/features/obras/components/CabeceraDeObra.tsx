// LA CABECERA DE LA OBRA — UNA SOLA, PARA TODAS LAS PANTALLAS DE LA OBRA.
//
// ═══ PORTE LITERAL DEL DISEÑO «ERP Obras» (dueño, 23/09/2026) ═══
//
// Escritorio (04 · 04b · 03 · Z01 · C01), medido en `/home/jorge/echegaray-design/erp-obras/`:
//
//   bloque       `padding:18px 30px 0` (22px arriba en el Resumen) · fondo blanco
//   miga         12,5px `#6B6B67` con la casita de obra (12px) y «Obras /»
//   título       17px/600 `letterSpacing:-.01em` · 21px en el Resumen (03, Z01)
//   pastilla     11,5px, radio 12, `padding:2px 10px` (Z01: «Terminada» en `#067647`)
//   identidad    12px `#3A3A38` con íconos de 13 · separador «·» en `#D7D5CF` · fechas en mono
//   cifras       eyebrow mono 10,5/.06em/faint + 19px/600 (04b «Avance de obra 13,39%»)
//   solapas      12,5px `padding:10px 12px`, activa 500 con `inset 0 -2px 0 #30302F`, línea abajo
//
// Teléfono (M04 · M05 · M06 · MZ1, 390px):
//
//   bloque       `padding:10px 16px 0`, línea abajo
//   miga         11,5px faint: «‹ Obras / OB-0011» (el código; sin código, el nombre)
//   título       17px/600 + estado en texto de 11px (Terminada: pastilla con borde, radio 10)
//   identidad    12px con íconos de 12
//   cifras       una línea de 12px con ícono (M06 «Avance ponderado 86%»)
//   solapas      12,5px `padding:8px 8px` en banda corrible (`margin-right:-16px`), activa 600
//
// Las dos versiones se dibujan en el MISMO componente con `hidden md:block` / `md:hidden`: no hay
// una página del teléfono y otra del escritorio, hay una página y dos anchos.
//
// ═══ POR QUÉ RECIBE LA OBRA YA LEÍDA ═══
//
// No consulta nada salvo el código interno. Las páginas ya leen `obra_panel` para lo suyo; una
// lectura propia acá sería una consulta más por visita para repetir un dato que la página tiene en
// la mano — y el día que las dos lecturas discrepen, el título diría una cosa y el cuerpo otra.

import { RotuloEstable } from './RotuloEstable'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { C, MONO } from './canon/tokens'
import { Ico, P } from './canon/Ico'
import { fechaCorta } from './formato'
import type { ObraPanel } from '../types'
import { VISTAS_OBRA, type VistaObra } from '../services/vistasObra'
import { createClient } from '@/lib/supabase/server'
import { codigosDeObra } from '@/shared/services/codigosDeObra'
import { rotuloDeObra } from '@/shared/utils/obra'
import { clienteDeObra } from '../../../shared/clientes/nombre.ts'

/** Lo único que la cabecera necesita de la obra. Un `Pick` y no `ObraPanel` entero: así se ve de un
 *  vistazo qué la rompe si un día la vista cambia, y una página puede armarlo sin traer las 40
 *  columnas del panel. */
export type ObraDeCabecera = Pick<
  ObraPanel,
  'nombre' | 'estado' | 'etapa' | 'cliente_slug' | 'cliente_nombre' | 'cliente_texto'
  | 'fecha_inicio_plan' | 'fecha_fin_plan'
> & Partial<Pick<ObraPanel, 'jefe_obra' | 'fecha_fin_real'>>

/**
 * Una cifra que contesta la pregunta de ESTA pantalla, no de la obra (04b: «Avance de obra»,
 * «Costo teórico», «Día hábil»).
 *
 * `valor: null` NO se dibuja como 0 ni como un guión: se dibuja con la palabra de `falta` («sin
 * estructura», «sin inicio real»), porque «no lo sé» y «es cero» son dos hechos distintos.
 */
export type KpiPantalla = {
  rotulo: string
  valor: ReactNode | null
  falta?: string
  /** El color de la cifra cuando dice un problema (Plazo «+16 d» en warn). */
  tono?: 'ink' | 'warn' | 'neg' | 'pos'
}

/**
 * Una cifra EN LÍNEA: rótulo y valor en mono, del tamaño del texto de identidad (12px).
 *
 * Es la segunda forma de cifra del diseño y no la misma que `KpiPantalla`: C06 la dibuja en el
 * escritorio («Plazo: 24/08 → 22/09 · Días hábiles: 21 · Con fechas: 14 de 17 · Línea base: sin
 * sellar») y M09/M11 en el teléfono («Paquetes 3 · Sin poder iniciar 1 · Terceros 7»). `valor: null`
 * se escribe con la palabra de `falta`, en itálica tenue, nunca como 0.
 */
export type CifraEnLinea = {
  rotulo: string
  valor: ReactNode | null
  falta?: string
  /** `neg` cuando la cifra es un problema real (M09 «Sin poder iniciar 1» en rojo). */
  tono?: 'ink' | 'warn' | 'neg' | 'pos'
  /** C06 «Línea base: sin sellar»: el valor mismo es una ausencia y va en itálica tenue. */
  italica?: boolean
}

/** Los estados que la ficha conoce, con su rótulo y su color. El cierre es uno solo y se lee «Archivada», igual que en la cartera (dueño 23/09). */
export const ESTADOS_TERMINADA: readonly string[] = ['cerrada', 'terminada', 'archivada']

export function pastillaDeEstado(estado: string): { t: string; tono: 'pos' | 'curso' | 'neutro' } {
  if (ESTADOS_TERMINADA.includes(estado)) return { t: 'Archivada', tono: 'pos' }
  if (estado === 'activa') return { t: 'En ejecución', tono: 'curso' }
  if (estado === 'pausada') return { t: 'Pausada', tono: 'neutro' }
  // UN ESTADO QUE ESTA PANTALLA NO CONOCE SE MUESTRA COMO VINO: un default de «en ejecución»
  // afirmaría que la obra está trabajando sin que nadie lo haya dicho.
  return { t: estado, tono: 'neutro' }
}

const COLOR_ESTADO = { pos: C.pos, curso: C.curso, neutro: C.tintaSuave } as const
const COLOR_CIFRA = { ink: C.tinta, warn: C.warn, neg: C.neg, pos: C.pos } as const

/** El separador «·» tenue que el diseño pone entre los campos de la línea de identidad. */
function Punto() {
  return <span style={{ color: C.bordeFuerte }} aria-hidden>·</span>
}

/** La pastilla de estado del escritorio (Z01: 11,5px, borde `#E7E6E2`, radio 12). */
function PastillaEstado({ t, tono, radio }: { t: string; tono: 'pos' | 'curso' | 'neutro'; radio: 12 | 10 }) {
  return (
    <span data-testid="cabecera-obra" style={{
      fontSize: radio === 12 ? '11.5px' : '11px', color: COLOR_ESTADO[tono],
      border: `1px solid ${C.borde}`, borderRadius: `${radio}px`,
      padding: radio === 12 ? '2px 10px' : '1px 8px', whiteSpace: 'nowrap', lineHeight: 1.4,
    }}>{t}</span>
  )
}

export async function CabeceraDeObra({
  obraId, obra, vistaActiva, pantalla, kpis = [], acciones, alFinalDeLasSolapas, economiaHref = null, enlazarCliente = false,
  volverA = '/obras', volverLabel = 'Obras', accionTelefono, lineaDeCifras = [], cifrasTelefono = [],
}: {
  obraId: string
  obra: ObraDeCabecera
  /** A dónde vuelve la miga. Por defecto a la cartera («Obras /»). */
  volverA?: string
  volverLabel?: ReactNode
  /** La solapa de nivel 2 a la que pertenece esta pantalla. El contrato la marca activa aunque la
   *  URL no sea la del workspace: Cronograma y Subcontratos SON Trabajo, Dotación ES Personal. */
  vistaActiva?: VistaObra
  /** Cómo se llama esta pantalla dentro de la obra, cuando no la nombra la solapa activa (las
   *  hijas: «Dotación y proyección», «Avance masivo»). Va en la línea de cifras. */
  pantalla?: ReactNode
  /** La línea de cifras de ESTA pantalla (04b). Vacía, no se dibuja. */
  kpis?: KpiPantalla[]
  /** ESCRITORIO (C06): cifras en línea debajo de la identidad, «Rótulo: valor». Vacía, no se dibuja. */
  lineaDeCifras?: CifraEnLinea[]
  /** TELÉFONO (M09 · M11): «Rótulo valor» en mono, después del nombre de la pantalla. Vacía, no se
   *  dibuja. Va aparte de `kpis` porque el 07 de escritorio NO dibuja estos contadores. */
  cifrasTelefono?: CifraEnLinea[]
  /** Lo que se puede hacer desde acá, en el escritorio. Lo pone cada página. */
  acciones?: ReactNode
  /** Lo que va a la derecha de las solapas, sin ser una. */
  alFinalDeLasSolapas?: ReactNode
  /** «Economía»: la ÚLTIMA solapa del mismo renglón y con el mismo estilo, SÓLO para Administración
   *  (dueño 25/09). `null` = no se dibuja (jefe de obra, operario). */
  economiaHref?: string | null
  /** Clientes es sólo de Administración (dueño, 24/09/2026): el nombre del cliente enlaza a su ficha
   *  sólo para quien la puede abrir. Falla cerrado. */
  enlazarCliente?: boolean
  /** Obsoleto: el título mide 21 en todas las solapas (dueño 23/09 y 25/09). Se acepta y se ignora. */
  titulo?: 17 | 21
  /** La primaria del teléfono va al pie de la pantalla, no acá: la cabecera no la dibuja. Este
   *  nodo existe para las hijas que quieran algo chico a la derecha del título en 390. */
  accionTelefono?: ReactNode
}) {
  const est = pastillaDeEstado(obra.estado)
  const terminada = ESTADOS_TERMINADA.includes(obra.estado)
  // EL CLIENTE ES UN LINK cuando existe en el eje canónico. Cuando la obra sólo tiene el nombre
  // escrito a mano, se muestra el texto y se dice que falta vincularlo: la ficha no se inventa.
  const cliente = enlazarCliente && obra.cliente_slug && obra.cliente_nombre ? (
    <Link href={`/clientes/${obra.cliente_slug}`} prefetch={false} className="max-md:-my-[13px] max-md:py-[13px]" style={{ color: C.tintaMedia }}>
      {obra.cliente_nombre}
    </Link>
  ) : clienteDeObra(obra)
  // EL PLAZO ES UN SOLO CAMPO, NO DOS («14/04 → 05/09»). Cuando falta UNA de las dos NO se dibuja
  // media flecha: se nombra cuál falta, porque «empieza el 14/04 y no sé cuándo termina» es un
  // hecho distinto de «no tiene plan».
  const desde = obra.fecha_inicio_plan ? fechaCorta(obra.fecha_inicio_plan) : null
  const hasta = obra.fecha_fin_plan ? fechaCorta(obra.fecha_fin_plan) : null
  const plazo = desde && hasta ? `${desde} → ${hasta}` : null
  const faltaPlazo = desde ? 'sin fecha de fin' : hasta ? 'sin fecha de inicio' : 'sin fechas de plan'
  // Z01: «14/04 → 05/09 · terminó 14/09». Sólo con fin real; una obra terminada sin fin real lo dice.
  const termino = terminada
    ? (obra.fecha_fin_real ? ` · terminó ${fechaCorta(obra.fecha_fin_real)}` : ' · sin fin real')
    : ''
  // EL CÓDIGO INTERNO LO LEE LA CABECERA, no cada pantalla: son cinco páginas de obra y una sola
  // banda. Si la lectura falla, la banda muestra el nombre solo.
  const codigo = (await codigosDeObra(await createClient(), [obraId])).get(obraId) ?? null
  // EL RÓTULO ÚNICO «OB-0008 · NOMBRE» (dueño 14/09) se lee partido como en el diseño 03/M04: el código
  // en la miga, el nombre en el título. El rótulo entero queda como nombre accesible del título.
  const rotulo = rotuloDeObra({ nombre: obra.nombre, codigo })

  const responsable = obra.jefe_obra ? (
    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
      <Ico d={P.persona} s={12} />{obra.jefe_obra}
    </span>
  ) : (
    <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: C.tenue, fontStyle: 'italic' }} data-nulo="">
      <Ico d={P.persona} s={12} />sin responsable
    </span>
  )
  const clienteNodo = cliente != null && (
    <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
      <Ico d={P.cliente} s={12} />{cliente}
      {!obra.cliente_slug && obra.cliente_texto && (
        <span style={{ color: C.tenue }}>· sin ficha de cliente vinculada</span>
      )}
    </span>
  )

  // 03 · ESCRITORIO: una línea chica arriba del título — «Obras / OB-0011 · ARCOR · R. Quiroga». La
  // etapa y las fechas viven en «La obra» del Resumen; la cabecera no las repite (dueño 25/09).
  const identidadEscritorio = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', color: C.tintaSuave, flexWrap: 'wrap',
    }} data-testid="cabecera-obra-meta">
      <Link href={volverA} prefetch={false} style={{ color: C.tintaSuave, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <Ico d={P.obra} s={12} />{volverLabel} <span style={{ color: C.bordeFuerte }}>/</span> {codigo ?? obra.nombre}
      </Link>
      {cliente != null && <><Punto />{clienteNodo}</>}
      <Punto />{responsable}
    </div>
  )

  // M04 · TELÉFONO: «ARCOR · 14/04 → 05/09 · R. Quiroga».
  const identidadTelefono = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: C.tintaMedia, flexWrap: 'wrap',
    }} data-testid="cabecera-obra-meta-telefono">
      {cliente != null && <>{clienteNodo}<Punto /></>}
      {plazo
        ? <span style={{ fontFamily: MONO }}>{plazo}{termino}</span>
        : <span style={{ color: C.tenue, fontStyle: 'italic' }} data-nulo="">{faltaPlazo}{termino}</span>}
      <Punto />{responsable}
    </div>
  )

  const solapas = (telefono: boolean) => (
    <nav style={{
      display: 'flex', alignItems: 'stretch',
      ...(telefono
        ? { marginTop: '6px', overflowX: 'auto', marginRight: '-16px', scrollbarWidth: 'none' }
        : { borderBottom: `1px solid ${C.borde}` }),
    }} data-testid={telefono ? 'tabs-obra-telefono' : 'tabs-obra'}>
      {VISTAS_OBRA.map((v) => {
        const activo = vistaActiva === v.id
        return (
          <Link key={v.id} href={`/obras/${obraId}?vista=${v.id}`} prefetch={false}
            data-testid={telefono ? `tab-telefono-${v.id}` : `tab-${v.id}`}
            aria-current={activo ? 'page' : undefined}
            style={{
              fontSize: '12.5px', padding: telefono ? '8px 8px' : '10px 12px', whiteSpace: 'nowrap',
              color: activo ? C.tinta : C.tintaSuave,
              fontWeight: activo ? (telefono ? 600 : 500) : 400,
              boxShadow: activo ? `inset 0 -2px 0 ${C.grafito}` : 'none',
              ...(telefono ? { minHeight: '44px', display: 'inline-flex', alignItems: 'center' } : {}),
            }}><RotuloEstable texto={v.label} peso={telefono ? 600 : 500} /></Link>
        )
      })}
      {/* «ECONOMÍA», LA ÚLTIMA SOLAPA DEL RENGLÓN, con el mismo estilo que las demás y sólo para
          Administración (dueño 25/09). No es una vista de la ficha: abre la pantalla de Administración. */}
      {economiaHref && (
        <Link href={economiaHref} prefetch={false} data-testid={telefono ? 'tab-telefono-economia' : 'enlace-economia'}
          style={{
            fontSize: '12.5px', padding: telefono ? '8px 8px' : '10px 12px', whiteSpace: 'nowrap', color: C.tintaSuave, fontWeight: 400,
            ...(telefono ? { minHeight: '44px', display: 'inline-flex', alignItems: 'center' } : {}),
          }}>Economía</Link>
      )}
      {alFinalDeLasSolapas}
    </nav>
  )

  return (
    <>
      {/* ═══ ESCRITORIO — 03 para TODAS las solapas (dueño 25/09: cabecera idéntica) ═══
          línea chica «Obras / código · cliente · responsable» · título 21/600 con el NOMBRE y su estado ·
          a la derecha, las cifras de la pantalla (B02: «Ítems 16 · 4 rubros») y sus acciones. */}
      <div className="hidden md:block" style={{
        background: C.superficie, padding: '22px 30px 0', flexShrink: 0,
      }} data-testid="cabecera-obra-banda">
        {identidadEscritorio}
        {/* LA FILA DEL TÍTULO MIDE LO MISMO CON O SIN BOTÓN (32px): Equipos, Compras y Pedidos no dibujan
            primaria, y sin este piso el título subía 4px al pasar de Impedimentos a Equipos. */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap', minHeight: '32px', marginTop: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '11px', minWidth: 0, flexWrap: 'wrap' }}>
            <h1 title={rotulo} style={{
              fontSize: '21px', fontWeight: 600, color: C.tinta, margin: 0, lineHeight: 1.3, letterSpacing: '-.015em',
            }}>{obra.nombre}</h1>
            <PastillaEstado t={est.t} tono={est.tono} radio={12} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '28px', flexWrap: 'wrap', marginLeft: 'auto' }}>
            {lineaDeCifras.length > 0 && (
              <div style={{ display: 'flex', gap: '22px', fontSize: '12px', alignItems: 'baseline', flexWrap: 'wrap', color: C.tintaSuave }}
                data-testid="linea-de-cifras">
                {lineaDeCifras.map((k) => (
                  <span key={k.rotulo} style={{ display: 'inline-flex', gap: '5px', alignItems: 'baseline' }}>
                    <span>{k.rotulo}</span>
                    {k.valor == null || k.valor === ''
                      ? <span style={{ color: C.tenue, fontStyle: 'italic' }} data-nulo="">{k.falta ?? 'sin dato'}</span>
                      : k.italica
                        ? <span style={{ color: C.tenue, fontStyle: 'italic' }}>{k.valor}</span>
                        : <span style={{ fontFamily: MONO, fontWeight: 500, color: k.tono && k.tono !== 'ink' ? COLOR_CIFRA[k.tono] : C.tinta }}>{k.valor}</span>}
                  </span>
                ))}
              </div>
            )}
            {kpis.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '34px', flexWrap: 'wrap' }} data-testid="kpis-obra">
                {kpis.map((k) => (
                  <div key={k.rotulo} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    <div style={{
                      fontFamily: MONO, fontSize: '10.5px', letterSpacing: '.06em', color: C.tenue,
                      textTransform: 'uppercase',
                    }}>{k.rotulo}</div>
                    {k.valor == null || k.valor === ''
                      ? <div style={{ fontSize: '13px', color: C.tenue, fontStyle: 'italic' }} data-nulo="">{k.falta ?? 'sin dato'}</div>
                      : <div style={{
                        fontSize: '19px', fontWeight: 600, letterSpacing: '-.01em',
                        color: COLOR_CIFRA[k.tono ?? 'ink'], fontVariantNumeric: 'tabular-nums',
                      }}>{k.valor}</div>}
                  </div>
                ))}
              </div>
            )}
            {acciones != null && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>{acciones}</div>
            )}
          </div>
        </div>

        {pantalla != null && (
          <div style={{ fontSize: '12px', fontWeight: 500, color: C.tinta, marginTop: '3px' }}>{pantalla}</div>
        )}

        <div style={{ marginTop: '12px' }}>{solapas(false)}</div>
      </div>

      {/* ═══ TELÉFONO (M04 · M05 · M06 · MZ1) ═══ */}
      <div className="md:hidden" style={{
        background: C.superficie, padding: '10px 16px 0', borderBottom: `1px solid ${C.borde}`, flexShrink: 0,
      }} data-testid="cabecera-obra-banda-telefono">
        {/* 44 de área con relleno invisible: la miga no se mueve (auditoría por nivel, 25/09/2026). */}
        <Link href={volverA} prefetch={false} className="-my-[14px] py-[14px]" style={{
          fontSize: '11.5px', color: C.tenue, display: 'flex', alignItems: 'center', gap: '3px',
        }}>
          <Ico d={P.izquierda} s={11} />{volverLabel} <span style={{ color: C.bordeFuerte }}>/</span> {codigo ?? obra.nombre}
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px', minWidth: 0 }}>
          <div style={{
            fontSize: '17px', fontWeight: 600, letterSpacing: '-.01em', color: C.tinta, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{obra.nombre}</div>
          {terminada
            ? <PastillaEstado t={est.t} tono={est.tono} radio={10} />
            : <span style={{ fontSize: '11px', color: COLOR_ESTADO[est.tono], whiteSpace: 'nowrap' }}
              data-testid="cabecera-obra-telefono">{est.t}</span>}
          {accionTelefono != null && <span style={{ marginLeft: 'auto' }}>{accionTelefono}</span>}
        </div>
        <div style={{ marginTop: '4px' }}>{identidadTelefono}</div>
        {(kpis.length > 0 || cifrasTelefono.length > 0 || pantalla != null) && (
          <div style={{
            marginTop: '5px', fontSize: '12px', color: C.tintaMedia, display: 'flex', gap: '12px', flexWrap: 'wrap',
          }} data-testid="kpis-obra-telefono">
            {pantalla != null && <span style={{ fontWeight: 500, color: C.tinta }}>{pantalla}</span>}
            {/* M09/M11: «Paquetes 3» — rótulo en texto, valor en mono; rojo sólo un problema real. */}
            {cifrasTelefono.map((k) => (
              <span key={k.rotulo} style={{ display: 'inline-flex', gap: '5px', alignItems: 'baseline' }} data-testid={`cifra-telefono-${k.rotulo}`}>
                <span>{k.rotulo}</span>
                {k.valor == null || k.valor === ''
                  ? <span style={{ color: C.tenue, fontStyle: 'italic' }} data-nulo="">{k.falta ?? 'sin dato'}</span>
                  : <span style={{ fontFamily: MONO, color: k.tono && k.tono !== 'ink' ? COLOR_CIFRA[k.tono] : C.tintaMedia }}>{k.valor}</span>}
              </span>
            ))}
            {kpis.map((k) => (
              <span key={k.rotulo} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                <Ico d={P.avance} s={12} />{k.rotulo}{' '}
                {k.valor == null || k.valor === ''
                  ? <span style={{ color: C.tenue, fontStyle: 'italic' }} data-nulo="">{k.falta ?? 'sin dato'}</span>
                  : <b style={{ fontWeight: 600, color: COLOR_CIFRA[k.tono ?? 'ink'] }}>{k.valor}</b>}
              </span>
            ))}
          </div>
        )}
        {solapas(true)}
      </div>
    </>
  )
}
