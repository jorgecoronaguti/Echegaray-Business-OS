// EL VOCABULARIO DE UNA PANTALLA DE SEGUNDO NIVEL v2 — migas · título · cifras · solapas · costado.
//
// ═══ POR QUÉ ESTO NO ES `CabeceraSeccion` ═══
//
// `CabeceraSeccion` dibuja una SECCIÓN del área: no tiene encabezado de página porque su nombre ya
// está en la barra de Administración, y por eso arranca directo en el nivel 3 con el buscador al
// lado. Una pantalla de segundo nivel es lo contrario: nadie sabe dónde está parado hasta que lo
// lee, así que abre con la miga («← Proveedores / Hierros del Centro») y con el nombre de la
// entidad a 24px. Son dos anatomías distintas y compartirlas obligaría a una a fingir la otra.
//
// Cinco mockups declaran la MISMA anatomía carácter por carácter —`21v2:48-68`, `23v2:48-108`,
// `26v2:50-95`, `20v2:48-96`, `Uv2:49-76`—, y por eso vive acá y no copiada cinco veces: el día que
// el padding de la miga cambie, cambia en las cinco o en ninguna.
//
// Los valores salieron de LEER los `style=""` inline del `.dc.html`, donde el atributo ES el valor
// computado. Cada uno cita su línea.

import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { SelloDatoBueno } from '@/shared/components/estado/SelloDatoBueno'
import { V } from './patron'

/** El chevron de la miga y el de volver. 15px, el mismo trazo del §11. `23v2:50`. */
function Chevron({ className }: { className?: string }) {
  return (
    <svg
      className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden
    >
      <path d="M15 6l-6 6 6 6" />
    </svg>
  )
}

/**
 * LA MIGA ES UN SOLO ENLACE, NO DOS.
 *
 * El chevron y el nombre del padre llevan al mismo lado (`23v2:49-53`): partirlos en dos anclas
 * distintas duplica el destino en el árbol de accesibilidad y deja un blanco de 9px entre ellos que
 * no navega. El nombre del hijo NO es enlace: ya estás ahí.
 */
export function Migas({ volverA, padre, actual, testid = 'migas' }: {
  volverA: string
  padre: string
  actual: string
  testid?: string
}) {
  return (
    <nav
      aria-label="Ruta" data-testid={testid}
      style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '14px 20px 0' }}
    >
      <Link
        href={volverA} prefetch={false} data-testid="volver"
        className="flex items-center gap-[9px] hover:text-[#1F1F1E]"
        style={{ color: V.tenue }}
      >
        <Chevron className="h-[15px] w-[15px] shrink-0" />
        <span style={{ fontSize: '12.5px', color: V.apagado }}>{padre}</span>
      </Link>
      <span style={{ fontSize: '12.5px', color: V.cuentaApagada }}>/</span>
      <span
        style={{ fontSize: '12.5px', color: V.tinta, fontWeight: 500, minWidth: 0 }}
        className="truncate"
      >
        {actual}
      </span>
    </nav>
  )
}

/** La acción amarilla. UNA por pantalla — el resto son secundarias o texto. `21v2:63`. */
export function AccionPrimaria({ href, children, icono, testid }: {
  href: string
  children: ReactNode
  icono?: ReactNode
  testid?: string
}) {
  return (
    <Link
      href={href} data-testid={testid} className="hover:bg-[#EEBE00]"
      style={{
        display: 'flex', alignItems: 'center', gap: 7, background: V.marca, color: V.tinta,
        fontSize: '12.5px', fontWeight: 600, borderRadius: 6, padding: '7px 12px', whiteSpace: 'nowrap',
      }}
    >
      {icono}
      {children}
    </Link>
  )
}

/** La acción de contorno: blanca con filo, nunca amarilla. `23v2:68`. */
export function AccionSecundaria({ href, children, icono, testid }: {
  href: string
  children: ReactNode
  icono?: ReactNode
  testid?: string
}) {
  return (
    <Link
      href={href} data-testid={testid} className="hover:border-[#D7D5CF]"
      style={{
        display: 'flex', alignItems: 'center', gap: 7, border: `1px solid ${V.linea}`,
        background: '#FFFFFF', color: V.tinta, fontSize: '12.5px', fontWeight: 500,
        borderRadius: 6, padding: '7px 12px', whiteSpace: 'nowrap',
      }}
    >
      {icono}
      {children}
    </Link>
  )
}

