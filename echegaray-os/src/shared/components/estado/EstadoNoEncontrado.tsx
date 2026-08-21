import { BotonEnlace } from '@/shared/components/ds'

// LO QUE NO EXISTE — el `not-found.tsx` del OS.
//
// NO ES UN ERROR Y NO SE PINTA COMO UNO. No hay regla roja ni texto `neg`: nada se rompió, la
// dirección apunta a algo que no está. Un 404 vestido de falla manda a buscar un defecto donde no
// lo hay, y el sistema ya pagó esa confusión al revés —un `grant` faltante se veía como «página no
// encontrada» y se buscó en el ruteo durante horas (17/08/2026)—. Por eso la última línea dice en
// voz baja lo único que un 404 no puede distinguir solo: si la cosa existe y no se ve, es permiso.
//
// TAMPOCO CULPA A QUIEN LLEGÓ. Ni «dirección inválida» ni «no tenés acceso»: la mayoría de las
// veces es un enlace viejo, un identificador cambiado o una entidad archivada, y ninguna de las
// tres es culpa de quien hizo clic.

export function EstadoNoEncontrado({
  entidad,
  volver,
  detalle,
}: {
  /** Qué se buscaba, en singular y con artículo: «la obra», «el cliente», «esa persona». */
  entidad: string
  volver: { href: string; texto: string }
  /** Una línea extra cuando la entidad tiene un motivo propio y sabido (archivada, dada de baja). */
  detalle?: string
}) {
  return (
    <div className="min-h-screen bg-canvas" data-testid="estado-no-encontrado">
      <div className="w-full px-4 py-6 lg:px-10">
        <div className="max-w-[680px]">
          <div className="text-[11px] font-medium tracking-[0.04em] text-faint">NO ENCONTRADO</div>
          <h1 className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.01em] text-ink">
            No encontramos {entidad}
          </h1>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">
            {detalle ?? 'El enlace puede ser viejo, o lo que buscabas puede haber cambiado de nombre.'}
          </p>
          <div className="mt-5">
            <BotonEnlace href={volver.href} variante="primaria">
              {volver.texto}
            </BotonEnlace>
          </div>
          <p className="mt-4 text-[11.5px] leading-relaxed text-faint">
            Si sabés que existe, puede ser un permiso y no una ausencia: avisá a Administración.
          </p>
        </div>
      </div>
    </div>
  )
}
