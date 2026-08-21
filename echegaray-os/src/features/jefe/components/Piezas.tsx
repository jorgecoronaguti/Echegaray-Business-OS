import Link from 'next/link'
import type { ReactNode } from 'react'

// LAS PIEZAS DEL TELÉFONO DEL JEFE — lo que `shared/components/ds` no tiene porque es de escritorio.
//
// La regla 11 de `UX_PRINCIPLES.md` pide reutilizar antes de crear, y se reutiliza todo lo que
// sirve: `Aviso`, `Estado`, `RelojDeJornada`, `PuntoActivo`. Lo que se crea acá es lo que el DS
// resuelve con medidas de escritorio y en 390px no funciona:
//
//   · `Tabla` es una tabla. En 390px una tabla de seis columnas se lee con lupa o se desplaza de
//     costado, y las dos cosas se abandonan.
//
// LO QUE ACÁ **NO** ESTÁ, Y ANTES SÍ: la primaria de 48px. Estuvo en este archivo hasta el
// 21/08/2026 porque `Boton` medía 34px y no tenía tamaño de teléfono. La respuesta correcta no era
// una primaria más en un perfil: era `tamano="bloque"` en el `Boton` del sistema, que es donde
// ahora vive. Lo mismo con la barra del avance masivo, que es `BarraContextual`.
//
// Sólo tokens: si aparece un color, salió de `globals.css`.

/** El panel blanco del contrato: `#FFFFFF`, hairline, radio grande de teléfono. */
export function Panel({
  titulo, contador, children, testid, filo,
}: {
  titulo?: ReactNode
  /** El número que califica al título. Mono, porque es un dato. */
  contador?: ReactNode
  children: ReactNode
  testid?: string
  /** La regla interior de 3px que marca la excepción. `neg` frena; `warn` avisa. */
  filo?: 'neg' | 'warn'
}) {
  const regla = filo === 'neg' ? 'shadow-[inset_3px_0_0_var(--os-neg)]'
    : filo === 'warn' ? 'shadow-[inset_3px_0_0_var(--os-warn)]' : ''
  return (
    <section data-testid={testid} className={`overflow-hidden rounded-[14px] bg-surface ${regla}`}>
      {titulo != null && (
        <div className="flex items-baseline justify-between gap-3 px-[18px] pb-2.5 pt-[15px]">
          <h2 className="text-[13px] font-semibold text-ink">{titulo}</h2>
          {contador != null && <span className="font-mono text-[12px] tabular-nums text-muted">{contador}</span>}
        </div>
      )}
      {children}
    </section>
  )
}

/** El rótulo en versalitas que agrupa paneles. `tono` lo enciende cuando el grupo es la excepción. */
export function Rotulo({ children, extra, tono = 'faint' }: {
  children: ReactNode
  extra?: ReactNode
  tono?: 'faint' | 'warn' | 'neg'
}) {
  const color = tono === 'neg' ? 'text-neg' : tono === 'warn' ? 'text-warn' : 'text-faint'
  return (
    <div className="flex items-baseline justify-between gap-3 px-1 pb-2">
      <span className={`text-[11px] tracking-[0.06em] ${color}`}>{children}</span>
      {extra != null && <span className="text-[11.5px] text-muted">{extra}</span>}
    </div>
  )
}

/**
 * Una fila tocable dentro de un panel. 60px de alto mínimo: se toca con el dedo, en obra, muchas
 * veces con guante — el mínimo del sistema es 44 y acá cada fila lleva dos líneas de texto.
 */
export function Fila({
  href, icono, titulo, detalle, derecha, testid, tonoDetalle = 'muted',
}: {
  href?: string
  icono?: ReactNode
  titulo: ReactNode
  detalle?: ReactNode
  derecha?: ReactNode
  testid?: string
  tonoDetalle?: 'muted' | 'warn' | 'neg' | 'pos'
}) {
  const color = tonoDetalle === 'neg' ? 'text-neg' : tonoDetalle === 'warn' ? 'text-warn'
    : tonoDetalle === 'pos' ? 'text-pos' : 'text-muted'
  const cuerpo = (
    <>
      {icono}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink">{titulo}</span>
        {detalle != null && <span className={`mt-0.5 block text-[12.5px] ${color}`}>{detalle}</span>}
      </span>
      {derecha}
      {href && <span aria-hidden className="pl-1 text-[16px] text-faint">›</span>}
    </>
  )
  const clases = 'flex min-h-[60px] items-center gap-3 border-t border-[color:var(--os-surface-sunken)] px-[18px] py-2.5 first:border-t-0'
  return href
    ? <Link href={href} data-testid={testid} className={`${clases} active:bg-surface-quiet`}>{cuerpo}</Link>
    : <div data-testid={testid} className={clases}>{cuerpo}</div>
}

/**
 * La barra de avance. `pct` en `null` NO dibuja una barra vacía: dibuja la pista sola y el número
 * dice «sin medir». Una barra en cero afirma que no se empezó; null dice que nadie sabe.
 */
