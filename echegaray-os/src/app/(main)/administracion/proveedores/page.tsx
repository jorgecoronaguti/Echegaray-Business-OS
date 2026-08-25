// PROVEEDORES — el maestro canónico y la cola de nombres sin resolver.
//
// El dueño: *"Proveedor debe ser entidad canónica administrable y evitar duplicados por texto
// libre"*. Las dos mitades de esa frase son las dos sub-vistas de esta pantalla:
//
//   MAESTRO   quién es un proveedor, con el CUIT como identidad.
//   RESOLVER  los nombres que el Sheet trae sueltos y todavía no son nadie.
//
// La segunda es la que de verdad evita el duplicado: sin un lugar donde decir «este texto es este
// proveedor», el maestro se llena de variantes del mismo nombre y nadie sabe cuál es la buena.
//
// Las dos sub-vistas son NIVEL 3 —texto con subrayado, no una segunda barra de solapas—: arriba ya
// está la barra del área, y una tercera barra deja de decir dónde está parado el que mira. Cuál está
// abierta viaja en la URL, como todo el resto del estado de esta pantalla.

import { createClient } from '@/lib/supabase/server'
import { Aviso, Ayuda, BuscadorURL, SubTabs } from '@/shared/components/ds'
import { SelloDatoBueno } from '@/shared/components/estado/SelloDatoBueno'
import { BotonMarca, C, FranjaCartera, IcoMas, PAGINA } from '@/shared/components/canon'
import { plata } from '@/features/obras/components/formato'
import { NavAdministracion } from '@/features/administracion/components/NavAdministracion'
import { BarraAtencion } from '@/features/administracion/components/BarraAtencion'
import { FiltrosURL } from '@/features/administracion/components/Controles'
import { NombresResueltos, TablaNombres } from '@/features/administracion/components/TablaNombres'
import { PanelNombre } from '@/features/administracion/components/PanelNombre'
import { PanelProveedor } from '@/features/administracion/components/PanelProveedor'
import { TablaProveedores } from '@/features/administracion/components/TablaProveedores'
import {
  getComprasDelProveedor, getCompradoDeLaCartera, getNombresPendientes, getNombresResueltos,
  getProveedor, getProveedores, getSubcontratistas, resumirCartera, type FiltroActivo,
} from '@/features/administracion/services/proveedoresService'
import {
  archivarProveedor, crearProveedor, crearYVincular, deshacerResolucion,
  editarProveedor, marcarNoEsProveedor, vincularNombre,
} from '@/features/administracion/services/proveedoresActions'
import type { ChipAtencion } from '@/features/administracion/services/homeAdministracion'
import type { Proveedor } from '@/features/administracion/types'

export const dynamic = 'force-dynamic'

const ACTIVOS: { valor: FiltroActivo; etiqueta: string }[] = [
  { valor: 'activos', etiqueta: 'Activos' },
  { valor: 'archivados', etiqueta: 'Archivados' },
  { valor: 'todos', etiqueta: 'Todos' },
]

type Busqueda = {
  q?: string; activo?: string; p?: string; vista?: string; n?: string; bq?: string; cuit?: string
  /** `sub` = sólo los que tienen al menos un paquete de subcontrato. */
  tipo?: string
}

function armarHref(base: Busqueda, cambios: Partial<Busqueda> = {}): string {
  const v = { ...base, ...cambios }
  const params = new URLSearchParams()
  if (v.q) params.set('q', v.q)
  if (v.activo) params.set('activo', v.activo)
  if (v.vista) params.set('vista', v.vista)
  if (v.p) params.set('p', v.p)
  if (v.n) params.set('n', v.n)
  if (v.bq) params.set('bq', v.bq)
  if (v.cuit) params.set('cuit', v.cuit)
  if (v.tipo) params.set('tipo', v.tipo)
  const qs = params.toString()
  return `/administracion/proveedores${qs ? `?${qs}` : ''}`
}

