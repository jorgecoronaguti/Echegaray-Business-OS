'use client'

// LA LISTA DE CUENTAS A LAS QUE DIRECCIÓN PUEDE ENTRAR — agrupada por nivel, una fila por cuenta,
// «Entrar» como única acción de la fila. Sin tarjetas, sin buscador: son las cuentas de la empresa,
// que caben en una pantalla, y la pregunta es «¿qué ve fulano?», que se contesta leyendo la fila.

import { Estado, Nulo } from '@/shared/components/ds'
import type { GrupoEntrable } from '../services/entrarComo'
import { useEntrarComo } from './useEntrarComo'

function cuando(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

export function ListaEntrarComo({ grupos }: { grupos: GrupoEntrable[] }) {
  const entrada = useEntrarComo()

  if (grupos.length === 0) {
    return <p className="text-[12.5px] text-muted" data-testid="sin-cuentas-entrables">No hay otras cuentas en el sistema.</p>
  }

  return (
    <div className="space-y-7" data-testid="lista-entrar-como">
      {entrada.error && <p role="alert" className="text-[12.5px] text-neg" data-testid="error-entrar-como">{entrada.error}</p>}
      {grupos.map((g) => (
        <section key={g.rol ?? 'sin-nivel'} data-testid={`grupo-${g.rol ?? 'sin-nivel'}`}>
          <h2 className="mb-1 text-[11px] font-medium tracking-[0.04em] text-faint">
            {g.etiqueta} <span className="font-mono tabular-nums">{g.cuentas.length}</span>
          </h2>
          <ul className="border-t border-line">
            {g.cuentas.map((c) => {
              const bloqueada = c.estado !== 'activo'
              const ultimo = cuando(c.ultimoIngreso)
              return (
                <li
                  key={c.id}
                  data-testid={`cuenta-${c.email ?? c.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-line py-2 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_120px_auto]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] text-ink">{c.nombre ?? <Nulo>sin nombre</Nulo>}</span>
                    <span className="block truncate text-[11.5px] text-faint">{c.email ?? 'sin correo'}</span>
                  </span>
                  <span className="col-span-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-muted md:col-span-1">
                    {bloqueada && <Estado tono="warn" clave="sin_acceso">sin acceso</Estado>}
                    {c.dosPasos && <span title="La sesión prestada entra sin pedir el código">dos pasos</span>}
                  </span>
                  <span className="hidden font-mono text-[11.5px] tabular-nums text-faint md:block">
                    {ultimo ?? 'nunca ingresó'}
                  </span>
                  <span className="row-start-1 md:row-start-auto">
                    <button
                      type="button"
                      disabled={entrada.pendiente || bloqueada}
                      onClick={() => entrada.entrar(c.id)}
                      data-testid={`entrar-como-${c.email ?? c.id}`}
                      title={bloqueada ? 'Esta cuenta no tiene acceso: no se le puede abrir sesión' : undefined}
                      className="min-h-[36px] rounded-control border border-line bg-surface px-3 text-[12.5px] font-medium text-ink hover:bg-surface-quiet disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {entrada.pendiente ? 'Entrando…' : 'Entrar'}
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
