import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { getPerfilPropio } from '@/features/mi-cuenta/services/miCuentaService'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { C, R, pct } from '@/shared/components/movil/tokens'
import { Icono } from '@/shared/components/movil/Iconos'
import { AvisoError, BarraAvance, Pastilla, Vacio, mono } from '@/shared/components/movil/Piezas'
import {
  getMiCuadrilla, getMisImpedimentos, getMiObra, getMisTareas,
} from '@/features/empleado/services/empleadoService'
import { hoyISO } from '@/features/empleado/services/acciones'
import { clasificar, estaCompleta, restante } from '@/features/empleado/services/tareas'
import type { MiTarea } from '@/features/empleado/types'

// M03 · MI TRABAJO — porte literal de `M03 · Mi trabajo.dc.html`.
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
// pinta roja por lo mismo: un 74 % con el material faltante no es una buena noticia.
//
// ═══ LO QUE EL MOCKUP NO DIBUJA Y NO SE BORRA ═══
//
// Pedidos de materiales, herramientas, movimientos y el parte de campo son pantallas vivas que el
// nivel campo usa hoy. El mockup no las dibuja porque describe el día del empleado, no el
// inventario del OS — y borrarlas para «cumplir el diseño» sería eliminar funcionalidad. Bajan al
// pie, en texto, después de la última tarjeta.

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
    <>
      <PantallaEmpleado
        titulo="Mi trabajo"
        sub={`${obra?.nombre ?? 'sin obra asignada'} · ${cuadrilla.data?.[0]?.cuadrilla ?? obra?.cuadrilla ?? 'sin cuadrilla'}`}
        franja={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, overflowX: 'auto' }} data-testid="filtros-trabajo">
            {FILTROS.map((f) => (
              <Pastilla
                key={f}
                testid={`chip-${f}`}
                href={f === 'hoy' ? '/mi-trabajo' : `/mi-trabajo?ver=${f}`}
                texto={ETIQUETA[f]}
                cuenta={cuenta(f === 'hoy' ? grupos.hoy.length : f === 'terminadas' ? grupos.completadas.length : todas.length)}
                activa={f === filtro}
              />
            ))}
          </div>
        }
      >
        {error && <AvisoError testid="trabajo-error">{error}</AvisoError>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="lista-tareas">
          {lista.length === 0 ? (
            <Vacio testid="sin-tareas">
              {filtro === 'terminadas'
                ? 'Todavía no terminaste ninguna tarea.'
                : 'No tenés tareas en este filtro. Una actividad es tuya cuando sos su responsable o es de tu cuadrilla; lo asigna el jefe de obra.'}
            </Vacio>
          ) : lista.map((t) => <TarjetaDeTarea key={t.id} t={t} porQue={porQue.get(t.id) ?? null} />)}
        </div>

        <div style={{ marginTop: 28, borderTop: `1px solid ${C.inerte}`, paddingTop: 14 }} data-testid="mas-de-obra">
          <p style={{ fontSize: 11, color: C.faint, letterSpacing: '.06em' }}>TAMBIÉN DESDE ACÁ</p>
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '8px 18px', fontSize: 12.5 }}>
            <Link href="/integraciones/pedidos-materiales" data-testid="ir-pedidos" style={{ color: C.muted }}>Pedir material →</Link>
            <Link href="/integraciones/herramientas" data-testid="ir-herramientas" style={{ color: C.muted }}>Herramientas →</Link>
            <Link href="/integraciones/movimientos" data-testid="ir-movimientos" style={{ color: C.muted }}>Movimientos →</Link>
            <Link href="/campo" data-testid="ir-campo" style={{ color: C.muted }}>Parte de campo →</Link>
          </div>
        </div>
      </PantallaEmpleado>
    </>
  )
}

/**
 * La tarjeta de un frente: qué hay que hacer, cuánto falta EN SU UNIDAD, y el avance como barra.
 *
 * `restante()` devuelve `null` sin las dos puntas y entonces se escribe «sin medición»: sin
 * objetivo daría «0,00 m² restantes» —la tarea terminada— y sin porcentaje el objetivo entero.
 */
function TarjetaDeTarea({ t, porQue }: { t: MiTarea; porQue: string | null }) {
  const frenada = porQue != null || t.impedimentos > 0
  const hecha = estaCompleta(t)
  const icono = hecha ? 'ok' : frenada ? 'bloqueo' : t.estado === 'en_curso' ? 'reloj' : 'pendiente'
  const color = hecha ? C.pos : frenada ? C.neg : t.estado === 'en_curso' ? C.info : C.tenue
  return (
    <Link
      href={`/mi-trabajo/tareas/${t.id}`}
      data-testid="tarjeta-tarea"
      style={{
        background: C.surface, border: `1px solid ${frenada ? C.negBorde : C.linea}`,
        borderRadius: R.tarjeta, padding: 14, display: 'block', color: C.ink,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        <span style={{ display: 'flex', color, flexShrink: 0, marginTop: 2 }}>
          <Icono nombre={icono} tamano={20} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: hecha ? C.muted : C.ink, lineHeight: 1.3 }}>
            {t.nombre}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12.5, color: C.muted }}>{t.seccion ?? t.obra ?? 'sin sección'}</span>
            <span style={{ color: C.lineaFuerte }}>·</span>
            <span style={{ ...mono, fontSize: 12.5, color: C.muted }}>{restante(t) ?? 'sin medición'}</span>
          </div>
        </div>
        <span style={{ display: 'flex', color: C.tenue, flexShrink: 0, marginTop: 4 }}>
          <Icono nombre="siguiente" tamano={18} />
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <BarraAvance
            pct={t.pct}
            color={hecha ? C.pos : frenada ? C.neg : (t.pct ?? 0) > 0 ? C.info : C.lineaFuerte}
          />
        </div>
        <span style={{ ...mono, fontSize: 13, fontWeight: 600, color: t.pct == null ? C.faint : hecha ? C.pos : C.ink }}>
          {t.pct == null ? '—' : pct(t.pct)}
        </span>
      </div>
      {frenada && (
        <div
          data-testid="frente-parado"
          style={{
            display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, paddingTop: 10,
            borderTop: `1px solid ${C.divisorSuave}`, fontSize: 12, color: C.neg,
          }}
        >
          <Icono nombre="material" tamano={14} />
          Frente parado: {porQue ?? 'hay un impedimento abierto'}
        </div>
      )}
    </Link>
  )
}
