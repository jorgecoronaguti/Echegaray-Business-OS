import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { Aviso, Estado, Plegable } from '@/shared/components/ds'
import { PantallaEmpleado, Seccion } from '@/features/empleado/components/ShellEmpleado'
import { Fila, Nada } from '@/features/empleado/components/Filas'
import {
  getDocumentosDeMiObra, getMiCuadrilla, getMisImpedimentos, getMiObra, getMisTareas,
} from '@/features/empleado/services/empleadoService'
import { hoyISO } from '@/features/empleado/services/acciones'
import { clasificar, lecturaDeEstado, lecturaDeFecha } from '@/features/empleado/services/tareas'
import { legible } from '@/features/empleado/services/fecha'
import type { MiTarea } from '@/features/empleado/types'

// «MI TRABAJO» — la obra donde estoy, lo que tengo que hacer y con quién.
//
// ═══ PROGRESSIVE DISCLOSURE, Y LA EXCEPCIÓN QUE IMPORTA ═══
//
// Las secciones vienen plegadas: en un teléfono, cinco bloques abiertos son cinco pantallas de
// desplazamiento y la de arriba deja de leerse. La excepción es la regla §4 del Design System —**un
// problema crítico se muestra aunque su sección esté plegada**—: «Impedimentos» cerrada esconde que
// el trabajo está frenado, y esconder eso es peor que no tener la sección.
//
// ═══ LO QUE ESTA PANTALLA NO MUESTRA, Y NO POR OLVIDO ═══
//
// Contratado, presupuesto, margen, certificado: ninguno. Y no porque la pantalla no los dibuje —eso
// sería seguridad cosmética— sino porque `mi_obra` no los SELECCIONA y `obra_canonica` le niega
// `monto_contratado` a `authenticated` por grant de columna. Por PostgREST tampoco salen.

export const dynamic = 'force-dynamic'

