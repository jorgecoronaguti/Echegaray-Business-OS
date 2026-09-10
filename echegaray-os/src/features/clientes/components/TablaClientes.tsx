// 25 · CLIENTES — la cartera, con las obras en ejecución COLGANDO de su cliente.
//
// ═══ LO QUE ARREGLA LA v4 (10/09/2026 · «esto está cada vez peor… tiene datos mal») ═══
//
// El dueño miró esta pantalla y encontró, en el mismo renglón, tres formas de decir lo mismo y dos
// magnitudes distintas comparadas sin avisar. Cada corrección tiene su fuente escrita al lado:
//
//   1 · UN SOLO VOCABULARIO POR CELDA. ARCOR decía «1 obra», «sin obra en curso» y «ninguna obra en
//       ejecución» en la misma fila. Ahora lo dice UNA vez, en su columna: «1 cerrada». La celda de
//       Contratado deja de opinar sobre las obras y la sub-fila fantasma se fue — sólo sobrevive
//       cuando la lectura de obras FALLÓ, que es otra cosa y hay que decirla.
//   2 · «11 obras» CON 5 FILAS DEBAJO NO CUADRABA. La columna escribe el desglose que la vista
//       publica: «5 en curso · 6 cerradas» (`cliente_economia.n_obras_en_curso` / `n_obras_cerradas`).
//   3 · LAS OC LLEVAN IVA Y LO CONTRATADO NO. El Adicional Tercer Muro tiene una OC de $12.100.000
//       contra $10.000.000 contratados: son el mismo número × 1,21. Estaban en columnas vecinas sin
//       una palabra que lo dijera. El rótulo ahora es «OC · OP c/IVA» y no se restan entre sí.
//   4 · LOS NÚMEROS DE LAS OC VOLVIERON, EN TIPOGRAFÍA NORMAL (dueño, 10/09/2026 16:20: «esta
//       pantalla sigue sin mostrar el nº de OC»). Los saqué a la mañana porque colgaban del nombre
//       en monoespaciado y mezclaban OC con OP; el error fue sacarlos en vez de arreglarlos: con el
//       total solo, ME - BSA muestra «5 OC» y ningún número, y el número es lo que se busca —es lo
//       que el cliente cita en su OP y en su factura—. Ahora: sólo OC, tipografía normal, una
//       línea, «+N» recién desde la quinta, y cada una abre su PDF. Ver `OrdenesDeLaObra`.
//   5 · «—» EN TODA LA COLUMNA COBRADO. Era una barra de porcentaje y el porcentaje casi nunca se
//       podía calcular. Ahora la celda publica el IMPORTE —que es un hecho de Cobranzas— y agrega la
//       barra sólo cuando el denominador existe y cubre todas las obras del cliente.
//   7 · LA COLUMNA MARGEN SE FUE (dueño, 10/09/2026 15:33: «quitá esa columna Margen, no es
//       útil»). El margen es una pregunta de la OBRA —contra su costo real, su avance y su
//       certificación— y acá se dibujaba contra un contratado que en cuatro de las cinco filas de
//       Messina ni siquiera era un precio. Vive en el módulo Obras. Con ella se van los dos
//       porcentajes que colgaban de la cifra.
//   6 · UN CONTRATADO QUE NO ES UN PRECIO SE DICE. `origen = suma-viva` significa que OBRAS no tiene
//       precio y el número es la suma viva de Cobranzas; sube cada vez que se factura. ME - BSA
//       publica $14.120.243 por ese camino contra 5 OC por $49.886.583 c/IVA. La fila lo señala; la
//       diferencia NO se esconde ni se «arregla» acá — es un hueco de datos y lo decide el dueño.
//
// ═══ CADA COLUMNA, SU FUENTE (y no hay una segunda) ═══
//
//   Contratado · Costo MO · Costo mat. → `obra_economia_cartera` = la pestaña OBRAS del
//     Flujo de Caja, por obra. El total del CLIENTE lo suma la base en `public.cliente_economia`.
//   Cobrado → `cliente_economia.cobrado_neto_total` (cliente) y `obra_cobranza.cobrado_neto` (obra).
//     SIN IVA los dos, porque lo contratado tampoco lo lleva.
//   Obras → `cliente_economia.n_obras_en_curso` / `n_obras_cerradas`.
//   OC · OP → `cliente_orden`, ya agrupado por `papelesCliente`. Es el TOTAL del PDF que mandó el
//     cliente, con IVA. Que no coincida con lo contratado no es un error de esta pantalla.
//
// ═══ EL NOMBRE NUNCA SE ESTRANGULA ═══
//
// Por debajo de 1250px se suelta todo el detalle económico —nunca el cliente ni lo contratado
// (`25v2:154`)—. Lo decide una media query y no `window.innerWidth`, para no volver la tabla un
// componente de cliente.

