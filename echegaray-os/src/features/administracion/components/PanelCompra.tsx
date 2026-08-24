// EL PANEL DE UN COMPROBANTE — lo que hace falta para decidir sobre ESE papel, y las tres decisiones.
//
// Es un Server Component a propósito: las acciones se importan y se pasan tal cual a `FormAccion`.
// Una `async (form) => …` escrita acá NO es una server action —compila, pasa el build y deja la
// pantalla en blanco en producción—, así que lo que varía por botón viaja en `<input type="hidden">`,
// que es como lo resuelve el resto del módulo.
//
// ═══ TRES BLOQUES QUE EL DISEÑO PIDE Y LA FUENTE NO PUEDE CONTESTAR IGUAL ═══
//
// 1 · COMPROBANTE ORIGINAL. `comprobantes_arca` no guarda ninguna referencia a Drive: el libro de
//     IVA de ARCA trae los datos fiscales, no el PDF. Se dice «no disponible» y por qué. Un botón
//     «Abrir» que no abre nada es peor que la ausencia: hace perder el tiempo dos veces.
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
import { Ayuda, Estado, Eyebrow, Nulo, Num } from '@/shared/components/ds'
import { IconoDocumento } from '@/shared/components/iconos'
import { fecha, plata } from '@/features/obras/components/formato'
import { controlDe } from '../services/comprasEstado'
import { imputarComprobante, marcarControlComprobante } from '../services/actionsCompras'
import type { ComprobanteCompra, Parecido } from '../services/comprasService'

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

// ═══ COMPROBANTE ORIGINAL — COMPONENTS.md §Document preview ═══
//
// «La referencia documental es única y se reutiliza desde Compra, Proveedor, Obra y Pendientes: la
// UI nunca sugiere que hay copias». Acá esa referencia única es el CAE: es lo que ARCA le puso al
// papel y lo que permite pedírselo al proveedor o buscarlo en el archivo. No hay contador de
// archivos porque no hay archivos, y no hay `Abrir` ni `Descargar` porque no habría qué abrir.
function ComprobanteOriginal({ compra }: { compra: ComprobanteCompra }) {
  return (
    <div className="mt-4" data-testid="archivo-original">
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow>Comprobante original</Eyebrow>
        <span className="text-[11.5px] text-faint">no disponible</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2.5 rounded-control bg-surface-sunken px-3 py-3">
        <IconoDocumento className="h-[15px] w-[15px] shrink-0 text-faint" aria-hidden />
        <span className="min-w-0 text-[11.5px] leading-snug text-muted">
          {compra.cae
            ? <>CAE <span className="font-mono text-ink">{compra.cae}</span></>
            : 'Sin CAE: este papel no trae su referencia fiscal.'}
        </span>
      </div>
      <Ayuda titulo="Por qué no hay archivo">
        Este comprobante viene del libro de IVA de ARCA, que publica los datos fiscales y no el PDF.
        La base no guarda ninguna referencia al archivo, así que no hay nada que abrir. El CAE es la
        única referencia del papel, y es la misma en Compras, en la ficha del proveedor y en la obra.
      </Ayuda>
    </div>
  )
}