/** La acción que es sólo texto: sin caja, sin filo, sin color. `23v2:72`. */
export function AccionTerciaria({ href, children, testid }: {
  href: string
  children: ReactNode
  testid?: string
}) {
  return (
    <Link
      href={href} data-testid={testid} className="hover:text-[#1F1F1E]"
      style={{ fontSize: '12.5px', color: V.apagado, padding: '7px 6px', whiteSpace: 'nowrap' }}
    >
      {children}
    </Link>
  )
}

/**
 * EL NOMBRE DE LA ENTIDAD A 24px, LO QUE LA IDENTIFICA DEBAJO, Y LAS ACCIONES A LA DERECHA.
 *
 * `bajada` es lo que identifica —el CUIT del proveedor, el DNI de la persona— o lo que la pantalla
 * abarca. Va en mono cuando es un identificador: un CUIT y un DNI se comparan dígito a dígito.
 */
export function TituloDeFicha({ titulo, bajada, mono, tonoBajada, acciones, junto, testid = 'titulo-ficha' }: {
  titulo: string
  bajada?: ReactNode
  mono?: boolean
  /** El ámbar de «este identificador falta». Por defecto, gris de metadato. */
  tonoBajada?: string
  acciones?: ReactNode
  /** Lo que va PEGADO al título en la misma línea de base: una pastilla de tipo, un estado. */
  junto?: ReactNode
  testid?: string
}) {
  return (
    <div
      data-testid={testid}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 20, padding: '12px 20px 0' }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 11, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 600, color: V.tinta, letterSpacing: '-.015em', lineHeight: 1.15 }}>
            {titulo}
          </h1>
          {junto}
        </div>
        {bajada != null && (
          <div
            className={mono ? 'font-mono' : undefined}
            style={{ fontSize: '12.5px', color: tonoBajada ?? V.apagado, marginTop: mono ? 5 : 4 }}
          >
            {bajada}
          </div>
        )}
      </div>
      {acciones && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{acciones}</div>
      )}
    </div>
  )
}

