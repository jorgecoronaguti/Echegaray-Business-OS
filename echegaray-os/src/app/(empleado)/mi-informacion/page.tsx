import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual } from '@/features/auth/services/authService'
import { logoutAction } from '@/features/auth/services/actions'
import { getPerfilPropio, getHorasPropias } from '@/features/mi-cuenta/services/miCuentaService'
import { SinVinculo } from '@/features/mi-cuenta/components/SinVinculo'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { inicialesDe } from '@/features/empleado/components/shell-logica'
import { C, R } from '@/shared/components/movil/tokens'
import { Icono, type NombreIcono } from '@/shared/components/movil/Iconos'
import { AvisoError, RotuloSeccion, TarjetaLista, mono } from '@/shared/components/movil/Piezas'
import {
  getMiAsistencia, getMiCuadrilla, getMiLegajo, getMiObra, getMisDocumentos, getMisRecibos,
} from '@/features/empleado/services/empleadoService'
import { hoyISO } from '@/features/empleado/services/acciones'
import { pendientes } from '@/features/empleado/services/documentos'
import { legible, mesDe, mesLargo } from '@/features/empleado/services/fecha'

// M09 · YO — porte literal de `M09 · Yo.dc.html`.
//
// ═══ FICHA, NO PERFIL EDITABLE ═══
//
// La nota del mockup: «Los datos los gobierna la empresa; él ve y pide cambios». Obra, cuadrilla,
// legajo y fecha de ingreso son hechos del legajo: no hay un lápiz al lado de ninguno porque la
// pantalla no puede escribirlos —y la base tampoco se lo permitiría—.
//
// ═══ SIN AJUSTES DECORATIVOS ═══
//
// «Nada de temas, idiomas ni switches que no hacen nada». Un switch que no cambia nada enseña que
// la pantalla miente, y esa lección se aplica después a los botones que sí importan.
//
// ═══ LOS TRES AZULEJOS DEL MES, Y EL QUE NO SE PUEDE LLENAR ═══
//
// HORAS son las HH imputadas por la obra. JORNADAS son los días con marca de asistencia — el dato
// que la persona produce con su pulgar. AUSENCIAS queda en «sin fuente» y NO en 0: el OS no tiene
// todavía una fuente de ausencias justificadas (parte médico, licencia), y un 0 ahí afirma que no
// faltó nunca, que es una afirmación sobre su legajo que nadie verificó.
//
// ═══ «CAMBIAR MI TELÉFONO» NO ESTÁ ═══
//
// El mockup lo dibuja con la nota «lo aprueba la oficina». No existe cola de aprobación de datos
// personales en el OS: lo que sí existe es `/mi-cuenta`, donde la persona edita lo que la empresa
// le deja editar. Se ofrece eso, con su nombre real, en vez de un acceso a un flujo inexistente.

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
        <div style={{ marginTop: 18 }}>
          <TarjetaLista>
            <Acceso href="/mi-cuenta" icono="candado" titulo="Mi perfil" detalle="Foto, contacto y contraseña" testid="ir-perfil" />
          </TarjetaLista>
        </div>
        <Salir />
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
    <>
      {/* ── LA FICHA ES EL ENCABEZADO: avatar de 56, nombre en 18/600 y categoría debajo ── */}
      <div
        data-testid="ficha-yo"
        style={{ background: C.surface, borderBottom: `1px solid ${C.linea}`, padding: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* INICIALES Y NO UN MUÑEQUITO GRIS: un avatar genérico parece una persona que no es. */}
          <span style={{
            width: 56, height: 56, borderRadius: 28, background: C.posFondo, color: C.pos,
            fontSize: 18, fontWeight: 600, display: 'flex', alignItems: 'center',
            justifyContent: 'center', flexShrink: 0,
          }}>
            {inicialesDe(l?.nombre_completo, user.email)}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {l?.nombre_completo ?? user.email ?? 'sin nombre cargado'}
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {legible(l?.categoria) ?? legible(l?.puesto) ?? 'sin categoría cargada'}
              {cuadrilla.data?.[0]?.cuadrilla ? ` · ${cuadrilla.data[0].cuadrilla}` : ''}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '16px 16px 24px' }}>
        {legajo.error && <AvisoError testid="info-error">{legajo.error}</AvisoError>}

        {/* ── LOS DATOS QUE GOBIERNA LA EMPRESA ─────────────────────────────────────── */}
        <TarjetaLista testid="datos-yo">
          <DatoFicha icono="obra" rotulo="Obra" valor={obra?.nombre ?? null} />
          <DatoFicha
            icono="cuadrilla"
            rotulo="Cuadrilla"
            valor={cuadrilla.data?.[0]?.cuadrilla ?? obra?.cuadrilla ?? null}
            falta="sin cuadrilla asignada"
          />
          <DatoFicha icono="tel" rotulo="Teléfono" valor={l?.telefono ?? null} />
          <DatoFicha icono="id" rotulo="Legajo" valor={l?.legajo ?? null} />
          <DatoFicha
            icono="fecha"
            rotulo="Ingreso"
            valor={l?.fecha_ingreso ? `${l.fecha_ingreso.slice(8, 10)}/${l.fecha_ingreso.slice(5, 7)}/${l.fecha_ingreso.slice(0, 4)}` : null}
          />
        </TarjetaLista>

        {/* ── ESTE MES ─────────────────────────────────────────────────────────────── */}
        <RotuloSeccion icono="reloj" margenArriba={18}>Este mes · {mesLargo(hoy)}</RotuloSeccion>
        <div style={{ display: 'flex', gap: 10, marginTop: 9 }} data-testid="mi-mes">
          <Cifra rotulo="HORAS" valor={horas.data ? hh.toFixed(2).replace('.', ',') : '—'} testid="azulejo-horas" />
          <Cifra rotulo="JORNADAS" valor={asistencia.data ? String(jornadas) : '—'} testid="azulejo-jornadas" />
          {/* AUSENCIAS: «—» y NUNCA 0. El OS no tiene fuente de ausencias justificadas todavía; un 0
              afirmaría que no faltó nunca, sobre su propio legajo y sin verificarlo. */}
          <Cifra rotulo="AUSENCIAS" valor="—" nota="sin fuente" testid="azulejo-ausencias" />
        </div>

        {/* ── LOS ACCESOS ──────────────────────────────────────────────────────────── */}
        <div style={{ marginTop: 20 }}>
          <TarjetaLista testid="lista-mi-informacion">
            <Acceso
              href="/mi-informacion/documentos"
              icono="doc"
              titulo="Mis papeles"
              detalle={porResolver > 0
                ? `${porResolver === 1 ? '1 papel' : `${porResolver} papeles`} para resolver`
                : `${docs.data?.length ?? 0} en tu legajo`}
              tonoDetalle={porResolver > 0 ? C.warn : C.muted}
              insignia={porResolver > 0 ? String(porResolver) : undefined}
              testid="ir-documentos"
            />
            <Acceso
              href="/mi-informacion/horas"
              icono="reloj"
              titulo="Mis horas"
              detalle={horas.data ? `${mesLargo(hoy)} · ${hh.toFixed(2).replace('.', ',')} HH` : 'no se pudo leer'}
              testid="ir-horas"
            />
            <Acceso
              href="/mi-informacion/asistencia"
              icono="fecha"
              titulo="Asistencia"
              detalle="Fichaje, la semana y los pedidos de corrección"
              testid="ir-asistencia"
            />
            <Acceso
              href="/mi-informacion/recibos"
              icono="recibo"
              titulo="Recibos"
              detalle={recibos.data && recibos.data.length > 0
                ? `${recibos.data.length} recibo${recibos.data.length === 1 ? '' : 's'} en tu legajo`
                : 'todavía no hay recibos cargados'}
              testid="ir-recibos"
            />
            <Acceso
              href="/mi-informacion/legajo"
              icono="id"
              titulo="Mi legajo"
              detalle="Identidad, situación laboral y asignaciones"
              testid="ir-legajo"
            />
            <Acceso
              href="/mi-cuenta"
              icono="candado"
              titulo="Mi perfil"
              detalle="Foto, contacto y contraseña"
              testid="ir-perfil"
            />
          </TarjetaLista>
        </div>

        <Salir />

        <p style={{ marginTop: 16, textAlign: 'center', fontSize: 11, color: C.faint }}>
          Echegaray Business OS · versión de obra
        </p>

        <p style={{ marginTop: 14, fontSize: 11.5, lineHeight: 1.6, color: C.faint }}>
          Los datos de tu ficha los carga la empresa: desde acá se ven, no se editan. Si alguno está
          mal, pedilo por Administración y queda el cambio con quién lo hizo.
        </p>
      </div>
    </>
  )
}

