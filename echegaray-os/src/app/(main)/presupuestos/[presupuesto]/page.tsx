// 15 · PRESUPUESTO EDICIÓN — el cómputo, la cascada y el análisis de cada partida.
//
// ═══ LA URL LLEVA EL id, NO EL NÚMERO ═══
//
// `COT-2026-018` identifica un presupuesto con CUATRO versiones; el `id` identifica UNA. Poner el
// número en la ruta obligaría a decidir en cada carga cuál versión abrir, y el enlace que alguien
// mandó por chat apuntando a «el presupuesto de la escuela» mostraría otra cosa el día que se cree
// la versión 5. Las versiones se listan abajo y cada una es su propia dirección.
//
// ═══ TODA LA PANTALLA ES ECONÓMICA ═══
//
// No hay una versión sin plata de esta pantalla: `cotizacion_partida` está cerrada a
// `ve_economia()` y sin permiso la cascada se dibujaría en cero. Se cierra entera y se dice por qué.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import {
  getComposicion, getPartidas, getPresupuesto, getTareasCotizables, getVersiones,
} from '@/features/presupuestos/services/presupuestosService'
import { estaCongelado, tieneCifras } from '@/features/presupuestos/services/cascada'
import { puedeCongelar, puedeConvertir, lecturaEstado } from '@/features/presupuestos/services/estado'
import { rubroDe, subcontratadasFueraDelPrecio } from '@/features/presupuestos/services/partidas'
import { fecha, hh, plata } from '@/features/presupuestos/services/formato'
import { CascadaPrecio } from '@/features/presupuestos/components/CascadaPrecio'
import { TablaPartidas } from '@/features/presupuestos/components/TablaPartidas'
import { PanelPartida } from '@/features/presupuestos/components/PanelPartida'
import { AltaPartida } from '@/features/presupuestos/components/AltaPartida'
import { AccionesPresupuesto } from '@/features/presupuestos/components/AccionesPresupuesto'
import { Aviso, BarraContexto, Estado, MetaContexto } from '@/shared/components/ds'
import { EstadoError } from '@/shared/components/estado'

export const dynamic = 'force-dynamic'