import Link from 'next/link'
import { pesos, porcentajeCanon } from '@/shared/components/canon/formato'
import { IconoCliente, IconoObra } from '@/shared/components/iconos'
import { ALTO_V2, CAJA_CONTENIDO, ENCABEZADO, RotuloCol, V } from '@/shared/components/v2/patron'
import type { ClienteEnCartera, Imputacion, ObraEnCurso } from '@/features/administracion/services/homeCartera'
import { frasesDeObras } from '@/features/clientes/services/cartera'
import { progresoDeCobro, tituloDeCobro } from '@/features/clientes/services/progresoCobro'
import type { PapelesDelCliente } from '@/features/clientes/services/papelesCliente'
import { ORIGEN_SUMA_VIVA, SIN_PRECIO_EN_OBRAS } from '@/features/clientes/services/economiaObras'
import { AbrirOrdenes } from './AbrirOrdenes'
import { OrdenesDeLaObra } from './OrdenesDeLaObra'
import { SIN_PAPELES, TotalDePapeles } from './TotalDePapeles'

/** `25v2:154`. Literales porque Tailwind no compila una clase armada en runtime. */
const COLS
  = 'grid-cols-[minmax(0,1.9fr)_116px_156px_150px_124px_124px_150px]'
  + ' max-[1249px]:grid-cols-[minmax(200px,1.9fr)_116px_150px]'
  + ' max-[767px]:grid-cols-[minmax(0,1.9fr)_150px]'
/**
 * LO QUE SE SUELTA POR DEBAJO DE 1250px: el detalle económico y los papeles. Sobreviven siempre el
 * nombre, cuántas obras y lo contratado (`25v2:154`). Su `display` NUNCA va inline: un inline le
 * gana a la media query y la celda seguiría ocupando sus píxeles inelásticos.
 */
const SOLO_ANCHO = 'max-[1249px]:hidden'
/** «Obras»: en 350px sólo entra quién es y cuánto. */
const SOLO_TABLET = 'max-[767px]:hidden'
/** La barra de avance que cuelga del nombre de la obra: de 1023 para abajo se come el nombre. */
const ADORNO_ANCHO = 'max-[1023px]:hidden'

// ── LOS TEXTOS DE AYUDA, DECLARADOS UNA VEZ ─────────────────────────────────────────────────────
//
// Van en el `title` y no debajo del número: la regla del OS es que un número no lleva un párrafo
// permanente pegado, pero tampoco puede quedarse sin decir de dónde sale.

const AYUDA_OC = 'Órdenes de compra y de pago que el cliente mandó por mail (cliente_orden). '
  + 'EL IMPORTE ES EL TOTAL DEL PDF, CON IVA — lo contratado de la columna de al lado es neto, '
  + 'así que los dos números no se restan ni se comparan directo. Son dos fuentes distintas '
  + '(los PDF del cliente y la pestaña OBRAS) y se ven las dos.'

const AYUDA_CONTRATADO = 'Lo que la pestaña OBRAS del Flujo de Caja publica por obra, SIN IVA. '
  + 'Es precio contratado, no facturado.'

