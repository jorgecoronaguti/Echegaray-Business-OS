// OPERACIÓN — pedidos, compras, herramientas y movimientos de TODAS las obras.
//
// LAS CUATRO SUB-VISTAS SON LAS MISMAS QUE ADENTRO DE LA OBRA, y la fuente también:
// `getOperacion(supabase)` es literalmente `getOperacion(supabase, obraId)` sin la obra. La
// sub-vista viaja por query string igual que en la ficha, así que cada lista es una URL que se
// comparte y el servidor la renderiza sin estado de cliente.
//
// LA COLUMNA «OBRA» SALE DEL MISMO PUENTE QUE EL FILTRO DE LA FICHA (`obra_alias` → `obraDeTexto`).
// No es una segunda deducción: es la etiqueta que la ficha usa para filtrar, publicada como
// columna. Por eso las filas de una obra en esta lista son exactamente las de su solapa Operación.
//
// «SIN OBRA» ES UN DATO, NO UN HUECO. Una compra de estructura —Administración, Taller, F931,
// UOCRA— no es de ninguna obra, y ponerla bajo la primera de la lista sería imputar plata a quien
// no la gastó. Al nivel Obras esas filas ni siquiera llegan: `ve_obra_texto()` las deja afuera.

import { createClient } from '@/lib/supabase/server'
import { getOperacion, SUBS_OPERACION, type SubOperacion } from '@/features/obras/services/operacionService'
import { getContextoGlobal, hrefObra } from '@/features/obras/services/vistaGlobal'
import { FiltroObra, NavObras } from '@/features/obras/components/NavObras'
import { C, CeldaObra, Fila, Tabla, Vacio } from '@/features/obras/components/tablas'
import { fecha, plata } from '@/features/obras/components/formato'
import { estadoInfo } from '@/features/integraciones/services/herramientasService'
import { Badge, Callout, PageShell } from '@/shared/components/ui'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

const SUBS: { id: SubOperacion; label: string }[] = [
  { id: 'pedidos', label: 'Pedidos' },
  { id: 'compras', label: 'Compras' },
  { id: 'herramientas', label: 'Herramientas' },
  { id: 'movimientos', label: 'Movimientos' },
]

const cantidad = (n: number | null) => (n == null ? '—' : n.toLocaleString('es-AR', { maximumFractionDigits: 2 }))
const entregado = (estado: string | null) => (estado ?? '').toLowerCase().includes('entreg')
const TONO_HERRAMIENTA = { ok: 'pos', info: 'neutral', amber: 'warn', red: 'neg' } as const

