import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual } from '@/features/auth/services/authService'
import { Aviso, Estado, Plegable } from '@/shared/components/ds'
import { PantallaEmpleado, Seccion } from '@/features/empleado/components/ShellEmpleado'
import { Dato, Fila, Nada } from '@/features/empleado/components/Filas'
import { Barra } from '@/features/empleado/components/Bloques'
import { PieFijo } from '@/features/empleado/components/Piezas'
import { getMiTarea, getMisImpedimentos } from '@/features/empleado/services/empleadoService'
import { hoyISO } from '@/features/empleado/services/acciones'
import { lecturaDeEstado, lecturaDeFecha, dm } from '@/features/empleado/services/tareas'

// DETALLE DE TAREA — lo que hay que hacer, cómo se mide, y qué la está frenando.
//
// ═══ NUNCA UNA FILA LLENA DE BOTONES ═══
//
// El handoff: «Acciones al pie según estado y permiso: Marcar avance (primaria), Completar,
// Reportar problema. Nunca una fila llena de botones». Acá el permiso corta de verdad: el nivel
// campo NO puede escribir `obra_actividad` —la policy exige dirección, administración o jefe de
// obra— y ofrecerle «Marcar avance» sería una primaria amarilla que rebota contra un `42501`.
//
// Un botón que no puede funcionar es peor que no tenerlo: enseña que la pantalla miente. Se dice
// quién carga el avance, y se ofrece lo único que este perfil SÍ puede hacer, que es reportar.
//
// ═══ M04 (24/08/2026): LA TARJETA DE AVANCE SÍ, EL CONTADOR QUE ESCRIBE NO ═══
//
// El mockup pone arriba una tarjeta con el porcentaje grande, la barra y las dos cantidades —«71,04
// m² hechos · de 96,00 m²»—: eso es LECTURA y está construido, porque contesta «en cuánto queda el
// frente» sin hacer cuentas. Debajo dibuja un contador − / + con atajos que GUARDA avance, y ese no
// se construyó. Tres razones, ninguna de comodidad:
//
//   1. El perfil que usa esta pantalla no puede escribir `obra_actividad` —la policy exige
//      dirección, administración o jefe de obra—. Un contador que guarda sería un botón que rebota
//      contra un 42501 para el 100% de sus usuarios.
//   2. `registrarAvance` recibe la cantidad ACUMULADA, no el incremento; el acumulado real vive en
//      `obra_actividad_control` y `mi_tarea` no lo publica. Derivarlo de `pct × objetivo` mandaría
//      un acumulado redondeado que la acción convierte en delta: avance fabricado por redondeo.
//   3. Hay dos migraciones sin commitear en el árbol —«avance manual sale de los hechos» y «avance
//      manual es suma de incrementos»— que cambian justo esa semántica. Construir encima de un
//      contrato en vuelo produce un botón que anda en el repo y no en producción.
//
// Queda declarado como pendiente, no disimulado con un contador apagado.

export const dynamic = 'force-dynamic'

const ESCRIBEN_LA_ACTIVIDAD = ['direccion', 'administracion', 'jefe_obra']

