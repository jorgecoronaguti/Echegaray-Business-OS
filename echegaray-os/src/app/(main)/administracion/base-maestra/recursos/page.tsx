// PANTALLA 18 · BASE MAESTRA — RECURSOS.
//
// Con qué se hace cada tarea y cuánto sale. El canónico dibuja UNA lista con la columna TIPO —mano
// de obra, material, equipo, subcontrato— y chips para recortarla; eso es `RecursosCartera`. Las
// otras tres sub-vistas de la banda no están en el zip y son pantallas construidas que siguen vivas:
// el convenio del que sale el costo de la hora, las plantillas de secuencia y las tandas de precio.
//
// ═══ EL COSTO EMPRESA SE CALCULA, NO SE TIPEA ═══
//
// Está en el subtítulo de Mano de obra y es literal: el jornal sale de `uocra_escala` —115 filas con
// vigencia, la escala real del convenio— y las cargas de `carga_social_vigente`. Nadie escribe el
// costo por hora en ningún lado; sale de esos dos, cada uno con su fecha y su fuente.
//
// SIN `PageShell` (porte 25/08, canónico 18): la pantalla arranca en la banda de nivel 3. Lo único
// del shell que no se puede perder es `SelloDatoBueno`, y va en `Marco`.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Aviso } from '@/shared/components/ds'
import { SelloDatoBueno } from '@/shared/components/estado/SelloDatoBueno'
import { C } from '@/shared/components/canon'
import { getPerfilActual } from '@/features/auth/services/authService'
import { veEconomia } from '@/features/auth/types/areas'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { PanelEdicion } from '@/features/administracion/components/PanelEdicion'
import {
  BandaBaseMaestra, RUTA_RECURSOS, type SolapaBM,
} from '@/features/base-maestra/components/NavBaseMaestra'
import { corteDeLaVista, vistaDe, type VistaRecursos } from '@/features/base-maestra/services/vistas'
import {
  TablaManoDeObra, TablaPlantillas, TablaVersiones,
} from '@/features/base-maestra/components/TablasRecursos'
import { RecursosCartera } from '@/features/base-maestra/components/RecursosCartera'
import { FichaRecurso } from '@/features/base-maestra/components/FichaRecurso'
import { CamposPrecio, CamposRecurso } from '@/features/base-maestra/components/CamposRecurso'
import {
  getFichaRecurso, getManoDeObra, getPlantillas, getRecursos, getVersionesDePrecio,
} from '@/features/base-maestra/services/recursosService'
import { contadores, getCuentasBaseMaestra } from '@/features/base-maestra/services/cuentas'
import { IconoCompra, IconoPresupuesto } from '@/shared/components/iconos'
import { TrabajoDeSeccion } from '@/shared/components/v2/TrabajoDeSeccion'
import { senalesDeBaseMaestra } from '@/features/base-maestra/services/senalesBaseMaestra'

import { actualizarPrecioRecurso, crearRecurso, editarRecurso } from '@/features/base-maestra/services/recursosActions'
import { fechaLarga, porcentaje } from '@/features/base-maestra/services/reglas'

export const dynamic = 'force-dynamic'

/** Los dos iconos que esta sección mezcla: una tarea tipo y un recurso comprado. */
const ICONOS_BM = { presupuesto: IconoPresupuesto, compra: IconoCompra }

/** Los dos destinos de la primera línea: el recorte que produjo cada número. */
const HREFS_BM = {
  sinAnalisis: '/administracion/base-maestra/tareas?c=sinAnalisis',
  sinPrecio: '/administracion/base-maestra/recursos?tipo=sin_precio',
}


type Busqueda = { v?: string; q?: string; r?: string; tipo?: string; nuevo?: string; editar?: string; precio?: string }

function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: C.fondo, display: 'flex', flexDirection: 'column' }}>
      <SelloDatoBueno />
      {children}
    </div>
  )
}

