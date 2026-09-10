// LAS CARAS DE LA FICHA DE UN CLIENTE — `CRM · Clientes · una pantalla.dc.html` (113-166).
//
// Obras y presupuestos, con la grilla LITERAL del handoff v4. Cada columna cita su ancho.
//
// ═══ POR QUÉ AVANCE ES UNA COLUMNA Y NO UN ADORNO DENTRO DE ESTADO ═══
//
// Hasta el 05/09/2026 el avance vivía DENTRO de la celda de estado —punto, palabra, barra de 70px y
// porcentaje, todos con `flexShrink: 0`—. A 390px eso desbordaba sobre el importe y se leía
// «94$246.149.261». Se parcheó con `overflow:hidden`; la solución del diseño es otra: AVANCE es su
// propia pista de 90px (`dc.html:113`). Separada, no hay nada que pueda desbordar sobre el importe,
// y la barra —que era decoración -- desaparece porque el handoff no la dibuja. El `overflow:hidden`
// se queda igual: es defensa barata contra el próximo hijo que no se pueda encoger.
//
// ═══ LO QUE NO SE DIBUJA, Y POR QUÉ ═══
//
//   COSTO REAL   la ficha del cliente es la cara COMERCIAL de la relación —qué se contrató y cómo
//                va—; el costo vive en la obra, que es donde se decide sobre él.
//   JEFE DE OBRA lo dibujaba la versión anterior en el lugar donde el handoff pone AVANCE. El
//                handoff v4 no lo trae: quién la conduce se lee en la obra, y acá le robaba la
//                columna al único dato que contesta «¿cómo va?».
//   AVANCE       nunca es 0 % por falta de cronograma. Una obra sin plan no tiene avance, y lo dice
//                con palabras.
//   LA ETAPA     EN LA COLUMNA DEL IMPORTE. Hasta el 06/09/2026, un jefe de obra veía la ETAPA de la
//                obra donde va CONTRATADO, y el rótulo mutaba de «Contratado» a «Etapa». Se leía
//                como una tabla distinta según quién mirara, y contestaba una pregunta que nadie
//                había hecho para tapar la que no puede contestar. El handoff decide otra cosa: la
//                columna es siempre CONTRATADO y la celda dice `sin permiso` (`dc.html:112` para el
//                rótulo fijo, `751/760/771/796/813/885/898/924` para el literal). El permiso NO
//                cambia — el `monto_contratado` sigue cerrado por GRANT de columna, y esto sólo
//                cambia la palabra con la que la pantalla admite que no lo tiene.

import Link from 'next/link'
import { ALTO_V2, CAJA_CONTENIDO, ENCABEZADO, FILO_BLOQUEA, RotuloCol, V } from '@/shared/components/v2/patron'
import { IconoObra, IconoPresupuesto } from '@/shared/components/iconos'
import { plata } from '@/features/obras/components/formato'
import type { ObraPanel } from '@/features/obras/types'
import { SIN_PRECIO_EN_OBRAS, type EconomiaDeObra } from '../services/economiaObras'
import type { PapelesDelCliente } from '../services/papelesCliente'
import { SIN_PAPELES, TotalDePapeles } from './TotalDePapeles'
import { OrdenesDeLaObra } from './OrdenesDeLaObra'

/**
 * EL ESTADO SE DICE CON LA PALABRA Y SU TINTA, sin punto de color.
 *
 * El handoff colorea el texto (`dc.html:900`: en ejecución tinta plena, pausada ámbar, el resto
 * apagado) y no dibuja ningún bullet. El punto de 6px que había acá era una segunda señal para
 * decir lo mismo, y era uno de los cuatro hijos que no se encogían.
 */
const COLOR_ESTADO_OBRA: Record<string, string> = {
  activa: V.tinta, pausada: V.warn, cerrada: V.apagado,
}

