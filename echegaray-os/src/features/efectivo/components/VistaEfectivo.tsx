// EFECTIVO A RENDIR — la sección de Compras (`/administracion/compras?vista=a-rendir`). Rutea D01–D06.
//
// Diseño: docs/diseno/efectivo-a-rendir/efectivo-a-rendir.dc.html. Datos: migración 20260922T1500.
// Permisos: los de Compras (`esAdministracion()` — Dirección, Administración y Jefe de obra).
//
//   sin `entrega`                  D01 la lista, con D02 al costado si `panel=entregar`
//   `persona`                      la persona con efectivo: sus entregas y rendiciones en una línea de tiempo (29/09/2026)
//   `entrega`                      D03 la ficha, con D06 (`panel=devolucion`) o D05 (ticket observado)
//   `entrega` + `comprobante`      D04 revisar el ticket (D05 si está observado)

import Link from 'next/link'
import { Aviso } from '@/shared/components/ds'
import { CabeceraSeccion } from '@/shared/components/v2/CabeceraSeccion'
import { RefrescarEnVivo } from '@/shared/tiempo-real/ProveedorTiempoReal'
import { TABLAS_DE } from '@/shared/tiempo-real/pantallas'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { seccionesDeCompras } from '@/features/administracion/services/seccionesDeCompras'
import { destinoDe, esperando, filtroDeLista, pesos, resumir } from '../logica/entregas'
import { agruparPorPersona, cronologiaDePersona } from '../logica/personas'
import { MIGRACION } from '../logica/formularios'
import { urlEfectivo } from '../logica/url'
import { leerComprasPorClave, leerEfectivo, leerExtraDeFicha, leerLecturaDelTicket, urlDeFoto, type DatosEfectivo } from '../services/datos'
import { leerParaImputar } from '../services/imputar'
import { leerEdicionDeFicha } from '../services/edicionDatos'
import { PanelEditarComprobante, PanelEditarDevolucion, PanelEditarEntrega } from './Edicion'
import { BotonExportar } from './Botones'
import { FichaEntrega } from './FichaEntrega'
import { FichaPersona } from './FichaPersona'
import { ListaPersonas } from './ListaPersonas'
import { Tarjetas } from './Tarjetas'
import { PanelDevolucion } from './PanelDevolucion'
import { PanelEntregar } from './PanelEntregar'
import { PanelRendirManual } from './PanelRendirManual'
import { PanelImputar } from './PanelImputar'
import { PanelObservado } from './PanelObservado'
import { RevisarComprobante } from './RevisarComprobante'
import { ANCHO_PANEL, ANCHO_PANEL_OBSERVADO, V, botonClaro, botonOscuro } from './estilo'

type Params = Record<string, string | undefined>

export async function VistaEfectivo({ sp }: { sp: Params }) {
  const lectura = await leerEfectivo()
  const cabecera = (accion?: React.ReactNode, cuenta: number | null = null, espacioPanel: boolean | number = false) => (
    <CabeceraSeccion
      testid="vistas-compras"
      vistas={seccionesDeCompras('efectivo', { efectivo: cuenta })}
      accion={accion}
      espacioPanel={espacioPanel}
    />
  )
  if (lectura.estado !== 'ok') {
    return (
      <>
        <NavAdministracion />
        {lectura.estado !== 'sin_permiso' && cabecera()}
        <div style={{ padding: '20px' }} data-testid="efectivo-no-disponible">
          {lectura.estado === 'sin_permiso' && <Aviso tono="info">Esta pantalla es de Administración.</Aviso>}
          {lectura.estado === 'falta_migracion' && (
            <Aviso tono="info" titulo="Efectivo a rendir todavía no está publicado">
              La base no tiene todavía las entregas de efectivo (migración {MIGRACION}). Cuando se aplique, esta sección
              muestra quién tiene plata de la empresa y cuánto rindió. Mientras tanto no se puede entregar ni registrar nada.
            </Aviso>
          )}
          {lectura.estado === 'error' && <Aviso tono="neg" titulo="No pude leer el efectivo a rendir">{lectura.mensaje}</Aviso>}
        </div>
      </>
    )
  }
  const d = lectura.datos
  const abiertas = d.entregas.filter((e) => e.estado === 'abierta').length
  const entrega = sp.entrega ? d.entregas.find((e) => e.codigo === sp.entrega) ?? null : null

  if (sp.entrega && !entrega) {
    return (
      <>
        <NavAdministracion />
        {cabecera(undefined, abiertas)}
        <div style={{ padding: 20 }}><Aviso tono="info">No hay ninguna entrega {sp.entrega}. <Link href={urlEfectivo({})} className="underline">Ver las entregas</Link></Aviso></div>
      </>
    )
  }

  return (
    <>
      <NavAdministracion />
      <RefrescarEnVivo tablas={TABLAS_DE.efectivo} />
      {entrega ? await vistaFicha({ d, entrega, sp, abiertas, cabecera })
        : sp.persona ? await vistaPersona({ d, sp, abiertas, cabecera })
        : vistaLista({ d, sp, abiertas, cabecera })}
    </>
  )
}

