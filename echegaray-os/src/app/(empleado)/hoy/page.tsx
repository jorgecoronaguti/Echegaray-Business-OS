import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual } from '@/features/auth/services/authService'
import { getPerfilPropio, getHorasPropias } from '@/features/mi-cuenta/services/miCuentaService'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { inicialesDe } from '@/features/empleado/components/shell-logica'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { BloqueAsistencia } from '@/features/empleado/components/BloqueAsistencia'
import { C, R, pct } from '@/shared/components/movil/tokens'
import { Icono, type NombreIcono } from '@/shared/components/movil/Iconos'
import {
  AvisoError, BarraAvance, RotuloSeccion, TopBarMarca, Vacio, mono,
} from '@/shared/components/movil/Piezas'
import {
  getMiDiaDeHoy, getMisDocumentos, getMisImpedimentos, getMiObra, getMisTareas,
} from '@/features/empleado/services/empleadoService'
import { hoyISO } from '@/features/empleado/services/acciones'
import { diaYFecha, semanaDe } from '@/features/empleado/services/fecha'
import { clasificar, estaCompleta, restante } from '@/features/empleado/services/tareas'
import { estadoEnPantalla, pendientes } from '@/features/empleado/services/documentos'
import type { MiTarea } from '@/features/empleado/types'

// M02 · HOY — porte literal de `M02 · Hoy.dc.html`.
//
// ═══ UNA SOLA PREGUNTA POR PANTALLA ═══
//
// Qué tengo que hacer y si ya fiché. En ese orden: la tarjeta de fichaje va ARRIBA de las tareas
// porque a las siete de la mañana es la única pregunta, y la lista de frentes viene después.
//
// ═══ QUÉ SE FUE DE ACÁ, Y A DÓNDE ═══
//
// La versión anterior era una pantalla de dos columnas con OBRA, CUADRILLA, PENDIENTES, MI MES y
// DOCUMENTOS DE MI OBRA. El mockup dibuja seis bloques y ninguno de esos cinco: la obra vive en el
// topbar de marca, la cuadrilla y los datos personales en M09, las horas en M06 y los papeles en
// M08 — todos a un toque desde la barra de abajo. Lo que quedó es lo que se usa parado en la obra.
//
// ═══ EL CHECK DE LA TARJETA NO ES UN BOTÓN, Y ESO ES UN DESVÍO DECLARADO ═══
//
// El mockup dice «el check tacha la tarea al toque y guarda en segundo plano». No hay ninguna
// escritura en este OS que marque una tarea como hecha desde el teléfono del empleado: el avance se
// carga con cantidad o pasos (M04) y el estado lo cierra la obra. Un check que parece guardar y no
// guarda es el peor modo de falla posible. Queda como INDICADOR de estado —verde con tilde cuando
// la tarea está terminada— y la tarjeta entera lleva a M04, que es donde sí se escribe.

export const dynamic = 'force-dynamic'

