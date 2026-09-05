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

import Link from 'next/link'
import { CAJA_CONTENIDO, ENCABEZADO, FILO_BLOQUEA, RotuloCol, V } from '@/shared/components/v2/patron'
import { IconoObra, IconoPresupuesto } from '@/shared/components/iconos'
import { plata } from '@/features/obras/components/formato'
import { ETAPA_LABEL, type ObraPanel } from '@/features/obras/types'

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
const COLS_OBRAS
  = 'gap-[14px] grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_64px_minmax(0,120px)_28px]'
  + ' min-[1200px]:gap-[28px] min-[1200px]:grid-cols-[minmax(240px,1.8fr)_150px_90px_170px_28px]'

/** La sangría del handoff (`dc.html:113`, `padding-left:16px`), que reemplaza los 13 del v2. */
const SANGRIA = 16

/** OBRA · ESTADO · AVANCE · CONTRATADO · [acciones]. `dc.html:113-135`. */
export function ObrasDelCliente({ obras, veEconomia, vacio }: {
  obras: ObraPanel[]
  /** El jefe de obra no ve el precio de venta. Lo decide la RLS; acá se deja de dibujar la columna. */
  veEconomia: boolean
  vacio: string
}) {
  return (
    <div data-testid="obras-del-cliente">
      <div className={`grid ${COLS_OBRAS}`} style={{ ...ENCABEZADO, gap: undefined, paddingLeft: SANGRIA }}>
        <RotuloCol>Obra</RotuloCol>
        <RotuloCol>Estado</RotuloCol>
        <RotuloCol derecha>Avance</RotuloCol>
        <RotuloCol derecha>{veEconomia ? 'Contratado' : 'Etapa'}</RotuloCol>
        <RotuloCol />
      </div>

      {obras.length === 0 && (
        <p style={{ fontSize: '12.5px', color: V.apagado, paddingTop: 10 }} data-testid="obras-cliente-vacio">
          {vacio}
        </p>
      )}

      {obras.map((o) => (
        <Link
          key={o.obra_id} href={`/obras/${o.obra_id}`} prefetch={false} data-testid="fila-obra-cliente"
          className={`grid items-center ${CAJA_CONTENIDO} ${COLS_OBRAS} hover:bg-[#F2F1ED]`}
          style={{
            height: 42, paddingLeft: SANGRIA, borderBottom: `1px solid ${V.lineaFila}`,
            // Una obra sin monto contratado bloquea: no se puede decir qué se le facturó al cliente.
            boxShadow: veEconomia && o.monto_contratado == null ? FILO_BLOQUEA : 'none',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            <span style={{ display: 'flex', color: V.inerte, flexShrink: 0 }}>
              <IconoObra className="h-[15px] w-[15px]" />
            </span>
            <span className="truncate" style={{ fontSize: '12.5px', fontWeight: 500, color: V.tinta }}>
              {o.nombre}
            </span>
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

          {/* AVANCE — SIN CRONOGRAMA NO HAY 0 %. La ausencia se dice con palabras y en apagado: no
              bloquea nada, sólo todavía no se midió. */}
          {o.avance_pct != null
            ? (
                <span
                  className="font-mono tabular-nums"
                  style={{ fontSize: '12px', color: V.tintaSuave, textAlign: 'right' }}
                  data-testid="avance-obra-cliente"
                >
                  {o.avance_pct} %
                </span>
              )
            : (
                <span
                  className="truncate"
                  title={o.n_actividades ? 'sin avance cargado' : 'sin cronograma'}
                  style={{ fontSize: '11.5px', color: V.tenue, textAlign: 'right' }}
                  data-testid="avance-obra-cliente"
                >
                  {o.n_actividades ? 'sin avance cargado' : 'sin cronograma'}
                </span>
              )}

          {veEconomia
            ? (
                <span
                  className="font-mono tabular-nums truncate"
                  style={{ fontSize: '12px', color: o.monto_contratado == null ? V.warn : V.tinta, textAlign: 'right' }}
                >
                  {o.monto_contratado == null ? 'sin monto' : plata(o.monto_contratado)}
                </span>
              )
            : (
                <span className="truncate" style={{ fontSize: '12px', color: V.tenue, textAlign: 'right' }}>
                  {o.etapa ? ETAPA_LABEL[o.etapa] : 'etapa sin declarar'}
                </span>
              )}

          {/* LA PISTA DE 28px EXISTE Y VA VACÍA. El handoff pone acá el menú de fila, pero en esta
              ficha no hay ninguna acción de fila cableada para una obra —ni quitar, ni archivar: se
              archiva desde la obra—. Dibujar un `···` que sólo repite el enlace de la fila sería
              inventar una capacidad; reservar la pista es lo que mantiene la grilla exacta. */}
          <span aria-hidden />
        </Link>
      ))}
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
const COLS_PRES
  = 'gap-[14px] grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_44px_minmax(0,110px)_minmax(0,1fr)_28px]'
  + ' min-[1320px]:gap-[28px]'
  + ' min-[1320px]:grid-cols-[minmax(210px,1.8fr)_170px_60px_160px_minmax(150px,1fr)_28px]'

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
      <div className={`grid ${COLS_PRES}`} style={{ ...ENCABEZADO, gap: undefined, paddingLeft: SANGRIA }}>
        <RotuloCol>Presupuesto</RotuloCol>
        <RotuloCol>Estado</RotuloCol>
        <RotuloCol derecha>Rev.</RotuloCol>
        <RotuloCol derecha>Precio de venta</RotuloCol>
        <RotuloCol>Motivo / destino</RotuloCol>
        <RotuloCol />
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
            className={`grid items-center ${CAJA_CONTENIDO} ${COLS_PRES} hover:bg-[#F2F1ED]`}
            style={{ height: 42, paddingLeft: SANGRIA, borderBottom: `1px solid ${V.lineaFila}` }}
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
              className="font-mono tabular-nums"
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
              className="truncate"
              title={destino.texto}
              data-testid="destino-presupuesto"
              style={{ fontSize: '12px', color: destino.color }}
            >
              {destino.texto}
            </span>

            {/* Misma pista vacía que en Obras, y por el mismo motivo: no hay acción de fila. */}
            <span aria-hidden />
          </Link>
        )
      })}
    </div>
  )
}
