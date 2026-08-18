// LOS NOMBRES DEL SHEET QUE TODAVÍA NO SON NADIE — la pantalla donde se evita el duplicado.
//
// ═══ QUÉ ES ESTA LISTA ═══
//
// `Compras!E` del Sheet es texto libre, y su espejo en Postgres (`costos_obra.proveedor`) tiene 845
// comprobantes con 112 nombres distintos. De esos, 33 coinciden EXACTAMENTE con un proveedor del
// maestro; los otros 79 —284 comprobantes— no son nadie. Esta es esa cola, ordenada por cuánto pesa
// cada nombre: resolver el que aparece 190 veces mueve mucho más costo de obra que el que aparece
// una sola vez.
//
// ═══ POR QUÉ NO HAY UN BOTÓN DE "VINCULAR TODO LO PARECIDO" ═══
//
// Porque en esta lista hay "SUELDOS" (58 comprobantes), "ARCA" (34), "SINDICATOS" (24) y "BANCO"
// (12), que no son proveedores de nada. Un emparejador por similitud los habría colgado del
// proveedor de nombre más cercano, y el costo de la obra habría quedado imputado a alguien que
// nunca facturó eso — sin que ningún error saltara nunca. El dueño lo prohibió con estas palabras:
// *"No inventar imputaciones"*. Cada fila la resuelve una persona, y queda su firma.
//
// Las tres salidas son deliberadas. Sin "no es un proveedor" la cola NUNCA llegaría a cero: los
// cuatro conceptos de gasto de arriba quedarían para siempre pidiendo que alguien les invente uno, y
// una lista que no puede vaciarse deja de mirarse.

import {
  BotonAccion, Campo, CTRL, FormAccion,
  type AccionFormulario, type ResultadoAccion,
} from '@/shared/components/ui'
// Reuso deliberado: `plata` y `fecha` ya existen y no se copian acá. Un segundo formateador de
// moneda es una segunda forma de mostrar el mismo peso.
import { fecha, plata } from '@/features/obras/components/formato'
import { CamposProveedor } from './PanelProveedor'
import type { NombrePendiente, NombreResuelto, Proveedor } from '../types'

function Cabecera({ n }: { n: NombrePendiente }) {
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <span className="truncate text-[13px] font-medium text-ink">{n.nombre_origen}</span>
      <span className="text-[11px] tabular-nums text-faint">
        {n.comprobantes} {n.comprobantes === 1 ? 'comprobante' : 'comprobantes'} · {plata(n.total)}
      </span>
      <span className="text-[11px] tabular-nums text-faint">
        {fecha(n.primera_fecha)} → {fecha(n.ultima_fecha)}
      </span>
    </div>
  )
}

