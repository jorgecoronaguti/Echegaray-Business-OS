'use client'

import { useState } from 'react'
import { Drawer } from '@/shared/components/ds'
import { desgloseDeLugar, fechaCorta, type DesgloseMaterial } from '../logica/acopio'
import type { MovimientoMaterial } from '../logica/inventario'
import { textoStock, type Existencia, type Lugar } from '../logica/stock'
import { ReasignarAcopio } from './ReasignarAcopio'

// FICHA DEL MATERIAL — qué hay de este material, dónde, y de lo que está en el Taller, para qué obra está
// guardado (dueño, 30/09/2026). Se abre desde el nombre en el Inventario, sin salir de la lista.
//
// El acopio se cambia acá, al lado del dato: pasarlo a otra obra o liberarlo. Ese cambio queda en el libro
// con quién y cuándo, y se ve en «Historial del destino» sin ir a otra solapa. Mover el material de lugar
// (Taller → obra) no se hace acá: es un remito y vive en Ubicaciones.

type Acopiable = Array<{ id: string; rotulo: string }>

export function FichaMaterial({ material, unidad, existencias, lugares, movimientos, rotulosObra, obras, puedeOperar }: {
  material: { id: string; nombre: string }
  unidad: string | null
  /** Sólo las existencias de este material. */
  existencias: Existencia[]
  lugares: Lugar[]
  /** Sólo los asientos de este material. */
  movimientos: MovimientoMaterial[]
  rotulosObra: Record<string, string>
  obras: Acopiable
  puedeOperar: boolean
}) {
  const [abierta, setAbierta] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} data-testid="abrir-ficha" className="min-w-0 truncate text-left font-medium hover:underline">{material.nombre}</button>
      {abierta && (
        <Drawer titulo={material.nombre} onCerrar={() => setAbierta(false)} ancho={520} testid="panel-ficha-material">
          <Cuerpo material={material} unidad={unidad} existencias={existencias} lugares={lugares} movimientos={movimientos} rotulosObra={rotulosObra} obras={obras} puedeOperar={puedeOperar} />
        </Drawer>
      )}
    </>
  )
}

function Cuerpo({ material, unidad, existencias, lugares, movimientos, rotulosObra, obras, puedeOperar }: Parameters<typeof FichaMaterial>[0]) {
  const porLugar = lugares.flatMap((l) => {
    const d = desgloseDeLugar(existencias, l.id)[0]
    return d ? [{ lugar: l, d }] : []
  })
  const taller = porLugar.find((x) => x.lugar.tipo === 'taller')
  const historial = movimientos
    .filter((m) => m.tipo === 'reasignacion' || m.acopio_id)
    .sort((a, b) => b.creado_en.localeCompare(a.creado_en))
  return (
    <div className="space-y-6" data-testid="ficha-material">
      <section>
        <h3 className="mb-1 border-b border-line pb-1.5 text-[12px] font-semibold text-muted">Dónde está</h3>
        {porLugar.length === 0 && <p className="py-2 text-[13px] text-faint">No hay stock de este material.</p>}
        <ul>
          {porLugar.map(({ lugar, d }) => (
            <li key={lugar.id} className="flex min-h-[32px] items-center gap-3 border-b border-line/60 py-1 text-[13px]" data-testid="ficha-lugar">
              <span className="min-w-0 flex-1 text-ink">{lugar.rotulo}</span>
              <span className="font-mono tabular-nums text-ink">{textoStock(d.total, unidad)}</span>
            </li>
          ))}
        </ul>
      </section>
      {taller && <AcopioDelTaller material={material} unidad={unidad} lugarId={taller.lugar.id} d={taller.d} obras={obras} puedeOperar={puedeOperar} />}
      {historial.length > 0 && (
        <section>
          <h3 className="mb-1 border-b border-line pb-1.5 text-[12px] font-semibold text-muted">Historial del destino</h3>
          <ul data-testid="ficha-historial">
            {historial.map((m) => <li key={m.id} className="border-b border-line/60 py-1.5 text-[12.5px] text-ink">{frase(m, unidad, rotulosObra)}</li>)}
          </ul>
        </section>
      )}
    </div>
  )
}

/** «28/09 · Ana · pasó 3 un de OB-0001 a OB-0002»: quién y cuándo, que es lo que el dueño pidió ver. */
function frase(m: MovimientoMaterial, unidad: string | null, obras: Record<string, string>): string {
  const obra = (id: string | null | undefined) => (id ? (obras[id] ?? id) : 'libre')
  const que = m.tipo === 'reasignacion' ? `pasó ${textoStock(m.cantidad, unidad)} de ${obra(m.acopio_id)} a ${obra(m.acopio_a_id)}`
    : m.tipo === 'entrada' ? `ingresó ${textoStock(m.cantidad, unidad)} para ${obra(m.acopio_id)}`
    : m.tipo === 'consumo' ? `usó ${textoStock(m.cantidad, unidad)} del acopio de ${obra(m.acopio_id)}`
    : m.tipo === 'traslado' ? `mandó ${textoStock(m.cantidad, unidad)} del acopio de ${obra(m.acopio_id)}`
    : `${m.tipo} de ${textoStock(m.cantidad, unidad)} del acopio de ${obra(m.acopio_id)}`
  return `${fechaCorta(m.creado_en)} · ${m.quien ?? 'sin registro de quién'} · ${que}${m.nota ? ` · ${m.nota}` : ''}`
}

function AcopioDelTaller({ material, unidad, lugarId, d, obras, puedeOperar }: {
  material: { id: string; nombre: string }; unidad: string | null; lugarId: string; d: DesgloseMaterial; obras: Acopiable; puedeOperar: boolean
}) {
  const [editando, setEditando] = useState<string | null>(null)
  const filas = [
    ...d.acopios.map((a) => ({ clave: a.obra_id, obra: a.obra_id as string | null, titulo: `Para ${a.rotulo}`, cantidad: a.cantidad, desde: a.desde })),
    ...(d.libre > 0 ? [{ clave: 'libre', obra: null, titulo: 'Libre', cantidad: d.libre, desde: null }] : []),
  ]
  return (
    <section>
      <h3 className="mb-1 border-b border-line pb-1.5 text-[12px] font-semibold text-muted">En el Taller, por destino</h3>
      <ul data-testid="ficha-acopio">
        {filas.map((f) => (
          <li key={f.clave} className="border-b border-line/60 py-1" data-testid="ficha-acopio-fila" data-acopio={f.obra ?? 'libre'}>
            <div className="flex min-h-[32px] items-center gap-3 text-[13px]">
              <span className="min-w-0 flex-1 text-ink">{f.titulo}{f.desde && <span className="ml-2 text-[12px] text-faint">desde {fechaCorta(f.desde)}</span>}</span>
              <span className="font-mono tabular-nums text-ink">{textoStock(f.cantidad, unidad)}</span>
              {puedeOperar && editando !== f.clave && obras.length > 0 && (
                <button type="button" onClick={() => setEditando(f.clave)} data-testid="ficha-cambiar-destino" className="inline-flex min-h-[28px] items-center px-1.5 text-[12px] text-muted hover:text-ink">
                  {f.obra ? 'Cambiar destino' : 'Guardar para obra'}
                </button>
              )}
            </div>
            {editando === f.clave && (
              <ReasignarAcopio material={material.id} lugar={lugarId} de={f.obra} maximo={f.cantidad} rotuloMaterial={material.nombre} obras={obras} alCerrar={() => setEditando(null)} />
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
