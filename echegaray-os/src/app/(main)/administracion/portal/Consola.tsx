'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import type { EstadoPortal } from '@/features/administracion/services/portalClientes'
import { darDeBajaMail, habilitarMail, type Resultado } from './acciones'

// LA CONSOLA DEL PORTAL — una sola pantalla, agrupada por cliente.
//
// NO IMPORTA `portalClientes` EN RUNTIME a propósito: ese módulo arrastra `node:crypto` por la
// lógica de la puerta, y un componente de cliente que lo importe rompe el bundle del navegador. Los
// rótulos del semáforo los resuelve el servidor y bajan como texto; acá sólo se elige el color.

export interface ObraFila { id: string; nombre: string; estado: string | null }
export interface MailFila { id: string; mail: string; nombre: string | null; alcance: string }
export interface ClienteFila {
  id: string
  nombre: string
  obras: ObraFila[]
  pagos: number
  mails: MailFila[]
  /** Accesos apagados. Se cuentan: la baja no borra, y eso tiene que verse. */
  bajas: number
  estado: EstadoPortal
  rotulo: string
  queHacer: string
}
export interface Golpe { mail: string; veces: number; ultimo: string }

/** El semáforo. Verde SÓLO cuando el cliente puede entrar Y ver algo: lo demás es trabajo. */
const TONO: Record<EstadoPortal, string> = {
  listo: 'border-pos/40 bg-pos/10 text-pos',
  sin_mail: 'border-neg/40 bg-neg/10 text-neg',
  sin_cronograma: 'border-warn/40 bg-warn/10 text-warn',
  sin_obras: 'border-line bg-surface text-muted',
}

const CAMPO = 'min-h-10 rounded-control border border-line bg-surface px-2.5 text-[13px] outline-none focus:border-ink'

const fecha = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? 'sin fecha' : d.toLocaleDateString('es-AR')
}

export function Consola({ clientes, golpes, intentosMirados, archivados, error }: {
  clientes: ClienteFila[]
  golpes: Golpe[]
  intentosMirados: number
  archivados: number
  error: string | null
}) {
  const [baja, darDeBaja] = useActionState(darDeBajaMail, { ok: false, mensaje: '' } as Resultado)

  return (
    <div className="px-4 py-6 md:px-8">
      <h1 className="text-xl font-semibold tracking-[-.01em]">Acceso al portal</h1>
      <p className="mt-1 max-w-[70ch] text-[13px] text-muted">
        Quién de cada cliente puede entrar a ver sus obras, sus cobros y sus papeles. El mail ES la
        credencial: quien lo recibe ve la plata de ese cliente.
      </p>

      {error && (
        <p className="mt-4 rounded-card border border-neg/40 bg-neg/10 px-4 py-3 text-[13px] text-neg">
          No pude leer todo: {error}. Lo que se ve abajo puede estar incompleto — no lo tomes como la lista entera.
        </p>
      )}

      <FormAlta clientes={clientes} />

      {baja.mensaje && (
        <p className={`mt-4 text-[13px] ${baja.ok ? 'text-pos' : 'text-neg'}`}>{baja.mensaje}</p>
      )}

      <div className="mt-6 flex flex-col gap-3">
        {clientes.map((c) => <Tarjeta key={c.id} c={c} darDeBaja={darDeBaja} />)}
        {clientes.length === 0 && <p className="text-sm text-muted">No hay clientes activos cargados.</p>}
      </div>

      {archivados > 0 && (
        <p className="mt-3 text-[12px] text-faint">
          {archivados} cliente(s) archivado(s) fuera de esta lista. Dar acceso al portal a un cliente
          archivado casi siempre es un error de selección.
        </p>
      )}

      <Golpes golpes={golpes} mirados={intentosMirados} />
    </div>
  )
}

