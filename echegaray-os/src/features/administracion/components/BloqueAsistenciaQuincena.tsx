import Link from 'next/link'
import { Aviso, Vacio } from '@/shared/components/ds'
import { contieneEnAlguno } from '@/shared/utils/busqueda'
import { V } from '@/shared/components/v2/patron'
import { createClient } from '@/lib/supabase/server'
import {
  correrQuincena, diasDeLaQuincenaSinDomingos, esFechaISO, etiquetaDiaCorta, noLaborablesDe,
  nombreDia, quincenaDe, rotuloQuincena,
} from '../services/quincena'
import { getQuincenaPorObra } from '../services/jornadaPorObraService'
import {
  armarQuincenaPorObra, chipsConElegida, diasSinMarcar, filtrarPorObra, OBRA_SIN, personasPorObra, SIN_OBRA,
  totalDeLaQuincena, totalesPorDia,
} from '../services/quincenaPorObra'
import {
  categoriasDelCorte, etiquetaDeLaElegida, filtrarPorCategoria,
} from '../services/recorteDeCategoria'
import { FiltroDeCategoria } from './FiltroDeCategoria'
import type { FilaQuincena } from '../services/quincenaPorObra'
import { GrillaAsistenciaObra } from './GrillaAsistenciaObra'
import { rotuloDeObra } from '@/shared/utils/obra'
import type { ObraConVentana } from '../services/obrasPorFecha'

// LA SOLAPA «ASISTENCIA» DE PERSONAL — la QUINCENA, por obra.
//
// ═══ POR QUÉ ACÁ Y NO EN UNA PANTALLA PROPIA ═══
//
// Es la MISMA población que la solapa Personal —el plantel— mirada por otra pregunta: no «quién
// trabaja acá» sino «cuántas horas puso cada uno en cada obra en esta quincena». Una pantalla nueva
// obligaría a elegir desde el menú entre dos listas de las mismas personas.
//
// ═══ POR QUÉ QUINCENA Y NO SEMANA ═══
//
// El dueño: *"la vista tiene q ser por quincena"*. Los jornales se pagan del 1 al 15 y del 16 a fin
// de mes; una grilla lunes→domingo obliga a sumar dos semanas y media a mano para cerrar contra la
// liquidación, y a decidir qué hacer con la semana que cruza el 15. El corte no se define acá: sale
// de `services/quincena.ts`, que a su vez reusa `ventanaDe('quincena')`.
//
// La quincena viaja en la URL (`?quincena=2026-09-16`): así se puede pasar «mirá la quincena
// pasada» por mensaje, y recargar no devuelve a hoy.

/**
 * LA FILA DICHA EN LOS TÉRMINOS DE LA REGLA, sin perder la fila.
 *
 * El recorte por categoría pregunta si la persona cobra por mes; esta grilla lo sabe como `esJefe`
 * (`cobroMensual.ts`: jefe de obra o neto mensual vigente, y acá el neto no se lee). Se traduce UNA
 * vez y el resultado se usa para filtrar y para contar: con dos traducciones, un jefe podía contar en
 * una pastilla y no aparecer al apretarla.
 */
const conCategoria = (f: FilaQuincena): FilaQuincena & { cobraPorMes: boolean } =>
  ({ ...f, cobraPorMes: f.esJefe })