export default async function ProveedoresPage({ searchParams }: { searchParams: Promise<Busqueda> }) {
  const sp = await searchParams
  const vista = sp.vista === 'resolver' ? 'resolver' : 'maestro'
  const activo = (ACTIVOS.find((a) => a.valor === sp.activo)?.valor ?? 'activos') as FiltroActivo
  const soloSinCuit = sp.cuit === 'falta'
  const soloSubcontratistas = sp.tipo === 'sub'
  const supabase = await createClient()

  // El maestro se lee siempre. Los CANDIDATOS de la cola se leen con el término del panel: la
  // vinculación se elige buscando, no recorriendo una lista entera de proveedores.
  //
  // EL CHIP CUENTA CON EL MISMO PREDICADO QUE FILTRA. Contarlos en memoria con un `!p.cuit` sería
  // una segunda definición de «sin CUIT», y el día que difiera el chip pediría un trabajo que la
  // lista no muestra. Va sin `q`: un aviso de atención cuenta lo que la empresa debe resolver, no
  // lo que quedó dentro de la búsqueda de este momento. Es una lectura chica —el maestro son
  // decenas de filas, no miles—.
  //
  // LO COMPRADO Y EL TIPO SE LEEN UNA VEZ PARA TODA LA LISTA, no una consulta por fila: son dos
  // lecturas de decenas de filas que se agrupan en memoria. `null` en cualquiera de las dos es
  // «no pude leerlo» y la columna lo escribe así — nunca como un cero ni como un tipo ausente.
  const [listado, candidatos, pendientesCuenta, sinCuit, comprado, subcontratistas] = await Promise.all([
    getProveedores(supabase, { q: sp.q, activo, sinCuit: soloSinCuit }),
    getProveedores(supabase, { q: sp.bq, activo: 'activos' }),
    getNombresPendientes(supabase),
    getProveedores(supabase, { activo, sinCuit: true }),
    getCompradoDeLaCartera(supabase),
    getSubcontratistas(supabase),
  ])

  if (listado.error) {
    return (
      <Marco>
        <NavAdministracion />
        <div style={{ padding: '0 20px' }} data-testid="proveedores-error">
          <Aviso tono="neg" titulo="No pude leer los proveedores">{listado.error}</Aviso>
        </div>
      </Marco>
    )
  }

  // EL FILTRO POR TIPO SE APLICA ACÁ Y NO EN LA CONSULTA: «es subcontratista» no es una columna
  // de `proveedores`, es la existencia de un paquete en otra tabla. Cuando no se pudo leer, el
  // filtro no recorta nada: esconder filas por un error de lectura sería dibujar una cartera más
  // chica que la real sin decirlo.
  const todos = listado.data ?? []
  const proveedores = soloSubcontratistas && subcontratistas.data
    ? todos.filter((p) => subcontratistas.data?.has(p.id))
    : todos
  const resumen = resumirCartera(proveedores, comprado.data, subcontratistas.data)
  const abrirAlta = sp.p === 'nuevo'
  const seleccionadoId = abrirAlta ? undefined : sp.p
  let seleccionado: Proveedor | null = null
  // NO SE PUDO LEER ≠ NO ESTÁ. Esto redirigía sacando `p` de la URL: el panel se cerraba solo y la
  // pantalla quedaba idéntica a la de alguien que nunca hizo clic — el error dibujado como si nada
  // hubiera pasado, que es la versión más silenciosa del defecto que `INTERACTION.md` prohíbe. Un
  // fallo de permisos o de red se dice; la selección se conserva en la URL para poder reintentarla.
  let errorSeleccionado: string | null = null
  if (seleccionadoId) {
    const r = await getProveedor(supabase, seleccionadoId)
    if (r.error) errorSeleccionado = r.error
    else seleccionado = r.data
  }
  const compras = seleccionado ? await getComprasDelProveedor(supabase, seleccionado.id) : null

  const resueltos = vista === 'resolver' ? await getNombresResueltos(supabase) : null
  const cola = pendientesCuenta.data ?? []
  const nombreAbierto = sp.n ? cola.find((n) => n.nombre_norm === sp.n) : undefined
  const panelAbierto = abrirAlta || seleccionado !== null

  // LO QUE PIDE TRABAJO, ARRIBA Y A UN CLIC. Cada chip aterriza en el filtro que produjo su número,
  // no en la pantalla en general. Sin pendientes no hay barra: normal silencioso.
  const chips: ChipAtencion[] = []
  if ((sinCuit.data?.length ?? 0) > 0) {
    const n = sinCuit.data?.length ?? 0
    chips.push({
      clave: 'sin-cuit',
      numero: n,
      texto: n === 1 ? 'sin CUIT: no cruza con ARCA' : 'sin CUIT: no cruzan con ARCA',
      href: armarHref({}, { cuit: 'falta' }),
      tono: 'warn',
    })
  }
  if (cola.length > 0) {
    chips.push({
      clave: 'sin-resolver',
      numero: cola.length,
      texto: cola.length === 1 ? 'nombre de Compras sin resolver' : 'nombres de Compras sin resolver',
      href: armarHref({}, { vista: 'resolver' }),
      tono: 'warn',
    })
  }

  return (
    // SIN `PageShell` (porte 24/08, canónico 22). El shell dibuja padding 16/24px y un ancho de
    // lectura; el canon dibuja padding de 20px y la tabla en caja hasta el borde del contenido. Lo
    // único del shell que no se puede perder es `SelloDatoBueno`, y va en `Marco`.
    <Marco>
      <NavAdministracion />

      <div className="mb-4" style={{ padding: '0 20px' }}>
        <SubTabs
          testid="vistas-proveedores"
          items={[
            {
              href: armarHref(sp, { vista: undefined, n: undefined, bq: undefined }),
              label: 'Proveedores', cuenta: proveedores.length,
              activo: vista === 'maestro', testid: 'vista-maestro',
            },
            {
              href: armarHref(sp, { vista: 'resolver', p: undefined, q: undefined }),
              label: 'Nombres sin resolver', cuenta: pendientesCuenta.error ? null : cola.length,
              activo: vista === 'resolver', testid: 'vista-resolver',
            },
          ]}
        />
      </div>

      {errorSeleccionado && (
        <div className="mb-4" style={{ padding: '0 20px' }} data-testid="proveedor-seleccionado-error">
          <Aviso tono="neg" titulo="No pude abrir ese proveedor">{errorSeleccionado}</Aviso>
        </div>
      )}

      {vista === 'maestro'
        ? (
            <>
              <FranjaCartera
                titulo="Proveedores"
                testid="franja-proveedores"
                accion={
                  <BotonMarca href={armarHref(sp, { p: 'nuevo' })} testid="nuevo-proveedor">
                    <IcoMas s={14} /> Nuevo proveedor
                  </BotonMarca>
                }
              >
                {/* 238px — `22`, línea 60. */}
                <BuscadorURL
                  accion="/administracion/proveedores"
                  q={sp.q}
                  placeholder="Buscar proveedor o rubro"
                  oculto={{ activo: activo === 'activos' ? undefined : activo, p: sp.p }}
                  ancho="w-[238px] max-w-full"
                  variante="caja"
                  testid="buscar-proveedor"
                />
                <FiltrosURL
                  testid="filtro-activo"
                  opciones={[
                    ...ACTIVOS.map((a) => ({
                      label: a.etiqueta,
                      href: armarHref(sp, {
                        activo: a.valor === 'activos' ? undefined : a.valor, cuit: undefined,
                      }),
                      activo: a.valor === activo && !soloSinCuit,
                      testid: `filtro-activo-${a.valor}`,
                    })),
                    // «Sin CUIT» es el filtro al que aterriza el chip de atención. Está en la misma
                    // fila que el resto porque es lo mismo —un recorte de la lista—, no una vista
                    // aparte: el que viene del chip tiene que poder salir por donde entró.
                    {
                      label: 'Sin CUIT',
                      href: armarHref(sp, { cuit: soloSinCuit ? undefined : 'falta' }),
                      activo: soloSinCuit,
                      testid: 'filtro-sin-cuit',
                    },
                    // «Subcontratistas» es el ÚNICO recorte por tipo que la base puede probar: son
                    // los que tienen un paquete en `subcontrato`. El canónico dibuja además
                    // «Papeles faltantes» y no está: no hay tabla que cuelgue un papel de un
                    // proveedor, así que ese chip contaría siempre cero y mandaría a mirar una lista
                    // vacía como si no hubiera nada pendiente.
                    ...(subcontratistas.data
                      ? [{
                          label: 'Subcontratistas',
                          href: armarHref(sp, { tipo: soloSubcontratistas ? undefined : 'sub' }),
                          activo: soloSubcontratistas,
                          testid: 'filtro-subcontratistas',
                        }]
                      : []),
                  ]}
                />
              </FranjaCartera>

              {/* NO PUDE LEERLO ≠ NO HAY NINGUNO. Un chip ausente por un error de lectura dibuja una
                  cartera sin pendientes, que es la mentira más silenciosa que puede decir esta
                  pantalla. `noLeida` va en `false` porque su texto habla de TODAS las fuentes del
                  home; acá se nombra la que falló. */}
              <div style={PAGINA.atencion}><BarraAtencion chips={chips} noLeida={false} /></div>
              {(pendientesCuenta.error || sinCuit.error) && (
                <p className="mb-5 text-[12px] text-warn" style={{ padding: '0 20px' }} data-testid="atencion-sin-lectura">
                  No pude contar {pendientesCuenta.error ? 'los nombres sin resolver' : 'los proveedores sin CUIT'}:
                  esta pantalla no puede afirmar que no haya nada que resolver.
                </p>
              )}

              {(comprado.error || subcontratistas.error) && (
                <p className="mb-3 text-[12px] text-warn" style={{ padding: '0 20px' }} data-testid="cartera-sin-derivados">
                  {comprado.error
                    ? 'No pude leer lo comprado por proveedor: esa columna no dice nada, y ningún «sin compras» de esta lista significa que no se le compró.'
                    : 'No pude leer los paquetes de subcontrato: esta lista no puede decir quién es subcontratista.'}
                </p>
              )}

              {/* TRES COLUMNAS NO SE ESTIRAN A 1440. `LAYOUT_RESPONSIVE.md`: «una tabla de dos
                  columnas estirada a 1440 es ilegible». Con el panel abierto la lista usa lo que le
                  queda; con el panel cerrado se acota, para que el nombre y su CUIT sigan siendo la
                  misma fila para el ojo. */}
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start" style={{ padding: '0 20px 20px' }}>
                <div className="min-w-0 flex-1">
                  {/* La tabla dibuja su propio estado vacío DENTRO de la caja («Nada coincide.»,
                      `22:148`): sacarlo afuera dejaba la caja de la tabla sin tabla y el mensaje
                      flotando sobre el fondo. */}
                  <TablaProveedores
                    proveedores={proveedores}
                    seleccionado={seleccionado?.id}
                    hrefDe={(id) => armarHref(sp, { p: id })}
                    comprado={comprado.data}
                    subcontratistas={subcontratistas.data}
                    resumen={resumen}
                  />
                  <Ayuda titulo="Qué identifica a un proveedor" testid="ayuda-proveedores">
                    El CUIT, no el nombre: «Corralón Progreso», «CORRALON PROGRESO» y «Corralon
                    Progreso SRL» son tres textos y un proveedor. Dos fichas con el mismo CUIT no
                    pueden existir. Los nombres que llegan de Compras se resuelven contra este
                    maestro, y sin CUIT el proveedor no cruza con ARCA ni con el banco.{' '}
                    El canónico dibuja además RUBRO y PAPELES: ninguna de las dos tiene fuente
                    —<code>proveedores</code> no guarda rubro, y ninguna tabla vincula un archivo
                    con un proveedor—, así que no se dibujan vacías. Lo COMPRADO es histórico, no
                    de los últimos 12 meses: la vista que lo suma no publica la fecha de cada
                    comprobante.
                  </Ayuda>
                </div>
                {panelAbierto && (
                  <PanelProveedor
                    proveedor={seleccionado}
                    compras={compras}
                    crear={crearProveedor}
                    editar={seleccionado ? editarProveedor.bind(null, seleccionado.id) : crearProveedor}
                    archivar={archivarProveedor}
                    cerrarHref={armarHref(sp, { p: undefined })}
                  />
                )}
              </div>
            </>
          )
        : (
            <div style={{ padding: '0 20px 20px' }}>
              {pendientesCuenta.error
                ? (
                    <div data-testid="cola-error">
                      <Aviso tono="neg" titulo="No pude leer los nombres de compras">{pendientesCuenta.error}</Aviso>
                    </div>
                  )
                : (
                    <>
                      <p className="mb-3 text-[12px] text-muted" data-testid="cola-total">
                        {cola.length} {cola.length === 1 ? 'nombre' : 'nombres'} sin proveedor ·{' '}
                        {cola.reduce((a, n) => a + n.comprobantes, 0)} comprobantes ·{' '}
                        {plata(cola.reduce((a, n) => a + Number(n.total ?? 0), 0))}
                      </p>
                      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
                        <div className="min-w-0 flex-1">
                          <TablaNombres
                            pendientes={cola}
                            seleccionado={nombreAbierto?.nombre_norm}
                            hrefDe={(n) => armarHref(sp, { n, bq: undefined })}
                          />
                          <NombresResueltos resueltos={resueltos?.data ?? []} deshacer={deshacerResolucion} />
                        </div>
                        {nombreAbierto && (
                          <PanelNombre
                            nombre={nombreAbierto}
                            candidatos={candidatos.data ?? []}
                            busqueda={sp.bq}
                            accionBuscar="/administracion/proveedores"
                            camposBuscar={{ vista: 'resolver', n: nombreAbierto.nombre_norm }}
                            cerrarHref={armarHref(sp, { n: undefined, bq: undefined })}
                            vincular={vincularNombre}
                            crearYVincular={crearYVincular}
                            noEsProveedor={marcarNoEsProveedor}
                          />
                        )}
                      </div>
                    </>
                  )}
              <Ayuda titulo="Por qué hay nombres sin resolver" testid="ayuda-resolver">
                Vienen de la columna de proveedor de Compras, que es texto libre. El OS no los
                vincula solo: reconoce el nombre escrito exactamente igual, nunca por parecido.
                Resolver uno resuelve sus N comprobantes de una vez.
              </Ayuda>
            </div>
          )}
    </Marco>
  )
}

/**
 * EL MARCO DEL CANON: fondo #F7F7F5 a toda la altura y nada más. `SelloDatoBueno` viene de
 * `PageShell`, que esta pantalla ya no usa — sin él, `error.tsx` pierde la hora del último dato
 * bueno y muestra una pantalla de error que no sabe desde cuándo está rota.
 */
function Marco({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: C.fondo, display: 'flex', flexDirection: 'column' }}>
      <SelloDatoBueno />
      {children}
    </div>
  )
}
