// LAS CARAS DE LA FICHA DE UN CLIENTE — `CRM · Clientes · una pantalla.dc.html` (113-166).
//
// Obras y presupuestos, con la grilla LITERAL del handoff v4. Cada columna cita su ancho.
//
// ═══ LA TABLA CONTESTA «QUÉ SE ENCARGÓ Y QUÉ LLEVA GASTADO» (dueño, 12/09/2026) ═══
//
// «Necesito que cada obra tenga, así como las HH que lleva, los costos de obra aparejados: en una
// columna que sume materiales gastados y mano de obra en otra; eso de estado que has puesto como
// columna no me sirve.» Y a las 13:10: «incluso la columna de cobrado neto no me es un dato que
// sirve verlo, porque para eso está la sección especial de cobranzas.»
//
// TRABAJO · INICIO · HH · MATERIALES · MANO DE OBRA · CONTRATADO. Seis columnas, una pregunta cada
// una: qué es, desde cuándo, cuánto trabajo lleva, cuánto material se compró, cuánto costó la gente
// y por cuánto se vendió.
//
// ═══ LO QUE SE FUE, Y A DÓNDE ═══
//
//   ESTADO        el dueño lo sacó con nombre. Sigue DECIDIENDO la tabla —las obras se agrupan en
//                 «en curso» y «Terminados · N», que es el estado leído una vez y dicho en el rótulo
//                 del grupo— y `obra_canonica.estado` sigue viajando en la fila. Lo que se fue es la
//                 columna que repetía en cada renglón lo que el encabezado del grupo ya dice.
//   COBRADO NETO  a la solapa Cobranzas, que es su casa: ahí está el cobro con su imputación, su
//                 vencido y su próximo cobro. Acá era una cifra sin su contexto al lado de una
//                 columna de costo, invitando a restar dos cosas que no se restan.
//   AVANCE        es del ERP: se mide contra el cronograma y se decide con el jefe de obra.
//   MARGEN        «quitá esa columna Margen, no es útil» (10/09/2026). El margen de una obra se mide
//                 contra su costo REAL y su forecast, en el módulo Obras.
//
// ═══ EL COSTO VUELVE, Y ESTA VEZ CON SU FUENTE DECLARADA ═══
//
// Hasta el 10/09/2026 esta tabla tenía «Costo MO» y «Costo mat.» y se retiraron con el argumento de
// que la ficha del cliente es la cara COMERCIAL. El dueño decidió otra cosa el 12/09: el costo de lo
// que le encargó cada cliente se lee acá. La diferencia con las columnas retiradas es de FUENTE y de
// honestidad: MATERIALES sale de las MISMAS filas de Compras que el «costo real» de la ficha de la
// obra (sin nómina, sin anuladas y sin subcontratos, y el `title` lo dice) y MANO DE OBRA se
// valoriza con la MISMA regla que la solapa «Costo a la obra» de Liquidación. Ninguna de las dos
// publica un número que no pueda explicar: cuando no se puede valorizar, lo dice con palabras.
//
// ═══ EL IMPORTE NO MUTA DE PREGUNTA SEGÚN QUIÉN MIRE ═══
//
//   LA ETAPA      EN LA COLUMNA DEL IMPORTE. Hasta el 06/09/2026, un jefe de obra veía la ETAPA de la
//                 obra donde va CONTRATADO, y el rótulo mutaba de «Contratado» a «Etapa». Se leía
//                 como una tabla distinta según quién mirara, y contestaba una pregunta que nadie
//                 había hecho para tapar la que no puede contestar. El handoff decide otra cosa: la
//                 columna es siempre CONTRATADO y la celda dice `sin permiso` (`dc.html:112` para el
//                 rótulo fijo, `751/760/771/796/813/885/898/924` para el literal). El permiso NO
//                 cambia — el `monto_contratado` sigue cerrado por GRANT de columna, y esto sólo
//                 cambia la palabra con la que la pantalla admite que no lo tiene.

import Link from 'next/link'
import { ALTO_V2, CAJA_CONTENIDO, ENCABEZADO, FILO_BLOQUEA, RotuloCol, V } from '@/shared/components/v2/patron'
import { IconoObra, IconoPresupuesto } from '@/shared/components/iconos'
import { plata } from '@/features/obras/components/formato'
import { ContratadoDeLaFicha } from './CeldaContratadoFicha'
import { MarcaAdicional } from './MarcaAdicional'
import { consolidar, jerarquiaDeObras } from '../services/obrasAdicionales'
import { inicioDeObra, textoHH, tituloHH, type HorasDeObra } from '../services/horasDeObra'
import {
  textoManoObra, textoMateriales, tituloManoObra, tituloMateriales, type CostoDeObra,
} from '../services/costosDeObra'
import type { ObraPanel } from '@/features/obras/types'
import type { EconomiaDeObra } from '../services/economiaObras'
import { baseContractualDe } from '@/features/clientes/services/economiaObras'
import type { PapelesDelCliente } from '../services/papelesCliente'
import { OrdenesDeLaObra } from './OrdenesDeLaObra'
import { CeldaHH } from './CeldaHH'