export async function BloqueAsistenciaQuincena({
  quincenaPedida, hoy, q, obra, categoria, hrefDe, hrefObra, hrefCategoria, puedeCorregir, puedeCambiarObra,
}: {
  /** Cualquier día de la quincena que se quiere ver. Lo que no sea una fecha vuelve a la de hoy. */
  quincenaPedida?: string
  hoy: string
  /** El texto del buscador. Filtra DESPUÉS de armar la grilla — ver abajo. */
  q?: string
  /** `?obra=` — el RÓTULO del chip, o `sin-obra`. Recorta igual que `q`: después de armar. */
  obra?: string
  /** `?categoria=` — la clave del legajo, o uno de los dos cajones de `recorteDeCategoria.ts`.
   *  Significa lo mismo que en el Plantel y en Liquidación: la categoría no cambia de sentido
   *  según la solapa, y por eso ésta es la única de las tres que viaja entre ellas. */
  categoria?: string
  hrefDe: (quincena: string) => string
  /** Esta misma vista con otro recorte de obra. `undefined` lo apaga; lo demás (quincena, texto,
   *  modo) lo conserva la página, que es la dueña de la URL. */
  hrefObra: (obra?: string) => string
  /** Esta misma vista con otro recorte por categoría. `undefined` lo apaga. */
  hrefCategoria: (cambios: Record<string, string | undefined>) => string
  /** Corregir la OBRA de un día es de Administración. La policy decide de verdad; esto evita
   *  ofrecer un botón que va a rebotar contra un `permission denied`. */
  puedeCorregir: boolean
  /** Quién puede mover a una persona de obra: dirección y administración, no el jefe de obra. */
  puedeCambiarObra: boolean
}) {
  const quincena = quincenaDe(esFechaISO(quincenaPedida) ? quincenaPedida : hoy)
  const supabase = await createClient()
  const datos = await getQuincenaPorObra(supabase, quincena.desde, quincena.hasta)

  if (datos.error || !datos.data) {
    // UNA GRILLA VACÍA PORQUE LA CONSULTA FALLÓ se leería como «no trabajó nadie en toda la
    // quincena», que es una afirmación distinta y falsa.
    return (
      <div style={{ padding: '12px 0' }}>
        <Aviso tono="neg" titulo="No pude leer la asistencia de la quincena" testid="asistencia-error">
          {datos.error ?? 'Sin datos.'}
        </Aviso>
      </div>
    )
  }

  // LOS DOMINGOS NO SON COLUMNA. Orden del dueño del 08/09/2026: no se trabaja, sale de la
  // consideración. La ventana que se le pide a la base sigue siendo la quincena ENTERA —abajo
  // `quincena.desde`/`quincena.hasta`—, así que un registro en domingo se lee igual; lo que no
  // hace es ocupar dos casillas de guiones por período.
  const dias = diasDeLaQuincenaSinDomingos(quincena)
  // EL SÁBADO ENTRA A LOS NO LABORABLES. Sin esto se dibujaría «sin marcar» —el rojo que reclama—
  // en todas las filas. Un sábado TRABAJADO se sigue viendo: lo declarado manda sobre el almanaque.
  const noLaborables = noLaborablesDe(dias, datos.data.noLaborables)
  const todas = armarQuincenaPorObra({ ...datos.data, noLaborables, dias, hoy })
  // UNA FILA POR PERSONA: si dos filas comparten `clave`, la grilla está duplicando gente. Es la
  // afirmación que el dueño rechazó en producción, y acá cuesta una línea comprobarla.
  if (new Set(todas.map((f) => f.clave)).size !== todas.length) {
    throw new Error('La grilla armó dos filas para la misma persona.')
  }
  // EL TEXTO FILTRA DESPUÉS DE ARMAR LA GRILLA, nunca antes. Filtrar los registros crudos sacaría a
  // una persona de las celdas de sus propios compañeros y un día marcado pasaría a «sin marcar».
  const porTexto = q?.trim()
    ? todas.filter((f) => contieneEnAlguno([f.persona.nombre, f.rotuloObra, f.persona.nota], q))
    : todas
  // EL RECORTE POR OBRA VA DESPUÉS DEL TEXTO Y SOBRE LA MISMA GRILLA ARMADA — dueño, 10/09/2026.
  // La regla es de `filtrarPorObra`: acá sólo se elige el orden, y el orden importa porque el
  // buscador mira el rótulo de obra: filtrar por obra primero no cambiaría el resultado, pero
  // partiría en dos la única regla de «se recorta lo dibujado, nunca lo crudo».
  // ═══ EL RECORTE POR CATEGORÍA (dueño, 17/09/2026) ═══
  //
  // Va DESPUÉS del texto y de la obra, sobre la misma grilla ya armada: la regla de esta pantalla es
  // «se recorta lo dibujado, nunca lo crudo», y filtrar los registros antes de armar sacaría a una
  // persona de las celdas de sus compañeros.
  //
  // `deLaFila` traduce la fila a lo que la regla necesita, y lo hace UNA sola vez para el filtro y
  // para las pastillas: con dos traducciones, un jefe podía contar en «Fuera de convenio» y no
  // aparecer al apretarla.
  const categoriaElegida = categoria?.trim() || undefined
  const filas = filtrarPorCategoria(filtrarPorObra(porTexto, obra).map(conCategoria), categoriaElegida)
  // EL VALOR DE LA URL, NORMALIZADO AL TOKEN DEL CHIP. `sin-obra` y el rótulo largo «Sin obra
  // activa» piden el mismo recorte —una URL que ya se compartió por mensaje no puede morir porque
  // se acortó el token—, y el chip que se marca activo tiene que ser el mismo en los dos casos.
  const pedida = obra?.trim() ?? ''
  const elegida = pedida === SIN_OBRA ? OBRA_SIN : pedida
  const rotuloElegido = elegida === OBRA_SIN ? SIN_OBRA : elegida
  // ═══ QUÉ MIDE CADA NÚMERO DE LA PANTALLA (decisión del dueño, 10/09/2026) ═══
  //
  // LOS CHIPS Y «DÍAS SIN CARGAR» SON SIEMPRE DE LA QUINCENA ENTERA (`todas`). Un chip que al
  // activarse pone a los demás en cero deja de ser un filtro, y el reclamo de días sin cargar es de
  // la empresa: esconderlo detrás de un recorte lo haría desaparecer justo cuando se está mirando
  // otra obra.
  //
  // EL PIE —totales por día y total— SIGUE AL FILTRO POR OBRA Y NO AL BUSCADOR. Con una obra
  // elegida el número que se necesita es el de esa obra, y el rótulo lo dice («Total · <obra>»): un
  // total que cambia de población sin cambiar de cartel se lee como el de todos. El texto de `q`
  // NO lo mueve —escribir tres letras no es elegir una población— y por eso el pie mira
  // `paraElPie`, que recorta por obra sobre `todas` y deja el buscador afuera.
  //
  // LOS SUBTOTALES POR GRUPO —Jefes/Obreros— los calcula la grilla sobre las filas que recibe: ésos
  // contestan siempre «lo que estoy viendo».
  //
  // Y EL RECORTE POR CATEGORÍA TAMBIÉN MUEVE EL PIE, por lo mismo que la obra: elegir una categoría
  // es elegir una POBLACIÓN, no buscar un nombre. Con seis filas a la vista, un total que siguiera
  // sumando diecisiete se leería como el de esas seis. El rótulo dice de quién es.
  const paraElPie = filtrarPorCategoria(filtrarPorObra(todas, obra).map(conCategoria), categoriaElegida)
  const totales = totalesPorDia(paraElPie, dias)
  // EL ELEGIDO SIEMPRE ESTÁ ENTRE LOS CHIPS, aunque en esta quincena no alcance a nadie: si no, el
  // filtro queda puesto sin ningún chip activo y no hay qué apretar para sacarlo (dueño, 11/09/2026).
  const chips = chipsConElegida(personasPorObra(todas), elegida)
  // LAS PASTILLAS CUENTAN LA QUINCENA ENTERA, no lo que sobrevive a la obra ni al buscador: la misma
  // regla que los chips de obra, y por el mismo motivo.
  const chipsDeCategoria = categoriasDelCorte(todas.map(conCategoria), categoriaElegida)
  const rotuloCategoria = categoriaElegida ? etiquetaDeLaElegida(categoriaElegida) : null
  // EL TOTAL DICE DE QUIÉN ES. Dos recortes puestos se nombran los dos: «Total · SF - PISOS · Oficial».
  const partesDelTotal = [
    elegida ? (elegida === OBRA_SIN ? 'sin obra' : rotuloElegido) : null,
    rotuloCategoria,
  ].filter((x): x is string => x !== null)
  const sinMarcar = diasSinMarcar(todas)
  // LAS OBRAS A LAS QUE SE PUEDE MOVER UN DÍA: las activas que la sesión ve. La jornada de cada una
  // viaja junta —es lo que vale una ausencia— y sale del mismo viaje, no de dos.
  const { activas: obras, catalogoHoras } = await obrasElegibles(supabase)
  const jornadaPorObra = Object.fromEntries(obras.map((o) => [o.id, o.jornada]))
  const tenues = new Set(noLaborables)

  return (
    <div data-testid="bloque-asistencia">
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 10, padding: '4px 0 12px',
      }}>
        <span style={{ fontSize: '13px', color: V.tinta }} data-testid="rotulo-quincena">
          {rotuloQuincena(quincena)}
        </span>
        <ChipsDeObra chips={chips} elegida={elegida} hrefObra={hrefObra} />
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 12, alignItems: 'baseline' }}>
          {sinMarcar > 0 && (
            <span data-testid="dias-sin-marcar" style={{ fontSize: '12px', color: V.warn }}>
              {/* «SIN CARGAR», NO «SIN MARCAR». Marcar es fichar —la persona, con su teléfono— y
                  el fichaje ni siquiera está en uso; lo que falta acá es que alguien cargue las
                  horas de ese día. El rótulo acusaba del acto equivocado y a quien no fue. */}
              {sinMarcar} {sinMarcar === 1 ? 'día sin cargar' : 'días sin cargar'}
            </span>
          )}
          <Quincenas quincena={quincena} hrefDe={hrefDe} />
        </span>
      </div>

      {/* LA FILA DEL RECORTE POR CATEGORÍA (dueño, 17/09/2026): el mismo control que en el Plantel y
          en Liquidación. LLEVA EL CONTEO porque acá no hay otra fila que diga cuánta gente quedó a
          la vista —los chips de obra cuentan la quincena entera, a propósito—. */}
      <FiltroDeCategoria
        chips={chipsDeCategoria}
        elegida={categoriaElegida}
        hrefDe={hrefCategoria}
        conteo={{ n: filas.length, total: todas.length, sustantivo: 'personas' }}
        nota="El total y los totales por día son los del recorte."
      />

      {filas.length === 0 ? (
        <Vacio>
          {/* EL VACÍO NOMBRA AL RECORTE QUE LO CAUSÓ. Si el texto ya no dejó a nadie, la obra no
              tiene la culpa: por eso se mira `porTexto`, no `todas`. */}
          {rotuloCategoria && filtrarPorObra(porTexto, obra).length > 0
            ? `Nadie de esta quincena es «${rotuloCategoria}». «Todas» vuelve a la lista entera.`
            : elegida && porTexto.length > 0
              ? `Nadie de esta quincena está en «${rotuloElegido}».`
              : q?.trim()
                ? `Ninguna persona de esta quincena coincide con «${q.trim()}».`
                : 'Nadie tiene asignación vigente ni horas cargadas en esta quincena.'}
          {' '}La asistencia se carga por obra, desde{' '}
          <Link href="/campo/asistencia" className="underline">Campo · Asistencia</Link>.
        </Vacio>
      ) : (
        <GrillaAsistenciaObra
          filas={filas}
          dias={dias}
          etiquetas={dias.map(etiquetaDiaCorta)}
          titulos={dias.map(nombreDia)}
          columnasTenues={dias.map((d) => tenues.has(d))}
          totalesDia={totales}
          total={totalDeLaQuincena(paraElPie)}
          rotuloTotal={partesDelTotal.length > 0 ? `Total · ${partesDelTotal.join(' · ')}` : undefined}
          jornadaPorObra={jornadaPorObra}
          obras={obras.map((o) => ({ id: o.id, nombre: o.nombre }))}
          catalogoHoras={catalogoHoras}
          puedeCorregir={puedeCorregir}
          puedeCambiarObra={puedeCambiarObra}
          hoy={hoy}
        />
      )}

      <p style={{ marginTop: 10, fontSize: '11.5px', color: V.tenue, lineHeight: 1.5 }} data-testid="pie-asistencia">
        Cada celda se edita; guarda al salir del campo. Escribí «A» para marcar que no vino: la «A»
        y la «L» son el estado del día y el número es la cantidad de horas; cuando el día no tiene
        horas que mostrar, la letra ocupa el lugar del número.
        {' '}Un marco punteado es un día hábil sin horas cargadas — no es una falta. Un «—» es un
        día no laborable o un día sin ningún registro en ninguna obra: de eso no se puede afirmar ni
        que no se trabajó ni que nadie lo cargó.
      </p>
    </div>
  )
}

