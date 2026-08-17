import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getIntegraciones } from '@/features/integraciones/services/integracionesService'
import { getResumenPorObra, type ResumenObra } from '@/features/integraciones/services/resumenPorObraService'
import {
  ESTADO_LABEL,
  ESTADO_BADGE,
  SALUD_BADGE,
  GUIA_CONEXION,
  ordenar,
  contar,
} from '@/features/integraciones/types'

export const dynamic = 'force-dynamic'

async function loadData() {
  try {
    const supabase = await createClient()
    const [res, porObra] = await Promise.all([getIntegraciones(supabase), getResumenPorObra(supabase)])
    return { res, porObra }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido al conectar con Supabase'
    return { res: { data: null, error } as const, porObra: { data: null, error } as const }
  }
}

const QUIEN_LABEL: Record<string, string> = {
  dueño: 'Requiere acción del dueño',
  os: 'El OS puede avanzarlo',
  automatico: 'Automático',
}

function fechaAR(iso: string | null): string {
  if (!iso) return 'nunca'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default async function IntegracionesPage() {
  const { res, porObra } = await loadData()
  const pageError = res.error
  const obras: ResumenObra[] = porObra.data ?? []
  const isAuthError = pageError?.toLowerCase().includes('permission denied') ?? false
  const lista = ordenar(res.data ?? [])
  const c = contar(res.data ?? [])

  return (
    <div className="min-h-screen space-y-8 p-8">
      <div>
        <h1 className="text-3xl font-bold">Integraciones</h1>
        <p className="mt-2 max-w-3xl text-gray-600">
          Dónde y cómo el OS se conecta con los sistemas externos de la empresa. El estado y la salud salen del
          registro real del OS; la guía indica el paso concreto para conectar o desbloquear cada una.
        </p>
      </div>

      {pageError && (
        <div
          className={`rounded border p-4 ${isAuthError ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-red-300 bg-red-50 text-red-800'}`}
          data-testid="page-error"
        >
          <p className="font-semibold">
            {isAuthError ? 'No hay sesión autenticada — RLS bloquea el acceso.' : 'Supabase no responde.'}
          </p>
          <p className="mt-1 text-sm">{pageError}</p>
        </div>
      )}

      {!pageError && (
        <div className="flex flex-wrap gap-3" data-testid="resumen">
          <Contador n={c.vivas} label="Conectadas" tone="emerald" />
          <Contador n={c.enCurso} label="En curso" tone="amber" />
          <Contador n={c.bloqueadas} label="Bloqueadas" tone="red" />
          <Contador n={c.planeadas} label="Planeadas" tone="gray" />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2" data-testid="lista-integraciones">
        {lista.map((it) => {
          const guia = GUIA_CONEXION[it.slug]
          const esAppsheet = it.slug === 'appsheet_pedidos'
          return (
            <section key={it.slug} className="rounded-lg border bg-white p-5 shadow-sm" data-testid={`integracion-${it.slug}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">{it.nombre}</h2>
                  {it.dato && <p className="mt-0.5 text-sm text-gray-600">{it.dato}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${ESTADO_BADGE[it.estado]}`}>
                  {ESTADO_LABEL[it.estado]}
                </span>
              </div>

              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
                {it.metodo && (
                  <div>
                    <dt className="inline font-medium text-gray-400">Método: </dt>
                    <dd className="inline text-gray-700">
                      {it.metodo}
                      {it.frecuencia ? ` · ${it.frecuencia}` : ''}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="inline font-medium text-gray-400">Salud: </dt>
                  <dd className={`inline rounded px-1.5 py-0.5 ${SALUD_BADGE[it.salud]}`}>{it.salud}</dd>
                </div>
                <div>
                  <dt className="inline font-medium text-gray-400">Último sync: </dt>
                  <dd className="inline text-gray-700">{fechaAR(it.ultimo_sync)}</dd>
                </div>
              </dl>

              {guia && (
                <div className="mt-4 rounded-md bg-gray-50 p-3 text-sm">
                  <p className="text-gray-700">{guia.como}</p>
                  {it.estado !== 'vivo' && guia.accion && (
                    <p className="mt-2 font-medium text-gray-900">
                      <span className="mr-1">→</span>
                      {guia.accion}
                    </p>
                  )}
                  {it.estado !== 'vivo' && guia.pasos.length > 0 && (
                    <ol className="mt-1.5 list-decimal space-y-0.5 pl-5 text-xs text-gray-600">
                      {guia.pasos.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ol>
                  )}
                  <p className="mt-2 text-[11px] tracking-wide text-gray-400 uppercase">{QUIEN_LABEL[guia.quien]}</p>
                </div>
              )}

              {esAppsheet && (
                <Link
                  href="/integraciones/pedidos-materiales"
                  className="mt-4 inline-flex items-center rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700"
                >
                  Abrir Pedidos de Materiales →
                </Link>
              )}
            </section>
          )
        })}
      </div>

      {obras.length > 0 && (
        <section data-testid="por-obra" className="space-y-3">
          <div>
            <h2 className="text-xl font-semibold">Operación por obra</h2>
            <p className="mt-1 text-sm text-gray-600">
              Herramientas y pedidos de material, agrupados por obra. Sale de los datos operativos reales
              (ubicación de cada herramienta y obra de cada pedido). Ordenado por pedidos pendientes.
            </p>
          </div>
          <div className="overflow-x-auto rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-left text-xs font-medium tracking-wide text-gray-500 uppercase">
                  <th className="px-4 py-2.5">Obra</th>
                  <th className="px-4 py-2.5 text-right">Herramientas</th>
                  <th className="px-4 py-2.5 text-right">Pedidos pendientes</th>
                  <th className="px-4 py-2.5 text-right">Pedidos (total)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {obras.map((o) => (
                  <tr key={o.obra} className="hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{o.obra}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-700">{o.herramientas}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {o.pedidosPendientes > 0 ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-800">
                          {o.pedidosPendientes}
                        </span>
                      ) : (
                        <span className="text-gray-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-500">{o.pedidosTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-xs text-gray-400">
        La frescura y cobertura del dato (para decisiones) vive en{' '}
        <Link href="/integraciones" className="underline">
          Fuentes de Datos
        </Link>
        . Esta pantalla es la capa de conectividad.
      </p>
    </div>
  )
}

function Contador({ n, label, tone }: { n: number; label: string; tone: 'emerald' | 'amber' | 'red' | 'gray' }) {
  const toneClass = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-800',
    red: 'border-red-200 bg-red-50 text-red-800',
    gray: 'border-gray-200 bg-gray-50 text-gray-700',
  }[tone]
  return (
    <div className={`rounded-lg border px-4 py-2 ${toneClass}`}>
      <div className="text-2xl font-bold">{n}</div>
      <div className="text-xs">{label}</div>
    </div>
  )
}
