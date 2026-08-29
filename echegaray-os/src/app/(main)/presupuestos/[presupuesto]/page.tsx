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
import { fecha, plata } from '@/features/presupuestos/services/formato'
import { CascadaPrecio } from '@/features/presupuestos/components/CascadaPrecio'
import { ResumenPresupuesto } from '@/features/presupuestos/components/ResumenPresupuesto'
import { TablaPartidas } from '@/features/presupuestos/components/TablaPartidas'
import { PanelPartida } from '@/features/presupuestos/components/PanelPartida'
import { AltaPartida } from '@/features/presupuestos/components/AltaPartida'
import { AccionesPresupuesto } from '@/features/presupuestos/components/AccionesPresupuesto'
import { Conversacion } from '@/features/presupuestos/components/Conversacion'
import { ColaDeAtencion } from '@/features/presupuestos/components/ColaDeAtencion'
import { estadoDesdeFilas } from '@/features/presupuestos/services/cotizadorPuente'
import { Aviso, Ayuda, Estado, Plegable } from '@/shared/components/ds'
import { EstadoError } from '@/shared/components/estado'
import {
  BandaDetalle, BotonMarca, BotonPlano, C, LineaCampos, PastillaTitulo, TONO,
  IcoCerrar, IcoCliente, IcoMas,
} from '@/shared/components/canon'

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

  const [partidas, versiones, tareas, alcance] = await Promise.all([
    getPartidas(supabase, id),
    getVersiones(supabase, presupuesto.numero),
    getTareasCotizables(supabase),
    // Las decisiones de alcance del §5. Sin ellas la cola pediría el precio de algo que se sacó.
    supabase.from('cotizacion_alcance').select('*').eq('cotizacion_id', id),
  ])

  const lista = partidas.data ?? []
  const seleccionada = partidaId ? lista.find((x) => x.partida_id === partidaId) ?? null : null
  const composicion = seleccionada ? (await getComposicion(supabase, seleccionada)).data : null

  // EL PRESUPUESTO VIVO. La cola y el gate salen del motor del cotizador —no de tres contadores de
  // la vista— y se derivan de las MISMAS filas que la tabla dibuja abajo: no hay una segunda
  // lectura que pueda decir otra cosa.
  const vivo = estadoDesdeFilas({ presupuesto, partidas: lista, alcance: alcance.data ?? [] })

  const congelado = estaCongelado(presupuesto)
  // EL GATE DEL MOTOR, el mismo que dibuja la Cola de Atención abajo. Una segunda evaluación acá
  // podría decir que sí mientras la cola dice que no — que es exactamente lo que pasaba.
  const congelar = puedeCongelar(presupuesto, vivo.gate)
  const convertir = puedeConvertir(presupuesto)
  const e = lecturaEstado(presupuesto.estado)
  const rubros = [...new Set(lista.map(rubroDe))]
  const subFuera = subcontratadasFueraDelPrecio(lista)

  const tono = TONO[e.tono === 'pos' ? 'pos' : e.tono === 'curso' ? 'curso' : e.tono === 'neg' ? 'neg' : e.tono === 'warn' ? 'warn' : 'neutro']

  return (
    <div style={{ minHeight: '100vh', background: C.fondo, display: 'flex', flexDirection: 'column' }}>
      {/* LA BANDA BLANCA DEL CANÓNICO 15: miga de pan, título de 21px, la pastilla de estado con su
          revisión al lado, las acciones a la derecha y la línea de campos debajo. Antes era el
          `EntityHeader` del DS, que apila los campos como pares rótulo/valor y ocupa el doble de
          alto: en un MacBook de 13" empujaba la tabla —que es lo que se vino a mirar— fuera de la
          primera pantalla.

          ENCABEZADO CLARO, NO SLAB GRAFITO: el presupuesto se EDITA, no se consulta como una ficha.
          Una barra oscura arriba de una tabla que se recorre celda por celda le roba el contraste
          que la tabla necesita. */}
      <BandaDetalle
        testid="banda-presupuesto"
        miga={[
          { texto: 'Presupuestos', href: '/presupuestos' },
          { texto: presupuesto.obra_nombre ?? 'sin objeto' },
        ]}
        titulo={presupuesto.obra_nombre ?? 'sin objeto'}
        pastillas={
          // ESTADO Y REVISIÓN SE LEEN JUNTOS SIEMPRE —«¿qué revisión mandé?»— y separados obligaban
          // a cruzar la pantalla. Es la pastilla del canónico: «Enviado · rev 1».
          <PastillaTitulo color={tono.color} fondo={tono.fondo} borde={tono.borde} testid="estado-presupuesto">
            {`${e.label} · rev ${presupuesto.version}${presupuesto.vigente ? '' : ' · reemplazada'}`}
          </PastillaTitulo>
        }
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
        campos={
          // LA LÍNEA DE CAMPOS DEL CANÓNICO: cliente · cuántas partidas · cuándo se cotizó. El
          // TAMAÑO del presupuesto es dato de identidad —«68 partidas» dice de qué se está hablando
          // antes de bajar a la tabla—. El NÚMERO se agrega: es la identidad con la que el cliente
          // lo nombra por teléfono, y el canónico lo omite porque su maqueta no tenía que abrir un
          // enlace mandado por chat.
          <LineaCampos
            testid="campos-presupuesto"
            campos={[
              <><IcoCliente s={13} />{presupuesto.cliente ?? 'sin cliente'}</>,
              <span key="n" className="font-mono tabular-nums">{presupuesto.numero ?? 'sin número'}</span>,
              `${presupuesto.n_partidas} ${presupuesto.n_partidas === 1 ? 'partida' : 'partidas'}`,
              <span key="f" className="font-mono tabular-nums">{fecha(presupuesto.fecha_cotizacion) ?? 'sin fecha'}</span>,
              congelado ? <span key="c">congelado {fecha(presupuesto.congelada_en) ?? 'sin fecha'}</span> : null,
            ]}
          />
        }
      />

      <div style={{ padding: '14px 20px 20px' }}>
        {congelado && (
          // CONGELADO ES UN ESTADO, NO UN PROBLEMA: vive en la línea de campos del encabezado. Lo
          // que sí hace falta explicar —que ya no se edita y que para cambiarlo se versiona— pasó a
          // ayuda bajo demanda; era un bloque `info` a ancho completo que se leía una vez.
          <Ayuda titulo="Qué significa que esté congelado" testid="ayuda-congelado">
            Este presupuesto salió el {fecha(presupuesto.congelada_en)} y su composición quedó
            copiada tal como estaba ese día. No se edita: para cambiarlo se crea una versión nueva.
          </Ayuda>
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
        {/* «Sin análisis» y «sin cómputo» eran dos bloques de aviso a ancho completo. Ahora el
            CONTADOR vive en la franja de arriba y el CHIP que filtra la tabla, en su toolbar: el
            mismo número, pero al lado de las filas que hay que arreglar. */}
        <ResumenPresupuesto p={presupuesto} />

        <div className="mt-3">
          <Plegable titulo="Cómo se llega a ese precio" testid="cascada-plegable">
            <CascadaPrecio p={presupuesto} />
          </Plegable>
        </div>

        {/* LA CONVERSACIÓN ES LA INTERFAZ PRINCIPAL (§46), y la cola de atención es su contracara
            estructurada: una dice qué se puede pedir, la otra qué falta. Van juntas y arriba de la
            tabla — abajo de 68 partidas nadie las ve. */}
        <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <Conversacion
            cotizacionId={presupuesto.id}
            // LO QUE EL ROL NO PUEDE, NO SE DIBUJA. El servidor lo re-valida igual: `ve_economia()`
            // en la pantalla, `autorizar()` en el command layer y la RLS en la base son tres
            // cerraduras, y ésta es sólo la que evita el viaje.
            puedeEscribir={!congelado}
          />
          <ColaDeAtencion cola={vivo.cola} gate={vivo.gate} parcial={vivo.parcial} />
        </div>

        <div className={`mt-4 grid min-w-0 gap-6 ${seleccionada ? 'xl:grid-cols-[minmax(0,1fr)_400px]' : ''}`}>
          <TablaPartidas
            partidas={lista}
            cotizacionId={presupuesto.id}
            costoDirecto={tieneCifras(presupuesto) ? presupuesto.costo_directo : null}
            hhPrevistas={tieneCifras(presupuesto) ? presupuesto.hh_previstas : null}
            precioVenta={tieneCifras(presupuesto) ? presupuesto.precio_venta : null}
            margenPct={presupuesto.margen_sobre_precio_pct}
            seleccionada={partidaId ?? null}
            congelado={congelado}
            accion={
              // «Partida» y no «Nueva partida»: es el rótulo del canónico (`15:100`), y en una
              // barra donde el botón está al lado de la tabla de partidas la palabra «nueva» no
              // agrega nada.
              !congelado && (
                nueva === '1' ? (
                  <BotonPlano href={`/presupuestos/${id}`} testid="abrir-alta-partida">
                    <IcoCerrar s={14} /> Cancelar
                  </BotonPlano>
                ) : (
                  <BotonMarca href={`/presupuestos/${id}?nueva=1`} testid="abrir-alta-partida">
                    <IcoMas s={14} /> Partida
                  </BotonMarca>
                )
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
