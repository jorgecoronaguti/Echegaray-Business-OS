import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioActual, getPerfilActual } from '@/features/auth/services/authService'
import { PantallaEmpleado } from '@/features/empleado/components/ShellEmpleado'
import { C, R, pct } from '@/shared/components/movil/tokens'
import { Icono, type NombreIcono } from '@/shared/components/movil/Iconos'
import {
  AvisoError, PieFijo, RotuloSeccion, TarjetaLista, Vacio, mono,
} from '@/shared/components/movil/Piezas'
import { getMiTarea, getMisImpedimentos } from '@/features/empleado/services/empleadoService'
import { hoyISO } from '@/features/empleado/services/acciones'
import { lecturaDeEstado, lecturaDeFecha, lecturaDeMedicion, dm } from '@/features/empleado/services/tareas'

// M04 · DETALLE DE TAREA — porte literal de `M04 · Detalle tarea.dc.html`.
//
// ═══ LO QUE SE PORTA ═══
//
// El topbar con el nombre de la tarea y su frente, la tarjeta de avance con el porcentaje en 24px,
// la barra de 9px y las dos cantidades enfrentadas, los tres azulejos de acción (Foto · Nota ·
// Problema), «Lo último cargado» y la primaria fija abajo.
//
// ═══ EL CONTADOR − / + QUE GUARDA NO SE CONSTRUYE, Y NO ES COMODIDAD ═══
//
// El mockup pone debajo del avance un contador con atajos que escribe producción. La policy
// `obra_ejecucion_insert` exige `current_rol()` en {direccion, administracion, jefe_obra}: el perfil
// que usa esta pantalla NO puede insertar, y la base lo rechaza con un 42501 para el 100 % de sus
// usuarios. Un contador que parece guardar y rebota es peor que no tenerlo — la pantalla mentiría.
//
// Se agrega, además, que `registrarAvance` recibe el ACUMULADO y `mi_tarea` no lo publica: derivarlo
// de `pct × objetivo` mandaría un acumulado redondeado que la acción convierte en delta, o sea
// avance fabricado por redondeo. El hueco queda declarado, no disimulado con un control apagado.
//
// ═══ NUNCA UNA FILA LLENA DE BOTONES ═══
//
// Al pie va UNA primaria, y sólo la que puede funcionar: avisar un problema, que es lo único que
// este perfil sí escribe (`obra_restriccion_insert` lo permite). Foto y Nota van apagados, con el
// motivo en su `title`.

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
          <AvisoError testid="tarea-error">{t.error}</AvisoError>
        </PantallaEmpleado>
      )
    }
    notFound()
  }

  const tarea = t.data
  const e = lecturaDeEstado(tarea)
  const f = lecturaDeFecha(tarea, hoy)
  const escribe = ESCRIBEN_LA_ACTIVIDAD.includes(perfil.data?.rol ?? '')

  // LOS PASOS SE LEEN DE SU TABLA, no de `mi_tarea`: la vista publica la tarea, no su desglose.
  // `obra_actividad_paso` ya tiene su propia RLS (`ve_obra` sobre la obra de la actividad), así que
  // esto no abre nada: quien no ve la obra recibe cero filas.
  const [impedimentos, notas, papeles, pasos] = await Promise.all([
    getMisImpedimentos(supabase),
    supabase.from('obra_actividad_nota').select('id, texto, creado_en').eq('actividad_id', tarea.id).order('creado_en', { ascending: false }).limit(5),
    supabase.from('obra_documento').select('drive_file_id, nombre, rol').eq('actividad_id', tarea.id),
    tarea.metodo_avance === 'pasos'
      ? supabase.from('obra_actividad_paso').select('id, nombre, orden, hecho_en').eq('actividad_id', tarea.id).order('orden')
      : Promise.resolve({ data: [], error: null }),
  ])

  const mios = (impedimentos.data ?? []).filter((i) => i.actividad_id === tarea.id)
  const listaPasos = (pasos.data ?? []) as { id: string; nombre: string; hecho_en: string | null }[]
  const medida = lecturaDeMedicion(tarea, tarea.metodo_avance === 'pasos'
    ? { total: listaPasos.length, hechos: listaPasos.filter((x) => x.hecho_en).length }
    : null)

  return (
    <PantallaEmpleado
      titulo={tarea.nombre}
      volver={{ href: '/mi-trabajo', label: 'Mi trabajo' }}
      sub={`${tarea.seccion ? `${tarea.seccion} · ` : ''}${tarea.obra ?? 'sin obra'}`}
    >
      {/* EL PROBLEMA PRIMERO: si la tarea está frenada, es lo primero que se ve. */}
      {mios.length > 0 && (
        <div
          data-testid="tarea-frenada"
          style={{
            background: C.negFondo, border: `1px solid ${C.negBorde}`, borderRadius: R.tarjeta,
            padding: 14, display: 'flex', alignItems: 'center', gap: 11, minHeight: 64, marginBottom: 14,
          }}
        >
          <span style={{ display: 'flex', color: C.neg, flexShrink: 0 }}><Icono nombre="bloqueo" tamano={22} /></span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink }}>
              {mios.length === 1 ? 'Frente parado' : `${mios.length} impedimentos abiertos`}
            </div>
            <div style={{ fontSize: 12.5, color: C.muted, marginTop: 1 }}>
              {mios[0].descripcion ?? 'Hay un impedimento abierto.'}
            </div>
          </div>
        </div>
      )}

      {/* ═══ LA TARJETA DE AVANCE (M04) ═══
          La nota del mockup: «Muestra en cuánto queda el frente, no cómo se calcula».
          SIN LAS DOS PUNTAS NO SE DIBUJAN CANTIDADES: sin objetivo, «0,00 m² hechos» diría que no se
          hizo nada; sin porcentaje, el objetivo entero diría lo mismo al revés. */}
      <div
        data-testid="tarjeta-avance"
        style={{ background: C.surface, border: `1px solid ${C.linea}`, borderRadius: R.tarjeta, padding: 16 }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: 12.5, color: C.muted }}>Avance</span>
          <span style={{ ...mono, fontSize: 24, fontWeight: 600, color: tarea.pct == null ? C.faint : C.ink }}>
            {tarea.pct == null ? 'sin medir' : pct(tarea.pct)}
          </span>
        </div>
        <div style={{ height: 9, background: C.pista, borderRadius: 5, marginTop: 8, overflow: 'hidden' }}>
          {tarea.pct != null && (
            <div style={{
              height: '100%', width: `${Math.max(0, Math.min(100, tarea.pct))}%`,
              background: mios.length > 0 ? C.neg : C.info,
            }} />
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 10 }}>
          {'hechas' in medida ? (
            <>
              <span style={{ ...mono, fontSize: 12.5, color: C.muted }}>{medida.hechas}</span>
              <span style={{ ...mono, fontSize: 12.5, color: C.muted }}>{medida.total}</span>
            </>
          ) : (
            <span style={{ ...mono, fontSize: 12.5, color: C.faint }}>{medida.falta}</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 10, fontSize: 12.5, color: C.muted }}>
          <Icono nombre="reloj" tamano={15} />
          {e.texto} · <span style={{ color: f.vencida ? C.neg : C.muted }}>{f.texto}</span>
        </div>
      </div>

      {/* LOS TRES AZULEJOS DE ACCIÓN. Sólo «Problema» tiene destino: los otros dos van apagados con
          el motivo en su `title`, porque un azulejo que no lleva a ningún lado enseña que la
          pantalla miente. */}
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }} data-testid="acciones-tarea">
        <AzulejoAccion
          icono="foto" texto="Foto" testid="accion-foto"
          motivo="La foto viaja como enlace de Drive al registrar el avance: no hay carga de archivo para una tarea"
        />
        <AzulejoAccion
          icono="nota" texto="Nota" testid="accion-nota"
          motivo="Las notas de una actividad las escribe la obra, no este perfil"
        />
        <AzulejoAccion
          icono="alerta" texto="Problema" testid="accion-problema" color={C.warn}
          fondo={C.warnFondo} borde={C.warnBorde}
          href={`/mi-trabajo/reportar?obra=${encodeURIComponent(tarea.obra_id)}&tarea=${tarea.id}`}
        />
      </div>

      {/* ── LOS PASOS, CUANDO LA TAREA SE MIDE ASÍ ──────────────────────────────────────
          El dibujo es el de J06 —círculo de 26px, tildado en `pos`, el nombre apagado cuando está
          hecho—, porque es el mismo objeto: los pasos de una actividad. Acá van en SÓLO LECTURA y
          eso NO es una simplificación: la policy `obra_ejecucion_insert` exige dirección,
          administración o jefe de obra, así que una casilla que este perfil pueda tocar rebotaría
          con 42501 al firmar el avance. Una casilla que parece marcar y no marca es peor que una
          que no está. Que el empleado de campo pueda firmar producción es una decisión del dueño
          sobre esa policy, no algo que se resuelva en esta pantalla. */}
      {tarea.metodo_avance === 'pasos' && (
        <>
          <RotuloSeccion icono="paso" margenArriba={22}>
            Pasos
          </RotuloSeccion>
          <div style={{ marginTop: 9 }}>
            <TarjetaLista testid="pasos-tarea">
              {listaPasos.length === 0 ? (
                <Vacio>Se mide por pasos y todavía no tiene pasos cargados. Se definen en la planificación.</Vacio>
              ) : listaPasos.map((p) => <Paso key={p.id} nombre={p.nombre} hecho={!!p.hecho_en} />)}
            </TarjetaLista>
          </div>
        </>
      )}

      {/* ── LOS DATOS DE LA TAREA ─────────────────────────────────────────────────────── */}
      <RotuloSeccion icono="doc" margenArriba={22}>Datos</RotuloSeccion>
      <div style={{ marginTop: 9 }}>
        <TarjetaLista testid="datos-tarea">
          <Dato rotulo="Cómo se mide" valor={tarea.metodo_avance ?? (tarea.unidad ? `por ${tarea.unidad}` : null)} falta="no se declaró" />
          <Dato
            rotulo="Plan"
            valor={tarea.inicio_plan || tarea.fin_plan
              ? `${tarea.inicio_plan ? dm(tarea.inicio_plan, hoy) : '—'} a ${tarea.fin_plan ? dm(tarea.fin_plan, hoy) : '—'}`
              : null}
            falta="sin planificar"
          />
          <Dato rotulo="Obra" valor={tarea.obra} />
          <Dato rotulo="Código" valor={tarea.codigo} falta="sin código" />
        </TarjetaLista>
      </div>

      {tarea.comentario && (
        <>
          <RotuloSeccion icono="nota" margenArriba={22}>Indicaciones</RotuloSeccion>
          <p data-testid="indicaciones" style={{ marginTop: 9, fontSize: 13.5, lineHeight: 1.6, color: C.ink }}>
            {tarea.comentario}
          </p>
        </>
      )}

      {/* ── LO ÚLTIMO CARGADO: las notas de la actividad y sus papeles ─────────────────── */}
      <RotuloSeccion icono="historial" margenArriba={22}>Lo último cargado</RotuloSeccion>
      <div style={{ marginTop: 9 }}>
        <TarjetaLista testid="ultimo-cargado">
          {(notas.data ?? []).length === 0 && (papeles.data ?? []).length === 0 ? (
            <Vacio>Todavía no hay notas ni documentos colgados de esta tarea.</Vacio>
          ) : (
            <>
              {(notas.data ?? []).map((n) => (
                <div
                  key={String(n.id)}
                  data-testid="tarea-nota"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: `1px solid ${C.divisor}` }}
                >
                  <span style={{ ...mono, fontSize: 12, color: C.faint, width: 42, flexShrink: 0 }}>
                    {String(n.creado_en).slice(8, 10)}/{String(n.creado_en).slice(5, 7)}
                  </span>
                  <span style={{ fontSize: 13, color: C.ink, minWidth: 0, flex: 1 }}>{String(n.texto)}</span>
                </div>
              ))}
              {(papeles.data ?? []).map((d) => (
                <a
                  key={String(d.drive_file_id)}
                  href={`https://drive.google.com/file/d/${d.drive_file_id}/view`}
                  data-testid="tarea-documento"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderBottom: `1px solid ${C.divisor}`, color: C.ink }}
                >
                  <span style={{ display: 'flex', color: C.muted, flexShrink: 0 }}><Icono nombre="doc" tamano={18} /></span>
                  <span style={{ fontSize: 13.5, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {String(d.nombre ?? 'Documento')}
                  </span>
                  <span style={{ fontSize: 11.5, color: C.faint, flexShrink: 0 }}>{String(d.rol ?? 'sin categoría')}</span>
                </a>
              ))}
            </>
          )}
        </TarjetaLista>
      </div>

      <p data-testid={escribe ? 'ir-a-la-obra' : 'quien-carga-avance'} style={{ marginTop: 14, fontSize: 11.5, lineHeight: 1.6, color: C.faint }}>
        {escribe ? (
          <>
            El avance y el cierre de la actividad se cargan en el parte del día de la obra, que es
            donde imputan las horas.{' '}
            <Link href={`/obras/${tarea.obra_id}`} style={{ color: C.muted, textDecoration: 'underline' }}>Ir a la obra →</Link>
          </>
        ) : (
          <>
            El avance de la actividad lo carga el jefe de obra en el parte del día: tu usuario no
            tiene permiso para escribirlo, y la base lo rechazaría igual. Lo que sí podés hacer es
            reportar lo que está frenando el trabajo.
          </>
        )}
      </p>

      <PieFijo testid="pie-tarea">
        <Link
          href={`/mi-trabajo/reportar?obra=${encodeURIComponent(tarea.obra_id)}&tarea=${tarea.id}`}
          data-testid="reportar-problema"
          style={{
            minHeight: 52, width: '100%', borderRadius: R.control, background: C.marca, color: C.ink,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
            fontSize: 16, fontWeight: 600,
          }}
        >
          <Icono nombre="alerta" tamano={20} />
          Avisar un problema
        </Link>
      </PieFijo>
    </PantallaEmpleado>
  )
}

