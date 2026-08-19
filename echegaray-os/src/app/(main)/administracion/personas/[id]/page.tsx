// LA FICHA DE UNA PERSONA — cuatro solapas, y el cambio chico por panel lateral.
//
// ═══ POR QUÉ NO ESTÁ TODO A LA VISTA ═══
//
// El dueño: *"NO mostrar toda la información simultáneamente en 15 cards."* La ficha tiene identidad,
// relación laboral, historial de asignaciones, horas y documentos: junto es una pared. Separado en
// Resumen · Asignaciones · Horas · Documentos, cada pregunta tiene una solapa y el Resumen responde
// las tres que se hacen todos los días —quién es, qué cobra de categoría, dónde está hoy—.
//
// ═══ Y POR QUÉ SE EDITA EN UN PANEL ═══
//
// *"Priorizar click sobre entidad/campo → panel lateral. Nada de páginas de formulario gigantes para
// cambios simples."* Corregir un teléfono no puede costar abrir una pantalla con veinte campos. El
// panel viaja en la URL (`?editar=identidad`), así que se puede compartir, recargar y cerrar con el
// botón de atrás.
//
// Es una RUTA y no un panel dentro del listado porque son cuatro solapas: no entran en 380px sin
// volverse un acordeón de acordeones.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BotonAccion, Callout, PageShell } from '@/shared/components/ui'
import { BloqueAsignacion, BloqueDocumentos, BloqueHoras } from '@/features/administracion/components/BloquesFicha'
import { CamposIdentidad, CamposLaboral } from '@/features/administracion/components/FormularioPersona'
import { AltaDocumento, Bloque, Dato } from '@/features/administracion/components/FichaPartes'
import { NavFicha, VISTAS_FICHA, type VistaFicha } from '@/features/administracion/components/NavFicha'
import { PanelEdicion } from '@/features/administracion/components/PanelEdicion'
import { getAsignacionesDe, getDocumentos, getPersona } from '@/features/administracion/services/personasService'
import { getHHDePersona, horasEntre, porActividad, porObra } from '@/features/administracion/services/hhPersonaService'
import { darDeBaja, editarPersona, reincorporar, type GrupoEdicion } from '@/features/administracion/services/personasActions'
import { cerrarAsignacionDePersona } from '@/features/administracion/services/asignacionActions'
import { desvincularDocumento, vincularDocumento } from '@/features/administracion/services/documentosActions'
import { etiquetaCategoria } from '@/features/administracion/types'

export const dynamic = 'force-dynamic'

type Busqueda = { v?: string; editar?: string }

/** El período del bloque HORAS: los últimos 30 días. Se declara con fechas concretas en la pantalla
 *  —no «el último mes»— porque un total sin ventana declarada no se puede verificar contra nada. */
function ultimos30() {
  const hasta = new Date()
  const desde = new Date(hasta)
  desde.setUTCDate(desde.getUTCDate() - 29)
  return { desde: desde.toISOString().slice(0, 10), hasta: hasta.toISOString().slice(0, 10) }
}

