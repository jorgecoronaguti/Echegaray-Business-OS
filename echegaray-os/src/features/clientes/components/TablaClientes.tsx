// 25 · CLIENTES v2 — la cartera sin caja, con las obras en ejecución COLGANDO de su cliente.
//
// ═══ QUÉ CAMBIÓ RESPECTO DEL PORTE DE AGOSTO (`ListaClientes`) ═══
//
//   · SE FUE LA CAJA (criterio 3). No hay tarjeta blanca con borde y radio, ni encabezado gris, ni
//     pie de totales adentro: filos, tipografía y números tabulares. Con el pie se fue el total
//     «CONTRATADO» de la cartera entera — lo que dice cuánto se está viendo es el `n/total` de los
//     recortes, arriba, y no un bloque gris al final.
//   · SE FUE LA COLUMNA «EN EJECUCIÓN», que era los nombres de las obras concatenados con « · ».
//     Cada obra en ejecución es ahora una FILA propia, indentada bajo su cliente y compartiendo sus
//     columnas: contratado es plata en las dos (criterio 4, jerarquía por indentación). Una lista de
//     tres obras metida en una celda no se puede leer ni ordenar ni comparar.
//   · SE FUE EL AVATAR DE INICIALES y el menú `···` de la fila. El mockup pone el icono de cliente
//     (§11, 15px) y el nombre; las acciones viven en el panel. Una columna de menús es una columna
//     de ruido en una lista que existe para encontrar y abrir.
//   · EL AVISO ES TEXTO, NO UN TRIÁNGULO: «sin CUIT» dicho con palabras al lado del nombre. Un
//     icono obliga a pasar el mouse para saber qué falta.
//
// ═══ UNA SOLA TABLA DE CLIENTES (09/09/2026, orden del dueño) ═══
//
// Hasta hoy la sección se dibujaba dos veces: ésta y `CarteraHome` en `/administracion`, con las
// MISMAS filas y distinta verdad —una decía «$156.174.253 contratado» y la otra «sin contrato» del
// mismo cliente—. `CarteraHome` se eliminó; sus cuatro columnas económicas viven acá y
// `/administracion` redirige. Dos tablas del mismo maestro no son dos vistas: son dos verdades.
//
// CADA COLUMNA, SU FUENTE (y no hay una segunda):
//   Contratado · Costo MO · Costo mat. · Margen → `obra_economia_cartera` = la pestaña OBRAS del
//     Flujo de Caja, persistida por `obras-economia-sync.mjs`. Nunca el campo del formulario.
//   Últ. mov. → el último parte (`obra_ejecucion`) o la fecha más avanzada de sus certificados.
//   Chips del cliente → `cliente_panel` (CUIT, teléfono) y `cliente_documento.rol` (contrato).
//   Chips de la obra → OBRAS (precio), `obra_panel` (avance, jefe) y `certificados`.
//
// ═══ EL NOMBRE NUNCA SE ESTRANGULA ═══
//
// Por debajo de 1250px se suelta OBRAS —nunca el cliente ni lo contratado (`25v2:154`)—. Lo decide
// una media query y no `window.innerWidth`, para no volver la tabla un componente de cliente.

import Link from 'next/link'
import { pesos, porcentajeCanon } from '@/shared/components/canon/formato'
import { IconoCliente, IconoObra } from '@/shared/components/iconos'
import { ALTO_V2, CAJA_CONTENIDO, ENCABEZADO, FILO_BLOQUEA, RotuloCol, V } from '@/shared/components/v2/patron'
import { diaRelativo, type ClienteEnCartera } from '@/features/administracion/services/homeCartera'
import { rotuloDe } from '@/features/clientes/services/ordenesCliente'
import type { Orden, PapelesDelCliente, Total } from '@/features/clientes/services/papelesCliente'
import { SIN_PRECIO } from '@/features/clientes/services/chipsCartera'
import { BotonOrdenes } from './BotonOrdenes'
import { pctTexto } from '@/features/clientes/services/economiaObras'

