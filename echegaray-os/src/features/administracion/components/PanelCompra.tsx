// EL PANEL DE UN COMPROBANTE — lo que hace falta para decidir sobre ESE papel, y las tres decisiones.
//
// Es un Server Component a propósito: las acciones se importan y se pasan tal cual a `FormAccion`.
// Una `async (form) => …` escrita acá NO es una server action —compila, pasa el build y deja la
// pantalla en blanco en producción—, así que lo que varía por botón viaja en `<input type="hidden">`,
// que es como lo resuelve el resto del módulo.
//
// ═══ TRES BLOQUES QUE EL DISEÑO PIDE Y LA FUENTE NO PUEDE CONTESTAR IGUAL ═══
//
// 1 · ARCHIVO ORIGINAL. `comprobantes_arca` no guarda ninguna referencia a Drive: el libro de IVA de
//     ARCA trae los datos fiscales, no el PDF. Se dice «no disponible» y por qué. Un botón «Abrir»
//     que no abre nada es peor que la ausencia: hace perder el tiempo dos veces.
//
// 2 · DETALLE DEL COMPROBANTE. El diseño dibuja ítems («Acero ADN 420 Ø12 · 320 kg»). El libro de
//     ARCA no trae renglones — trae la APERTURA FISCAL. Eso es lo que se muestra, porque es lo que
//     existe: neto gravado, no gravado, exento, IVA, otros tributos y total. Dibujar renglones
//     vacíos sugeriría que alguien se olvidó de cargarlos.
//
// 3 · IMPUTACIÓN. El diseño pide cuatro campos: obra, rubro, partida y tipo de costo. La base tiene
//     UNO —`obra_texto`—. Los otros tres no existen en ninguna columna ni en ninguna otra fuente del
//     OS, y crearlos acá sería fabricar estructura de datos sin evidencia. Va la obra, que es además
//     la única de las cuatro que mueve plata: es la que decide a qué obra se le carga el costo.

import Link from 'next/link'
import { Campo, CTRL, FormAccion } from '@/shared/components/ui'
import { Estado, Eyebrow, Nulo, Num } from '@/shared/components/ds'
import { fecha, plata } from '@/features/obras/components/formato'
import { controlDe } from '../services/comprasEstado'
import { imputarComprobante, marcarControlComprobante } from '../services/actionsCompras'
import type { ComprobanteCompra, Parecido } from '../services/comprasService'

function Dato({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-[0.06em] text-faint">{rotulo}</div>
      <div className="mt-0.5 truncate text-[13px] text-ink">{children}</div>
    </div>
  )
}

/** Una línea de la apertura fiscal. El cero SE MUESTRA: «exento $0» es un dato, no un hueco. */
function Linea({ rotulo, valor }: { rotulo: string; valor: number | null }) {
  if (valor == null) return null
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-1.5 last:border-b-0">
      <span className="min-w-0 truncate text-[12px] text-muted">{rotulo}</span>
      <Num className="text-[12.5px] text-ink">{plata(valor)}</Num>
    </div>
  )
}

function BloqueParecido({ parecidos, hrefDe }: { parecidos: Parecido[]; hrefDe: (id: string) => string }) {
  if (parecidos.length === 0) return null
  const p = parecidos[0]
  const nro = [p.parecido_punto_venta, p.parecido_numero].filter(Boolean).join('-') || 'sin número'
  return (
    <div data-testid="bloque-duplicado" className="mt-5 rounded-control border border-neg/40 bg-neg/[0.04] p-3">
      <div className="text-[12px] font-semibold text-neg">Posible duplicado</div>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        Mismo proveedor, mismo importe y mismo tipo que <span className="font-mono">{nro}</span> del{' '}
        {fecha(p.parecido_fecha)}
        {p.dias_de_distancia != null && ` · ${p.dias_de_distancia} día(s) de distancia`}.
        {p.parecido_obra_texto ? ` Aquél está imputado a ${p.parecido_obra_texto}.` : ' Aquél no tiene obra.'}
        {parecidos.length > 1 && ` Y ${parecidos.length - 1} más.`}
      </p>
      {/* NO DICE «ES UN DUPLICADO». Dos comprobantes con números distintos son dos papeles fiscales
          legítimos, y dos compras iguales de verdad existen —dos viajes de áridos del mismo camión
          salen igual—. El OS señala el parecido; quien decide es una persona. */}
      <p className="mt-2 text-[11px] leading-relaxed text-faint">
        Son dos comprobantes distintos ante ARCA (número y CAE propios). Puede ser el proveedor
        facturando dos veces lo mismo, o dos compras iguales de verdad.
      </p>
      <Link
        href={hrefDe(p.parecido_a_id)}
        data-testid="comparar-duplicado"
        className="mt-2 inline-block text-[12px] font-medium text-ink underline underline-offset-2"
      >
        Comparar
      </Link>
    </div>
  )
}

