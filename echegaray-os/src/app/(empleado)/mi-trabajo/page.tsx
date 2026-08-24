import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { Aviso } from '@/shared/components/ds'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { Nada } from '@/features/empleado/components/Filas'
import { Barra, Chips, Tarjeta } from '@/features/empleado/components/Bloques'
import {
  getMiCuadrilla, getMisImpedimentos, getMiObra, getMisTareas,
} from '@/features/empleado/services/empleadoService'
import { hoyISO } from '@/features/empleado/services/acciones'
import { clasificar, restante } from '@/features/empleado/services/tareas'
import type { MiTarea } from '@/features/empleado/types'

// «MI TRABAJO» (M03) — tres filtros y una tarjeta por frente. Nada más.
//
// ═══ LO QUE ESTA PANTALLA DEJÓ DE SER ═══
//
// Era un vestíbulo: obra actual, cuatro secciones plegadas, cuadrilla, planos, accesos operativos.
// El mockup del dueño la convierte en UNA lista de frentes con lo que falta en cada uno, y la razón
// está escrita en su propia nota: «Sólo lo asignado a él». Un vestíbulo obliga a decidir a dónde ir
// antes de ver nada; esta pantalla contesta la pregunta directamente.
//
// La obra y la cuadrilla no se perdieron: viven en el subtítulo, que es donde el mockup las pone.
// Los planos de obra y el mes siguen en «Hoy», y el detalle de la cuadrilla en «Yo».
//
// ═══ TRES FILTROS Y NO CUATRO ═══
//
// «Para hoy» es lo que se trabaja hoy —incluido lo vencido, que se trabaja más que ninguna—.
// «Terminadas» es lo hecho. «Todas» incluye lo planificado a futuro, que en este OS son 212 de 349
// actividades sin fecha: si eso cayera en «Para hoy», el lunes a la mañana la pantalla mostraría
// doscientas tareas y ninguna sería la del muro sur.
//
// ═══ LA TARJETA DICE POR QUÉ ESTÁ PARADA, NO SÓLO QUE LO ESTÁ ═══
//
// La nota del mockup: «Sabe por qué no puede avanzar sin abrir nada». El renglón rojo lleva la
// descripción real del impedimento —«falta bloque 18×18»—, no la palabra «frenada». La barra se
// pinta roja por lo mismo: un 74% con el material faltante no es una buena noticia.

export const dynamic = 'force-dynamic'

type Filtro = 'hoy' | 'terminadas' | 'todas'
const FILTROS: Filtro[] = ['hoy', 'terminadas', 'todas']
const ETIQUETA: Record<Filtro, string> = { hoy: 'Para hoy', terminadas: 'Terminadas', todas: 'Todas' }