const AYUDA_COBRO = 'Lo cobrado SIN IVA, criterio PERCIBIDO (pestaña Cobranzas: sólo lo que ya '
  + 'entró). Nunca mezcla con lo facturado, que es devengado. La barra aparece cuando hay contra '
  + 'qué medirlo.'

const AYUDA_OBRAS = 'Cuántas obras tiene, separadas en las que están en ejecución y las cerradas '
  + '(cliente_economia). Debajo del cliente sólo cuelgan las que están EN CURSO.'

/** El tono de los divisores y la pista de las barras. */
const TONO = { divisorObra: '#F3F2EE', pista: '#EDECE8', textoObra: '#3A3A38' } as const

/** Un cliente del que no llegó ningún papel. Constante y no un objeto nuevo por fila. */
const VACIO: PapelesDelCliente = {
  oc: [], op: [], facturas: [], retenciones: [], otros: [],
  porObra: new Map(), sinObra: { oc: [], op: [] }, totalOC: SIN_PAPELES, totalOP: SIN_PAPELES,
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LO COBRADO — un importe siempre, y la barra sólo cuando el denominador existe
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * ═══ POR QUÉ EL IMPORTE Y NO SÓLO EL PORCENTAJE ═══
 *
 * La versión anterior dibujaba SÓLO una barra, y la barra necesita numerador y denominador. Con
 * Cobranzas anotando el cobro contra el CLIENTE y seis obras de Messina sin precio en OBRAS, la
 * columna entera decía «—»: ARCOR cobró $41.086.884 y La Estrella $168.065.740 y la pantalla no lo
 * publicaba. El importe es un HECHO de Cobranzas y no depende de ningún denominador.
 *
 * ═══ CUÁNDO NO HAY BARRA ═══
 *
 * · sin contratado → no hay contra qué medir.
 * · `medible === false` → el denominador no cubre lo que el numerador suma. Pasa en el cliente que
 *   tiene obras sin precio: San Francisco publicaba «100 %» dividiendo el cobro de 5 obras por el
 *   contrato de 4. El `title` lo dice con palabras.
 *
 * EL RELLENO ES GRAFITO, NO AMARILLO. El `#FDC900` es la MARCA —1,6:1 sobre blanco— y el énfasis del
 * OS es el grafito, que es además con lo que esta misma tabla dibuja el avance de la obra. Dos
 * barras con dos colores en la misma fila serían dos vocabularios.
 */
function Cobrado({ cobrado, contratado, medible, veEconomia, testid, ambito = 'obra', tam, obrasSinPrecio = null, imputacion = null }: {
  cobrado: number | null
  contratado: number | null
  /**
   * CÓMO LLEGÓ EL COBRO A ESTA OBRA. `cliente` = la vista no pudo repartirlo —la etiqueta de
   * Cobranzas nombra al CLIENTE— y entonces esta obra NO tiene un cobro propio: la fila lo dice con
   * palabras y no dibuja ni el importe ni la barra. Poner el número acá afirmaría que esa plata es
   * de esta obra, que es exactamente lo que la vista dice que no sabe.
   */
  imputacion?: Imputacion | null
  /** ¿El denominador cubre lo mismo que el numerador? Sin eso, importe sí y porcentaje no. */
  medible: boolean
  veEconomia: boolean
  testid: string
  ambito?: 'obra' | 'cliente'
  tam: string
  obrasSinPrecio?: number | null
}) {
  if (!veEconomia) return <span className={SOLO_ANCHO} />
  if (imputacion === 'cliente') {
    return (
      <span
        className={`flex items-center justify-end ${SOLO_ANCHO}`}
        data-testid={testid} data-cobro="sin-obra-asignada"
        title={'Cobranzas registra este cobro contra el CLIENTE y la vista no pudo repartirlo a una '
          + 'obra: el importe está en la fila del cliente, arriba. No es «no cobró».'}
        style={{ fontSize: '10.5px', color: V.tenue, textAlign: 'right' }}
      >
        cobro sin obra asignada
      </span>
    )
  }
  const p = medible ? progresoDeCobro(cobrado, contratado) : null
  const titulo = tituloDeCobro({ cobrado, contratado, ambito, obrasSinPrecio })
  return (
    <span
      className={`flex flex-col items-end justify-center ${SOLO_ANCHO}`}
      data-testid={testid} data-cobro={p ? String(p.pct) : 'sin-porcentaje'} title={titulo}
      style={{ gap: 2, textAlign: 'right' }}
    >
      {/* «—» ES «NINGUNA COBRANZA IMPUTADA», NO CERO: el `title` dice cuál de las dos. */}
      <span
        className="font-mono tabular-nums" data-testid={`${testid}-importe`}
        style={{ fontSize: tam, color: cobrado === null ? V.lupa : V.tinta }}
      >
        {cobrado === null ? '—' : pesos(cobrado)}
      </span>
      {p && (
        <span className="flex items-center justify-end" style={{ gap: 6 }}>
          <span style={{ display: 'flex', height: 4, width: 52, borderRadius: 2, background: TONO.pista, flexShrink: 0 }}>
            <span style={{ width: `${p.pct}%`, background: p.excede ? V.warn : V.grafito, borderRadius: 2 }} />
          </span>
          <span className="tabular-nums" style={{ fontSize: '10.5px', color: V.tenue, flexShrink: 0 }}>
            {p.pct} %
          </span>
        </span>
      )}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// LO CONTRATADO DE UNA OBRA — con la marca de cuando no es un precio
// ─────────────────────────────────────────────────────────────────────────────────────────────

const AYUDA_SUMA_VIVA = 'OBRAS no publica precio para esta obra: el número es la SUMA VIVA de lo '
  + 'que Cobranzas lleva registrado como venta, y sube cada vez que se factura. No es lo que la '
  + 'obra vale, y por eso puede quedar por debajo de las órdenes de compra que el cliente mandó.'

function ContratadoDeObra({ o, veEconomia }: { o: ObraEnCurso; veEconomia: boolean }) {
  const viva = o.origenContratado === ORIGEN_SUMA_VIVA
  return (
    <span
      className="flex flex-col justify-center"
      data-testid="contratado-obra"
      data-origen={o.origenContratado ?? undefined}
      title={viva ? AYUDA_SUMA_VIVA : undefined}
      style={{ textAlign: 'right', gap: 1 }}
    >
      <span
        className="font-mono tabular-nums"
        style={{ fontSize: '11.5px', color: o.contratado === null ? V.warn : V.apagado }}
      >
        {veEconomia ? (o.contratado === null ? SIN_PRECIO_EN_OBRAS : pesos(o.contratado)) : ''}
      </span>
      {/* LA SEÑAL, SOBRIA Y SÓLO DONDE APLICA. No es una advertencia —no hay nada roto en la
          pantalla— sino la etiqueta de qué clase de número es. Sin ella, «$ 14.120.243» al lado de
          «$ 49.886.583 · 5 OC» parece una resta que a nadie le cierra. */}
      {veEconomia && viva && (
        <span data-testid="contratado-suma-viva" style={{ fontSize: '10px', color: V.tenue }}>
          suma de Cobranzas
        </span>
      )}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────────────────────

export function TablaClientes({
  clientes, seleccionado, hrefDe, veEconomia, obrasNoLeidas, papeles, hrefOrdenes, limpiarHref, vacio,
}: {
  clientes: ClienteEnCartera[]
  seleccionado?: string
  /** Abre la ficha del cliente (o el panel, si no tiene slug). */
  hrefDe: (clienteId: string) => string
  /** El jefe de obra no ve lo contratado. La cerradura es la RLS; acá se deja de ofrecer. */
  veEconomia: boolean
  /** `true` = la lectura de obras falló. Ninguna fila puede decir «ninguna en ejecución». */
  obrasNoLeidas: boolean
  /** Los papeles de la cartera, ya agrupados, por cliente. Vacío = ninguno, o la lectura falló. */
  papeles: Map<string, PapelesDelCliente>
  /** Adónde lleva el panel de órdenes: la clave es el `obra_id`. */
  hrefOrdenes: (clave: string) => string
  limpiarHref: string
  /** Qué se escribe cuando el recorte no deja a nadie. */
  vacio: string
}) {
  const papelesDe = (clienteId: string): PapelesDelCliente =>
    papeles.get(clienteId) ?? VACIO

  return (
    <div data-testid="clientes-tabla">
      <div className={`grid gap-[14px] ${COLS}`} style={ENCABEZADO}>
        <RotuloCol>Cliente</RotuloCol>
        <span className={`grid ${SOLO_TABLET}`}>
          <RotuloCol derecha titulo={AYUDA_OBRAS}>Obras</RotuloCol>
        </span>
        {/* EL «c/IVA» VA EN EL RÓTULO Y NO EN EL `title` (10/09/2026). Un rótulo que calla la unidad
            obliga a pasar el mouse para saber si dos columnas vecinas se pueden restar. */}
        <span className={`grid ${SOLO_ANCHO}`}>
          <RotuloCol derecha titulo={AYUDA_OC}>OC · OP c/IVA</RotuloCol>
        </span>
        <RotuloCol derecha titulo={AYUDA_CONTRATADO}>{veEconomia ? 'Contratado' : ''}</RotuloCol>
        <span className={`grid ${SOLO_ANCHO}`}>
          <RotuloCol derecha titulo="Mano de obra con cargas proyectada, según la pestaña OBRAS">Costo MO</RotuloCol>
        </span>
        <span className={`grid ${SOLO_ANCHO}`}>
          <RotuloCol derecha titulo="Materiales proyectados, según la pestaña OBRAS">Costo mat.</RotuloCol>
        </span>
        <span className={`grid ${SOLO_ANCHO}`}>
          {/* SIN PERMISO ECONÓMICO, EL RÓTULO TAMPOCO: una columna «COBRADO» con la celda vacía en
              todas las filas se lee como un dato que se rompió, no como uno que no corresponde. */}
          <RotuloCol derecha titulo={AYUDA_COBRO}>{veEconomia ? 'Cobrado' : ''}</RotuloCol>
        </span>
      </div>

      {clientes.map((c) => {
        const elegido = c.cliente_id === seleccionado
        const suyos = papelesDe(c.cliente_id)
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
                minHeight: ALTO_V2.cliente,
                // El divisor se afloja cuando abajo cuelgan obras: son el mismo bloque.
                borderBottom: `1px solid ${c.enCurso.length ? TONO.divisorObra : V.lineaFila}`,
                background: elegido ? V.seleccion : undefined,
                // SIN FILO ÁMBAR (10/09/2026). Marcaba «le falta el CUIT o el teléfono» y era la
                // última sobreviviente de las aclaraciones que el dueño mandó sacar dos veces. Un
                // filo de color sin nada en pantalla que lo explique es una cifra sin rótulo.
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
                  <IconoCliente className="h-[15px] w-[15px]" />
                </span>
                <span className="truncate" style={{ fontSize: '12.5px', fontWeight: 600, color: V.tinta, minWidth: 96 }}>
                  {c.nombre}
                </span>
              </span>

              {/* CUÁNTAS OBRAS TIENE, DICHO UNA SOLA VEZ. Es una FRASE, no una cifra alineada: por
                  eso no va en monoespaciado — el mono se reserva para lo que se compara de arriba
                  abajo, que en esta tabla es plata. */}
              <span
                className={`flex flex-col items-end justify-center ${SOLO_TABLET}`}
                data-testid="obras-cliente" style={{ gap: 1, textAlign: 'right' }}
              >
                {frasesDeObras(c).map((f, i) => (
                  <span key={f} style={{ fontSize: i === 0 ? '12px' : '10.5px', color: i === 0 ? V.apagado : V.tenue }}>
                    {f}
                  </span>
                ))}
              </span>

              {/* LOS PAPELES DEL CLIENTE, EN DOS RENGLONES Y NUNCA EN EL MISMO RÓTULO: lo que
                  encargó (OC) y lo que ordenó pagar (OP). Incluye las órdenes de sus obras
                  CERRADAS, que esta tabla no dibuja como fila: si contaran sólo las visibles,
                  cerrar una obra haría desaparecer papeles que existen.
                  NO ES UN BOTÓN: el panel lateral del cliente muestra sólo las órdenes SIN obra
                  atribuida (`getOrdenesDe` con `obraId: null`), que no es lo que este total suma.
                  Quien quiera el detalle entra a la ficha, que es lo que hace la fila entera. */}
              <span
                className={`flex flex-col items-end justify-center ${SOLO_ANCHO}`}
                data-testid="papeles-cliente"
                style={{ gap: 2, textAlign: 'right' }}
              >
                <TotalDePapeles total={suyos.totalOC} sigla="OC" tam="12px" testid="total-oc-cliente" veEconomia={veEconomia} />
                <TotalDePapeles total={suyos.totalOP} sigla="OP" tam="11.5px" testid="total-op-cliente" veEconomia={veEconomia} />
              </span>

              {/* LA CELDA DE PLATA NO OPINA SOBRE LAS OBRAS. Decía «sin obra en curso», que es lo
                  MISMO que ya dice la columna «Obras» dos celdas a la izquierda: tres frases para
                  un hecho es lo que el dueño marcó en la fila de ARCOR. Acá va «—» y el `title`
                  distingue las dos ausencias, que no son iguales. */}
              <span
                className="font-mono tabular-nums"
                data-testid="contratado"
                title={c.contratado !== null
                  ? undefined
                  : c.enCurso.length
                    ? 'Ninguna de sus obras en curso tiene precio en la pestaña OBRAS'
                    : 'No tiene obras en curso: no hay contrato vigente que sumar'}
                style={{
                  fontSize: '12px', textAlign: 'right',
                  color: c.contratado !== null ? V.tinta : c.enCurso.length ? V.warn : V.tenue,
                }}
              >
                {veEconomia
                  ? (c.contratado === null
                      ? (c.enCurso.length ? SIN_PRECIO_EN_OBRAS : '')
                      : pesos(c.contratado))
                  : ''}
              </span>
              <Costos mo={c.costoMo} mat={c.costoMateriales} tam="12px" sinUniverso={c.enCurso.length === 0} />
              {/* EL DENOMINADOR DEL CLIENTE ES `contratadoTotal`, NO la columna de al lado. La
                  columna dice lo contratado EN CURSO —cierra con las filas de obra de abajo— y el
                  cobro del cliente es acumulado: `cobranzas` lo anota contra el cliente y no contra
                  la obra. Y el porcentaje sólo sale si NINGUNA de sus obras quedó sin precio: si
                  falta una, arriba y abajo de la fracción hay dos universos. */}
              <Cobrado
                cobrado={c.cobrado} contratado={c.contratadoTotal}
                medible={c.obrasSinPrecio === 0}
                obrasSinPrecio={c.obrasSinPrecio}
                veEconomia={veEconomia} testid="cobro-cliente" ambito="cliente" tam="12px"
              />
            </Link>

            {c.enCurso.map((o) => {
              const deLaObra = papelesDe(c.cliente_id).porObra.get(o.obra_id)
              const totalOC = deLaObra?.totalOC ?? SIN_PAPELES
              // EL NÚMERO DE LA OC ES DATO DE PRIMERA CLASE CUANDO HAY UNA SOLA. «OC 2173» dice cuál
              // papel encargó la obra; «1 OC» sólo dice que hay uno, y un conteo de uno no
              // identifica nada. Con dos o más se cuenta y el número se lee en el panel — enumerar
              // tres números en la celda es volver a los rótulos que el dueño mandó sacar.
              const unicaOC = totalOC.n === 1 ? (deLaObra?.oc[0]?.numeroCorto ?? null) : null
              // ¿HAY NÚMEROS QUE DIBUJAR? Decide el alto de la fila —una línea o dos— y no puede
              // deducirse dentro del `<span>`: el alto vive en el `<Link>`, que es el contenedor de
              // la grilla.
              const ocDeLaObra = deLaObra?.oc ?? []
              return (
                <Link
                  key={o.obra_id}
                  href={`/obras/${o.obra_id}`}
                  prefetch={false}
                  role="row"
                  data-testid="fila-obra"
                  className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS} hover:bg-[#FAFAF8]`}
                  // `minHeight` Y NO `height`: la celda de cobro lleva dos renglones y a 390px el
                  // nombre puede partir. Con `height` clavado el segundo renglón queda cortado.
                  data-ordenes={ocDeLaObra.length ? '' : undefined}
                  // `minHeight` Y NO `height`: a 390px los números se apilan y la fila tiene que
                  // poder crecer. Con `height` clavado el segundo renglón queda cortado por abajo.
                  style={{
                    minHeight: ocDeLaObra.length ? ALTO_V2.hijaConOrdenes : ALTO_V2.hija,
                    borderBottom: `1px solid ${TONO.divisorObra}`,
                  }}
                >
                  {/* DOS LÍNEAS: el nombre arriba, sus OC abajo. El `overflow: hidden` se queda —lo
                      que no entre se corta en el borde de SU celda y nunca invade la de al lado. */}
                  <span style={{
                    display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
                    minWidth: 0, overflow: 'hidden', paddingLeft: 14,
                  }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
                      <IconoObra className="h-[13px] w-[13px]" />
                    </span>
                    <span className="truncate" style={{ fontSize: '12px', color: TONO.textoObra, minWidth: 96 }}>{o.nombre}</span>
                    {/* BARRA SÓLO SI EL NÚMERO ES UNA FRACCIÓN 0–100. `null` no es cero: una obra
                        sin avance sincronizado no avanzó cero por ciento — no se sabe, y una barra
                        vacía dice que sí. El `display` de lo que se suelta va en la CLASE y nunca
                        inline: un `display:'flex'` inline le gana a `hidden`. */}
                    {o.avance !== null && (
                      <>
                        <span className={`flex ${ADORNO_ANCHO}`} style={{ height: 4, width: 80, borderRadius: 2, background: TONO.pista, flexShrink: 0, marginLeft: 2 }}>
                          <span style={{ width: `${Math.min(100, Math.max(0, o.avance))}%`, background: V.grafito, borderRadius: 2 }} />
                        </span>
                        <span className={`tabular-nums ${ADORNO_ANCHO}`} style={{ fontSize: '10.5px', color: V.tenue, flexShrink: 0 }}>
                          {porcentajeCanon(o.avance, 0)}
                        </span>
                      </>
                    )}
                  </span>
                    {/* LA SEGUNDA LÍNEA: LAS OC DE ESTA OBRA, con su número, su día y su importe, y
                        cada una abriendo su PDF. La sangría las alinea bajo el nombre — 13px de
                        icono + 9 de aire. NINGUNA ORDEN DE PAGO: la OP no se imputa a la obra. */}
                    <OrdenesDeLaObra ordenes={ocDeLaObra} veEconomia={veEconomia} />
                  </span>

                  {/* La celda vacía de «Obras»: existe para que la obra caiga en la MISMA columna
                      que su cliente, y desaparece con la columna. */}
                  <span className={SOLO_TABLET} />

                  {/* EL TOTAL DE LAS OC DE ESTA OBRA, y el que abre su detalle. Reemplaza los
                      rótulos «OC 1984 · 18/06 · $4.336.587» que colgaban del nombre: la misma
                      información, en la celda que ya la resumía, sin dos vocabularios en la fila. */}
                  <span className={`flex items-center justify-end ${SOLO_ANCHO}`} data-testid="papeles-obra">
                    {totalOC.n === 0
                      ? null
                      : (
                          <AbrirOrdenes
                            href={hrefOrdenes(o.obra_id)}
                            titulo={AYUDA_OC}
                            etiqueta={`Ver las ${totalOC.n} órdenes de compra de ${o.nombre}`}
                            testid="abrir-ordenes-obra"
                          >
                            <TotalDePapeles total={totalOC} sigla="OC" tam="11.5px" testid="total-oc-obra" veEconomia={veEconomia} numero={unicaOC} />
                          </AbrirOrdenes>
                        )}
                  </span>

                  <ContratadoDeObra o={o} veEconomia={veEconomia} />
                  <Costos mo={o.costoMo} mat={o.costoMateriales} tam="11.5px" />
                  {/* EN LA OBRA LOS DOS NÚMEROS SON DE LA MISMA OBRA: el porcentaje siempre se
                      puede calcular cuando hay contratado. */}
                  <Cobrado
                    cobrado={o.cobrado} contratado={o.contratado} medible imputacion={o.imputacion}
                    veEconomia={veEconomia} testid="cobro-obra" tam="11.5px"
                  />
                </Link>
              )
            })}

            {/* «NO PUDE LEERLAS» SÍ SE DIBUJA; «NO HAY» YA NO. Que el cliente no tenga obras en
                ejecución lo dice su columna «Obras» —«1 cerrada»—, y decirlo otra vez en una fila
                propia era la tercera forma de la misma frase. Un control que no pudo mirar, en
                cambio, tiene que gritarlo: nadie puede leer esa fila vacía como «no hay». */}
            {c.enCurso.length === 0 && obrasNoLeidas && (
              <div
                className={`grid items-center gap-[14px] ${CAJA_CONTENIDO} ${COLS}`}
                style={{ height: ALTO_V2.hija - 4, borderBottom: `1px solid ${TONO.divisorObra}` }}
                data-testid="obras-sin-leer"
              >
                <span style={{ fontSize: '11.5px', color: V.warn, paddingLeft: 36 }}>
                  no pude leer sus obras
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
 * LAS DOS CELDAS DE COSTO: Costo MO · Costo mat.
 *
 * Eran TRES. El margen se retiró el 10/09/2026 por orden del dueño («quitá esa columna Margen, no
 * es útil»): es una pregunta de la OBRA —contra su costo real, su avance y su certificación—, y acá
 * se dibujaba contra un contratado que en cuatro de las cinco filas de Messina ni siquiera era un
 * precio, sino la suma viva de Cobranzas. Con él se fue el porcentaje que colgaba de la cifra, que
 * es el mismo que llegó a decir «2.603.726 %».
 *
 * Los costos los ve todo rol interno: una compra es COSTO, no precio (19/08). Por eso estas dos
 * celdas no preguntan por `veEconomia`, igual que `obra_panel.costo_real`.
 *
 * «—» ES «OBRAS NO TIENE EL DATO», NO CERO. Un cero acá diría que la obra no gastó nada.
 *
 * Y CUANDO NO HAY NADA QUE SUMAR, TAMPOCO HAY «—». Las dos celdas suman las obras EN CURSO del
 * cliente: si no tiene ninguna, no falta un dato — no hay universo. ARCOR y La Estrella dibujaban
 * cuatro guiones cada una, y «guiones por todos lados» fue textual del dueño. Su columna «Obras»
 * ya dice «1 cerrada»: la celda vacía se lee contra esa frase, no contra un hueco.
 */
function Costos({ mo, mat, tam, sinUniverso = false }: {
  mo: number | null; mat: number | null; tam: string
  /** `true` = no hay obras en curso que sumar. No es un dato que falta: no hay pregunta. */
  sinUniverso?: boolean
}) {
  const celda = (v: number | null, testid: string) => (
    <span
      className={`font-mono tabular-nums ${SOLO_ANCHO}`} data-testid={testid}
      style={{ fontSize: tam, textAlign: 'right', color: v === null ? V.lupa : V.apagado }}
    >
      {v === null ? (sinUniverso ? '' : '—') : pesos(v)}
    </span>
  )
  return <>{celda(mo, 'costo-mo')}{celda(mat, 'costo-materiales')}</>
}
