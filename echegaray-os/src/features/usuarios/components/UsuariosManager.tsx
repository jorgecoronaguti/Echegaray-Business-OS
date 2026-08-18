'use client'

// LA LISTA DE CUENTAS — cuatro columnas y un panel. Nada más.
//
// USUARIO · ROL · OBRAS · ESTADO, que es la tabla que pidió el dueño textual. No hay tarjetas por
// persona, no hay contadores arriba y no hay gráficos: son diez filas, la pregunta es «quién ve qué»
// y se contesta leyendo la fila, no interpretando un tablero.
//
// El buscador y el filtro no consultan al servidor: la lista entera son todas las cuentas de la
// empresa y viaja completa. Filtrar en el cliente es instantáneo y no agrega un estado que se pueda
// desincronizar con lo que se ve.

import { useMemo, useState } from 'react'
import { Badge, SegmentedControl } from '@/shared/components/ui'
import { ROL_LABEL } from '@/features/auth/types'
import { AltaUsuario } from './AltaUsuario'
import { PanelUsuario } from './PanelUsuario'
import type { ObraElegible, UsuarioGestion } from '../types'

type Filtro = 'todos' | 'administracion' | 'obras' | 'sin_acceso'

const FILTROS: readonly { value: Filtro; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'administracion', label: 'Administración' },
  { value: 'obras', label: 'Obras' },
  { value: 'sin_acceso', label: 'Sin acceso' },
]

const normal = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

export function coincide(u: UsuarioGestion, texto: string, filtro: Filtro): boolean {
  const t = normal(texto.trim())
  const enTexto = t === '' || normal(`${u.nombre ?? ''} ${u.email ?? ''}`).includes(t)
  const enFiltro =
    filtro === 'todos' ? true
      : filtro === 'sin_acceso' ? u.estado === 'sin_acceso'
        // Una cuenta sin acceso no cuenta como parte de su área: no ve nada, esté donde esté.
        : u.area === filtro && u.estado === 'activo'
  return enTexto && enFiltro
}

/** La celda de obras. Para Administración no se listan: ve todas y enumerarlas mentiría por omisión
 *  el día que se agregue una obra nueva. */
function CeldaObras({ u }: { u: UsuarioGestion }) {
  if (u.area === 'administracion') return <span className="text-[12px] text-muted">Todas</span>
  if (u.obras.length === 0) return <span className="text-[12px] text-faint">Ninguna</span>
  return (
    <span className="text-[12px] text-muted">
      {u.obras.map((o) => o.obraNombre).join(', ')}
    </span>
  )
}

export function UsuariosManager({
  usuarios, obras, actorId,
}: {
  usuarios: UsuarioGestion[]
  obras: ObraElegible[]
  /** Quién está mirando. Viene del servidor: es lo que apaga los controles sobre la propia cuenta. */
  actorId: string
}) {
  const [texto, setTexto] = useState('')
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [elegido, setElegido] = useState<string | null>(null)
  const [alta, setAlta] = useState(false)

  const visibles = useMemo(() => usuarios.filter((u) => coincide(u, texto, filtro)), [usuarios, texto, filtro])
  // La cuenta elegida se busca en la lista COMPLETA y en cada render: después de guardar, el
  // servidor manda las filas nuevas y el panel tiene que mostrar lo guardado, no lo que había
  // cuando se abrió.
  const usuario = usuarios.find((u) => u.id === elegido) ?? null

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Buscar por nombre o correo"
            data-testid="buscar-usuario"
            className="min-w-0 flex-1 rounded-control border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink placeholder:text-faint sm:max-w-[260px]"
          />
          <SegmentedControl options={FILTROS} value={filtro} onChange={setFiltro} size="sm" ariaLabel="Filtrar cuentas" />
          <button
            type="button"
            onClick={() => { setAlta(true); setElegido(null) }}
            data-testid="abrir-alta"
            className="rounded-control border border-transparent bg-slate-900 px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-slate-700"
          >
            Nueva cuenta
          </button>
        </div>

        {visibles.length === 0 ? (
          <p className="rounded-lg border border-line bg-surface px-4 py-6 text-[13px] text-muted" data-testid="sin-usuarios">
            Ninguna cuenta coincide con lo que buscás.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table data-testid="tabla-usuarios" className="w-full min-w-[560px] text-left">
              <thead>
                <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                  <th className="px-4 py-2 font-medium">Usuario</th>
                  <th className="px-3 py-2 font-medium">Rol</th>
                  <th className="px-3 py-2 font-medium">Obras</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((u) => (
                  <tr
                    key={u.id}
                    onClick={() => { setElegido(u.id); setAlta(false) }}
                    data-testid={`fila-${u.email ?? u.id}`}
                    className={`cursor-pointer border-b border-line/60 last:border-0 hover:bg-surface-quiet ${
                      u.id === elegido ? 'bg-surface-quiet' : ''
                    }`}
                  >
                    <td className="px-4 py-2">
                      <span className="block truncate text-[13px] text-ink">{u.nombre ?? 'Sin nombre'}</span>
                      <span className="block truncate text-[11px] text-faint">{u.email ?? 'sin correo'}</span>
                    </td>
                    <td className="px-3 py-2 text-[12px] text-muted">
                      {u.rol ? ROL_LABEL[u.rol] : <span className="text-warn">Sin rol</span>}
                    </td>
                    <td className="px-3 py-2"><CeldaObras u={u} /></td>
                    <td className="px-3 py-2">
                      {u.estado === 'activo'
                        ? <Badge tono="pos">Activo</Badge>
                        : <Badge tono="neg">Sin acceso</Badge>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {alta && <AltaUsuario alCerrar={() => setAlta(false)} />}
      {!alta && usuario && (
        <PanelUsuario
          usuario={usuario}
          obras={obras}
          esUnoMismo={usuario.id === actorId}
          alCerrar={() => setElegido(null)}
        />
      )}
    </div>
  )
}
