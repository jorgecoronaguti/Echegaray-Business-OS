// EL ENTORNO XSAS — «Presupuestos v5 · entorno xsas», estado CONVERSANDO.
//
// ═══ QUÉ REEMPLAZA, Y POR QUÉ ═══
//
// Esta pantalla era una página apilada: banda, plegable de lectura, resumen, plegable de cascada,
// conversación y cola en una grilla, tabla, panel. El dueño la rechazó, y el motivo está en el
// contrato: Presupuestos NO es un formulario con un chatbot al costado. La conversación ES la
// interfaz, y a su derecha vive siempre una representación estructurada y verificable del
// presupuesto. Cada cosa dicha tiene consecuencia visible inmediata, en la misma pantalla, sin
// desplegar nada.
//
// ═══ LA URL LLEVA EL id, NO EL NÚMERO ═══
//
// `COT-2026-018` identifica un presupuesto con CUATRO versiones; el `id` identifica UNA. Poner el
// número en la ruta obligaría a decidir en cada carga cuál versión abrir, y el enlace que alguien
// mandó por chat apuntando a «el presupuesto de la escuela» mostraría otra cosa el día que se cree
// la versión 5.
//
// ═══ Y TODO PANEL ES ESTADO DE URL ═══
//
// `?vista=` · `?insp=` · `?atencion=` · `?nueva=`. Un inspector que vive en el estado de React no se
// puede compartir, y la mitad del trabajo de cotizar es «mirá esta partida». El armado de esas URLs
// vive en `services/rutas.ts`, con test.
//
// ═══ TODA LA PANTALLA ES ECONÓMICA ═══
//
// No hay una versión sin plata de esta pantalla: `cotizacion_partida` está cerrada a `ve_economia()`
// y sin permiso la cascada se dibujaría en cero. Se cierra entera y se dice por qué.

import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import {
  getComposicion, getPartidas, getPresupuesto, getTareasCotizables, getVersiones,
} from '@/features/presupuestos/services/presupuestosService'
import { estaCongelado, tieneCifras } from '@/features/presupuestos/services/cascada'
import { puedeCongelar, puedeConvertir, lecturaEstado } from '@/features/presupuestos/services/estado'
import { rubroDe, subcontratadasFueraDelPrecio } from '@/features/presupuestos/services/partidas'
import { plata } from '@/features/presupuestos/services/formato'
import {
  bloqueosDeEnvio, certezaDe, firmezaDe, pendientesDe, precioFirmeDe,
} from '@/features/presupuestos/services/vivo'
import { ofertaDe } from '@/features/presupuestos/services/oferta'
import { hayModelo } from '@/features/presupuestos/services/modelo'
import {
  aliasPartida, hrefEntorno, leerEstadoUrl, partidaDelInspector, type Consulta,
} from '@/features/presupuestos/services/rutas'
import { TablaPartidas } from '@/features/presupuestos/components/TablaPartidas'
import { PanelPartida } from '@/features/presupuestos/components/PanelPartida'
import { AltaPartida } from '@/features/presupuestos/components/AltaPartida'
import { AccionesPresupuesto, BotonCongelar } from '@/features/presupuestos/components/AccionesPresupuesto'
import { Conversacion } from '@/features/presupuestos/components/Conversacion'
import { ColaDeAtencion } from '@/features/presupuestos/components/ColaDeAtencion'
import { EncabezadoVivo } from '@/features/presupuestos/components/EncabezadoVivo'
import { CascadaDeDecision } from '@/features/presupuestos/components/CascadaDeDecision'
import { VistaOferta } from '@/features/presupuestos/components/VistaOferta'
import { CajonInspector } from '@/features/presupuestos/components/CajonInspector'
import { estadoDesdeFilas } from '@/features/presupuestos/services/cotizadorPuente'
import { pasosDeLectura } from '@/features/presupuestos/services/lecturaPlano'
import { LecturaDelPlano } from '@/features/presupuestos/components/LecturaDelPlano'
import { Aviso, Plegable } from '@/shared/components/ds'
import { EstadoError } from '@/shared/components/estado'
import { C } from '@/shared/components/canon'

