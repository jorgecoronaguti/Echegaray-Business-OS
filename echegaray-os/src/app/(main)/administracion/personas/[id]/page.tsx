// EL LEGAJO DE UNA PERSONA — ficha de entidad con seis solapas.
//
// ═══ POR QUÉ NO ESTÁ TODO A LA VISTA ═══
//
// El dueño: *"NO mostrar toda la información simultáneamente en 15 cards."* La ficha tiene
// identidad, relación laboral, historial de asignaciones, horas, documentos, la cuenta con la que
// entra y la bitácora de cambios: junto es una pared. Separado, cada pregunta tiene su solapa y el
// Resumen contesta las tres que se hacen todos los días —quién es, qué categoría cobra, dónde está—.
//
// ═══ DOS SOLAPAS QUE NO SON COMO LAS OTRAS ═══
//
// «Usuario y permisos» y «Auditoría» no describen a la PERSONA: describen su CUENTA y lo que se le
// hizo a su ficha. Por eso cada una tiene su propio control de acceso, distinto del de la pantalla:
//
//   Usuario y permisos   `veLaCuentaDeOtro` = `ve_economia()`, el MISMO predicado que cierra
//                        `/administracion/usuarios`. Sin esto, la ficha sería el camino largo hasta
//                        la pantalla que la lista negra le cierra al jefe de obra.
//   Auditoría            `es_administracion()`, que es lo que la RLS de `entidad_cambio` ya exige.
//                        Por eso la retribución llega tapada desde la base: el jefe de obra entra.
//
// Y CADA SOLAPA PIDE SÓLO LO SUYO: el Resumen se abre muchas veces por día y no necesita el
// historial de horas para decir quién es esta persona.
//
// ═══ Y POR QUÉ SE EDITA EN UN PANEL ═══
//
// *"Priorizar click sobre entidad/campo → panel lateral. Nada de páginas de formulario gigantes para
// cambios simples."* Corregir un teléfono no puede costar abrir una pantalla con veinte campos. El
// panel viaja en la URL (`?editar=identidad`), así que se comparte, se recarga y se cierra con el
// botón de atrás.
//
// LA RETRIBUCIÓN NO ESTÁ, y no por diseño de esta pantalla: `persona_legajo` —la única puerta por
// la que Administración llega a los campos sensibles— no publica `retribucion_pactada`. Dibujar el
// renglón en «sin cargar» diría que nadie la cargó, cuando lo que pasa es que la vista no la deja
// pasar. Se declara en el informe de este bloque.

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BotonAccion, PageShell } from '@/shared/components/ui'
import { Aviso, EntityHeader, Estado, Eyebrow, Nulo, Vacio } from '@/shared/components/ds'
import { getPerfilActual, getUsuarioActual } from '@/features/auth/services/authService'
import { BloqueAsignacion, BloqueDocumentos, BloqueHoras } from '@/features/administracion/components/BloquesFicha'
import { BloqueAuditoria } from '@/features/administracion/components/BloqueAuditoria'
import { BloqueUsuario } from '@/features/administracion/components/BloqueUsuario'
import { CamposIdentidad, CamposLaboral } from '@/features/administracion/components/FormularioPersona'
import { AltaDocumento, Bloque, Dato } from '@/features/administracion/components/FichaPartes'
import { NavFicha, VISTAS_FICHA, type VistaFicha } from '@/features/administracion/components/NavFicha'
import { PanelEdicion } from '@/features/administracion/components/PanelEdicion'
import { getAsignacionesDe, getDocumentos, getPersona } from '@/features/administracion/services/personasService'
import { veLaCuentaDeOtro } from '@/features/administracion/services/accesoPersona'
import { getCuentaDePersona } from '@/features/administracion/services/accesoService'
import { getBitacora, TRAMO } from '@/features/administracion/services/auditoriaService'
import { getHHDePersona, resumenDelPeriodo } from '@/features/administracion/services/hhPersonaService'
import { esPeriodo, rotulo, ventanaDe, type Periodo } from '@/features/administracion/services/periodoHH'
import { darDeBaja, editarPersona, reincorporar, type GrupoEdicion } from '@/features/administracion/services/personasActions'
import { cerrarAsignacionDePersona } from '@/features/administracion/services/asignacionActions'
import { desvincularDocumento, vincularDocumento } from '@/features/administracion/services/documentosActions'
import { formatearCuit, formatearDni } from '@/features/administracion/services/identidad'
import { etiquetaCategoria } from '@/features/administracion/types'
import { fecha } from '@/features/obras/components/formato'

