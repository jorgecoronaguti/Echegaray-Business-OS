// EFECTIVO A RENDIR — la sección de Compras (`/administracion/compras?vista=a-rendir`). Rutea D01–D06.
//
// Diseño: docs/diseno/efectivo-a-rendir/efectivo-a-rendir.dc.html. Datos: migración 20260922T1500.
// Permisos: los de Compras (`esAdministracion()` — Dirección, Administración y Jefe de obra).
//
//   sin `entrega`                  D01 la lista, con D02 al costado si `panel=entregar`
//   `entrega`                      D03 la ficha, con D06 (`panel=devolucion`) o D05 (ticket observado)
//   `entrega` + `comprobante`      D04 revisar el ticket (D05 si está observado)

import Link from 'next/link'
import { Aviso } from '@/shared/components/ds'
import { CabeceraSeccion } from '@/shared/components/v2/CabeceraSeccion'
import { RefrescarEnVivo } from '@/shared/tiempo-real/ProveedorTiempoReal'
import { TABLAS_DE } from '@/shared/tiempo-real/pantallas'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { seccionesDeCompras } from '@/features/administracion/services/seccionesDeCompras'
import { destinoDe, esperando, filtroDeLista, resumir } from '../logica/entregas'
import { MIGRACION } from '../logica/formularios'
import { urlEfectivo } from '../logica/url'
import { leerEfectivo, leerExtraDeFicha, urlDeFoto, type DatosEfectivo } from '../services/datos'
import { BotonExportar } from './Botones'
import { FichaEntrega } from './FichaEntrega'
import { ListaEntregas, Tarjetas } from './ListaEntregas'
import { PanelDevolucion } from './PanelDevolucion'
import { PanelEntregar } from './PanelEntregar'
import { PanelObservado } from './PanelObservado'
import { RevisarComprobante } from './RevisarComprobante'
import { ANCHO_PANEL, ANCHO_PANEL_OBSERVADO, V, botonOscuro } from './estilo'

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
      {entrega ? await vistaFicha({ d, entrega, sp, abiertas, cabecera }) : vistaLista({ d, sp, abiertas, cabecera })}
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
          <ListaEntregas
            entregas={d.entregas} comprobantes={d.comprobantes} filtro={filtro} hoy={d.hoy} puestos={puestos} clienteDeObra={d.clienteDeObra}
          />
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
  const [extra, foto] = await Promise.all([
    leerExtraDeFicha(e.id, claves),
    elegido && elegido.estado !== 'observado' ? urlDeFoto(elegido.storage_path) : Promise.resolve(null),
  ])
  const cliente = e.obra_id ? (d.clienteDeObra[e.obra_id] ?? null) : null
  const dest = destinoDe(e, cliente)
  const destino = e.estructura ? 'Estructura' : dest.linea
  const cola = comprobantes.filter(esperando).sort((a, b) => a.enviado_en.localeCompare(b.enviado_en))

  // D04 — el ticket ocupa la pantalla entera (sin la fila de secciones: es un modo de trabajo, no una vista).
  if (elegido && elegido.estado !== 'observado') {
    const fila = elegido.compra_clave ? extra.compras.get(elegido.compra_clave) ?? null
      : extra.compras.get(rendiciones.find((r) => r.comprobante_id === elegido.id)?.compra_clave ?? '') ?? null
    return <RevisarComprobante e={e} c={elegido} cola={cola} fotoUrl={foto} fila={fila} destino={destino} />
  }

  const devolviendo = sp.panel === 'devolucion' && e.estado === 'abierta'
  const observado = elegido && elegido.estado === 'observado' ? elegido : null
  const volver = (
    <Link href={urlEfectivo({})} prefetch={false} style={{ fontSize: '12.5px', color: V.apagado }} data-testid="volver-entregas">
      ← volver a las entregas
    </Link>
  )
  return (
    <>
      {cabecera(
        devolviendo || observado ? undefined : volver,
        abiertas,
        devolviendo ? ANCHO_PANEL : observado ? ANCHO_PANEL_OBSERVADO : false,
      )}
      <div className="flex flex-col lg:flex-row lg:items-start">
        <div className={`min-w-0 flex-1 max-md:!px-4 ${devolviendo || observado ? 'max-md:hidden' : ''}`} style={{ padding: '22px 20px 34px', opacity: devolviendo || observado ? 0.4 : 1 }}>
          <FichaEntrega e={e} comprobantes={comprobantes} rendiciones={rendiciones} devoluciones={devoluciones} extra={extra} cliente={cliente} />
        </div>
        {devolviendo && (
          <PanelDevolucion
            e={e} destino={destino} porImputar={cola.length} personas={d.personas} miPersona={d.miPersona}
          />
        )}
        {observado && !devolviendo && <PanelObservado c={observado} e={e} destino={destino} />}
      </div>
    </>
  )
}