export default async function HoyPage() {
  const supabase = await createClient()
  const user = await getUsuarioActual(supabase)
  if (!user) redirect('/login')

  const perfilBasico = await getPerfilActual(supabase, user.id)
  const perfil = await getPerfilPropio(supabase, user.id)
  const hoy = await hoyISO()
  const iniciales = inicialesDe(perfilBasico.data?.nombre, user.email)

  // SIN PERSONA VINCULADA NO HAY NADA QUE MOSTRAR, y se dice por qué. Las vistas `mi_*` devuelven
  // cero filas, y cero por falta de vínculo es indistinguible de cero real: sin este cartel, la
  // pantalla le diría a alguien que trabajó veinte días que no tiene obra, ni cuadrilla, ni tareas.
  if (!perfil.data?.persona_id) {
    return (
      <>
        <TopBarMarca iniciales={iniciales} contexto="sin legajo vinculado" />
        <PantallaEmpleado titulo="Hoy" sub={diaYFecha(hoy)}>
          <SinVinculo que="tu obra, tu cuadrilla ni tus tareas" disponible={perfil.data?.vinculoDisponible !== false} />
        </PantallaEmpleado>
      </>
    )
  }

  const semana = semanaDe(hoy)
  const [obras, dia, tareas, impedimentos, documentos, horas] = await Promise.all([
    getMiObra(supabase),
    getMiDiaDeHoy(supabase, hoy),
    getMisTareas(supabase),
    getMisImpedimentos(supabase),
    getMisDocumentos(supabase),
    getHorasPropias(supabase, semana.desde, semana.hasta),
  ])

  const obra = obras.data?.[0] ?? null
  const deHoy = clasificar(tareas.data ?? [], hoy).hoy
  const hechas = deHoy.filter(estaCompleta).length
  const nPapeles = pendientes(documentos.data ?? [], hoy)
  const nuevos = (documentos.data ?? []).filter((d) => estadoEnPantalla(d, hoy) === 'solicitado').length
  const problema = (impedimentos.data ?? [])[0] ?? null

  // LAS HORAS DE LA SEMANA, DE `mi_hh_dia`. Son HH IMPUTADAS por la obra, no presencia: son dos
  // hechos distintos y la pantalla los rotula distinto (ver `asistencia.ts`).
  const hhSemana = (horas.data ?? []).reduce((s, h) => s + h.horas, 0)
  const hhHoy = (horas.data ?? []).filter((h) => h.fecha?.slice(0, 10) === hoy)
    .reduce((s, h) => s + h.horas, 0)

  const error = obras.error ?? dia.error ?? tareas.error ?? impedimentos.error ?? documentos.error ?? null

  return (
    <>
      <TopBarMarca iniciales={iniciales} contexto={obra?.nombre ?? 'sin obra asignada'} />

      <div style={{ padding: '16px 16px 24px' }}>
        <div style={{ fontSize: 22, fontWeight: 600, color: C.ink }}>
          Hola, {(perfilBasico.data?.nombre ?? user.email ?? '').split(' ')[0] || 'que tal'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: C.muted, marginTop: 2 }}>
          <Icono nombre="fecha" tamano={14} />
          <span style={{ ...mono }} data-testid="hoy-fecha">{diaYFecha(hoy)}</span>
        </div>

        {error && <div style={{ marginTop: 14 }}><AvisoError testid="hoy-error">{error}</AvisoError></div>}

        <div style={{ marginTop: 16 }}>
          <BloqueAsistencia dia={dia.data} obraId={obra?.id ?? null} tarjeta />
        </div>

        <RotuloSeccion icono="tarea" extra={`${hechas} de ${deHoy.length}`} margenArriba={26}>
          Mi trabajo de hoy
        </RotuloSeccion>

        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="trabajo-de-hoy">
          {deHoy.length === 0 ? (
            <Vacio testid="sin-tareas-hoy">
              No tenés tareas asignadas para hoy. Las asigna el jefe de obra: una actividad es tuya
              cuando sos su responsable o es de tu cuadrilla.
            </Vacio>
          ) : deHoy.slice(0, 5).map((t) => <TarjetaDeTarea key={t.id} t={t} />)}
        </div>

        {/* LA TARJETA ROSA DEL PROBLEMA. No es un aviso del sistema: es el impedimento REAL de una
            actividad suya, con su descripción y cuándo se avisó. Si no hay ninguno, no se dibuja —
            un bloque que siempre dice algo deja de decir. */}
        {problema && (
          <Link
            href={problema.actividad_id ? `/mi-trabajo/tareas/${problema.actividad_id}` : '/mi-trabajo'}
            data-testid="tarjeta-problema"
            style={{
              marginTop: 20, background: C.negFondo, border: `1px solid ${C.negBorde}`,
              borderRadius: R.tarjeta, padding: 14, display: 'flex', alignItems: 'center',
              gap: 12, minHeight: 64, color: C.ink,
            }}
          >
            <span style={{ display: 'flex', color: C.neg, flexShrink: 0 }}><Icono nombre="bloqueo" tamano={22} /></span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <span style={{ display: 'block', fontSize: 14.5, fontWeight: 600, color: C.ink }}>
                {problema.descripcion ?? 'Hay un impedimento abierto'}
              </span>
              <span style={{ display: 'block', fontSize: 12.5, color: C.muted, marginTop: 1 }}>
                {problema.actividad ?? 'problema de la obra'} · avisado el {problema.creado_en.slice(8, 10)}/{problema.creado_en.slice(5, 7)}
              </span>
            </span>
            <span style={{ display: 'flex', color: C.faint, flexShrink: 0 }}><Icono nombre="siguiente" tamano={18} /></span>
          </Link>
        )}

        {/* LOS TRES ACCESOS DEL MOCKUP. «Subir foto» va apagado: una foto suelta no tiene destino en
            la base —las fotos cuelgan de un avance como enlace de Drive, no como carga— y un acceso
            que no lleva a ningún lado enseña que la pantalla miente. */}
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }} data-testid="accesos-hoy">
          <Acceso href="/mi-trabajo/reportar" icono="alerta" color={C.warn} texto="Avisar problema" testid="acceso-problema" />
          <Acceso icono="foto" texto="Subir foto" testid="acceso-foto" />
          <Acceso
            href="/mi-informacion/documentos"
            icono="doc"
            texto="Mis papeles"
            nota={nuevos > 0 ? `${nuevos} ${nuevos === 1 ? 'nuevo' : 'nuevos'}` : nPapeles > 0 ? `${nPapeles} pendiente${nPapeles === 1 ? '' : 's'}` : undefined}
            testid="acceso-papeles"
          />
        </div>

        <Link
          href="/mi-informacion/horas"
          data-testid="resumen-horas"
          style={{
            display: 'block', marginTop: 22, background: C.surface, border: `1px solid ${C.linea}`,
            borderRadius: R.tarjeta, padding: 14, color: C.ink,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ display: 'flex', color: C.muted }}><Icono nombre="reloj" tamano={16} /></span>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Mis horas</div>
            <span style={{ ...mono, marginLeft: 'auto', fontSize: 15, fontWeight: 600, color: hhHoy > 0 ? C.ink : C.faint }}>
              {/* SIN IMPUTAR NO ES CERO: a media mañana la obra todavía no cargó nada, y un «0,0 h»
                  afirma que no se trabajó. */}
              {horas.error ? '—' : hhHoy > 0 ? `${n1(hhHoy)} h` : 'sin imputar'}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 8 }}>
            <span style={{ fontSize: 12.5, color: C.muted }}>esta semana</span>
            <span style={{ ...mono, fontSize: 12.5, color: C.muted }}>
              {horas.error ? 'no se pudo leer' : `${n1(hhSemana)} h`}
            </span>
          </div>
        </Link>
      </div>
    </>
  )
}