export default async function BaseMaestraRecursosPage({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const sp = await searchParams
  const vista = vistaDe(sp.v)

  const supabase = await createClient()
  const perfil = await getPerfilActual(supabase)
  const economia = veEconomia(perfil.data?.rol ?? null)

  // «Versiones de precio» es ENTERA económica: sin permiso no se abre a medias, se manda a la lista.
  // Dejarla accesible y vacía diría cuántas versiones hay, que ya es información de precio.
  if (vista === 'precios' && !economia) redirect(RUTA_RECURSOS)

  // Hoy entra como dato, no lo lee cada función por su cuenta: si dos partes de la pantalla
  // preguntaran la hora por separado, una corrida a medianoche podría pintar dos frescuras distintas.
  const hoy = new Date().toISOString().slice(0, 10)
  const cuentas = await getCuentasBaseMaestra(supabase)
  const banda: Partial<Record<SolapaBM, number | null>> = contadores(cuentas)
  // LAS SEÑALES SON DE LA SECCIÓN, NO DE LA SUB-VISTA: las mismas dos en Tareas y en Recursos, con
  // los mismos números. Salen de la MISMA lectura (`getCuentasBaseMaestra`) para que no puedan
  // discrepar entre una solapa y la de al lado.
  const senales = senalesDeBaseMaestra({
    tareas: cuentas.analisis, recursos: cuentas.precios, economia, hrefs: HREFS_BM,
  })
  const trabajo = (
    <TrabajoDeSeccion
      senales={senales}
      icono={IconoPresupuesto}
      iconos={ICONOS_BM}
      vacio={economia
        ? 'Todas las tareas tipo tienen análisis y todos los recursos tienen precio.'
        : 'Todas las tareas tipo tienen análisis.'}
    />
  )

  if (vista === 'recursos') {
    return <Cartera sp={sp} economia={economia} hoy={hoy} cuentas={banda} supabase={supabase} trabajo={trabajo} />
  }
  return <Otras sp={sp} vista={vista} economia={economia} hoy={hoy} cuentas={banda} supabase={supabase} trabajo={trabajo} />
}

type Cliente = Awaited<ReturnType<typeof createClient>>

/** El aviso de permiso, dicho UNA VEZ y en una línea: las columnas no están vacías, están cerradas. */
function AvisoPermiso() {
  return (
    <div style={{ padding: '12px 20px 0' }}>
      <Aviso tono="info">
        Ves el recurso, su unidad y en cuántas tareas entra; no ves el precio, su historial ni el
        proveedor: quedan en Dirección y Administración. Las columnas no están vacías, no se muestran.
      </Aviso>
    </div>
  )
}

// ═══ LA CARTERA — el canónico 18 ═══════════════════════════════════════════════════════════════

async function Cartera({
  sp, economia, hoy, cuentas, supabase, trabajo,
}: {
  sp: Busqueda
  economia: boolean
  hoy: string
  cuentas: Partial<Record<SolapaBM, number | null>>
  supabase: Cliente
  /** La primera línea de la sección, ya renderizada en el servidor. */
  trabajo: React.ReactNode
}) {
  const listado = await getRecursos(supabase, hoy)
  if (listado.error) {
    return (
      <Marco>
        <NavAdministracion />
        {trabajo}
        <BandaBaseMaestra activa="recursos" cuentas={cuentas} />
        <div style={{ padding: '14px 20px' }} data-testid="recursos-error">
          <Aviso tono="neg" titulo="No pude leer la base maestra">{listado.error}</Aviso>
        </div>
      </Marco>
    )
  }

  const filas = listado.data ?? []
  const familias = [...new Set(filas.map((f) => f.familia).filter((f): f is string => Boolean(f)))].sort(
    (a, b) => a.localeCompare(b, 'es'),
  )
  // LA FICHA SE PIDE SÓLO SI EL RECURSO ESTÁ EN LA LISTA: un `?r=` de un recurso archivado abriría un
  // panel que no corresponde a ninguna fila, y la selección quedaría invisible.
  const abierto = sp.r && filas.some((x) => x.recurso_id === sp.r) ? sp.r : null
  const ficha = abierto ? await getFichaRecurso(supabase, abierto, hoy, economia) : null

  const href = (cambios: Partial<Busqueda>) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...sp, ...cambios })) if (v) p.set(k, String(v))
    const qs = p.toString()
    return qs ? `${RUTA_RECURSOS}?${qs}` : RUTA_RECURSOS
  }

  return (
    <Marco>
      <NavAdministracion />
      {trabajo}
      {!economia && <AvisoPermiso />}
      {ficha?.error && (
        <div style={{ padding: '12px 20px 0' }} data-testid="ficha-recurso-error">
          <Aviso tono="neg" titulo="No pude abrir ese recurso">{ficha.error}</Aviso>
        </div>
      )}

      <RecursosCartera
        recursos={filas}
        q={sp.q ?? ''}
        seleccionado={abierto}
        economia={economia}
        cuentas={cuentas}
        ruta={RUTA_RECURSOS}
        // `v` viaja aunque ya no sea una sub-vista: un enlace viejo (`?v=insumos`) tiene que seguir
        // abriendo en lo mismo después de hacer clic en una fila. Ver `vistas.ts`.
        otros={{ v: sp.v, r: sp.r, tipo: sp.tipo }}
        corteInicial={corteDeLaVista(sp.v, sp.tipo)}
        hrefNuevo={href({ nuevo: '1' })}
        panel={
          <>
            {ficha?.data && (
              <FichaRecurso
                ficha={ficha.data}
                hoy={hoy}
                economia={economia}
                hrefCerrar={href({ r: undefined, precio: undefined, editar: undefined })}
                // Las dos acciones del panel viven en la URL y se abren EN EL LUGAR, al lado de la
                // lista: el pedido del dueño es que se edite acá, no que la pantalla lo lleve a otra.
                hrefPrecio={economia ? href({ precio: ficha.data.recurso.recurso_id, editar: undefined }) : undefined}
                hrefEditar={href({ editar: ficha.data.recurso.recurso_id, precio: undefined })}
              />
            )}

            {sp.precio && economia && ficha?.data && sp.precio === ficha.data.recurso.recurso_id && (
              <PanelEdicion
                titulo="Actualizar el precio"
                subtitulo={`${ficha.data.recurso.codigo} · ${ficha.data.recurso.nombre}`}
                accion={actualizarPrecioRecurso.bind(null, ficha.data.recurso.recurso_id)}
                cerrarHref={href({ precio: undefined })}
                enviar="Guardar el precio"
                testid="panel-precio-recurso"
                ayuda="El precio anterior NO se pisa: baja a historial con su fecha y su fuente, y los presupuestos ya congelados siguen apuntando al que se usó para cotizarlos."
              >
                <CamposPrecio hoy={hoy} proveedor={ficha.data.recurso.proveedor} />
              </PanelEdicion>
            )}

            {sp.editar && ficha?.data && sp.editar === ficha.data.recurso.recurso_id && (
              <PanelEdicion
                titulo="Editar el recurso"
                subtitulo={ficha.data.recurso.codigo}
                accion={editarRecurso.bind(null, ficha.data.recurso.recurso_id)}
                cerrarHref={href({ editar: undefined })}
                testid="panel-editar-recurso"
                ayuda="El tipo no se cambia: reclasificaría hacia atrás el costo y las HH de todos los análisis que lo usan. Un recurso mal tipado se da de baja y se carga bien."
              >
                <CamposRecurso familias={familias} recurso={ficha.data.recurso} />
              </PanelEdicion>
            )}

            {sp.nuevo === '1' && (
              <PanelEdicion
                titulo="Nuevo recurso"
                accion={crearRecurso}
                cerrarHref={href({ nuevo: undefined })}
                enviar="Crear"
                testid="panel-alta-recurso"
                ayuda="Nace sin precio, y la lista lo dice. El precio se carga después desde su ficha, con su fecha y su fuente."
              >
                <CamposRecurso familias={familias} />
              </PanelEdicion>
            )}
          </>
        }
      />
    </Marco>
  )
}

