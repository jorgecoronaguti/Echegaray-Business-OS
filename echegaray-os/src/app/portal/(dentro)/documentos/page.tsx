import { redirect } from 'next/navigation'
import { sesionDelPortal } from '../../sesion'
import { accesoDelPortal } from '../../datos'
import { obrasParaElInicio } from '../datosObra'
import { haceCuanto } from '../../documentos'
import { papelesVisibles, vistaDeObra, hayAlgoQueMostrar, type Papel, type VistaDeObra } from '../../papeles'
import { papelesDelCliente, corridasDelEspejo, type CorridaDelEspejo } from './datos'
import { Rubro, Vacio } from '../../Piezas'
import { IconoCarpeta, IconoFactura, IconoDescarga, IconoCheck, IconoClip } from '../../iconos'
import { Adjuntar } from './Adjuntar'

// DOCUMENTOS — la carpeta de la obra, contada como la entiende el cliente.
//
// ═══ QUÉ CAMBIÓ EL 26/08/2026 Y POR QUÉ ═══
//
// Esta pantalla leía Drive EN VIVO. La credencial de la cuenta de servicio es un archivo en el disco
// de la VM y el portal corre en Vercel, donde no hay disco: los CINCO clientes veían «No pudimos
// leer la carpeta ahora» y ni un solo enlace de descarga. Ahora lee `public.documento_cliente`, que
// llena `orquestador/scripts/documentos-espejo.mjs` desde la VM, y el botón de descarga baja el
// archivo de verdad desde un bucket privado.
//
// ═══ LAS OBRAS SALEN DE `obra_canonica`, NO DE `public.obras` ═══
//
// `public.obras` tiene carpeta de Drive en 3 de 10 filas; `obra_canonica` en 11 de 16 — y es el
// registro cuyos ids nombra `cliente_acceso.obras`. Con `public.obras` había que fallar cerrado y
// devolver CERO obras a todo acceso acotado, porque no existe mapeo entre los dos registros. Acá el
// alcance se aplica exacto, que es lo que el resto del portal ya hacía.

export const dynamic = 'force-dynamic'

export default async function Documentos() {
  const sesion = await sesionDelPortal()
  if (!sesion) redirect('/portal/login')
  const acceso = await accesoDelPortal(sesion)
  if (!acceso) redirect('/portal/login')

  // `puede_ver_obra` GOBIERNA ESTA PANTALLA. Sin ese permiso no se dibuja una lista vacía —que se
  // leería «no hay papeles»—: se dice que el acceso no los incluye.
  if (!acceso.puedeVerObra) {
    return <Vacio>Su acceso no incluye los documentos de la obra. Escribinos y lo revisamos.</Vacio>
  }

  const [obras, todos] = await Promise.all([obrasParaElInicio(acceso), papelesDelCliente(acceso.clienteId)])
  const visibles = papelesVisibles(todos, acceso)
  const corridas = await corridasDelEspejo([
    ...obras.map((o) => `obra:${o.id}`),
    `cliente:${acceso.clienteId}`,
  ])

  // Los papeles que cuelgan de la carpeta del CLIENTE y no de una obra. Es un estado real —hay
  // clientes cuyo contrato vive un nivel más arriba— y esconderlos los haría desaparecer.
  const sueltos = visibles.filter((p) => p.obraId === null)

  if (!obras.length && !sueltos.length) {
    return <Vacio>Todavía no tenemos ninguna obra asociada a su mail.</Vacio>
  }

  const conTitulo = obras.length + (sueltos.length ? 1 : 0) > 1

  return (
    <>
      <h1 className="text-xl font-semibold tracking-[-.01em]">Documentos</h1>
      {/* UNA SECCIÓN POR OBRA. Los papeles viven en la carpeta de SU obra —el contrato de una no es
          el de la otra— así que se muestran separados aunque el cliente los vea todos de una vez. */}
      {obras.map((o) => (
        <DeUnaObra
          key={o.id}
          nombre={o.nombre}
          conTitulo={conTitulo}
          papeles={visibles.filter((p) => p.obraId === o.id)}
          corrida={corridas.get(`obra:${o.id}`) ?? null}
          obraId={o.id}
        />
      ))}
      {sueltos.length ? (
        <DeUnaObra
          nombre="Papeles generales"
          conTitulo={conTitulo}
          papeles={sueltos}
          corrida={corridas.get(`cliente:${acceso.clienteId}`) ?? null}
          obraId={null}
        />
      ) : null}
    </>
  )
}