/** «Salir de la aplicación» — el botón de contorno en rojo del pie de M09. */
function Salir() {
  return (
    <form action={logoutAction} style={{ marginTop: 18 }}>
      <button
        type="submit"
        data-testid="logout-button"
        style={{
          width: '100%', minHeight: 52, display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 9, border: `1px solid ${C.linea}`,
          borderRadius: R.control, background: C.surface, color: C.neg,
          fontSize: 14.5, fontWeight: 500, fontFamily: 'inherit', cursor: 'pointer',
        }}
      >
        <Icono nombre="salir" tamano={19} />
        Salir de la aplicación
      </button>
    </form>
  )
}

/** Un renglón de la ficha. La ausencia se escribe con su nombre: un guión no distingue «no tiene»
 *  de «nadie lo cargó». */
function DatoFicha({ icono, rotulo, valor, falta = 'sin cargar' }: {
  icono: NombreIcono
  rotulo: string
  valor: string | null
  falta?: string
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px',
      borderBottom: `1px solid ${C.divisor}`, minHeight: 52,
    }}>
      <span title={rotulo} style={{ display: 'flex', color: C.faint, flexShrink: 0 }}>
        <Icono nombre={icono} tamano={18} />
      </span>
      <span style={{ fontSize: 12.5, color: C.muted, width: 92, flexShrink: 0 }}>{rotulo}</span>
      <span style={{
        fontSize: 13.5, color: valor ? C.ink : C.faint, minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {valor ?? falta}
      </span>
    </div>
  )
}

