import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual } from '@/features/auth/services/authService'
import { getPerfilPropio, getHorasPropias } from '@/features/mi-cuenta/services/miCuentaService'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { Aviso, Estado } from '@/shared/components/ds'
import { PantallaEmpleado, Seccion } from '@/features/empleado/components/ShellEmpleado'
import { BloqueAsistencia } from '@/features/empleado/components/BloqueAsistencia'
import { BloqueDato, Fila, Nada } from '@/features/empleado/components/Filas'
import { Barra, Tarjeta } from '@/features/empleado/components/Bloques'
import {
  getDocumentosDeMiObra, getMiCuadrilla, getMiDiaDeHoy, getMisDocumentos, getMisImpedimentos,
  getMiObra, getMisTareas,
} from '@/features/empleado/services/empleadoService'
import { hoyISO } from '@/features/empleado/services/acciones'
import { diaFechaYAnio, diaYFecha, mesDe, mesLargo } from '@/features/empleado/services/fecha'
import { clasificar, lecturaDeEstado, lecturaDeFecha, restante } from '@/features/empleado/services/tareas'
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

          {/* ═══ CADA TAREA ES UNA TARJETA CON SU BARRA (M02, 24/08/2026) ═══
              El mockup pide tres datos por tarjeta y en ese orden: qué hay que hacer, cuánto falta
              en su unidad, y el avance como barra + porcentaje. La barra se pinta ROJA cuando la
              tarea tiene un impedimento abierto: un 74% con el material faltante no es una buena
              noticia, y el color lo tiene que decir antes de que alguien lea la letra chica. */}
          <Seccion
            titulo="MI TRABAJO DE HOY"
            extra={
              <span className="flex items-center gap-3">
                <span className="font-mono text-[12px] tabular-nums text-faint" data-testid="cuenta-hoy">
                  {deHoy.filter((t) => t.estado === 'terminada').length} de {deHoy.length}
                </span>
                <Link href="/mi-trabajo/tareas" className="text-muted hover:text-ink" data-testid="ver-todas-tareas">Ver todo ›</Link>
              </span>
            }
          >
            {deHoy.length > 0 ? (
              <div className="space-y-2.5" data-testid="trabajo-de-hoy">
                {deHoy.slice(0, 5).map((t) => {
                  const e = lecturaDeEstado(t)
                  const f = lecturaDeFecha(t, hoy)
                  const frenada = t.impedimentos > 0
                  return (
                    <Tarjeta key={t.id} href={`/mi-trabajo/tareas/${t.id}`} testid="tarea-de-hoy">
                      <span className="flex items-start gap-3">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14.5px] font-medium text-ink">{t.nombre}</span>
                          <span className="mt-1 block font-mono text-[11.5px] text-faint">
                            {t.seccion ?? t.obra}
                            {' · '}
                            {restante(t) ?? 'sin medición'}
                          </span>
                          <Barra pct={t.pct} frenada={frenada} />
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-[15px] text-line-strong" aria-hidden>›</span>
                          <span className={`whitespace-nowrap text-[11.5px] ${f.vencida ? 'text-neg' : 'text-faint'}`}>
                            {f.texto}
                          </span>
                        </span>
                      </span>
                      <span className="mt-1.5 flex items-center gap-2">
                        <Estado tono={e.tono} clave={t.estado ?? ''}>{e.texto}</Estado>
                        {frenada && <span className="text-[11.5px] text-neg">frente parado</span>}
                      </span>
                    </Tarjeta>
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

          {/* ═══ LOS TRES ACCESOS DEL PIE (M02) ═══
              El mockup dibuja «Avisar problema · Subir foto · Mis papeles». Van dos de esos tres y
              «Mis horas» en lugar de «Subir foto»: subir una foto suelta no tiene destino en la
              base —las fotos cuelgan de un avance o de un documento del legajo— y un botón que no
              lleva a ningún lado enseña que la pantalla miente. Queda declarado, no disimulado. */}
          <div className="mt-6 grid grid-cols-3 gap-2.5" data-testid="accesos-hoy">
            <Acceso href="/mi-trabajo/reportar" testid="acceso-problema" titulo="Avisar problema" />
            <Acceso
              href="/mi-informacion/documentos"
              testid="acceso-papeles"
              titulo="Mis papeles"
              nota={docsPendientes.length > 0 ? `${docsPendientes.length} pendiente${docsPendientes.length === 1 ? '' : 's'}` : undefined}
            />
            <Acceso href="/mi-informacion/horas" testid="acceso-horas" titulo="Mis horas" />
          </div>
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
              {/* Los tres como BLOQUE DE DATO GRANDE del Employee shell. Ninguno se rellena con un
                  cero: sin presencia registrada el bloque dice «sin registrar», y sin las dos puntas
                  «sin imputar» no existe —no vale cero, que acusaría a la obra de no haber imputado. */}
              <div className="flex flex-wrap gap-x-9 gap-y-4">
                <BloqueDato
                  etiqueta="HH imputadas"
                  valor={horas.data ? hhDelMes.toFixed(2).replace('.', ',') : null}
                  falta="no se pudo leer"
                />
                <BloqueDato
                  etiqueta="Presencia"
                  valor={presencia.minutos > 0 ? duracion(presencia.minutos) : null}
                />
                <BloqueDato
                  etiqueta="Sin imputar"
                  valor={contraste ? duracion(Math.max(contraste.pendiente, 0)) : null}
                  falta="falta una punta"
                  tono={contraste && contraste.pendiente > 0 ? 'warn' : undefined}
                />
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

/** Uno de los tres accesos del pie: 74px de alto, una sola línea de verbo y su nota debajo. Es el
 *  objetivo táctil más grande de la pantalla después de fichar, y por eso no lleva ícono: en 390px
 *  tres íconos con tres rótulos se leen peor que tres rótulos solos. */
function Acceso({ href, titulo, nota, testid }: { href: string; titulo: string; nota?: string; testid: string }) {
  return (
    <Link
      href={href}
      data-testid={testid}
      className="flex min-h-[74px] flex-col items-center justify-center gap-0.5 rounded-[14px] border border-line bg-surface px-2 text-center active:bg-surface-quiet"
    >
      <span className="text-[12.5px] leading-tight text-ink">{titulo}</span>
      {nota && <span className="text-[11px] text-warn">{nota}</span>}
    </Link>
  )
}
