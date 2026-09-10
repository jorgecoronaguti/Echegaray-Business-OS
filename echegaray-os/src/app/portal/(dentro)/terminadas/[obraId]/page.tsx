import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { sesionDelPortal } from '../../../sesion'
import { accesoDelPortal } from '../../../datos'
import { esquemaDelPortal, obrasParaElInicio } from '../../datosObra'
import { ambitosDelEspejo, esObraAnterior } from '../../../obrasDelCliente'
import { papelesDelCliente, corridasDelEspejo } from '../../documentos/datos'
import { papelesVisibles, vistaDeObra } from '../../../papeles'
import { cierreDeObra } from '../cierre'
import { pesos } from '../../../cronograma'
import { haceCuanto } from '../../../documentos'
import { Rubro, Vacio } from '../../../Piezas'
import { IconoChevron, IconoDescarga, IconoFactura, IconoCheck, IconoCarpeta } from '../../../iconos'

// UNA OBRA TERMINADA, ADENTRO — la misma carpeta en modo lectura, más el cierre.
//
// No hay nada que tocar acá: la obra está cerrada. Por eso no hay «Adjuntar» ni acción primaria
// amarilla — el amarillo es acción, y acá no hay ninguna. «Descargar todo» es lo único que se ofrece.
//
// ═══ DEJÓ DE APOYARSE EN `public.obras` (10/09/2026) ═══
//
// La obra, el alcance y los papeles salían de tres registros distintos: `public.obras` (uuid) para la
// obra, `public.obras` otra vez para el permiso, y `obra_canonica` para los papeles, unidos por la
// carpeta de Drive. El puente por carpeta funcionaba, pero la lista de arriba mostraba las obras de
// `obra_canonica` y ésta las de `public.obras`: el enlace no llevaba a ningún lado. Ahora las tres
// cosas salen del mismo registro y el id de la URL ES el de `obra_canonica`.

export const dynamic = 'force-dynamic'