// ═══ LA GRILLA ES LA DEL HANDOFF; EL BREAKPOINT SALE DE UNA CUENTA, NO DE UN GUSTO ═══
//
// `minmax(240px,1.8fr) 150px 90px 170px 28px` con `gap:28px` (`dc.html:113`) necesita
// 240+150+90+170+28 + 4×28 = 790px de ancho ÚTIL. En esta pantalla el ancho útil es
// `viewport − 393` (20+20 de `CuerpoDeFicha` y 300+24+1+28 del costado), así que la grilla exacta
// entra a partir de 1183px de viewport. Por debajo se dibuja la misma lista con las pistas
// elásticas y la mitad del aire: no se esconde ninguna columna porque ninguna es decorativa.
//
// ═══ A 390px NO ALCANZA PARA CINCO COLUMNAS, Y EL NOMBRE NO SE NEGOCIA ═══
//
// Medido el 05/09/2026 sobre la captura: con las cinco pistas elásticas a 390px, el nombre de la
// obra quedaba en 48px y se leía «B..», «L..», «P..». Una fila que no se puede identificar no sirve
// para nada, aunque no desborde. Debajo de 560px se ESCONDE AVANCE —de las tres columnas de estado
// es la que menos decide y la de texto más largo— y la fila queda en OBRA · ESTADO · CONTRATADO,
// que es la pregunta de un teléfono: qué obras tiene y por cuánto.
//
// ═══ LA PLANTILLA SIN PREFIJO ES LA ENTERA, Y ESO NO ES UN GUSTO (09/09/2026) ═══
//
// Hasta hoy esta grilla se escribía al revés que todas las demás del v2: la plantilla sin prefijo
// era la del TELÉFONO —tres pistas— y los anchos se agregaban con dos variantes `min` de ancho.
// Con ocho celdas dibujadas siempre, el estado por defecto de la tabla tenía CINCO CELDAS MÁS QUE
// PISTAS. Y el estado por defecto no es una hipótesis: mientras los cortes por ancho no llegaron al
// CSS emitido (`cortes-por-ancho-llegan-al-css.test.ts`) era el que corría en producción a 1440px.
// Las cinco celdas sobrantes caían en filas implícitas y —como el encabezado y la fila llevan alto
// FIJO (`ENCABEZADO.height`, `ALTO_V2.cara`)— se dibujaban encima de la fila de abajo: «CONTRATADO»
// y «COSTO MAT.» quedaban tapados por el importe de la primera obra
// (`qa-shots/verif-opacidad2-10-cliente-ficha.png`).
//
// Escrita de ancho entero hacia abajo, la degradación es segura: si una media query no llega, se
// dibuja la tabla de escritorio —apretada, nunca superpuesta—, y cada variante de ancho con `hidden` retira su
// celda EN EL MISMO CORTE en que su pista desaparece. Es además la forma en que ya están escritas
// la cartera y Compras.
//
// ═══ POR QUÉ `minmax(0,…)` Y NO ANCHOS FIJOS ═══
//
// Ocho pistas fijas suman 788px + 200 del nombre + 140 de `gap` = 1128, y el ancho útil de esta
// ficha a 1440px de viewport es 1068 (el costado se lleva 300+53): la tabla se salía de su columna
// por 60px aun con los cortes andando. Con `minmax(0,X)` la pista cede cuando no hay lugar en vez
// de desbordar; el único piso que se defiende es el del nombre, que es lo que identifica la fila.
const COLS_OBRAS
  = 'gap-[20px] grid-cols-[minmax(200px,1.8fr)_minmax(0,110px)_minmax(0,80px)_minmax(0,150px)_minmax(0,150px)_minmax(0,150px)_minmax(0,28px)]'
  // Por debajo de 1200px se sueltan OP y MARGEN —lo que se cobró y lo que queda—: la pregunta que
  // sobrevive en una pantalla angosta es qué se le vendió (contratado) y con qué papel (OC).
  // 90px y no 72 para el avance: «sin cronograma» a 11,5px mide 84px y en 72 se cortaba en «sin
  // cronogr…» (medido en la captura de 900px). La pista del handoff ya son 90.
  + ' max-[1199px]:gap-[14px] max-[1199px]:grid-cols-[minmax(0,1.5fr)_minmax(0,90px)_90px_minmax(0,120px)_minmax(0,130px)_28px]'
  // A 390px no entran cinco columnas sin estrangular el nombre: quedan OBRA · ESTADO · CONTRATADO.
  + ' max-[559px]:gap-[10px] max-[559px]:grid-cols-[minmax(0,1fr)_58px_minmax(0,110px)]'

