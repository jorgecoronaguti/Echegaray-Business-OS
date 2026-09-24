// ALTA DE OBRA EN PASOS — la puerta por la que nace una obra (diseño ERP Obras 02b / M03).
//
// ═══ POR QUÉ NO ES UN MODAL ═══
//
// Cada paso GUARDA. La obra existe desde el primer paso —nombre y cliente— y el resto edita esa
// misma fila, así que cerrar la pestaña no pierde nada: se vuelve por `/obras/nueva?obra=<id>` o
// directamente por la ficha. La puerta vieja NO se retira: `crearObra` desde la ficha del cliente
// sigue siendo el atajo para quien ya tiene todo a mano.
//
// ═══ EL CHECKLIST VIVE AL COSTADO, NO AL FINAL ═══
//
// Aside de 380px «Estado de preparación · N de M pendientes», en cuanto la obra existe: mientras se
// tipea el paso 3 se ve, sin navegar, que Personal y Drive siguen vacíos.
//
// ═══ QUÉ NO HACE ═══
//
// No inventa un solo dato. No pone la fecha de inicio en hoy, no elige un jefe de obra, no deja el
// contrato en cero. Lo que el dueño no tipea queda en NULL, y el checklist lo dice con todas las
// letras: «Lo pendiente no bloquea: la obra ya está en la cartera, en Previo.»
//
// ═══ EL ORDEN DEL PEDIDO, CON UNA FUSIÓN DECLARADA ═══
//
// Información → Responsable → Fechas → Contrato → Drive → Equipo → Cronograma → Confirmar.
// «Información» y «Cliente» van juntos porque son el mínimo con el que la fila puede existir; el
// porqué está en `services/alta.ts`. LOS `name` DE LOS CAMPOS son contrato con `altaSchema` y
// `ESQUEMA_PASO`: cambiar uno acá sin cambiarlo allá hace que el campo deje de guardarse.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion, veEconomia } from '@/features/auth/types/areas'
import { getClientes } from '@/features/clientes/services/clientesService'
import { getActividades, getObra, getUbicacion } from '@/features/obras/services/obrasService'
import { getAsignaciones, getPersonas } from '@/features/obras/services/personalService'
import { crearActividad } from '@/features/obras/services/actions'
import { asignarPersona } from '@/features/obras/services/actionsPersonal'
import { crearBorradorObra, guardarPasoObra } from '@/features/obras/services/actionsAlta'
import { esPasoQueGuarda, pasoSiguiente, pasosHechos, resolverPaso, subtituloAlta, urlPaso } from '@/features/obras/services/alta'
import {
  BandaDePasos, CabeceraAlta, CampoAlta, CuerpoYAside, EnlacePaso, FormPaso, GrillaCampos, InputAlta, MarcoAlta,
  PrimariaEnlace, SelectAlta, TituloPaso,
} from '@/features/obras/components/PasosAlta'
import { ChecklistPreparacion } from '@/features/obras/components/ChecklistPreparacion'
import { Aviso } from '@/shared/components/ds'
import { C } from '@/features/obras/components/canon/tokens'
import { codigosDeObra } from '@/shared/services/codigosDeObra'
import { rotuloDeObra } from '@/shared/utils/obra'
import { nombreDePersona } from '../../../../shared/personas/nombre.ts'

export const dynamic = 'force-dynamic'

const v = (x: string | number | null | undefined) => (x == null ? '' : String(x))

