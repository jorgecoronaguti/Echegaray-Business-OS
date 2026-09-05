// LA DECISIÓN SOBRE UN TEXTO — las dos preguntas, lo que se va a mover, y el verbo.
//
// ═══ LA RESOLUCIÓN ES SIEMPRE MÚLTIPLE, Y POR ESO ES SEGURA ═══
//
// Acá el lote no es una opción que se marca: es la única resolución posible. Lo que se escribe es
// UNA fila de `obra_alias` para la clave, y esa fila vale para todas las filas que dicen lo mismo.
// Por eso «Las filas que va a mover» se muestran ANTES de confirmar: no para elegir cuáles, sino
// para que quien resuelve vea todo lo que va a mover. Lo que NO existe es resolver dos claves
// juntas: dos textos distintos son dos preguntas distintas.
//
// ═══ «SUGERIDO» VACÍO ES LA RESPUESTA CORRECTA, NO UN HUECO ═══
//
// Un nombre de obra propuesto sin decir de dónde salió es indistinguible de una adivinanza. Cuando
// la evidencia es un juicio humano sobre el MISMO texto, la obra viene marcada; cuando es una
// inferencia por el proveedor, se dice cuál es y no se marca nada. Y cuando no hay evidencia —que
// es lo más frecuente— el recuadro dice por qué no la hay. «Estrella Norte» no es «La Estrella», y
// proponerla fabrica costo en la obra equivocada sin que nada avise.

'use client'

import { fechaCorta, plata } from '@/features/obras/components/formato'
import { porcentaje } from '@/shared/utils/format'
import {
  IconoCompletar, IconoEstructura, IconoExcluido, IconoInfo, IconoMantenimiento, IconoObra,
} from '@/shared/components/iconos'
import { ETIQUETA_TIPO, type GrupoPendiente, type ObraElegible } from '../services/imputacionService'
import { CLASIFICACIONES, pideObra, type Clasificacion } from '../services/pendientesVista'

const ICONO_CLASE: Record<Clasificacion, (p: { className?: string }) => React.ReactElement> = {
  obra: IconoObra,
  mantenimiento: IconoMantenimiento,
  indirecto: IconoEstructura,
  excluido: IconoExcluido,
}

const SIN_OBRA: Record<'indirecto' | 'excluido', string> = {
  indirecto: 'El costo queda en la empresa —Administración, Taller, F931, UOCRA— y no entra en ninguna obra.',
  excluido: 'La fila se registra pero no cuenta como costo en ningún lado.',
}

function Sugerencia({ g, nombreDeObra }: { g: GrupoPendiente; nombreDeObra: (id: string) => string }) {
  return (
    <div className="mt-4 flex max-w-[640px] items-start gap-[9px] rounded-[8px] border border-line bg-surface-quiet px-3 py-2.5">
      <IconoInfo className="mt-px h-[15px] w-[15px] shrink-0 text-faint" />
      {g.sugerencia
        ? (
            <span data-testid="sugerencia" className="text-[12px] leading-relaxed text-ink-soft text-pretty">
              <span data-testid="motivo-sugerencia">
                <span className="font-medium text-ink">Sugerido: {nombreDeObra(g.sugerencia.obra_id)}.</span>{' '}
                {g.sugerencia.motivo}
                {!g.sugerencia.preseleccionar && ' Es una inferencia, no un hecho: elegí la obra a mano.'}
              </span>
            </span>
          )
        : (
            <span data-testid="sin-sugerencia" className="text-[12px] leading-relaxed text-ink-soft text-pretty">
              Sin evidencia previa para este texto. No se propone obra por parecido de nombre: es lo
              que fabrica costo en la obra equivocada.
            </span>
          )}
    </div>
  )
}