// ═══ IMPUTAR — COMPONENTS.md §Imputation selector ═══
//
// «El importe grande, el original a la vista, un select de obra y hasta tres atajos como pastillas
// con las obras probables. Cierra con Confirmar (primaria) y Saltar (discreta)».
//
// Los atajos son ENLACES, no botones de envío: tocar uno deja la obra elegida en el select y en la
// URL, y la decisión sigue cerrándose con la primaria. Tres botones amarillos que guardan solos
// serían tres primarias en el mismo contexto —el contrato admite una— y, sobre todo, convertirían
// un roce del dedo en una imputación guardada sin que nadie confirmara nada.
function Imputar({
  compra,
  obras,
  atajos,
  elegida,
  hrefObra,
  saltarHref,
}: {
  compra: ComprobanteCompra
  obras: string[]
  atajos: string[]
  elegida: string | undefined
  hrefObra: (obra: string) => string
  saltarHref: string
}) {
  // Lo que el atajo dejó elegido gana sobre lo que el comprobante ya tenía: es lo último que hizo
  // la persona. Sin atajo tocado, manda el dato guardado.
  const valor = elegida ?? compra.obra_texto ?? ''
  return (
    <div className="mt-5" data-testid="selector-imputacion">
      <Eyebrow className="mb-2">Imputación</Eyebrow>
      {/* A DÓNDE LLEGA EL GASTO, que no siempre es lo que dice el rótulo. Un texto que el
          diccionario de obras no conoce se ve imputado en el papel y no llega a ninguna obra: si
          esto no se dice acá, se corrige la obra equivocada o no se corrige nada. */}
      {compra.imputacion === 'estructura' && (
        <p className="mb-2 text-[11.5px] leading-relaxed text-muted" data-testid="imputacion-estructura">
          Imputado a <span className="font-medium text-ink">Estructura</span>: no es costo de ninguna
          obra y no está pendiente.
        </p>
      )}
      {compra.imputacion === 'sin_resolver' && (
        <p className="mb-2 text-[11.5px] leading-relaxed text-warn" data-testid="imputacion-sin-resolver">
          «{compra.obra_texto}» no está en el diccionario de obras: este gasto NO llega a ninguna
          obra. Se arregla declarando el alias, no eligiendo otra obra acá.
        </p>
      )}

      {atajos.length > 0 && (
        <div className="mb-2.5 flex flex-wrap items-center gap-1.5" data-testid="atajos-obra">
          {atajos.map((o) => (
            <Link
              key={o}
              href={hrefObra(o)}
              scroll={false}
              prefetch={false}
              data-testid="atajo-obra"
              data-elegido={o === valor ? '' : undefined}
              className={`max-w-full truncate rounded-control border px-2 py-[3px] text-[11.5px] transition-colors ${
                o === valor
                  ? 'border-line-strong bg-surface-quiet text-ink'
                  : 'border-line text-muted hover:border-line-strong hover:text-ink'
              }`}
            >{o}</Link>
          ))}
        </div>
      )}

      <FormAccion
        accion={imputarComprobante}
        testid="form-imputar"
        enviar="Confirmar"
        mensajeOk="Imputado."
      >
        <input type="hidden" name="id" value={compra.id} />
        <input type="hidden" name="obra_previa" value={compra.obra_texto ?? ''} />
        <Campo label="Obra">
          {/* `key` fuerza a React a rehacer el select cuando cambia el atajo elegido: sin eso, el
              `defaultValue` nuevo no pisa el valor que el DOM ya tenía y la pastilla se vería
              elegida con el select mostrando otra obra. */}
          <select
            key={valor} name="obra_texto" defaultValue={valor} className={CTRL}
            data-testid="obra-comprobante"
          >
            <option value="">sin asignar</option>
            {/* La obra que ya tiene el comprobante puede no estar en la lista canónica (viene de
                otra grafía o de una obra cerrada). Se agrega para no perderla al abrir el panel. */}
            {valor && !obras.includes(valor) && <option value={valor}>{valor}</option>}
            {obras.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </Campo>
      </FormAccion>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <Link
          href={saltarHref} data-testid="saltar-imputacion" prefetch={false}
          className="text-[12px] text-muted underline underline-offset-2 hover:text-ink"
        >Saltar</Link>
        {compra.obra_asignada_por && (
          <span className="text-[11px] text-faint" data-testid="firma-imputacion">
            Imputó {compra.obra_asignada_por}
            {compra.obra_asignada_en && ` el ${fecha(compra.obra_asignada_en)}`}.
          </span>
        )}
      </div>
      <Ayuda titulo="De dónde salen los atajos">
        ARCA no dice a qué obra fue la compra: la atribución la hace una persona y queda firmada. Los
        atajos son las obras a las que ya fueron otros comprobantes de este mismo CUIT — historial,
        no recomendación. Rubro, partida y tipo de costo no se piden acá porque no existen en la
        fuente. Dejar la obra en blanco saca la imputación y devuelve el comprobante a la cola.
      </Ayuda>
    </div>
  )
}

/** Una cara de la comparación de duplicados. Ambas columnas dicen lo mismo, en el mismo orden. */
function Cara({
  rotulo,
  tono,
  numero,
  importe,
  cuando,
  obra,
  origen,
  testid,
}: {
  rotulo: string
  tono: 'neutro' | 'neg'
  numero: string
  importe: number | null
  cuando: string | null
  obra: string | null
  origen: string | null
  testid: string
}) {
  return (
    <div
      data-testid={testid}
      className={`min-w-0 flex-1 px-3 py-2.5 ${tono === 'neg' ? 'bg-surface-quiet' : ''}`}
    >
      <div className={`text-[10px] uppercase tracking-[0.06em] ${tono === 'neg' ? 'text-neg' : 'text-faint'}`}>
        {rotulo}
      </div>
      <div className="mt-1 truncate font-mono text-[12.5px] text-ink">{numero}</div>
      <div className="mt-0.5">
        {importe == null ? <Nulo>sin importe</Nulo> : <Num className="text-[13px] text-ink">{plata(importe)}</Num>}
      </div>
      <div className="mt-0.5 truncate text-[11.5px] text-muted">
        {cuando ?? 'sin fecha'} · {obra?.trim() || <span className="text-warn">sin obra</span>}
      </div>
      <div className="mt-0.5 truncate text-[11px] text-faint">
        {origen ? `origen ${origen}` : 'origen que la vista no publica'}
      </div>
    </div>
  )
}

// ═══ DUPLICADO — COMPONENTS.md §Duplicate comparison ═══
//
// «Dos columnas de igual ancho separadas por hairline, y dos salidas explícitas».
//
// El contrato rotula las columnas «Ya registrada | Nueva» y ofrece «descartar». Acá no se puede:
// los DOS comprobantes ya están registrados —los dos vinieron del libro de ARCA— y ninguno se
// puede borrar sin falsear el libro fiscal. Las salidas son las dos que sí existen y las dos
// deciden lo mismo que el contrato quiere decidir: si son el mismo gasto (queda en revisión, para
// tratarlo con el proveedor) o si son dos compras distintas de verdad (se confirma y el aviso se
// apaga). Ninguna de las dos toca la plata: la corrección de un facturado dos veces es una nota de
// crédito del proveedor, no un borrado nuestro.
function Duplicado({
  compra,
  parecidos,
  hrefDe,
}: {
  compra: ComprobanteCompra
  parecidos: Parecido[]
  hrefDe: (id: string) => string
}) {
  if (parecidos.length === 0) return null
  const p = parecidos[0]
  const nro = [p.parecido_punto_venta, p.parecido_numero].filter(Boolean).join('-') || 'sin número'
  return (
    <div data-testid="bloque-duplicado" className="mt-5 rounded-control border border-neg/40">
      <div className="border-b border-neg/30 px-3 py-2 text-[12px] font-semibold text-neg">
        Posible duplicado
        {parecidos.length > 1 && <span className="ml-2 font-normal text-muted">y {parecidos.length - 1} más</span>}
      </div>
      <div className="flex divide-x divide-line">
        <Cara
          testid="cara-otro" rotulo="El otro" tono="neutro" numero={nro}
          importe={p.parecido_imp_total} cuando={p.parecido_fecha ? fecha(p.parecido_fecha) : null}
          obra={p.parecido_obra_texto} origen={null}
        />
        <Cara
          testid="cara-este" rotulo="Éste" tono="neg" numero={compra.comprobante || 'sin número'}
          importe={compra.imp_total} cuando={compra.fecha_emision ? fecha(compra.fecha_emision) : null}
          obra={compra.obra_texto} origen={compra.origen}
        />
      </div>
      <p className="border-t border-line px-3 py-2 text-[11.5px] leading-relaxed text-muted">
        Mismo proveedor, mismo importe y mismo tipo
        {p.dias_de_distancia != null && `, con ${p.dias_de_distancia} día(s) de distancia`}. Son dos
        comprobantes distintos ante ARCA (número y CAE propios): puede ser el proveedor facturando
        dos veces lo mismo, o dos compras iguales de verdad.
      </p>
      <div className="flex flex-wrap items-center gap-3 border-t border-line px-3 py-2.5">
        <FormAccion
          accion={marcarControlComprobante} testid="form-en-revision"
          enviar="Es la misma · dejar en revisión" mensajeOk="Queda en revisión."
        >
          <input type="hidden" name="id" value={compra.id} />
          <input type="hidden" name="estado" value="en_revision" />
        </FormAccion>
        <FormAccion
          accion={marcarControlComprobante} testid="form-confirmar"
          enviar="Son distintas · confirmar" mensajeOk="Confirmado."
        >
          <input type="hidden" name="id" value={compra.id} />
          <input type="hidden" name="estado" value="confirmado" />
        </FormAccion>
        <Link
          href={hrefDe(p.parecido_a_id)} data-testid="comparar-duplicado" prefetch={false}
          className="text-[12px] text-muted underline underline-offset-2 hover:text-ink"
        >Abrir el otro</Link>
      </div>
    </div>
  )
}

export function PanelCompra({
  compra,
  parecidos,
  obras,
  atajos,
  obraElegida,
  cerrarHref,
  hrefDe,
  hrefObra,
}: {
  compra: ComprobanteCompra
  parecidos: Parecido[]
  obras: string[]
  /** Las obras a las que ya fueron otros comprobantes de este CUIT. Historial, no sugerencia. */
  atajos: string[]
  /** La obra que dejó elegida un atajo, si se tocó uno. */
  obraElegida?: string
  cerrarHref: string
  hrefDe: (id: string) => string
  hrefObra: (obra: string) => string
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

      {/* EL IMPORTE GRANDE — es el número que decide, y el que la persona compara contra el papel
          que tiene en la mano. Al lado, la fecha y el control: los otros dos datos que se miran
          antes de imputar. `Sincronizada` no se dibuja acá tampoco (COMPONENTS.md §Sync state). */}
      <div className="mt-3 flex items-end justify-between gap-4 border-y border-line py-3">
        <div className="min-w-0">
          {importe == null
            ? <Nulo>sin importe</Nulo>
            : (
                <Num className={`text-[24px] font-semibold leading-none tracking-[-0.02em] ${importe < 0 ? 'text-pos' : 'text-ink'}`}>
                  {plata(importe)}
                </Num>
              )}
          <div className="mt-1.5 text-[11.5px] text-muted">{fecha(compra.fecha_emision)}</div>
        </div>
        {control.clave !== 'sincronizada' && (
          <Estado tono={control.tono} clave={control.clave} testid="estado-panel">{control.etiqueta}</Estado>
        )}
      </div>

      <ComprobanteOriginal compra={compra} />

      <Imputar
        compra={compra} obras={obras} atajos={atajos} elegida={obraElegida}
        hrefObra={hrefObra} saltarHref={cerrarHref}
      />

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
        <p className="mt-1.5 text-[11px] text-faint">
          Período {compra.periodo ?? '—'} · origen {compra.origen ?? '—'}
        </p>
        <Ayuda titulo="Por qué no hay renglones">
          El libro de ARCA no trae lo comprado ítem por ítem: trae la apertura fiscal. Es lo que se
          muestra porque es lo que hay.
        </Ayuda>
      </div>

      <Duplicado compra={compra} parecidos={parecidos} hrefDe={hrefDe} />

      {/* ── el control del papel, cuando no hay un duplicado que ya lo pregunte ──────────────── */}
      {parecidos.length === 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <div className="flex flex-wrap items-start gap-3">
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
          {compra.estado_control_por && (
            <p className="mt-2 text-[11px] text-faint">
              Última marca: {compra.estado_control} por {compra.estado_control_por}
              {compra.estado_control_en && ` el ${fecha(compra.estado_control_en)}`}.
            </p>
          )}
          <Ayuda titulo="Qué hace cada una">
            Confirmar dice que el papel está bien y apaga el aviso de parecido — no lo imputa a
            ninguna obra. Dejar en revisión lo manda a la cola «por revisar» sin decidir.
          </Ayuda>
        </div>
      )}
    </aside>
  )
}