/**
 * Las obras a las que se puede mover un día, con su jornada pactada. SÓLO LAS ACTIVAS.
 *
 * Una obra cerrada con un día mal imputado no queda sin salida: «Sacar lo cargado» sigue
 * funcionando sobre la fila que ya existe —el borrado no mira el estado de la obra destino— y para
 * moverlo a otra parte se reabre la obra, que es una decisión que queda registrada.
 */
async function obrasElegibles(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ activas: { id: string; nombre: string; jornada: number }[]; catalogoHoras: ObraConVentana[] }> {
  const columnas = 'id, nombre, codigo, jornada_horas, estado, fecha_inicio_real, fecha_inicio_plan, fecha_fin_real'
  // LA EVIDENCIA DE HORAS VIAJA EN LA MISMA CONSULTA (15/09/2026). La mitad de las obras cerradas no
  // tiene fecha de inicio, y su ventana sale del primer y el último día con horas (`ventanaDe`). Dos
  // embebidos de `registros_hh` con orden y `limit 1` POR OBRA: PostgREST los resuelve como un lateral
  // por el índice de la obra, en una sola ida. Los agregados (`fecha.min()`) no están habilitados en
  // esta base, y una lectura por obra sería un N+1 en la pantalla que el dueño usa todo el día.
  const conEvidencia = await supabase
    .from('obra_canonica')
    .select(`${columnas}, primera:registros_hh(fecha), ultima:registros_hh(fecha)`)
    .order('nombre')
    .order('fecha', { referencedTable: 'primera', ascending: true })
    .limit(1, { referencedTable: 'primera' })
    .order('fecha', { referencedTable: 'ultima', ascending: false })
    .limit(1, { referencedTable: 'ultima' })
  // SI LA EVIDENCIA NO SE PUEDE LEER, LA LISTA NO SE VACÍA: sin esta vuelta, un error del embebido
  // dejaba la grilla sin obras para nadie. Se degrada a las fechas declaradas, que es un no más, no un sí.
  const { data } = conEvidencia.error
    ? await supabase.from('obra_canonica').select(columnas).order('nombre')
    : conEvidencia
  const filas = (data ?? []) as unknown as (ObraConVentana & {
    jornada_horas: number | string | null
    primera?: { fecha: string }[]; ultima?: { fecha: string }[]
  })[]
  // LA MISMA LECTURA ALIMENTA LA LISTA DE OBRAS DE CADA DÍA (dueño, 15/09/2026). Qué entra lo decide
  // `obrasElegiblesEl` con la fecha de la celda, no esta consulta.
  const catalogoHoras: ObraConVentana[] = filas.map((o) => ({
    id: o.id, nombre: rotuloDeObra(o), estado: o.estado, codigo: o.codigo ?? null,
    fecha_inicio_real: o.fecha_inicio_real, fecha_inicio_plan: o.fecha_inicio_plan, fecha_fin_real: o.fecha_fin_real,
    primera_hh: o.primera?.[0]?.fecha ?? null, ultima_hh: o.ultima?.[0]?.fecha ?? null,
  }))
  const activas = filas
    // SÓLO LAS ACTIVAS SE OFRECEN COMO DESTINO. La acción lo rechaza igual —es la puerta— pero un
    // selector que ofrece 40 obras cerradas para que la acción las rebote una por una enseña que la
    // pantalla miente. Una obra cerrada con horas mal imputadas se corrige reabriéndola.
    .filter((o) => o.estado === 'activa')
    .map((o) => {
      const h = Number(o.jornada_horas)
      // «OB-0012 · NOMBRE» desde acá: de esta lista salen el selector de la grilla, la columna OBRA
      // y los chips de obra, así que el rótulo se arma una vez y no en cada lugar que lo dibuja.
      return { id: o.id, nombre: rotuloDeObra(o), jornada: Number.isFinite(h) && h > 0 ? h : 0 }
    })
  return { activas, catalogoHoras }
}