// ═══ LAS TRES VISTAS QUE EL ZIP NO DIBUJA ══════════════════════════════════════════════════════

async function Otras({
  sp, vista, economia, hoy, cuentas, supabase, trabajo,
}: {
  sp: Busqueda
  vista: Exclude<VistaRecursos, 'recursos'>
  economia: boolean
  hoy: string
  cuentas: Partial<Record<SolapaBM, number | null>>
  supabase: Cliente
  trabajo: React.ReactNode
}) {
  const armado = await armar(supabase, vista, hoy, economia, sp.q ?? '')
  return (
    <Marco>
      <NavAdministracion />
      {trabajo}
      <BandaBaseMaestra activa={vista} cuentas={cuentas} />
      {!economia && vista !== 'plantillas' && <AvisoPermiso />}
      <div style={{ padding: '14px 20px 20px' }}>
        <h1 style={{ fontSize: '19px', fontWeight: 600, color: C.tinta, margin: 0 }}>{TITULO[vista]}</h1>
        {armado.error ? (
          <div style={{ marginTop: 12 }} data-testid="recursos-error">
            <Aviso tono="neg" titulo="No pude leer la base maestra">{armado.error}</Aviso>
          </div>
        ) : (
          <>
            <p style={{ fontSize: '12.5px', color: C.apagado, marginTop: 6 }}>{armado.subtitulo}</p>
            <div style={{ marginTop: 14 }}>{armado.nodo}</div>
          </>
        )}
      </div>
    </Marco>
  )
}

