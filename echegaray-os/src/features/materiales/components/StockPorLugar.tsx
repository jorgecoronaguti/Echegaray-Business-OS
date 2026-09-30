'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Boton, CAMPO, Vacio } from '@/shared/components/ds'
import { desgloseDeLugar, fechaCorta, obrasAcopiables, type DesgloseMaterial } from '../logica/acopio'
import { leerCantidad, lugaresConStock, textoStock, type Destino, type Existencia, type Lugar } from '../logica/stock'
import { ajusteMaterialAction, usoMaterialAction } from '../services/stockAcciones'
import { ReasignarAcopio } from './ReasignarAcopio'

// STOCK POR LUGAR — qué hay en el Taller y en cada obra. Una sola pieza para las dos caras.
//
// Se lee como una lista agrupada por lugar, no como una tarjeta por dato: el lugar es el título, cada
// material una fila con su número alineado. Las acciones son texto (secundarias) y abren su campo en la
// misma fila: «Usé» resta lo consumido, «Contar» reemplaza el saldo por lo que se contó y deja la
// diferencia en el libro. «Sobra → …» es del LUGAR (se manda más de un material en un solo remito).
//
// El Taller guarda material que ya tiene obra (dueño, 30/09/2026): el material sigue siendo UNA fila y,
// debajo, se parte en «libre» y «para OB-00xx» con su fecha de ingreso. Cada sub-renglón opera sobre SU
// parte (usar o contar lo acopiado no toca lo libre) y se puede cambiar su destino sin moverlo del Taller.
//
// Quien no opera (campo) ve el saldo de su obra y nada más: sin botones que la base rechazaría igual.

type Modo = 'uso' | 'conteo' | 'destino'
type Cara = 'escritorio' | 'telefono'