/** El alta. La obra se elige DESPUÉS del cliente y sólo entre las suyas: cruzarlas es el agujero. */
function FormAlta({ clientes }: { clientes: ClienteFila[] }) {
  const [estado, enviar, pendiente] = useActionState(habilitarMail, { ok: false, mensaje: '' } as Resultado)
  const [clienteId, setClienteId] = useState('')
  const elegido = clientes.find((c) => c.id === clienteId)

  return (
    <form action={enviar} className="mt-5 rounded-card border border-line bg-surface p-4">
      <p className="text-[11px] font-semibold tracking-[.09em] text-faint">HABILITAR UN MAIL</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-faint">Cliente</span>
          <select name="clienteId" value={clienteId} onChange={(e) => setClienteId(e.target.value)} required className={`${CAMPO} min-w-[200px]`}>
            <option value="">Elegí un cliente</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-faint">Mail</span>
          <input name="mail" type="email" required placeholder="marta@cliente.com" className={`${CAMPO} min-w-[220px] font-mono`} />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-faint">Qué alcanza</span>
          {/* Vacío = TODAS sus obras. No es «ninguna»: se nombra, porque es el default y es el amplio. */}
          <select name="obraId" defaultValue="" disabled={!elegido} className={`${CAMPO} min-w-[220px] disabled:opacity-50`}>
            <option value="">Todas sus obras</option>
            {(elegido?.obras ?? []).map((o) => (
              <option key={o.id} value={o.id}>{o.nombre}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-faint">Nombre (opcional)</span>
          <input name="nombre" placeholder="sin cargar" className={`${CAMPO} min-w-[180px]`} />
        </label>

        <button type="submit" disabled={pendiente} className="min-h-10 rounded-control bg-marca px-5 text-[13px] font-semibold text-ink disabled:opacity-60">
          {pendiente ? 'Guardando…' : 'Habilitar'}
        </button>
      </div>
      {estado.mensaje && (
        <p className={`mt-3 text-[13px] ${estado.ok ? 'text-pos' : 'text-neg'}`}>{estado.mensaje}</p>
      )}
      {elegido && elegido.obras.length === 0 && (
        <p className="mt-3 text-[12px] text-warn">
          {elegido.nombre} no tiene obras cargadas — el mail va a entrar a una pantalla vacía.
        </p>
      )}
    </form>
  )
}

function Tarjeta({ c, darDeBaja }: { c: ClienteFila; darDeBaja: (f: FormData) => void }) {
  return (
    <section className="rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-[15px] font-semibold">{c.nombre}</h2>
        <span className={`rounded-control border px-2 py-0.5 text-[11px] font-semibold ${TONO[c.estado]}`}>{c.rotulo}</span>
        <span className="text-[12px] text-muted">
          {c.obras.length} obra{c.obras.length === 1 ? '' : 's'} · {c.pagos === 0 ? 'sin pagos cargados' : `${c.pagos} pago(s) cargado(s)`}
          {' · '}{c.mails.length} mail{c.mails.length === 1 ? '' : 'es'}
        </span>
      </div>
      {c.queHacer && <p className="mt-1.5 text-[12px] text-muted">{c.queHacer}</p>}

      {c.mails.length > 0 && (
        <table className="mt-3 w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[10px] tracking-[.08em] text-faint">
              {['MAIL', 'PERSONA', 'ALCANCE', ''].map((h) => <th key={h} className="py-1.5 pr-3 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {c.mails.map((m) => (
              <tr key={m.id} className="border-b border-line last:border-0">
                <td className="py-1.5 pr-3 font-mono">{m.mail}</td>
                <td className="py-1.5 pr-3">{m.nombre ?? <span className="text-faint">sin cargar</span>}</td>
                <td className="py-1.5 pr-3 text-muted">{m.alcance}</td>
                <td className="py-1.5 text-right">
                  {/* Un `<form>` por fila con la MISMA acción: el id viaja adentro, no en el estado. */}
                  <form action={darDeBaja} className="inline">
                    <input type="hidden" name="id" value={m.id} />
                    <button type="submit" className="min-h-8 rounded-control px-2 text-[12px] text-muted hover:text-neg">
                      dar de baja
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {c.obras.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-faint">CRONOGRAMA</span>
          {c.obras.map((o) => (
            <Link
              key={o.id}
              href={`/administracion/cronograma?obra=${o.id}`}
              className="min-h-8 rounded-control border border-line px-2.5 py-1 text-[12px] text-muted hover:text-ink"
            >
              {o.nombre}
              {o.estado === 'cerrada' && <span className="ml-1 text-faint">cerrada</span>}
            </Link>
          ))}
        </div>
      )}

      {c.bajas > 0 && (
        <p className="mt-2 text-[11px] text-faint">
          {c.bajas} acceso(s) dado(s) de baja quedan guardados como rastro de quién tuvo acceso.
        </p>
      )}
    </section>
  )
}

/** LOS QUE GOLPEAN LA PUERTA. El caso real es el mail cargado con un typo, y nadie se entera nunca. */
function Golpes({ golpes, mirados }: { golpes: Golpe[]; mirados: number }) {
  return (
    <section className="mt-8">
      <h2 className="text-[15px] font-semibold">Quién intentó entrar sin permiso</h2>
      <p className="mt-1 max-w-[70ch] text-[13px] text-muted">
        Sobre los últimos {mirados} intentos. Casi siempre es el mail cargado con un typo: el cliente
        golpea, el portal le dice que no está habilitado, y el único que se entera es él. Los que ya
        están habilitados no figuran acá.
      </p>
      {golpes.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted">Nadie quedó afuera en esos intentos.</p>
      ) : (
        <table className="mt-3 w-full max-w-[560px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line text-left text-[10px] tracking-[.08em] text-faint">
              {['MAIL QUE PROBÓ', 'VECES', 'ÚLTIMA'].map((h) => <th key={h} className="py-1.5 pr-3 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {golpes.map((g) => (
              <tr key={g.mail} className="border-b border-line last:border-0">
                <td className="py-1.5 pr-3 font-mono">{g.mail}</td>
                <td className="py-1.5 pr-3 tnum font-mono">{g.veces}</td>
                <td className="py-1.5 text-muted">{fecha(g.ultimo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