export default async function MiTrabajoPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string }>
}) {
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

  const { ver } = await searchParams
  const filtro: Filtro = FILTROS.includes(ver as Filtro) ? (ver as Filtro) : 'hoy'
  const hoy = await hoyISO()
  const [obras, cuadrilla, tareas, impedimentos] = await Promise.all([
    getMiObra(supabase), getMiCuadrilla(supabase), getMisTareas(supabase), getMisImpedimentos(supabase),
  ])
  const obra = obras.data?.[0] ?? null
  const grupos = clasificar(tareas.data ?? [], hoy)
  const todas = [...grupos.hoy, ...grupos.proximas, ...grupos.completadas]
  const lista = filtro === 'hoy' ? grupos.hoy : filtro === 'terminadas' ? grupos.completadas : todas
  const error = obras.error ?? tareas.error ?? impedimentos.error ?? null

  // POR QUÉ ESTÁ PARADA, POR ACTIVIDAD. Se toma el primero: la tarjeta tiene un renglón, y dos
  // motivos apilados en 390px empujan la barra fuera de la vista. El resto se ve al abrir la tarea.
  const porQue = new Map<string, string>()
  for (const i of impedimentos.data ?? []) {
    if (i.actividad_id && !porQue.has(i.actividad_id)) {
      porQue.set(i.actividad_id, i.descripcion ?? 'sin describir')
    }
  }

  // LA CUENTA DE UN CHIP QUE NO SE PUDO LEER VA `null`, NO 0. Un «Todas 0» sobre una lectura que
  // falló afirma que la persona no tiene ni una tarea asignada, que es una acusación, no un dato.
  const cuenta = (n: number) => (tareas.error ? null : n)

  return (
    <PantallaEmpleado
      titulo="Mi trabajo"
      sub={
        <>
          {obra?.nombre ?? 'sin obra asignada'}
          {' · '}
          {cuadrilla.data?.[0]?.cuadrilla ?? obra?.cuadrilla ?? 'sin cuadrilla'}
        </>
      }
    >
      {error && <Aviso tono="neg" titulo="No se pudo leer todo." testid="trabajo-error">{error}</Aviso>}

      <Chips
        base="/mi-trabajo"
        actual={filtro}
        testid="filtros-trabajo"
        opciones={[
          { id: 'hoy', label: ETIQUETA.hoy, cuenta: cuenta(grupos.hoy.length) },
          { id: 'terminadas', label: ETIQUETA.terminadas, cuenta: cuenta(grupos.completadas.length) },
          { id: 'todas', label: ETIQUETA.todas, cuenta: cuenta(todas.length) },
        ]}
      />

      <div className="mt-3 space-y-2.5" data-testid="lista-tareas">
        {lista.length === 0 ? (
          <Nada testid="sin-tareas">
            {filtro === 'terminadas'
              ? 'Todavía no terminaste ninguna tarea.'
              : 'No tenés tareas asignadas. Una actividad es tuya cuando sos su responsable o es de tu cuadrilla; lo asigna el jefe de obra.'}
          </Nada>
        ) : (
          lista.map((t) => <TarjetaDeTarea key={t.id} t={t} porQue={porQue.get(t.id) ?? null} />)
        )}
      </div>

      {/* ═══ LO OPERATIVO QUE NO SE SACA, PERO YA NO COMPITE CON LOS FRENTES ═══
          Pedidos de materiales, herramientas, movimientos y el parte de campo son pantallas vivas
          que el nivel campo usa hoy (`CAMPO_RUTAS_PERMITIDAS`). El mockup no las dibuja porque
          describe el día del empleado, no el inventario del OS — y borrarlas para «cumplir el
          diseño» sería eliminar funcionalidad. Bajan al pie, en texto, después de la última
          tarjeta: siguen a un toque y no le disputan el lugar a lo que la pantalla vino a decir. */}
      <div className="mt-8 border-t border-[#EFEEEA] pt-4" data-testid="mas-de-obra">
        <p className="text-[10.5px] font-semibold tracking-[0.14em] text-faint">TAMBIÉN DESDE ACÁ</p>
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px]">
          <Link href="/integraciones/pedidos-materiales" data-testid="ir-pedidos" className="text-muted hover:text-ink">Pedir material →</Link>
          <Link href="/integraciones/herramientas" data-testid="ir-herramientas" className="text-muted hover:text-ink">Herramientas →</Link>
          <Link href="/integraciones/movimientos" data-testid="ir-movimientos" className="text-muted hover:text-ink">Movimientos →</Link>
          <Link href="/campo" data-testid="ir-campo" className="text-muted hover:text-ink">Parte de campo →</Link>
        </div>
      </div>
    </PantallaEmpleado>
  )
}

/** La tarjeta de un frente: qué hay que hacer, cuánto falta EN SU UNIDAD, y el avance como barra.
 *  `restante()` devuelve `null` sin las dos puntas y entonces se escribe «sin medición»: sin
 *  objetivo daría «0,00 m² restantes» —la tarea terminada— y sin porcentaje el objetivo entero. */
function TarjetaDeTarea({ t, porQue }: { t: MiTarea; porQue: string | null }) {
  const frenada = porQue != null || t.impedimentos > 0
  return (
    <Tarjeta href={`/mi-trabajo/tareas/${t.id}`} testid="tarjeta-tarea">
      <span className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink">{t.nombre}</span>
          <span className="mt-1 block truncate font-mono text-[12px] text-faint">
            {t.seccion ?? t.obra ?? 'sin sección'}
            {' · '}
            {restante(t) ?? 'sin medición'}
          </span>
        </span>
        <span aria-hidden className="shrink-0 pt-0.5 text-[15px] text-line-strong">›</span>
      </span>
      <Barra pct={t.pct} frenada={frenada} />
      {frenada && (
        <span className="mt-2.5 block border-t border-[#EFEEEA] pt-2.5 text-[12.5px] text-neg" data-testid="frente-parado">
          Frente parado: {porQue ?? 'hay un impedimento abierto'}
        </span>
      )}
    </Tarjeta>
  )
}
