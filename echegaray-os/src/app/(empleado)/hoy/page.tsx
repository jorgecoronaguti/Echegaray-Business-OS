import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual } from '@/features/auth/services/authService'
import { getPerfilPropio, getHorasPropias } from '@/features/mi-cuenta/services/miCuentaService'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { Aviso, Estado } from '@/shared/components/ds'
import { PantallaEmpleado, Seccion } from '@/features/empleado/components/ShellEmpleado'
import { BloqueAsistencia } from '@/features/empleado/components/BloqueAsistencia'
import { Fila, Nada } from '@/features/empleado/components/Filas'
import {
  getDocumentosDeMiObra, getMiCuadrilla, getMiDiaDeHoy, getMisDocumentos, getMisImpedimentos,
  getMiObra, getMisTareas,
} from '@/features/empleado/services/empleadoService'
import { hoyISO } from '@/features/empleado/services/acciones'
import { diaFechaYAnio, diaYFecha, mesDe, mesLargo } from '@/features/empleado/services/fecha'
import { clasificar, lecturaDeEstado, lecturaDeFecha } from '@/features/empleado/services/tareas'
import { accionDe, estadoEnPantalla, ordenar as ordenarDocs, pendientes } from '@/features/empleado/services/documentos'
import { duracion, totalDelPeriodo, pendienteDeImputar } from '@/features/empleado/services/asistencia'
import { getMiAsistencia } from '@/features/empleado/services/empleadoService'

// «HOY» — abro el OS y sé dónde trabajo, qué tengo que hacer y si tengo algo pendiente.
//
// ═══ SECUENCIA VERTICAL, SIN CARDS ═══
//
// El handoff es explícito: fecha → OBRA → CUADRILLA → ASISTENCIA → TRABAJO DE HOY → PENDIENTES, en
// una secuencia vertical y sin tarjetas. Las tarjetas dan a entender que cada bloque es un objeto
// separado que se puede abrir; acá son SECCIONES de una sola pantalla, y el orden es la jerarquía.
//
// ═══ UN PROBLEMA REAL EMERGE AUNQUE SU SECCIÓN ESTÉ PLEGADA ═══
//
// PENDIENTES no es una lista de avisos del sistema: son las dos cosas que le pueden arruinar el día
// —un documento que le están pidiendo y un impedimento abierto de SU actividad—. Si no hay ninguna,
// la sección no se dibuja. Un bloque que siempre dice algo deja de decir.

export const dynamic = 'force-dynamic'