export const dynamic = 'force-dynamic'

/** El alto de la barra de identidad, en píxeles. Se usa para calcular el de las dos columnas. */
const BARRA = 45

export default async function PresupuestoPage({
  params, searchParams,
}: {
  params: Promise<{ presupuesto: string }>
  searchParams: Promise<Consulta>
}) {
  const { presupuesto: id } = await params
  const consulta = await searchParams
  const url = leerEstadoUrl(consulta)

  // EL ALIAS `?partida=` — los enlaces de la tabla y los mandados por chat siguen andando.
  const alias = aliasPartida(consulta)
  if (alias) redirect(hrefEntorno(id, url, { insp: alias }))

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

  const [partidas, versiones, tareas, alcance, razonamiento] = await Promise.all([
    getPartidas(supabase, id),
    getVersiones(supabase, presupuesto.numero),
    getTareasCotizables(supabase),
    // Las decisiones de alcance del §5. Sin ellas la cola pediría el precio de algo que se sacó.
    supabase.from('cotizacion_alcance').select('*').eq('cotizacion_id', id),
    // La lectura del plano que derivó en esta cotización. Vive en `cotizaciones`, no en la vista de
    // cascada: es una foto de la lectura, no una cifra. NULL en cotizaciones a mano o viejas.
    supabase.from('cotizaciones').select('razonamiento').eq('id', id).maybeSingle(),
  ])

  const lista = partidas.data ?? []

  // EL PRESUPUESTO VIVO. La cola, el gate y las partidas cruzadas con el alcance salen del motor del
  // cotizador —no de contadores de la vista— y de las MISMAS filas que la tabla dibuja: no hay una
  // segunda lectura que pueda decir otra cosa.
  const vivo = estadoDesdeFilas({ presupuesto, partidas: lista, alcance: alcance.data ?? [] })

  const congelado = estaCongelado(presupuesto)
  const congelar = puedeCongelar(presupuesto, vivo.gate)
  const convertir = puedeConvertir(presupuesto)
  const lectura = pasosDeLectura(razonamiento.data?.razonamiento ?? null)
  const subFuera = subcontratadasFueraDelPrecio(lista)

  const certeza = certezaDe(vivo.partidas)
  const firmeza = firmezaDe(vivo.partidas)
  const bloqueos = bloqueosDeEnvio(vivo.gate, vivo.cola)
  // El chip de atención y el bloque de pendientes salen de UNA función: eran dos definiciones de
  // «pendiente» y se contradecían en pantalla.
  const pendientes = pendientesDe(vivo.partidas, vivo.cola)
  const modeloDisponible = hayModelo()

  const inspPartidaId = partidaDelInspector(url.insp)
  const seleccionada = inspPartidaId ? lista.find((x) => x.partida_id === inspPartidaId) ?? null : null
  const composicion = seleccionada ? (await getComposicion(supabase, seleccionada)).data : null

  const href = (cambios: Parameters<typeof hrefEntorno>[2]) => hrefEntorno(id, url, cambios)

  return (
    <div className="flex min-w-0 flex-col" style={{ background: C.fondo }}>
      <BarraIdentidad
        presupuesto={presupuesto}
        nVersiones={(versiones.data ?? []).length}
        acciones={
          <AccionesPresupuesto
            id={presupuesto.id}
            estado={presupuesto.estado}
            puedeConvertir={convertir.puede}
            hrefConvertir={`/presupuestos/${presupuesto.id}/convertir`}
          />
        }
      />

      {/* LAS DOS COLUMNAS. A partir de 1280 cada una tiene su propio scroll y el conjunto ocupa
          exactamente la ventana: la conversación no se va de pantalla al recorrer 68 partidas, que
          es lo que hacía la versión apilada. Debajo de 1280 se apila, con la conversación arriba. */}
      <div
        className="relative flex min-w-0 flex-col xl:flex-row"
        style={{ height: `calc(100dvh - var(--os-header-h) - ${BARRA}px)` }}
      >
        <div
          className="flex h-[520px] flex-none border-b border-line xl:h-auto xl:w-[648px] xl:border-b-0 xl:border-r"
          data-testid="columna-conversacion"
        >
          <Conversacion
            cotizacionId={presupuesto.id}
            // LO QUE EL ROL NO PUEDE, NO SE DIBUJA. El servidor lo re-valida igual: `ve_economia()`
            // en la pantalla, `autorizar()` en el command layer y la RLS en la base son tres
            // cerraduras, y ésta es sólo la que evita el viaje. Sobre una versión congelada el campo
            // SIGUE abierto: preguntar no modifica, y el rechazo de las mutaciones lo hace la base.
            puedeEscribir
            modeloDisponible={modeloDisponible}
            congelada={congelado}
            version={presupuesto.version}
            hrefAtencion={href({ atencion: true })}
            hrefCostos={href({ vista: 'costos' })}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col xl:min-h-0" data-testid="presupuesto-vivo">
          <EncabezadoVivo
            certeza={certeza}
            firmeza={firmeza}
            precioFirme={precioFirmeDe(vivo.cascada, firmeza)}
            bloqueos={bloqueos}
            porQueGate={vivo.gate.porQue}
            pendientes={pendientes}
            congelado={congelado}
            sello={congelado ? `v${presupuesto.version} congelada · inmutable` : null}
            hrefBase={`/presupuestos/${id}`}
            vista={url.vista}
            accionCongelar={congelar.puede ? <BotonCongelar id={presupuesto.id} /> : null}
            notaConvertir={convertir.puede ? null : convertir.motivo}
          />

          {url.atencion && (
            <div className="flex-none border-b border-line p-4" data-testid="panel-atencion">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-semibold">Necesita tu atención</span>
                <Link href={href({ atencion: false })} className="text-[11.5px] text-muted">Cerrar</Link>
              </div>
              <ColaDeAtencion cola={vivo.cola} gate={vivo.gate} parcial={vivo.parcial} />
            </div>
          )}

          <Solapas href={href} vista={url.vista} />

          <div className="flex-1 xl:min-h-0 xl:overflow-auto" style={{ background: C.superficieTenue }}>
            {/* CENTRADO CON `mx-auto`, NO CON `justify-center` (medido a 1280 el 03/09/2026).
                Un hijo más ancho que su contenedor flex centrado se pasa por LOS DOS lados, y el
                de la izquierda no se puede alcanzar scrolleando: la columna PARTIDA quedaba
                cortada contra el borde y no había forma de llegar a ella. Con márgenes automáticos
                el desborde arranca en el borde izquierdo, que es de donde se lee. */}
            <div className="px-5 py-6">
              {url.vista === 'oferta' ? (
                <VistaOferta
                  oferta={ofertaDe(vivo.partidas, vivo.cascada)}
                  p={presupuesto}
                  congelado={congelado}
                />
              ) : (
                <Costos
                  presupuesto={presupuesto}
                  lista={lista}
                  lectura={lectura}
                  subFuera={subFuera}
                  errorPartidas={partidas.error}
                  seleccionada={inspPartidaId}
                  congelado={congelado}
                  hrefNueva={href({ nueva: true })}
                  hrefCancelarNueva={href({ nueva: false })}
                  nueva={url.nueva}
                />
              )}
            </div>
          </div>
        </div>

        {(url.nueva || seleccionada) && (
          <CajonInspector
            miga={
              url.nueva
                ? [{ texto: 'Presupuesto', href: href({ nueva: false }) }, { texto: 'Partida nueva' }]
                : [
                  { texto: 'Presupuesto', href: href({ insp: null }) },
                  { texto: seleccionada?.codigo ?? seleccionada?.descripcion ?? 'Partida' },
                ]
            }
            hrefCerrar={href(url.nueva ? { nueva: false } : { insp: null })}
          >
            {url.nueva ? (
              <AltaPartida
                cotizacionId={presupuesto.id}
                tareas={tareas.data ?? []}
                rubros={[...new Set(lista.map(rubroDe))]}
              />
            ) : seleccionada && composicion ? (
              <PanelPartida p={seleccionada} presupuesto={presupuesto} composicion={composicion} hrefCerrar={null} />
            ) : (
              // Un id de partida que no existe en esta cotización no se dibuja como panel vacío.
              <Aviso tono="warn" titulo="No encontré esa partida">
                El enlace apunta a una partida que no está en este presupuesto. Puede haberse quitado,
                o ser de otra versión.
              </Aviso>
            )}
          </CajonInspector>
        )}
      </div>
    </div>
  )
}

