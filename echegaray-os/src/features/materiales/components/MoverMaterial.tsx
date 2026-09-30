'use client'

import { useState, useTransition } from 'react'
import { Boton, Campo, CAMPO } from '@/shared/components/ds'
import { armarItemsMover, desgloseDeLugar, obraDeDestino, renglonesDeMover, repartoAutomatico, type RenglonMover } from '../logica/acopio'
import { leerCantidad, textoStock, type Destino, type Existencia, type Lugar } from '../logica/stock'
import { moverMaterialAction } from '../services/stockAcciones'

// «SOBRA → TALLER / OTRA OBRA» — un movimiento, un remito.
//
// El origen viaja fijo (se llega desde el lugar que tiene el material) y se escriben cantidades sólo en los
// materiales que se mandan: un renglón vacío no se mueve. Todo lo que se manda va en UN remito con un solo
// número, que es lo que el que recibe firma. «Quién recibe» es un nombre escrito, no un usuario: el que
// descarga en el Taller o en la otra obra muchas veces no tiene cuenta en la app.
//
// Desde el Taller (dueño, 30/09/2026) el material puede estar acopiado para una obra. Al mandarlo a ESA obra
// se consume primero su acopio y después lo libre, sin preguntar. Mandar el acopio de una obra a OTRA es
// reasignarlo: aparece como renglón aparte y exige marcar la confirmación (queda con rastro en el libro).
//
// La regla (no mover más de lo que hay, correlativo sin huecos) la aplica Postgres dentro de una sola
// transacción: si algo falla, no queda movimiento ni número consumido. Acá se avisa antes, no se decide.