function Obra({ o, elegida, alElegir }: { o: ObraElegible; elegida: boolean; alElegir: () => void }) {
  const av = porcentaje(o.avance_pct)
  return (
    <button
      type="button"
      data-testid={`obra-${o.obra_id}`}
      onClick={alElegir}
      aria-pressed={elegida}
      className={`flex items-center gap-2.5 rounded-[7px] px-2.5 py-[9px] text-left transition-colors ${
        elegida ? 'bg-marca-soft shadow-[inset_2px_0_0_var(--os-marca)]' : 'hover:bg-surface-sunken'
      }`}
    >
      <span className={`h-3 w-3 shrink-0 rounded-full border ${elegida ? 'border-accent bg-accent' : 'border-line-strong'}`} />
      <span className={`min-w-0 truncate text-[12.5px] text-ink ${elegida ? 'font-semibold' : ''}`}>{o.nombre}</span>
      <span className="ml-auto shrink-0 text-[11.5px] text-faint">{o.cliente_nombre ?? 'sin cliente'}</span>
      {/* UNA OBRA SIN ACTIVIDADES MEDIDAS NO AVANZÓ 0 %: no se sabe. El hueco se nombra. */}
      <span className="shrink-0 text-right font-mono text-[11.5px] tabular-nums text-muted">
        {av ?? <span className="text-faint">sin medir</span>}
      </span>
    </button>
  )
}

/**
 * ═══ EL RECURSO TIENE COLUMNA PROPIA (handoff CRM / Administración v4) ═══
 *
 * Hasta acá el recurso y el importe compartían la última celda: se dibujaba el importe, y el recurso
 * SÓLO cuando no había importe. En herramientas y movimientos funcionaba —esas filas mueven un
 * recurso y no plata— pero en compras el recurso ES EL PROVEEDOR, y esas filas siempre tienen
 * importe. Resultado: la pantalla que pregunta «¿de quién es este costo?» escondía justo el dato
 * con el que se contesta, y encima es la evidencia que usa el sugeridor («el proveedor nunca compró
 * para otra obra»). Quien decidía veía «Hierro del 8 · $ 3.410.000» sin saber a quién se le compró.
 *
 * ═══ LA COLUMNA TIPO SÓLO APARECE CUANDO EL GRUPO MEZCLA FUENTES ═══
 *
 * El encabezado ya dice «Aparece en Compras · Herramientas». Cuando el grupo viene de una sola, la
 * columna repetiría esa palabra en las veinte filas: ancho gastado para no decir nada. Cuando
 * mezcla, es lo único que distingue una fila de la de al lado.
 */
/**
 * LA GRILLA DEL HANDOFF v4, carácter por carácter — `Pendientes de imputación · una pantalla.dc.html`:
 *   `120px 100px minmax(0,1.6fr) minmax(0,1fr) 140px`, gap 28, sangría 16, fila de 66px de alto
 *   TIPO · FECHA · DESCRIPCIÓN · RECURSO · IMPORTE
 *
 * ═══ POR QUÉ UNA GRILLA Y NO EL `flex` QUE HABÍA ═══
 *
 * La fila era un `flex` con TODOS sus hijos en `shrink-0` menos la descripción: en angosto no
 * encogía, DESBORDABA sobre lo de al lado, y encima cada fila decidía sus anchos por su cuenta, sin
 * ningún encabezado arriba que dijera qué era cada columna. Cinco pistas declaradas una sola vez
 * atan el rótulo y la celda al mismo ancho: sacar o agregar una columna ya no puede correr la fila
 * respecto de su cabecera.
 *
 * Las dos variantes son la MISMA cadena menos la primera pista, para que no puedan divergir.
 */
const COLS_FILAS = 'grid-cols-[120px_100px_minmax(0,1.6fr)_minmax(0,1fr)_140px]'
/** La misma cadena MENOS la primera pista: el grupo de una sola fuente no dibuja TIPO. */
const COLS_SIN_TIPO = 'grid-cols-[100px_minmax(0,1.6fr)_minmax(0,1fr)_140px]'
/** Las dos van literales y enteras: Tailwind escanea el archivo y no compila una clase que se arma
 *  concatenando en runtime — `grid-cols-[${...}]` deja la fila sin ninguna grilla. */
const gridDe = (conTipo: boolean) =>
  `grid gap-[28px] pl-4 ${conTipo ? COLS_FILAS : COLS_SIN_TIPO}`

/** El encabezado del mockup: 40px, versalitas de 10.5px, y NINGÚN filo debajo (`33:115`). */
function CabeceraFilas({ conTipo }: { conTipo: boolean }) {
  return (
    <div className={`${gridDe(conTipo)} h-10 items-center text-[10.5px] font-semibold uppercase tracking-[0.07em] text-faint`}>
      {conTipo && <span>Tipo</span>}
      <span>Fecha</span>
      <span>Descripción</span>
      <span>Recurso</span>
      <span className="text-right">Importe</span>
    </div>
  )
}