export default async function DetalleDeTareaPage({ params }: { params: Promise<{ tarea: string }> }) {
  const { tarea: id } = await params
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')
  const perfil = await getPerfilActual(supabase, user.id)

  const hoy = await hoyISO()
  const t = await getMiTarea(supabase, id)
  // NO ES UNA TAREA MÍA → 404, no una pantalla vacía. `mi_tarea` ya devolvió cero filas: la
  // diferencia entre «no existe» y «no es tuya» no se le cuenta a quien preguntó por una ajena.
  if (!t.data) {
    if (t.error) {
      return (
        <PantallaEmpleado titulo="Tarea" volver={{ href: '/mi-trabajo', label: 'Mi trabajo' }}>
          <Aviso tono="neg" titulo="No se pudo leer la tarea." testid="tarea-error">{t.error}</Aviso>
        </PantallaEmpleado>
      )
    }
    notFound()
  }

  const tarea = t.data
  const e = lecturaDeEstado(tarea)
  const f = lecturaDeFecha(tarea, hoy)
  const escribe = ESCRIBEN_LA_ACTIVIDAD.includes(perfil.data?.rol ?? '')

  const [impedimentos, notas, papeles, dependencias] = await Promise.all([
    getMisImpedimentos(supabase),
    supabase.from('obra_actividad_nota').select('id, texto, creado_en').eq('actividad_id', tarea.id).order('creado_en', { ascending: false }),
    supabase.from('obra_documento').select('drive_file_id, nombre, rol').eq('actividad_id', tarea.id),
    supabase.from('obra_dependencia').select('origen_id, tipo').eq('destino_id', tarea.id),
  ])

  const mios = (impedimentos.data ?? []).filter((i) => i.actividad_id === tarea.id)
  const previas = (dependencias.data ?? []) as { origen_id: string; tipo: string | null }[]

  return (
    <PantallaEmpleado
      titulo={tarea.nombre}
      volver={{ href: '/mi-trabajo', label: 'Mi trabajo' }}
      sub={
        <>
          <Estado tono={e.tono} clave={tarea.estado ?? ''} testid="estado-tarea">{e.texto}</Estado>
          <span className={f.vencida ? 'text-neg' : 'text-faint'}> · {f.texto}</span>
          <span className="block text-faint">{tarea.seccion ? `${tarea.seccion} · ` : ''}{tarea.obra}</span>
        </>
      }
    >
      {mios.length > 0 && (
        <Aviso tono="neg" titulo={mios.length === 1 ? 'Esta tarea está frenada' : `Esta tarea tiene ${mios.length} impedimentos abiertos`} testid="tarea-frenada">
          {mios[0].descripcion ?? 'Hay un impedimento abierto.'}
        </Aviso>
      )}

      {/* ═══ LA TARJETA DE AVANCE (M04) ═══
          El porcentaje en 30px porque es el número que decide, la barra debajo, y las dos
          cantidades enfrentadas: lo hecho a la izquierda y el objetivo a la derecha. La nota del
          mockup: «Muestra en cuánto queda el frente, no cómo se calcula».

          SIN LAS DOS PUNTAS NO SE DIBUJAN CANTIDADES. Sin objetivo, «0,00 m² hechos» diría que no se
          hizo nada; sin porcentaje, el objetivo entero diría lo mismo al revés. Las dos son creíbles
          y ninguna es verificable mirando la pantalla, así que se escribe «sin medición». */}
      <div className="rounded-[14px] border border-line bg-surface px-4 py-3.5" data-testid="tarjeta-avance">
        <div className="flex items-baseline gap-3">
          <span className="text-[13px] text-muted">Avance</span>
          <span className="ml-auto font-mono text-[30px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-ink">
            {tarea.pct == null ? <span className="text-[14px] font-normal text-faint">sin medir</span> : `${Math.round(tarea.pct)} %`}
          </span>
        </div>
        <Barra pct={tarea.pct} frenada={mios.length > 0} />
        <div className="mt-2 flex items-baseline gap-3 font-mono text-[12.5px]">
          {tarea.cantidad_objetivo != null && tarea.pct != null ? (
            <>
              <span className="text-ink">
                {(tarea.cantidad_objetivo * tarea.pct / 100).toFixed(2).replace('.', ',')}
                {tarea.unidad ? ` ${tarea.unidad}` : ''} hechos
              </span>
              <span className="ml-auto text-faint">
                de {tarea.cantidad_objetivo.toFixed(2).replace('.', ',')}{tarea.unidad ? ` ${tarea.unidad}` : ''}
              </span>
            </>
          ) : (
            <span className="text-faint">sin medición: falta {tarea.cantidad_objetivo == null ? 'la cantidad objetivo' : 'el avance cargado'}</span>
          )}
        </div>
      </div>

      <Seccion titulo="DATOS">
        <div data-testid="datos-tarea">
          <Dato rotulo="Cómo se mide" valor={tarea.metodo_avance ?? (tarea.unidad ? `por ${tarea.unidad}` : null)} falta="no se declaró" />
          <Dato rotulo="Plan" valor={tarea.inicio_plan || tarea.fin_plan ? `${tarea.inicio_plan ? dm(tarea.inicio_plan, hoy) : '—'} a ${tarea.fin_plan ? dm(tarea.fin_plan, hoy) : '—'}` : null} falta="sin planificar" />
          <Dato rotulo="Obra" valor={tarea.obra} />
          <Dato rotulo="Código" valor={tarea.codigo} falta="sin código" />
        </div>
      </Seccion>

      {tarea.comentario && (
        <Seccion titulo="INDICACIONES">
          <p className="text-[13.5px] leading-relaxed text-ink" data-testid="indicaciones">{tarea.comentario}</p>
        </Seccion>
      )}

      <div className="mt-6 border-t border-[#EFEEEA]">
        <Plegable
          titulo="Impedimentos"
          cuenta={mios.length}
          testid="tarea-impedimentos"
          alerta={mios.length > 0 ? 'abierto' : undefined}
        >
          {mios.length > 0
            ? mios.map((i) => <Fila key={i.id} testid="tarea-impedimento" titulo={i.descripcion ?? 'Impedimento'} detalle={i.tipo ?? 'sin clasificar'} senal="abierto" senalTono="neg" />)
            : <Nada>Nada frena esta tarea.</Nada>}
        </Plegable>

        <Plegable titulo="Documentos" cuenta={papeles.data?.length ?? 0} testid="tarea-documentos">
          {papeles.data && papeles.data.length > 0
            ? papeles.data.map((d) => (
                <Fila key={d.drive_file_id as string} testid="tarea-documento" href={`https://drive.google.com/file/d/${d.drive_file_id}/view`} titulo={(d.nombre as string) ?? 'Documento'} detalle={(d.rol as string) ?? 'sin categoría'} />
              ))
            : <Nada>No hay documentos colgados de esta tarea.</Nada>}
        </Plegable>

        <Plegable titulo="Notas" cuenta={notas.data?.length ?? 0} testid="tarea-notas">
          {notas.data && notas.data.length > 0
            ? notas.data.map((n) => (
                <p key={n.id as string} data-testid="tarea-nota" className="border-b border-[#EFEEEA] py-2.5 text-[13px] leading-relaxed text-ink">
                  {n.texto as string}
                  <span className="block text-[11px] text-faint">{String(n.creado_en).slice(8, 10)}/{String(n.creado_en).slice(5, 7)}</span>
                </p>
              ))
            : <Nada>Sin notas.</Nada>}
        </Plegable>

        <Plegable titulo="Depende de" cuenta={previas.length} testid="tarea-dependencias">
          {previas.length > 0
            ? <p className="py-2.5 text-[12.5px] text-muted" data-testid="tarea-dependencia">
                {previas.length === 1 ? 'Depende de 1 trabajo previo' : `Depende de ${previas.length} trabajos previos`} de la misma obra.
              </p>
            : <Nada>No depende de ningún trabajo previo.</Nada>}
        </Plegable>
      </div>

      {/* ── AL PIE: UNA PRIMARIA, Y SÓLO LA QUE PUEDE FUNCIONAR ────────────────────────── */}
      <div className="mt-8">
        <PieFijo testid="pie-tarea">
          <Link
            href={`/mi-trabajo/reportar?obra=${encodeURIComponent(tarea.obra_id)}&tarea=${tarea.id}`}
            data-testid="reportar-problema"
            className="flex h-[52px] w-full items-center justify-center rounded-[12px] bg-marca text-[15px] font-semibold text-[color:var(--os-on-marca)] active:opacity-90"
          >
            Avisar un problema
          </Link>
        </PieFijo>
        {escribe ? (
          <p className="mt-2.5 text-[11.5px] text-faint">
            El avance y el cierre de la actividad se cargan en el parte del día de la obra, que es
            donde imputan las horas.{' '}
            <Link href={`/obras/${tarea.obra_id}`} className="text-muted underline hover:text-ink" data-testid="ir-a-la-obra">
              Ir a la obra →
            </Link>
          </p>
        ) : (
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-faint" data-testid="quien-carga-avance">
            El avance de la actividad lo carga el jefe de obra en el parte del día: tu usuario no
            tiene permiso para escribirlo, y la base lo rechazaría igual. Lo que sí podés hacer es
            reportar lo que está frenando el trabajo.
          </p>
        )}
      </div>
    </PantallaEmpleado>
  )
}