export default async function MiTrabajoPage() {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilPropio(supabase, user.id)

  if (!perfil.data?.persona_id) {
    return (
      <PantallaEmpleado titulo="Mi trabajo">
        <SinVinculo que="tu obra ni tus tareas" disponible={perfil.data?.vinculoDisponible !== false} />
      </PantallaEmpleado>
    )
  }

  const hoy = await hoyISO()
  const [obras, cuadrilla, tareas, impedimentos] = await Promise.all([
    getMiObra(supabase), getMiCuadrilla(supabase), getMisTareas(supabase), getMisImpedimentos(supabase),
  ])
  const obra = obras.data?.[0] ?? null
  const papeles = await (obra ? getDocumentosDeMiObra(supabase, obra.id) : Promise.resolve({ data: [], error: null }))
  const grupos = clasificar(tareas.data ?? [], hoy)
  const error = obras.error ?? tareas.error ?? impedimentos.error ?? null

  return (
    <PantallaEmpleado titulo="Mi trabajo" sub={obra?.nombre}>
      {error && <Aviso tono="neg" titulo="No se pudo leer todo." testid="trabajo-error">{error}</Aviso>}

      <Seccion titulo="OBRA ACTUAL">
        {obra ? (
          <div data-testid="obra-actual">
            <p className="text-[16px] font-medium text-ink">{obra.nombre}</p>
            <p className="mt-0.5 text-[12.5px] text-faint">
              {obra.etapa ? `Etapa ${obra.etapa}` : 'sin etapa cargada'} · {obra.ubicacion ?? 'sin ubicación cargada'}
            </p>
            <div className="mt-3 flex gap-8">
              <span>
                <span className="block text-[11px] text-faint">Responsable</span>
                <span className="text-[13.5px] text-ink">{obra.jefe_obra ?? <span className="text-faint">sin cargar</span>}</span>
              </span>
              <span>
                <span className="block text-[11px] text-faint">Cuadrilla</span>
                <span className="text-[13.5px] text-ink">
                  {cuadrilla.data?.[0]?.cuadrilla ?? obra.cuadrilla ?? <span className="text-faint">sin cuadrilla</span>}
                </span>
              </span>
            </div>
          </div>
        ) : (
          <Nada testid="sin-obra">
            No tenés ninguna obra asignada hoy. Las asignaciones las carga Administración desde Personal.
          </Nada>
        )}
      </Seccion>

      <div className="mt-6 border-t border-[#EFEEEA]">
        <Plegable
          titulo="Mis tareas"
          cuenta={grupos.hoy.length}
          testid="seccion-mis-tareas"
          abiertoPorDefecto
          alerta={grupos.hoy.some((t) => t.impedimentos > 0) ? 'hay trabajo frenado' : undefined}
        >
          <ListaDeTareas tareas={grupos.hoy} hoy={hoy} vacio="No tenés tareas para hoy." />
          <Link href="/mi-trabajo/tareas" className="mt-2 inline-block text-[12px] text-muted hover:text-ink" data-testid="ir-mis-tareas">
            Ver todas mis tareas →
          </Link>
        </Plegable>

        <Plegable titulo="Próximos trabajos" cuenta={grupos.proximas.length} testid="seccion-proximos">
          <ListaDeTareas tareas={grupos.proximas.slice(0, 10)} hoy={hoy} vacio="No hay trabajos planificados a tu nombre." />
        </Plegable>

        <Plegable
          titulo="Impedimentos de mi trabajo"
          cuenta={impedimentos.data?.length ?? 0}
          testid="seccion-impedimentos"
          alerta={impedimentos.data && impedimentos.data.length > 0 ? `${impedimentos.data.length} abierto${impedimentos.data.length === 1 ? '' : 's'}` : undefined}
        >
          {impedimentos.data && impedimentos.data.length > 0 ? (
            impedimentos.data.map((i) => (
              <Fila
                key={i.id}
                testid="impedimento"
                href={i.actividad_id ? `/mi-trabajo/tareas/${i.actividad_id}` : undefined}
                titulo={i.descripcion ?? 'Impedimento'}
                detalle={i.actividad ?? 'sin actividad'}
                senal="abierto"
                senalTono="neg"
              />
            ))
          ) : (
            <Nada testid="sin-impedimentos">
              No hay nada frenando tu trabajo. Si aparece algo, lo reportás desde la tarea.
            </Nada>
          )}
        </Plegable>

        <Plegable titulo="Planos y documentos de obra" cuenta={papeles.data?.length ?? 0} testid="seccion-papeles">
          {papeles.data && papeles.data.length > 0 ? (
            papeles.data.map((d) => (
              <Fila
                key={d.drive_file_id}
                testid="papel-de-obra"
                href={`https://drive.google.com/file/d/${d.drive_file_id}/view`}
                titulo={d.nombre ?? 'Documento'}
                detalle={d.rol ?? 'sin categoría'}
              />
            ))
          ) : (
            <Nada testid="sin-papeles">Todavía no hay planos ni documentos cargados en esta obra.</Nada>
          )}
        </Plegable>

        {/* ═══ LO OPERATIVO QUE YA EXISTÍA, Y QUE NO SE SACA ═══
            Pedidos de materiales, Herramientas y Movimientos son pantallas reales que el nivel campo
            usa hoy (`CAMPO_RUTAS_PERMITIDAS`). El handoff del perfil no las menciona porque describe
            el día del empleado, no el inventario del OS — y sacarlas para «cumplir el diseño» sería
            eliminar funcionalidad viva. Bajan a una sección plegada: siguen a un toque de distancia. */}
        <Plegable titulo="Pedidos, herramientas y partes" testid="seccion-operacion">
          <Fila href="/integraciones/pedidos-materiales" testid="ir-pedidos" titulo="Pedir material" detalle="Y ver el estado de lo pedido" />
          <Fila href="/integraciones/herramientas" testid="ir-herramientas" titulo="Herramientas" detalle="Qué hay en obra" />
          <Fila href="/integraciones/movimientos" testid="ir-movimientos" titulo="Movimientos" detalle="Registrar un traslado" />
          <Fila href="/campo" testid="ir-campo" titulo="Campo" detalle="El parte del día y los impedimentos de la obra" />
        </Plegable>
      </div>

      <Seccion titulo="MI CUADRILLA">
        {cuadrilla.data && cuadrilla.data.length > 0 ? (
          <div data-testid="lista-cuadrilla">
            {cuadrilla.data.map((c) => (
              <Fila
                key={c.nombre_completo}
                testid="companero"
                titulo={
                  <>
                    {c.nombre_completo}
                    {c.soy_yo && <span className="text-faint"> · vos</span>}
                  </>
                }
                detalle={legible(c.rol) ?? 'sin categoría'}
                senal={c.es_responsable ? <Estado tono="curso">responsable</Estado> : undefined}
              />
            ))}
          </div>
        ) : (
          <Nada testid="sin-companeros">
            No estás en ninguna cuadrilla. Las arma Administración desde Personal → Cuadrillas.
          </Nada>
        )}
        <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
          Ves quién trabaja con vos, nada más: los legajos y documentos de tus compañeros no se abren
          desde acá.
        </p>
      </Seccion>
    </PantallaEmpleado>
  )
}

function ListaDeTareas({ tareas, hoy, vacio }: { tareas: MiTarea[]; hoy: string; vacio: string }) {
  if (tareas.length === 0) return <Nada>{vacio}</Nada>
  return (
    <>
      {tareas.map((t) => {
        const e = lecturaDeEstado(t)
        const f = lecturaDeFecha(t, hoy)
        return (
          <Fila
            key={t.id}
            testid="tarea"
            href={`/mi-trabajo/tareas/${t.id}`}
            titulo={t.nombre}
            detalle={
              <>
                {t.seccion ?? t.obra}
                {t.impedimentos > 0 && <span className="text-neg"> · frenada</span>}
              </>
            }
            senal={<Estado tono={e.tono} clave={t.estado ?? ''}>{e.texto}</Estado>}
            accion={<span className={`whitespace-nowrap text-[12px] ${f.vencida ? 'text-neg' : 'text-faint'}`}>{f.texto}</span>}
          />
        )
      })}
    </>
  )
}