export function PanelCompra({
  compra,
  parecidos,
  obras,
  cerrarHref,
  hrefDe,
}: {
  compra: ComprobanteCompra
  parecidos: Parecido[]
  obras: string[]
  cerrarHref: string
  hrefDe: (id: string) => string
}) {
  const control = controlDe(compra)
  const importe = compra.imp_total != null && compra.signo != null
    ? compra.signo * compra.imp_total
    : compra.imp_total

  return (
    <aside
      data-testid="panel-compra"
      className="w-full shrink-0 border-t border-line pt-4 lg:w-[396px] lg:border-l lg:border-t-0 lg:py-1 lg:pl-6 lg:pt-0"
    >
      <div className="flex items-baseline gap-2.5">
        <h2 className="min-w-0 flex-1 truncate font-mono text-[14px] font-semibold text-ink">
          {compra.comprobante || 'sin número'} · {compra.tipo_nombre}
        </h2>
        <Link
          href={cerrarHref} data-testid="cerrar-panel" aria-label="Cerrar el panel"
          className="shrink-0 text-[12px] leading-none text-faint transition-colors hover:text-ink"
        >✕</Link>
      </div>
      <p className="mt-1 truncate text-[12.5px] text-muted">
        {compra.emisor_nombre?.trim() || <Nulo>sin proveedor</Nulo>}
        {compra.emisor_cuit && <span className="ml-2 font-mono text-[11px] text-faint">CUIT {compra.emisor_cuit}</span>}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-3 border-y border-line py-3">
        <Dato rotulo="Importe">
          {importe == null
            ? <Nulo>sin importe</Nulo>
            : <Num className={importe < 0 ? 'text-pos' : 'text-ink'}>{plata(importe)}</Num>}
        </Dato>
        <Dato rotulo="Fecha">{fecha(compra.fecha_emision)}</Dato>
        <Dato rotulo="Control">
          <Estado tono={control.tono} clave={control.clave} testid="estado-panel">{control.etiqueta}</Estado>
        </Dato>
      </div>

      {/* ── el archivo original, que hoy no está ─────────────────────────────────────────────── */}
      <div className="mt-4 rounded-control border border-line px-3 py-2.5" data-testid="archivo-original">
        <div className="text-[12px] text-muted">
          Archivo original: <span className="text-faint">no disponible</span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-faint">
          Este comprobante viene del libro de IVA de ARCA, que publica los datos fiscales y no el
          PDF. La base no guarda ninguna referencia al archivo, así que no hay nada que abrir.
          {compra.cae && <> La referencia fiscal es el CAE <span className="font-mono">{compra.cae}</span>.</>}
        </p>
      </div>

      {/* ── imputación ───────────────────────────────────────────────────────────────────────── */}
      <div className="mt-5">
        <Eyebrow className="mb-2">Imputación</Eyebrow>
        <FormAccion
          accion={imputarComprobante}
          testid="form-imputar"
          enviar={compra.obra_texto ? 'Cambiar la obra' : 'Imputar a la obra'}
          mensajeOk="Imputado."
        >
          <input type="hidden" name="id" value={compra.id} />
          <input type="hidden" name="obra_previa" value={compra.obra_texto ?? ''} />
          <Campo
            label="Obra"
            ayuda="En blanco saca la imputación y devuelve el comprobante a la cola."
          >
            <select name="obra_texto" defaultValue={compra.obra_texto ?? ''} className={CTRL} data-testid="obra-comprobante">
              <option value="">sin asignar</option>
              {/* La obra que ya tiene el comprobante puede no estar en la lista canónica (viene de
                  otra grafía o de una obra cerrada). Se agrega para no perderla al abrir el panel. */}
              {compra.obra_texto && !obras.includes(compra.obra_texto) && (
                <option value={compra.obra_texto}>{compra.obra_texto}</option>
              )}
              {obras.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Campo>
        </FormAccion>
        {compra.obra_asignada_por && (
          <p className="mt-2 text-[11px] text-faint" data-testid="firma-imputacion">
            Imputó {compra.obra_asignada_por}
            {compra.obra_asignada_en && ` el ${fecha(compra.obra_asignada_en)}`}.
          </p>
        )}
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          ARCA no dice a qué obra fue la compra: la atribución la hace una persona y queda firmada.
          Rubro, partida y tipo de costo no se piden acá porque no existen en la fuente.
        </p>
      </div>

      {/* ── la apertura fiscal, que es el detalle que la fuente sí tiene ─────────────────────── */}
      <div className="mt-5">
        <Eyebrow className="mb-1">Detalle del comprobante</Eyebrow>
        <div data-testid="detalle-fiscal">
          <Linea rotulo="Neto gravado" valor={compra.neto_gravado} />
          <Linea rotulo="Neto no gravado" valor={compra.neto_no_gravado} />
          <Linea rotulo="Exento" valor={compra.exento} />
          <Linea rotulo="IVA" valor={compra.total_iva} />
          <Linea rotulo="Otros tributos" valor={compra.otros_tributos} />
          <Linea rotulo="Total del comprobante" valor={compra.imp_total} />
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-faint">
          El libro de ARCA no trae los renglones de lo comprado: trae la apertura fiscal. Es lo que
          se muestra porque es lo que hay. Período {compra.periodo ?? '—'} · origen {compra.origen ?? '—'}.
        </p>
      </div>

      <BloqueParecido parecidos={parecidos} hrefDe={hrefDe} />

      {/* ── las dos decisiones ───────────────────────────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-start gap-3 border-t border-line pt-4">
        <FormAccion
          accion={marcarControlComprobante} testid="form-confirmar" enviar="Confirmar"
          mensajeOk="Confirmado."
        >
          <input type="hidden" name="id" value={compra.id} />
          <input type="hidden" name="estado" value="confirmado" />
        </FormAccion>
        <FormAccion
          accion={marcarControlComprobante} testid="form-en-revision" enviar="Dejar en revisión"
          mensajeOk="Queda en revisión."
        >
          <input type="hidden" name="id" value={compra.id} />
          <input type="hidden" name="estado" value="en_revision" />
        </FormAccion>
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-faint">
        Confirmar dice que el papel está bien y apaga el aviso de parecido — no lo imputa a ninguna
        obra. Dejar en revisión lo manda a la cola «por revisar» sin decidir.
        {compra.estado_control_por && (
          <> Última marca: {compra.estado_control} por {compra.estado_control_por}
            {compra.estado_control_en && ` el ${fecha(compra.estado_control_en)}`}.</>
        )}
      </p>
    </aside>
  )
}