/** La tarjeta de tarea de M02: el círculo de estado, el frente, lo que falta y la barra de 7px. */
function TarjetaDeTarea({ t }: { t: MiTarea }) {
  const hecha = estaCompleta(t)
  const frenada = t.impedimentos > 0
  return (
    <Link
      href={`/mi-trabajo/tareas/${t.id}`}
      data-testid="tarea-de-hoy"
      style={{
        background: C.surface, border: `1px solid ${hecha ? C.linea : C.lineaFuerte}`,
        borderRadius: R.tarjeta, padding: 14, display: 'block', color: C.ink,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{
          width: 44, height: 44, marginLeft: -7, marginTop: -7, display: 'flex',
          alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <span style={{
            width: 30, height: 30, borderRadius: 15,
            border: `2px solid ${hecha ? C.pos : C.lineaFuerte}`, background: hecha ? C.pos : C.surface,
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.surface,
          }}>
            {hecha && <Icono nombre="ok" tamano={16} grosor={3} />}
          </span>
        </span>
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: hecha ? C.muted : C.ink, lineHeight: 1.3 }}>
            {t.nombre}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: C.muted, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icono nombre="obra" tamano={13} />
              {t.seccion ?? t.obra ?? 'sin sección'}
            </span>
            <span style={{ color: C.lineaFuerte }}>·</span>
            <span style={{ ...mono }}>{restante(t) ?? 'sin medición'}</span>
          </span>
        </span>
        <span style={{ display: 'flex', color: C.tenue, flexShrink: 0, marginTop: 4 }}>
          <Icono nombre="siguiente" tamano={18} />
        </span>
      </div>
      {!hecha && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <BarraAvance pct={t.pct} color={frenada ? C.neg : (t.pct ?? 0) > 0 ? C.info : C.lineaFuerte} />
          </div>
          <span style={{ ...mono, fontSize: 13, fontWeight: 600, color: t.pct == null ? C.faint : C.ink }}>
            {t.pct == null ? '—' : pct(t.pct)}
          </span>
        </div>
      )}
      {frenada && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, fontSize: 12, color: C.neg }} data-testid="frente-parado">
          <Icono nombre="material" tamano={14} />
          Frente parado: hay un impedimento abierto
        </div>
      )}
    </Link>
  )
}

/** Uno de los tres accesos de 88px. Sin `href` queda apagado, con el motivo en su `title`. */
function Acceso({ href, icono, texto, nota, color = C.muted, testid }: {
  href?: string
  icono: NombreIcono
  texto: string
  nota?: string
  color?: string
  testid: string
}) {
  const estilo = {
    flex: 1, background: C.surface, border: `1px solid ${C.linea}`, borderRadius: R.tarjeta,
    padding: '14px 10px', display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
    gap: 8, minHeight: 88, justifyContent: 'center', color: C.ink,
  }
  const cuerpo = (
    <>
      <span style={{ display: 'flex', color: href ? color : C.tenue }}><Icono nombre={icono} tamano={24} /></span>
      <span style={{ fontSize: 12.5, fontWeight: 500, color: href ? C.ink : C.faint, textAlign: 'center' }}>{texto}</span>
      {nota && <span style={{ ...mono, fontSize: 11, color }}>{nota}</span>}
    </>
  )
  return href ? (
    <Link href={href} data-testid={testid} style={estilo}>{cuerpo}</Link>
  ) : (
    <span
      data-testid={testid}
      aria-disabled
      title="Todavía no hay dónde guardarla: la foto viaja como enlace al registrar un avance"
      style={{ ...estilo, cursor: 'not-allowed' }}
    >
      {cuerpo}
    </span>
  )
}

const n1 = (v: number) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v)