export default async function HoyPage() {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')

  const perfilBasico = await getPerfilActual(supabase, user.id)
  const perfil = await getPerfilPropio(supabase, user.id)
  const hoy = await hoyISO()

  // SIN PERSONA VINCULADA NO HAY NADA QUE MOSTRAR, y se dice por qué. Las vistas `mi_*` devuelven
  // cero filas, y cero por falta de vínculo es indistinguible de cero real: sin este cartel, la
  // pantalla le diría a alguien que trabajó veinte días que no tiene obra, ni cuadrilla, ni tareas.
  if (!perfil.data?.persona_id) {
    return (
      <PantallaEmpleado titulo="Hoy" sub={diaYFecha(hoy)}>
        <SinVinculo que="tu obra, tu cuadrilla ni tus tareas" disponible={perfil.data?.vinculoDisponible !== false} />
      </PantallaEmpleado>
    )
  }

  const mes = mesDe(hoy)
  const [obras, cuadrilla, dia, tareas, impedimentos, documentos, horas, asistencia] = await Promise.all([
    getMiObra(supabase),
    getMiCuadrilla(supabase),
    getMiDiaDeHoy(supabase, hoy),
    getMisTareas(supabase),
    getMisImpedimentos(supabase),
    getMisDocumentos(supabase),
    getHorasPropias(supabase, mes.desde, mes.hasta),
    getMiAsistencia(supabase, mes.desde, mes.hasta),
  ])

  const obra = obras.data?.[0] ?? null
  const papeles = await (obra ? getDocumentosDeMiObra(supabase, obra.id) : Promise.resolve({ data: [], error: null }))

  const deHoy = clasificar(tareas.data ?? [], hoy).hoy
  const docsPendientes = ordenarDocs((documentos.data ?? []).filter((d) => {
    const e = estadoEnPantalla(d, hoy)
    return e === 'solicitado' || e === 'vencido' || e === 'requiere_correccion'
  }), hoy)
  const nPendientes = pendientes(documentos.data ?? [], hoy) + (impedimentos.data?.length ?? 0)

  // El primer error REAL de cualquier fuente se muestra tal cual. Un conteo que falló vuelve null y
  // no 0: son dos respuestas distintas y se ven igual.
  const error = obras.error ?? dia.error ?? tareas.error ?? impedimentos.error ?? documentos.error ?? null

  const hhDelMes = (horas.data ?? []).reduce((s, h) => s + h.horas, 0)
  const presencia = totalDelPeriodo(asistencia.data ?? [])
  const contraste = pendienteDeImputar(presencia.minutos, hhDelMes)

  return (
    <PantallaEmpleado
      titulo={`Hola, ${(perfilBasico.data?.nombre ?? user.email ?? '').split(' ')[0] || 'que tal'}`}
      sub={<span className="hidden lg:inline">{diaFechaYAnio(hoy)}</span>}
    >
      <p className="-mt-4 mb-5 text-[12.5px] text-faint lg:hidden" data-testid="hoy-fecha">{diaYFecha(hoy)}</p>

      {error && (
        <Aviso tono="neg" titulo="No se pudo leer todo lo de esta pantalla." testid="hoy-error">{error}</Aviso>
      )}

      <div className="lg:flex lg:gap-10">
        <div className="min-w-0 lg:w-[620px] lg:shrink-0">
          <Seccion titulo="OBRA">
            {obra ? (
              <div data-testid="mi-obra">
                <p className="text-[16px] font-medium text-ink">{obra.nombre}</p>
                <p className="mt-0.5 text-[12.5px] text-faint">
                  {obra.ubicacion ?? 'sin ubicación cargada'}
                  {obra.jefe_obra ? ` · jefe de obra ${obra.jefe_obra}` : ' · sin jefe de obra cargado'}
                </p>
              </div>
            ) : (
              <Nada testid="sin-obra">
                No tenés ninguna obra asignada hoy. Las asignaciones las carga Administración desde
                Personal; hasta entonces el OS no sabe dónde estás trabajando.
              </Nada>
            )}
          </Seccion>

          <Seccion titulo="CUADRILLA">
            {cuadrilla.data && cuadrilla.data.length > 0 ? (
              <p className="text-[14px] text-ink" data-testid="mi-cuadrilla">
                {cuadrilla.data[0].cuadrilla}
                <span className="text-faint"> · {cuadrilla.data.length} {cuadrilla.data.length === 1 ? 'persona' : 'personas'}</span>
              </p>
            ) : obra?.cuadrilla ? (
              <p className="text-[14px] text-ink" data-testid="mi-cuadrilla">
                {obra.cuadrilla}
                <span className="text-faint"> · sin integrantes cargados</span>
              </p>
            ) : (
              <Nada testid="sin-cuadrilla">
                No estás en ninguna cuadrilla. Las arma Administración desde Personal → Cuadrillas.
              </Nada>
            )}
          </Seccion>

          <Seccion titulo="ASISTENCIA">
            <BloqueAsistencia dia={dia.data} obraId={obra?.id ?? null} compacto />
          </Seccion>

          <Seccion
            titulo="TRABAJO DE HOY"
            extra={<Link href="/mi-trabajo/tareas" className="text-muted hover:text-ink" data-testid="ver-todas-tareas">Ver todo ›</Link>}
          >
            {deHoy.length > 0 ? (
              <div data-testid="trabajo-de-hoy">
                {deHoy.slice(0, 5).map((t) => {
                  const e = lecturaDeEstado(t)
                  const f = lecturaDeFecha(t, hoy)
                  return (
                    <Fila
                      key={t.id}
                      href={`/mi-trabajo/tareas/${t.id}`}
                      testid="tarea-de-hoy"
                      titulo={t.nombre}
                      detalle={
                        <>
                          {t.seccion ?? t.obra}
                          {t.impedimentos > 0 && <span className="text-neg"> · frenada</span>}
                        </>
                      }
                      senal={<Estado tono={e.tono} clave={t.estado ?? ''}>{e.texto}</Estado>}
                      accion={
                        <span className={`whitespace-nowrap text-[12px] ${f.vencida ? 'text-neg' : 'text-faint'}`}>
                          {f.texto}
                        </span>
                      }
                    />
                  )
                })}
              </div>
            ) : (
              <Nada testid="sin-tareas-hoy">
                No tenés tareas asignadas para hoy. Las asigna el jefe de obra desde la planificación
                de la obra: una actividad es tuya cuando sos su responsable o es de tu cuadrilla.
              </Nada>
            )}
          </Seccion>
        </div>

        <div className="min-w-0 lg:flex-1">
          {nPendientes > 0 && (
            <Seccion titulo="PENDIENTES">
              <div data-testid="pendientes">
                {docsPendientes.map((d) => {
                  const e = estadoEnPantalla(d, hoy)
                  return (
                    <Fila
                      key={d.id}
                      href={`/mi-informacion/documentos/${d.id}`}
                      testid="pendiente-documento"
                      titulo={`Te piden ${d.nombre ?? d.tipo_documento}`}
                      detalle={
                        e === 'requiere_correccion'
                          ? 'Requiere corrección · subilo de nuevo desde Mis documentos'
                          : e === 'vencido'
                            ? `Vencido${d.fecha_vencimiento ? ` el ${d.fecha_vencimiento.slice(8, 10)}/${d.fecha_vencimiento.slice(5, 7)}` : ''} · subilo desde Mis documentos`
                            : 'Solicitado · subilo desde Mis documentos'
                      }
                      senal={accionDe(e).texto}
                      senalTono="warn"
                    />
                  )
                })}
                {(impedimentos.data ?? []).map((i) => (
                  <Fila
                    key={i.id}
                    href={i.actividad_id ? `/mi-trabajo/tareas/${i.actividad_id}` : '/mi-trabajo'}
                    testid="pendiente-impedimento"
                    titulo={i.descripcion ?? 'Impedimento abierto'}
                    detalle={`Impedimento abierto de ${i.actividad ?? 'tu actividad'}`}
                    senal="Ver"
                    senalTono="neg"
                  />
                ))}
              </div>
            </Seccion>
          )}

          <Seccion titulo={`MI MES · ${mesLargo(hoy)}`}>
            <div data-testid="mi-mes">
              <div className="flex items-baseline gap-6">
                <span>
                  <span className="block text-[11px] text-faint">HH imputadas</span>
                  <span className="font-mono text-[18px] tabular-nums text-ink">
                    {horas.data ? hhDelMes.toFixed(2).replace('.', ',') : '—'}
                  </span>
                </span>
                <span>
                  <span className="block text-[11px] text-faint">Presencia</span>
                  <span className="font-mono text-[18px] tabular-nums text-ink">
                    {duracion(presencia.minutos) ?? '—'}
                  </span>
                </span>
                <span>
                  <span className="block text-[11px] text-faint">Sin imputar</span>
                  <span className="font-mono text-[18px] tabular-nums text-ink">
                    {contraste ? (duracion(Math.max(contraste.pendiente, 0)) ?? '—') : '—'}
                  </span>
                </span>
              </div>
              {/* LAS DOS PUNTAS O NINGUNA. Sin asistencia registrada, «sin imputar: 148 h» acusaría a
                  la obra de no imputar cuando lo que falta es la otra mitad del dato. */}
              {!contraste && (
                <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
                  {presencia.minutos === 0 && hhDelMes === 0
                    ? 'Todavía no hay ni presencia registrada ni horas imputadas este mes.'
                    : presencia.minutos === 0
                      ? 'Hay horas imputadas pero todavía no registraste asistencia: el pendiente no se puede calcular con una sola punta.'
                      : 'Hay asistencia registrada pero la obra todavía no imputó horas a tu nombre.'}
                </p>
              )}
              <p className="mt-3 flex gap-4 text-[12px]">
                <Link href="/mi-informacion/horas" className="text-muted hover:text-ink">Mis horas →</Link>
                <Link href="/mi-informacion/asistencia" className="text-muted hover:text-ink">Asistencia →</Link>
                <Link href="/mi-informacion/recibos" className="text-muted hover:text-ink">Recibos →</Link>
              </p>
            </div>
          </Seccion>

          {obra && (
            <Seccion titulo="DOCUMENTOS DE MI OBRA">
              {papeles.data && papeles.data.length > 0 ? (
                <div data-testid="documentos-de-obra">
                  {papeles.data.slice(0, 6).map((d) => (
                    <Fila
                      key={d.drive_file_id}
                      href={`https://drive.google.com/file/d/${d.drive_file_id}/view`}
                      testid="documento-de-obra"
                      titulo={d.nombre ?? 'Documento'}
                      detalle={d.rol ?? 'sin categoría'}
                    />
                  ))}
                </div>
              ) : (
                <Nada testid="sin-documentos-obra">Todavía no hay planos ni documentos cargados en esta obra.</Nada>
              )}
              <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
                Sólo los planos y documentos que necesitás para trabajar. Contratos, presupuestos y
                números de la obra no se muestran a este perfil.
              </p>
            </Seccion>
          )}
        </div>
      </div>
    </PantallaEmpleado>
  )
}
