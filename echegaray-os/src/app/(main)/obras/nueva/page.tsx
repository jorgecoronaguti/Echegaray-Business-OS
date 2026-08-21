// ALTA DE OBRA EN PASOS — la puerta por la que nace una obra.
//
// ═══ POR QUÉ NO ES UN MODAL ═══
//
// El alta que existía era un `<details>` dentro de la ficha del cliente: un formulario largo, todo o
// nada, que se perdía entero si el administrador se iba a la mitad. Acá cada paso GUARDA. La obra
// existe desde el primer paso —nombre y cliente— y el resto edita esa misma fila, así que cerrar la
// pestaña no pierde nada: se vuelve por `/obras/nueva?obra=<id>` o directamente por la ficha.
//
// Esa puerta vieja NO se retira: `crearObra` desde la ficha del cliente sigue siendo el atajo para
// quien ya tiene todo a mano. Las dos escriben en `obra_canonica` con las mismas reglas.
//
// ═══ EL CHECKLIST VIVE AL COSTADO, NO AL FINAL (Design Handoff V2, §1i) ═══
//
// Estaba sólo en el paso 8. El handoff lo pone como panel derecho PERMANENTE, y el cambio no es de
// composición: mientras se tipea el paso 3 se ve, sin navegar, que Personal y Drive siguen vacíos.
// Un checklist que aparece recién al final llega tarde para lo único que sirve — decidir si vale la
// pena seguir cargando ahora o volver mañana. Y aparece en cuanto la obra existe: antes no hay fila
// que medir, y siete líneas en «pendiente» sobre una obra que todavía no se creó no son un estado,
// son ruido.
//
// ═══ QUÉ NO HACE ═══
//
// No inventa un solo dato. No pone la fecha de inicio en hoy, no elige un jefe de obra, no deja el
// contrato en cero. Lo que el dueño no tipea queda en NULL, y el checklist lo dice con todas las
// letras. Un default cómodo acá se convierte en un desvío calculado contra una ficción tres meses
// después.
//
// ═══ EL ORDEN DEL PEDIDO, CON UNA FUSIÓN DECLARADA ═══
//
// El dueño pidió: Información → Cliente → Responsable → Fechas → Contrato → Drive → Equipo →
// Cronograma → Confirmar. «Información» y «Cliente» van en un solo paso porque juntos son el mínimo
// con el que la fila puede existir; el porqué está escrito en `services/alta.ts`.

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
import { esPasoQueGuarda, resolverPaso, urlPaso } from '@/features/obras/services/alta'
import {
  CampoDrive, CampoJefeObra, CampoMontoContratado, CampoNombre, CamposFechasPlan, CampoUbicacion,
} from '@/features/obras/components/CamposObra'
import { BarraDePasos, LinkPaso, Paso } from '@/features/obras/components/PasosAlta'
import { ChecklistPreparacion } from '@/features/obras/components/ChecklistPreparacion'
import { Aviso, BotonEnlace, CAMPO, Campo, Nulo, Volver } from '@/shared/components/ds'
import { FormAccion, PageShell } from '@/shared/components/ui'