// ── LOS NÚMEROS DE LAS ÓRDENES ──────────────────────────────────────────────────────────────────
//
// «OC 2256 · 02/09 · $12.100.000» DEBAJO del nombre de la obra, y sólo órdenes de COMPRA: la orden
// de pago no se imputa a la fila de la obra (dueño, 10/09/2026 — mezclarlas en el mismo renglón fue
// lo que hizo ilegible la versión anterior). Lo que hay para cobrar se resume en la fila del
// cliente, en su propia columna.
//
// QUIÉN AGRUPA: `papelesCliente.agruparPapeles`, que es puro y está probado contra los 44 papeles
// reales de Messina. Acá no se decide nada, se dibuja.
//
// NO SON UN ENLACE. La fila entera ya es un `<Link>` y un `<a>` adentro de otro `<a>` es HTML
// inválido: el navegador lo desarma y la fila queda con zonas que navegan a cualquier lado.
//
// EL IMPORTE VIAJA EN EL RÓTULO Y SÓLO CON `veEconomia`: «OC 2173 · 11/08 · $78.650.000» es el
// precio de venta de esa obra. Al jefe de obra y al campo les llega el mismo rótulo sin el importe.

/** TODAS si son tres o menos; si no, LAS TRES MÁS RECIENTES y «+N». Nunca se esconde en silencio. */
const MAX_OC_EN_FILA = 3

function OrdenesDeLaObra({ ordenes, href, veEconomia }: {
  ordenes: Orden[]; href: string; veEconomia: boolean
}) {
  const visibles = ordenes.slice(0, MAX_OC_EN_FILA)
  return (
    <BotonOrdenes
      rotulos={visibles.map((o) => ({ clave: o.clave, texto: rotuloDe(o, { veEconomia }) }))}
      resto={Math.max(0, ordenes.length - visibles.length)}
      href={href}
      className="pl-[22px]"
      color={V.apagado}
      titulo="Órdenes de compra que el cliente mandó por mail para esta obra"
    />
  )
}

/**
 * EL TOTAL DE UNA COLUMNA DE PAPELES: «$90.750.000 · 2 OC».
 *
 * `null` no es cero: una orden sin importe cargado no es una orden por $ 0, y cuando alguna del
 * grupo no lo tiene el total lleva «·» para decir que suma sólo las que sí (misma marca que el
 * margen parcial de esta tabla).
 */
function TotalDePapeles({ total, sigla, tam, testid }: {
  total: Total; sigla: 'OC' | 'OP'; tam: string; testid: string
}) {
  if (!total.n) return null
  return (
    <span className="font-mono tabular-nums" data-testid={testid} style={{ fontSize: tam, color: V.apagado }}>
      {total.importe === null ? 'sin importe' : pesos(total.importe)}
      <span style={{ color: V.tenue, marginLeft: 6, fontSize: '10.5px' }}>
        {total.n} {sigla}{total.parcial ? ' ·' : ''}
      </span>
    </span>
  )
}

/** `25v2:154`. Literales porque Tailwind no compila una clase armada en runtime. */
const COLS
  = 'grid-cols-[minmax(0,1.9fr)_110px_160px_150px_130px_130px_150px_96px]'
  + ' max-[1249px]:grid-cols-[minmax(200px,1.9fr)_110px_150px]'
  + ' max-[767px]:grid-cols-[minmax(0,1.9fr)_150px]'
/**
 * LO QUE SE SUELTA POR DEBAJO DE 1250px: el detalle económico y la fecha del último movimiento.
 * Sobreviven siempre el nombre y lo contratado (`25v2:154`). Su `display` NUNCA va inline: un
 * inline le gana a la media query y la celda seguiría ocupando sus píxeles inelásticos.
 */
const SOLO_ANCHO = 'max-[1249px]:hidden'
/** «Obras»: en 350px sólo entra quién es y cuánto. El número se lee contando las filas de abajo. */
const SOLO_TABLET = 'max-[767px]:hidden'

