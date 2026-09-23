// EL NIVEL 3 DE OPERACIÓN — Impedimentos · Pedidos · Equipos · Compras (09–12 · M12–M15).
//
// Escritorio: dentro del bloque blanco de la cabecera, `gap 14` de las solapas, texto 12,5 con su
// icono de 12 y el conteo en faint; la activa 500 con `inset 0 -1.5px 0 #1F1F1E`. Es la misma banda que
// `SubNavTrabajo`, y se dibuja acá con `-mx-5 -mt-3.5` porque la página la monta dentro del marco de 20px.
//
// Teléfono: la fila corrible de pastillas de 36px (M12), sin icono grande ni banda gris.
//
// Compras sólo para quien VE ECONOMÍA (brief 23/09): al jefe de obra no se le dibuja la pastilla.

import Link from 'next/link'
import { C, MONO } from '../canon/tokens'
import { Ico, P } from '../canon/Ico'
import { SUBS_OPERACION, type SubOperacion } from '../../services/subsOperacion'
import { FilaPastillas, PastillaM } from './piezas'

const ROTULO: Record<SubOperacion, string> = { impedimentos: 'Impedimentos', pedidos: 'Pedidos', equipos: 'Equipos', compras: 'Compras' }
const ICONO: Record<SubOperacion, React.ReactNode> = { impedimentos: P.bloqueo, pedidos: P.material, equipos: P.equipo, compras: P.compra }

export function subsVisibles(veEconomia: boolean): SubOperacion[] {
  return SUBS_OPERACION.filter((s) => s !== 'compras' || veEconomia)
}

export function SubsOperacion({ obraId, sub, cuenta, veEconomia }: {
  obraId: string
  sub: SubOperacion
  /** `null` = no se pudo contar: no se dibuja número, no se dibuja 0. */
  cuenta: Record<SubOperacion, number | null>
  veEconomia: boolean
}) {
  const items = subsVisibles(veEconomia).map((id) => ({
    id, label: ROTULO[id], href: `/obras/${obraId}?vista=operacion&sub=${id}`, activo: id === sub, n: cuenta[id],
  }))
  return (
    <>
      <div className="-mx-5 -mt-3.5 hidden md:flex" data-testid="subs-operacion" style={{
        background: C.superficie, alignItems: 'center', gap: '16px', padding: '14px 30px 2px', fontSize: '12.5px', flexShrink: 0,
      }}>
        {items.map((i) => (
          <Link key={i.id} href={i.href} prefetch={false} data-testid={`sub-${i.id}`} aria-current={i.activo ? 'page' : undefined}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', paddingBottom: '2px',
              color: i.activo ? C.tinta : C.tintaSuave, fontWeight: i.activo ? 500 : 400,
              boxShadow: i.activo ? `inset 0 -1.5px 0 ${C.tinta}` : 'none',
            }}>
            <Ico d={ICONO[i.id]} s={12} />{i.label}
            {i.n != null && <span style={{ color: C.tenue, fontWeight: 400, fontFamily: MONO, fontSize: '11px' }}>{i.n}</span>}
          </Link>
        ))}
      </div>

      <div className="flex md:hidden">
        <FilaPastillas testid="subs-operacion-telefono">
          {items.map((i) => (
            <Link key={i.id} href={i.href} prefetch={false} style={{ display: 'flex', flexShrink: 0 }}>
              <PastillaM activa={i.activo} href={i.href} icono={<Ico d={ICONO[i.id]} s={12} />} n={i.n} testid={`sub-telefono-${i.id}`}>
                {i.label}
              </PastillaM>
            </Link>
          ))}
        </FilaPastillas>
      </div>
    </>
  )
}
