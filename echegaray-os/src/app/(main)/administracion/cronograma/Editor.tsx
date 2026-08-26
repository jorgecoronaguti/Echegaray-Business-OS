'use client'

import { useActionState, useState } from 'react'
import { guardarCronograma, type Resultado } from './acciones'
import { TIPOS, MONEDAS, ESTADOS, importe, loQueVeElCliente } from '@/features/administracion/services/cronogramaAdmin'

// EL EDITOR DEL CRONOGRAMA — lo que se guarda acá lo ve el cliente, sin nadie en el medio.
//
// Por eso arriba de todo va el PREVIO: pagado, pendiente y cuántas líneas quedan fuera de la suma.
// Se calcula con la MISMA función que usa el portal, así que no es una aproximación de lo que va a
// ver: es lo que va a ver.

export type FilaEditor = {
  id: string | null
  orden: number
  tipo: string
  rotulo: string
  monto: string
  moneda: string
  fechaPrevista: string
  fechaPago: string
  facturaNumero: string
  reciboNumero: string
  estado: string
  nota: string
}

const VACIA = (orden: number): FilaEditor => ({
  id: null, orden, tipo: 'certificado', rotulo: '', monto: '', moneda: 'ARS',
  fechaPrevista: '', fechaPago: '', facturaNumero: '', reciboNumero: '', estado: '', nota: '',
})

const $ = (n: number) => `$ ${Math.round(n).toLocaleString('es-AR')}`

export function Editor({ obraId, obra, inicial }: { obraId: string; obra: string; inicial: FilaEditor[] }) {
  const [filas, setFilas] = useState<FilaEditor[]>(inicial)
  const [estado, enviar, pendiente] = useActionState(guardarCronograma, { ok: false, mensaje: '' } as Resultado)

  const cambiar = (i: number, campo: keyof FilaEditor, valor: string) =>
    setFilas((f) => f.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)))

  const previo = loQueVeElCliente(filas.map((f) => ({
    ...f, monto: importe(f.monto), moneda: f.moneda as 'ARS' | 'USD',
    fechaPago: f.fechaPago || null, tipo: f.tipo as 'anticipo',
  })) as never)

  const paraGuardar = JSON.stringify({
    obraId,
    filas: filas.map((f) => ({
      id: f.id, orden: f.orden, tipo: f.tipo, rotulo: f.rotulo, monto: f.monto, moneda: f.moneda,
      fechaPrevista: f.fechaPrevista, fechaPago: f.fechaPago, facturaNumero: f.facturaNumero,
      reciboNumero: f.reciboNumero, estado: f.estado || null, nota: f.nota,
    })),
  })

  return (
    <form action={enviar} className="mt-4">
      <input type="hidden" name="cronograma" value={paraGuardar} />

      {/* EL PREVIO, ARRIBA. Calculado con la misma función del portal: es lo que el cliente va a ver. */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-card border border-line bg-surface-quiet px-4 py-3">
        <span className="text-[11px] font-semibold tracking-[.09em] text-faint">LO QUE VE EL CLIENTE</span>
        <span className="text-sm">Pagado <b className="tnum font-mono">{$(previo.pagado)}</b></span>
        <span className="text-sm">Pendiente <b className="tnum font-mono">{$(previo.pendiente)}</b></span>
        {previo.sinSumar ? (
          <span className="text-sm text-warn">{previo.sinSumar} línea(s) fuera de la suma — sin monto o en otra moneda</span>
        ) : null}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-line-strong text-left text-[10px] tracking-[.08em] text-faint">
              {['#', 'TIPO', 'RÓTULO QUE VE EL CLIENTE', 'MONTO', 'MON.', 'PREVISTA', 'PAGO', 'FACTURA', 'RECIBO', 'ESTADO', ''].map((h) => (
                <th key={h} className="px-2 py-2 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={f.id ?? `nueva-${i}`} className="border-b border-line">
                <td className="px-2 py-1.5"><Campo v={String(f.orden)} on={(v) => cambiar(i, 'orden', v)} ancho="w-12" /></td>
                <td className="px-2 py-1.5"><Selector v={f.tipo} ops={TIPOS} on={(v) => cambiar(i, 'tipo', v)} /></td>
                <td className="px-2 py-1.5"><Campo v={f.rotulo} on={(v) => cambiar(i, 'rotulo', v)} ancho="w-full min-w-[240px]" /></td>
                <td className="px-2 py-1.5"><Campo v={f.monto} on={(v) => cambiar(i, 'monto', v)} ancho="w-32" mono placeholder="sin cargar" /></td>
                <td className="px-2 py-1.5"><Selector v={f.moneda} ops={MONEDAS} on={(v) => cambiar(i, 'moneda', v)} /></td>
                <td className="px-2 py-1.5"><Campo v={f.fechaPrevista} on={(v) => cambiar(i, 'fechaPrevista', v)} ancho="w-32" tipo="date" /></td>
                <td className="px-2 py-1.5"><Campo v={f.fechaPago} on={(v) => cambiar(i, 'fechaPago', v)} ancho="w-32" tipo="date" /></td>
                <td className="px-2 py-1.5"><Campo v={f.facturaNumero} on={(v) => cambiar(i, 'facturaNumero', v)} ancho="w-28" mono /></td>
                <td className="px-2 py-1.5"><Campo v={f.reciboNumero} on={(v) => cambiar(i, 'reciboNumero', v)} ancho="w-24" mono /></td>
                <td className="px-2 py-1.5"><Selector v={f.estado} ops={['', ...ESTADOS]} on={(v) => cambiar(i, 'estado', v)} /></td>
                <td className="px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => setFilas((x) => x.filter((_, j) => j !== i))}
                    className="min-h-8 rounded-control px-2 text-[12px] text-muted hover:text-neg"
                  >
                    quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setFilas((f) => [...f, VACIA(Math.max(0, ...f.map((x) => x.orden)) + 1)])}
          className="min-h-10 rounded-control border border-line-strong bg-surface px-4 text-[13px]"
        >
          Agregar pago
        </button>
        <button type="submit" disabled={pendiente} className="min-h-10 rounded-control bg-marca px-5 text-[13px] font-semibold text-ink disabled:opacity-60">
          {pendiente ? 'Guardando…' : `Guardar — ${obra}`}
        </button>
        {estado.mensaje ? (
          <span className={`text-[13px] ${estado.ok ? 'text-pos' : 'text-neg'}`}>{estado.mensaje}</span>
        ) : null}
      </div>
    </form>
  )
}

function Campo({ v, on, ancho, mono, tipo = 'text', placeholder }: {
  v: string; on: (v: string) => void; ancho: string; mono?: boolean; tipo?: string; placeholder?: string
}) {
  return (
    <input
      type={tipo} value={v} onChange={(e) => on(e.target.value)} placeholder={placeholder}
      className={`${ancho} ${mono ? 'font-mono' : ''} min-h-9 rounded-control border border-line bg-surface px-2 text-[13px] outline-none focus:border-ink`}
    />
  )
}

function Selector({ v, ops, on }: { v: string; ops: readonly string[]; on: (v: string) => void }) {
  return (
    <select value={v} onChange={(e) => on(e.target.value)} className="min-h-9 rounded-control border border-line bg-surface px-1.5 text-[13px]">
      {ops.map((o) => <option key={o} value={o}>{o || '—'}</option>)}
    </select>
  )
}
