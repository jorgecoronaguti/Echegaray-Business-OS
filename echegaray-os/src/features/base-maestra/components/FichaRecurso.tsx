// PANTALLA 18 · LA FICHA DE UN RECURSO — cuánto vale, cómo llegó a valer eso, y a qué le pega.
//
// Server component: todo llega en la carga. La selección viaja en `?r=<id>`, así que un enlace a
// «Hormigón H17» abre en Hormigón H17.
//
// ═══ POR QUÉ EL HISTORIAL ES LA MITAD DE LA PANTALLA ═══
//
// Un precio suelto no se puede defender: 152.000 el m³ puede ser de esta semana o de 2017, y las dos
// cosas se ven idénticas en una celda. El historial es lo que convierte el número en un dato con
// procedencia —de qué compra o de qué lista salió— y lo que permite ver la variación real en vez de
// una contra un mes elegido a dedo.
//
// ═══ LO QUE NO ESTÁ ═══
//
// El diseño canónico pone «Actualizar precio» como primaria y avisa que actualizar afecta
// presupuestos abiertos. Cargar un precio desde acá NO EXISTE hoy —los precios entran por la
// ingestión de la Planilla para Cotizar, con su fecha y su fuente— y un botón que no escribe nada
// es peor que no tenerlo. El impacto sí se dice, y con el número que se puede sostener: cuántas
// tareas tipo lo usan en su versión VIGENTE.

import Link from 'next/link'
import { Aviso, Nulo } from '@/shared/components/ds'
import { IconoCerrar } from '@/shared/components/iconos'
import { RUTA_TAREAS } from './NavBaseMaestra'
import type { FichaRecurso as Ficha } from '../types'
import { diasEntre, fechaCorta, numero, pesos, porcentaje } from '../services/reglas'
import { Plata, Rotulo, Texto } from './celdas'

