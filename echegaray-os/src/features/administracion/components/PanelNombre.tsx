// RESOLVER UN NOMBRE DEL SHEET — buscar el proveedor canónico, o declarar que no es ninguno.
//
// ═══ POR QUÉ UN BUSCADOR Y NO UN DESPLEGABLE ═══
//
// El desplegable que había acá listaba TODOS los proveedores activos. Con 36 todavía se puede
// recorrer; el maestro crece con cada nombre que se resuelve, y un `<select>` de 200 entradas se
// resuelve mirando cuál se parece — que es la forma más rápida de vincular el equivocado. El
// buscador va contra la base y por las dos identidades reales: el nombre normalizado y el CUIT.
// Escribir «30708390557» o «30-70839055-7» encuentra lo mismo.
//
// ═══ LAS TRES SALIDAS, Y NINGUNA AUTOMÁTICA ═══
//
// Vincular a uno que existe · crear uno nuevo con el nombre ya cargado · declarar que no es un
// proveedor. La tercera es la que permite que la cola llegue a cero: SUELDOS ($197,5M), ARCA
// ($85,4M), SAC, BANCO y FCL son conceptos de gasto y no hay proveedor que inventarles. Sin esa
// salida quedarían para siempre arriba de la lista, y una lista que no puede vaciarse deja de
// mirarse.
//
// Lo que NO hay es un botón de "unir los parecidos". En la cola conviven «SOSTEM SA» y «SOSTEN SA»,
// «LINARC» y «LINARC SAS», «LA AGUILANA» y «LA AGUILANA - OLIVIERI ESTEVEZ ALDO MARCELO». Puede que
// alguno de esos pares sea la misma empresa: lo decide una persona con la factura a la vista, no una
// distancia de edición. Y el CUIT no se completa solo nunca: no hay de dónde sacarlo sin inventarlo.

