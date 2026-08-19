// LA FICHA CANÓNICA DE UNA PERSONA — los cinco bloques del pliego, en una pantalla.
//
// ═══ POR QUÉ ES UNA RUTA Y NO EL PANEL LATERAL QUE HABÍA ═══
//
// El dueño: *"Cada fila abre su ficha"*, y la ficha tiene cinco bloques —información, laboral,
// asignación, horas y documentos—. Eso no entra en 360px sin volverse un acordeón de acordeones. Con
// URL propia, además, la ficha se comparte, se recarga y vuelve con el botón de atrás.
//
// ═══ LECTURA PRIMERO, EDICIÓN A UN CLIC ═══
//
// Los bloques se leen; editar abre el formulario. Es lo que pidió el pliego (*"progressive
// disclosure"*) y lo que hace que abrir una ficha para consultar un teléfono no ponga treinta campos
// editables delante de nadie.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BotonAccion, Callout, FormAccion, PageShell } from '@/shared/components/ui'
import { BloqueAsignacion, BloqueDocumentos, BloqueHoras } from '@/features/administracion/components/BloquesFicha'
import { CamposInformacion, CamposLaboral } from '@/features/administracion/components/FormularioPersona'
import { AltaDocumento, Bloque, Dato, EstadoPersona } from '@/features/administracion/components/FichaPartes'
import {
  getAsignacionesDe, getDocumentos, getPersona,
} from '@/features/administracion/services/personasService'
import {
  agrupar, getHHDePersona, horasEntre, porActividad, porObra,
} from '@/features/administracion/services/hhPersonaService'
import { darDeBaja, editarPersona, reincorporar } from '@/features/administracion/services/personasActions'
import { cerrarAsignacionDePersona } from '@/features/administracion/services/asignacionActions'
import {
  desvincularDocumento, vincularDocumento,
} from '@/features/administracion/services/documentosActions'
import { etiquetaCategoria } from '@/features/administracion/types'

export const dynamic = 'force-dynamic'

/** El período del bloque HORAS: los últimos 30 días. Se declara con fechas concretas en la pantalla
 *  —no «el último mes»— porque un total sin ventana declarada no se puede verificar contra nada. */
function ultimos30() {
  const hasta = new Date()
  const desde = new Date(hasta)
  desde.setUTCDate(desde.getUTCDate() - 29)
  return { desde: desde.toISOString().slice(0, 10), hasta: hasta.toISOString().slice(0, 10) }
}