function FilaQueSeMueve({ f, conTipo }: { f: GrupoPendiente['filas'][number]; conTipo: boolean }) {
  return (
    <div data-testid="fila-detalle" className={`${gridDe(conTipo)} min-h-[66px] items-center border-b border-line`}>
      {conTipo && (
        <span className="truncate text-[11.5px] text-muted" data-testid="fila-tipo">
          {ETIQUETA_TIPO[f.tipo]}
        </span>
      )}
      <span className={`truncate font-mono text-[11.5px] tabular-nums ${f.fecha ? 'text-muted' : 'text-faint'}`}>
        {f.fecha ? fechaCorta(f.fecha) : 'sin fecha'}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-[12px] text-ink">{f.descripcion}</span>
        {/* LA TRAZABILIDAD ES LA TABLA MÁS EL IDENTIFICADOR: sin el segundo, «salió de compras» no
            permite ir a buscar el comprobante y confirmarlo. */}
        <span className="truncate font-mono text-[10.5px] text-faint">
          {f.tabla}{f.referencia ? ` · ${f.referencia}` : ''}{f.fuente ? ` · ${f.fuente}` : ''}
        </span>
      </span>
      {/* SIN RECURSO NO ES UN GUIÓN: en una compra es el proveedor que nadie escribió, y es
          exactamente lo que hace falta para saber de quién es el costo. */}
      <span className={`truncate text-[11.5px] ${f.recurso ? 'text-ink-soft' : 'text-faint'}`} data-testid="fila-recurso">
        {f.recurso ?? 'sin recurso'}
      </span>
      {/* UNA FILA QUE MUEVE UN RECURSO Y NO PLATA NO VALE $ 0. */}
      <span className={`truncate text-right font-mono text-[11.5px] tabular-nums ${f.importe != null ? 'text-muted' : 'text-faint'}`}>
        {f.importe != null ? plata(f.importe) : 'sin importe'}
      </span>
    </div>
  )
}