export default async function ObraTerminada({ params }: { params: Promise<{ obraId: string }> }) {
  const sesion = await sesionDelPortal()
  if (!sesion) redirect('/portal/login')
  const { obraId } = await params

  // EL ALCANCE SE COMPRUEBA CONTRA LA BASE, no contra la URL. Cambiar el id a mano no abre la obra
  // de otro cliente: `obrasParaElInicio` ya aplicó `alcanzaLaObra` fila por fila.
  const acceso = await accesoDelPortal(sesion)
  if (!acceso) redirect('/portal/login')
  const obra = (await obrasParaElInicio(acceso)).find((o) => o.id === obraId)
  // Una obra que existe pero NO está terminada no se abre acá: esta pantalla habla en pasado.
  if (!obra || !esObraAnterior(obra)) notFound()

  const { pagos } = await esquemaDelPortal(acceso)
  const cierre = cierreDeObra(pagos.filter((p) => p.obraId === obraId), obra.desde, obra.hasta)
  const montos = acceso.puedeVerMontos

  // LOS PAPELES SALEN DEL ESPEJO, NO DE DRIVE. Esta pantalla también leía Google en vivo y en Vercel
  // eso nunca funcionó: no hay disco donde vive la credencial de la cuenta de servicio. Los ámbitos
  // incluyen los de las obras ABSORBIDAS: después de una fusión, los papeles siguen archivados bajo
  // el id viejo (`obra:bsa-planta`).
  const canonicas = [obra.id, ...obra.absorbidas]
  const [todos, corridas] = await Promise.all([
    papelesDelCliente(acceso.clienteId),
    corridasDelEspejo(ambitosDelEspejo(obra)),
  ])
  const datos = vistaDeObra(
    papelesVisibles(todos, acceso).filter((p) => p.obraId !== null && canonicas.includes(p.obraId)),
  )
  // La más reciente de las corridas que alimentan esta carpeta. `null` = el espejo nunca pasó.
  const al = [...corridas.values()].map((c) => c.al).filter((d) => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null

  return (
    <>
      <Link href="/portal/terminadas" className="inline-flex min-h-11 items-center gap-1.5 text-[13px] text-muted hover:text-ink">
        <IconoChevron hacia="izquierda" tamano={16} /> Terminadas
      </Link>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-[22px] font-semibold tracking-[-.015em]">{obra.nombre}</h1>
        <span className="text-[12.5px] text-muted">
          {obra.hasta ? `terminada ${obra.hasta.slice(8, 10)}/${obra.hasta.slice(5, 7)}/${obra.hasta.slice(0, 4)}` : 'sin fecha de cierre'}
        </span>
        <span className="ml-auto grid min-h-11 place-items-center rounded-[6px] border border-line-strong bg-surface px-4 text-[13px] text-muted">
          <span className="flex items-center gap-2"><IconoDescarga tamano={17} /> Descargar todo</span>
        </span>
      </div>

      <dl className="mt-6 flex flex-wrap gap-x-12 gap-y-5 border-y border-line py-5">
        {/* SIN PERMISO DE MONTOS NO SE DIBUJA NI UNA CIFRA. Es la misma cerradura que en Pagos: un
            contacto que no puede ver plata tampoco la ve acá porque la obra esté cerrada. */}
        {montos ? <Dato rotulo="Monto final" valor={pesos(obra.contrato.monto, obra.contrato.moneda)} /> : null}
        {montos ? <Dato rotulo="Cobrado" valor={cierre.pendiente === 0 && cierre.cobrado > 0 ? 'todo' : pesos(cierre.cobrado)} /> : null}
        <Dato
          rotulo="Duración"
          valor={obra.desde && obra.hasta ? `${mesAno(obra.desde)} – ${mesAno(obra.hasta)}` : 'sin fechas'}
        />
        {montos ? (
          <Dato
            rotulo="Fondo de reparo"
            valor={cierre.reparoDevueltoEn ? `devuelto ${mesAno(cierre.reparoDevueltoEn)}` : cierre.faltaReparo ? `abierto · ${pesos(cierre.faltaReparo)}` : 'sin plan'}
            alerta={Boolean(cierre.faltaReparo)}
          />
        ) : null}
      </dl>

      <Rubro derecha={`Drive · ${haceCuanto(al)}`}>CONTRATO Y COTIZACIÓN</Rubro>
      {datos.cotizacion || datos.contrato ? (
        <>
          {datos.cotizacion ? <FilaLectura nombre="Cotización final" detalle={detalle(datos.cotizacion.revision, datos.cotizacion.fecha)} /> : null}
          {datos.contrato ? <FilaLectura nombre="Contrato firmado" detalle={detalle(datos.contrato.revision, datos.contrato.fecha)} /> : null}
        </>
      ) : (
        <div className="mt-4"><Vacio>{!obra.carpeta ? 'Todavía no conectamos la carpeta de esta obra.' : al ? 'Sin cotización ni contrato en la carpeta.' : 'Todavía no sincronizamos los papeles de esta obra.'}</Vacio></div>
      )}

      <Rubro derecha={datos.hojasTotales != null ? `${datos.hojasTotales} hojas` : 'hojas sin contar'}>
        PLANOS COMO QUEDÓ
      </Rubro>
      {datos.planos.length ? (
        datos.planos.map((p) => (
          <FilaLectura
            key={p.disciplina}
            nombre={p.rotulo}
            detalle={[
              p.docs.every((d) => d.revision === 'rev final') ? 'rev final' : (p.docs[0]?.revision ?? 'sin revisión'),
              p.docs.every((d) => d.hojas != null) ? `${p.docs.reduce((s, d) => s + (d.hojas ?? 0), 0)} hojas` : `${p.docs.length} archivos`,
            ].join(' · ')}
          />
        ))
      ) : (
        <div className="mt-4"><Vacio>Sin planos en la carpeta.</Vacio></div>
      )}

      <Rubro>FACTURAS Y RECIBOS</Rubro>
      <div className="flex min-h-11 items-center gap-3 border-b border-line py-[15px]">
        <span className="text-pos"><IconoCheck tamano={19} /></span>
        <span className="flex-1 text-sm">
          {cierre.facturas} {cierre.facturas === 1 ? 'factura' : 'facturas'} · {cierre.recibos} {cierre.recibos === 1 ? 'recibo' : 'recibos'}
        </span>
        {montos ? <span className="tnum font-mono text-[15px]">{pesos(cierre.cobrado)}</span> : null}
        <span className="grid min-h-11 min-w-11 place-items-center text-faint"><IconoDescarga tamano={18} /></span>
      </div>
      {datos.certificados.length ? (
        <FilaLectura nombre="Certificados" detalle={`${datos.certificados.length} en la carpeta`} />
      ) : null}
    </>
  )
}

const mesAno = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(0, 4)}`
const detalle = (rev: string | null, fecha: string | null) =>
  [rev ?? 'sin revisión', fecha ? `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}/${fecha.slice(0, 4)}` : 'sin fecha'].join(' · ')

function Dato({ rotulo, valor, alerta = false }: { rotulo: string; valor: string; alerta?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] tracking-[.09em] text-faint">{rotulo.toUpperCase()}</dt>
      <dd className={`tnum mt-1 font-mono text-[17px] font-semibold ${alerta ? 'text-warn' : ''}`}>{valor}</dd>
    </div>
  )
}

function FilaLectura({ nombre, detalle }: { nombre: string; detalle: string }) {
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-[15px]">
      <span className="text-faint"><IconoFactura tamano={19} /></span>
      <span className="min-w-0 flex-1 basis-[45%] truncate text-sm">{nombre}</span>
      <span className="text-[12.5px] text-muted">{detalle}</span>
      <span className="grid min-h-11 min-w-11 place-items-center text-faint"><IconoCarpeta tamano={18} /></span>
    </div>
  )
}