export default async function OperacionGlobalPage({
  searchParams,
}: {
  searchParams: Promise<{ sub?: string }>
}) {
  const { sub: subRaw } = await searchParams
  const sub: SubOperacion = SUBS_OPERACION.find((x) => x === subRaw) ?? 'pedidos'

  const supabase = await createClient()
  const ctx = await getContextoGlobal(supabase)
  const { data: op, error } = await getOperacion(supabase)

  const nombre = (id: string | null) => (id ? ctx.nombreDeObra.get(id) : undefined)
  const celdaObra = (id: string | null) => (
    <CeldaObra id={id} nombre={nombre(id)} href={id ? hrefObra(id, 'operacion', sub) : undefined} />
  )
  const cuenta: Record<SubOperacion, number> = {
    pedidos: op?.pedidos.length ?? 0,
    compras: op?.compras.filas.length ?? 0,
    herramientas: op?.herramientas.length ?? 0,
    movimientos: op?.movimientos.length ?? 0,
  }

  return (
    <PageShell
      eyebrow="01 · Obras"
      title="Operación"
      subtitle="Qué se pidió, qué se compró y qué recursos se movieron — en todas las obras a la vez."
    >
      <NavObras />

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <nav className="-mx-0.5 overflow-x-auto px-0.5 pb-0.5">
          <div className="inline-flex gap-0.5 rounded-control border border-line bg-surface p-0.5">
            {SUBS.map((s) => {
              const activa = s.id === sub
              return (
                <Link
                  key={s.id}
                  href={`/obras/operacion?sub=${s.id}`}
                  aria-current={activa ? 'page' : undefined}
                  className={`flex shrink-0 items-center gap-1.5 rounded-[5px] px-3 py-1.5 text-[13px] font-medium transition ${
                    activa ? 'bg-accent text-white' : 'text-muted hover:bg-surface-sunken hover:text-ink'
                  }`}
                >
                  {s.label}
                  <span className={`text-[11px] tabular-nums ${activa ? 'text-white/60' : 'text-faint'}`}>{cuenta[s.id]}</span>
                </Link>
              )
            })}
          </div>
        </nav>
        <FiltroObra obras={ctx.obras} vista="operacion" sub={sub} />
      </div>

      {error && <Callout tono="neg">No pude leer la operación: {error}</Callout>}

      {op && sub === 'pedidos' && (
        op.pedidos.length === 0 ? <Vacio>No hay pedidos de material registrados.</Vacio> : (
          <Tabla testid="tabla-pedidos-global" min={720} cols={[{ k: 'Obra' }, { k: 'Fecha' }, { k: 'Material' }, { k: 'Cantidad', num: true }, { k: 'Estado' }]}>
            {op.pedidos.map((p) => (
              <Fila key={p.id_pedido} obra={p.obra_canonica_id}>
                {celdaObra(p.obra_canonica_id)}
                <C num>{fecha(p.fecha)}</C>
                <C fuerte>{p.material ?? '—'}</C>
                <C num>{cantidad(p.cantidad)}</C>
                <C>{p.estado ? entregado(p.estado) ? <Badge tono="pos">{p.estado}</Badge> : p.estado : '—'}</C>
              </Fila>
            ))}
          </Tabla>
        )
      )}

      {op && sub === 'compras' && (
        op.compras.filas.length === 0 ? <Vacio>No hay compras registradas.</Vacio> : (
          <>
            <Tabla testid="tabla-compras-global" min={860} cols={[{ k: 'Obra' }, { k: 'Fecha' }, { k: 'Proveedor' }, { k: 'Concepto' }, { k: 'Comprobante' }, { k: 'Importe', num: true }]}>
              {op.compras.filas.map((c) => (
                <Fila key={c.id} obra={c.obra_canonica_id}>
                  {celdaObra(c.obra_canonica_id)}
                  <C num>{fecha(c.fecha)}</C>
                  <C fuerte>{c.proveedor ?? '—'}</C>
                  <C>{c.concepto ?? '—'}</C>
                  <C>{c.comprobante ?? '—'}</C>
                  <C num fuerte>{plata(c.total)}</C>
                </Fila>
              ))}
            </Tabla>
            {/* NO HAY TOTAL EN ESTA PANTALLA, Y ES A PROPÓSITO. El costo real de una obra lo declara
                `obra_costo_real` y ya se publica en dos lugares —el portafolio y la solapa Economía—.
                Sumar acá las filas visibles daría un tercer número, distinto de los otros dos según
                quién mire, que es exactamente la clase de cifra que nadie puede auditar. */}
            <p className="mt-2 text-[11px] text-faint">
              El costo real de cada obra se lee en el portafolio y en su solapa Economía: sale de la
              fuente única del costo, no de sumar esta lista.
            </p>
          </>
        )
      )}

      {op && sub === 'herramientas' && (
        op.herramientas.length === 0 ? <Vacio>Ninguna herramienta figura hoy en una obra.</Vacio> : (
          <Tabla testid="tabla-herramientas-global" min={720} cols={[{ k: 'Obra' }, { k: 'Herramienta' }, { k: 'Categoría' }, { k: 'Estado' }, { k: 'Responsable' }]}>
            {op.herramientas.map((h) => {
              const e = estadoInfo(h.estado)
              return (
                <Fila key={h.id_herramienta} obra={h.obra_canonica_id}>
                  {celdaObra(h.obra_canonica_id)}
                  <C fuerte>{h.nombre}</C>
                  <C>{h.categoria ?? '—'}</C>
                  <C><Badge tono={TONO_HERRAMIENTA[e.tone]}>{e.label}</Badge></C>
                  <C>{h.responsable_actual ?? '—'}</C>
                </Fila>
              )
            })}
          </Tabla>
        )
      )}

      {op && sub === 'movimientos' && (
        op.movimientos.length === 0 ? <Vacio>Todavía no se movió ninguna herramienta hacia una obra.</Vacio> : (
          <Tabla testid="tabla-movimientos-global" min={680} cols={[{ k: 'Obra' }, { k: 'Fecha' }, { k: 'Herramienta' }, { k: 'Responsable' }]}>
            {op.movimientos.map((m) => (
              <Fila key={m.id_movimiento} obra={m.obra_canonica_id}>
                {celdaObra(m.obra_canonica_id)}
                <C num>{fecha(m.fecha)}</C>
                <C fuerte>{m.herramienta_nombre ?? '—'}</C>
                <C>{m.responsable ?? '—'}</C>
              </Fila>
            ))}
          </Tabla>
        )
      )}
    </PageShell>
  )
}
