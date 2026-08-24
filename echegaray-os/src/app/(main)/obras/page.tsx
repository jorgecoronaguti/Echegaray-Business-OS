// 01 OBRAS · CARTERA — encontrar y abrir una obra. Nada más que eso.
//
// El dueño (20/08), textual: *"Quiero una vista ejecutiva MUY limpia de todas las obras. NO
// desplegar actividades. NO convertir esto en dashboard. NO meter todos los dominios."* El título
// es OBRAS porque es el área donde uno está parado; «Portafolio» nombraba una de seis vistas que ya
// no existen.
//
// ═══ LA TABLA NO VA EN CAJA (Design Handoff V2, `design/screens/obras.md` §1a) ═══
//
// Hasta el 20/08 la tabla vivía dentro de un `rounded-lg border bg-surface`. El handoff lo saca:
// *"Las tablas no van en caja: hairline superior + divisores de fila"*. Un borde alrededor de una
// tabla es una línea más que el ojo tiene que procesar para entender algo que el encabezado y los
// divisores ya dicen solos. Y la cartera es un workspace operativo: usa TODO el ancho, no una
// columna de lectura.
//
// El marcado lo pone el design system (`@/shared/components/ds`) y no este archivo: si mañana la
// fila de tabla pasa de 46 a 44px, cambia en un lugar y cambia en las quince tablas del OS.
//
// ═══ OBRA Y CLIENTE SON DOS COLUMNAS, NO UNA ═══
//
// Hasta hace poco la primera columna se llamaba «Obra / Cliente» y apilaba los dos adentro del
// MISMO enlace, que iba a la obra. Eso no era un apretón de espacio: era decir que el cliente es un
// atributo de la obra. Es al revés —la obra cuelga del cliente, y por eso `obra_panel` trae
// `cliente_id`—, y con los dos en un solo link el CRM del cliente quedaba inalcanzable desde acá.
// Tres obras de La Estrella se leían como tres textos parecidos en vez de como un cliente con tres
// obras.
//
//   Click en OBRA    → workspace de la obra
//   Click en CLIENTE → ficha CRM del cliente
//
// SIN FICHA NO HAY ENLACE. Una obra puede tener el cliente escrito a mano (`cliente_texto`) sin
// fila en `clientes`: se muestra el texto, sin link. Medido contra producción el 20/08/2026,
// «Galpones» es exactamente ese caso: `cliente_slug` en NULL. Un enlace a `/clientes/null` sería
// una promesa que termina en 404, y el usuario aprende a no tocar los links de esta columna.
//
// LO QUE NO SE MUESTRA, Y ES DELIBERADO: margen y cantidad de actividades. Nada de eso se decide
// mirando la cartera; se decide DENTRO de la obra, con su detalle al lado.
//
// ═══ LAS TRES SEÑALES DE HOY (Design canónico 01, defecto de QA del 24/08) ═══
//
// Los impedimentos SÍ entran, y es un cambio de criterio contra la línea de arriba tal como estaba
// escrita el 20/08. La diferencia es qué se muestra de ellos: la cartera no lista impedimentos —eso
// es la solapa de Operación de la obra— sino que dice CUÁNTOS hay abiertos. Un impedimento abierto
// no describe cómo viene la obra: es trabajo trabado esperando que alguien lo libere, y saber en
// cuál de las diecisiete obras está es exactamente para lo que se abre esta pantalla a la mañana.
// Con el mismo criterio entran «HOY» (la obra reportó parte) y «PERSONAS HOY» en el pie.
//
// TRES CONSULTAS PARA TODA LA CARTERA, EN LA MISMA TANDA. El detalle y el porqué de que no lleven
// `.in(obraIds)`, en `services/senalesCarteraService.ts`.
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
import type { ObraPanel } from '@/features/obras/types'
import { plata } from '@/features/obras/components/formato'
import { NavObras } from '@/features/obras/components/NavObras'
import { RecordarVista } from '@/features/obras/components/RecordarVista'
import { PageShell, Callout } from '@/shared/components/ui'
import { Ayuda, BotonEnlace, FilaTotal, Nulo, Num, Tabla, Td, Th, THead, Tr, Valor } from '@/shared/components/ds'
import { getPerfilActual } from '@/features/auth/services/authService'
import { esAdministracion } from '@/features/auth/types/areas'
import { esCampo, ordenar, type Direccion } from '@/features/obras/services/ordenObras'
import { ThOrden } from '@/features/obras/components/ThOrden'
import { esAtrasada, filtrar, filtrarPorAtraso, filtroDesde } from '@/features/obras/services/filtroObras'
import { FiltrosObras, type ConteosObras } from '@/features/obras/components/FiltrosObras'
import { desvioDePlazo, type Semaforo } from '@/features/obras/services/ganttObras'
import { getSenalesCartera } from '@/features/obras/services/senalesCarteraService'
import { personasQueFicharon } from '@/features/obras/services/senalesCartera'
// CÓMO SE ESCRIBE CADA CELDA vive al lado, en `components/celdasCartera`: esta página decide qué se
// lee y con qué permiso, no cómo se dice un hueco.
import {
  Avance, Cliente, Etapa, HH, Plazo, SenalHoy, SenalImpedimentos,
} from '@/features/obras/components/celdasCartera'

