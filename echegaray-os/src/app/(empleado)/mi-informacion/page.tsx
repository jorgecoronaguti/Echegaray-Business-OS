import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getPerfilPropio, getHorasPropias } from '@/features/mi-cuenta/services/miCuentaService'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { Aviso } from '@/shared/components/ds'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { inicialesDe } from '@/features/empleado/components/shell-logica'
import { Fila } from '@/features/empleado/components/Filas'
import { Azulejo } from '@/features/empleado/components/Bloques'
import {
  getMiAsistencia, getMiCuadrilla, getMiLegajo, getMiObra, getMisDocumentos, getMisRecibos,
} from '@/features/empleado/services/empleadoService'
import { hoyISO } from '@/features/empleado/services/acciones'
import { pendientes } from '@/features/empleado/services/documentos'
import { legible, mesDe, mesLargo } from '@/features/empleado/services/fecha'

// «YO» (M09) — su ficha, sus números del mes y los accesos que le corresponden.
//
// ═══ FICHA, NO PERFIL EDITABLE ═══
//
// La nota del mockup: «Los datos los gobierna la empresa; él ve y pide cambios». Obra, cuadrilla,
// legajo y fecha de ingreso son hechos del legajo: no hay un lápiz al lado de ninguno porque la
// pantalla no puede escribirlos —y la base tampoco se lo permitiría—. Lo único que puede cambiar es
// lo que la empresa le deja cambiar, y eso vive en «Mi perfil».
//
// ═══ SIN AJUSTES DECORATIVOS ═══
//
// «Nada de temas, idiomas ni switches que no hacen nada». Un switch que no cambia nada enseña que
// la pantalla miente, y esa lección se aplica después a los botones que sí importan.
//
// ═══ LOS TRES AZULEJOS DEL MES, Y EL QUE NO SE PUEDE LLENAR ═══
//
// HORAS son las HH imputadas por la obra. JORNADAS son los días con marca de asistencia — el dato
// que la persona produce con su pulgar. AUSENCIAS queda en «sin registrar» y NO en 0: el OS no
// tiene todavía una fuente de ausencias justificadas (parte médico, licencia), y un 0 ahí afirma
// que no faltó nunca, que es una afirmación sobre su legajo que nadie verificó.

export const dynamic = 'force-dynamic'