type Cabecera = (accion?: React.ReactNode, cuenta?: number | null, espacioPanel?: boolean | number) => React.ReactNode

function vistaLista({ d, sp, abiertas, cabecera }: { d: DatosEfectivo; sp: Params; abiertas: number; cabecera: Cabecera }) {
  const filtro = filtroDeLista(sp.f)
  const entregando = sp.panel === 'entregar'
  const puestos = Object.fromEntries(d.personas.map((p) => [p.id, p.puesto]))
  const accion = (
    // EN EL TELÉFONO, «Entregar efectivo» arriba y a todo el ancho, «Exportar» debajo (24/09/2026). El
    // color es el del diseño de la sección (`botonOscuro`); sólo cambian el ancho y el alto.
    <span className="max-md:!flex max-md:!flex-col-reverse max-md:!items-stretch max-md:!gap-2 max-md:[&>*]:!min-h-[48px] max-md:[&>*]:!w-full max-md:[&>*]:!justify-center max-md:[&>*]:!text-[15px]" style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <BotonExportar entregas={d.entregas} hoy={d.hoy} />
      <Link href={urlEfectivo({ f: filtro, panel: 'entregar' })} prefetch={false} scroll={false} style={botonOscuro} data-testid="abrir-entregar">
        <span aria-hidden style={{ fontSize: '15px', lineHeight: 1 }}>+</span> Entregar efectivo
      </Link>
    </span>
  )
  return (
    <>
      {/* CON EL PANEL ABIERTO LA CABECERA NO MUESTRA SU ACCIÓN. La lista queda atenuada porque
          mientras se entrega no se toca; «Exportar» y «Entregar efectivo» seguían encima de esa
          zona, vivos y clickeables —abrir el panel de nuevo sobre el panel abierto—. Y el hueco
          mide lo que mide EL PANEL, no lo que mide el del patrón. */}
      {cabecera(entregando ? undefined : accion, abiertas, entregando && ANCHO_PANEL)}
      <div className="flex flex-col lg:flex-row lg:items-start">
        {/* Con el panel abierto, el teléfono muestra sólo el panel: apilado debajo quedaba fuera de la vista. */}
        <div className={`min-w-0 flex-1 max-md:!px-4 ${entregando ? 'max-md:hidden' : ''}`} style={{ padding: '22px 20px 34px', display: 'flex', flexDirection: 'column', gap: 24, opacity: entregando ? 0.4 : 1 }}>
          <Tarjetas r={resumir(d.entregas, d.comprobantes, d.rendiciones, d.hoy)} />
          <ListaPersonas personas={agruparPorPersona(d.entregas, d.rendiciones, d.devoluciones, d.hoy, filtro)} filtro={filtro} puestos={puestos} />
        </div>
        {entregando && (
          <PanelEntregar personas={d.personas} obras={d.obras} entregas={d.entregas} cerrarHref={urlEfectivo({ f: filtro })} />
        )}
      </div>
    </>
  )
}