export const dynamic = 'force-dynamic'

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
  // EL DÍA LO FIJA EL SERVIDOR, igual que en la línea de tiempo: ni el semáforo de plazo ni las
  // señales de hoy pueden depender del reloj del navegador que las mira. Se calcula ANTES de las
  // lecturas porque dos de las tres señales lo necesitan para consultar.
  const hoyIso = new Date().toISOString().slice(0, 10)
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
  //
  // LAS SEÑALES DE HOY VIAJAN EN LA MISMA TANDA, y son TRES CONSULTAS PARA TODA LA CARTERA — nunca
  // una por obra. Ninguna de las tres es la razón por la que se abre esta pantalla, así que ninguna
  // puede empujar la tabla hacia atrás: si una falla, la cartera se dibuja igual y el pie dice qué
  // no se pudo mirar.
  const [perfil, { data, error }, { data: planes }, senales] = await Promise.all([
    getPerfilActual(supabase),
    getPortafolio(supabase),
    getPlanVsRealPortafolio(supabase),
    getSenalesCartera(supabase, hoyIso),
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
  /** EL SEMÁFORO DE CADA OBRA, calculado UNA vez: lo usan la columna de estado, el filtro y el
   *  conteo del chip. Tres cuentas separadas del mismo estado se separan el día que una cambie. */
  const semaforoDe = (o: ObraPanel): Semaforo => {
    const p = porObra.get(o.obra_id)
    return desvioDePlazo(
      p?.inicio_plan ?? o.fecha_inicio_plan,
      p?.fin_plan ?? o.fecha_fin_plan,
      o.avance_pct,
      hoyIso,
    ).semaforo
  }
  const semaforos = new Map(visibles.map((o) => [o.obra_id, semaforoDe(o)]))
  const semaforo = (o: ObraPanel) => semaforos.get(o.obra_id) ?? 'sin_datos'

  const enFiltro = filtrarPorAtraso(filtrar(visibles, filtro), filtro, semaforo)
  const obras = ordenar(enFiltro, orden, dir, (id) => porObra.get(id)?.desvio_plazo_dias ?? null)
  const activas = obras.filter((o) => o.estado === 'activa')

  // PERSONAS HOY se cuenta sobre las obras que SE VEN, igual que el resto del pie: un número que
  // habla de obras que no están en la pantalla no se puede verificar mirándola. Devuelve `null` con
  // cero marcas —«sin fichar» no es «no vino nadie»— y la lectura caída se distingue aparte, porque
  // son dos huecos distintos y el pie los escribe con dos palabras distintas.
  const personasHoy = senales.ficharon
    ? personasQueFicharon(senales.ficharon, obras.map((o) => o.obra_id))
    : null

  // LOS CONTEOS DE LOS CHIPS SE CUENTAN SOBRE LA CARTERA VISIBLE, NO SOBRE LO FILTRADO: un chip que
  // dice «Terminación 2» tiene que seguir diciendo 2 después de tocar otro chip. Si contara lo
  // mostrado, todos los chips no puestos caerían a 0 y la barra dejaría de ser un mapa de la cartera.
  const conteos: ConteosObras = {
    todas: visibles.length,
    porEtapa: visibles.reduce<ConteosObras['porEtapa']>((acc, o) => {
      if (o.etapa) acc[o.etapa] = (acc[o.etapa] ?? 0) + 1
      return acc
    }, {}),
    atraso: visibles.filter((o) => esAtrasada(semaforo(o))).length,
  }

  // Lo que hay que conservar al tocar un encabezado o una etapa: el resto de la vista.
  const qBase = {
    archivadas: conArchivadas ? '1' : undefined,
    etapa: filtro.etapa ?? undefined,
    q: filtro.q || undefined,
    atraso: filtro.atraso ? '1' : undefined,
  }
  // Mostrar u ocultar las archivadas NO tiene por qué perder el orden que el que mira eligió.
  const qOrden = orden ? `?orden=${orden}&dir=${dir}` : ''
  const sinContratado = esAdmin && obras.some((o) => o.monto_contratado == null)
  // LA SUMA DEL PIE SÓLO EXISTE PARA ADMINISTRACIÓN, y sobre las obras que TIENEN el monto cargado:
  // el `?? 0` que haría de una obra sin contrato una obra de cero pesos es exactamente el defecto
  // que la columna ya evita fila por fila.
  const conContrato = obras.filter((o) => o.monto_contratado != null)
  const totalContratado = conContrato.reduce((s, o) => s + (o.monto_contratado ?? 0), 0)

  return (
    <PageShell
      title="OBRAS"
      // ═══ EL SUBTÍTULO SE FUE (Design canónico · «mostrar > explicar») ═══
      //
      // Decía de dónde salen el avance y el costo. Es procedencia —se lee una vez y estorba las
      // otras trescientas— y encima empujaba la tabla hacia abajo. Ahora está en la ayuda del pie,
      // que es donde se busca cuando un número no cierra. Lo único que queda arriba es cuántas
      // obras están en curso, que es un DATO de la cartera, no una explicación de la pantalla.
      subtitle={`${activas.length} obra${activas.length === 1 ? '' : 's'} en curso`}
      // LA PUERTA DEL ALTA. `/obras/nueva` existía y sólo se llegaba tipeando la URL, que es
      // exactamente una pantalla «preparada para» — el dueño las prohibió. Sólo Administración crea
      // obras: la RLS lo rechaza igual, y un botón que falla es peor que un botón que no está.
      //
      // ES LA ÚNICA PRIMARIA DE LA PANTALLA, y por eso es la única cosa amarilla que hay acá.
      right={esAdmin ? (
        <BotonEnlace href="/obras/nueva" variante="primaria" data-testid="alta-obra-nueva">+ Nueva obra</BotonEnlace>
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
          conteos={conteos}
          extra={{ archivadas: conArchivadas ? '1' : undefined, orden: orden ?? undefined, dir: orden ? dir : undefined }} />
      )}

      {error && <Callout tono="neg">No pude leer las obras: {error}</Callout>}

      {!error && todas.length === 0 && (
        <Callout tono="info">Todavía no hay obras cargadas en el eje canónico.</Callout>
      )}

      {!error && todas.length > 0 && obras.length === 0 && (
        <Callout tono="info">Ninguna obra coincide con lo que estás filtrando.</Callout>
      )}

      {obras.length > 0 && (
        // `minWidth` hace que el desplazamiento pase por DENTRO de la tabla: a 390px la página no se
        // corre de costado, se corre la tabla. Sin él desaparecían las columnas de la derecha —todo
        // lo que esta pantalla existe para mostrar— y sin manera de llegar a ellas.
        <Tabla testid="portafolio-tabla" minWidth={1060}>
          <THead>
            {/* CASI TODAS LAS COLUMNAS ORDENAN. `qBase` conserva `archivadas`, la etapa, el atraso y
                la búsqueda: cambiar el orden no puede hacer desaparecer las obras que se acababan de
                mostrar. HH no ordena y no es un olvido: el orden por HH necesitaría meter una
                segunda lectura adentro de `ordenar`, que hoy compara sólo columnas de la fila.
                SIN COLUMNA «ESTADO», Y ES DECISIÓN DEL DUEÑO (19/08, textual: «NO: Margen; Estado;
                Impedimentos») — el canon 01 la dibuja, pero acá Etapa ya cuenta el ciclo de vida y
                los chips de arriba cuentan el estado con su conteo. El spec obras-ejecucion.spec.ts
                vigila que no vuelva. */}
            <ThOrden campo="nombre" activo={orden} dir={dir} base="/obras" extra={qBase} className="w-[20%]" />
            <ThOrden campo="cliente" activo={orden} dir={dir} base="/obras" extra={qBase} className="w-[13%]" />
            <ThOrden campo="etapa" activo={orden} dir={dir} base="/obras" extra={qBase} className="w-[13%]" />
            <ThOrden campo="avance" activo={orden} dir={dir} base="/obras" extra={qBase} className="w-[14%]" />
            <ThOrden campo="plazo" activo={orden} dir={dir} base="/obras" extra={qBase} className="w-[10%]" />
            <Th num className="w-[10%]">HH</Th>
            {esAdmin && <ThOrden campo="contratado" activo={orden} dir={dir} base="/obras" extra={qBase} alineado="right" />}
            <ThOrden campo="costo" activo={orden} dir={dir} base="/obras" extra={qBase} alineado="right" className="w-[10%]" />
          </THead>
          <tbody>
            {obras.map((o) => (
              <Tr key={o.obra_id} data-obra={o.obra_id}>
                {/* LAS DOS SEÑALES DE HOY VAN PEGADAS AL NOMBRE y no en dos columnas propias como
                    en el canon: la tabla ya tiene nueve columnas y 1060px de ancho mínimo, y dos
                    más la mandaban al desplazamiento horizontal en cualquier pantalla de trabajo
                    —donde lo primero que se pierde de vista es justamente la punta derecha—. Acá
                    viajan con el nombre de la obra, que es donde el ojo ya está parado. */}
                <Td fuerte>
                  <span className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                    <Link href={`/obras/${o.obra_id}`} prefetch={false} className="font-semibold text-ink transition-colors hover:underline">
                      {o.nombre}
                    </Link>
                    <SenalHoy conParte={senales.partesHoy?.has(o.obra_id) ?? false} />
                    <SenalImpedimentos n={senales.impedimentos?.get(o.obra_id) ?? 0} />
                  </span>
                </Td>
                <Td><Cliente o={o} /></Td>
                <Td><Etapa etapa={o.etapa} /></Td>
                <Td><Avance pct={o.avance_pct} total={o.n_actividades} /></Td>
                <Td><Plazo p={porObra.get(o.obra_id)} /></Td>
                <Td num className="text-muted"><HH p={porObra.get(o.obra_id)} /></Td>
                {/* LA AUSENCIA SE ESCRIBE: un contratado en «sin cargar» es un contrato que nadie
                    cargó, y es distinto de un contrato de $0. `Valor` es el guarda que impide que
                    un `?? 0` se cuele en una columna de plata. */}
                {esAdmin && (
                  <Td num className="text-muted">
                    <Valor v={o.monto_contratado} falta="sin cargar">{(n) => plata(n)}</Valor>
                  </Td>
                )}
                {/* ═══ «$0» ERA LA AUSENCIA DISFRAZADA DE HECHO (20/08/2026) ═══
                    `costo_real` suma los comprobantes imputados a la obra, y sobre cero filas la
                    vista devuelve 0, no NULL. Medido contra producción hoy: ONCE de trece obras
                    vivas mostraban «$0» y ninguna tiene un solo comprobante imputado. «$0» afirma
                    que la obra no costó nada; la verdad es que todavía no se imputó nada, y son
                    dos cosas distintas — una es un dato y la otra un hueco.
                    NO se inventa nada para arreglarlo: la cobertura viaja en la misma fila
                    (`n_comprobantes`), así que la pantalla puede decir la verdad leyendo lo que ya
                    tiene. Con comprobantes, un total de $0 es un dato y se muestra. */}
                <Td num fuerte>
                  {o.n_comprobantes
                    ? <Valor v={o.costo_real} falta="sin registrar">{(n) => plata(n)}</Valor>
                    : <Nulo>sin comprobantes</Nulo>}
                </Td>
              </Tr>
            ))}
          </tbody>
          {/* ═══ EL PIE DE LA CARTERA (Design canónico 01) ═══
              Cuántas obras hay, cuántas están en ejecución y cuánto suman los contratos. Cuenta lo
              que SE VE: filtrada la cartera, el pie tiene que hablar de lo filtrado o pasa a ser un
              número que no se corresponde con ninguna fila de la pantalla.
              LA SUMA DECLARA SU COBERTURA. Sumar 9 contratos y llamarlo «CONTRATADO» sobre 13 obras
              afirma un total de cartera que nadie cargó: el conteo va al lado del número, y las que
              faltan siguen nombradas en el pie de abajo. */}
          <tfoot>
            <FilaTotal>
              <Td colSpan={esAdmin ? 9 : 8}>
                <span className="flex flex-wrap items-baseline justify-end gap-x-7 gap-y-1 text-[11.5px] font-normal text-faint">
                  <span>OBRAS <Num className="text-ink">{obras.length}</Num></span>
                  <span>EN EJECUCIÓN <Num className="text-ink">{activas.length}</Num></span>
                  {/* ═══ «PERSONAS HOY 0» ERA LA AUSENCIA DISFRAZADA DE HECHO ═══
                      Tres huecos distintos y tres palabras distintas. No se pudo leer la presencia:
                      «sin dato» —un control que no pudo mirar no dice «no está»—. Nadie marcó: «sin
                      fichar», que incluye al que no tiene teléfono y al que no le dio permiso al
                      GPS; quién faltó lo declara el jefe, no la ausencia de un dato. Y con marcas,
                      el número. Medido contra producción el 24/08/2026, `asistencia_marca` tiene
                      dos filas en toda la base: sin esta distinción, el pie diría «0 personas» todos
                      los días mientras las obras cargan partes de avance. */}
                  <span title="Personas con entrada fichada hoy en las obras de esta lista. Sale de `presencia_del_dia`, la misma fuente que «En obra ahora».">
                    PERSONAS HOY{' '}
                    {senales.ficharon == null
                      ? <Nulo>sin dato</Nulo>
                      : personasHoy == null
                        ? <Nulo>sin fichar</Nulo>
                        : <Num className="text-ink">{personasHoy}</Num>}
                  </span>
                  {esAdmin && (
                    <span title={`${conContrato.length} de ${obras.length} obras con monto contratado cargado`}>
                      CONTRATADO{' '}
                      {conContrato.length === 0
                        ? <Nulo>sin cargar</Nulo>
                        : (
                            <>
                              <Num className="text-ink">{plata(totalContratado)}</Num>
                              {conContrato.length < obras.length && (
                                <span className="ml-1.5">de {conContrato.length} de {obras.length}</span>
                              )}
                            </>
                          )}
                    </span>
                  )}
                </span>
              </Td>
            </FilaTotal>
          </tfoot>
        </Tabla>
      )}

      {/* LO QUE NO SE PUDO MIRAR SE DICE. Sin esta línea, una lectura caída se vería exactamente
          igual que una cartera sin partes y sin impedimentos: ninguna señal dibujada. Va debajo de
          la tabla y no en un Callout rojo arriba porque no impide leer la cartera — es una parte de
          la pantalla que hoy no puede hablar, no una pantalla rota. */}
      {senales.sinDato.length > 0 && (
        <p className="mt-3 text-[12px] text-warn" data-testid="senales-sin-dato">
          {senales.sinDato.map((s) => `No pude leer ${s.senal}: ${s.error}`).join(' · ')}
        </p>
      )}

      {/* EL PIE DE LA CARTERA — una línea, dos avisos que son del mismo tipo: lo que NO está en la
          tabla y por qué.
          LA PUERTA DE VUELTA. Una obra archivada no tiene que ser una obra perdida: el conteo dice
          cuántas hay y el enlace las trae. Sin esto, archivar sería indistinguible de borrar para
          quien mira la pantalla — que es la única prueba que le importa al que la usa. */}
      {(archivadas.length > 0 || sinContratado) && (
        <p className="mt-3 text-[12px] text-faint" data-testid="pie-archivadas">
          {archivadas.length > 0 && (conArchivadas ? (
            <>
              Se muestran también {archivadas.length} obra{archivadas.length === 1 ? '' : 's'} archivada{archivadas.length === 1 ? '' : 's'}.{' '}
              <Link href={`/obras${qOrden}`} className="text-ink underline underline-offset-2">Ocultarlas</Link>.{' '}
            </>
          ) : (
            <>
              {archivadas.length} obra{archivadas.length === 1 ? '' : 's'} archivada{archivadas.length === 1 ? '' : 's'} fuera de esta lista.{' '}
              <Link href={`/obras?archivadas=1${qOrden ? `&${qOrden.slice(1)}` : ''}`} className="text-ink underline underline-offset-2" data-testid="ver-archivadas">Verlas</Link>.{' '}
            </>
          ))}
          {sinContratado && 'Las obras sin monto contratado no lo tienen cargado en ninguna fuente del OS — no es que valgan cero.'}
        </p>
      )}

      {/* LA PROCEDENCIA, A UN CLIC. Estaba clavada en el subtítulo, arriba de todo: se lee una vez y
          después empuja la tabla hacia abajo trescientas veces. Acá la encuentra el que necesita
          saber de dónde salió un número que no le cierra, que es cuando se busca. */}
      <Ayuda titulo="De dónde salen estos números" testid="ayuda-cartera">
        El avance sale del tracker de Drive y el costo, de los comprobantes imputados a la obra en
        Compras. El estado «con atraso» compara el avance medido contra el calendario del plan ya
        consumido: es una <strong className="font-medium text-ink">ESTIMACIÓN</strong> —supone el
        trabajo repartido parejo— y ordena la atención, no afirma cuánto se atrasó una obra. Es el
        mismo criterio que pinta las barras de la línea de tiempo.{' '}
        <strong className="font-medium text-ink">HOY</strong> dice que en esa obra se cargó parte de
        ejecución hoy; que no aparezca no dice que la obra esté parada — dice que todavía no hay
        parte. El triángulo cuenta los impedimentos abiertos, los mismos que lista la solapa
        Operación de la obra. Y «personas hoy» son las que ficharon entrada, que no es lo mismo que
        las que trabajaron: quién faltó lo declara el jefe.
      </Ayuda>
    </PageShell>
  )
}