export function StockPorLugar({ lugares, existencias, puedeOperar, cara, alMover, destinos = [] }: {
  lugares: Lugar[]
  existencias: Existencia[]
  puedeOperar: boolean
  cara: Cara
  /** Escritorio: abre el panel lateral. En el teléfono «mover» es una pantalla propia y no se pasa. */
  alMover?: (lugarId: string) => void
  /** Para cambiar el destino de un acopio hace falta la lista de obras. */
  destinos?: Destino[]
}) {
  const conStock = lugaresConStock(lugares, existencias)
  if (conStock.length === 0) return <Vacio>Todavía no hay material en ningún lugar. Aparece cuando se marca «Llegó» en un pedido.</Vacio>
  const obras = obrasAcopiables(destinos)
  return (
    <div className="space-y-6" data-testid="stock-por-lugar">
      {conStock.map((l) => (
        <section key={l.id} data-testid="stock-lugar" data-lugar={l.id}>
          <div className="mb-1 flex items-center gap-3 border-b border-line pb-1.5">
            <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{l.rotulo}</h2>
            {puedeOperar && (alMover
              ? <button type="button" onClick={() => alMover(l.id)} data-testid="sobra" className="inline-flex min-h-[28px] items-center px-1.5 text-[12px] font-semibold text-ink hover:underline">Sobra → Taller u otra obra</button>
              : <Link href={`/campo/material/mover?desde=${l.id}`} data-testid="sobra" className="inline-flex min-h-[44px] items-center px-2 text-[14px] font-semibold text-ink">Sobra → Taller u otra obra</Link>)}
          </div>
          <ul>
            {desgloseDeLugar(existencias, l.id).map((d) => (
              <FilaMaterial key={d.material_id} d={d} lugar={l} puedeOperar={puedeOperar} cara={cara} obras={obras} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Un material en un lugar. Sin acopio es un solo renglón, igual que antes; con acopio, el total y sus partes. */
function FilaMaterial({ d, lugar, puedeOperar, cara, obras }: { d: DesgloseMaterial; lugar: Lugar; puedeOperar: boolean; cara: Cara; obras: Array<{ id: string; rotulo: string }> }) {
  const comun = { material: d.material_id, rotuloMaterial: d.material, unidad: d.unidad, lugar: lugar.id, puedeOperar, cara, obras, puedeAcopiar: lugar.tipo === 'taller' }
  if (d.acopios.length === 0) return <Renglon {...comun} titulo={d.material} cantidad={d.total} acopio={null} />
  return (
    <li data-testid="stock-fila" className="border-b border-line/60 py-1.5">
      <div className="flex min-h-[32px] items-center gap-3">
        <span className="min-w-0 flex-1 text-[14px] font-medium text-ink md:text-[13px]">{d.material}</span>
        <span className="whitespace-nowrap font-mono text-[14px] tabular-nums text-ink md:text-[13px]" data-testid="stock-cantidad">{textoStock(d.total, d.unidad)}</span>
      </div>
      <ul className="ml-3 border-l border-line pl-3" data-testid="stock-acopios">
        {d.libre > 0 && <Renglon {...comun} titulo="Libre" cantidad={d.libre} acopio={null} />}
        {d.acopios.map((a) => (
          <Renglon key={a.obra_id} {...comun} titulo={`Para ${a.rotulo}`} detalle={a.desde ? `desde ${fechaCorta(a.desde)}` : undefined} cantidad={a.cantidad} acopio={a.obra_id} />
        ))}
      </ul>
    </li>
  )
}

interface PropsRenglon {
  material: string
  rotuloMaterial: string
  unidad: string | null
  lugar: string
  titulo: string
  detalle?: string
  cantidad: number
  /** Obra del acopio que opera el renglón; `null` = lo libre. */
  acopio: string | null
  puedeOperar: boolean
  /** Sólo el Taller acopia: en una obra no se ofrece «Para obra». */
  puedeAcopiar: boolean
  cara: Cara
  obras: Array<{ id: string; rotulo: string }>
}

function Renglon(p: PropsRenglon) {
  const router = useRouter()
  const [modo, setModo] = useState<Modo | null>(null)
  const [texto, setTexto] = useState('')
  const [motivo, setMotivo] = useState('recuento')
  const [error, setError] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()
  const tel = p.cara === 'telefono'
  const alto = tel ? 'inline-flex min-h-[44px] items-center px-3 text-[14px]' : 'inline-flex min-h-[28px] items-center px-1.5 text-[12px]'
  const conDestino = p.puedeAcopiar && p.obras.length > 0
  const esSub = p.titulo !== p.rotuloMaterial

  const cerrar = () => { setModo(null); setError(null); setTexto('') }
  const confirmar = () => {
    // El recuento admite 0 («no queda nada»); «usé» no: consumir cero no es un hecho.
    const n = modo === 'conteo' && texto.trim() === '0' ? 0 : leerCantidad(texto)
    if (n == null) return setError(modo === 'uso' ? 'Poné cuánto usaste' : 'Poné lo que contaste')
    setError(null)
    startTransition(async () => {
      const r = modo === 'uso'
        ? await usoMaterialAction({ material: p.material, lugar: p.lugar, cantidad: n, acopio: p.acopio })
        : await ajusteMaterialAction({ material: p.material, lugar: p.lugar, contado: n, motivo, acopio: p.acopio })
      if (r.error) return setError(r.error)
      cerrar()
      router.refresh()
    })
  }

  return (
    <li data-testid={esSub ? 'stock-acopio' : 'stock-fila'} data-acopio={p.acopio ?? 'libre'} className={esSub ? 'py-1' : 'border-b border-line/60 py-1.5'}>
      <div className="flex min-h-[32px] items-center gap-3">
        <span className="min-w-0 flex-1 text-[14px] text-ink md:text-[13px]">
          {p.titulo}{p.detalle && <span className="ml-2 text-[12px] text-faint">{p.detalle}</span>}
        </span>
        <span className="whitespace-nowrap font-mono text-[14px] tabular-nums text-ink md:text-[13px]" data-testid={esSub ? 'acopio-cantidad' : 'stock-cantidad'}>{textoStock(p.cantidad, p.unidad)}</span>
        {p.puedeOperar && !modo && (
          <span className="flex flex-wrap items-center justify-end">
            <button type="button" onClick={() => setModo('uso')} data-testid="uso" className={`${alto} text-muted hover:text-ink`}>Usé</button>
            <button type="button" onClick={() => setModo('conteo')} data-testid="conteo" className={`${alto} text-faint hover:text-ink`}>Contar</button>
            {conDestino && (
              <button type="button" onClick={() => setModo('destino')} data-testid="cambiar-destino" className={`${alto} text-faint hover:text-ink`}>
                {p.acopio ? 'Cambiar destino' : 'Guardar para obra'}
              </button>
            )}
          </span>
        )}
      </div>
      {modo === 'destino' && (
        <ReasignarAcopio material={p.material} lugar={p.lugar} de={p.acopio} maximo={p.cantidad} rotuloMaterial={p.rotuloMaterial} obras={p.obras} cara={p.cara} alCerrar={cerrar} />
      )}
      {(modo === 'uso' || modo === 'conteo') && (
        <div className="flex flex-wrap items-center gap-2 pb-1 pt-1" data-testid="stock-form">
          <input inputMode="decimal" autoFocus aria-label={modo === 'uso' ? `Cuánto usaste de ${p.rotuloMaterial}` : `Cuánto contaste de ${p.rotuloMaterial}`}
            placeholder={modo === 'uso' ? 'Usé' : 'Hay'} value={texto} onChange={(ev) => setTexto(ev.target.value)}
            className={`${CAMPO} !w-[96px] text-right font-mono`} data-testid="stock-input" />
          {modo === 'conteo' && (
            <select aria-label="Motivo" value={motivo} onChange={(ev) => setMotivo(ev.target.value)} className={`${CAMPO} !w-auto`} data-testid="stock-motivo">
              <option value="recuento">Recuento</option>
              <option value="perdido">Se perdió</option>
              <option value="descartado">Se descartó</option>
            </select>
          )}
          <Boton type="button" variante="primaria" onClick={confirmar} disabled={pendiente} data-testid="stock-confirmar">{pendiente ? 'Guardando…' : 'Confirmar'}</Boton>
          <button type="button" onClick={cerrar} disabled={pendiente} className={`${alto} text-muted`}>No</button>
          {error && <span role="alert" className="w-full text-[11.5px] text-neg">{error}</span>}
        </div>
      )}
    </li>
  )
}
