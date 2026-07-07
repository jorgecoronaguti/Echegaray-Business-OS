'use client'

import { useActionState, useState } from 'react'
import { createMovimientoCajaAction, type ActionState } from '../services/actions'
import type { Cliente, Proveedor, CuentaFinanciera } from '@/features/fundacion/types'
import type { Obra } from '@/features/obras/types'

const initialState: ActionState = { error: null }

export function MovimientoCajaForm({
  clientes,
  obras,
  proveedores,
  cuentas,
}: {
  clientes: Cliente[]
  obras: Obra[]
  proveedores: Proveedor[]
  cuentas: CuentaFinanciera[]
}) {
  const [state, formAction, pending] = useActionState(createMovimientoCajaAction, initialState)
  const [tipo, setTipo] = useState<'cobro' | 'pago'>('cobro')
  const [estado, setEstado] = useState<'proyectado' | 'real'>('proyectado')

  const puedeEnviar =
    cuentas.length > 0 && (tipo === 'cobro' ? clientes.length > 0 && obras.length > 0 : proveedores.length > 0)

  return (
    <form action={formAction} className="flex flex-col gap-2 rounded border p-4">
      <div className="flex flex-wrap gap-2">
        <select
          name="tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as 'cobro' | 'pago')}
          className="rounded border px-2 py-1"
        >
          <option value="cobro">Cobro</option>
          <option value="pago">Pago</option>
        </select>

        <select
          name="estado"
          value={estado}
          onChange={(e) => setEstado(e.target.value as 'proyectado' | 'real')}
          className="rounded border px-2 py-1"
        >
          <option value="proyectado">Proyectado</option>
          <option value="real">Real</option>
        </select>

        <input
          name="monto"
          type="number"
          step="0.01"
          placeholder="Monto"
          required
          className="rounded border px-2 py-1"
        />

        <select name="cuenta_financiera_id" required defaultValue="" className="rounded border px-2 py-1">
          <option value="" disabled>
            Cuenta financiera...
          </option>
          {cuentas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre} ({c.tipo})
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        <label className="flex flex-col text-sm">
          Fecha esperada
          <input name="fecha_esperada" type="date" required className="rounded border px-2 py-1" />
        </label>

        {estado === 'real' && (
          <label className="flex flex-col text-sm">
            Fecha real
            <input name="fecha_real" type="date" required className="rounded border px-2 py-1" />
          </label>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {tipo === 'cobro' && (
          <>
            <select name="cliente_id" required defaultValue="" className="rounded border px-2 py-1">
              <option value="" disabled>
                Cliente...
              </option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            <select name="obra_id" required defaultValue="" className="rounded border px-2 py-1">
              <option value="" disabled>
                Obra...
              </option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </select>
          </>
        )}

        {tipo === 'pago' && (
          <>
            <select name="proveedor_id" required defaultValue="" className="rounded border px-2 py-1">
              <option value="" disabled>
                Proveedor...
              </option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <select name="obra_id" defaultValue="" className="rounded border px-2 py-1">
              <option value="">Obra (opcional — vacío = gasto general)</option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nombre}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      <input
        name="concepto"
        placeholder="Concepto"
        required
        className="rounded border px-2 py-1"
      />

      <input
        name="referencia_externa"
        placeholder="Referencia externa (opcional — ej. Certificado N°3)"
        className="rounded border px-2 py-1"
      />

      <div className="flex flex-wrap gap-2">
        <select name="medio_pago" defaultValue="" className="rounded border px-2 py-1">
          <option value="">Medio de pago (opcional)</option>
          <option value="efectivo">Efectivo</option>
          <option value="transferencia">Transferencia</option>
          <option value="debito">Débito</option>
          <option value="tarjeta">Tarjeta</option>
          <option value="cheque">Cheque</option>
          <option value="echeq">Echeq</option>
          <option value="otro">Otro</option>
        </select>

        <input
          name="referencia_instrumento"
          placeholder="Referencia del instrumento (ej. N° de cheque)"
          className="w-64 rounded border px-2 py-1"
        />
      </div>

      <textarea name="notas" placeholder="Notas (opcional)" className="rounded border px-2 py-1" />

      {state.error && <span className="text-sm text-red-600">{state.error}</span>}

      <button
        type="submit"
        disabled={pending || !puedeEnviar}
        className="self-start rounded bg-black px-3 py-1 text-white disabled:opacity-50"
      >
        {pending ? 'Guardando...' : 'Registrar movimiento'}
      </button>
    </form>
  )
}
