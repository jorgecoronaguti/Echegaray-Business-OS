// PANTALLA 17 · SOLAPA ESFUERZO — la cadena, y la decisión que la cierra.
//
// `design/system/COMPONENTS.md` §Rendimiento chain: la cadena de eslabones, el real observado en
// 600 y en `warn` cuando es peor, el histórico con su muestra, y un cierre de UNA LÍNEA con
// «Aceptar y versionar» / «Descartar». Muestra chica → sin recomendación, y se dice.
//
// ═══ DOS ESLABONES DEL PATRÓN NO EXISTEN EN EL MODELO, Y NO SE DIBUJAN ═══
//
// El patrón nombra cinco: teórico · presupuestado · planificado · real observado · histórico. Acá
// hay tres. `analisis_costo` guarda UN esfuerzo por versión vigente —el presupuestado—; el teórico
// (el de manual, antes de que la empresa lo midiera) nunca se cargó como campo aparte, y el
// planificado vive en la actividad de cada obra, que es otro objeto y otra pantalla. Dibujar dos
// filas con «sin dato» sugeriría que alguien tiene que ir a cargarlas; la deuda se declara en la
// ayuda y no se disfraza de hueco.
//
// ═══ EL MOTOR NO SE TOCA ═══
//
// La cadena entera sale de `rendimiento_recomendado`, y quién decide si hay recomendación es esa
// vista: CON UNA SOLA OBRA MEDIDA devuelve `hs_recomendado` en NULL y su `lectura` explica por qué.
// Esta pantalla repite esa lectura; no calcula un umbral propio, porque un control validado contra
// su propia salida no es un control. Aceptar crea una versión nueva —nunca sobrescribe historia— y
// descartar también queda escrito.

import { Ayuda, Nulo } from '@/shared/components/ds'
import { Campo as CampoFormulario, CTRL, FormAccion } from '@/shared/components/ui'
import type { FichaTarea as Ficha } from '../types'
import { desvioObservado, fechaCorta, numero } from '../services/reglas'
import { MAGNITUD } from '../services/vocabulario'
import { aceptarRecomendacion, descartarRecomendacion } from '../services/recomendacionActions'
import { N } from './celdas'

export function SolapaRendimiento({ ficha, conDecision = true }: { ficha: Ficha; conDecision?: boolean }) {
  const r = ficha.rendimiento
  const u = ficha.tarea.unidad

  if (!r || r.muestra === 0) {
    return (
      <div data-testid="rendimiento-tarea">
        <Eslabon rotulo="Presupuestado vigente"><N v={ficha.tarea.hs_unitarias} falta="sin dato" /></Eslabon>
        <p className="mt-3 text-[12.5px] text-muted">
          Todavía no se midió en obra: no hay esfuerzo real ni recomendación.
        </p>
      </div>
    )
  }

  const base = r.hs_analisis ?? ficha.tarea.hs_unitarias
  const desvio = desvioObservado(base, r.hs_observado_mediana)

  return (
    <div data-testid="rendimiento-tarea">
      {/* LA UNIDAD ADELANTE, Y CON LA DIRECCIÓN DE LA MEJORA. Seis filas de números sin decir qué
          magnitud son se leen como un rendimiento, que es al revés. */}
      <p className="mb-2 text-[11.5px] text-faint">
        Todo en {MAGNITUD.esfuerzo.unidad(u)} — esfuerzo: baja cuando la tarea mejora.
      </p>

      <Eslabon rotulo="Presupuestado vigente"><N v={base} falta="sin dato" /></Eslabon>
      <Eslabon rotulo="Real observado · promedio"><N v={r.hs_observado_promedio} falta="sin base" /></Eslabon>
      <Eslabon rotulo={`Real observado · mediana de ${r.obras} ${r.obras === 1 ? 'obra' : 'obras'}`}>
        {/* El peso y el color son del ESLABÓN REAL, que es el que contradice a la base. `warn` sólo
            cuando la obra pidió MÁS horas: una tarea que rinde mejor que lo cotizado no es un
            problema, es margen que apareció. */}
        <span className={`font-semibold ${desvio?.direccion === 'peor' ? 'text-warn' : ''}`}>
          <N v={r.hs_observado_mediana} falta="sin base" />
        </span>
        {desvio && (
          <span className="ml-2 font-mono text-[11px] tabular-nums text-faint">{numero(desvio.ratio, 2)}× base</span>
        )}
      </Eslabon>
      <Eslabon rotulo="Dispersión de la muestra"><N v={r.dispersion} falta="sin base" /></Eslabon>
      <Eslabon rotulo="Horas improductivas de la muestra"><N v={r.hh_improductivas} falta="ninguna declarada" /></Eslabon>
      <Eslabon rotulo="Recomendado">
        {r.hs_recomendado == null ? <Nulo>sin recomendación</Nulo> : <N v={r.hs_recomendado} className="font-semibold" />}
      </Eslabon>

      <div className="mt-3 rounded-card bg-surface-quiet px-3 py-2.5">
        <div className="text-[12.5px] text-ink-soft">{r.lectura}</div>
        <div className="mt-1 text-[11.5px] text-faint">
          Muestra: {r.obras} {r.obras === 1 ? 'obra' : 'obras'}, {r.muestra} {r.muestra === 1 ? 'registro' : 'registros'}
          {/* Sin la fecha del último registro no se puede saber si esta recomendación caducó, así
              que la ausencia se escribe: omitirla la haría parecer recién medida. */}
          {r.ultima_muestra ? ` · última el ${fechaCorta(r.ultima_muestra)}` : ' · sin fecha del último registro'}.
        </div>
      </div>

      {/* La DECISIÓN vive en el Resumen —donde el canónico 17 pone «Actualizar la base con el
          real»— y por eso acá se puede apagar: dos formularios idénticos en la misma ficha son dos
          maneras de hacer lo mismo, y la segunda es la que nadie prueba. */}
      {conDecision && <Decision tareaTipoId={ficha.tarea.id} r={r} />}

      <Ayuda titulo="De dónde sale cada eslabón" testid="ayuda-esfuerzo">
        El presupuestado es el de la versión vigente del análisis, que es con la que se cotiza. El real
        sale de las horas imputadas sobre la cantidad ejecutada, y DESCUENTA las improductivas: una
        espera de equipo no es el estándar de la tarea. El teórico de manual y el esfuerzo planificado
        de cada obra no están en la base maestra —el primero nunca se cargó como campo propio; el
        segundo vive en la actividad de la obra—, así que no se muestran en vez de mostrarse vacíos.
      </Ayuda>
    </div>
  )
}