function DeUnaObra({
  nombre, conTitulo, papeles, corrida, obraId,
}: {
  nombre: string; conTitulo: boolean; papeles: Papel[]; corrida: CorridaDelEspejo | null; obraId: string | null
}) {
  const datos = vistaDeObra(papeles)

  return (
    <section className={conTitulo ? 'mt-9 first:mt-6' : 'mt-2'}>
      <div className="flex flex-wrap items-center gap-3">
        {conTitulo ? <h2 className="text-[15px] font-semibold tracking-[-.01em]">{nombre}</h2> : null}
        {/* LA FRESCURA SIEMPRE A LA VISTA: un espejo mudo no se distingue de uno que dejó de correr. */}
        <span className="flex items-center gap-1.5 text-[12px] text-faint">
          <IconoCarpeta tamano={15} />
          Drive · {haceCuanto(corrida?.al ?? null)}
        </span>
        {obraId ? <div className="ml-auto"><Adjuntar obraId={obraId} /></div> : null}
      </div>

      {/* LOS TRES VACÍOS SON DISTINTOS y se dicen distinto. Uno se resuelve solo, otro hay que
          reclamarlo, y el tercero es que no hay nada. Un único «sin documentos» los tapa a los tres. */}
      {!corrida ? (
        <div className="mt-6"><Vacio>Todavía no sincronizamos los papeles de esta obra. Si los necesita ahora, escribinos.</Vacio></div>
      ) : corrida.error ? (
        <div className="mt-6"><Vacio>No pudimos leer la carpeta de esta obra en la última pasada. Ya lo estamos mirando.</Vacio></div>
      ) : !hayAlgoQueMostrar(datos) ? (
        <div className="mt-6"><Vacio>Todavía no hay papeles publicados para esta obra.</Vacio></div>
      ) : (
        <Pila datos={datos} />
      )}

      <Rubro>LO QUE USTED SUBE</Rubro>
      <p className="mt-4 flex items-center gap-2 text-[13px] text-muted">
        <IconoClip tamano={17} />
        {obraId
          ? 'Lo que suba cae en una carpeta propia de esta obra y avisamos a administración.'
          : 'Para adjuntar algo, elegí la obra a la que corresponde.'}
      </p>
    </section>
  )
}

function Pila({ datos }: { datos: VistaDeObra }) {
  return (
    <>
      <Rubro>SU TRABAJO</Rubro>
      {datos.cotizacion || datos.contrato ? (
        <>
          {datos.cotizacion ? <FilaDoc doc={datos.cotizacion} rotulo="Cotización" /> : null}
          {datos.contrato ? <FilaDoc doc={datos.contrato} rotulo="Contrato" /> : null}
        </>
      ) : (
        <div className="mt-4"><Vacio>Sin cotización ni contrato en la carpeta.</Vacio></div>
      )}

      <Rubro derecha={datos.hojasTotales != null ? `${datos.hojasTotales} hojas` : 'hojas sin contar'}>
        PLANOS
      </Rubro>
      {datos.planos.length ? (
        datos.planos.map((p) => (
          <div key={p.disciplina}>
            <p className="mt-3.5 text-[12px] font-semibold tracking-[.04em] text-faint">{p.rotulo.toUpperCase()}</p>
            {p.docs.map((d) => <FilaDoc key={d.id} doc={d} rotulo={d.titulo} />)}
          </div>
        ))
      ) : (
        <div className="mt-4"><Vacio>Todavía no hay planos cargados.</Vacio></div>
      )}

      {datos.certificados.length ? (
        <>
          <Rubro derecha={`${datos.certificados.length}`}>CERTIFICADOS Y RECIBOS</Rubro>
          {datos.certificados.map((d) => <FilaDoc key={d.id} doc={d} rotulo={d.titulo} icono="check" />)}
        </>
      ) : null}

      {datos.facturas.length ? (
        <>
          <Rubro derecha={`${datos.facturas.length}`}>FACTURAS</Rubro>
          {datos.facturas.map((d) => <FilaDoc key={d.id} doc={d} rotulo={d.titulo} />)}
        </>
      ) : null}

      {datos.otros.length ? (
        <>
          <Rubro>OTROS PAPELES</Rubro>
          {datos.otros.map((d) => <FilaDoc key={d.id} doc={d} rotulo={d.titulo} />)}
        </>
      ) : null}
    </>
  )
}

/** «rev 4 · 02/07 · 1,2 MB» — y cada pedazo desaparece si no hay dato, en vez de escribir un cero. */
function detalleDe(doc: Papel): string {
  const partes = [doc.revision ?? 'sin revisión']
  if (doc.hojas != null) partes.push(doc.hojas === 1 ? '1 hoja' : `${doc.hojas} hojas`)
  partes.push(doc.fecha ? `${doc.fecha.slice(8, 10)}/${doc.fecha.slice(5, 7)}` : 'sin fecha')
  // NULL no se dibuja como 0 MB: un archivo de cero bytes no se puede abrir y eso no es lo que pasa.
  if (doc.bytes != null) partes.push(`${(doc.bytes / 1048576).toFixed(1)} MB`)
  return partes.join(' · ')
}

function FilaDoc({ doc, rotulo, icono = 'factura' }: { doc: Papel; rotulo: string; icono?: 'factura' | 'check' }) {
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-[15px]">
      <span className={icono === 'check' ? 'text-pos' : 'text-faint'}>
        {icono === 'check' ? <IconoCheck tamano={19} /> : <IconoFactura tamano={19} />}
      </span>
      <span className="min-w-0 flex-1 basis-[45%] truncate text-sm">{rotulo}</span>
      <span className="text-[12.5px] text-muted">{detalleDe(doc)}</span>
      {/* EL BOTÓN BAJA EL ARCHIVO. Era un icono decorativo: la ruta comprueba la sesión y el alcance
          otra vez —el id viaja en la URL— y devuelve los bytes desde el bucket privado. */}
      <a
        href={`/portal/documentos/descargar/${doc.id}`}
        aria-label={`Descargar ${rotulo}`}
        className="grid min-h-11 min-w-11 place-items-center rounded-[6px] text-faint hover:bg-surface-quiet hover:text-ink"
      >
        <IconoDescarga tamano={18} />
      </a>
    </div>
  )
}