async function vistaFicha({ d, entrega: e, sp, abiertas, cabecera }: {
  d: DatosEfectivo; entrega: DatosEfectivo['entregas'][number]; sp: Params; abiertas: number; cabecera: Cabecera
}) {
  const comprobantes = d.comprobantes.filter((c) => c.entrega_id === e.id)
  const rendiciones = d.rendiciones.filter((r) => r.entrega_id === e.id)
  const devoluciones = d.devoluciones.filter((x) => x.entrega_id === e.id)
  const claves = [...new Set([...rendiciones.map((r) => r.compra_clave), ...comprobantes.map((c) => c.compra_clave).filter((x): x is string => !!x)])]
  const elegido = sp.comprobante ? comprobantes.find((c) => c.id === sp.comprobante) ?? null : null
  const [extra, foto, edicion] = await Promise.all([
    leerExtraDeFicha(e.id, claves, filasManuales(rendiciones)),
    elegido && elegido.estado !== 'observado' ? urlDeFoto(elegido.storage_path) : Promise.resolve(null),
    leerEdicionDeFicha(e.id),
  ])
  const cliente = e.obra_id ? (d.clienteDeObra[e.obra_id] ?? null) : null
  const dest = destinoDe(e, cliente)
  const destino = e.estructura ? 'Estructura' : dest.linea
  const cola = comprobantes.filter(esperando).sort((a, b) => a.enviado_en.localeCompare(b.enviado_en))

  // D04 — el ticket ocupa la pantalla entera (sin la fila de secciones: es un modo de trabajo, no una vista).
  if (elegido && elegido.estado !== 'observado') {
    const rend = rendiciones.find((r) => r.comprobante_id === elegido.id) ?? null
    // LA FILA: por la clave del comprobante; la de un ticket reconocido a mano, por `fila:<n>` (su clave es `m:<id>`).
    const fila = (elegido.compra_clave ? extra.compras.get(elegido.compra_clave) : null)
      ?? (rend ? extra.compras.get(rend.compra_clave) ?? (rend.fila != null ? extra.compras.get('fila:' + rend.fila) : null) : null) ?? null
    // Lo leído que quedó en el fajo en espera: sólo hace falta para precargar «Reconocer el gasto».
    const lectura = d.veEconomia && esperando(elegido) ? await leerLecturaDelTicket(elegido.id) : null
    return (
      <RevisarComprobante
        e={e} c={elegido} cola={cola} fotoUrl={foto} fila={fila} destino={destino}
        rendicion={rend} lectura={lectura} puedeReconocer={d.veEconomia}
      />
    )
  }

  const devolviendo = sp.panel === 'devolucion' && e.estado === 'abierta'
  // RENDIR SIN FOTO (30/09/2026): un gasto tipeado, para cualquiera que vea la ficha. Va a Compras igual que un ticket.
  const rindiendo = sp.panel === 'rendir' && e.estado === 'abierta' && !devolviendo
  // «IMPUTAR UN COMPROBANTE YA CARGADO» (24/09/2026): sólo Dirección y Administración, y sólo con la
  // entrega abierta (la base lo exige igual). La lista se lee sólo con el panel abierto.
  const imputando = sp.panel === 'imputar' && e.estado === 'abierta' && d.veEconomia && !devolviendo
  const paraImputar = imputando ? await leerParaImputar(rendiciones, d.hoy) : null
  const observado = elegido && elegido.estado === 'observado' ? elegido : null
  // EDITAR (25/09/2026): la entrega, una devolución o un ticket/rendición, en un panel al costado.
  const cerrarEdicion = urlEfectivo({ entrega: e.codigo })
  const editandoEntrega = sp.panel === 'editar'
  const devEditada = sp.panel === 'editar-devolucion' ? devoluciones.find((x) => x.id === sp.item) ?? null : null
  const compEditado = sp.panel === 'editar-comprobante' ? comprobantes.find((x) => x.id === sp.item) ?? null : null
  const rendEditada = sp.panel === 'editar-comprobante'
    ? rendiciones.find((x) => x.id === sp.item) ?? (compEditado ? rendiciones.find((x) => x.comprobante_id === compEditado.id) ?? null : null)
    : null
  const filaEditada = rendEditada
    ? extra.compras.get(rendEditada.compra_clave) ?? (rendEditada.fila != null ? extra.compras.get('fila:' + rendEditada.fila) : null) ?? null
    : null
  const edicionPanel = editandoEntrega ? (
    <PanelEditarEntrega
      e={e} personas={d.personas} obras={d.obras} tickets={comprobantes.length} devoluciones={devoluciones.length} cerrarHref={cerrarEdicion}
    />
  ) : devEditada ? (
    <PanelEditarDevolucion e={e} d={devEditada} personas={d.personas} cerrarHref={cerrarEdicion} />
  ) : (compEditado || rendEditada) ? (
    <PanelEditarComprobante
      e={e} comprobante={compEditado} rendicion={rendEditada} fila={filaEditada?.fila ?? null} cerrarHref={cerrarEdicion}
      entregas={d.entregas.filter((x) => x.estado !== 'anulada' || x.id === e.id)}
      rotulo={[filaEditada ? `Fila ${filaEditada.fila} de Compras` : 'Ticket sin fila de Compras todavía', filaEditada?.proveedor, filaEditada?.total != null ? pesos(filaEditada.total) : null].filter(Boolean).join(' · ')}
    />
  ) : null
  const nombres = {
    personas: Object.fromEntries([...d.personas.map((p) => [p.id, p.nombre] as const), ...d.entregas.map((x) => [x.persona_id, x.persona] as const)]),
    obras: Object.fromEntries(d.obras.map((o) => [o.id, o.nombre] as const)),
    entregas: Object.fromEntries(d.entregas.map((x) => [x.id, x.codigo] as const)),
  }
  const conPanel = devolviendo || !!observado || imputando || !!edicionPanel || rindiendo
  const volver = (
    <Link href={urlEfectivo({ persona: e.persona_id })} prefetch={false} style={{ fontSize: '12.5px', color: V.apagado }} data-testid="volver-entregas">
      ← volver a {e.persona}
    </Link>
  )
  return (
    <>
      {cabecera(
        conPanel ? undefined : volver,
        abiertas,
        devolviendo || imputando || edicionPanel || rindiendo ? ANCHO_PANEL : observado ? ANCHO_PANEL_OBSERVADO : false,
      )}
      <div className="flex flex-col lg:flex-row lg:items-start">
        <div className={`min-w-0 flex-1 max-md:!px-4 ${conPanel ? 'max-md:hidden' : ''}`} style={{ padding: '22px 20px 34px', opacity: conPanel ? 0.4 : 1 }}>
          <FichaEntrega
            e={e} comprobantes={comprobantes} rendiciones={rendiciones} devoluciones={devoluciones} extra={extra} cliente={cliente}
            puedeImputar={d.veEconomia} edicion={edicion} nombres={nombres}
          />
        </div>
        {imputando && paraImputar && <PanelImputar e={e} destino={destino} lectura={paraImputar} />}
        {rindiendo && <PanelRendirManual entregas={[e]} entregaInicial={e.id} cerrarHref={cerrarEdicion} quien={e.persona} />}
        {edicionPanel}
        {devolviendo && (
          <PanelDevolucion
            e={e} destino={destino} porImputar={cola.length} personas={d.personas} miPersona={d.miPersona}
          />
        )}
        {observado && !devolviendo && !imputando && !edicionPanel && !rindiendo && <PanelObservado c={observado} e={e} destino={destino} />}
      </div>
    </>
  )
}