/** La línea de identidad: quién es este presupuesto y qué se puede hacer con él. Altura fija. */
function BarraIdentidad({ presupuesto, nVersiones, acciones }: {
  presupuesto: Awaited<ReturnType<typeof getPresupuesto>>['data'] & object
  nVersiones: number
  acciones: React.ReactNode
}) {
  const e = lecturaEstado(presupuesto.estado)
  return (
    <div
      data-testid="barra-presupuesto"
      className="flex flex-none items-center gap-3 overflow-hidden border-b border-line px-5"
      style={{ height: BARRA - 1, background: C.superficie }}
    >
      <Link href="/presupuestos" className="text-[12px] text-muted">Cartera</Link>
      <span className="text-[12px] text-faint">/</span>
      <span className="truncate text-[13px] font-semibold text-ink">
        {presupuesto.obra_nombre ?? 'sin objeto'}
      </span>
      <span className="truncate text-[12px] text-muted">{presupuesto.cliente ?? 'sin cliente'}</span>
      <span className="font-mono text-[11.5px] tabular-nums text-faint">
        {presupuesto.numero ?? 'sin número'} · rev {presupuesto.version}
        {!presupuesto.vigente && ' · reemplazada'}
        {nVersiones > 1 && ` · ${nVersiones} versiones`}
      </span>
      <span className="whitespace-nowrap text-[11.5px] text-muted">{e.label}</span>
      <div className="flex-1" />
      {acciones}
    </div>
  )
}