/**
 * LO QUE CUELGA DEL NOMBRE DE LA OBRA, y que en el teléfono se lo comía (medido a 390x844 el
 * 26/08/2026). La columna del nombre respeta su piso —`minmax(200px, ...)`, la media query hace su
 * trabajo—, pero DENTRO de esa celda la barra de avance declara `width: 80px` con `flex-shrink: 0`
 * y el porcentaje otro tanto: 128 de los 164px útiles. Al nombre le quedaban 36 y «Galpón 9» se
 * dibujaba «Galp…». Soltar la columna y estrangular el nombre adentro es el mismo defecto una capa
 * más abajo.
 *
 * Se suelta en el corte `lg` —no en el de columnas— porque entre 1024 y 1249 la celda mide ~660px y
 * todo entra holgado; el problema aparece de 1023 para abajo.
 */
const ADORNO_ANCHO = 'max-[1023px]:hidden'

/** Un cliente del que no llegó ningún papel. Es una constante y no un objeto nuevo por fila: la
 *  tabla dibuja decenas de filas y ninguna necesita su propio vacío. */
const SIN_PAPELES: Total = { n: 0, importe: null, parcial: false }
const VACIO: PapelesDelCliente = {
  oc: [], op: [], facturas: [], retenciones: [], otros: [],
  porObra: new Map(), sinObra: { oc: [], op: [] }, totalOC: SIN_PAPELES, totalOP: SIN_PAPELES,
}

/** Los tonos que el v2 usa en esta pantalla y el vocabulario todavía no tenía nombrados. */
const TONO = { divisorObra: '#F3F2EE', pista: '#EDECE8', textoObra: '#3A3A38' } as const