export function MoverMaterial({ origen, lugares, existencias, destinos, alHacer }: {
  origen: string
  lugares: Lugar[]
  existencias: Existencia[]
  destinos: Destino[]
  alHacer: (remito: { id: string; numero: number }) => void
}) {
  const lugar = lugares.find((l) => l.id === origen)
  const desgloses = desgloseDeLugar(existencias, origen)
  const [cantidades, setCantidades] = useState<Record<string, string>>({})
  const [destino, setDestino] = useState('')
  const [recibe, setRecibe] = useState('')
  const [nota, setNota] = useState('')
  const [confirmaReasignar, setConfirmaReasignar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendiente, startTransition] = useTransition()
  const obraDestino = obraDeDestino(destinos, destino)
  const renglones = renglonesDeMover(desgloses, obraDestino)
  const armado = armarItemsMover(renglones, cantidades, leerCantidad)

  const enviar = (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!destino) return setError('Elegí a dónde va')
    if (armado.error) return setError(armado.error)
    if (armado.reasigna && !confirmaReasignar) return setError('Marcá la confirmación: el acopio de otra obra pasa a ser de ésta')
    setError(null)
    startTransition(async () => {
      const r = await moverMaterialAction({ origen, destino, items: armado.items, recibe, nota })
      if (r.error || !r.remito) return setError(r.error ?? 'No se pudo emitir el remito')
      alHacer(r.remito)
    })
  }

  if (!lugar) return <p className="text-[13px] text-muted">Ese lugar ya no tiene material para mandar.</p>
  return (
    <form id="form-mover-material" onSubmit={enviar} className="space-y-4" data-testid="form-mover">
      <div className="text-[13px] text-muted">Sale de <span className="font-semibold text-ink">{lugar.rotulo}</span></div>
      <Campo rotulo="Va a">
        <select value={destino} onChange={(e) => { setDestino(e.target.value); setConfirmaReasignar(false) }} className={CAMPO} data-testid="mover-destino">
          <option value="">Elegí el Taller o una obra</option>
          {destinos.filter((d) => d.valor !== origen).map((d) => <option key={d.valor} value={d.valor}>{d.rotulo}</option>)}
        </select>
      </Campo>
      <div>
        <div className="mb-1 text-[12px] text-muted">Cuánto se manda (vacío = no se manda)</div>
        <ul className="border-t border-line">
          {renglones.map((r) => (
            <Renglon key={r.clave} r={r} valor={cantidades[r.clave] ?? ''} desgloses={desgloses} obraDestino={obraDestino}
              alCambiar={(t) => setCantidades({ ...cantidades, [r.clave]: t })} />
          ))}
        </ul>
      </div>
      {armado.reasigna && (
        <label className="flex items-start gap-2 text-[13px] text-ink" data-testid="mover-confirma-reasignar">
          <input type="checkbox" checked={confirmaReasignar} onChange={(e) => setConfirmaReasignar(e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>Confirmo: lo acopiado para otra obra pasa a esta obra. Queda registrado en el libro.</span>
        </label>
      )}
      <Campo rotulo="Quién recibe (nombre)">
        <input value={recibe} maxLength={120} onChange={(e) => setRecibe(e.target.value)} className={CAMPO} data-testid="mover-recibe" />
      </Campo>
      <Campo rotulo="Observaciones">
        <input value={nota} maxLength={500} onChange={(e) => setNota(e.target.value)} className={CAMPO} data-testid="mover-nota" />
      </Campo>
      {error && <p role="alert" className="text-[12.5px] text-neg" data-testid="mover-error">{error}</p>}
      <Boton type="submit" variante="primaria" disabled={pendiente} data-testid="mover-confirmar" className="max-lg:min-h-[48px] max-lg:w-full">
        {pendiente ? 'Emitiendo…' : 'Mover y emitir remito'}
      </Boton>
    </form>
  )
}

/** Un material que se puede mandar. El renglón de acopio ajeno se dibuja sangrado y dice para quién está guardado. */
function Renglon({ r, valor, desgloses, obraDestino, alCambiar }: {
  r: RenglonMover; valor: string; desgloses: ReturnType<typeof desgloseDeLugar>; obraDestino: string | null; alCambiar: (t: string) => void
}) {
  const n = leerCantidad(valor)
  const d = desgloses.find((x) => x.material_id === r.material_id)
  // El reparto se muestra recién cuando se escribe algo y hay acopio de la obra destino: es lo que va a hacer la base.
  const reparto = !r.acopio && d && n != null && r.deAcopioDestino > 0 ? repartoAutomatico(d, obraDestino, n) : null
  return (
    <li className={`border-b border-line/60 py-1 ${r.acopio ? 'ml-3 border-l border-line pl-3' : ''}`} data-testid={r.acopio ? 'mover-fila-acopio' : 'mover-fila'}>
      <div className="flex min-h-[44px] items-center gap-3">
        <span className="min-w-0 flex-1 text-[14px] text-ink md:text-[13px]">
          {r.acopio ? `Acopio para ${r.rotuloAcopio}` : r.material}
        </span>
        <span className="whitespace-nowrap text-[12px] text-faint">hay <span className="font-mono tabular-nums">{textoStock(r.maximo, r.unidad)}</span></span>
        <input inputMode="decimal" aria-label={`Cuánto se manda de ${r.material}${r.acopio ? ` acopiado para ${r.rotuloAcopio}` : ''}`} value={valor}
          onChange={(e) => alCambiar(e.target.value)} className={`${CAMPO} !w-[88px] text-right font-mono`} data-testid="mover-cantidad" />
      </div>
      {!r.acopio && r.deAcopioDestino > 0 && (
        <div className="pb-1 text-[12px] text-muted" data-testid="mover-reparto">
          {reparto
            ? <>Sale {reparto.deAcopio > 0 && <>{textoStock(reparto.deAcopio, r.unidad)} del acopio de esta obra</>}{reparto.deAcopio > 0 && reparto.deLibre > 0 && ' y '}{reparto.deLibre > 0 && <>{textoStock(reparto.deLibre, r.unidad)} libre</>}</>
            : <>Incluye {textoStock(r.deAcopioDestino, r.unidad)} acopiado para esta obra: sale primero</>}
        </div>
      )}
    </li>
  )
}
