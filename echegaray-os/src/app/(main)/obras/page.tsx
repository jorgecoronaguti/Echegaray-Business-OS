// 01 OBRAS · RESUMEN — la cartera entera en una pantalla, y nada más que eso.
//
// El dueño (20/08), textual: *"Quiero una vista ejecutiva MUY limpia de todas las obras. NO
// desplegar actividades. NO convertir esto en dashboard. NO meter todos los dominios."* El título
// es OBRAS porque es el área donde uno está parado; «Portafolio» nombraba una de seis vistas que ya
// no existen.
//
// ═══ OBRA Y CLIENTE SON DOS COLUMNAS, NO UNA ═══
//
// Hasta hoy la primera columna se llamaba «Obra / Cliente» y apilaba los dos adentro del MISMO
// enlace, que iba a la obra. Eso no era un apretón de espacio: era decir que el cliente es un
// atributo de la obra. Es al revés —la obra cuelga del cliente, y por eso `obra_panel` trae
// `cliente_id`—, y con los dos en un solo link el CRM del cliente quedaba inalcanzable desde acá.
// Tres obras de La Estrella se leían como tres textos parecidos en vez de como un cliente con tres
// obras.
//
//   Click en OBRA    → workspace de la obra
//   Click en CLIENTE → ficha CRM del cliente
//
// SIN FICHA NO HAY ENLACE. Una obra puede tener el cliente escrito a mano (`cliente_texto`) sin
// fila en `clientes`: se muestra el texto, sin link. Un enlace a `/clientes/null` sería una promesa
// que termina en 404, y el usuario aprende a no tocar los links de esta columna.
//
// LO QUE NO SE MUESTRA, Y ES DELIBERADO: margen, estado, impedimentos y cantidad de actividades.
// Nada de eso se decide mirando la cartera; se decide DENTRO de la obra, con su detalle al lado.
//
// LO COMERCIAL DEPENDE DEL ROL, Y NO POR LA PANTALLA. «Contratado» sólo lo ve Administración, y el
// filtro NO es este `esAdmin`: el dato ya viene en NULL desde `obra_panel`, que lo enmascara en
// Postgres (ver `20260819T0400_economia_comercial_solo_administracion.sql`). Acá sólo se evita
// dibujar una columna de guiones. Si esta condición se borrara por accidente, un jefe de obra vería
// una columna vacía — no el número.
//
// FUENTE: la vista `obra_panel`, que sale de `obra_canonica` cruzada con `obra_costo_real`. NO se
// lee `public.obras` legacy —era la tabla con 4 obras pausadas que hacía que la web dijera "0 obras
// activas" mientras cuatro obras facturaban $287M—, y tampoco `obra_canonica` cruda: un `select('*')`
// sobre ella devuelve 403 para todos, Administración incluida.

import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getPortafolio, getPlanVsRealPortafolio } from '@/features/obras/services/obrasService'
import { ETAPA_LABEL, type ObraPanel, type PlanVsReal } from '@/features/obras/types'
import { fecha, plata } from '@/features/obras/components/formato'
import { NavObras } from '@/features/obras/components/NavObras'
import { RecordarVista } from '@/features/obras/components/RecordarVista'
import { PageShell, Callout } from '@/shared/components/ui'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { esCampo, ordenar, type Direccion } from '@/features/obras/services/ordenObras'
import { ThOrden } from '@/features/obras/components/ThOrden'
import { filtrar, filtroDesde } from '@/features/obras/services/filtroObras'
import { FiltrosObras } from '@/features/obras/components/FiltrosObras'

export const dynamic = 'force-dynamic'

/**
 * PLAZO — una de las dos preguntas que hacen que el resumen sirva de tablero: ¿esta obra llega?
 * Sale de `obra_plan_vs_real`, la misma vista que la ficha, y NO se recalcula acá: si el resumen
 * hiciera su propia cuenta, un día diría una cosa distinta de la ficha de la obra y no habría
 * manera de saber cuál de las dos miente.
 */
function Plazo({ p }: { p: PlanVsReal | undefined }) {
  if (!p) return <span className="text-[12px] text-faint">—</span>
  if (p.desvio_plazo_dias != null) {
    const d = p.desvio_plazo_dias
    return (
      <span className={`text-[12px] tabular-nums ${d > 0 ? 'font-semibold text-neg' : 'text-pos'}`}>
        {d > 0 ? `+${d} d` : d < 0 ? `${d} d` : 'en fecha'}
      </span>
    )
  }
  // SIN LÍNEA BASE NO HAY DESVÍO, Y UN CERO SERÍA UNA MENTIRA PROLIJA: diría "vamos en fecha"
  // cuando nadie aprobó todavía una fecha contra la cual medir.
  return (
    <span className="text-[12px] text-faint">
      {p.fin_plan ? `fin ${fecha(p.fin_plan)}` : 'sin fechas'}
      <span className="block text-[11px]">sin línea base</span>
    </span>
  )
}