/**
 * LA PERSONA: su cuenta y su línea de tiempo. Lee de la misma fuente que la lista (`d`) más las filas de Compras
 * de sus rendiciones y tickets, que es lo que la ficha de cada entrega ya lee.
 */
async function vistaPersona({ d, sp, abiertas, cabecera }: { d: DatosEfectivo; sp: Params; abiertas: number; cabecera: Cabecera }) {
  const id = sp.persona ?? ''
  const suyas = d.entregas.filter((e) => e.persona_id === id)
  const ids = new Set(suyas.map((e) => e.id))
  const p = agruparPorPersona(d.entregas, d.rendiciones, d.devoluciones, d.hoy, 'todas').find((x) => x.id === id)
    ?? agruparPorPersona(d.entregas, d.rendiciones, d.devoluciones, d.hoy, 'anuladas').find((x) => x.id === id)
  if (!p) {
    return (
      <>
        {cabecera(undefined, abiertas)}
        <div style={{ padding: 20 }}><Aviso tono="info">Esa persona no tiene entregas de efectivo. <Link href={urlEfectivo({})} className="underline">Ver las personas</Link></Aviso></div>
      </>
    )
  }
  const comprobantes = d.comprobantes.filter((c) => ids.has(c.entrega_id))
  const rendiciones = d.rendiciones.filter((r) => ids.has(r.entrega_id))
  const claves = [...new Set([...rendiciones.map((r) => r.compra_clave), ...comprobantes.map((c) => c.compra_clave).filter((x): x is string => !!x)])]
  const compras = await leerComprasPorClave(claves, filasManuales(rendiciones))
  const cronologia = cronologiaDePersona({
    entregas: suyas, comprobantes, rendiciones, devoluciones: d.devoluciones.filter((x) => ids.has(x.entrega_id)), compras,
  })
  const puesto = d.personas.find((x) => x.id === id)?.puesto ?? null
  const entregando = sp.panel === 'entregar'
  const vivas = suyas.filter((e) => e.estado === 'abierta')
  const rindiendo = sp.panel === 'rendir' && vivas.length > 0 && !entregando
  const conPanel = entregando || rindiendo
  const cerrar = urlEfectivo({ persona: id })
  const accion = (
    <span className="max-md:!flex max-md:!flex-col-reverse max-md:!items-stretch max-md:!gap-2 max-md:[&>*]:!min-h-[48px] max-md:[&>*]:!w-full max-md:[&>*]:!justify-center max-md:[&>*]:!text-[15px]" style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
      <Link href={urlEfectivo({})} prefetch={false} style={{ fontSize: '12.5px', color: V.apagado }} data-testid="volver-personas">← volver a las personas</Link>
      {vivas.length > 0 && (
        <Link href={urlEfectivo({ persona: id, panel: 'rendir' })} prefetch={false} scroll={false} style={botonClaro} data-testid="abrir-rendir">
          Rendir sin foto
        </Link>
      )}
      <Link href={urlEfectivo({ persona: id, panel: 'entregar' })} prefetch={false} scroll={false} style={botonOscuro} data-testid="abrir-entregar">
        <span aria-hidden style={{ fontSize: '15px', lineHeight: 1 }}>+</span> Entregar efectivo
      </Link>
    </span>
  )
  return (
    <>
      {cabecera(conPanel ? undefined : accion, abiertas, conPanel && ANCHO_PANEL)}
      <div className="flex flex-col lg:flex-row lg:items-start">
        <div className={`min-w-0 flex-1 max-md:!px-4 ${conPanel ? 'max-md:hidden' : ''}`} style={{ padding: '22px 20px 34px', opacity: conPanel ? 0.4 : 1 }}>
          <FichaPersona p={p} cronologia={cronologia} puesto={puesto} />
        </div>
        {entregando && <PanelEntregar personas={d.personas} obras={d.obras} entregas={d.entregas} cerrarHref={cerrar} personaInicial={id} />}
        {rindiendo && <PanelRendirManual entregas={vivas} cerrarHref={cerrar} quien={p.nombre} />}
      </div>
    </>
  )
}

/** Filas de Compras de las rendiciones manuales (su clave `m:<id>` no está en Compras: se atan por número de fila). */
function filasManuales(rendiciones: { fila?: number | null }[]): number[] {
  return [...new Set(rendiciones.map((r) => r.fila).filter((f): f is number => f != null))]
}