/** Una pastilla de hecho: contorno, sin fondo, sin color de estado. `23v2:62`. */
export function PastillaFilo({ children, title, testid }: {
  children: ReactNode
  title?: string
  testid?: string
}) {
  return (
    <span
      title={title} data-testid={testid}
      style={{
        fontSize: '11px', color: V.apagado, border: `1px solid ${V.linea}`,
        borderRadius: 5, padding: '2px 7px', whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

/** El triángulo de «esto bloquea». Mismo trazo que el §11. */
function Alerta({ className }: { className?: string }) {
  return (
    <svg
      className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden
    >
      <path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17.5v.01" />
    </svg>
  )
}

/**
 * LO QUE BLOQUEA A ESTA ENTIDAD, ARRIBA DE TODO Y CON SU VERBO. `23v2:75-83`.
 *
 * Es el criterio 2 del patrón aplicado a una ficha: no un chip que dice «incompleto», sino la frase
 * que nombra la consecuencia («Sin CUIT no se puede registrar la factura») y el verbo que la
 * resuelve. Sin `href` la fila informa y no promete nada — un verbo que no lleva a ningún lado
 * enseña a no hacer clic en el de al lado.
 */
export function AvisoDeFicha({ children, verbo, href, tono = 'warn', testid = 'aviso-ficha' }: {
  children: ReactNode
  verbo?: string
  href?: string
  tono?: 'warn' | 'neg'
  testid?: string
}) {
  const color = tono === 'neg' ? V.neg : V.warn
  const estilo: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 9, margin: '14px 20px 0',
    borderTop: `1px solid ${V.lineaFila}`, borderBottom: `1px solid ${V.lineaFila}`,
    padding: '10px 0 10px 13px', boxShadow: `inset 2px 0 0 ${color}`,
  }
  const cuerpo = (
    <>
      <span style={{ display: 'flex', color, flexShrink: 0 }}><Alerta className="h-[15px] w-[15px]" /></span>
      <span style={{ fontSize: '12.5px', color: V.tintaSuave, flex: 1, minWidth: 0 }}>{children}</span>
      {verbo && (
        <span style={{ fontSize: '12.5px', fontWeight: 600, color: V.tinta, flexShrink: 0, paddingRight: 2 }}>
          {verbo} →
        </span>
      )}
    </>
  )
  return href
    ? <Link href={href} data-testid={testid} style={estilo} className="hover:bg-[#F2F1ED]">{cuerpo}</Link>
    : <div data-testid={testid} style={estilo}>{cuerpo}</div>
}

/** Una cifra de la tira: rótulo en versalitas y el número a 19px mono. `23v2:88-92`. */
export interface CifraDeFicha {
  rotulo: string
  /** `null` = no se pudo o no hay. Se escribe `falta`, nunca 0. */
  valor: string | number | null
  falta?: string
  tono?: 'warn' | 'neg' | 'pos'
}

const TONO_CIFRA = { warn: V.warn, neg: V.neg, pos: '#067647' } as const

/**
 * LA TIRA DE CIFRAS, SIN TARJETAS. `23v2:87-94`.
 *
 * Cuatro números en línea separados por 34px de aire: la jerarquía la dan el tamaño y el espacio, no
 * cuatro cajas con borde. Un valor ausente se escribe con su motivo y en gris —«sin comprobantes»,
 * «nunca»— porque un 0 en esta tira afirma que se midió y dio cero.
 */
export function CifrasDeFicha({ cifras, testid = 'cifras-ficha' }: {
  cifras: CifraDeFicha[]
  testid?: string
}) {
  return (
    <div
      data-testid={testid}
      style={{
        display: 'flex', alignItems: 'baseline', gap: 34, padding: '20px 20px 0',
        flexWrap: 'wrap', rowGap: 14,
      }}
    >
      {cifras.map((c) => (
        <div key={c.rotulo} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span
            style={{
              fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.06em',
              color: V.tenue, whiteSpace: 'nowrap',
            }}
          >
            {c.rotulo}
          </span>
          <span
            className="font-mono tabular-nums"
            data-testid={`cifra-${c.rotulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
            style={{
              fontSize: c.valor === null ? '13px' : '19px', fontWeight: 600,
              color: c.valor === null ? V.tenue : (c.tono ? TONO_CIFRA[c.tono] : V.tinta),
              letterSpacing: '-.01em',
            }}
          >
            {c.valor === null ? (c.falta ?? 'sin dato') : c.valor}
          </span>
        </div>
      ))}
    </div>
  )
}

export interface SolapaDeFicha {
  clave: string
  titulo: string
  /**
   * Lo que la solapa cuenta o mide. `null` = no se pudo, y entonces NO se escribe: un 0 ahí diría
   * que se midió y dio cero. Admite texto porque la banda de período de la 21 mide horas, no filas
   * («1.158 HH»), y partirlo en número y unidad dejaría dos props que siempre viajan juntas.
   */
  cuenta?: number | string | null
  activa: boolean
  href: string
}

/**
 * LAS SOLAPAS DE UNA FICHA. `23v2:95-105`.
 *
 * 13px, subrayado amarillo en la activa —selección, que es uno de los tres usos permitidos del
 * amarillo— y un filo gris que cruza la pantalla entera por debajo. `linea={false}` para la banda de
 * período de la 21, donde el subrayado es grafito y no hay filo de cierre (`21v2:85-93`).
 */
export function SolapasDeFicha({ solapas, linea = true, grafito = false, derecha, testid = 'solapas' }: {
  solapas: SolapaDeFicha[]
  linea?: boolean
  grafito?: boolean
  /** Lo que va contra el margen derecho de la banda: el pie de la 21 (`21v2:92`). */
  derecha?: ReactNode
  testid?: string
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'stretch', padding: linea ? '22px 20px 0' : '24px 20px 0',
        borderBottom: linea ? `1px solid ${V.linea}` : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'stretch', gap: linea ? 2 : 18, flexWrap: 'wrap' }} data-testid={testid}>
        {solapas.map((s) => (
          <Link
            key={s.clave} href={s.href} prefetch={false} data-testid={`solapa-${s.clave}`}
            aria-current={s.activa ? 'page' : undefined}
            className="hover:text-[#1F1F1E]"
            style={{
              display: 'flex', alignItems: 'baseline', gap: 6,
              fontSize: linea ? '13px' : '15px',
              padding: linea ? '8px 11px' : '0 0 6px',
              color: s.activa ? V.tinta : V.apagado,
              fontWeight: s.activa ? 600 : (linea ? 400 : 500),
              boxShadow: s.activa ? `inset 0 -2px 0 ${grafito ? V.grafito : V.marca}` : 'none',
              whiteSpace: 'nowrap',
            }}
          >
            {s.titulo}
            {s.cuenta != null && (
              <span
                className="font-mono tabular-nums"
                style={{ fontSize: linea ? '10.5px' : '11.5px', color: s.activa ? V.tenue : V.cuentaApagada }}
              >
                {s.cuenta}
              </span>
            )}
          </Link>
        ))}
      </div>
      {derecha && (
        <div style={{ marginLeft: 'auto', fontSize: '11.5px', color: V.tenue, alignSelf: 'center' }}>
          {derecha}
        </div>
      )}
    </div>
  )
}

/**
 * EL COSTADO DE UNA FICHA: 300px, filo izquierdo y nada más. `23v2:174`, `21v2:140`.
 *
 * Es 300 y no los 372 del `PanelFilo` de una sección: aquél es un panel que se abre y se cierra
 * sobre una lista, éste es una columna fija que acompaña. `box-content` porque el mockup corre con
 * el `content-box` por defecto de CSS —ver la nota de `CAJA_CONTENIDO`—: con el `border-box` del
 * preflight de Tailwind, los 24 de sangría y el filo se comerían el ancho desde adentro.
 *
 * En pantalla angosta baja debajo del cuerpo con filo superior: 300px fijos al lado de una tabla
 * estrangulan el nombre de la fila, que es lo único que la identifica.
 */
export function CostadoDeFicha({ children, testid = 'costado' }: {
  children: ReactNode
  testid?: string
}) {
  // `lg:box-content` va LITERAL y nunca interpolado desde `CAJA_CONTENIDO`: Tailwind escanea texto,
  // y una clase armada con una plantilla no entra jamás en el CSS generado.
  return (
    <aside
      data-testid={testid}
      className="w-full shrink-0 border-t pt-4 lg:ml-7 lg:box-content lg:w-[300px] lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0"
      style={{ borderColor: V.linea, minWidth: 0 }}
    >
      {children}
    </aside>
  )
}

/** El cuerpo de una ficha: la columna elástica y el costado, con el aire del mockup. `23v2:110`. */
export function CuerpoDeFicha({ children, arriba = 18, testid }: {
  children: ReactNode
  /** El mockup 21 abre con 14 y el 23 con 18: la banda de arriba cierra distinto en cada uno. */
  arriba?: number
  testid?: string
}) {
  return (
    <div
      data-testid={testid}
      className="flex flex-col lg:flex-row lg:items-start"
      style={{ padding: `${arriba}px 20px 24px` }}
    >
      {children}
    </div>
  )
}

/** Una fila de dato del costado: rótulo de 96px y valor. `23v2:177-180`. */
export function DatoDeCostado({ k, v, falta, mono, testid }: {
  k: string
  v: ReactNode
  /** Qué se escribe cuando `v` es `null` o vacío. Nunca 0, nunca en blanco. */
  falta?: string
  mono?: boolean
  testid?: string
}) {
  const vacio = v === null || v === undefined || v === ''
  return (
    <div
      data-testid={testid}
      style={{
        display: 'flex', alignItems: 'baseline', gap: 10, padding: '7px 0',
        borderBottom: `1px solid ${V.lineaPanel}`,
      }}
    >
      <span style={{ fontSize: '11.5px', color: V.tenue, width: 96, flexShrink: 0 }}>{k}</span>
      <span
        className={`min-w-0 truncate ${!vacio && mono ? 'font-mono' : ''}`}
        style={{ fontSize: '12px', color: vacio ? V.tenue : V.tintaSuave }}
      >
        {vacio ? (falta ?? 'sin cargar') : v}
      </span>
    </div>
  )
}

/** La barrita de proporción del costado: 5px de alto y sin número adentro. `21v2:148`. */
export function BarraDeCostado({ fraccion, color = V.inerte }: { fraccion: number; color?: string }) {
  const ancho = Math.max(0, Math.min(1, fraccion))
  return (
    <span
      aria-hidden
      style={{ display: 'flex', height: 5, borderRadius: 3, background: V.lineaFila, overflow: 'hidden' }}
    >
      <span style={{ width: `${Math.round(ancho * 100)}%`, background: color, borderRadius: 3 }} />
    </span>
  )
}

/**
 * EL TITULAR DE UNA COLA: UN NÚMERO GRANDE Y LO QUE SIGNIFICA. `19b:57-72`, `19c:59-68`.
 *
 * Dos pantallas de segundo nivel abren así y ninguna con un `h1` de ficha: lo que se viene a saber
 * NO es cómo se llama la pantalla —eso ya lo dijo la miga— sino cuánto falta. El número va primero,
 * a 38px y en mono, y el título es la frase que lo completa («de 16 fichados hoy», «pedidos sin
 * resolver»).
 *
 * EL NÚMERO NUNCA CUENTA UNA CONCLUSIÓN. En las dos pantallas cuenta HECHOS —marcas hechas, pedidos
 * abiertos— y jamás ausencias ni faltas, que son interpretaciones que ninguna de las dos puede hacer.
 */
export function TitularDeCola({ numero, titulo, resumen, derecha, tono, testid = 'titular-cola' }: {
  numero: number
  titulo: string
  resumen: string
  /** La aclaración contra el margen derecho: quién resuelve, o la fecha de lo que se está mirando. */
  derecha?: ReactNode
  /** `pos` es el verde de «no queda nada»: la cola vacía es una buena noticia y se dice. */
  tono?: 'warn' | 'neg' | 'pos'
  testid?: string
}) {
  return (
    <div
      style={{ display: 'flex', alignItems: 'flex-end', gap: 16, padding: '14px 20px 18px' }}
      data-testid={testid}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 11 }}>
        <span
          className="font-mono tabular-nums"
          style={{
            fontSize: '38px', fontWeight: 600, lineHeight: 0.9, letterSpacing: '-.02em',
            color: tono === 'neg' ? V.neg : tono === 'warn' ? V.warn : tono === 'pos' ? '#067647' : V.tinta,
          }}
          data-testid="titular-numero"
        >
          {numero}
        </span>
        <div>
          <h1 style={{ fontSize: '17px', fontWeight: 600, color: V.tinta, lineHeight: 1.2 }}>{titulo}</h1>
          <div style={{ fontSize: '12.5px', color: V.apagado, marginTop: 2 }} data-testid="titular-resumen">
            {resumen}
          </div>
        </div>
      </div>
      {derecha != null && (
        <div
          style={{
            marginLeft: 'auto', fontSize: '11.5px', lineHeight: 1.55, color: V.tenue,
            maxWidth: 330, textAlign: 'right', textWrap: 'pretty',
          }}
        >
          {derecha}
        </div>
      )}
    </div>
  )
}

/**
 * EL MARCO DE UNA PANTALLA v2 — el fondo, la columna y EL SELLO.
 *
 * ═══ POR QUÉ EXISTE, Y QUÉ SE PERDÍA SIN ÉL ═══
 *
 * `PageShell` monta `SelloDatoBueno`, que es lo que le da al `error.tsx` la hora del último dato
 * bueno: si la página lanza, el marco no llega a dibujarse y el sello conserva la hora de la última
 * vez que hubo datos de verdad. Las pantallas del v2 no usan `PageShell` —su encabezado dibuja un
 * `h1` de 22px donde el v2 pide la miga y el nombre a 24px—, así que sin este marco cada porte se
 * llevaba el sello puesto y el cartel de error empezaba a decir «sin lectura previa» para siempre.
 *
 * Es lo ÚNICO que este componente hace de más que un `<main>`: el padding lo pone cada bloque
 * —14/20 la miga, 12/20 el título, 20/20 las cifras—, porque en el v2 el aire es de la anatomía y
 * no del contenedor.
 */
export function PantallaV2({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <main className="flex min-h-screen flex-col" style={{ background: V.fondo }} data-testid={testid}>
      <SelloDatoBueno />
      {children}
    </main>
  )
}