/** La etapa se lee de un vistazo por su posición en la línea, no por un color arbitrario. */
function Etapa({ etapa }: { etapa: ObraPanel['etapa'] }) {
  // Sin etapa declarada NO se dibuja una: el default de la columna ponía "Desarrollo" hasta en una
  // obra cerrada, y un default presentado como estado del ciclo de vida es un dato fabricado.
  if (!etapa) return <span className="text-[12px] text-faint">etapa sin declarar</span>
  const orden = ['previo', 'inicio', 'desarrollo', 'terminacion', 'cierre']
  const i = orden.indexOf(etapa)
  return (
    <span className="inline-flex items-center gap-1.5" title={ETAPA_LABEL[etapa]}>
      <span className="flex gap-[3px]">
        {orden.map((_, k) => (
          <i key={k} className={`h-1.5 w-1.5 rounded-full ${k <= i ? 'bg-slate-700' : 'bg-slate-200'}`} />
        ))}
      </span>
      <span className="text-[12px] text-muted">{ETAPA_LABEL[etapa]}</span>
    </span>
  )
}

// EL AVANCE, SIN LA COBERTURA. Hasta el 19/08 esta celda publicaba también «24/80» —sobre cuántas
// actividades se tomó el promedio—, y era correcto: un promedio sin su población es medio dato. Se
// saca de ACÁ igual, porque contar actividades es exactamente el tipo de detalle que el dueño mandó
// bajar al workspace de la obra. La cobertura sigue publicada en la ficha, al lado del cronograma
// que la explica. El cálculo no cambia: sigue siendo la vista `obra_avance`, la única del OS.
function Avance({ pct, total }: { pct: number | null; total: number }) {
  if (pct == null) {
    return <span className="text-[12px] text-faint">{total ? 'sin avance cargado' : 'sin cronograma'}</span>
  }
  return (
    <span className="flex items-center gap-2">
      <span className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-slate-100">
        <span className="block h-full rounded-full bg-sky-600" style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className="w-9 shrink-0 text-right text-[12px] tabular-nums text-ink">{pct}%</span>
    </span>
  )
}

/**
 * LA CELDA DEL CLIENTE — el segundo eje de la jerarquía, y la única puerta al CRM desde esta
 * pantalla.
 *
 * El cliente que manda es el CANÓNICO (`cliente_slug` + `cliente_nombre`). `cliente_texto` es lo
 * que decía la fuente y se conserva como procedencia: tres obras de La Estrella eran tres cadenas
 * iguales de casualidad, no un cliente. Cuando sólo existe el texto se muestra el texto y no se
 * enlaza — vincularlo es trabajo de Administración, no una suposición de esta tabla.
 */
function Cliente({ o }: { o: ObraPanel }) {
  if (o.cliente_slug && o.cliente_nombre) {
    return (
      <Link href={`/clientes/${o.cliente_slug}`} className="text-[13px] text-ink hover:underline">
        {o.cliente_nombre}
      </Link>
    )
  }
  const texto = o.cliente_nombre ?? o.cliente_texto
  if (texto) return <span className="text-[13px] text-muted">{texto}</span>
  return <span className="text-[12px] text-faint">sin cliente declarado</span>
}