// ═══ LA GRILLA: DOS ANCHOS Y UN SCROLLER, Y CADA NÚMERO SALE DE UNA CUENTA ═══
//
// Seis columnas de contenido más la pista de 28px del menú. El nombre se lleva 2fr y tiene un piso de
// 180px: es lo que identifica la fila, y con las pistas elásticas a 390px quedaba en 48px y se leía
// «B..», «L..», «P..» (medido el 05/09/2026 sobre la captura).
//
// Las pistas fijas suman 64+72+112+112+148+28 = 536px; con el piso del nombre y seis `gap` de 16 la
// demanda es 812px. El ancho útil de esta ficha es `viewport − 393` (20+20 de `CuerpoDeFicha` y
// 300+24+1+28 del costado), así que a 1440px hay 1068px: entra con aire.
//
// ═══ A 400px NO SE ESCONDE NINGUNA COLUMNA: LA TABLA RUEDA DENTRO DE SU CAJA ═══
//
// Hasta hoy el teléfono se resolvía escondiendo pistas y quedaba OBRA · ESTADO · CONTRATADO. Con las
// dos columnas de costo puestas, esconder sería esconder justo lo que el dueño pidió ver. La tabla
// entera va en su propio `overflow-x` con un `min-width` que deja el nombre legible, que es el mismo
// patrón que ya usa la solapa «Costo a la obra» de Liquidación («sin el scroller empujan la página
// entera»). La página NO se desplaza de costado —eso lo mide `tests/shell-dos-areas.spec.ts`—: rueda
// la tabla.
//
// ═══ LA PLANTILLA SIN PREFIJO ES LA ENTERA, Y ESO NO ES UN GUSTO (09/09/2026) ═══
//
// Con ocho celdas dibujadas siempre y una plantilla de tres pistas como estado por defecto, las
// celdas sobrantes caían en filas implícitas y —como el encabezado y la fila llevan alto FIJO— se
// dibujaban ENCIMA de la fila de abajo: «CONTRATADO» y «COSTO MAT.» quedaban tapados por el importe
// de la primera obra (`qa-shots/verif-opacidad2-10-cliente-ficha.png`). Escrita de ancho entero
// hacia abajo, el peor caso de una media query que no llega es una tabla apretada, nunca superpuesta.
//
// ═══ POR QUÉ `minmax(0,…)` Y NO ANCHOS FIJOS ═══
//
// Con `minmax(0,X)` la pista cede cuando no hay lugar en vez de desbordar; el único piso que se
// defiende es el del nombre. Las dos columnas de costo miden 112px porque «$154.248.233» —el
// material de La Estrella, el mayor de la cartera— mide 86px en la mono de 12px: una cifra truncada
// es una cifra falsa, y ya pasó con el cobrado en 80px (captura de producción, 10/09/2026 18:10).
const COLS_OBRAS
  = 'gap-[16px] grid-cols-[minmax(180px,2fr)_minmax(0,64px)_minmax(0,72px)_minmax(0,112px)_minmax(0,112px)_minmax(0,148px)_minmax(0,28px)]'
  // Por debajo de 1200px se suelta el INICIO: de las columnas nuevas es la que menos decide —cuándo
  // arrancó no cambia lo que hay que hacer hoy— y el resto se queda, que es lo que el dueño pidió ver.
  + ' max-[1199px]:gap-[12px] max-[1199px]:grid-cols-[minmax(0,1.4fr)_minmax(0,72px)_minmax(0,108px)_minmax(0,108px)_minmax(0,132px)_28px]'
  // EL PISO DEL SCROLLER: 180 del nombre + 448 de pistas + 60 de gaps = 688. Por debajo de eso la
  // tabla rueda; el nombre nunca baja de 180px.
  + ' max-[559px]:min-w-[688px]'

/** LA CELDA QUE SE SUELTA EN EL CORTE DE 1199, con su pista: el INICIO. El nombre viene de cuando
 *  acá se soltaba la economía de OBRAS (Costo MO, Costo mat., OP) y se conserva porque es el corte,
 *  no la columna, lo que nombra. Una celda sin pista se dibuja ENCIMA de la fila de abajo —ya pasó,
 *  y se leyó como un importe tapado por otro (`qa-shots/verif-opacidad2-10-cliente-ficha.png`)—,
 *  así que cada celda escondida acá tiene que corresponder a una pista que desaparece acá. */