/** Las tres salidas de un nombre pendiente. Se abren de a una: la fila es la unidad de trabajo. */
function FilaPendiente({
  n, proveedores, vincular, crearYVincular, noEsProveedor,
}: {
  n: NombrePendiente
  proveedores: Proveedor[]
  vincular: AccionFormulario
  crearYVincular: (nombreNorm: string, nombreOrigen: string, form: FormData) => Promise<ResultadoAccion>
  noEsProveedor: (nombreNorm: string, nombreOrigen: string) => Promise<ResultadoAccion>
}) {
  return (
    <details data-testid="nombre-pendiente" className="border-b border-line/60 last:border-0">
      <summary className="flex cursor-pointer items-baseline gap-3 px-3 py-2.5 hover:bg-surface-quiet">
        <Cabecera n={n} />
        <span className="shrink-0 text-[11px] text-warn">sin asignar</span>
      </summary>

      <div className="space-y-4 border-t border-line/60 bg-surface-quiet px-3 py-3">
        {/* ── 1 · ES UN PROVEEDOR QUE YA EXISTE ── */}
        <FormAccion accion={vincular} testid="form-vincular" enviar="Vincular" mensajeOk="Vinculado.">
          <input type="hidden" name="nombre_norm" value={n.nombre_norm} />
          <input type="hidden" name="nombre_origen" value={n.nombre_origen} />
          <Campo label="Es este proveedor" ayuda="Elegí sólo si estás segura: esto imputa los comprobantes.">
            <select name="proveedor_id" defaultValue="" required className={CTRL} data-testid="select-proveedor">
              <option value="" disabled>buscar en el maestro…</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}{p.cuit ? ` · ${p.cuit}` : ''}
                </option>
              ))}
            </select>
          </Campo>
        </FormAccion>

        {/* ── 2 · ES UN PROVEEDOR NUEVO ── */}
        <details className="rounded-lg border border-line bg-white" data-testid="crear-desde-pendiente">
          <summary className="cursor-pointer px-3 py-2 text-[12px] font-medium text-ink">
            + Es un proveedor nuevo: crearlo con este nombre
          </summary>
          <div className="border-t border-line p-3">
            <FormAccion
              accion={crearYVincular.bind(null, n.nombre_norm, n.nombre_origen)}
              testid="form-crear-vincular"
              enviar="Crear y vincular"
              mensajeOk="Proveedor creado y vinculado."
            >
              {/* El nombre viene precargado con el texto del Sheet: es el que hay que reconocer
                  después, y retipearlo es la forma más rápida de crear una variante más. */}
              <CamposProveedor proveedor={{
                id: '', nombre: n.nombre_origen, razon_social: null, cuit: null, notas: null, activo: true,
              }} />
            </FormAccion>
          </div>
        </details>

        {/* ── 3 · NO ES UN PROVEEDOR ── */}
        <div className="flex flex-wrap items-center gap-2">
          <BotonAccion
            accion={noEsProveedor}
            args={[n.nombre_norm, n.nombre_origen]}
            testid="no-es-proveedor"
          >
            No es un proveedor
          </BotonAccion>
          <span className="text-[11px] text-faint">
            Para conceptos como sueldos, impuestos o movimientos del banco.
          </span>
        </div>
      </div>
    </details>
  )
}

export function ColaNombres({
  pendientes, resueltos, proveedores, vincular, crearYVincular, noEsProveedor, deshacer,
}: {
  pendientes: NombrePendiente[]
  resueltos: NombreResuelto[]
  proveedores: Proveedor[]
  vincular: AccionFormulario
  crearYVincular: (nombreNorm: string, nombreOrigen: string, form: FormData) => Promise<ResultadoAccion>
  noEsProveedor: (nombreNorm: string, nombreOrigen: string) => Promise<ResultadoAccion>
  deshacer: (aliasId: string) => Promise<ResultadoAccion>
}) {
  const manuales = resueltos.filter((r) => r.alias_id)

  return (
    <div className="space-y-5">
      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 px-1">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-faint">
            Pendientes de asignación
          </h2>
          <span className="text-[11px] tabular-nums text-faint">
            {pendientes.length} {pendientes.length === 1 ? 'nombre' : 'nombres'}
          </span>
        </div>

        {pendientes.length === 0
          ? (
              <p data-testid="cola-vacia" className="px-1 py-4 text-[13px] text-muted">
                Todos los nombres de compras tienen proveedor. No hay nada que resolver.
              </p>
            )
          : (
              <div className="overflow-hidden rounded-xl border border-line bg-white" data-testid="cola-nombres">
                {pendientes.map((n) => (
                  <FilaPendiente
                    key={n.nombre_norm}
                    n={n}
                    proveedores={proveedores}
                    vincular={vincular}
                    crearYVincular={crearYVincular}
                    noEsProveedor={noEsProveedor}
                  />
                ))}
              </div>
            )}
      </section>

      {manuales.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-[11px] font-medium uppercase tracking-wide text-faint">
            Resueltos a mano
          </h2>
          <div className="overflow-hidden rounded-xl border border-line bg-white" data-testid="cola-resueltos">
            {manuales.map((r) => (
              <div
                key={r.nombre_norm}
                data-testid="nombre-resuelto"
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line/60 px-3 py-2 last:border-0"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{r.nombre_norm}</span>
                <span className="text-[11px] text-faint">
                  {r.estado === 'no_es_proveedor' ? 'no es un proveedor' : (r.proveedor_nombre ?? '—')}
                </span>
                <span className="text-[11px] tabular-nums text-faint">{r.comprobantes}</span>
                {r.alias_id && (
                  <BotonAccion accion={deshacer} args={[r.alias_id]} testid="deshacer-resolucion">
                    Deshacer
                  </BotonAccion>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