export default async function ObrasPage({
  searchParams,
}: {
  searchParams: Promise<{ archivadas?: string; orden?: string; dir?: string; etapa?: string; q?: string }>
}) {
  const sp = await searchParams
  const { archivadas: verArchivadas, orden: ordenPedido, dir: dirPedida } = sp
  const filtro = filtroDesde(sp)
  const conArchivadas = verArchivadas === '1'
  // EL ORDEN VIENE DE LA URL Y SE VALIDA. Un `?orden=sueldo` escrito a mano no ordena por nada: la
  // pantalla vuelve al orden de la fuente en vez de romperse o de inventar una columna.
  const orden = esCampo(ordenPedido) ? ordenPedido : null
  const dir: Direccion = dirPedida === 'asc' ? 'asc' : 'desc'

  const supabase = await createClient()
  // LAS TRES LECTURAS SALEN JUNTAS, Y LA DEL PERFIL TAMBIÉN (19/08/2026).
  //
  // El perfil se esperaba SOLO y recién después salían las dos consultas de datos. Eran dos viajes
  // encadenados a Supabase (`auth.getUser` y `perfiles`) delante de todo lo demás, y ninguna de las
  // otras dos consultas los necesita: `obra_panel` y `obra_plan_vs_real` filtran por RLS en la base,
  // con la sesión que ya viaja en la cookie. El perfil acá decide una cosa sola —si se DIBUJA la
  // columna comercial—, y eso se sabe al renderizar, no antes de leer.
  //
  // Contra Vercel esa cascada se paga cara: la función corre en iad1 y la base está en São Paulo, así
  // que cada viaje encadenado son ~120 ms de puro cable. En paralelo, la pantalla espera el más
  // lento en vez de la suma.
  const [perfil, { data, error }, { data: planes }] = await Promise.all([
    getPerfilActual(supabase),
    getPortafolio(supabase),
    getPlanVsRealPortafolio(supabase),
  ])
  // El nivel del usuario decide si se DIBUJA la columna comercial. El dato ya viene enmascarado de
  // Postgres; esto sólo evita una columna de guiones. Falla al nivel MENOS privilegiado.
  const esAdmin = esAdministracion(perfil.data?.rol ?? null)
  const todas = data ?? []
  const porObra = new Map((planes ?? []).map((p) => [p.obra_id, p]))

  // ARCHIVADA = `cerrada`. La obra terminada sale de la cartera; la `pausada` NO — sigue siendo un
  // compromiso abierto aunque hoy no avance, y esconderla sería esconder trabajo pendiente.
  //
  // El filtro se aplica ACÁ y no en la consulta a propósito: `getPortafolio` es la misma lectura que
  // usa el resto del OS, y una obra que desaparece de la fuente desaparece también de los totales.
  // Lo que cambia es qué se muestra, nunca qué existe.
  const archivadas = todas.filter((o) => o.estado === 'cerrada')
  const visibles = conArchivadas ? todas : todas.filter((o) => o.estado !== 'cerrada')
  // EL ORDEN SE APLICA DESPUÉS DE FILTRAR Y SOBRE UNA COPIA: `todas` es la lectura compartida y el
  // pie de archivadas la sigue contando. El desvío de plazo no vive en la fila —llega de la otra
  // consulta—, así que se le pasa como función en vez de fusionar las dos tablas para poder ordenar.
  // FILTRAR PRIMERO, ORDENAR DESPUÉS: ordenar trece filas para tirar diez es trabajo al pedo, y el
  // contador de "N de M" tiene que contar sobre lo que se ve, no sobre lo que se leyó.
  const enFiltro = filtrar(visibles, filtro)
  const obras = ordenar(enFiltro, orden, dir, (id) => porObra.get(id)?.desvio_plazo_dias ?? null)
  const activas = obras.filter((o) => o.estado === 'activa')

  // Lo que hay que conservar al tocar un encabezado o una pastilla: el resto de la vista.
  const qBase = {
    archivadas: conArchivadas ? '1' : undefined,
    etapa: filtro.etapa ?? undefined,
    q: filtro.q || undefined,
  }
  // Mostrar u ocultar las archivadas NO tiene por qué perder el orden que el que mira eligió.
  const qOrden = orden ? `?orden=${orden}&dir=${dir}` : ''

  return (
    <PageShell
      title="OBRAS"
      subtitle={`${activas.length} obra${activas.length === 1 ? '' : 's'} en curso. El avance sale del tracker de Drive; el costo, de Compras por obra.`}
      // LA PUERTA DEL ALTA. `/obras/nueva` existía y sólo se llegaba tipeando la URL, que es
      // exactamente una pantalla «preparada para» — el dueño las prohibió. Sólo Administración crea
      // obras: la RLS lo rechaza igual, y un botón que falla es peor que un botón que no está.
      right={esAdmin ? (
        <Link
          href="/obras/nueva"
          data-testid="alta-obra-nueva"
          className="rounded-control bg-slate-900 px-3.5 py-1.5 text-[13px] font-medium text-white"
        >+ Nueva obra</Link>
      ) : undefined}
    >
      {/* NIVEL 2 DEL ÁREA: Resumen y Gantt. Nada más entra en esta barra. */}
      {/* GUARDA CÓMO QUEDÓ ESTA VISTA. Es lo único que corre en el navegador de esta pantalla, y
          está acá y no en el middleware porque una precarga de Next no monta nada: sólo se guarda
          lo que alguien está mirando de verdad. Ver `components/RecordarVista.tsx`. */}
      <RecordarVista />
      <NavObras />

      {/* La barra va entre la navegación y la tabla: es una decisión sobre lo que se está por leer.
          Con una sola obra no aparece — filtrar una lista de uno es chrome. */}
      {!error && visibles.length > 1 && (
        <FiltrosObras filtro={filtro} base="/obras" resultados={obras.length} total={visibles.length}
          extra={{ archivadas: conArchivadas ? '1' : undefined, orden: orden ?? undefined, dir: orden ? dir : undefined }} />
      )}

      {error && <Callout tono="neg">No pude leer las obras: {error}</Callout>}

      {!error && todas.length === 0 && (
        <Callout tono="info">Todavía no hay obras cargadas en el eje canónico.</Callout>
      )}

      {!error && todas.length > 0 && obras.length === 0 && (
        <Callout tono="info">Todas las obras están archivadas.</Callout>
      )}

      {obras.length > 0 && (
        // `overflow-hidden` RECORTABA la tabla en el teléfono: a 390px desaparecían las columnas de
        // la derecha —todo lo que esta pantalla existe para mostrar— y sin manera de llegar a ellas.
        // Con `overflow-x-auto` se desplaza por dentro y la PÁGINA no se corre de costado.
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table data-testid="portafolio-tabla" className="w-full min-w-[680px] text-left">
            <thead>
              {/* TODAS LAS COLUMNAS ORDENAN. `extra` conserva `archivadas`: cambiar el orden no
                  puede hacer desaparecer las obras que se acababan de mostrar. */}
              <tr className="border-b border-line text-[10px] uppercase tracking-wide text-faint">
                <ThOrden campo="nombre" activo={orden} dir={dir} base="/obras" extra={qBase} className="!px-4" />
                <ThOrden campo="cliente" activo={orden} dir={dir} base="/obras" extra={qBase} />
                <ThOrden campo="etapa" activo={orden} dir={dir} base="/obras" extra={qBase} />
                <ThOrden campo="avance" activo={orden} dir={dir} base="/obras" extra={qBase} />
                <ThOrden campo="plazo" activo={orden} dir={dir} base="/obras" extra={qBase} />
                {esAdmin && <ThOrden campo="contratado" activo={orden} dir={dir} base="/obras" extra={qBase} alineado="right" />}
                <ThOrden campo="costo" activo={orden} dir={dir} base="/obras" extra={qBase} alineado="right" />
              </tr>
            </thead>
            <tbody>
              {obras.map((o) => (
                <tr key={o.obra_id} data-obra={o.obra_id} className="border-b border-line/60 last:border-0 hover:bg-surface-quiet">
                  <td className="px-4 py-2.5">
                    <Link href={`/obras/${o.obra_id}`} className="text-[13px] font-semibold text-ink hover:underline">
                      {o.nombre}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5"><Cliente o={o} /></td>
                  <td className="px-3 py-2.5"><Etapa etapa={o.etapa} /></td>
                  <td className="px-3 py-2.5"><Avance pct={o.avance_pct} total={o.n_actividades} /></td>
                  <td className="px-3 py-2.5"><Plazo p={porObra.get(o.obra_id)} /></td>
                  {esAdmin && (
                    <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-muted">{plata(o.monto_contratado)}</td>
                  )}
                  <td className="px-3 py-2.5 text-right text-[12px] tabular-nums text-ink">{plata(o.costo_real)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* LO QUE FALTA SE DICE, no se disimula con un cero. Un contratado en "—" es un contrato que
          nadie cargó, y es distinto de un contrato de $0. */}
      {esAdmin && obras.some((o) => o.monto_contratado == null) && (
        <p className="mt-3 text-[12px] text-faint">
          Las obras sin monto contratado no lo tienen cargado en ninguna fuente del OS — no es que valgan cero.
        </p>
      )}

      {/* LA PUERTA DE VUELTA. Una obra archivada no tiene que ser una obra perdida: el conteo dice
          cuántas hay y el enlace las trae. Sin esto, archivar sería indistinguible de borrar para
          quien mira la pantalla — que es la única prueba que le importa al que la usa. */}
      {archivadas.length > 0 && (
        <p className="mt-3 text-[12px] text-faint" data-testid="pie-archivadas">
          {conArchivadas ? (
            <>
              Se muestran también {archivadas.length} obra{archivadas.length === 1 ? '' : 's'} archivada{archivadas.length === 1 ? '' : 's'}.{' '}
              <Link href={`/obras${qOrden}`} className="text-ink underline underline-offset-2">Ocultarlas</Link>.
            </>
          ) : (
            <>
              {archivadas.length} obra{archivadas.length === 1 ? '' : 's'} archivada{archivadas.length === 1 ? '' : 's'} fuera de esta lista.{' '}
              <Link href={`/obras?archivadas=1${qOrden ? `&${qOrden.slice(1)}` : ''}`} className="text-ink underline underline-offset-2" data-testid="ver-archivadas">Verlas</Link>.
            </>
          )}
        </p>
      )}
    </PageShell>
  )
}
