// LA COLA — una entrada por TEXTO, no por comprobante, y debajo de qué fuente sale cada una.
//
// ═══ POR QUÉ EL TEXTO Y NO EL PAPEL ═══
//
// Compras, pedidos, herramientas y movimientos guardan la obra como texto libre. Resolver un texto
// escribe UNA fila en `obra_alias` y esa fila arregla todas las filas que dicen lo mismo — las de
// hoy y las que entren mañana por el sincronizador. Una cola por comprobante haría contestar N
// veces la misma pregunta, y peor, permitiría contestarla distinto cada vez.
//
// ═══ «SIN IMPORTE» NO ES «$ 0» ═══
//
// Herramientas, pedidos y movimientos mueven un recurso, no plata. Escribir 0 los mezclaría con
// una compra de cero pesos y haría creer que ese trabajo no vale nada; el orden por importe los
// manda al fondo con la cantidad de filas como desempate, que es el pedido del dueño («lo que más
// plata mueve, primero») sin fabricar un número.

'use client'

import { plata } from '@/features/obras/components/formato'
import {
  IconoCompra, IconoHerramienta, IconoMaterial, IconoMovimiento, IconoNadaPendiente,
} from '@/shared/components/iconos'
import { ETIQUETA_TIPO, type GrupoPendiente, type ResumenFuente, type TipoFuente } from '../services/imputacionService'
import { desgloseDeFuente, segmentosDeFuente } from '../services/pendientesVista'

const ICONO_DE: Record<TipoFuente, (p: { className?: string }) => React.ReactElement> = {
  compra: IconoCompra,
  pedido: IconoMaterial,
  herramienta: IconoHerramienta,
  movimiento: IconoMovimiento,
}

/** El texto viene de N fuentes: manda la primera, que es la que más filas aporta al grupo. */
const fuentesDe = (g: GrupoPendiente) => g.tipos.map((t) => ETIQUETA_TIPO[t]).join(' · ')

function Entrada({ g, activa, alAbrir }: {
  g: GrupoPendiente
  activa: boolean
  alAbrir: () => void
}) {
  const Icono = ICONO_DE[g.tipos[0] ?? 'compra']
  return (
    <button
      type="button"
      data-testid="fila-pendiente"
      onClick={alAbrir}
      aria-current={activa}
      className={`flex flex-col gap-1 rounded-[8px] border px-3 py-2.5 text-left transition-colors ${
        activa
          ? 'border-marca-track bg-marca-soft shadow-[inset_2px_0_0_var(--os-marca)]'
          : 'border-line bg-surface hover:border-line-strong'
      }`}
    >
      <span className="flex items-center gap-[9px]">
        <Icono className={`h-[14px] w-[14px] shrink-0 ${activa ? 'text-accent' : 'text-faint'}`} />
        <span
          data-testid="abrir-pendiente"
          className="min-w-0 truncate font-mono text-[12.5px] font-semibold text-ink"
        >{g.textos[0]}</span>
      </span>
      {/* UNA SOLA LÍNEA, SIEMPRE. Un texto que sale de dos fuentes tiene un rótulo el doble de
          largo y, sin truncar, parte la tarjeta en tres renglones: la cola deja de leerse de un
          vistazo justo cuando hay más trabajo. Lo que nunca se encoge son los dos números. */}
      <span className="flex items-baseline gap-1.5 pl-[23px]">
        <span className="min-w-0 truncate text-[11.5px] text-muted">{fuentesDe(g)}</span>
        <span className="shrink-0 text-[11.5px] text-line-strong">·</span>
        <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-muted">
          {g.cantidad} {g.cantidad === 1 ? 'fila' : 'filas'}
        </span>
        <span className={`ml-auto shrink-0 font-mono text-[11.5px] tabular-nums ${g.importe > 0 ? 'text-ink' : 'text-faint'}`}>
          {g.importe > 0 ? plata(g.importe) : 'sin importe'}
        </span>
      </span>
    </button>
  )
}

/** Una fuente: su nombre, si tiene trabajo encima, y la proporción de sus filas en cada estado. */
function Fuente({ r }: { r: ResumenFuente }) {
  const s = segmentosDeFuente(r)
  return (
    <div data-testid={`resumen-${r.tipo}`} className="flex flex-col gap-1">
      <div className="flex items-baseline gap-[7px]">
        <span className="text-[11.5px] text-ink-soft">{ETIQUETA_TIPO[r.tipo]}</span>
        {/* EL COLOR VA EN LA CIFRA Y EN NINGÚN OTRO LADO. Ámbar sólo cuando hay algo que hacer:
            encenderlo siempre lo volvería invisible el día que importa. */}
        <span className={`ml-auto font-mono text-[11px] tabular-nums ${r.pendiente > 0 ? 'text-warn' : 'text-faint'}`}>
          {r.pendiente > 0 ? `${r.pendiente} sin resolver` : 'al día'}
        </span>
      </div>
      <div
        title={desgloseDeFuente(r, ETIQUETA_TIPO[r.tipo])}
        className="flex h-1 overflow-hidden rounded-[2px] bg-[color:var(--os-surface-sunken)]"
      >
        <span style={{ width: s.obra }} className="bg-[color:var(--os-line-strong)]" />
        <span style={{ width: s.estructura }} className="bg-[color:var(--os-line)]" />
        <span style={{ width: s.pendiente }} className="bg-warn" />
      </div>
    </div>
  )
}

export function ColaPendientes({ cola, activa, resumen, alAbrir }: {
  cola: GrupoPendiente[]
  activa: string | null
  resumen: ResumenFuente[]
  alAbrir: (clave: string) => void
}) {
  return (
    <div className="flex min-h-0 w-full shrink-0 flex-col border-line pr-0 lg:w-[296px] lg:border-r lg:pr-5">
      <div className="mb-2 flex shrink-0 items-baseline gap-[7px]">
        <span className="text-[10px] uppercase tracking-[0.07em] text-faint">La cola</span>
        <span className="ml-auto text-[11px] text-faint">por importe</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto">
        {cola.map((g) => (
          <Entrada key={g.clave} g={g} activa={g.clave === activa} alAbrir={() => alAbrir(g.clave)} />
        ))}
        {cola.length === 0 && (
          <div data-testid="pendientes-vacio" className="flex items-start gap-[9px] px-0.5 py-3.5">
            <IconoNadaPendiente className="mt-px h-4 w-4 shrink-0 text-pos" />
            <span className="text-[12px] leading-relaxed text-muted text-pretty">
              No queda ningún texto sin clasificar en compras, pedidos, herramientas ni movimientos.
            </span>
          </div>
        )}
      </div>

      <div
        data-testid="resumen-fuentes"
        className="mt-3 flex shrink-0 flex-col gap-[9px] border-t border-line pt-3"
      >
        <span className="text-[10px] uppercase tracking-[0.07em] text-faint">Las cuatro fuentes</span>
        {resumen.map((r) => <Fuente key={r.tipo} r={r} />)}
        <div className="mt-px flex items-center gap-3">
          <span className="flex items-center gap-[5px] text-[10.5px] text-faint">
            <span className="h-[7px] w-[7px] rounded-[2px] bg-[color:var(--os-line-strong)]" />a una obra
          </span>
          <span className="flex items-center gap-[5px] text-[10.5px] text-faint">
            <span className="h-[7px] w-[7px] rounded-[2px] bg-[color:var(--os-line)]" />estructura
          </span>
        </div>
      </div>
    </div>
  )
}