const SOLO_ANCHO_ECO = 'max-[1199px]:hidden'

/** Lo que la tabla de PRESUPUESTOS esconde en el teléfono. Ya no lo usa la de Trabajos: ahí no se
 *  esconde ninguna columna —son las que el dueño pidió ver— y la tabla rueda dentro de su caja. */
const SOLO_ANCHO = 'max-[559px]:hidden'

// EL RESPIRO DE LA DERECHA CUANDO LA TABLA RUEDA. En la pantalla ancha lo da la pista de 28px del
// menú; dentro del scroller el importe queda pegado al borde y se lee como si estuviera cortado.
const AIRE_DERECHO = 'max-[559px]:pr-4'

/** DE DÓNDE SALE LA FECHA DE INICIO. Una columna de fechas en un CRM invita a creer que es la fecha
 *  del contrato; acá es la primera vez que alguien cargó horas, que es lo único que prueba que el
 *  trabajo arrancó. */
const AYUDA_INICIO = 'Cuándo ARRANCÓ el trabajo: la primera fecha con horas cargadas (registros_hh). '
  + 'Apagada = todavía no tiene ninguna hora y la fecha que se ve es la PREVISTA en la obra. No es la '
  + 'fecha del contrato ni la del presupuesto.'

/** LAS HH SON LAS MISMAS QUE LA SOLAPA PERSONAL DE LA OBRA, y el `title` lo dice con el nombre de la
 *  vista: es la única forma de que el día que los dos números se separen, alguien sepa dónde mirar. */
const AYUDA_HH = 'Horas hombre acumuladas imputadas a este trabajo (obra_plan_vs_real.hh_real, la '
  + 'MISMA cifra que «HH real» en la solapa Personal de la obra). Las ausencias y las licencias no '
  + 'cuentan: no son trabajo. Con plan cargado se escribe «real / plan». Vacío = no puedo leerlas; '
  + '«—» = ninguna hora cargada.'

/** DE DÓNDE SALE CADA PESO DE MATERIALES. El `title` nombra la fuente y lo que NO entra: sin eso, la
 *  diferencia contra el «costo real» de la ficha de la obra —que sí suma la nómina imputada— se lee
 *  como un error de alguno de los dos números. El detalle por comprobante lo arma `costosDeObra.ts`. */
const AYUDA_MATERIALES = 'Lo comprado e imputado a este trabajo en la pestaña Compras (las MISMAS '
  + 'filas que el «costo real» de la ficha de la obra, puenteadas por obra_alias). No entran nómina, '
  + 'cargas, ARCA ni financiero, ni las filas anuladas, ni el rubro «Subcontratos y mano de obra», '
  + 'que se nombra aparte. «—» = ninguna compra imputada; vacío = no puedo leerlo.'

/** LA MANO DE OBRA ES LA DE LIQUIDACIÓN, y el `title` lo dice con el nombre de la solapa: es la única
 *  forma de que el día que los dos números se separen, alguien sepa dónde mirar. */
const AYUDA_MANO_OBRA = 'Las horas propias de este trabajo valorizadas con la MISMA regla que la '
  + 'solapa «Costo a la obra» de Liquidación: valor hora vigente de cada persona × horas × '
  + 'multiplicador de cargas. «sin valorizar» = hay horas cargadas y falta el dato para convertirlas '
  + 'en costo (las alícuotas, o la tarifa de alguien); ámbar = el número está incompleto y el detalle '
  + 'dice cuánto falta. La mano de obra facturada por terceros NO está acá: va nombrada en Materiales.'

/** La sangría del handoff (`dc.html:113`, `padding-left:16px`), que reemplaza los 13 del v2. */
const SANGRIA = 16

// ═══ `avanceDeObra` SE RETIRÓ CON SU COLUMNA (10/09/2026) ═══
//
// Traducía `avance_pct` a «94 %», «sin medir» o «sin cronograma». Es una regla del ERP y su casa es
// `features/obras`, donde el avance se mide contra el plan. Dejarla acá servida era la invitación a
// que la columna volviera al CRM sin que nadie lo decidiera.