/** Las tres celdas económicas de OBRAS: se sueltan en el mismo corte que sus pistas. */
const SOLO_ANCHO_ECO = 'max-[1199px]:hidden'

/** Lo que se esconde a 390px. Nunca el nombre ni el importe. */
const SOLO_ANCHO = 'max-[559px]:hidden'

// EL RESPIRO DE LA DERECHA A 390px. En la pantalla ancha lo da la pista de 28px del menú; cuando esa
// pista se esconde, el importe queda pegado al borde y se lee como si estuviera cortado.
const AIRE_DERECHO = 'max-[559px]:pr-4'

/** QUÉ SON LAS DOS COLUMNAS NUEVAS, para el que pasa el mouse. Dos rótulos de dos letras no pueden
 *  cargar solos con decir de qué están hablando — y lo que tienen que decir es sobre todo que NO
 *  son la misma fuente que Contratado. */
const AYUDA_OC = 'Órdenes de compra que el cliente mandó por esta obra (los PDF de su mail). EL '
  + 'IMPORTE ES EL TOTAL DEL PDF, CON IVA, y Contratado —de la pestaña OBRAS— es neto: los dos '
  + 'números no se restan. Que no coincidan no es un error de esta pantalla.'
const AYUDA_OP = 'Órdenes de pago del cliente imputadas a esta obra. Una OP no prueba el cobro: '
  + 'eso lo prueba el extracto del banco.'

/** La sangría del handoff (`dc.html:113`, `padding-left:16px`), que reemplaza los 13 del v2. */
const SANGRIA = 16

/**
 * EL AVANCE, DICHO EN 90px.
 *
 * Sin cronograma no hay 0 %: no hay avance, y se dice con palabras. Las palabras tienen que ENTRAR
 * en la pista —«sin avance cargado» se cortaba en «sin avance car…» (medido en la captura del
 * 05/09/2026)—, así que la frase corta va en la celda y la larga en el `title`. «sin medir» es,
 * además, la palabra del propio handoff (`dc.html:896`).
 */
function avanceDeObra(o: ObraPanel): { texto: string; medido: boolean; ayuda: string } {
  if (o.avance_pct != null) {
    return { texto: `${o.avance_pct} %`, medido: true, ayuda: 'Avance físico cargado en el cronograma' }
  }
  if (o.n_actividades) {
    return { texto: 'sin medir', medido: false, ayuda: 'Tiene cronograma y todavía nadie le cargó avance' }
  }
  return { texto: 'sin cronograma', medido: false, ayuda: 'Sin cronograma no hay contra qué medir el avance' }
}

