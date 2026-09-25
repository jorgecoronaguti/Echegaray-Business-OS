// LA CABECERA DE LA CARTERA DEL CRM — la misma de Obras «Ver: Tabla» (dueño, 25/09/2026).
//
// «Unificar diseño, sólo UI, de cómo se ve Obras a cómo se ve Admin Clientes: que se vea como Obras
// vista tabla.» Título de 19px con la bajada de conteos debajo, buscador en caja de 230×32 y la
// primaria amarilla a la derecha; debajo, los recortes subrayados con su número. Fija bajo la barra de
// la app, como la de Obras. Todas las medidas salen de `shared/components/cartera/estiloCartera.ts`,
// que es de donde las lee `CarteraObras`: si una cambia, cambian las dos.
//
// LO QUE NO SE COPIA, Y POR QUÉ: el «Ver Tabla · Gantt». Clientes no tiene una segunda vista de la
// misma lista; un conmutador con una sola opción es una solapa que no elige nada.
//
// SE DIBUJA EN EL SERVIDOR. Obras decide el teléfono en el navegador (`useAnchoVentana`); acá el
// teléfono lo deciden las clases `CLASE_…_TELEFONO` bajo 768px, el mismo corte que ya usa la tabla.
// Un solo elemento por control: el buscador y la primaria no se duplican para cada ancho, así los
// `data-testid` siguen siendo únicos.

import Link from 'next/link'
import { BuscadorFilo } from '@/shared/components/v2/BuscadorFilo'
import { HUECO_PANEL_FILO } from '@/shared/components/v2/CabeceraSeccion'
import {
  CLASE_CHIP_TELEFONO, CLASE_CHIP_TELEFONO_ACTIVO, CLASE_CHIP_TELEFONO_APAGADO, CLASE_ENCABEZADO_TELEFONO,
  CLASE_FILTROS_TELEFONO, ENCABEZADO_FIJO, ESTILO_BAJADA, ESTILO_TITULO, estiloChip, estiloCuentaChip,
  estiloFiltros, estiloPrimaria,
} from '@/shared/components/cartera/estiloCartera'
import { IcoCartera, type TRAZOS_CARTERA } from '@/shared/components/cartera/IcoCartera'

export interface RecorteClientes {
  clave: string
  etiqueta: string
  href: string
  activo: boolean
  /** Cuántos clientes entran en el recorte, contando TODA la cartera (como los chips de Obras). */
  cuenta: number
  icono: keyof typeof TRAZOS_CARTERA
}

export function CabeceraClientes({ bajada, buscador, alta, recortes, espacioPanel }: {
  /** «5 clientes · 8 trabajos en curso · $ … contratado en curso». En el teléfono no se dibuja. */
  bajada: string
  buscador: { accion: string; q?: string; oculto: Record<string, string | undefined> }
  /** `undefined` = este nivel no da de alta clientes: no se dibuja ningún amarillo. */
  alta?: { href: string; etiqueta: string }
  recortes: RecorteClientes[]
  /** Con el panel del cliente abierto, los controles se corren para quedar sobre la lista que gobiernan. */
  espacioPanel: boolean
}) {
  return (
    <div style={ENCABEZADO_FIJO} className={CLASE_ENCABEZADO_TELEFONO} data-testid="vistas-clientes">
      <div className="max-md:!flex-col max-md:!items-stretch max-md:!gap-[18px]"
        style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 }}>
          <div style={ESTILO_TITULO} data-testid="vista-clientes">Clientes</div>
          <div style={ESTILO_BAJADA} className="max-md:hidden" data-testid="bajada-clientes">{bajada}</div>
        </div>
        <div className="max-md:!flex-col max-md:!items-stretch"
          style={{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto' }}>
          <BuscadorFilo caja accion={buscador.accion} q={buscador.q} placeholder="Buscar cliente"
            oculto={buscador.oculto} testid="buscar-cliente" />
          {alta && (
            // EN EL TELÉFONO LA PRIMARIA VA AL PIE, sobre la barra de abajo (M01): el envoltorio es
            // `contents` en escritorio —el botón queda al lado del buscador— y la banda fija en el teléfono.
            <div className="md:contents max-md:fixed max-md:inset-x-0 max-md:bottom-16 max-md:z-[19] max-md:border-t max-md:border-line max-md:bg-surface max-md:px-4 max-md:pb-[18px] max-md:pt-3">
              <Link href={alta.href} prefetch={false} data-testid="abrir-alta-cliente"
                className="max-md:!h-12 max-md:!gap-2 max-md:!text-[14px]"
                style={estiloPrimaria(false)}>
                <IcoCartera d="mas" s={13} className="max-md:!h-[15px] max-md:!w-[15px]" />{alta.etiqueta}
              </Link>
            </div>
          )}
        </div>
        {espacioPanel && (
          <span className="hidden shrink-0 lg:block" style={{ width: HUECO_PANEL_FILO }} data-testid="hueco-panel" aria-hidden />
        )}
      </div>

      <div style={estiloFiltros(false)} className={CLASE_FILTROS_TELEFONO} data-testid="filtro-cartera">
        {recortes.map((r) => (
          <Link key={r.clave} href={r.href} prefetch={false} data-testid={`filtro-cartera-${r.clave}`}
            aria-current={r.activo ? 'true' : undefined}
            className={`${CLASE_CHIP_TELEFONO} ${r.activo ? CLASE_CHIP_TELEFONO_ACTIVO : CLASE_CHIP_TELEFONO_APAGADO}`}
            style={{ ...estiloChip(r.activo, false), textDecoration: 'none' }}>
            <IcoCartera d={r.icono} s={12} />{r.etiqueta}
            <span data-testid={`filtro-cartera-${r.clave}-cuenta`} className="max-md:!font-mono max-md:!text-[11px]"
              style={estiloCuentaChip(false)}>{r.cuenta}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}