/** Un paso de la tarea: hecho o pendiente. El círculo y sus 26px salen de J06, que es donde el
 *  jefe los marca — un mismo objeto no se dibuja de dos maneras según quién lo mire. */
function Paso({ nombre, hecho }: { nombre: string; hecho: boolean }) {
  return (
    <div
      data-testid="paso-tarea"
      data-hecho={hecho ? 'si' : 'no'}
      style={{
        display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px',
        borderBottom: `1px solid ${C.divisor}`, minHeight: 52,
        background: hecho ? C.quiet : 'transparent',
      }}
    >
      <span style={{
        width: 26, height: 26, borderRadius: 13, flexShrink: 0,
        border: `2px solid ${hecho ? C.pos : C.lineaFuerte}`, background: hecho ? C.pos : C.surface,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.surface,
      }}>
        {hecho && <Icono nombre="ok" tamano={14} grosor={3} />}
      </span>
      <span style={{
        fontSize: 14, color: hecho ? C.inkSuave : C.ink, minWidth: 0, flex: 1,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {nombre}
      </span>
      <span style={{ fontSize: 12, color: C.faint, flexShrink: 0 }}>{hecho ? 'hecho' : 'pendiente'}</span>
    </div>
  )
}

/** El renglón `rótulo · valor`. La ausencia se escribe con su nombre: un guión no distingue «no
 *  tiene» de «nadie lo cargó». */
function Dato({ rotulo, valor, falta = 'sin cargar' }: { rotulo: string; valor: string | null; falta?: string }) {
  const vacio = valor == null || valor === ''
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 11, padding: '13px 14px',
      borderBottom: `1px solid ${C.divisor}`, minHeight: 52,
    }}>
      <span style={{ fontSize: 12.5, color: C.muted, width: 110, flexShrink: 0 }}>{rotulo}</span>
      <span style={{
        fontSize: 13.5, color: vacio ? C.faint : C.ink, minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {vacio ? falta : valor}
      </span>
    </div>
  )
}

/** Uno de los tres azulejos de acción de M04. Sin `href` queda apagado y su `title` dice por qué. */
function AzulejoAccion({ icono, texto, href, motivo, color = C.muted, fondo = C.surface, borde = C.linea, testid }: {
  icono: NombreIcono
  texto: string
  href?: string
  motivo?: string
  color?: string
  fondo?: string
  borde?: string
  testid: string
}) {
  const estilo = {
    flex: 1, background: fondo, border: `1px solid ${borde}`, borderRadius: R.tarjeta,
    padding: '14px 8px', display: 'flex', flexDirection: 'column' as const, alignItems: 'center',
    gap: 7, minHeight: 86, justifyContent: 'center',
  }
  const cuerpo = (
    <>
      <span style={{ display: 'flex', color: href ? color : C.tenue }}><Icono nombre={icono} tamano={22} /></span>
      <span style={{ fontSize: 12, fontWeight: 500, color: href ? C.ink : C.faint, textAlign: 'center' }}>{texto}</span>
    </>
  )
  return href
    ? <Link href={href} data-testid={testid} style={estilo}>{cuerpo}</Link>
    : <span data-testid={testid} aria-disabled title={motivo} style={{ ...estilo, cursor: 'not-allowed' }}>{cuerpo}</span>
}