/** OBRA · ESTADO · AVANCE · CONTRATADO · [acciones]. `dc.html:113-135`. */
export function ObrasDelCliente({ obras, veEconomia, vacio, economia = null, papeles = null, titulo }: {
  obras: ObraPanel[]
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
}) {
  return (
    <div data-testid="obras-del-cliente">
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
        <RotuloCol>Obra</RotuloCol>
        <RotuloCol>Estado</RotuloCol>
        <span className={`grid ${SOLO_ANCHO}`}><RotuloCol derecha>Avance</RotuloCol></span>
        <RotuloCol derecha>Contratado</RotuloCol>
        <span className={`grid ${SOLO_ANCHO}`} title={AYUDA_OC}><RotuloCol derecha>OC c/IVA</RotuloCol></span>
        <span className={`grid ${SOLO_ANCHO_ECO}`} title={AYUDA_OP}><RotuloCol derecha>OP c/IVA</RotuloCol></span>
        <span className={SOLO_ANCHO} />
      </div>

      {obras.length === 0 && (
        <p style={{ fontSize: '12.5px', color: V.apagado, paddingTop: 10 }} data-testid="obras-cliente-vacio">
          {vacio}
        </p>
      )}

      {obras.map((o) => {
        const avance = avanceDeObra(o)
        // EL PRECIO ES EL DE OBRAS (la OC de Cobranzas) Y NADA MÁS (H1, 10/09/2026). El respaldo
        // `obra_panel.monto_contratado` —el campo del formulario— se retiró: era la segunda
        // definición del contratado, la que sumaba $31,8 M de Messina en el panel lateral mientras
        // la lista decía $156,1 M. Una obra sin precio en OBRAS lo dice; no se rellena con otra cosa.
        const e = economia?.get(o.obra_id) ?? null
        const contratado = e?.contratado ?? null
        // UNA OBRA CERRADA SIN PRECIO NO BLOQUEA NADA. El filo ámbar y el «sin precio en OBRAS»
        // existen para que alguien cargue el monto de una obra que se está ejecutando; sobre una
        // obra terminada hace dos años son una alarma que nadie puede apagar — y en el grupo
        // «Cerradas» eran seis alarmas seguidas. Ahí el hueco se dice con un «—» y se calla.
        const papelesDeLaObra = papeles?.porObra.get(o.obra_id) ?? null
        const cerrada = o.estado === 'cerrada'
        return (
        <Link
          key={o.obra_id} href={`/obras/${o.obra_id}`} prefetch={false} data-testid="fila-obra-cliente"
          className={`grid items-center ${CAJA_CONTENIDO} ${COLS_OBRAS} ${AIRE_DERECHO} hover:bg-[#F2F1ED]`}
          style={{
            // `minHeight`: con las OC debajo del nombre la fila tiene DOS líneas, y a 390px los
            // números se apilan. Con `height` clavado el segundo renglón queda cortado por abajo.
            minHeight: papelesDeLaObra?.oc.length ? ALTO_V2.cara + 14 : ALTO_V2.cara,
            paddingLeft: SANGRIA, borderBottom: `1px solid ${V.lineaFila}`,
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
            </span>
            <OrdenesDeLaObra ordenes={papelesDeLaObra?.oc ?? []} veEconomia={veEconomia} sangria={24} />
          </span>

          {/* `overflow: hidden` se queda aunque el avance ya no viva acá: es la defensa barata
              contra el próximo hijo que no se pueda encoger. Lo que sacó el desborde de raíz fue
              separar AVANCE en su propia pista. */}
          <span
            data-testid="estado-obra-cliente"
            className="truncate"
            style={{
              fontSize: '12px', color: COLOR_ESTADO_OBRA[o.estado] ?? V.apagado,
              minWidth: 0, overflow: 'hidden',
            }}
          >
            {o.estado}
          </span>

          {/* AVANCE — SIN CRONOGRAMA NO HAY 0 %. La ausencia se dice con palabras y en tenue: no
              bloquea nada, sólo todavía no se midió. */}
          <span
            data-testid="avance-obra-cliente"
            title={avance.ayuda}
            className={`truncate ${SOLO_ANCHO} ${avance.medido ? 'font-mono tabular-nums' : ''}`}
            style={{
              fontSize: avance.medido ? '12px' : '11.5px',
              color: avance.medido ? V.tintaSuave : V.tenue,
              textAlign: 'right',
            }}
          >
            {avance.texto}
          </span>

          {/* MONO CUANDO ES UNA CIFRA, TIPOGRAFÍA DE TEXTO CUANDO ES UNA FRASE. «sin precio en
              OBRAS» monoespaciado se lee como la salida de una terminal y al lado de una columna de
              plata parecía otro dato numérico. La celda tiene UNA tipografía por vez y la elige lo
              que hay adentro (dueño, 10/09/2026: «hay mezcla de diseño»). */}
          {veEconomia
            ? (
                <span
                  className={`truncate ${contratado == null ? '' : 'font-mono tabular-nums'}`}
                  data-testid="contratado-obra-cliente"
                  style={{
                    fontSize: contratado == null && !cerrada ? '11.5px' : '12px', textAlign: 'right',
                    color: contratado == null ? (cerrada ? V.tenue : V.warn) : V.tinta,
                  }}
                >
                  {contratado == null ? (cerrada ? '—' : SIN_PRECIO_EN_OBRAS) : plata(contratado)}
                </span>
              )
            : (
                <span
                  data-testid="contratado-sin-permiso"
                  className="truncate"
                  style={{ fontSize: '12px', color: V.tenue, textAlign: 'right' }}
                >
                  sin permiso
                </span>
              )}

          {/* OC Y OP DE ESTA OBRA, en el lugar donde estaban Costo MO y Costo mat. Este archivo ya
              declaraba que la ficha del cliente es la cara COMERCIAL de la relación y que el costo
              vive en la obra: con las dos columnas de costo puestas no había ancho para las dos que
              contestan la pregunta comercial —con qué papel nos lo encargó y qué ordenó pagar—.
              El costo real sigue estando en la obra, que es donde se decide sobre él. */}
          {/* CON UNA SOLA, SE DICE CUÁL: «OC 2173» y no «1 OC». Misma regla que la lista de
              `/clientes`, y por eso la decide el MISMO componente. */}
          <span className={`flex items-center justify-end ${SOLO_ANCHO}`} data-testid="oc-obra-cliente">
            <TotalDePapeles
              total={papelesDeLaObra?.totalOC ?? SIN_PAPELES} sigla="OC" tam="12px" veEconomia={veEconomia}
              numero={papelesDeLaObra?.totalOC.n === 1 ? papelesDeLaObra.oc[0]?.numeroCorto ?? null : null}
            />
          </span>
          <span className={`flex items-center justify-end ${SOLO_ANCHO_ECO}`} data-testid="op-obra-cliente">
            <TotalDePapeles
              total={papelesDeLaObra?.totalOP ?? SIN_PAPELES} sigla="OP" tam="12px" veEconomia={veEconomia}
              numero={papelesDeLaObra?.totalOP.n === 1 ? papelesDeLaObra.op[0]?.numeroCorto ?? null : null}
            />
          </span>
          {/* ═══ MARGEN FUERA (dueño, 10/09/2026: «quitá esa columna Margen, no es útil») ═══

              Se retiró de `/clientes` a las 15:33 y de acá en el mismo día: es el MISMO concepto
              sobre los mismos números, y dejarlo en una de las dos pantallas del módulo Clientes es
              volver a tener dos verdades sobre el mismo cliente. El margen de una obra vive en el
              módulo Obras —`features/obras`, con `obra_economia` y `planVsReal`, que lo miden
              contra el costo REAL y el forecast—, no contra un contratado que en cuatro de las
              cinco obras de Messina ni siquiera es un precio. */}
          {/* LA PISTA DE 28px EXISTE Y VA VACÍA. El handoff pone acá el menú de fila, pero en esta
              ficha no hay ninguna acción de fila cableada para una obra —ni quitar, ni archivar: se
              archiva desde la obra—. Dibujar un `···` que sólo repite el enlace de la fila sería
              inventar una capacidad; reservar la pista es lo que mantiene la grilla exacta. */}
          <span aria-hidden className={SOLO_ANCHO} />
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