export default async function MiInformacionPage() {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilPropio(supabase, user.id)

  if (!perfil.data?.persona_id) {
    return (
      <PantallaEmpleado titulo="Yo">
        <SinVinculo que="tu legajo, tus horas ni tus documentos" disponible={perfil.data?.vinculoDisponible !== false} />
        <div className="mt-6 border-t border-[#EFEEEA]">
          <Fila href="/mi-cuenta" testid="ir-perfil" titulo="Mi perfil" detalle="Foto, contacto y contraseña" />
        </div>
      </PantallaEmpleado>
    )
  }

  const hoy = await hoyISO()
  const mes = mesDe(hoy)
  const [legajo, docs, horas, asistencia, recibos, obras, cuadrilla] = await Promise.all([
    getMiLegajo(supabase),
    getMisDocumentos(supabase),
    getHorasPropias(supabase, mes.desde, mes.hasta),
    getMiAsistencia(supabase, mes.desde, mes.hasta),
    getMisRecibos(supabase),
    getMiObra(supabase),
    getMiCuadrilla(supabase),
  ])

  const hh = (horas.data ?? []).reduce((s, h) => s + h.horas, 0)
  const jornadas = (asistencia.data ?? []).filter((d) => d.estado !== 'sin_registrar').length
  const porResolver = pendientes(docs.data ?? [], hoy)
  const l = legajo.data
  const obra = obras.data?.[0] ?? null

  return (
    <PantallaEmpleado titulo="Yo">
      {legajo.error && <Aviso tono="neg" titulo="No se pudo leer tu legajo." testid="info-error">{legajo.error}</Aviso>}

      {/* ── LA FICHA: avatar, nombre y categoría ──────────────────────────────────────── */}
      <div className="flex items-center gap-3.5" data-testid="ficha-yo">
        {/* INICIALES Y NO UN MUÑEQUITO GRIS: un avatar genérico parece una persona que no es. */}
        <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full bg-pos-soft text-[17px] font-semibold text-pos">
          {inicialesDe(l?.nombre_completo, user.email)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[19px] font-semibold text-ink">
            {l?.nombre_completo ?? user.email ?? 'sin nombre cargado'}
          </span>
          <span className="block truncate text-[12.5px] text-muted">
            {legible(l?.categoria) ?? legible(l?.puesto) ?? 'sin categoría cargada'}
            {cuadrilla.data?.[0]?.cuadrilla ? ` · ${cuadrilla.data[0].cuadrilla}` : ''}
          </span>
        </span>
      </div>

      {/* ── LOS DATOS QUE GOBIERNA LA EMPRESA ─────────────────────────────────────────── */}
      <div className="mt-5 overflow-hidden rounded-[14px] border border-line bg-surface" data-testid="datos-yo">
        <DatoFicha rotulo="Obra" valor={obra?.nombre ?? null} />
        <DatoFicha
          rotulo="Cuadrilla"
          valor={cuadrilla.data?.[0]?.cuadrilla ?? obra?.cuadrilla ?? null}
          falta="sin cuadrilla asignada"
        />
        <DatoFicha rotulo="Teléfono" valor={l?.telefono ?? null} />
        <DatoFicha rotulo="Legajo" valor={l?.legajo ?? null} />
        <DatoFicha
          rotulo="Ingreso"
          valor={l?.fecha_ingreso ? `${l.fecha_ingreso.slice(8, 10)}/${l.fecha_ingreso.slice(5, 7)}/${l.fecha_ingreso.slice(0, 4)}` : null}
        />
      </div>

      {/* ── ESTE MES ──────────────────────────────────────────────────────────────────── */}
      <h2 className="mt-6 text-[13px] font-semibold text-ink">Este mes · {mesLargo(hoy)}</h2>
      <div className="mt-2 flex gap-2.5" data-testid="mi-mes">
        <Azulejo
          etiqueta="Horas"
          valor={horas.data ? hh.toFixed(2).replace('.', ',') : null}
          falta="no se pudo leer"
          testid="azulejo-horas"
        />
        <Azulejo
          etiqueta="Jornadas"
          valor={asistencia.data ? String(jornadas) : null}
          falta="no se pudo leer"
          testid="azulejo-jornadas"
        />
        {/* AUSENCIAS: «sin registrar» y NUNCA 0. El OS no tiene fuente de ausencias justificadas
            todavía; un 0 afirmaría que no faltó nunca, sobre su propio legajo y sin verificarlo. */}
        <Azulejo etiqueta="Ausencias" valor={null} falta="sin fuente" testid="azulejo-ausencias" />
      </div>

      {/* ── LOS ACCESOS ───────────────────────────────────────────────────────────────── */}
      <div className="mt-6 overflow-hidden rounded-[14px] border border-line bg-surface" data-testid="lista-mi-informacion">
        <Fila
          href="/mi-informacion/documentos"
          testid="ir-documentos"
          titulo="Mis papeles"
          detalle={
            porResolver > 0
              ? <span className="text-warn">{porResolver === 1 ? '1 papel para resolver' : `${porResolver} papeles para resolver`}</span>
              : `${docs.data?.length ?? 0} en tu legajo`
          }
          senal={porResolver > 0 ? String(porResolver) : undefined}
          senalTono="warn"
        />
        <Fila
          href="/mi-informacion/horas"
          testid="ir-horas"
          titulo="Mis horas"
          detalle={mesLargo(hoy)}
          senal={horas.data ? `${hh.toFixed(2).replace('.', ',')} HH` : 'no se pudo leer'}
        />
        <Fila
          href="/mi-informacion/asistencia"
          testid="ir-asistencia"
          titulo="Asistencia"
          detalle="Fichaje, la semana y los pedidos de corrección"
        />
        <Fila
          href="/mi-informacion/recibos"
          testid="ir-recibos"
          titulo="Recibos"
          detalle={
            recibos.data && recibos.data.length > 0
              ? `${recibos.data.length} recibo${recibos.data.length === 1 ? '' : 's'} en tu legajo`
              : 'todavía no hay recibos cargados'
          }
        />
        <Fila
          href="/mi-informacion/legajo"
          testid="ir-legajo"
          titulo="Mi legajo"
          detalle="Identidad, situación laboral y asignaciones"
        />
        <Fila href="/mi-cuenta" testid="ir-perfil" titulo="Mi perfil" detalle="Foto, contacto y contraseña" />
      </div>

      <p className="mt-5 text-[11.5px] leading-relaxed text-faint">
        Los datos de tu ficha los carga la empresa: desde acá se ven, no se editan. Si alguno está
        mal, pedilo por Administración y queda el cambio con quién lo hizo.
      </p>
    </PantallaEmpleado>
  )
}

/** Un renglón de la ficha: rótulo a la izquierda, hecho a la derecha. La ausencia se escribe con su
 *  nombre —«sin cargar»— y no con un guión: un guión no distingue «no tiene» de «nadie lo cargó». */
function DatoFicha({ rotulo, valor, falta = 'sin cargar' }: { rotulo: string; valor: string | null; falta?: string }) {
  return (
    <div className="flex items-center gap-4 border-b border-[#EFEEEA] px-4 py-3 last:border-b-0">
      <span className="w-[92px] shrink-0 text-[12.5px] text-faint">{rotulo}</span>
      <span className={`min-w-0 flex-1 truncate text-[14px] ${valor ? 'text-ink' : 'text-faint'}`}>
        {valor ?? falta}
      </span>
    </div>
  )
}
