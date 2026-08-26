import { redirect } from 'next/navigation'
import { sesionDelPortal } from '../../sesion'
import { accesoDelPortal, obrasDelCliente } from '../../datos'
import { obraDetalle } from '../datosObra'
import { documentosDeObra } from './drive'
import { haceCuanto, type Documento } from '../../documentos'
import { Rubro, Vacio } from '../../Piezas'
import { IconoCarpeta, IconoFactura, IconoDescarga, IconoCheck, IconoClip } from '../../iconos'
import { Adjuntar } from './Adjuntar'

// DOCUMENTOS — la carpeta de la obra, contada como la entiende el cliente.
//
// Cotización y contrato arriba (SU TRABAJO), planos por disciplina con su revisión y sus hojas,
// certificados, y al final lo que sube el cliente. Todo sale de Drive: el portal no guarda una copia
// que se desincronice.

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
  const obras = await obrasDelCliente(acceso)
  if (!obras.length) return <Vacio>Todavía no tenemos ninguna obra asociada a su mail.</Vacio>

  return (
    <>
      <h1 className="text-xl font-semibold tracking-[-.01em]">Documentos</h1>
      {/* UNA SECCIÓN POR OBRA. Los papeles viven en la carpeta de SU obra —el contrato de una no es el
          de la otra— así que se muestran separados aunque el cliente los vea todos de una vez. */}
      {obras.map((o) => (
        <DeUnaObra key={o.id} obraId={o.id} nombre={o.nombre} conTitulo={obras.length > 1} />
      ))}
    </>
  )
}

async function DeUnaObra({ obraId, nombre, conTitulo }: { obraId: string; nombre: string; conTitulo: boolean }) {
  const obra = await obraDetalle(obraId)
  const { datos, al, error } = await documentosDeObra(obra?.driveCarpetaId ?? null)

  return (
    <section className={conTitulo ? 'mt-9 first:mt-6' : 'mt-2'}>
      <div className="flex flex-wrap items-center gap-3">
        {conTitulo ? <h2 className="text-[15px] font-semibold tracking-[-.01em]">{nombre}</h2> : null}
        {/* LA FRESCURA SIEMPRE A LA VISTA: un cache mudo no se distingue de un dato congelado. */}
        <span className="flex items-center gap-1.5 text-[12px] text-faint">
          <IconoCarpeta tamano={15} />
          Drive · {haceCuanto(al)}
        </span>
        <div className="ml-auto"><Adjuntar obraId={obraId} /></div>
      </div>

      {error === 'sin_carpeta' ? (
        <div className="mt-4">
          <Vacio>Todavía no conectamos la carpeta de esta obra. Pedínosla y te la compartimos.</Vacio>
        </div>
      ) : error === 'sin_conexion' && !al ? (
        <div className="mt-6"><Vacio>No pudimos leer la carpeta ahora. Volvé a probar en un minuto.</Vacio></div>
      ) : (
        <>
          {error === 'sin_conexion' ? (
            <p className="mt-3 text-[12.5px] text-warn">No pudimos actualizar ahora: esto es lo último que leímos.</p>
          ) : null}

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
              <div key={p.disciplina} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-[15px]">
                <span className="text-faint"><IconoFactura tamano={19} /></span>
                <span className="min-w-0 flex-1 basis-[45%] truncate text-sm">{p.rotulo}</span>
                <span className="text-[12.5px] text-muted">
                  {resumenPlanos(p.docs)}
                </span>
                <span className="grid min-h-11 min-w-11 place-items-center text-faint"><IconoDescarga tamano={18} /></span>
              </div>
            ))
          ) : (
            <div className="mt-4"><Vacio>Todavía no hay planos cargados.</Vacio></div>
          )}

          {datos.certificados.length ? (
            <>
              <Rubro>CERTIFICADOS</Rubro>
              <div className="flex min-h-11 items-center gap-3 border-b border-line py-[15px]">
                <span className="text-pos"><IconoCheck tamano={19} /></span>
                <span className="flex-1 text-sm">
                  {datos.certificados.length === 1 ? '1 certificado' : `${datos.certificados.length} certificados`}
                </span>
                <span className="grid min-h-11 min-w-11 place-items-center text-faint"><IconoDescarga tamano={18} /></span>
              </div>
            </>
          ) : null}

          {datos.otros.length ? (
            <>
              <Rubro>OTROS PAPELES</Rubro>
              {datos.otros.map((d) => <FilaDoc key={d.id} doc={d} rotulo={d.nombre} />)}
            </>
          ) : null}

          <Rubro>LO QUE USTED SUBE</Rubro>
          <p className="mt-4 flex items-center gap-2 text-[13px] text-muted">
            <IconoClip tamano={17} />
            Lo que suba cae en una carpeta propia de esta obra y avisamos a administración.
          </p>
        </>
      )}
    </section>
  )
}

/** «rev 4 · 6 hojas · 02/07» — y cada pedazo desaparece si no hay dato, en vez de escribir un cero. */
function resumenPlanos(docs: Documento[]): string {
  const revs = [...new Set(docs.map((d) => d.revision).filter(Boolean))]
  const hojas = docs.map((d) => d.hojas)
  const fechas = docs.map((d) => d.fecha).filter(Boolean).sort()
  const partes: string[] = []
  partes.push(revs.length === 1 ? revs[0]! : revs.length ? `${revs.length} revisiones` : 'sin revisión')
  if (hojas.every((h) => h != null) && hojas.length) partes.push(`${(hojas as number[]).reduce((s, h) => s + h, 0)} hojas`)
  else partes.push(docs.length === 1 ? '1 archivo' : `${docs.length} archivos`)
  const ultima = fechas.at(-1)
  if (ultima) partes.push(`${ultima.slice(8, 10)}/${ultima.slice(5, 7)}`)
  return partes.join(' · ')
}

function FilaDoc({ doc, rotulo }: { doc: Documento; rotulo: string }) {
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 border-b border-line py-[15px]">
      <span className="text-faint"><IconoFactura tamano={19} /></span>
      <span className="min-w-0 flex-1 basis-[45%] truncate text-sm">{rotulo}</span>
      <span className="text-[12.5px] text-muted">
        {[doc.revision ?? 'sin revisión', doc.fecha ? `${doc.fecha.slice(8, 10)}/${doc.fecha.slice(5, 7)}` : 'sin fecha'].join(' · ')}
      </span>
      <span className="grid min-h-11 min-w-11 place-items-center text-faint"><IconoDescarga tamano={18} /></span>
    </div>
  )
}