export function DecisionPendiente({
  g, obras, clase, obraElegida, error, enCurso, restantes, nombreDeObra,
  alElegirClase, alElegirObra, alResolver,
}: {
  g: GrupoPendiente
  obras: ObraElegible[]
  clase: Clasificacion
  obraElegida: string
  error: string | null
  enCurso: boolean
  /** Cuántos textos quedan detrás de éste. Es el largo de la cola, no una estimación. */
  restantes: number
  nombreDeObra: (id: string) => string
  alElegirClase: (c: Clasificacion) => void
  alElegirObra: (id: string) => void
  alResolver: () => void
}) {
  const hayQueElegirObra = pideObra(clase)
  const listo = !hayQueElegirObra || !!obraElegida
  const filas = `${g.cantidad} ${g.cantidad === 1 ? 'fila' : 'filas'}`

  return (
    <form
      data-testid="form-resolver"
      onSubmit={(e) => { e.preventDefault(); if (listo && !enCurso) alResolver() }}
      className="flex min-h-0 min-w-0 flex-1 flex-col pl-0 lg:pl-6"
    >
      <div data-testid="panel-pendiente" className="min-h-0 flex-1 overflow-y-auto pb-4">
        <div className="flex items-baseline gap-3">
          <h2 className="min-w-0 truncate font-mono text-[24px] font-semibold tracking-[-0.01em] text-ink">{g.textos[0]}</h2>
          <span className="shrink-0 font-mono text-[11px] text-faint">clave «{g.clave}»</span>
        </div>
        {/* SE NOMBRAN LAS FUENTES, NO SE CUENTAN. «Aparece en 2 fuentes» obliga a ir a buscar
            cuáles; «Herramientas · Movimientos» ya dice dónde mirar. */}
        <p className="mt-[5px] truncate text-[12.5px] text-muted">
          Aparece en {g.tipos.map((t) => ETIQUETA_TIPO[t]).join(' · ')} · {filas} ·{' '}
          {g.importe > 0 ? plata(g.importe) : 'sin importe asociado'}
        </p>
        {g.textos.length > 1 && (
          <p className="mt-[5px] flex items-baseline gap-[7px]">
            <span className="shrink-0 text-[11.5px] text-faint">y {g.textos.length - 1} grafía(s) más:</span>
            <span className="min-w-0 truncate font-mono text-[11.5px] text-muted">{g.textos.slice(1).join(' · ')}</span>
          </p>
        )}

        <Sugerencia g={g} nombreDeObra={nombreDeObra} />

        <div className="mt-[22px]">
          <div className="mb-2 text-[13px] font-semibold text-ink">¿Qué es?</div>
          <div className="flex flex-wrap gap-[7px]">
            {CLASIFICACIONES.map((k) => {
              const Icono = ICONO_CLASE[k.clave]
              const on = clase === k.clave
              return (
                <button
                  key={k.clave} type="button" data-testid={`clase-${k.clave}`}
                  onClick={() => alElegirClase(k.clave)} aria-pressed={on}
                  className={`flex items-center gap-[7px] rounded-[7px] border px-3 py-2 text-[12.5px] text-ink transition-colors ${
                    on ? 'border-marca bg-marca font-semibold' : 'border-line bg-surface hover:border-line-strong'
                  }`}
                >
                  <Icono className={`h-[14px] w-[14px] ${on ? 'text-ink' : 'text-faint'}`} />
                  {k.rotulo}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-[22px]">
          <div className="mb-2 flex items-baseline gap-[9px]">
            <span className={`text-[13px] font-semibold ${hayQueElegirObra ? 'text-ink' : 'text-muted'}`}>
              {hayQueElegirObra ? '¿Cuál obra?' : 'No hace falta elegir obra'}
            </span>
            {hayQueElegirObra && <span className="text-[11.5px] text-faint">una sola</span>}
          </div>
          {hayQueElegirObra
            ? (
                <div className="flex max-w-[640px] flex-col gap-px">
                  {obras.map((o) => (
                    <Obra key={o.obra_id} o={o} elegida={obraElegida === o.obra_id} alElegir={() => alElegirObra(o.obra_id)} />
                  ))}
                </div>
              )
            : (
                <p className="max-w-[640px] text-[12px] leading-relaxed text-muted text-pretty">
                  {SIN_OBRA[clase as 'indirecto' | 'excluido']}
                </p>
              )}
        </div>

        {/* 860px y no 640: con el recurso y el importe en celdas propias, el ancho de lectura de los
            párrafos estrangulaba la descripción, que es lo que identifica la fila. */}
        <div className="mt-6 max-w-[860px]">
          <div className="mb-[7px] flex items-baseline gap-2">
            <span className="text-[10px] uppercase tracking-[0.07em] text-faint">Las filas que va a mover</span>
            <span className="font-mono text-[11px] tabular-nums text-faint">{filas}</span>
          </div>
          <CabeceraFilas conTipo={g.tipos.length > 1} />
          {g.filas.map((f) => (
            <FilaQueSeMueve key={`${f.tabla}-${f.id}`} f={f} conTipo={g.tipos.length > 1} />
          ))}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3.5 border-t border-line pb-4 pt-3">
        <button
          type="submit"
          disabled={!listo || enCurso}
          data-testid="form-resolver-enviar"
          title={listo ? 'Escribe una fila en el diccionario de obras' : 'Elegí la obra'}
          className="flex items-center gap-2 rounded-[7px] bg-marca px-[15px] py-[9px] text-[13px] font-semibold text-[color:var(--os-on-marca)] transition-colors hover:brightness-[0.97] disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-faint disabled:hover:brightness-100"
        >
          <IconoCompletar className="h-[15px] w-[15px]" />
          {enCurso ? 'Resolviendo…' : `Resolver ${filas}`}
        </button>
        {error
          ? <span data-testid="form-resolver-error" className="text-[11.5px] text-neg">{error}</span>
          : (
              <span className="text-[11.5px] text-faint">
                {listo ? 'El costo se reimputa solo.' : 'Elegí la obra.'}
              </span>
            )}
        <span className="ml-auto text-[11.5px] text-faint">
          {restantes > 0
            ? `queda${restantes === 1 ? '' : 'n'} ${restantes} texto${restantes === 1 ? '' : 's'} más`
            : 'es el último de la cola'}
        </span>
      </div>
    </form>
  )
}