const TITULO: Record<Exclude<VistaRecursos, 'recursos'>, string> = {
  'mano-obra': 'Mano de obra',
  plantillas: 'Plantillas de secuencia',
  precios: 'Versiones de precio',
}

type Armado = { nodo: React.ReactNode; subtitulo: string; error: null } | { nodo: null; subtitulo: ''; error: string }

async function armar(
  supabase: Cliente,
  vista: Exclude<VistaRecursos, 'recursos'>,
  hoy: string,
  economia: boolean,
  q: string,
): Promise<Armado> {
  if (vista === 'mano-obra') return armarManoDeObra(supabase, hoy, economia, q)
  if (vista === 'plantillas') {
    const r = await getPlantillas(supabase)
    if (r.error || !r.data) return { nodo: null, subtitulo: '', error: r.error ?? 'sin datos' }
    const pasos = r.data.reduce((a, p) => a + p.pasos.length, 0)
    return {
      error: null,
      subtitulo: `${r.data.length} plantillas · ${pasos} pasos · los pesos definen cuánto avanza cada uno`,
      nodo: <TablaPlantillas plantillas={r.data} q={q} />,
    }
  }
  const r = await getVersionesDePrecio(supabase, hoy)
  if (r.error || !r.data) return { nodo: null, subtitulo: '', error: r.error ?? 'sin datos' }
  return {
    error: null,
    subtitulo: `${r.data.length} versiones · una versión es una tanda de precios con la misma fecha y la misma fuente`,
    nodo: <TablaVersiones filas={r.data} q={q} />,
  }
}

async function armarManoDeObra(supabase: Cliente, hoy: string, economia: boolean, q: string): Promise<Armado> {
  const r = await getManoDeObra(supabase, hoy, economia)
  if (r.error || !r.data) return { nodo: null, subtitulo: '', error: r.error ?? 'sin datos' }
  const { categorias, cargas, meta } = r.data
  return {
    error: null,
    subtitulo: [
      'Convenio UOCRA Zona A · San Juan',
      meta.escala_vigente ? `escala vigente ${fechaLarga(meta.escala_vigente)}` : 'sin escala vigente cargada',
      economia ? 'el costo empresa se calcula, no se tipea' : null,
    ].filter(Boolean).join(' · '),
    nodo: (
      <>
        <TablaManoDeObra
          categorias={categorias} cargas={cargas} cargasTotal={meta.cargas_total}
          jornada={meta.jornada_horas} q={q} economia={economia}
        />
        {meta.escala_fuente && (
          <p style={{ marginTop: 24, fontSize: '11px', lineHeight: 1.6, color: C.tenue }} data-testid="fuente-escala">
            Fuente de la escala: {meta.escala_fuente}. Esta tabla no se actualiza sola —la alimentaba un
            IMPORTHTML de una pestaña que ya no existe—, así que la fecha de vigencia es parte del dato.
            {meta.cargas_total != null && ` Cargas vigentes: ${porcentaje(meta.cargas_total, 2)}.`}
          </p>
        )}
      </>
    ),
  }
}