export default async function NuevaObraPage({
  searchParams,
}: {
  searchParams: Promise<{ obra?: string; paso?: string }>
}) {
  const { obra: obraParam, paso: pasoParam } = await searchParams
  const supabase = await createClient()

  // LA PUERTA. La cerradura es `obra_canonica_write`, que sólo deja escribir a dirección y
  // administración; esto evita que un jefe de obra llene ocho pasos para que la base lo rechace al
  // final. Falla al nivel MENOS privilegiado: sin perfil legible, no se entra.
  const perfil = await getPerfilActual(supabase)
  const esAdmin = esAdministracion(perfil.data?.rol ?? null)
  // El monto contratado es PRECIO: desde la 5000 sólo `ve_economia()` puede fijarlo.
  const veContrato = veEconomia(perfil.data?.rol ?? null)
  if (!esAdmin) {
    return (
      <MarcoAlta conPrimariaFija={false}>
        <CabeceraAlta titulo="Nueva obra" subtitulo="" volverHref="/obras" volverTexto="Obras" />
        <Aviso tono="warn">
          Las obras las da de alta Administración. Si necesitás una obra nueva, pedila y aparece en tu portafolio.
        </Aviso>
      </MarcoAlta>
    )
  }

  const { data: obra, error } = obraParam
    ? await getObra(supabase, obraParam)
    : { data: null, error: null }
  const obraId = obra?.obra_id ?? null
  const paso = resolverPaso(pasoParam, Boolean(obraId))
  // EL CÓDIGO DE LA OBRA (`OB-0008`), leído de `obra_canonica` y no derivado del nombre ni del id.
  const codigo = obraId ? (await codigosDeObra(supabase, [obraId])).get(obraId) ?? null : null
  const rotulo = obra ? rotuloDeObra({ nombre: obra.nombre, codigo }) : null

  // Cada paso pide SÓLO lo suyo; los dos conteos de la banda (equipo, cronograma) son `head` y
  // salen juntos con lo del paso.
  const [clientes, ubicacion, personas, asignaciones, actividades, nAsignadas, nActividades] = await Promise.all([
    paso === 'informacion' && !obraId ? getClientes(supabase).then((r) => r.data ?? []) : [],
    paso === 'informacion' && obraId ? getUbicacion(supabase, obraId) : null,
    paso === 'equipo' && obraId ? getPersonas(supabase).then((r) => r.data ?? []) : [],
    paso === 'equipo' && obraId ? getAsignaciones(supabase, obraId).then((r) => r.data ?? []) : [],
    paso === 'cronograma' && obraId ? getActividades(supabase, obraId).then((r) => r.data ?? []) : [],
    obraId ? supabase.from('obra_asignacion').select('id', { count: 'exact', head: true }).eq('obra_id', obraId).then((r) => r.count ?? 0) : 0,
    obraId ? supabase.from('obra_actividad').select('id', { count: 'exact', head: true }).eq('obra_id', obraId).eq('archivada', false).then((r) => r.count ?? 0) : 0,
  ])
  const vivas = actividades.filter((a) => !a.archivada)
  const hechos = pasosHechos(obra ? {
    jefe_obra: obra.jefe_obra, fecha_inicio_plan: obra.fecha_inicio_plan, fecha_fin_plan: obra.fecha_fin_plan,
    monto_contratado: veContrato ? obra.monto_contratado : undefined, drive_carpeta_id: obra.drive_carpeta_id,
    personasAsignadas: nAsignadas, actividades: nActividades,
  } : null)

  const siguiente = pasoSiguiente(paso)
  const enlaces = obraId && (
    <>
      {siguiente && paso !== 'confirmar' && (
        <EnlacePaso href={urlPaso(obraId, siguiente)} testid={`saltar-${paso}`}>Saltar este paso</EnlacePaso>
      )}
      {paso !== 'informacion' && (
        <EnlacePaso href={urlPaso(obraId, 'informacion')} testid="volver-informacion">Volver al principio</EnlacePaso>
      )}
    </>
  )
  return (
    <MarcoAlta conPrimariaFija>
      <CabeceraAlta
        titulo={rotulo ?? 'Nueva obra'}
        subtitulo={subtituloAlta(Boolean(obra))}
        volverHref={obraId ? `/obras/${obraId}` : '/obras'}
        volverTexto="Obras"
      />
      {error && <Aviso tono="neg">No pude leer la obra: {error}</Aviso>}
      {obraParam && !obra && !error && (
        <Aviso tono="warn">No existe la obra «{obraParam}». <Link className="underline" href="/obras/nueva" prefetch={false}>Empezar una nueva</Link>.</Aviso>
      )}

      <BandaDePasos obraId={obraId} actual={paso} hechos={hechos} />

      <CuerpoYAside
        cuerpo={<>
          <TituloPaso paso={paso} />

          {/* ── 1 · INFORMACIÓN Y CLIENTE ───────────────────────────────────── */}
          {paso === 'informacion' && !obraId && (
            <FormPaso accion={crearBorradorObra} testid="form-alta-obra" enviar="Crear la obra y seguir">
              <GrillaCampos>
                <CampoAlta rotulo="Nombre de la obra"><InputAlta name="nombre" required minLength={2} maxLength={120} /></CampoAlta>
                <CampoAlta rotulo="Cliente">
                  <SelectAlta name="cliente_id" required defaultValue="">
                    <option value="" disabled>elegí un cliente</option>
                    {clientes.filter((c) => c.activo).map((c) => (
                      <option key={c.cliente_id} value={c.cliente_id}>{c.nombre_comercial}</option>
                    ))}
                  </SelectAlta>
                </CampoAlta>
                <CampoAlta rotulo="Ubicación"><InputAlta name="ubicacion" maxLength={200} placeholder="dónde queda" /></CampoAlta>
              </GrillaCampos>
            </FormPaso>
          )}

          {/* Volver al paso 1 con la obra ya creada NO reabre el formulario: el identificador sale del
              nombre y ya quedó fijo en la URL. Renombrar es una edición de la ficha, no un paso del alta. */}
          {paso === 'informacion' && obraId && obra && (
            <>
              <GrillaCampos>
                <CampoAlta rotulo="Nombre de la obra"><InputAlta readOnly value={obra.nombre} /></CampoAlta>
                <CampoAlta rotulo="Código" mono><InputAlta readOnly value={v(codigo)} /></CampoAlta>
                <CampoAlta rotulo="Cliente"><InputAlta readOnly value={v(obra.cliente_nombre)} /></CampoAlta>
                <CampoAlta rotulo="Ubicación"><InputAlta readOnly value={v(ubicacion)} /></CampoAlta>
              </GrillaCampos>
              <p style={{ fontSize: '12px', color: C.tenue, margin: 0 }}>
                El nombre y la ubicación se editan desde <Link className="underline" href={`/obras/${obraId}?vista=resumen`} prefetch={false}>la ficha de la obra</Link>.
              </p>
              <PrimariaEnlace href={urlPaso(obraId, 'responsable')} testid="seguir-responsable">Guardar y seguir</PrimariaEnlace>
            </>
          )}

          {/* ── 2 a 5 · LOS PASOS QUE ESCRIBEN UNA COLUMNA ──────────────────── */}
          {obraId && obra && esPasoQueGuarda(paso) && (
            <FormPaso accion={guardarPasoObra.bind(null, obraId, paso)} testid={`form-paso-${paso}`} enlaces={enlaces}>
              <GrillaCampos>
                {paso === 'responsable' && (
                  <CampoAlta rotulo="Jefe de obra"><InputAlta name="jefe_obra" defaultValue={v(obra.jefe_obra)} maxLength={120} /></CampoAlta>
                )}
                {paso === 'fechas' && (
                  <>
                    <CampoAlta rotulo="Inicio previsto" mono><InputAlta type="date" name="fecha_inicio_plan" defaultValue={v(obra.fecha_inicio_plan)} /></CampoAlta>
                    <CampoAlta rotulo="Fin previsto" mono><InputAlta type="date" name="fecha_fin_plan" defaultValue={v(obra.fecha_fin_plan)} /></CampoAlta>
                  </>
                )}
                {/* `veEconomia` decide si el campo EXISTE: la clave ausente no es un vacío (ver `actionsAlta`). */}
                {paso === 'contrato' && veContrato && (
                  <CampoAlta rotulo="Monto contratado ($)" mono>
                    <InputAlta type="number" name="monto_contratado" min={0} step="0.01" defaultValue={v(obra.monto_contratado)} />
                  </CampoAlta>
                )}
                {paso === 'drive' && (
                  <CampoAlta rotulo="Carpeta de Drive (id)"><InputAlta name="drive_carpeta_id" defaultValue={v(obra.drive_carpeta_id)} maxLength={80} /></CampoAlta>
                )}
              </GrillaCampos>
            </FormPaso>
          )}

          {/* ── 6 · EQUIPO ──────────────────────────────────────────────────── */}
          {paso === 'equipo' && obraId && (
            <>
              <p style={{ fontSize: '13px', margin: 0 }} data-testid="equipo-cuenta">
                {asignaciones.length === 0
                  ? 'Todavía no hay nadie asignado.'
                  : `${asignaciones.length} ${asignaciones.length === 1 ? 'persona asignada' : 'personas asignadas'}: ${asignaciones.map((a) => a.persona_nombre ?? 'sin persona').join(', ')}`}
              </p>
              {/* MISMA acción que la solapa Personal de la obra: acá cambia el formulario, no la regla. */}
              <FormPaso accion={asignarPersona.bind(null, obraId)} testid="form-alta-equipo" enviar="Asignar" limpiarAlOk mensajeOk="Asignada." enlaces={enlaces}>
                <GrillaCampos>
                  <CampoAlta rotulo="Persona">
                    <SelectAlta name="persona_id" required defaultValue="">
                      <option value="" disabled>elegí del plantel</option>
                      {personas.map((p) => <option key={p.id} value={p.id}>{nombreDePersona(p)}</option>)}
                    </SelectAlta>
                  </CampoAlta>
                  <CampoAlta rotulo="Rol">
                    <SelectAlta name="rol" defaultValue="integrante">
                      <option value="integrante">integrante</option>
                      <option value="responsable">responsable</option>
                    </SelectAlta>
                  </CampoAlta>
                  <CampoAlta rotulo="Cuadrilla"><InputAlta name="cuadrilla" maxLength={80} /></CampoAlta>
                </GrillaCampos>
              </FormPaso>
            </>
          )}

          {/* ── 7 · CRONOGRAMA ──────────────────────────────────────────────── */}
          {paso === 'cronograma' && obraId && (
            <>
              <p style={{ fontSize: '13px', margin: 0 }} data-testid="cronograma-cuenta">
                {vivas.length === 0
                  ? 'Todavía no hay ninguna actividad.'
                  : `${vivas.length} ${vivas.length === 1 ? 'actividad cargada' : 'actividades cargadas'}.`}
                {' '}<Link className="underline" href={`/obras/${obraId}?vista=cronograma`} prefetch={false}>Abrir el cronograma completo</Link>.
              </p>
              <FormPaso accion={crearActividad.bind(null, obraId)} testid="form-alta-actividad" enviar="Agregar actividad" limpiarAlOk mensajeOk="Actividad agregada." enlaces={enlaces}>
                <GrillaCampos>
                  <CampoAlta rotulo="Actividad"><InputAlta name="nombre" required minLength={2} maxLength={200} placeholder="" /></CampoAlta>
                  <CampoAlta rotulo="Sección"><InputAlta name="seccion" maxLength={120} placeholder="opcional" /></CampoAlta>
                  <CampoAlta rotulo="Inicio previsto" mono><InputAlta type="date" name="inicio_plan" /></CampoAlta>
                  <CampoAlta rotulo="Fin previsto" mono><InputAlta type="date" name="fin_plan" /></CampoAlta>
                  <CampoAlta rotulo="HH plan" mono><InputAlta type="number" name="hh_plan" min={0} step="0.5" /></CampoAlta>
                </GrillaCampos>
              </FormPaso>
            </>
          )}

          {/* ── 8 · CONFIRMAR ───────────────────────────────────────────────── */}
          {paso === 'confirmar' && obraId && (
            <>
              <p style={{ fontSize: '13px', margin: 0 }}>
                La obra ya existe y está en la cartera. Lo que falte lo dice el panel de al lado, y nada de eso la bloquea.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                <PrimariaEnlace href={`/obras/${obraId}`} testid="ir-a-la-obra">Ir a la obra</PrimariaEnlace>
                {enlaces}
              </div>
            </>
          )}
        </>}
        aside={obraId && (
          // El MISMO componente que la solapa Resumen, con la MISMA lectura. Si acá se calculara
          // aparte, el alta podría despedirse diciendo «todo listo» sobre una obra a medio preparar.
          <ChecklistPreparacion obraId={obraId} />
        )}
      />
    </MarcoAlta>
  )
}