export default async function FichaPersonaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: persona, error } = await getPersona(supabase, id)
  // NO EXISTE y NO PUEDO LEER son dos cosas distintas: confundirlas manda a buscar un defecto de
  // permisos detrás de un 404, que ya costó media jornada en este repo.
  if (error) {
    return (
      <PageShell title="No pude leer el legajo" maxWidth="max-w-5xl">
        <p data-testid="ficha-error" className="text-[13px] text-neg">{error}</p>
      </PageShell>
    )
  }
  if (!persona) notFound()

  const [asignaciones, documentos, horas] = await Promise.all([
    getAsignacionesDe(supabase, id),
    getDocumentos(supabase, id),
    getHHDePersona(supabase, id),
  ])
  const filasHH = horas.data ?? []
  const ventana = ultimos30()
  const egresada = Boolean(persona.fecha_egreso)

  return (
    <PageShell
      eyebrow={<Link href="/administracion/personas" className="hover:underline">← Personal</Link>}
      title={persona.nombre_completo}
      subtitle={
        <>
          {etiquetaCategoria(persona.categoria)}
          {persona.puesto ? ` · ${persona.puesto}` : persona.especialidad ? ` · ${persona.especialidad}` : ''}
          {' · '}<EstadoPersona fechaEgreso={persona.fecha_egreso} />
        </>
      }
      maxWidth="max-w-5xl"
    >
      {(asignaciones.error || documentos.error || horas.error) && (
        <div className="mb-4">
          <Callout tono="neg">
            {asignaciones.error ?? documentos.error ?? horas.error}
          </Callout>
        </div>
      )}

      <div className="space-y-4">
        <Bloque titulo="Información" testid="bloque-informacion">
          <div className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
            <Dato k="DNI" v={persona.dni} />
            <Dato k="CUIL" v={persona.cuil} />
            <Dato k="Nacimiento" v={persona.fecha_nacimiento} />
            <Dato k="Nacionalidad" v={persona.nacionalidad} />
            <Dato k="Teléfono" v={persona.telefono} />
            <Dato k="Email" v={persona.email} />
            <Dato k="Domicilio" v={persona.domicilio} />
            <Dato
              k="Contacto de emergencia"
              v={[persona.contacto_emergencia, persona.contacto_emergencia_telefono].filter(Boolean).join(' · ') || null}
            />
          </div>
        </Bloque>

        <Bloque titulo="Laboral" testid="bloque-laboral">
          <div className="grid gap-x-8 gap-y-0 sm:grid-cols-2">
            <Dato k="Ingreso" v={persona.fecha_ingreso} />
            <Dato k="Egreso" v={persona.fecha_egreso} />
            <Dato k="Convenio" v={persona.convenio_colectivo} />
            <Dato k="Categoría" v={persona.categoria ? etiquetaCategoria(persona.categoria) : null} />
            <Dato k="Especialidad" v={persona.especialidad} />
            <Dato k="Puesto u oficio" v={persona.puesto} />
            <Dato k="Modalidad" v={persona.modalidad_liquidacion} />
            <Dato k="Notas" v={persona.notas} />
          </div>
        </Bloque>

        <details className="rounded-xl border border-line bg-white" data-testid="editar-persona">
          <summary className="cursor-pointer px-4 py-2.5 text-[13px] font-medium text-ink">
            Editar información y datos laborales
          </summary>
          <div className="border-t border-line p-4">
            {/* `bind` y NO una función flecha: una arrow crea una función nueva que React rechaza en
                runtime con "Functions cannot be passed directly to Client Components", y la pantalla
                queda EN BLANCO sin que ni typecheck ni build lo detecten. */}
            <FormAccion accion={editarPersona.bind(null, id)} testid="form-persona-editar" enviar="Guardar">
              <div className="space-y-4">
                <CamposInformacion persona={persona} />
                <div className="border-t border-line pt-4"><CamposLaboral persona={persona} /></div>
              </div>
            </FormAccion>
          </div>
        </details>

        <Bloque
          titulo="Asignación"
          testid="bloque-asignacion"
          ayuda="Sale de la misma relación que muestra la solapa Personal de la obra. Se crea desde la obra."
        >
          <BloqueAsignacion
            asignaciones={asignaciones.data ?? []}
            cerrar={cerrarAsignacionDePersona.bind(null, id)}
          />
        </Bloque>

        <Bloque titulo="Horas" testid="bloque-horas">
          <BloqueHoras
            periodo={`${ventana.desde} a ${ventana.hasta}`}
            horasPeriodo={horasEntre(filasHH, ventana.desde, ventana.hasta)}
            porObra={porObra(filasHH)}
            porActividad={porActividad(filasHH)}
            historial={filasHH}
          />
        </Bloque>

        <Bloque
          titulo="Documentos"
          testid="bloque-documentos"
          ayuda="El archivo vive en Drive. Acá se guarda el vínculo, nunca una copia."
        >
          <BloqueDocumentos
            documentos={documentos.data ?? []}
            desvincular={desvincularDocumento.bind(null, id)}
          />
          <AltaDocumento vincular={vincularDocumento.bind(null, id)} />
        </Bloque>

        <Bloque titulo="Plantel" testid="bloque-plantel">
          {egresada
            ? (
                <>
                  <p className="mb-2 text-[13px] text-muted">
                    Egresó el {persona.fecha_egreso}. No se ofrece para asignar a una obra; sus
                    asignaciones y sus horas quedan como están.
                  </p>
                  {/* `args` y NO una función flecha: `accion={() => reincorporar(id)}` crea una
                      función nueva que React rechaza en runtime —"Functions cannot be passed
                      directly to Client Components"— y la pantalla queda EN BLANCO, sin que ni
                      typecheck ni build lo detecten. */}
                  <BotonAccion accion={reincorporar} args={[id]} testid="reincorporar" tono="fuerte">
                    Reincorporar al plantel
                  </BotonAccion>
                </>
              )
            : (
                <>
                  <p className="mb-2 text-[13px] text-muted">
                    Dar de baja escribe la fecha de egreso de hoy y la saca del plantel. No borra
                    nada: sus obras y sus horas quedan.
                  </p>
                  <BotonAccion accion={darDeBaja} args={[id]} testid="dar-de-baja" tono="peligro">
                    Dar de baja
                  </BotonAccion>
                </>
              )}
        </Bloque>
      </div>

      {/* El agrupado por semana no se muestra: la fuente es diaria y agregar una tercera lectura del
          mismo total sólo daría una cuarta cifra para conciliar. */}
      <p className="mt-4 px-1 text-[11px] text-faint">
        {agrupar(filasHH, (f) => f.obra_canonica_id, (f) => f.obra_canonica_id, 'sin obra').length} obra(s)
        con horas imputadas a esta persona.
      </p>
    </PageShell>
  )
}