/** Uno de los tres azulejos de cifra del mes: rótulo en versalitas y el número en mono 19/600. */
function Cifra({ rotulo, valor, nota, testid }: { rotulo: string; valor: string; nota?: string; testid: string }) {
  return (
    <div
      data-testid={testid}
      data-vacio={valor === '—' ? 'si' : undefined}
      style={{
        flex: 1, background: C.surface, border: `1px solid ${C.linea}`, borderRadius: R.tarjeta,
        padding: '12px 10px', minWidth: 0,
      }}
    >
      <div style={{ fontSize: 10.5, color: C.faint, letterSpacing: '.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {rotulo}
      </div>
      <div style={{ ...mono, fontSize: 19, fontWeight: 600, color: valor === '—' ? C.faint : C.ink, marginTop: 3 }}>
        {valor}
      </div>
      {nota && <div style={{ fontSize: 10.5, color: C.faint }}>{nota}</div>}
    </div>
  )
}

/** Una fila de acceso: icono, título, su nota, la insignia amarilla y el chevron. */
function Acceso({ href, icono, titulo, detalle, tonoDetalle = C.muted, insignia, testid }: {
  href: string
  icono: NombreIcono
  titulo: string
  detalle?: string
  tonoDetalle?: string
  insignia?: string
  testid: string
}) {
  return (
    <Link
      href={href}
      data-testid={testid}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: 14,
        borderBottom: `1px solid ${C.divisor}`, minHeight: 56, color: C.ink,
      }}
    >
      <span style={{ display: 'flex', color: insignia ? C.warn : C.muted, flexShrink: 0 }}>
        <Icono nombre={icono} tamano={20} />
      </span>
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: 'block', fontSize: 14, color: C.ink }}>{titulo}</span>
        {detalle && (
          <span style={{ display: 'block', fontSize: 11.5, color: tonoDetalle, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {detalle}
          </span>
        )}
      </span>
      {insignia && (
        <span style={{
          fontSize: 11, fontWeight: 600, color: C.ink, background: C.marca,
          borderRadius: 10, padding: '2px 8px', flexShrink: 0,
        }}>
          {insignia}
        </span>
      )}
      <span style={{ display: 'flex', color: C.tenue, flexShrink: 0 }}><Icono nombre="siguiente" tamano={18} /></span>
    </Link>
  )
}