export default async function FichaPersonaPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Busqueda>
}) {
  const { id } = await params
  const sp = await searchParams
  const vista = (VISTAS_FICHA.find((v) => v === sp.v) ?? 'resumen') as VistaFicha
  const editar = sp.editar === 'identidad' || sp.editar === 'laboral' ? (sp.editar as GrupoEdicion) : null
  const base = `/administracion/personas/${id}`
  const href = (v: VistaFicha, e?: GrupoEdicion) =>
    `${base}${v === 'resumen' && !e ? '' : `?${new URLSearchParams({ ...(v !== 'resumen' ? { v } : {}), ...(e ? { editar: e } : {}) })}`}`

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

  // Cada solapa pide SÓLO lo suyo: el Resumen se abre muchas veces por día y no necesita el
  // historial de horas para decir quién es esta persona.
  const asignaciones = vista === 'resumen' || vista === 'asignaciones'
    ? await getAsignacionesDe(supabase, id) : null
  const horas = vista === 'horas' ? await getHHDePersona(supabase, id) : null
  const documentos = vista === 'documentos' ? await getDocumentos(supabase, id) : null

  const vigente = (asignaciones?.data ?? []).find((a) => !a.hasta) ?? null
  const egresada = Boolean(persona.fecha_egreso)
  const filasHH = horas?.data ?? []
  const ventana = ultimos30()

  return (
    <PageShell
      eyebrow={<Link href="/administracion/personas" className="hover:underline">← Personal</Link>}
      title={persona.nombre_completo}
      subtitle={[
        etiquetaCategoria(persona.categoria),
        persona.convenio_colectivo ?? 'convenio sin cargar',
        egresada ? `inactiva desde el ${persona.fecha_egreso}` : 'en el plantel',
      ].join(' · ')}
      maxWidth="max-w-5xl"
      right={egresada
        ? <BotonAccion accion={reincorporar} args={[id]} testid="reincorporar">Reincorporar</BotonAccion>
        // `args` y NO una función flecha: `accion={() => darDeBaja(id)}` crea una función nueva que
        // React rechaza en runtime —"Functions cannot be passed directly to Client Components"— y la
        // pantalla queda EN BLANCO, sin que ni typecheck ni build lo detecten.
        : <BotonAccion accion={darDeBaja} args={[id]} testid="dar-de-baja">Dar de baja</BotonAccion>}
    >
      <NavFicha activa={vista} hrefDe={(v) => href(v)} />

      {(asignaciones?.error || horas?.error || documentos?.error) && (
        <div className="mb-4">
          <Callout tono="neg">{asignaciones?.error ?? horas?.error ?? documentos?.error}</Callout>
        </div>
      )}

      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="min-w-0 flex-1 space-y-4">
          {vista === 'resumen' && (
            <>
              <Bloque titulo="Identidad" testid="bloque-identidad" editarHref={href('resumen', 'identidad')}>
                <div className="grid gap-x-8 sm:grid-cols-2">
                  <Dato k="DNI" v={persona.dni} />
                  <Dato k="CUIL" v={persona.cuil} />
                  <Dato k="Nacimiento" v={persona.fecha_nacimiento} />
                  <Dato k="Nacionalidad" v={persona.nacionalidad} />
                  <Dato k="Teléfono" v={persona.telefono} />
                  <Dato k="Email" v={persona.email} />
                  <Dato k="Domicilio" v={persona.domicilio} />
                  <Dato
                    k="Emergencia"
                    v={[persona.contacto_emergencia, persona.contacto_emergencia_telefono]
                      .filter(Boolean).join(' · ') || null}
                  />
                </div>
              </Bloque>

              <Bloque titulo="Laboral" testid="bloque-laboral" editarHref={href('resumen', 'laboral')}>
                <div className="grid gap-x-8 sm:grid-cols-2">
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

              <Bloque titulo="Asignación actual" testid="bloque-asignacion-actual">
                {vigente
                  ? (
                      <div className="grid gap-x-8 sm:grid-cols-2">
                        <Dato k="Obra" v={vigente.obra_nombre ?? vigente.obra_id} />
                        <Dato k="Actividad" v={vigente.actividad_nombre ?? 'toda la obra'} />
                        <Dato k="Cuadrilla" v={vigente.cuadrilla} />
                        <Dato k="Rol" v={vigente.rol} />
                        <Dato k="Desde" v={vigente.desde} />
                      </div>
                    )
                  : (
                      <p className="py-2 text-[13px] text-muted">
                        Sin asignar.{' '}
                        <Link href="/obras" className="text-ink hover:underline">
                          Se asigna desde la solapa Personal de la obra.
                        </Link>
                      </p>
                    )}
              </Bloque>
            </>
          )}

          {vista === 'asignaciones' && (
            <Bloque
              titulo="Historial de asignaciones"
              testid="bloque-asignaciones"
              ayuda="La misma relación que muestra Obra → Personal."
            >
              <BloqueAsignacion
                asignaciones={asignaciones?.data ?? []}
                cerrar={cerrarAsignacionDePersona.bind(null, id)}
              />
            </Bloque>
          )}

          {vista === 'horas' && (
            <Bloque titulo="Horas imputadas" testid="bloque-horas">
              <BloqueHoras
                periodo={`${ventana.desde} a ${ventana.hasta}`}
                horasPeriodo={horasEntre(filasHH, ventana.desde, ventana.hasta)}
                porObra={porObra(filasHH)}
                porActividad={porActividad(filasHH)}
                historial={filasHH}
              />
            </Bloque>
          )}

          {vista === 'documentos' && (
            <Bloque titulo="Documentos" testid="bloque-documentos" ayuda="Vínculos a Drive. El archivo no se copia.">
              <BloqueDocumentos
                documentos={documentos?.data ?? []}
                desvincular={desvincularDocumento.bind(null, id)}
              />
              <AltaDocumento vincular={vincularDocumento.bind(null, id)} />
            </Bloque>
          )}
        </div>

        {editar && (
          <PanelEdicion
            titulo={editar === 'identidad' ? 'Editar identidad' : 'Editar datos laborales'}
            subtitulo={persona.nombre_completo}
            accion={editarPersona.bind(null, id, editar)}
            cerrarHref={href('resumen')}
            testid={`panel-editar-${editar}`}
          >
            {editar === 'identidad'
              ? <CamposIdentidad persona={persona} />
              : <CamposLaboral persona={persona} />}
          </PanelEdicion>
        )}
      </div>
    </PageShell>
  )
}