/** «‹ anterior · siguiente ›» salta de QUINCENA, no de quince días — ver `correrQuincena`. */
function Quincenas({ quincena, hrefDe }: {
  quincena: { desde: string; hasta: string }; hrefDe: (q: string) => string
}) {
  return (
    <span style={{ display: 'flex', gap: 10, fontSize: '12px' }}>
      <Link href={hrefDe(correrQuincena(quincena, -1).desde)} prefetch={false}
        data-testid="quincena-anterior" style={{ color: V.apagado }}>
        ‹ anterior
      </Link>
      <Link href={hrefDe(correrQuincena(quincena, 1).desde)} prefetch={false}
        data-testid="quincena-siguiente" style={{ color: V.apagado }}>
        siguiente ›
      </Link>
    </span>
  )
}

/**
 * LOS CHIPS POR OBRA — el filtro que pidió el dueño el 10/09/2026: *«crear filtro por obras para
 * los obreros»*.
 *
 * ═══ POR QUÉ ENLACES Y NO BOTONES ═══
 *
 * El recorte viaja en la URL: se comparte por mensaje —«miralo filtrado por BSA»—, se recarga, y
 * vuelve con el botón de atrás. Es la misma decisión de `FiltrosSuaves`, de donde sale también la
 * marca del activo: tinta plena, negrita y el fondo #F2F1ED, sin un color que no exista ya.
 *
 * ═══ EL NÚMERO SIGUE SIENDO EL DE LA QUINCENA ENTERA ═══
 *
 * Los chips se arman con `todas`, no con el recorte. Un chip que al activarse se queda con su
 * propio número y pone los demás en cero deja de ser un filtro: se vuelve un informe de sí mismo, y
 * quien lo mira ya no puede comparar contra dónde está el resto de la gente.
 */
