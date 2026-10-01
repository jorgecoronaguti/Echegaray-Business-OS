'use client'

// EL PANEL «RENDIR SIN FOTO» DE LA FICHA (D03) Y DE LA PERSONA (30/09/2026). Se abre al costado, como los
// de entregar, devolver e imputar: la ficha queda a la vista y en el teléfono el panel ocupa la pantalla.

import type { Entrega } from '../types'
import { urlEfectivo } from '../logica/url'
import { pesos } from '../logica/entregas'
import { FormularioGastoManual, type EntregaParaRendir } from './FormularioGastoManual'
import { Cerrar, PANEL_CLASE } from './Piezas'
import { panel } from './estilo'

export function PanelRendirManual({ entregas, entregaInicial, cerrarHref, quien }: {
  /** Las entregas abiertas de la persona (o la única, desde la ficha). */
  entregas: Pick<Entrega, 'id' | 'codigo' | 'persona' | 'obra' | 'estructura' | 'en_su_poder'>[]
  entregaInicial?: string | null
  cerrarHref: string
  /** De quién es la plata, para la bajada. */
  quien: string
}) {
  const lista: EntregaParaRendir[] = entregas.map((e) => ({
    id: e.id, codigo: e.codigo, enSuPoder: e.en_su_poder,
    rotulo: `${e.estructura ? 'Estructura' : e.obra ?? 'sin obra'} · le queda ${pesos(e.en_su_poder)}`,
  }))
  const elegida = lista.find((e) => e.id === entregaInicial) ?? lista[0] ?? null
  return (
    <aside style={panel} className={PANEL_CLASE} aria-label="Rendir sin foto" data-testid="panel-rendir">
      <Cerrar titulo="Rendir sin foto" bajada={`Un gasto de ${quien} sin ticket. Lo carga quien lo sabe.`} href={cerrarHref} />
      <FormularioGastoManual
        entregas={lista} entregaInicial={elegida?.id ?? null} volverA={cerrarHref}
        alGuardar={elegida ? urlEfectivo({ entrega: elegida.codigo }) : cerrarHref}
        firmarRecibo={{ tipo: 'ficha' }}
      />
    </aside>
  )
}
