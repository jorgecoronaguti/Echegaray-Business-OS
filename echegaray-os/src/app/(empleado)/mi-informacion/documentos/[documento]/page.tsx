import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { categoriaDe } from '@/features/mi-cuenta/services/documentos'
import { Aviso, Estado } from '@/shared/components/ds'
import { PantallaEmpleado, Seccion } from '@/features/empleado/components/ShellEmpleado'
import { Fila, Nada } from '@/features/empleado/components/Filas'
import { FormSubirDocumento } from '@/features/empleado/components/FormSubirDocumento'
import { getMiDocumento } from '@/features/empleado/services/empleadoService'
import { hoyISO } from '@/features/empleado/services/acciones'
import { ESTADO_LABEL, ESTADO_TONO, estadoEnPantalla } from '@/features/empleado/services/documentos'
import { dm } from '@/features/empleado/services/fecha'

// SUBIR DOCUMENTO — con el motivo del rechazo arriba de todo si volvió corregido.
//
// El handoff pone el motivo PRIMERO: «texto del revisor + fecha + quién». Sin eso, quien vuelve a
// entrar no sabe qué corregir y sube exactamente la misma foto — y el ciclo se repite hasta que
// alguien llama por teléfono, que es lo que esta pantalla existe para evitar.

export const dynamic = 'force-dynamic'

export default async function SubirDocumentoPage({ params }: { params: Promise<{ documento: string }> }) {
  const { documento: id } = await params
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')

  const d = await getMiDocumento(supabase, id)
  if (!d.data) {
    if (d.error) {
      return (
        <PantallaEmpleado titulo="Documento" volver={{ href: '/mi-informacion/documentos', label: 'Mis documentos' }}>
          <Aviso tono="neg" titulo="No se pudo leer el documento." testid="documento-error">{d.error}</Aviso>
        </PantallaEmpleado>
      )
    }
    // NO ES TUYO → 404. `mi_documento_legajo` devolvió cero filas; la diferencia entre «no existe» y
    // «es de otro» no se le cuenta a quien preguntó por uno ajeno.
    notFound()
  }

  const doc = d.data
  const hoy = await hoyISO()
  const e = estadoEnPantalla(doc, hoy)

  return (
    <PantallaEmpleado
      titulo={doc.nombre ?? categoriaDe(doc.tipo_documento)}
      volver={{ href: '/mi-informacion/documentos', label: 'Mis documentos' }}
      sub={<Estado tono={ESTADO_TONO[e]} clave={e} testid="estado-documento">{ESTADO_LABEL[e]}</Estado>}
    >
      {e === 'requiere_correccion' && (
        <Aviso tono="neg" titulo="Administración devolvió lo que subiste" testid="motivo-correccion">
          {doc.motivo_revision ?? 'No dejaron escrito el motivo. Consultá con Administración antes de volver a subirlo.'}
          {doc.revisado_en && (
            <span className="mt-1 block text-[11.5px] text-faint">Revisado el {dm(doc.revisado_en.slice(0, 10))}</span>
          )}
        </Aviso>
      )}

      {e === 'en_revision' && (
        <Aviso tono="info" titulo="Ya lo mandaste: está en revisión" testid="en-revision">
          Lo subiste{doc.presentado_en ? ` el ${dm(doc.presentado_en.slice(0, 10))}` : ''} y Administración
          todavía no lo miró. No hace falta que lo vuelvas a subir; si querés reemplazarlo, podés.
        </Aviso>
      )}

      <Seccion titulo="LO QUE HAY EN TU LEGAJO">
        {doc.presente && doc.drive_file_id ? (
          <Fila
            testid="documento-oficial"
            href={`https://drive.google.com/file/d/${doc.drive_file_id}/view`}
            titulo={doc.nombre ?? categoriaDe(doc.tipo_documento)}
            detalle={
              <>
                {doc.fecha_documento ? `del ${dm(doc.fecha_documento)}` : 'sin fecha'}
                {doc.fecha_vencimiento ? ` · vence ${dm(doc.fecha_vencimiento)}` : ''}
              </>
            }
            senal="Ver"
          />
        ) : (
          <Nada testid="sin-documento-oficial">
            Todavía no hay un documento aprobado de este tipo en tu legajo: te lo están pidiendo.
          </Nada>
        )}
      </Seccion>

      {doc.presentado_nombre && (
        <Seccion titulo="LO QUE SUBISTE">
          <Fila
            testid="presentacion"
            titulo={doc.presentado_nombre}
            detalle={doc.presentado_en ? `subido ${dm(doc.presentado_en.slice(0, 10))}` : 'sin fecha'}
            senal={ESTADO_LABEL[e]}
            senalTono={e === 'requiere_correccion' ? 'neg' : 'faint'}
          />
        </Seccion>
      )}

      <div className="mt-7">
        <FormSubirDocumento
          documentacionId={doc.id}
          tipoDocumento={doc.tipo_documento}
          volverA="/mi-informacion/documentos"
        />
      </div>
    </PantallaEmpleado>
  )
}