export function FichaRecurso({
  ficha, hoy, economia, hrefCerrar,
}: { ficha: Ficha; hoy: string; economia: boolean; hrefCerrar: string }) {
  const { recurso, historial, usos } = ficha
  const ultima = historial[0]

  return (
    <aside
      data-testid="ficha-recurso"
      className="min-w-0 shrink-0 border-t border-line pt-4 lg:w-[372px] lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0"
    >
      <header className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10.5px] text-faint">{recurso.codigo}</div>
          <h2 className="mt-1 text-[15.5px] font-semibold leading-snug text-ink">{recurso.nombre}</h2>
          <div className="mt-1 text-[11.5px] text-muted">
            {RUBRO[recurso.tipo]} · por {recurso.unidad}
            {recurso.familia ? ` · ${recurso.familia}` : ''}
          </div>
        </div>
        <Link
          href={hrefCerrar}
          scroll={false}
          data-testid="cerrar-ficha-recurso"
          title="Cerrar"
          aria-label="Cerrar la ficha del recurso"
          className="shrink-0 text-faint transition-colors hover:text-ink"
        >
          <IconoCerrar className="h-[15px] w-[15px]" />
        </Link>
      </header>

      {economia ? (
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Cifra rotulo="Precio vigente" pie={antiguedad(recurso.fecha_precio, hoy)}>
            {pesos(recurso.costo_base, 0) == null
              ? <Nulo>sin cargar</Nulo>
              : <span className="font-mono text-[16px] font-semibold tabular-nums text-ink">
                  {pesos(recurso.costo_base, 0)}
                </span>}
          </Cifra>
          <Cifra
            rotulo="Última variación"
            pie={ultima?.fecha_precio ? `contra el precio anterior · ${fechaCorta(ultima.fecha_precio)}` : 'sin precio anterior'}
          >
            {/* SIN PRECIO ANTERIOR NO HAY VARIACIÓN, Y NO ES 0 %: un 0 % afirmaría que el precio se
                mantuvo, cuando lo que pasa es que ésta es la primera carga. */}
            {ultima?.variacion == null
              ? <Nulo>sin base</Nulo>
              : <span className={`text-[16px] font-semibold ${ultima.variacion > 0 ? 'text-warn' : 'text-pos'}`}>
                  {ultima.variacion > 0 ? '+' : ''}{porcentaje(ultima.variacion, 1)}
                </span>}
          </Cifra>
        </div>
      ) : (
        <p className="mt-4 text-[12px] text-faint" data-testid="recurso-sin-economia">
          El precio y su historial son económicos: no los ves. No están vacíos.
        </p>
      )}

      {ficha.avisos.map((a) => (
        <div key={a} className="mt-3"><Aviso tono="warn">{a}</Aviso></div>
      ))}

      {economia && (
        <section className="mt-5" data-testid="historial-precio">
          <Rotulo>Historial de precio</Rotulo>
          {historial.length === 0 ? (
            <p className="mt-1.5 text-[12px] text-muted">
              Nunca se cargó un precio para este recurso. Entran por la ingestión de la Planilla para Cotizar.
            </p>
          ) : (
            <ul className="mt-1.5">
              {historial.map((p, i) => (
                <li key={`${p.fecha_precio}-${i}`} className="flex items-baseline gap-3 border-b border-[#EFEEEA] py-2 last:border-b-0">
                  {/* LA FECHA DE UNA FILA DE HISTORIAL NO LLEVA COLOR DE FRESCURA. `FechaPrecio`
                      pinta «este precio ya no sirve para cotizar», y sobre un precio HISTÓRICO eso
                      no significa nada: por definición ya fue reemplazado. El vigente se distingue
                      por peso, que es el único dato que cambia entre estas filas. */}
                  <span className={`w-[52px] shrink-0 font-mono text-[11px] tabular-nums ${p.vigente ? 'text-ink' : 'text-faint'}`}>
                    {fechaCorta(p.fecha_precio) ?? 'sin fecha'}
                  </span>
                  <span className="w-[74px] shrink-0 text-right">
                    <Plata v={p.costo} decimales={0} falta="sin cargar" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted" title={p.fuente ?? p.proveedor ?? undefined}>
                    <Texto v={p.fuente ?? p.proveedor} falta="sin origen declarado" className="text-[11px]" />
                  </span>
                  <span className="shrink-0 font-mono text-[11px] tabular-nums">
                    {p.variacion == null
                      ? <span className="text-faint">base</span>
                      : <span className={p.variacion > 0 ? 'text-warn' : 'text-pos'}>
                          {p.variacion > 0 ? '+' : ''}{porcentaje(p.variacion, 0)}
                        </span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mt-5" data-testid="uso-recurso">
        <Rotulo>Se usa en</Rotulo>
        {usos.length === 0 ? (
          <p className="mt-1.5 text-[12px] text-muted">
            Ninguna tarea tipo vigente lo incluye: cambiar su precio hoy no mueve ningún presupuesto.
          </p>
        ) : (
          <ul className="mt-1.5">
            {usos.map((u) => (
              <li key={`${u.tarea_tipo_id}-${u.codigo}`} className="flex items-baseline gap-3 border-b border-[#EFEEEA] py-2 last:border-b-0">
                <span className="shrink-0 font-mono text-[10.5px] text-faint">{u.codigo}</span>
                <Link
                  href={`${RUTA_TAREAS}?t=${u.tarea_tipo_id}`}
                  className="min-w-0 flex-1 truncate text-[12px] text-ink hover:underline"
                >
                  {u.nombre}
                </Link>
                <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink-soft">
                  {numero(u.cantidad, 2)} {recurso.unidad}/{u.unidad_tarea}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* EL IMPACTO SE DICE CON EL NÚMERO QUE SE PUEDE SOSTENER. Cuántas tareas tipo vigentes lo
          usan es un hecho leído; «3 presupuestos abiertos» exigiría atravesar presupuesto → partida
          → análisis, que hoy no se lee en esta pantalla y no se inventa. */}
      {economia && usos.length > 0 && (
        <div className="mt-4">
          <Aviso tono="warn" titulo="Un precio nuevo se propaga">
            {usos.length} {usos.length === 1 ? 'tarea tipo lo usa' : 'tareas tipo lo usan'} en su versión
            vigente. Los presupuestos ya congelados no cambian: apuntan a la versión con la que se cotizaron.
          </Aviso>
        </div>
      )}
    </aside>
  )
}

const RUBRO: Record<Ficha['recurso']['tipo'], string> = {
  mano_obra: 'Mano de obra', carga_social: 'Carga social', material: 'Material', equipo: 'Equipo', otro: 'Otro',
}

/** «hace N días» — la antigüedad es parte del precio, no un adorno de la fila. */
function antiguedad(fecha: string | null, hoy: string): string {
  if (!fecha) return 'sin fecha de carga'
  const d = diasEntre(fecha, hoy)
  if (Number.isNaN(d)) return 'sin fecha de carga'
  if (d <= 0) return 'cargado hoy'
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`
}

function Cifra({ rotulo, pie, children }: { rotulo: string; pie: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-card bg-surface-quiet px-3 py-2.5">
      <Rotulo>{rotulo}</Rotulo>
      <div className="mt-1">{children}</div>
      <div className="mt-0.5 truncate text-[11px] text-muted" title={pie}>{pie}</div>
    </div>
  )
}