export function TablaClientes({
  clientes, seleccionado, hrefDe, veEconomia, obrasNoLeidas, papeles, hrefOrdenes, hoy, limpiarHref, vacio,
}: {
  clientes: ClienteEnCartera[]
  seleccionado?: string
  /** Abre el panel de ese cliente SIN salir de la lista. */
  hrefDe: (clienteId: string) => string
  /** El jefe de obra no ve lo contratado. La cerradura es la RLS; acá se deja de ofrecer. */
  veEconomia: boolean
  /** `true` = la lectura de obras falló. Ninguna fila puede decir «ninguna en ejecución». */
  obrasNoLeidas: boolean
  /** Los papeles de la cartera, ya agrupados, por cliente. Vacío = ninguno, o la lectura falló. */
  papeles: Map<string, PapelesDelCliente>
  /** Adónde lleva el chip: la clave es el `obra_id`, o `cliente:<id>` para lo no atribuido a obra. */
  hrefOrdenes: (clave: string) => string
  /** El día de hoy en la hora de la empresa. Viene del servidor: el reloj del navegador es de quien mira. */
  hoy: string
  limpiarHref: string
  /** Qué se escribe cuando el recorte no deja a nadie. */
  vacio: string
}) {
  /** Los papeles de un cliente, o el conjunto vacío. `undefined` sería «no tiene ninguno», que es
   *  lo mismo que el vacío para dibujar: quien distingue «no pude leerlos» es la página. */
  const papelesDe = (clienteId: string): PapelesDelCliente =>
    papeles.get(clienteId) ?? VACIO

  return (
    <div data-testid="clientes-tabla">
      <div className={`grid gap-[14px] ${COLS}`} style={ENCABEZADO}>
        <RotuloCol>Cliente</RotuloCol>
        <span className={`grid ${SOLO_TABLET}`}><RotuloCol derecha>Obras</RotuloCol></span>
        {/* CONTRATADO ES LO QUE PUBLICA OBRAS (la OC de Cobranzas), no lo facturado ni el campo del
            formulario de la obra. El `title` lleva la fuente: un rótulo de una palabra no puede
            cargar solo con decir de qué está hablando. */}
        {/* LAS ÓRDENES SON OTRA FUENTE QUE CONTRATADO, y las dos se ven. Una diferencia entre el
            total de OC y lo contratado NO es un error de esta pantalla: son la pestaña OBRAS y los
            PDF que mandó el cliente, y cuál manda lo decide quien mira, no la tabla. */}
        <span className={`grid ${SOLO_ANCHO}`}>
          <RotuloCol derecha titulo="Órdenes de compra y de pago que el cliente mandó por mail (cliente_orden). No es lo contratado en OBRAS: son dos fuentes distintas y se ven las dos.">
            OC · OP
          </RotuloCol>
        </span>
        <RotuloCol derecha titulo="Lo que la pestaña OBRAS del Flujo de Caja publica por obra. Es precio contratado, no facturado">
          {veEconomia ? 'Contratado' : ''}
        </RotuloCol>
        <span className={`grid ${SOLO_ANCHO}`}>
          <RotuloCol derecha titulo="Mano de obra con cargas proyectada, según la pestaña OBRAS">Costo MO</RotuloCol>
        </span>
        <span className={`grid ${SOLO_ANCHO}`}>
          <RotuloCol derecha titulo="Materiales proyectados, según la pestaña OBRAS">Costo mat.</RotuloCol>
        </span>
        <span className={`grid ${SOLO_ANCHO}`}>
          <RotuloCol derecha titulo="Contratado − costo MO − costo materiales">{veEconomia ? 'Margen' : ''}</RotuloCol>
        </span>
        <span className={`grid ${SOLO_ANCHO}`}>
          <RotuloCol derecha titulo="El hecho más reciente que el OS registró: un parte de obra o un certificado. No es la última edición de la ficha.">
            Últ. mov.
          </RotuloCol>
        </span>
      </div>

      {clientes.map((c) => {
        const elegido = c.cliente_id === seleccionado
        return (
          <div key={c.cliente_id}>
            <Link
              href={hrefDe(c.cliente_id)}
              prefetch={false}
              role="row"
              data-testid="fila-cliente"
              data-seleccionada={elegido ? '' : undefined}
              className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS} ${elegido ? '' : 'hover:bg-[#F2F1ED]'}`}
              style={{
                // 48 y no el alto de una lista común: esta fila es MAESTRA — debajo le cuelgan sus
                // obras, y el canvas la dibuja más alta justamente para que se lea como la madre
                // del bloque y no como un renglón más (`v4B:92`).
                height: ALTO_V2.cliente,
                // El divisor se afloja cuando abajo cuelgan obras: son el mismo bloque.
                borderBottom: `1px solid ${c.enCurso.length ? TONO.divisorObra : V.lineaFila}`,
                background: elegido ? V.seleccion : undefined,
                // El filo ámbar dice «esto bloquea» y sobrevive a la selección, que va sólo en el
                // fondo. Si compartieran canal, elegir la fila borraría su problema.
                boxShadow: c.faltaUnDato ? FILO_BLOQUEA : undefined,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
                  <IconoCliente className="h-[15px] w-[15px]" />
                </span>
                {/* `minWidth: 96` NO es decorativo: con los números de las órdenes al lado, «Messina»
                    se dibujaba «M» (medido a 1440 el 10/09/2026). El nombre no se estrangula nunca —
                    lo que se recorta es el adorno, y para eso los números tienen su propio `+N`. */}
                <span className="truncate" style={{ fontSize: '12.5px', fontWeight: 600, color: V.tinta, minWidth: 96 }}>
                  {c.nombre}
                </span>
                {/* SIN NÚMEROS AL LADO DEL NOMBRE. Ahí estaban «OP 5146 · 03/09 · $15.328.174 ·
                    OC 2162 · +8» —OC y OP en el mismo rótulo— y era lo que el dueño no podía leer;
                    además estrangulaban el nombre. Lo del cliente se cuenta en su columna, y cuál
                    es cada papel se lee en su ficha. */}
              </span>

              <span
                className={`font-mono tabular-nums ${SOLO_TABLET}`}
                style={{ fontSize: '12px', color: V.apagado, textAlign: 'right' }}
              >
                {/* CERO OBRAS SE ESCRIBE CON PALABRAS: «0 obras» y «nadie le cargó ninguna» se leen
                    igual, y son cosas distintas. */}
                {c.obras ? `${c.obras} ${c.obras === 1 ? 'obra' : 'obras'}` : 'sin obras'}
              </span>

              {/* LOS PAPELES DEL CLIENTE, EN DOS RENGLONES Y NUNCA EN EL MISMO RÓTULO: lo que
                  encargó (OC) y lo que ordenó pagar (OP). Incluye las órdenes de sus obras
                  CERRADAS, que esta tabla no dibuja como fila: si contaran sólo las visibles,
                  cerrar una obra haría desaparecer papeles que existen. */}
              <span
                className={`flex flex-col items-end justify-center ${SOLO_ANCHO}`}
                data-testid="papeles-cliente"
                style={{ gap: 2, textAlign: 'right' }}
              >
                <TotalDePapeles total={papelesDe(c.cliente_id).totalOC} sigla="OC" tam="12px" testid="total-oc-cliente" />
                <TotalDePapeles total={papelesDe(c.cliente_id).totalOP} sigla="OP" tam="11.5px" testid="total-op-cliente" />
              </span>

              {/* «SIN PRECIO EN OBRAS» Y NO «SIN CONTRATO»: acá falta el MONTO en la pestaña OBRAS.
                  El contrato —el papel— lo dice su propio chip, al lado del nombre. */}
              <span
                className="font-mono tabular-nums"
                data-testid="contratado"
                style={{ fontSize: '12px', textAlign: 'right', color: c.contratado === null ? V.warn : V.tinta }}
              >
                {veEconomia ? (c.contratado === null ? SIN_PRECIO : pesos(c.contratado)) : ''}
              </span>
              <Economia
                mo={c.costoMo} mat={c.costoMateriales} margen={c.margen} pct={c.margenPct}
                veEconomia={veEconomia} parcial={c.economiaParcial} tam="12px"
              />
              <span className={`font-mono ${SOLO_ANCHO}`} style={{ fontSize: '11.5px', color: V.lupa, textAlign: 'right' }}>
                {diaRelativo(c.ultimoMovimiento, hoy) ?? 'sin movimientos'}
              </span>
            </Link>

            {c.enCurso.map((o) => {
              // ¿ESTA OBRA TIENE ÓRDENES QUE DIBUJAR? Decide el alto de la fila —una línea o dos— y
              // no puede deducirse dentro del `<span>`: el alto vive en el `<Link>`, que es el
              // contenedor de la grilla. Se pregunta por lo que HAY, y `ordenesParaFila` decide
              // después cuáles entran y cuántas van al «+N».
              const deLaObra = papelesDe(c.cliente_id).porObra.get(o.obra_id)
              const ocDeLaObra = deLaObra?.oc ?? []
              const conOrdenes = ocDeLaObra.length > 0
              return (
              <Link
                key={o.obra_id}
                href={`/obras/${o.obra_id}`}
                prefetch={false}
                role="row"
                data-testid="fila-obra"
                data-ordenes={conOrdenes ? '' : undefined}
                className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS} hover:bg-[#FAFAF8]`}
                // `minHeight` Y NO `height`: a 390px las órdenes se apilan y la fila tiene que poder
                // crecer. Con `height` clavado el segundo rótulo quedaba cortado por abajo, que es
                // el mismo recorte una capa más adentro.
                style={{
                  minHeight: conOrdenes ? ALTO_V2.hijaConOrdenes : ALTO_V2.hija,
                  borderBottom: `1px solid ${TONO.divisorObra}`,
                }}
              >
                {/* DOS LÍNEAS, Y LAS ÓRDENES ABAJO. Con el importe adentro cada rótulo pasó de ~90
                    a ~150px: al lado del nombre empujaban los chips de lo que falta contra el borde
                    de la celda y «sin medir · sin jefe · sin certificar» quedaba cortado (medido a
                    1440 el 10/09/2026 en «ME - PLAYÓN DE AZUFRE», con dos OC con importe). Ensanchar
                    la columna no era una opción: el ancho que sobra es el de Contratado, que es
                    plata. El `overflow: hidden` se queda: lo que igual no entre se corta en el borde
                    de SU celda y nunca invade la de al lado. */}
                <span style={{
                  display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
                  minWidth: 0, overflow: 'hidden', paddingLeft: 14,
                }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
                      <IconoObra className="h-[13px] w-[13px]" />
                    </span>
                    <span className="truncate" style={{ fontSize: '12px', color: TONO.textoObra, minWidth: 96 }}>{o.nombre}</span>
                    {/* SIN CHIPS DE «LO QUE FALTA» (dueño, 10/09/2026): «sin medir · sin jefe ·
                        sin certificar» y «sin teléfono · sin contrato» sobraban; la pantalla publica
                        el dato preciso y nada más. Lo que falta sigue contándose en el recorte
                        «Datos faltantes» (misma función `chipsDeCliente`), que es donde se decide. */}
                    {/* BARRA SÓLO SI EL NÚMERO ES UNA FRACCIÓN 0–100. `null` no es cero: una obra sin
                        avance sincronizado no avanzó cero por ciento — no se sabe, y una barra vacía
                        dice que sí. */}
                    {/* EL `display` DE LO QUE SE SUELTA VA EN LA CLASE Y NUNCA INLINE: un
                        `display: 'flex'` en el atributo `style` le gana a `hidden` y la barra
                        seguiría ocupando sus 80px inelásticos. */}
                    {o.avance === null
                      ? null
                      : (
                          <>
                            <span className={`flex ${ADORNO_ANCHO}`} style={{ height: 4, width: 80, borderRadius: 2, background: TONO.pista, flexShrink: 0, marginLeft: 2 }}>
                              <span style={{ width: `${Math.min(100, Math.max(0, o.avance))}%`, background: V.grafito, borderRadius: 2 }} />
                            </span>
                            <span className={`font-mono tabular-nums ${ADORNO_ANCHO}`} style={{ fontSize: '11.5px', color: V.apagado, flexShrink: 0 }}>
                              {porcentajeCanon(o.avance, 0)}
                            </span>
                          </>
                        )}
                  </span>
                  {/* LA SEGUNDA LÍNEA: LAS ÓRDENES DE COMPRA DE ESTA OBRA, en 12px legible.
                      Todas si son tres o menos; si no, las tres más recientes y «+N» —lo que queda
                      afuera se anuncia, nunca se esconde en silencio—. Acá no llevan `ADORNO_ANCHO`:
                      tienen su renglón propio, así que en el teléfono no le disputan nada al nombre
                      y se apilan. La sangría las alinea bajo el nombre — 13px de icono + 9 de aire.
                      NINGUNA ORDEN DE PAGO: la OP no se imputa a la obra en esta pantalla. */}
                  {conOrdenes && (
                    <OrdenesDeLaObra
                      ordenes={ocDeLaObra}
                      href={hrefOrdenes(o.obra_id)}
                      veEconomia={veEconomia}
                    />
                  )}
                </span>

                {/* La celda vacía de «Obras»: existe para que la obra caiga en la MISMA columna
                    que su cliente, y desaparece con la columna. */}
                <span className={SOLO_TABLET} />
                {/* EL TOTAL DE LAS OC DE ESTA OBRA, al lado de lo contratado. Que no coincidan no es
                    un error: son la pestaña OBRAS y los PDF del cliente, y se ven las dos. */}
                <span
                  className={`flex items-center justify-end ${SOLO_ANCHO}`}
                  data-testid="papeles-obra"
                  style={{ textAlign: 'right' }}
                >
                  <TotalDePapeles
                    total={deLaObra?.totalOC ?? SIN_PAPELES} sigla="OC" tam="11.5px" testid="total-oc-obra"
                  />
                </span>
                <span
                  className="font-mono tabular-nums"
                  data-testid="contratado-obra"
                  style={{ fontSize: '11.5px', textAlign: 'right', color: o.contratado === null ? V.warn : V.apagado }}
                >
                  {veEconomia ? (o.contratado === null ? SIN_PRECIO : pesos(o.contratado)) : ''}
                </span>
                <Economia
                  mo={o.costoMo} mat={o.costoMateriales} margen={o.margen} pct={o.margenPct}
                  veEconomia={veEconomia} parcial={false} tam="11.5px"
                />
                <span className={`font-mono ${SOLO_ANCHO}`} style={{ fontSize: '11.5px', color: V.lupa, textAlign: 'right' }}>
                  {diaRelativo(o.ultimoParte, hoy) ?? 'sin partes'}
                </span>
              </Link>
              )
            })}

            {c.enCurso.length === 0 && (
              <div
                className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS}`}
                // El canvas no dibuja esta fila —no hay ningún cliente sin obras en la muestra—,
                // así que su alto es DERIVADO: los mismos 4px menos que la hija que ya tenía antes
                // del v4 (era 30 contra 26). Es la única medida de este archivo sin línea que citar.
                style={{ height: ALTO_V2.hija - 4, borderBottom: `1px solid ${TONO.divisorObra}` }}
              >
                {/* «NO PUDE LEERLAS» NO SE DIBUJA COMO «NO HAY»: es el defecto de un control que no
                    pudo mirar y afirma que no hay nada. */}
                <span style={{ fontSize: '11.5px', color: V.lupa, paddingLeft: 36 }}>
                  {obrasNoLeidas ? 'no pude leer sus obras' : 'ninguna obra en ejecución'}
                </span>
              </div>
            )}
          </div>
        )
      })}

      {clientes.length === 0 && (
        <div style={{ padding: '24px 2px', fontSize: '12.5px', color: V.apagado }} data-testid="sin-resultados">
          {vacio}{' '}
          <Link href={limpiarHref} data-testid="clientes-ver-todo" style={{ color: V.tinta, fontWeight: 500, textDecoration: 'underline' }}>
            Ver todos
          </Link>
        </div>
      )}
    </div>
  )
}

/**
 * LAS TRES CELDAS DE OBRAS: Costo MO · Costo mat. · Margen ($ y %).
 *
 * Los costos los ve todo rol interno —una compra es COSTO, no precio (19/08)—; el margen es plata de
 * venta y se dibuja sólo con `veEconomia`. La vista ya devuelve NULL al jefe de obra: acá se deja de
 * ofrecer la celda, que no es la cerradura sino no ofrecer lo que la base va a negar.
 *
 * «—» ES «OBRAS NO TIENE EL DATO», NO CERO. Un cero acá diría que la obra no gastó nada.
 */
function Economia({ mo, mat, margen, pct, veEconomia, parcial, tam }: {
  mo: number | null; mat: number | null; margen: number | null; pct: number | null
  veEconomia: boolean; parcial: boolean; tam: string
}) {
  const celda = (v: number | null, testid: string) => (
    <span
      className={`font-mono tabular-nums ${SOLO_ANCHO}`} data-testid={testid}
      style={{ fontSize: tam, textAlign: 'right', color: v === null ? V.lupa : V.apagado }}
    >
      {v === null ? '—' : pesos(v)}
    </span>
  )
  return (
    <>
      {celda(mo, 'costo-mo')}
      {celda(mat, 'costo-materiales')}
      <span
        className={`font-mono tabular-nums ${SOLO_ANCHO}`} data-testid="margen"
        title={parcial ? 'Suma sólo las obras con precio en OBRAS' : undefined}
        style={{ fontSize: tam, textAlign: 'right', color: margen === null ? V.lupa : margen < 0 ? V.warn : V.tinta }}
      >
        {veEconomia
          ? (margen === null
              ? '—'
              : <>{pesos(margen)}<span style={{ color: V.tenue, marginLeft: 6, fontSize: '10.5px' }}>{pctTexto(pct)}{parcial ? ' ·' : ''}</span></>)
          : ''}
      </span>
    </>
  )
}