/** TRABAJO · INICIO · HH · MATERIALES · MANO DE OBRA · CONTRATADO · [acciones]. */
export function ObrasDelCliente({
  obras, veEconomia, vacio, economia = null, papeles = null, titulo, hrefTrabajo,
  horas = null, costos = null, hrefDesgloseHH,
}: {
  obras: ObraPanel[]
  /** Adónde va la fila: el detalle del trabajo DENTRO del CRM. Sin esto, al ERP — que es de donde
   *  el dueño mandó separar esta pantalla. */
  hrefTrabajo?: (obraId: string) => string
  /** Los papeles del cliente ya agrupados. `null` = no se pudieron leer o no hay ninguno; en los
   *  dos casos la celda queda vacía, y quien dice «no pude leerlos» es la página. */
  papeles?: PapelesDelCliente | null
  /** El rótulo del grupo, cuando esta tabla dibuja un tramo y no la lista entera («Cerradas · 6»).
   *  Sin él no se dibuja encabezado de grupo: la tabla es la lista. */
  titulo?: string
  /** El jefe de obra no ve el precio de venta. Lo decide la RLS; acá se deja de dibujar la columna. */
  veEconomia: boolean
  vacio: string
  /** Lo que OBRAS publica por obra (`obra_economia_cartera`). `null` = no se pudo leer. */
  economia?: Map<string, EconomiaDeObra> | null
  /**
   * LAS HORAS DE CADA TRABAJO (`hh_obra` de `pantalla_cliente`). `null` = no puedo decirlas —la cara
   * no las transporta, o el rol no las ve enteras— y entonces la celda queda VACÍA. Un trabajo sin
   * horas cargadas sí está en el Map y se dibuja «—»: las dos ausencias no se leen igual.
   */
  horas?: Map<string, HorasDeObra> | null
  /**
   * LO GASTADO EN CADA TRABAJO (`costo_obra` de `pantalla_cliente`). `null` = no puedo decirlo —la
   * cara no lo transporta, o el rol no es Administración— y entonces las dos celdas quedan VACÍAS.
   * Un trabajo SIN compras y SIN horas no está en el Map y se dibuja «—»: las dos ausencias no se
   * leen igual, y confundirlas diría «esta obra no gastó nada» sobre una obra de $ 154 M.
   */
  costos?: Map<string, CostoDeObra> | null
  /** Adónde lleva el número de HH: el desglose persona × día DENTRO del CRM. Sin esta función el
   *  número se dibuja igual y no navega — una tabla que no puede explicar su número sigue siendo
   *  mejor que ninguna. */
  hrefDesgloseHH?: (obraId: string) => string
}) {
  return (
    // ═══ A 400px LA TABLA RUEDA DENTRO DE SU CAJA, Y LA PÁGINA NO SE MUEVE ═══
    //
    // Seis columnas no entran en un teléfono y ninguna es decorativa: esconderlas sería esconder lo
    // que el dueño pidió ver. Sin el scroller, la grilla empuja la página entera de costado y el
    // control de `tests/shell-dos-areas.spec.ts` (`scrollWidth <= innerWidth`) se pone rojo. Es el
    // mismo patrón de la solapa «Costo a la obra» de Liquidación.
    <div data-testid="obras-del-cliente" className="max-[559px]:overflow-x-auto">
      {/* EL RÓTULO DEL GRUPO. Las obras CERRADAS se listan siempre, debajo de las que están en
          ejecución, porque son la historia de lo que se le vendió a este cliente: «ME - BASES
          TANQUE SO2» tiene su OC 1864, su OP 4865 y sus dos facturas, y hasta hoy vivía detrás de
          `?archivadas=1` —o sea, invisible—. Cerrada no es archivada. */}
      {titulo && (
        <p data-testid="titulo-grupo-obras" style={{ fontSize: '11px', letterSpacing: '0.06em', textTransform: 'uppercase', color: V.tenue, padding: '18px 0 2px', paddingLeft: SANGRIA }}>
          {titulo}
        </p>
      )}
      <div className={`grid ${COLS_OBRAS} ${AIRE_DERECHO}`} style={{ ...ENCABEZADO, gap: undefined, paddingLeft: SANGRIA }}>
        <RotuloCol>Trabajo</RotuloCol>
        <span className={`grid ${SOLO_ANCHO_ECO}`} title={AYUDA_INICIO}><RotuloCol>Inicio</RotuloCol></span>
        <span className="grid" title={AYUDA_HH}><RotuloCol derecha>HH</RotuloCol></span>
        {/* ═══ LAS DOS COLUMNAS DE COSTO (dueño, 12/09/2026) ═══

            «Los costos de obra aparejados: en una columna que sume materiales gastados y mano de
            obra en otra.» Van JUNTAS y antes del contratado: las dos son costo, y lo que se lee de
            corrido es «esto me costó, por esto lo vendí». */}
        <span className="grid" title={AYUDA_MATERIALES}><RotuloCol derecha>Materiales</RotuloCol></span>
        <span className="grid" title={AYUDA_MANO_OBRA}><RotuloCol derecha>Mano de obra</RotuloCol></span>
        <RotuloCol derecha>Contratado</RotuloCol>
        <span />
      </div>

      {obras.length === 0 && (
        <p style={{ fontSize: '12.5px', color: V.apagado, paddingTop: 10 }} data-testid="obras-cliente-vacio">
          {vacio}
        </p>
      )}

      {/* EL ADICIONAL SE DIBUJA DEBAJO DE SU OBRA MAYOR (dueño, 11/09/2026), con sangría y rótulo.
          La relación la decide `obra_canonica.obra_padre_id` y el orden `jerarquiaDeObras` —la MISMA
          función que usa la cartera de `/clientes`—. Sin la migración 20260911T2000 aplicada ninguna
          obra trae padre y esto dibuja la lista de siempre. */}
      {jerarquiaDeObras(obras).map((fila) => {
        const o = fila.obra
        // EL PRECIO ES EL DE OBRAS (la OC de Cobranzas) Y NADA MÁS (H1, 10/09/2026). El respaldo
        // `obra_panel.monto_contratado` —el campo del formulario— se retiró: era la segunda
        // definición del contratado, la que sumaba $31,8 M de Messina en el panel lateral mientras
        // la lista decía $156,1 M. Una obra sin precio en OBRAS lo dice; no se rellena con otra cosa.
        const e = economia?.get(o.obra_id) ?? null
        // La misma base que la cartera y el KPI de arriba (auditor, 11/09/2026).
        const contratado = baseContractualDe(e)
        // UNA OBRA CERRADA SIN PRECIO NO BLOQUEA NADA. El filo ámbar y el «sin precio en OBRAS»
        // existen para que alguien cargue el monto de una obra que se está ejecutando; sobre una
        // obra terminada hace dos años son una alarma que nadie puede apagar — y en el grupo
        // «Cerradas» eran seis alarmas seguidas. Ahí el hueco se dice con un «—» y se calla.
        const papelesDeLaObra = papeles?.porObra.get(o.obra_id) ?? null
        // LAS HORAS DE ESTE TRABAJO y su fecha de arranque. `horas === null` es «no puedo decirlo» y
        // se distingue de «este trabajo no tiene ninguna» en las celdas, no acá.
        const hhDeLaObra = horas?.get(o.obra_id) ?? null
        // EL PLAN SALE DE LA OBRA, que ya viaja en esta misma fila (`obra_panel.fecha_inicio_plan`):
        // no hace falta pedirlo y es la fecha que el módulo Obras publica como inicio planificado.
        const inicio = inicioDeObra(hhDeLaObra, o.fecha_inicio_plan)
        // LO GASTADO EN ESTE TRABAJO. `costos === null` es «no puedo decirlo» y se distingue de «este
        // trabajo no tiene nada imputado» en las celdas, no acá.
        const costoDeLaObra = costos?.get(o.obra_id) ?? null
        // EL TEXTO Y EL ÁMBAR LOS DECIDE `costosDeObra.ts`, con sus tests: la celda no sabe qué
        // significa un hueco.
        const manoObra = textoManoObra(costoDeLaObra)
        const cerrada = o.estado === 'cerrada'
        return (
        <Link
          key={o.obra_id}
          // EL TRABAJO SE ABRE EN EL CRM. Iba a `/obras/<id>`: un clic y el dueño estaba en el ERP
          // sin haber pedido irse. El puente al módulo Obras está, nombrado, en la fila.
          href={hrefTrabajo ? hrefTrabajo(o.obra_id) : `/obras/${o.obra_id}`}
          prefetch={false} data-testid="fila-obra-cliente"
          className={`grid items-center ${CAJA_CONTENIDO} ${COLS_OBRAS} ${AIRE_DERECHO} hover:bg-[#F2F1ED]`}
          style={{
            // `minHeight`: con las OC debajo del nombre la fila tiene DOS líneas, y a 390px los
            // números se apilan. Con `height` clavado el segundo renglón queda cortado por abajo.
            // EL SEGUNDO RENGLÓN SUMA ALTO, venga de las OC o del consolidado de los adicionales: con
            // el alto de una línea, el renglón de abajo se dibuja sobre la fila siguiente.
            minHeight: papelesDeLaObra?.oc.length || fila.hijos.length ? ALTO_V2.cara + 14 : ALTO_V2.cara,
            // UN PASO DE 24px (grid de 8) PARA EL ADICIONAL: es lo único que dice «cuelga de la fila
            // de arriba» sin agregar un nivel de navegación ni una tarjeta.
            paddingLeft: fila.nivel ? SANGRIA + 24 : SANGRIA,
            borderBottom: `1px solid ${V.lineaFila}`,
            // Una obra sin monto contratado bloquea: no se puede decir qué se le facturó al cliente.
            boxShadow: veEconomia && contratado == null && !cerrada ? FILO_BLOQUEA : 'none',
          }}
        >
          {/* EL NOMBRE, Y DEBAJO LOS NÚMEROS DE SUS OC (dueño, 10/09/2026 16:20). Mismo componente
              que la lista de `/clientes`: dos rótulos parecidos del mismo papel se separan en
              cuanto uno aprende algo, y ya pasó una vez con las dos tablas de cartera. */}
          <span style={{
            display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
            minWidth: 0, overflow: 'hidden',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
                <IconoObra className="h-[15px] w-[15px]" />
              </span>
              <span className="truncate" style={{ fontSize: '12.5px', fontWeight: 500, color: V.tinta }}>
                {o.nombre}
              </span>
              {fila.esAdicional && <MarcaAdicional huerfano={fila.huerfano} />}
              {/* ═══ «VER EN OBRAS» NO CUELGA DE CADA FILA (dueño, 10/09/2026 18:12) ═══

                  Repetía el enlace al ERP tantas veces como trabajos tiene el cliente, y el módulo
                  del que hay que separarse terminaba nombrado en toda la pantalla. El puente existe
                  UNA vez: adentro del detalle del trabajo, y en el encabezado de su grupo de
                  Cobranzas. */}
            </span>
            <OrdenesDeLaObra ordenes={papelesDeLaObra?.oc ?? []} veEconomia={veEconomia} sangria={24} />
          </span>

          {/* ═══ INICIO Y HH — LO QUE EL CRM NO SABÍA DECIR (dueño, 11/09/2026) ═══

              La fecha es la PRIMERA con horas cargadas y las HH son las acumuladas del trabajo, las
              dos de la misma fuente (`registros_hh`, vía `obra_plan_vs_real` para la suma). Cada
              obra publica LO SUYO: un adicional muestra sus horas y su obra mayor no las suma, porque
              el jornal se cargó contra una sola de las dos.

              Quien decide el texto es `services/horasDeObra.ts`, con sus tests: acá no hay ninguna
              regla sobre qué significa un hueco. */}
          <span
            data-testid="inicio-obra-cliente"
            title={inicio.titulo ?? AYUDA_INICIO}
            className={`truncate font-mono tabular-nums ${SOLO_ANCHO_ECO}`}
            style={{ fontSize: '11.5px', color: inicio.planeado ? V.tenue : V.tintaSuave }}
          >
            {horas === null ? '' : inicio.texto}
          </span>

          {/* EL NÚMERO DE HH LLEVA AL DESGLOSE de quién cargó horas cada día (`?hh=<obra>`): «que de
              ahí me lleve a un desglose de la obra entera con las personas por día que participaron
              de las HH» (dueño, 11/09/2026 18:38). */}
          <span className="flex items-center justify-end" data-testid="hh-obra-cliente">
            {/* VACÍO NO ES «—»: sin permiso o en una cara que no las transporta, la celda calla. Un
                «—» diría que nadie cargó horas, y la obra puede tener 12.525. */}
            {horas === null ? null : (
              <CeldaHH
                texto={textoHH(hhDeLaObra)}
                ayuda={tituloHH(hhDeLaObra) ?? AYUDA_HH}
                href={hhDeLaObra?.hhReal != null && hrefDesgloseHH ? hrefDesgloseHH(o.obra_id) : null}
              />
            )}
          </span>

          {/* ═══ MATERIALES Y MANO DE OBRA (dueño, 12/09/2026) ═══

              Las dos celdas DELEGAN en `services/costosDeObra.ts`, que es donde están los tests de
              qué dice cada hueco: acá no se decide si un null es un cero. Y las dos callan —vacío,
              no «—»— cuando `costos === null`: sin permiso o en una cara que no los transporta, un
              «—» afirmaría que esta obra no gastó nada.

              SÓLO QUIEN VE ECONOMÍA VE COSTO. Es la misma puerta que el contratado: un rol sin
              economía no ve el precio de venta, y mucho menos el costo. */}
          <span
            data-testid="materiales-obra-cliente"
            title={tituloMateriales(costoDeLaObra) ?? AYUDA_MATERIALES}
            className="truncate font-mono tabular-nums"
            style={{ fontSize: '12px', color: V.tintaSuave, textAlign: 'right' }}
          >
            {costos === null || !veEconomia ? '' : textoMateriales(costoDeLaObra)}
          </span>

          {/* ÁMBAR = RECLAMA TRABAJO, y acá el trabajo es cargar un dato que existe: las alícuotas de
              costo o la tarifa de alguien. No es rojo —nada está mal— ni tinta plena, que diría que
              el número está completo. */}
          <span
            data-testid="mano-obra-obra-cliente"
            title={tituloManoObra(costoDeLaObra, hhDeLaObra?.inicioReal) ?? AYUDA_MANO_OBRA}
            className={`truncate tabular-nums ${manoObra.texto.startsWith('$') ? 'font-mono' : ''}`}
            style={{
              fontSize: '12px', textAlign: 'right',
              color: manoObra.parcial ? V.warn : V.tintaSuave,
            }}
          >
            {costos === null || !veEconomia ? '' : manoObra.texto}
          </span>

          {/* MONO CUANDO ES UNA CIFRA, TIPOGRAFÍA DE TEXTO CUANDO ES UNA FRASE. «sin precio en
              OBRAS» monoespaciado se lee como la salida de una terminal y al lado de una columna de
              plata parecía otro dato numérico. La celda tiene UNA tipografía por vez y la elige lo
              que hay adentro (dueño, 10/09/2026: «hay mezcla de diseño»). */}
          {veEconomia
            ? <ContratadoDeLaFicha contratado={contratado} cerrada={cerrada} consolidado={consolidar(fila, (h) => baseContractualDe(economia?.get(h.obra_id)))} />
            : (
                <span
                  data-testid="contratado-sin-permiso"
                  className="truncate"
                  style={{ fontSize: '12px', color: V.tenue, textAlign: 'right' }}
                >
                  sin permiso
                </span>
              )}

          {/* LA PISTA DE 28px EXISTE Y VA VACÍA. El handoff pone acá el menú de fila, pero en esta
              ficha no hay ninguna acción de fila cableada para una obra —ni quitar, ni archivar: se
              archiva desde la obra—. Dibujar un `···` que sólo repite el enlace de la fila sería
              inventar una capacidad; reservar la pista es lo que mantiene la grilla exacta. */}
          <span aria-hidden />
        </Link>
        )
      })}
    </div>
  )
}

export interface PresupuestoDeFicha {
  presupuesto_id: string
  nombre: string
  estado: string | null
  revision: number | string | null
  total: number | null
  /**
   * El verbo de la fila, YA RESUELTO por la página. Objeto y no función: una arrow creada en un
   * Server Component y pasada como prop compila, pasa `build` y revienta en producción con React
   * #419 dejando la pantalla en blanco.
   */
  accion?: { texto: string; href: string }
}

/**
 * `minmax(210px,1.8fr) 170px 60px 160px minmax(150px,1fr) 28px` con `gap:28px` (`dc.html:143`)
 * necesita 210+170+60+160+150+28 + 5×28 = 918px útiles, o sea 1311px de viewport con el costado
 * puesto. Por eso su breakpoint es más alto que el de Obras: es la lista más ancha de la ficha.
 */
//
// Se escribe de ancho entero hacia abajo por lo mismo que la de Obras: sin prefijo declaraba tres
// pistas contra seis celdas, y ése es el estado que corre cuando una media query no llega.
const COLS_PRES
  = 'gap-[28px] grid-cols-[minmax(210px,1.8fr)_minmax(0,170px)_minmax(0,60px)_minmax(0,160px)_minmax(150px,1fr)_minmax(0,28px)]'
  + ' max-[1319px]:gap-[14px]'
  + ' max-[1319px]:grid-cols-[minmax(0,1.4fr)_minmax(0,90px)_44px_minmax(0,110px)_minmax(0,1fr)_28px]'
  + ' max-[559px]:gap-[10px]'
  + ' max-[559px]:grid-cols-[minmax(0,1fr)_58px_minmax(0,110px)]'

/** El estado del presupuesto, con la tinta del handoff (`dc.html:815`). */
function colorEstadoPresupuesto(estado: string | null): string {
  if (!estado) return V.tenue
  if (estado.startsWith('adjudicada')) return V.tinta
  if (estado.startsWith('perdida')) return V.neg
  return V.apagado
}

/**
 * MOTIVO / DESTINO — LA COLUMNA QUE NO TIENE FUENTE PARA LA MITAD DE SU NOMBRE.
 *
 * DESTINO sí: `cotizacion_cascada.convertida_obra_id` dice en qué obra terminó un presupuesto
 * adjudicado, y ése es un hecho. MOTIVO no: no existe ninguna columna de motivo de pérdida en
 * `cotizacion_cascada`, y `cotizacion_evento.motivo` —el único candidato— tiene 0 filas (medido el
 * 05/09/2026). Así que un presupuesto perdido dice «sin motivo cargado» en APAGADO, no en ámbar:
 * la pérdida ya ocurrió y el dato que falta no bloquea nada, sólo impide aprender de ella.
 *
 * ADJUDICADA Y SIN CONVERTIR SÍ VA EN ÁMBAR: ahí falta trabajo, no un dato. La obra que se vendió
 * todavía no existe en el sistema, y hasta que exista no hay dónde imputarle un peso. Es el aviso
 * que antes cargaba el verbo «Convertir en obra →», que era texto muerto: su href nunca se usó
 * —la fila entera es el enlace al presupuesto— y en el v4 las acciones de fila viven en el menú.
 */
function motivoODestino(p: PresupuestoDeFicha): { texto: string; color: string } {
  // La página arma `accion` a partir de `convertida_obra_id`: un href a `/obras/…` SÓLO existe
  // cuando el presupuesto ya se convirtió. Ése es el destino, y es un hecho de la base.
  if (p.accion?.href.startsWith('/obras/')) return { texto: 'convertida en obra', color: V.apagado }
  if (p.estado?.startsWith('adjudicada')) return { texto: 'sin convertir todavía', color: V.warn }
  if (p.estado?.startsWith('perdida')) return { texto: 'sin motivo cargado', color: V.tenue }
  return { texto: 'sin destino cargado', color: V.tenue }
}

/** PRESUPUESTO · ESTADO · REV. · PRECIO DE VENTA · MOTIVO / DESTINO · [acciones]. `dc.html:143-165`. */
export function PresupuestosDelCliente({ filas }: { filas: PresupuestoDeFicha[] }) {
  return (
    <div data-testid="presupuestos-del-cliente">
      <div className={`grid ${COLS_PRES} ${AIRE_DERECHO}`} style={{ ...ENCABEZADO, gap: undefined, paddingLeft: SANGRIA }}>
        <RotuloCol>Presupuesto</RotuloCol>
        <RotuloCol>Estado</RotuloCol>
        <span className={`grid ${SOLO_ANCHO}`}><RotuloCol derecha>Rev.</RotuloCol></span>
        <RotuloCol derecha>Precio de venta</RotuloCol>
        <span className={`grid ${SOLO_ANCHO}`}><RotuloCol>Motivo / destino</RotuloCol></span>
        <span className={SOLO_ANCHO} />
      </div>

      {filas.length === 0 && (
        <p style={{ fontSize: '12.5px', color: V.apagado, paddingTop: 10 }} data-testid="presupuestos-vacio">
          Este cliente no tiene ningún presupuesto cargado.
        </p>
      )}

      {filas.map((p) => {
        const destino = motivoODestino(p)
        return (
          <Link
            key={p.presupuesto_id} href={`/presupuestos/${p.presupuesto_id}`} prefetch={false}
            data-testid="fila-presupuesto"
            className={`grid items-center ${CAJA_CONTENIDO} ${COLS_PRES} ${AIRE_DERECHO} hover:bg-[#F2F1ED]`}
            style={{ height: ALTO_V2.cara, paddingLeft: SANGRIA, borderBottom: `1px solid ${V.lineaFila}` }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
                <IconoPresupuesto className="h-[15px] w-[15px]" />
              </span>
              <span className="truncate" style={{ fontSize: '12.5px', fontWeight: 500, color: V.tinta }}>
                {p.nombre}
              </span>
            </span>

            <span className="truncate" style={{ fontSize: '12px', color: colorEstadoPresupuesto(p.estado) }}>
              {p.estado ?? 'sin estado'}
            </span>

            {/* REV. — «—» es «no tiene revisiones», que es distinto de «revisión 0». */}
            <span
              className={`font-mono tabular-nums ${SOLO_ANCHO}`}
              style={{ fontSize: '12px', color: p.revision == null ? V.inerte : V.apagado, textAlign: 'right' }}
              data-testid="rev-presupuesto"
            >
              {p.revision ?? '—'}
            </span>

            {/* SIN TOTAL NO ES $ 0: el presupuesto existe y todavía no está valorizado. */}
            <span
              className="font-mono tabular-nums truncate"
              style={{ fontSize: '12px', color: p.total == null ? V.tenue : V.tinta, textAlign: 'right' }}
            >
              {p.total == null ? 'sin valorizar' : plata(p.total)}
            </span>

            <span
              className={`truncate ${SOLO_ANCHO}`}
              title={destino.texto}
              data-testid="destino-presupuesto"
              style={{ fontSize: '12px', color: destino.color }}
            >
              {destino.texto}
            </span>

            {/* Misma pista vacía que en Obras, y por el mismo motivo: no hay acción de fila. */}
            <span aria-hidden className={SOLO_ANCHO} />
          </Link>
        )
      })}
    </div>
  )
}