export const dynamic = 'force-dynamic'

type Busqueda = { v?: string; editar?: string; p?: string; n?: string }

/** Cuántos cambios de la bitácora se piden. El «ver más» viaja en la URL, no en un estado de cliente. */
function cuantosCambios(n: string | undefined): number {
  const pedidos = Number(n)
  // UN TOPE, Y NO POR PRUDENCIA: `?n=` viene del navegador. Sin techo, cualquiera con sesión pide
  // la bitácora entera de una persona en una sola consulta y la pantalla tarda lo que tarde.
  if (!Number.isInteger(pedidos) || pedidos <= 0) return TRAMO
  return Math.min(pedidos, TRAMO * 20)
}

// EL PERÍODO LO ELIGE QUIEN MIRA. Antes era una ventana fija de 30 días, que no coincide con NINGUNA
// liquidación: el dueño pidió *"día · semana · quincena · mes"*, y la quincena es la de la empresa
// —1 al 15 y 16 a fin de mes—. Ver `services/periodoHH.ts`, donde se calcula sin depender del reloj.
const PERIODO_POR_DEFECTO: Periodo = 'quincena'

export default async function FichaPersonaPage({
  params, searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Busqueda>
}) {
  const { id } = await params
  // Un segmento que no es UUID (una URL mal tipeada como /personas/asistencia) caía en la consulta
  // y la pantalla mostraba el error crudo de Postgres («invalid input syntax for type uuid»).
  // El 404 amable ya existe: usarlo. (QA visual, 21/08/2026)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound()
  const sp = await searchParams
  const vista = (VISTAS_FICHA.find((v) => v === sp.v) ?? 'resumen') as VistaFicha
  const editar = sp.editar === 'identidad' || sp.editar === 'laboral' ? (sp.editar as GrupoEdicion) : null
  const base = `/administracion/personas/${id}`
  const href = (v: VistaFicha, e?: GrupoEdicion) =>
    `${base}${v === 'resumen' && !e ? '' : `?${new URLSearchParams({ ...(v !== 'resumen' ? { v } : {}), ...(e ? { editar: e } : {}) })}`}`

  const supabase = await createClient()
  // EL ROL DEL QUE MIRA se necesita en TODAS las vistas, no sólo en la de la cuenta: `NavFicha`
  // decide con él si dibuja la solapa, y una barra que cambia de largo al moverse entre solapas es
  // un defecto visual. El id del actor viaja a `getPerfilActual` para no repetir el `getUser()`.
  const [{ data: persona, error }, actor] = await Promise.all([
    getPersona(supabase, id),
    getUsuarioActual(supabase),
  ])
  const rolActor = (await getPerfilActual(supabase, actor?.id)).data?.rol ?? null
  const veLaCuenta = veLaCuentaDeOtro(rolActor)
  // NO EXISTE y NO PUEDO LEER son dos cosas distintas: confundirlas manda a buscar un defecto de
  // permisos detrás de un 404, que ya costó media jornada en este repo.
  if (error) {
    return (
      <PageShell title="No pude leer el legajo">
        <div data-testid="ficha-error"><Aviso tono="neg">{error}</Aviso></div>
      </PageShell>
    )
  }
  if (!persona) notFound()

  const asignaciones = vista === 'resumen' || vista === 'asignaciones'
    ? await getAsignacionesDe(supabase, id) : null
  const horas = vista === 'horas' ? await getHHDePersona(supabase, id) : null
  const documentos = vista === 'documentos' ? await getDocumentos(supabase, id) : null
  // LA CUENTA NO SE LEE SI EL QUE MIRA NO PUEDE VERLA. Esconder la solapa y leer igual dejaría los
  // datos en el HTML de la página para el que sepa mirar la respuesta del servidor.
  const cuenta = vista === 'usuario' && veLaCuenta ? await getCuentaDePersona(supabase, id) : null
  const cuantos = cuantosCambios(sp.n)
  const bitacora = vista === 'auditoria' ? await getBitacora(supabase, 'personas', id, cuantos) : null

  const vigente = (asignaciones?.data ?? []).find((a) => !a.hasta) ?? null
  const cerradas = (asignaciones?.data ?? []).filter((a) => a.hasta)
  const egresada = !persona.en_la_empresa
  const filasHH = horas?.data ?? []
  const periodo = esPeriodo(sp.p) ? sp.p : PERIODO_POR_DEFECTO
  // EL DÍA SE FIJA EN EL SERVIDOR: calcularlo en el cliente daría una quincena distinta alrededor
  // de la medianoche según desde dónde se mire.
  const ventana = ventanaDe(periodo, new Date().toISOString().slice(0, 10))
  const resumen = resumenDelPeriodo(filasHH, ventana.desde, ventana.hasta)
  const fallo = asignaciones?.error ?? horas?.error ?? documentos?.error

  return (
    // SIN `PageShell`: su encabezado dibuja un `h1` propio, y `EntityHeader` dibuja el suyo. Dos
    // `h1` en la misma pantalla no son un detalle de accesibilidad —son dos títulos compitiendo por
    // decir qué es esta pantalla—. Lo que se reusa es el MARCO exacto de `PageShell` (canvas, 40px
    // de padding en escritorio y 16 en el teléfono), que es lo único que hacía falta de él.
    <div className="min-h-screen bg-canvas">
      <div className="w-full px-4 py-6 lg:px-10">
      <EntityHeader
        volverA="/administracion/personas"
        volverLabel="Personal"
        titulo={persona.nombre_completo}
        campos={[
          { rotulo: 'Categoría', valor: persona.categoria ? etiquetaCategoria(persona.categoria) : null, falta: 'sin categoría' },
          { rotulo: 'Cuadrilla', valor: vigente?.cuadrilla ?? null, falta: 'sin cuadrilla' },
          { rotulo: 'Obra actual', valor: vigente?.obra_nombre ?? null, falta: 'sin asignar' },
          { rotulo: 'Alta', valor: persona.fecha_ingreso ? fecha(persona.fecha_ingreso) : null, falta: 'sin fecha' },
        ]}
        derecha={
          // EL ESTADO SALE DE `en_la_empresa`, NO DE LA FECHA: hay 15 personas que se fueron sin baja
          // documentada y por la fecha figurarían activas.
          egresada
            ? <Estado tono="nulo" clave="inactiva">{persona.fecha_egreso ? `inactiva desde ${fecha(persona.fecha_egreso)}` : 'ya no está en la empresa'}</Estado>
            : <Estado tono="pos" clave="activa">activa</Estado>
        }
        acciones={egresada
          ? <BotonAccion accion={reincorporar} args={[id]} testid="reincorporar">Reincorporar</BotonAccion>
          // `args` y NO una función flecha: `accion={() => darDeBaja(id)}` crea una función nueva que
          // React rechaza en runtime —"Functions cannot be passed directly to Client Components"— y
          // la pantalla queda EN BLANCO, sin que ni typecheck ni build lo detecten.
          : <BotonAccion accion={darDeBaja} args={[id]} testid="dar-de-baja">Dar de baja</BotonAccion>}
      />

      <NavFicha activa={vista} hrefDe={(v) => href(v)} ocultar={veLaCuenta ? [] : ['usuario']} />

      {fallo && <div className="mb-4"><Aviso tono="neg">{fallo}</Aviso></div>}

      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1 space-y-8">
          {vista === 'resumen' && (
            <Bloque titulo="Asignación actual" testid="bloque-asignacion-actual">
              {vigente
                ? (
                    <div className="grid gap-x-10 sm:grid-cols-2">
                      <Dato k="Obra" v={vigente.obra_nombre ?? vigente.obra_id} />
                      <Dato k="Actividad" v={vigente.actividad_nombre ?? 'toda la obra'} />
                      <Dato k="Cuadrilla" v={vigente.cuadrilla} />
                      <Dato k="Rol" v={vigente.rol ?? 'integrante'} />
                      <Dato k="Desde" v={vigente.desde ? fecha(vigente.desde) : null} mono />
                    </div>
                  )
                : (
                    <Vacio accion={<Link href="/obras" className="text-ink hover:underline">Ir a Obras →</Link>}>
                      Sin asignación vigente. Se asigna desde la solapa Personal de la obra.
                    </Vacio>
                  )}
            </Bloque>
          )}

          {/* EL HISTORIAL RECIENTE VA EN EL RESUMEN, y no porque hubiera lugar: la segunda pregunta
              que se le hace a un legajo, después de «dónde está hoy», es «dónde estuvo». Ya está
              leído para calcular la asignación vigente, así que no cuesta una consulta más. Las
              cerradas completas viven en su solapa. */}
          {vista === 'resumen' && cerradas.length > 0 && (
            <Bloque
              titulo="Estuvo antes en"
              testid="bloque-historial"
              ayuda={<Link href={href('asignaciones')} className="text-muted hover:text-ink">Ver el historial completo →</Link>}
            >
              <ul>
                {cerradas.slice(0, 4).map((a) => (
                  <li key={a.id} className="flex items-baseline justify-between gap-4 border-b border-[#EFEEEA] py-2.5 last:border-0">
                    <Link href={`/obras/${a.obra_id}`} className="min-w-0 flex-1 truncate text-[13px] text-ink hover:underline">
                      {a.obra_nombre ?? a.obra_id}
                    </Link>
                    <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-faint">
                      {a.desde ? fecha(a.desde) : 'sin fecha'} → {a.hasta ? fecha(a.hasta) : 'sin fecha'}
                    </span>
                  </li>
                ))}
              </ul>
            </Bloque>
          )}

          {vista === 'asignaciones' && (
            <Bloque
              titulo="Historial de asignaciones"
              testid="bloque-asignaciones"
              ayuda="La misma relación que muestra Obra → Personal."
            >
              <BloqueAsignacion
                asignaciones={asignaciones?.data ?? []}
                cerrar={cerrarAsignacionDePersona.bind(null, id)}
              />
            </Bloque>
          )}

          {vista === 'horas' && (
            <Bloque titulo="Horas imputadas" testid="bloque-horas">
              <BloqueHoras
                periodo={rotulo(ventana)}
                horasPeriodo={resumen.trabajadas}
                porTipo={resumen.porTipo}
                porObra={resumen.obras}
                porActividad={resumen.actividades}
                registros={resumen.registros}
                historial={filasHH}
                periodoActivo={periodo}
                hrefPeriodo={(p) => `${base}?${new URLSearchParams({ v: 'horas', p })}`}
              />
            </Bloque>
          )}

          {vista === 'documentos' && (
            <Bloque titulo="Documentos" testid="bloque-documentos" ayuda="Vínculos a Drive. El archivo no se copia.">
              <BloqueDocumentos
                documentos={documentos?.data ?? []}
                desvincular={desvincularDocumento.bind(null, id)}
                enLaEmpresa={persona.en_la_empresa}
                carpetaDrive={persona.drive_folder_id}
              />
              <AltaDocumento vincular={vincularDocumento.bind(null, id)} />
            </Bloque>
          )}

          {/* LA SOLAPA SE ESCONDE Y ADEMÁS SE CIERRA. Esconder el tab evita ofrecer algo que rebota;
              este `if` es lo que impide que `?v=usuario` escrito a mano devuelva el correo y el
              estado de la cuenta de alguien a quien la lista negra le cierra `/administracion/usuarios`. */}
          {vista === 'usuario' && !veLaCuenta && (
            <div data-testid="usuario-sin-permiso">
              <Aviso tono="info" titulo="Esta solapa es de Dirección y Administración">
                La cuenta con la que alguien entra al sistema y sus permisos se ven donde se
                gestionan las cuentas. Administrar el legajo y administrar el acceso son dos cosas
                distintas.
              </Aviso>
            </div>
          )}

          {vista === 'usuario' && cuenta && (
            <BloqueUsuario
              personaId={id}
              lectura={cuenta}
              rolActor={rolActor}
              // NADIE SE SACA EL ACCESO A SÍ MISMO, y acá se sabe antes de apretar: la regla también
              // vive en `reglas.ts` y la acción la vuelve a aplicar, pero un botón que rebota no
              // explica por qué.
              esUnoMismo={cuenta.hay && cuenta.cuenta.usuarioId === actor?.id}
            />
          )}

          {vista === 'auditoria' && bitacora && (
            <Bloque
              titulo="Auditoría de cambios"
              testid="bloque-auditoria"
              ayuda="Cada cambio de la ficha, con quién y cuándo."
            >
              <BloqueAuditoria
                bitacora={bitacora}
                hrefMas={`${base}?${new URLSearchParams({ v: 'auditoria', n: String(cuantos + TRAMO) })}`}
              />
            </Bloque>
          )}
        </div>

        {/* EL ASIDE DE PROPIEDADES — `LAYOUT_RESPONSIVE.md`: «Fichas de entidad: columna ancha +
            aside de 320–360px de propiedades». Está en las cuatro solapas a propósito: quién es esta
            persona es el contexto de todo lo demás, y perderlo al mirar sus horas obliga a volver. */}
        {!editar && (
          <aside className="w-full shrink-0 space-y-7 lg:w-[360px]">
            <Bloque titulo="Identidad" testid="bloque-identidad" editarHref={href(vista, 'identidad')}>
              {/* SE MUESTRAN FORMATEADOS Y SE GUARDAN PELADOS: once cifras seguidas no se comparan
                  de un vistazo contra el papel que alguien tiene en la mano. Ver `identidad.ts`. */}
              <Dato k="DNI" v={formatearDni(persona.dni)} mono />
              <Dato k="CUIL" v={formatearCuit(persona.cuil)} mono />
              <Dato k="Nacimiento" v={persona.fecha_nacimiento ? fecha(persona.fecha_nacimiento) : null} mono />
              <Dato k="Nacionalidad" v={persona.nacionalidad} />
              <Dato k="Teléfono" v={persona.telefono} mono />
              <Dato k="Email" v={persona.email} />
              <Dato k="Domicilio" v={persona.domicilio} />
              <Dato
                k="Emergencia"
                v={[persona.contacto_emergencia, persona.contacto_emergencia_telefono].filter(Boolean).join(' · ') || null}
              />
            </Bloque>

            <Bloque titulo="Laboral" testid="bloque-laboral" editarHref={href(vista, 'laboral')}>
              <Dato k="Legajo" v={persona.legajo} mono />
              <Dato k="Fecha de alta" v={persona.fecha_ingreso ? fecha(persona.fecha_ingreso) : null} mono />
              {/* SE FUE SIN FECHA NO ES LO MISMO QUE NO SE FUE: de los legajos cerrados, 22 no tienen
                  baja documentada. Lo que falta es el papel, no la carga. */}
              <Dato
                k="Fecha de baja"
                v={persona.fecha_egreso ? fecha(persona.fecha_egreso) : (egresada ? 'sin papel de baja' : 'no egresó')}
                mono={Boolean(persona.fecha_egreso)}
              />
              <Dato k="Convenio" v={persona.convenio_colectivo} />
              <Dato k="Categoría" v={persona.categoria ? etiquetaCategoria(persona.categoria) : null} />
              <Dato k="Especialidad" v={persona.especialidad} />
              <Dato k="Puesto u oficio" v={persona.puesto} />
              <Dato k="Modalidad" v={persona.modalidad_liquidacion} />
              <Dato k="Notas" v={persona.notas} />
            </Bloque>

            <div>
              <Eyebrow className="mb-1">Retribución</Eyebrow>
              <p className="text-[12px] leading-relaxed text-faint">
                <Nulo>no llega a esta pantalla</Nulo>: la vista `persona_legajo`, que es la única
                puerta al legajo, no publica la columna.
              </p>
            </div>
          </aside>
        )}

        {editar && (
          <PanelEdicion
            titulo={editar === 'identidad' ? 'Editar identidad' : 'Editar datos laborales'}
            subtitulo={persona.nombre_completo}
            accion={editarPersona.bind(null, id, editar)}
            cerrarHref={href(vista)}
            testid={`panel-editar-${editar}`}
          >
            {editar === 'identidad'
              ? <CamposIdentidad persona={persona} />
              : <CamposLaboral persona={persona} />}
          </PanelEdicion>
        )}
      </div>
      </div>
    </div>
  )
}