function Solapas({ href, vista }: {
  href: (c: { vista: 'oferta' | 'costos' }) => string
  vista: 'oferta' | 'costos'
}) {
  const nota = vista === 'oferta'
    ? 'Esto es lo que ve el cliente: rubro, descripción e importe. Nada de cómputo, horas ni margen.'
    : 'Vista interna. Dirección y Administración; el rol de obra no llega acá.'
  return (
    <div
      className="flex flex-none items-center gap-6 border-b border-line px-5"
      style={{ background: C.superficie }}
      data-testid="solapas-vista"
    >
      {(['oferta', 'costos'] as const).map((v) => (
        <Link
          key={v}
          href={href({ vista: v })}
          data-testid={`solapa-${v}`}
          data-activa={vista === v ? '1' : '0'}
          className={`py-3 text-[12.5px] ${vista === v ? 'font-semibold text-ink' : 'text-muted'}`}
          style={vista === v ? { boxShadow: `inset 0 -2px 0 ${C.grafito}` } : undefined}
        >
          {v === 'oferta' ? 'Oferta' : 'Costos y precio'}
        </Link>
      ))}
      <div className="flex-1" />
      <span className="hidden text-[11px] text-faint lg:block">{nota}</span>
    </div>
  )
}

/** La vista interna: el razonamiento que derivó el precio, las partidas y la cascada. */
function Costos({
  presupuesto, lista, lectura, subFuera, errorPartidas, seleccionada, congelado,
  hrefNueva, hrefCancelarNueva, nueva,
}: {
  presupuesto: NonNullable<Awaited<ReturnType<typeof getPresupuesto>>['data']>
  lista: NonNullable<Awaited<ReturnType<typeof getPartidas>>['data']>
  lectura: ReturnType<typeof pasosDeLectura>
  subFuera: ReturnType<typeof subcontratadasFueraDelPrecio>
  errorPartidas: string | null
  seleccionada: string | null
  congelado: boolean
  hrefNueva: string
  hrefCancelarNueva: string
  nueva: boolean
}) {
  return (
    // ═══ 760 px DE MÍNIMO, Y ESO SIGNIFICA SCROLL HORIZONTAL A 1280 (medido el 03/09/2026) ═══
    //
    // A 1280 el presupuesto vivo mide 632 px —1280 menos los 648 fijos de la conversación— y la
    // tabla de partidas tiene ocho columnas con `fr`: sin un mínimo se comprimen hasta que el código se
    // superpone con la descripción y la columna COSTO queda cortada contra el borde. Con el mínimo, el
    // contenedor scrollea de lado y la tabla conserva sus proporciones. Es una limitación real de
    // poner 648 px fijos al lado de una tabla ancha, y se resuelve scrolleando, no comprimiendo.
    <div className="mx-auto flex w-full min-w-[900px] max-w-[1000px] flex-col gap-7">
      {subFuera.n > 0 && (
        // HUECO DEL MODELO, MEDIDO EL 21/08/2026 — no una precaución teórica. La vista valoriza con
        // `coalesce(costo_unitario, analisis)` y una subcontratada no tiene ninguno de los dos: su
        // precio NO llega al costo directo, y `sin_analisis` la excluye a propósito, así que tampoco
        // aparece en el aviso de deuda de carga.
        <Aviso
          tono="neg"
          titulo={`${subFuera.n} ${subFuera.n === 1 ? 'partida subcontratada queda' : 'partidas subcontratadas quedan'} fuera del precio`}
          testid="aviso-subcontratadas"
        >
          El precio del subcontrato está cargado{subFuera.precioNoContado !== null && ` (${plata(subFuera.precioNoContado)})`} pero
          NO suma al costo directo: la valorización sólo mira el análisis, y un paquete subcontratado
          no tiene. Hasta que el modelo lo contemple, el precio firme de arriba está incompleto por
          ese monto.
        </Aviso>
      )}

      {/* EL PASO A PASO ES LA GUÍA (dueño, 02/09 + «Presupuestos v5 · Lectura del plano»): antes de
          hablar de precio, el razonamiento que lo derivó, con sus faltantes nombrados. Va PLEGADO
          salvo que algún paso no sea firme — un razonamiento sin dudas es contexto, no trabajo. */}
      {lectura.length > 0 && (
        <Plegable
          titulo="Razonamiento del cotizador — la lectura del plano que derivó en este precio"
          cuenta={lectura.filter((x) => x.estado !== 'firme').length || null}
          abiertoPorDefecto={lectura.some((x) => x.estado !== 'firme')}
          testid="lectura-plegable"
        >
          <LecturaDelPlano pasos={lectura} />
        </Plegable>
      )}

      <TablaPartidas
        partidas={lista}
        cotizacionId={presupuesto.id}
        costoDirecto={tieneCifras(presupuesto) ? presupuesto.costo_directo : null}
        hhPrevistas={tieneCifras(presupuesto) ? presupuesto.hh_previstas : null}
        precioVenta={tieneCifras(presupuesto) ? presupuesto.precio_venta : null}
        margenPct={presupuesto.margen_sobre_precio_pct}
        seleccionada={seleccionada}
        congelado={congelado}
        accion={
          !congelado && (
            <Link
              href={nueva ? hrefCancelarNueva : hrefNueva}
              data-testid="abrir-alta-partida"
              className="rounded-control bg-marca px-3 py-[6px] text-[12.5px] font-semibold text-[color:var(--os-on-marca)]"
            >
              {nueva ? 'Cancelar' : 'Partida'}
            </Link>
          )
        }
      />

      {errorPartidas && (
        <Aviso tono="neg" titulo="No pude leer las partidas">{errorPartidas}</Aviso>
      )}

      <CascadaDeDecision p={presupuesto} />
    </div>
  )
}