import Link from 'next/link'
import {
  BotonAccion, CTRL, FormAccion,
  type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
import { Eyebrow, Nulo, Num } from '@/shared/components/ds'
import { fecha, plata } from '@/features/obras/components/formato'
import { CamposProveedor } from './PanelProveedor'
import { formatearCuit } from './TablaProveedores'
import type { NombrePendiente, Proveedor } from '../types'

function Candidatos({ nombre, candidatos, vincular }: {
  nombre: NombrePendiente
  candidatos: Proveedor[]
  vincular: AccionFormulario
}) {
  if (candidatos.length === 0) {
    return (
      <p data-testid="sin-candidatos" className="py-3 text-[12.5px] text-muted">
        Ningún proveedor del maestro coincide con lo buscado.
      </p>
    )
  }
  return (
    <div className="max-h-72 overflow-y-auto" data-testid="candidatos">
      {candidatos.map((p) => (
        <div key={p.id} data-testid="candidato" className="flex items-center gap-3 border-b border-[#EFEEEA] py-2 last:border-0">
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[13px] text-ink">{p.nombre}</span>
            <span className="block truncate text-[11px] text-faint">
              {p.cuit ? formatearCuit(p.cuit) : 'sin CUIT'}
              {p.razon_social && p.razon_social !== p.nombre ? ` · ${p.razon_social}` : ''}
            </span>
          </div>
          <FormAccion accion={vincular} testid={`vincular-${p.id}`} enviar="Vincular" mensajeOk="Vinculado." className="shrink-0">
            <input type="hidden" name="nombre_norm" value={nombre.nombre_norm} />
            <input type="hidden" name="nombre_origen" value={nombre.nombre_origen} />
            <input type="hidden" name="proveedor_id" value={p.id} />
          </FormAccion>
        </div>
      ))}
    </div>
  )
}

export function PanelNombre({
  nombre, candidatos, busqueda, accionBuscar, camposBuscar, cerrarHref,
  vincular, crearYVincular, noEsProveedor,
}: {
  nombre: NombrePendiente
  candidatos: Proveedor[]
  busqueda?: string
  /** La misma ruta: el buscador es un `form` GET sobre sí mismo, sin una línea de JavaScript. */
  accionBuscar: string
  /** Lo que hay que preservar al buscar: la pestaña abierta y el nombre en el panel. */
  camposBuscar: Record<string, string | undefined>
  cerrarHref: string
  vincular: AccionFormulario
  crearYVincular: (nombreNorm: string, nombreOrigen: string, form: FormData) => Promise<ResultadoAccion>
  noEsProveedor: (nombreNorm: string, nombreOrigen: string) => Promise<ResultadoAccion>
}) {
  return (
    <aside
      data-testid="panel-nombre"
      className="w-full shrink-0 border-t border-line pt-4 lg:w-[392px] lg:border-l lg:border-t-0 lg:py-1 lg:pl-6 lg:pt-0"
    >
      <div className="flex items-baseline gap-2.5">
        <h2 className="min-w-0 flex-1 truncate font-mono text-[14px] font-semibold text-ink">{nombre.nombre_origen}</h2>
        <Link
          href={cerrarHref} data-testid="cerrar-nombre" aria-label="Cerrar el panel"
          className="shrink-0 text-[12px] leading-none text-faint transition-colors hover:text-ink"
        >✕</Link>
      </div>
      <p className="mt-1.5 text-[12px] text-muted">
        {nombre.comprobantes} comprobante(s) ·{' '}
        {Number(nombre.total ?? 0) > 0 ? <Num className="text-muted">{plata(nombre.total)}</Num> : <Nulo>sin importe</Nulo>}
        {' · '}
        <Num className="text-faint">{fecha(nombre.primera_fecha)} → {fecha(nombre.ultima_fecha)}</Num>
      </p>

      {/* ── 1 · ES UN PROVEEDOR QUE YA EXISTE ── */}
      <Eyebrow className="mb-2 mt-5">Buscar en el maestro</Eyebrow>
      <form method="get" action={accionBuscar} className="mb-1 flex items-end gap-2" data-testid="buscar-proveedor">
        {Object.entries(camposBuscar).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
        <label className="min-w-0 flex-1">
          <span className="sr-only">Buscar en el maestro</span>
          <input
            type="search" name="bq" defaultValue={busqueda ?? ''}
            placeholder="Nombre, razón social o CUIT" className={CTRL} data-testid="buscar-proveedor-q"
          />
        </label>
        <button
          type="submit"
          className="h-control shrink-0 rounded-control border border-line px-3 text-[12.5px] text-muted transition-colors hover:bg-surface-quiet hover:text-ink"
        >Buscar</button>
      </form>
      <Candidatos nombre={nombre} candidatos={candidatos} vincular={vincular} />

      {/* ── 2 · ES UN PROVEEDOR NUEVO ── */}
      <details className="mt-5 border-t border-line pt-3" data-testid="crear-desde-pendiente">
        <summary className="cursor-pointer text-[12.5px] text-muted transition-colors hover:text-ink">
          + Es un proveedor nuevo: crearlo con este nombre
        </summary>
        <div className="pt-3">
          <FormAccion
            accion={crearYVincular.bind(null, nombre.nombre_norm, nombre.nombre_origen)}
            testid="form-crear-vincular"
            enviar="Crear y vincular"
            mensajeOk="Proveedor creado y vinculado."
          >
            {/* El nombre viene precargado con el texto del Sheet: es el que hay que reconocer después,
                y retipearlo es la forma más rápida de crear una variante más. El CUIT queda vacío. */}
            <CamposProveedor proveedor={{
              id: '', nombre: nombre.nombre_origen, razon_social: null, cuit: null, notas: null, activo: true,
            }} />
          </FormAccion>
        </div>
      </details>

      {/* ── 3 · NO ES UN PROVEEDOR ── */}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-3">
        <BotonAccion accion={noEsProveedor} args={[nombre.nombre_norm, nombre.nombre_origen]} testid="no-es-proveedor">
          No es un proveedor
        </BotonAccion>
        <span className="text-[11px] text-faint">Para sueldos, impuestos o movimientos del banco.</span>
      </div>
    </aside>
  )
}