export const dynamic = 'force-dynamic'

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
  // El monto contratado es PRECIO, no operación: desde la 5000 sólo `ve_economia()` puede fijarlo
  // (`fijar_monto_contratado`). Sin esto el paso «contrato» le pediría al jefe de obra un número que
  // la base le va a rechazar.
  const veContrato = veEconomia(perfil.data?.rol ?? null)
  if (!esAdmin) {
    return (
      <PageShell eyebrow={<Volver href="/obras">Obras</Volver>} title="Nueva obra">
        <Aviso tono="warn">
          Las obras las da de alta Administración. Si necesitás una obra nueva, pedila y aparece en tu portafolio.
        </Aviso>
      </PageShell>
    )
  }

  const { data: obra, error } = obraParam
    ? await getObra(supabase, obraParam)
    : { data: null, error: null }
  const obraId = obra?.obra_id ?? null
  const paso = resolverPaso(pasoParam, Boolean(obraId))

  // Cada paso pide SÓLO lo suyo: el alta se abre desde una oficina y desde un teléfono, y ocho
  // consultas para pintar un campo de texto es ocho consultas para nadie.
  const clientes = paso === 'informacion' && !obraId ? (await getClientes(supabase)).data ?? [] : []
  const ubicacion = paso === 'informacion' && obraId ? await getUbicacion(supabase, obraId) : null
  const personas = paso === 'equipo' && obraId ? (await getPersonas(supabase)).data ?? [] : []
  const asignaciones = paso === 'equipo' && obraId ? (await getAsignaciones(supabase, obraId)).data ?? [] : []
  const actividades = paso === 'cronograma' && obraId ? (await getActividades(supabase, obraId)).data ?? [] : []
  const vivas = actividades.filter((a) => !a.archivada)

  return (
    <PageShell
      eyebrow={<Volver href={obraId ? `/obras/${obraId}` : '/obras'}>{obraId ? obra?.nombre : 'Obras'}</Volver>}
      title={obra ? obra.nombre : 'Nueva obra'}
      subtitle={obra
        ? 'La obra ya está guardada. Cada paso escribe sobre ella: podés salir y volver cuando quieras.'
        : 'Nombre y cliente crean la obra. Todo lo demás se puede cargar después, y el panel de al lado dice qué falta.'}
    >
      {error && <Aviso tono="neg">No pude leer la obra: {error}</Aviso>}
      {obraParam && !obra && !error && (
        <Aviso tono="warn">No existe la obra «{obraParam}». <Link className="underline" href="/obras/nueva">Empezar una nueva</Link>.</Aviso>
      )}

      <BarraDePasos obraId={obraId} actual={paso} />

      <div className="flex flex-wrap items-start gap-x-12 gap-y-10">
        {/* ── 1 · INFORMACIÓN Y CLIENTE ─────────────────────────────────────── */}
        {paso === 'informacion' && !obraId && (
          <Paso paso="informacion">
            <FormAccion accion={crearBorradorObra} testid="form-alta-obra" enviar="Crear la obra y seguir">
              <div className="grid grid-cols-2 gap-3">
                <CampoNombre />
                <Campo rotulo="Cliente" className="col-span-2" ayuda="La obra cuelga del cliente: es la jerarquía del módulo.">
                  <select name="cliente_id" required defaultValue="" className={CAMPO}>
                    <option value="" disabled>elegí un cliente</option>
                    {clientes.filter((c) => c.activo).map((c) => (
                      <option key={c.cliente_id} value={c.cliente_id}>{c.nombre_comercial}</option>
                    ))}
                  </select>
                </Campo>
                <CampoUbicacion />
              </div>
            </FormAccion>
          </Paso>
        )}

        {/* Volver al paso 1 con la obra ya creada NO reabre el formulario: el identificador de la obra
            sale del nombre y ya quedó fijo en la URL, en los vínculos y en las imputaciones. Renombrar
            es una edición de la ficha, no un paso del alta. */}
        {paso === 'informacion' && obraId && obra && (
          <Paso
            paso="informacion"
            pie={<LinkPaso obraId={obraId} paso="responsable" testid="seguir-responsable" fuerte>Siguiente</LinkPaso>}
          >
            <dl className="border-t border-line text-[13px]">
              {([
                ['Nombre', obra.nombre],
                ['Identificador', obraId],
                ['Cliente', obra.cliente_nombre],
                ['Ubicación', ubicacion],
              ] as const).map(([k, v]) => (
                <div key={k} className="flex h-10 items-center justify-between gap-3 border-b border-[#EFEEEA]">
                  <dt className="text-muted">{k}</dt>
                  {/* LA AUSENCIA SE ESCRIBE. Un «—» acá se lee igual que un dato corto y hace que
                      una obra sin ubicación cargada parezca una obra con la ubicación puesta. */}
                  <dd className="min-w-0 truncate text-ink">{v ?? <Nulo>sin cargar</Nulo>}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[12px] text-faint">
              El nombre y la ubicación se editan desde <Link className="underline" href={`/obras/${obraId}?vista=resumen`}>la ficha de la obra</Link>.
            </p>
          </Paso>
        )}

        {/* ── 2 a 5 · LOS PASOS QUE ESCRIBEN UNA COLUMNA ────────────────────── */}
        {obraId && obra && esPasoQueGuarda(paso) && (
          <Paso
            paso={paso}
            pie={<>
              <LinkPaso obraId={obraId} paso="informacion" testid="volver-informacion">Volver al principio</LinkPaso>
              <Link
                href={urlPaso(obraId, paso === 'responsable' ? 'fechas' : paso === 'fechas' ? 'contrato' : paso === 'contrato' ? 'drive' : 'equipo')}
                data-testid={`saltar-${paso}`}
                className="text-muted underline underline-offset-2 transition-colors hover:text-ink"
              >Saltar este paso</Link>
            </>}
          >
            <FormAccion
              accion={guardarPasoObra.bind(null, obraId, paso)}
              testid={`form-paso-${paso}`}
              enviar="Guardar y seguir"
            >
              <div className="grid grid-cols-2 gap-3">
                {paso === 'responsable' && <CampoJefeObra valor={obra.jefe_obra} />}
                {paso === 'fechas' && <CamposFechasPlan inicio={obra.fecha_inicio_plan} fin={obra.fecha_fin_plan} />}
                {paso === 'contrato' && veContrato && <CampoMontoContratado valor={obra.monto_contratado} />}
                {paso === 'drive' && <CampoDrive valor={obra.drive_carpeta_id} />}
              </div>
            </FormAccion>
          </Paso>
        )}

        {/* ── 6 · EQUIPO ────────────────────────────────────────────────────── */}
        {paso === 'equipo' && obraId && (
          <Paso
            paso="equipo"
            pie={<LinkPaso obraId={obraId} paso="cronograma" testid="seguir-cronograma" fuerte>Siguiente</LinkPaso>}
          >
            <p className="mb-4 text-[13px] text-ink" data-testid="equipo-cuenta">
              {asignaciones.length === 0
                ? 'Todavía no hay nadie asignado.'
                : `${asignaciones.length} ${asignaciones.length === 1 ? 'persona asignada' : 'personas asignadas'}: ${asignaciones.map((a) => a.persona_nombre ?? 'sin persona').join(', ')}`}
            </p>
            {/* MISMA acción que la solapa Personal de la obra: acá cambia el formulario, no la regla.
                Duplicar la escritura sería duplicar el índice único, el mensaje de error y la RLS. */}
            <FormAccion accion={asignarPersona.bind(null, obraId)} testid="form-alta-equipo" enviar="Asignar" limpiarAlOk mensajeOk="Asignada.">
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Persona" className="col-span-2">
                  <select name="persona_id" required defaultValue="" className={CAMPO}>
                    <option value="" disabled>elegí del plantel</option>
                    {personas.map((p) => <option key={p.id} value={p.id}>{p.nombre_completo}</option>)}
                  </select>
                </Campo>
                <Campo rotulo="Rol">
                  <select name="rol" defaultValue="integrante" className={CAMPO}>
                    <option value="integrante">integrante</option>
                    <option value="responsable">responsable</option>
                  </select>
                </Campo>
                <Campo rotulo="Cuadrilla"><input name="cuadrilla" maxLength={80} className={CAMPO} /></Campo>
              </div>
            </FormAccion>
          </Paso>
        )}

        {/* ── 7 · CRONOGRAMA ────────────────────────────────────────────────── */}
        {paso === 'cronograma' && obraId && (
          <Paso
            paso="cronograma"
            pie={<>
              <LinkPaso obraId={obraId} paso="confirmar" testid="seguir-confirmar" fuerte>Siguiente</LinkPaso>
              <Link href={`/obras/${obraId}?vista=cronograma`} className="text-muted underline underline-offset-2 transition-colors hover:text-ink">
                Abrir el cronograma completo
              </Link>
            </>}
          >
            <p className="mb-4 text-[13px] text-ink" data-testid="cronograma-cuenta">
              {vivas.length === 0
                ? 'Todavía no hay ninguna actividad.'
                : `${vivas.length} ${vivas.length === 1 ? 'actividad cargada' : 'actividades cargadas'}.`}
            </p>
            <FormAccion accion={crearActividad.bind(null, obraId)} testid="form-alta-actividad" enviar="Agregar actividad" limpiarAlOk mensajeOk="Actividad agregada.">
              <div className="grid grid-cols-2 gap-3">
                <Campo rotulo="Actividad" className="col-span-2">
                  <input name="nombre" required minLength={2} maxLength={200} className={CAMPO} />
                </Campo>
                <Campo rotulo="Sección" className="col-span-2" ayuda="Opcional. Agrupa las actividades del cronograma.">
                  <input name="seccion" maxLength={120} className={CAMPO} />
                </Campo>
                <Campo rotulo="Inicio previsto"><input type="date" name="inicio_plan" className={CAMPO} /></Campo>
                <Campo rotulo="Fin previsto"><input type="date" name="fin_plan" className={CAMPO} /></Campo>
                <Campo rotulo="HH plan" className="col-span-2" ayuda="Vacío = sin cargar. Sin HH plan no hay desvío de HH que medir.">
                  <input type="number" name="hh_plan" min={0} step="0.5" className={CAMPO} />
                </Campo>
              </div>
            </FormAccion>
          </Paso>
        )}

        {/* ── 8 · CONFIRMAR ─────────────────────────────────────────────────── */}
        {paso === 'confirmar' && obraId && (
          <Paso
            paso="confirmar"
            pie={<BotonEnlace href={`/obras/${obraId}`} variante="primaria" data-testid="ir-a-la-obra">Ir a la obra</BotonEnlace>}
          >
            {/* EL CHECKLIST NO SE REPITE ACÁ: es el panel de la derecha, el mismo que acompañó los
                siete pasos anteriores. Dos copias de la misma lista en la misma pantalla son dos
                lugares donde puede decir cosas distintas. */}
            <p className="text-[13px] text-ink">
              La obra ya existe y está en la cartera. Lo que falte lo dice el panel de al lado, línea
              por línea y con el número concreto: nada de esto bloquea nada.
            </p>
          </Paso>
        )}

        {/* ── EL PANEL DE PREPARACIÓN ───────────────────────────────────────── */}
        {obraId && (
          <aside className="min-w-[320px] flex-1 basis-[360px]">
            {/* El MISMO componente que la solapa Resumen, con la MISMA lectura. Si acá se calculara
                aparte, el alta podría despedirse diciendo «todo listo» sobre una obra que el Resumen
                muestra a medio preparar. */}
            <ChecklistPreparacion obraId={obraId} />
            <p className="mt-3 max-w-[520px] text-[11.5px] leading-relaxed text-faint">
              Lo pendiente no bloquea nada: la obra ya existe y está en la cartera. Esta misma lista
              aparece en el Resumen de la obra hasta que no falte nada — no es un tablero, es un
              checklist que se agota.
            </p>
          </aside>
        )}
      </div>
    </PageShell>
  )
}