export function Barra({ pct, tono = 'ink' }: { pct: number | null; tono?: 'ink' | 'marca' | 'pos' | 'warn' }) {
  const color = tono === 'marca' ? 'bg-marca' : tono === 'pos' ? 'bg-pos' : tono === 'warn' ? 'bg-warn' : 'bg-accent'
  return (
    <div className="h-[7px] overflow-hidden rounded-[4px] bg-surface-sunken" data-testid="barra-avance" data-pct={pct ?? ''}>
      {pct != null && (
        <div className={`h-[7px] rounded-[4px] ${color}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
      )}
    </div>
  )
}

/** `47` → `47 %`. `null` → `sin medir`, nunca `0 %`. */
export function porcentaje(pct: number | null): string {
  if (pct == null) return 'sin medir'
  return `${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(pct)} %`
}

/**
 * El porcentaje COMO VALOR DE MÉTRICA. Igual que `porcentaje`, salvo que la ausencia se escribe con
 * un guión y la explicación baja al subtítulo.
 *
 * En una métrica de 22px sobre una columna de ~110px en un teléfono de 390, «sin medir» se sale del
 * ancho y pisa la métrica de al lado. El guión no dice menos: dice lo mismo, y el renglón de abajo
 * lo explica con espacio para hacerlo.
 */
export function porcentajeCorto(pct: number | null): string {
  return pct == null ? '—' : porcentaje(pct)
}

export interface Metrica {
  clave: string
  valor: ReactNode
  sub?: ReactNode
  tono?: 'ink' | 'warn' | 'neg' | 'pos'
}

/** Las tres métricas del encabezado. Tres y no seis: `LAYOUT_RESPONSIVE.md` §Mobile lo dice. */
export function Metricas({ metricas, testid = 'metricas' }: { metricas: Metrica[]; testid?: string }) {
  return (
    <div data-testid={testid} className="flex rounded-[14px] bg-surface px-5 py-[18px]">
      {metricas.map((m, i) => (
        <div
          key={m.clave}
          // El divisor va a la DERECHA de cada columna, así que la de al lado necesita aire a la
          // izquierda: sin él «EN OBRA» arranca pegado a la línea y se lee como si fuera un borde
          // del texto. Medido en la captura a 390px.
          className={`min-w-0 flex-1 pr-3 ${i > 0 ? 'pl-3' : ''} ${
            i < metricas.length - 1 ? 'shadow-[inset_-1px_0_0_var(--os-surface-sunken)]' : ''}`}
        >
          <div className="mb-1 text-[10.5px] uppercase tracking-[0.05em] text-faint">{m.clave}</div>
          <div className={`font-mono text-[22px] font-semibold leading-[1.05] tabular-nums ${
            m.tono === 'neg' ? 'text-neg' : m.tono === 'warn' ? 'text-warn' : m.tono === 'pos' ? 'text-pos' : 'text-ink'
          }`}>
            {m.valor}
          </div>
          {/* NO se recorta: «sin plantel asig…» y «no hay marca s…» no dicen nada. Tres columnas en
              390px dan ~110px cada una, así que el subtítulo baja de renglón y se lee entero. */}
          {m.sub != null && <div className="mt-0.5 text-[11.5px] leading-snug text-muted">{m.sub}</div>}
        </div>
      ))}
    </div>
  )
}

/** El vacío que EXPLICA. Nunca «no hay datos»: qué falta y quién lo carga. */
export function Nada({ children, testid }: { children: ReactNode; testid?: string }) {
  return (
    <p data-testid={testid ?? 'nada'} className="px-[18px] py-4 text-[12.5px] leading-relaxed text-faint">
      {children}
    </p>
  )
}

/** El encabezado de pantalla: título de 21px y el renglón que dice qué obra se está mirando. */
export function Encabezado({ titulo, sub, accion }: { titulo: ReactNode; sub?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 px-4 pb-2.5 pt-4">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-[20px] font-semibold leading-tight text-ink">{titulo}</h1>
        {sub != null && <p className="mt-0.5 text-[13.5px] text-muted">{sub}</p>}
      </div>
      {accion}
    </div>
  )
}

/**
 * LA CONFIRMACIÓN DE QUE SE GUARDÓ. No es un `Aviso`: ese componente existe *«sólo cuando hay un
 * problema REAL»* y agregarle un tono verde lo convertiría en un cartel de uso general, que es
 * exactamente lo que entrena a la gente a dejar de leer los carteles de color.
 *
 * Dice QUÉ se guardó, no «listo». Parado en la obra, «3 tareas al 75 %» se puede verificar de un
 * vistazo contra lo que uno acaba de tocar; «guardado con éxito» no se puede verificar contra nada.
 */
export function Confirmacion({ children, testid = 'confirmacion' }: { children: ReactNode; testid?: string }) {
  return (
    <p
      data-testid={testid}
      className="flex items-start gap-2.5 rounded-[12px] bg-pos-soft px-3.5 py-3 text-[13px] leading-relaxed text-pos"
    >
      <span aria-hidden>✓</span>
      <span className="min-w-0 flex-1">{children}</span>
    </p>
  )
}