export default async function PresupuestoPage({
  params, searchParams,
}: {
  params: Promise<{ presupuesto: string }>
  searchParams: Promise<{ partida?: string; nueva?: string }>
}) {
  const { presupuesto: id } = await params
  const { partida: partidaId, nueva } = await searchParams

  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  if (!veEconomia(perfil.data?.rol ?? null)) {
    return (
      <div className="px-4 py-6 lg:px-10">
        <Aviso tono="warn" titulo="Sin permiso" testid="sin-permiso">
          El presupuesto es precio de punta a punta: lo ven Dirección y Administración. No es que no
          haya datos. Lo que hace falta en obra llega convertido en actividades, con HH y sin plata.
        </Aviso>
      </div>
    )
  }

  const { data: p, error } = await getPresupuesto(supabase, id)
  if (error && !p) {
    // Un id que no existe es 404; un error de lectura NO se disfraza de «no hay datos».
    if (error.startsWith('No existe')) notFound()
    return <EstadoError mensaje={error} que="el presupuesto" />
  }
  const presupuesto = p!

  const [partidas, versiones, tareas] = await Promise.all([
    getPartidas(supabase, id),
    getVersiones(supabase, presupuesto.numero),
    getTareasCotizables(supabase),
  ])

  const lista = partidas.data ?? []
  const seleccionada = partidaId ? lista.find((x) => x.partida_id === partidaId) ?? null : null
  const composicion = seleccionada ? (await getComposicion(supabase, seleccionada)).data : null

  const congelado = estaCongelado(presupuesto)
  const congelar = puedeCongelar(presupuesto)
  const convertir = puedeConvertir(presupuesto)
  const e = lecturaEstado(presupuesto.estado)
  const rubros = [...new Set(lista.map(rubroDe))]
  const subFuera = subcontratadasFueraDelPrecio(lista)

  return (
    <div className="min-h-screen bg-canvas">
      <BarraContexto
        volverA="/presupuestos"
        volverLabel="Presupuestos"
        titulo={`${presupuesto.numero ?? 'sin número'} · ${presupuesto.obra_nombre ?? 'sin objeto'}`}
        meta={
          <>
            <MetaContexto rotulo="Cliente">{presupuesto.cliente ?? 'sin cliente'}</MetaContexto>
            <MetaContexto rotulo="Versión">
              {presupuesto.version}{presupuesto.vigente ? ' · vigente' : ' · reemplazada'}
            </MetaContexto>
            <MetaContexto rotulo="Estado" destacado>
              {e.label}{presupuesto.fecha_cotizacion ? ` ${fecha(presupuesto.fecha_cotizacion)}` : ''}
            </MetaContexto>
            <MetaContexto>
              {presupuesto.n_partidas} {presupuesto.n_partidas === 1 ? 'partida' : 'partidas'}
            </MetaContexto>
            {congelado && (
              <MetaContexto rotulo="Congelado">{fecha(presupuesto.congelada_en)}</MetaContexto>
            )}
          </>
        }
        kpis={[
          { rotulo: 'Precio de venta', valor: tieneCifras(presupuesto) ? plata(presupuesto.precio_venta) : null, falta: 'sin cargar' },
          { rotulo: 'HH del contrato', valor: tieneCifras(presupuesto) ? hh(presupuesto.hh_previstas) : null, falta: 'sin cargar' },
        ]}
        acciones={
          <AccionesPresupuesto
            id={presupuesto.id}
            estado={presupuesto.estado}
            congelado={congelado}
            puedeCongelar={congelar.puede}
            motivoCongelar={congelar.motivo}
            puedeConvertir={convertir.puede}
            motivoConvertir={convertir.motivo}
            hrefConvertir={`/presupuestos/${presupuesto.id}/convertir`}
          />
        }
      />

      <div className="w-full px-4 py-5 lg:px-10">
        {congelado && (
          <div className="mb-4">
            <Aviso tono="info" titulo="Congelado" testid="aviso-congelado">
              Este presupuesto salió el {fecha(presupuesto.congelada_en)} y su composición quedó
              copiada tal como estaba ese día. No se edita: para cambiarlo se crea una versión nueva.
            </Aviso>
          </div>
        )}
        {presupuesto.n_sin_analisis > 0 && (
          <div className="mb-4">
            <Aviso tono="warn" titulo={`${presupuesto.n_sin_analisis} ${presupuesto.n_sin_analisis === 1 ? 'partida' : 'partidas'} sin análisis`} testid="aviso-sin-analisis">
              Se cotizan igual y no valen $ 0: valen lo que todavía no se cargó. Sin análisis no
              aportan HH, y al convertir a obra sus actividades nacen sin plazo.
            </Aviso>
          </div>
        )}
        {subFuera.n > 0 && (
          <div className="mb-4">
            {/* HUECO DEL MODELO, MEDIDO EL 21/08/2026 — no una precaución teórica. La vista valoriza
                con `coalesce(costo_unitario, analisis)` y una subcontratada no tiene ninguno de los
                dos: su precio NO llega al costo directo, y `sin_analisis` la excluye a propósito,
                así que tampoco aparece en el aviso de deuda de carga. */}
            <Aviso tono="neg" titulo={`${subFuera.n} ${subFuera.n === 1 ? 'partida subcontratada queda' : 'partidas subcontratadas quedan'} fuera del precio`} testid="aviso-subcontratadas">
              El precio del subcontrato está cargado{subFuera.precioNoContado !== null && ` (${plata(subFuera.precioNoContado)})`} pero
              NO suma al costo directo: la valorización sólo mira el análisis, y un paquete
              subcontratado no tiene. Hasta que el modelo lo contemple, el precio de venta de arriba
              está incompleto por ese monto.
            </Aviso>
          </div>
        )}
        {presupuesto.n_sin_computo > 0 && (
          <div className="mb-4">
            <Aviso tono="warn" titulo={`${presupuesto.n_sin_computo} sin cómputo`} testid="aviso-sin-computo">
              Una partida sin cantidad no entra en el costo directo y no se puede convertir en plan
              de obra: no hay cantidad que repartir entre frentes.
            </Aviso>
          </div>
        )}

        <CascadaPrecio p={presupuesto} />

        <div className={`mt-5 grid min-w-0 gap-6 ${seleccionada ? 'xl:grid-cols-[minmax(0,1fr)_400px]' : ''}`}>
          <TablaPartidas
            partidas={lista}
            cotizacionId={presupuesto.id}
            costoDirecto={tieneCifras(presupuesto) ? presupuesto.costo_directo : null}
            seleccionada={partidaId ?? null}
            congelado={congelado}
            accion={
              !congelado && (
                <Link
                  href={nueva === '1' ? `/presupuestos/${id}` : `/presupuestos/${id}?nueva=1`}
                  data-testid="abrir-alta-partida"
                  className={`shrink-0 rounded-control px-3.5 py-[7px] text-[12.5px] ${
                    nueva === '1' ? 'border border-line text-ink' : 'bg-marca font-medium text-[color:var(--os-on-marca)]'
                  }`}
                >
                  {nueva === '1' ? 'Cancelar' : '+ Partida'}
                </Link>
              )
            }
          />

          {seleccionada && composicion && (
            <PanelPartida p={seleccionada} presupuesto={presupuesto} composicion={composicion} />
          )}
        </div>

        {partidas.error && (
          <div className="mt-4"><Aviso tono="neg" titulo="No pude leer las partidas">{partidas.error}</Aviso></div>
        )}

        {nueva === '1' && !congelado && (
          <div className="mt-6 border-t border-line pt-5">
            <AltaPartida cotizacionId={presupuesto.id} tareas={tareas.data ?? []} rubros={rubros} />
          </div>
        )}

        {(versiones.data ?? []).length > 1 && (
          <div className="mt-8 border-t border-line pt-4" data-testid="versiones">
            <h3 className="text-[10px] font-medium uppercase tracking-[0.06em] text-faint">Versiones</h3>
            <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
              {(versiones.data ?? []).map((v) => (
                <li key={v.id} className="text-[12.5px]">
                  <Link href={`/presupuestos/${v.id}`} className={v.id === id ? 'font-medium text-ink' : 'text-muted hover:text-ink'}>
                    v{v.version}
                  </Link>
                  <span className="ml-1.5 text-faint">
                    <Estado tono={lecturaEstado(v.estado).tono} clave={lecturaEstado(v.estado).clave}>
                      {lecturaEstado(v.estado).label}
                    </Estado>
                  </span>
                  {v.vigente && <span className="ml-1.5 text-[11px] text-pos">vigente</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