function Eslabon({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[#EFEEEA] py-2 last:border-b-0">
      <span className="shrink-0 text-[11.5px] text-faint">{rotulo}</span>
      <span className="min-w-0 text-right text-[12.5px] text-ink-soft">{children}</span>
    </div>
  )
}

// ═══ LA DECISIÓN ═══════════════════════════════════════════════════════════════════════════════
//
// La vista PROPONE; acá alguien decide, y las dos decisiones quedan escritas. Descartar también se
// registra: sin eso, la misma recomendación vuelve mañana y alguien la vuelve a evaluar de cero.

export function Decision({ tareaTipoId, r }: { tareaTipoId: string; r: NonNullable<Ficha['rendimiento']> }) {
  if (r.hs_recomendado == null) {
    return (
      <p className="mt-3 text-[12px] text-faint" data-testid="sin-decision">
        No hay recomendación que decidir. Con una sola obra medida hay un dato, no una distribución:
        aceptarlo metería un caso raro en la base maestra para siempre.
      </p>
    )
  }
  const cambio = r.hs_analisis && r.hs_analisis > 0
    ? ((r.hs_recomendado - r.hs_analisis) / r.hs_analisis) * 100
    : null

  return (
    <div className="mt-4 border-t border-line pt-4" data-testid="decision-recomendacion">
      <p className="text-[12.5px] text-ink-soft">
        Pasar de <span className="font-mono tabular-nums">{numero(r.hs_analisis, 3) ?? 'sin dato'}</span> a{' '}
        <span className="font-mono font-semibold tabular-nums">{numero(r.hs_recomendado, 3)}</span> hs/unidad
        {cambio === null ? '' : ` (${cambio > 0 ? '+' : ''}${numero(cambio, 1)} %)`}.
      </p>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <FormAccion
          accion={aceptarRecomendacion}
          testid="form-aceptar-recomendacion"
          enviar="Aceptar y versionar"
          mensajeOk="Versión nueva creada."
        >
          <input type="hidden" name="tarea_tipo_id" value={tareaTipoId} />
          <CampoFormulario label="Motivo (opcional)">
            <input name="motivo" maxLength={300} className={CTRL} data-testid="motivo-aceptar"
              placeholder="probado en dos obras del mismo tipo" />
          </CampoFormulario>
        </FormAccion>

        <FormAccion
          accion={descartarRecomendacion}
          testid="form-descartar-recomendacion"
          enviar="Descartar"
          mensajeOk="Descartada, con su motivo."
        >
          <input type="hidden" name="tarea_tipo_id" value={tareaTipoId} />
          {/* EL MOTIVO ES OBLIGATORIO Y NO SE AFLOJA: sin él, mañana nadie sabe contra qué se
              comparó y la recomendación vuelve a discutirse desde cero. */}
          <CampoFormulario label="Motivo (obligatorio)">
            <input name="motivo" maxLength={300} required className={CTRL} data-testid="motivo-descartar"
              placeholder="las dos obras fueron en altura, no comparan" />
          </CampoFormulario>
        </FormAccion>
      </div>

      <Ayuda titulo="Qué hace cada una" testid="ayuda-decision">
        <strong>Aceptar</strong> crea la versión SIGUIENTE del análisis escalando la mano de obra y sus
        cargas; nunca reescribe la anterior, y los presupuestos ya congelados no cambian porque apuntan
        a la versión con la que se cotizaron. El motivo se agrega adelante de la muestra, que la función
        escribe sola. <strong>Descartar</strong> no toca el análisis: lo saca de pendientes y vuelve solo
        si llega una muestra nueva — que ya sería otra recomendación.
      </Ayuda>
    </div>
  )
}
