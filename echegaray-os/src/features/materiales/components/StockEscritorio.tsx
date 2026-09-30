'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Boton, Drawer } from '@/shared/components/ds'
import type { Destino, Existencia, Lugar, Remito } from '../logica/stock'
import { MoverMaterial } from './MoverMaterial'
import { PanelRemito } from './ListaRemitos'
import { StockPorLugar } from './StockPorLugar'

// STOCK EN LA COMPUTADORA — el saldo por lugar y, sin irse de la lista, el panel para mandar sobrante.
//
// Tras emitir, el panel se transforma en el remito recién hecho (listo para imprimir): es lo que se
// entrega junto con el material. El remito se busca en lo que la página volvió a leer (`router.refresh`),
// no se arma acá: lo que se imprime es la copia guardada, nunca lo que el navegador cree haber mandado.

export function StockEscritorio({ lugares, existencias, destinos, remitos, puedeOperar }: {
  lugares: Lugar[]
  existencias: Existencia[]
  destinos: Destino[]
  remitos: Remito[]
  puedeOperar: boolean
}) {
  const router = useRouter()
  const [desde, setDesde] = useState<string | null>(null)
  const [emitido, setEmitido] = useState<string | null>(null)
  const remito = remitos.find((r) => r.id === emitido) ?? null

  return (
    <>
      <StockPorLugar lugares={lugares} existencias={existencias} puedeOperar={puedeOperar} cara="escritorio" alMover={setDesde} destinos={destinos} />
      {desde && !emitido && (
        <Drawer
          titulo="Sobra → Taller u otra obra" onCerrar={() => setDesde(null)} ancho={480} testid="panel-mover"
          pie={
            <>
              <Boton type="submit" form="form-mover-material" variante="primaria">Mover y emitir remito</Boton>
              <Boton type="button" variante="discreta" onClick={() => setDesde(null)}>Cancelar</Boton>
            </>
          }
        >
          <MoverMaterial origen={desde} lugares={lugares} existencias={existencias} destinos={destinos}
            alHacer={(r) => { setEmitido(r.id); router.refresh() }} />
        </Drawer>
      )}
      {emitido && (remito
        ? <PanelRemito remito={remito} alCerrar={() => { setEmitido(null); setDesde(null) }} />
        : <Drawer titulo="Remito emitido" onCerrar={() => { setEmitido(null); setDesde(null) }} ancho={560} testid="panel-remito">
            <p className="text-[13px] text-muted">Cargando el remito…</p>
          </Drawer>)}
    </>
  )
}