function ChipsDeObra({ chips, elegida, hrefObra }: {
  chips: { rotulo: string; personas: number }[]
  /** El token activo, ya normalizado (`''` = todas). */
  elegida: string
  hrefObra: (obra?: string) => string
}) {
  const chip = (activo: boolean) => ({
    fontSize: '12px', borderRadius: 999, padding: '2px 9px',
    border: `1px solid ${V.linea}`,
    color: activo ? V.tinta : V.apagado,
    fontWeight: activo ? 600 : 400,
    background: activo ? V.hover : 'transparent',
  })
  return (
    <>
      <Link
        href={hrefObra(undefined)}
        // NO SE PRECARGA: cada chip apunta a esta misma pantalla, que es `force-dynamic`. Precargar
        // dispara un render de servidor entero por chip y el payload no se reusa al hacer clic.
        prefetch={false}
        data-testid="chip-obra-todas"
        aria-current={!elegida ? 'true' : undefined}
        style={chip(!elegida)}
      >
        Todas
      </Link>
      {chips.map((c) => {
        const token = c.rotulo === SIN_OBRA ? OBRA_SIN : c.rotulo
        const activo = elegida === token
        return (
          <Link
            key={c.rotulo}
            // CLIC EN LA OBRA YA ACTIVA LA APAGA. Sin esto el único camino de vuelta a la quincena
            // entera sería borrar el parámetro a mano en la barra de direcciones.
            href={hrefObra(activo ? undefined : token)}
            prefetch={false}
            data-testid="chip-obra"
            aria-current={activo ? 'true' : undefined}
            style={chip(activo)}
          >
            {c.rotulo} <span className="font-mono tabular-nums" style={{ color: V.tenue }}>{c.personas}</span>
          </Link>
        )
      })}
    </>
  )
}
