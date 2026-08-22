// EL PANEL DE UN PAQUETE — lo que hay que saber antes de dejarlo arrancar.
//
// Cuatro bloques, en el orden en que se decide: qué se contrató, qué le pone Echegaray (que es lo
// que convierte el precio en costo), qué papeles tiene, y quién de su gente está en la obra.
//
// ═══ EL BLOQUEO ES LO PRIMERO QUE SE VE ═══
//
// «ART sin cargar · el paquete no puede iniciar» va arriba de todo y en rojo, y el botón de
// arrancar queda apagado con el motivo al lado. El botón NO es el control —la misma fila entra por
// PostgREST— y por eso `cambiarEstadoPaquete` vuelve a revisar los papeles del lado del servidor
// con la misma función.
//
// ═══ SU GENTE NO ES NUESTRA GENTE (§23) ═══
//
// El personal del subcontratista se lista con su ART y su alta, y con la frase escrita al pie: no
// entra en la nómina ni en la capacidad de obra. Está en `persona_externa`, que es una tabla
// distinta de `personas` a propósito — mezclarlas contaminaría HH propias, cargas sociales y
// capacidad, que son tres cuentas del plantel propio.

import { Aviso, Ayuda, CAMPO, Campo, Estado, Plegable, TituloPanel } from '@/shared/components/ds'
import { BotonAccion, FormAccion, type AccionFormulario, type ResultadoAccion } from '@/shared/components/ui'
import { cantidad as fmtCantidad, fecha as fmtFecha, plata } from './formato'
import type { AportePaquete, Paquete } from '../services/subcontratosService'
import type { EstadoDocumento } from '../services/subcontratosReglas'

const TONO_DOC: Record<EstadoDocumento, 'pos' | 'neg' | 'warn' | 'pendiente'> = {
  ok: 'pos', vencido: 'neg', por_vencer: 'warn', falta: 'neg',
}

const TIPO_APORTE: Record<string, string> = {
  material: 'material de pañol',
  equipo: 'equipo',
  hh_propia: 'HH propias',
  transporte: 'logística',
  comida: 'indirecto',
  epp: 'indirecto',
  otro: 'otro',
}

export interface AccionesPaquete {
  aporte: AccionFormulario
  persona: AccionFormulario
  documento: AccionFormulario
  precio: AccionFormulario
  estado: (subcontratoId: string, estado: string) => Promise<ResultadoAccion>
}

export function PanelSubcontrato({
  paquete, economia, cerrarHref, acciones,
}: {
  paquete: Paquete
  economia: boolean
  cerrarHref: string
  acciones: AccionesPaquete
}) {
  const p = paquete
  const bloqueado = p.revision.bloqueos.length > 0
  return (
    <aside className="flex flex-col gap-4" data-testid="panel-subcontrato">
      <header className="flex items-start justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <TituloPanel>{p.vinculos[0]?.actividad ?? p.nombre}</TituloPanel>
          <p className="text-[12px] text-muted">{p.proveedor ?? 'sin subcontratista'}</p>
        </div>
        <a href={cerrarHref} className="shrink-0 text-[13px] text-muted hover:text-ink" aria-label="Cerrar el panel">✕</a>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <Kpi rotulo="Alcance" valor={fmtCantidad(p.cantidad, p.unidad)} />
        <Kpi
          rotulo="Avance"
          valor={p.avance.pct == null ? null : `${p.avance.pct} %`}
          falta={p.avance.base}
        />
        <Kpi rotulo="Plazo" valor={p.plazo.texto} />
      </div>

      {bloqueado && (
        <Aviso tono="neg" titulo={p.revision.bloqueos.join(' · ')} testid="bloqueo-inicio">
          El paquete no puede iniciar.
        </Aviso>
      )}

      <section data-testid="alcance-contratado">
        <TituloPanel>Alcance contratado</TituloPanel>
        <Dato clave="Cantidad" valor={cantidadDelAlcance(p)} />
        <Dato clave="Unidad" valor={p.unidad} />
        <Dato
          clave="Precio contratado"
          valor={economia
            ? (p.precio_contratado == null ? null : plata(p.precio_contratado))
            : 'sin permiso'}
          falta="sin precio cargado"
        />
        <Dato clave="Fechas" valor={rangoDeFechas(p)} falta="sin fechas de plan" />
        <Dato clave="Dentro de" valor={p.vinculos.map((v) => v.actividad).join(' · ') || null}
          falta="sin actividad vinculada" />
        <Dato clave="Estado guardado" valor={p.estado} />
        {p.alcance && <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">{p.alcance}</p>}
        {economia && (
          <Plegable titulo="Fijar el precio contratado" testid="abrir-precio">
            <FormAccion accion={acciones.precio} testid="form-precio" enviar="Guardar el precio" mensajeOk="Precio guardado.">
              <input type="hidden" name="subcontrato_id" value={p.id} />
              <Campo rotulo="Precio contratado" ayuda="Entra por la función con portero económico, no por la tabla.">
                <input name="precio_contratado" type="number" step="0.01" min="0" className={CAMPO} required />
              </Campo>
            </FormAccion>
          </Plegable>
        )}
      </section>

      <Aportes paquete={p} economia={economia} accion={acciones.aporte} />

      <Documentacion paquete={p} accion={acciones.documento} />

      <PersonalExterno paquete={p} accion={acciones.persona} />

      <section className="border-t border-line pt-3" data-testid="mover-estado">
        <TituloPanel>Mover el paquete</TituloPanel>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {p.estado !== 'en_curso' && p.estado !== 'terminado' && (
            <BotonAccion accion={acciones.estado} args={[p.id, 'en_curso']} testid="iniciar-paquete">
              Iniciar
            </BotonAccion>
          )}
          {p.estado === 'en_curso' && (
            <BotonAccion accion={acciones.estado} args={[p.id, 'terminado']} testid="terminar-paquete">
              Dar por terminado
            </BotonAccion>
          )}
        </div>
        {bloqueado && (
          <p className="mt-2 text-[11.5px] text-neg" data-testid="motivo-bloqueo">
            {p.revision.bloqueos.join(' · ')}: iniciar va a ser rechazado también del lado del servidor.
          </p>
        )}
      </section>
    </aside>
  )
}

const cantidadDelAlcance = (p: Paquete): string | null => {
  const v = p.vinculos[0]
  if (!v || v.cantidad_objetivo == null || p.cantidad == null) return fmtCantidad(p.cantidad, p.unidad)
  return `${fmtCantidad(p.cantidad, p.unidad)} de ${fmtCantidad(v.cantidad_objetivo, v.unidad ?? p.unidad)} de la partida`
}

const rangoDeFechas = (p: Paquete): string | null =>
  p.fecha_inicio_plan && p.fecha_fin_plan
    ? `${fmtFecha(p.fecha_inicio_plan)} → ${fmtFecha(p.fecha_fin_plan)}`
    : (p.fecha_fin_plan ? `→ ${fmtFecha(p.fecha_fin_plan)}` : null)

/**
 * LOS APORTES DE ECHEGARAY — la mitad del costo que hasta hoy se perdía en el costo general.
 *
 * Sin permiso económico el aporte se muestra igual y su monto dice «cargado»: saber QUÉ le estamos
 * poniendo al subcontratista es operativo —lo decide el jefe de obra— y esconder la línea entera
 * dejaría al que la carga sin ver lo que cargó.
 */
function Aportes({ paquete, economia, accion }: {
  paquete: Paquete
  economia: boolean
  accion: AccionFormulario
}) {
  const p = paquete
  return (
    <section data-testid="aportes-echegaray">
      <TituloPanel>Aportes de Echegaray</TituloPanel>
      {p.aportes.length === 0 && (
        <p className="text-[12px] text-muted">
          Nadie declaró qué le pone Echegaray a este paquete. Mientras esté vacío, su costo real es
          el precio del contrato — y casi nunca lo es.
        </p>
      )}
      <ul>
        {p.aportes.map((a) => (
          <li key={a.id} className="flex items-baseline justify-between gap-3 border-b border-[#EFEEEA] py-1.5 last:border-0">
            <span className="min-w-0">
              <span className="block text-[12.5px] text-ink-soft">{a.descripcion}</span>
              <span className="block text-[11px] text-muted">{TIPO_APORTE[a.tipo] ?? a.tipo}</span>
            </span>
            <span className="shrink-0 text-[12.5px] tabular-nums text-ink">{montoDe(a, economia)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-baseline justify-between border-t border-line-strong pt-2">
        <span className="text-[12.5px] font-medium text-ink">Costo real</span>
        <span className="text-[13px] font-semibold tabular-nums text-ink" data-testid="costo-real">
          {economia
            ? (p.costo_real == null ? <span className="text-faint">sin precio ni aportes cargados</span> : plata(p.costo_real))
            : <span className="text-faint">sin permiso</span>}
        </span>
      </div>
      {economia && p.costo_real != null && p.precio_contratado != null && (
        <p className="mt-1 text-[11px] text-muted">
          Contratado {plata(p.precio_contratado)} + aportes {plata(p.aportes_total ?? 0)}.
        </p>
      )}
      {p.hh_apoyo > 0 && (
        <p className="mt-1 text-[11px] text-muted" data-testid="hh-apoyo">
          {p.hh_apoyo} HH propias declaradas como ayuda de gremio. Son las únicas horas nuestras que
          consume el paquete.
        </p>
      )}
      <Plegable titulo="Anotar un aporte" testid="abrir-aporte">
        <FormAccion accion={accion} testid="form-aporte" enviar="Anotar el aporte" limpiarAlOk mensajeOk="Aporte anotado.">
          <input type="hidden" name="subcontrato_id" value={p.id} />
          <div className="flex flex-col gap-2">
            <Campo rotulo="Qué se le entregó">
              <input name="descripcion" className={CAMPO} required maxLength={120} />
            </Campo>
            <Campo rotulo="Tipo">
              <select name="tipo" className={CAMPO} defaultValue="material">
                {Object.entries(TIPO_APORTE).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </Campo>
            <div className="grid grid-cols-2 gap-2">
              <Campo rotulo="Cantidad"><input name="cantidad" type="number" step="0.01" className={CAMPO} /></Campo>
              <Campo rotulo="Unidad"><input name="unidad" className={CAMPO} maxLength={12} /></Campo>
            </div>
            {economia && (
              <Campo rotulo="Monto" ayuda="Si el aporte no tiene monto, dejalo vacío: igual cuenta como aporte.">
                <input name="monto" type="number" step="0.01" min="0" className={CAMPO} />
              </Campo>
            )}
          </div>
        </FormAccion>
      </Plegable>
    </section>
  )
}

const montoDe = (a: AportePaquete, economia: boolean) => {
  if (!economia) return 'cargado'
  if (a.montoOculto) return 'cargado'
  if (a.monto != null) return plata(a.monto)
  // Un aporte cargado SIN monto no es lo mismo que uno cuyo monto no se puede leer.
  return a.cantidad != null ? `${a.cantidad} ${a.unidad ?? ''}`.trim() : 'sin monto'
}

function Documentacion({ paquete, accion }: { paquete: Paquete; accion: AccionFormulario }) {
  const p = paquete
  return (
    <section data-testid="documentacion-paquete">
      <TituloPanel>Documentación</TituloPanel>
      {p.revision.filas.length === 0 && (
        <p className="text-[12px] text-muted">
          No se pudo revisar la documentación de este paquete. Eso NO quiere decir que falte: quiere
          decir que no se pudo leer.
        </p>
      )}
      <ul>
        {p.revision.filas.map((f) => (
          <li key={f.tipo} className="flex items-baseline justify-between gap-3 border-b border-[#EFEEEA] py-1.5 last:border-0">
            <span className="text-[12.5px] text-ink-soft">{f.rotulo}</span>
            <Estado tono={TONO_DOC[f.estado]} clave={f.estado} testid={`doc-${f.tipo}`}>
              {f.detalle ?? 'sin cargar'}
            </Estado>
          </li>
        ))}
      </ul>
      <Plegable titulo="Cargar un papel" testid="abrir-documento">
        <FormAccion accion={accion} testid="form-documento" enviar="Registrar el papel" limpiarAlOk mensajeOk="Papel registrado.">
          <input type="hidden" name="subcontrato_id" value={p.id} />
          <div className="flex flex-col gap-2">
            <Campo rotulo="Cuál">
              <select name="tipo" className={CAMPO} defaultValue="art">
                <option value="contrato">Contrato firmado</option>
                <option value="art">ART</option>
                <option value="seguro_rc">Seguro de responsabilidad</option>
                <option value="alta_personal">Alta de personal</option>
                <option value="otro">Otro</option>
              </select>
            </Campo>
            <div className="grid grid-cols-2 gap-2">
              <Campo rotulo="Emitido"><input name="fecha_emision" type="date" className={CAMPO} /></Campo>
              <Campo rotulo="Vence" ayuda="La ART lo exige.">
                <input name="vence_el" type="date" className={CAMPO} />
              </Campo>
            </div>
            <Campo rotulo="Número o referencia"><input name="numero" className={CAMPO} maxLength={60} /></Campo>
            <Campo rotulo="Link al archivo" ayuda="Drive, si ya está cargado.">
              <input name="archivo_url" className={CAMPO} maxLength={500} />
            </Campo>
          </div>
        </FormAccion>
      </Plegable>
    </section>
  )
}

function PersonalExterno({ paquete, accion }: { paquete: Paquete; accion: AccionFormulario }) {
  const p = paquete
  const hoy = new Date().toISOString().slice(0, 10)
  return (
    <section data-testid="personal-externo">
      <TituloPanel>Personal del subcontratista</TituloPanel>
      {p.personas.length === 0 && (
        <p className="text-[12px] text-muted">Nadie de su gente está registrado en este paquete.</p>
      )}
      <ul>
        {p.personas.filter((x) => x.activo).map((g) => {
          const sinArt = !g.art_vigente_hasta || g.art_vigente_hasta < hoy
          return (
            <li key={g.id} className="flex items-center gap-2.5 border-b border-[#EFEEEA] py-1.5 last:border-0">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[10px] font-medium text-muted">
                {iniciales(g.nombre_completo)}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-soft">{g.nombre_completo}</span>
              <Estado tono={sinArt ? 'neg' : 'pos'} clave={sinArt ? 'sin_art' : 'alta_ok'}>
                {sinArt ? 'sin ART' : (g.alta_afip ? 'alta ok' : 'ART ok')}
              </Estado>
            </li>
          )
        })}
      </ul>
      {/* 22/08/2026 · La nota se pliega. Es una regla del modelo —esta gente no es nuestra— que se
          consulta la primera vez y después estorba una lista que se lee todos los días. El testid se
          conserva: el texto sigue en el documento, sólo cerrado. */}
      <Ayuda titulo="Por qué no suma a la nómina" testid="nota-nomina">
        No entra en la nómina ni en la capacidad de obra.
      </Ayuda>
      <Plegable titulo="Registrar una persona" testid="abrir-persona">
        <FormAccion accion={accion} testid="form-persona" enviar="Registrar" limpiarAlOk mensajeOk="Persona registrada.">
          <input type="hidden" name="subcontrato_id" value={p.id} />
          <div className="flex flex-col gap-2">
            <Campo rotulo="Nombre y apellido">
              <input name="nombre_completo" className={CAMPO} required maxLength={120} />
            </Campo>
            <div className="grid grid-cols-2 gap-2">
              <Campo rotulo="DNI"><input name="dni" className={CAMPO} maxLength={16} /></Campo>
              <Campo rotulo="CUIL"><input name="cuil" className={CAMPO} maxLength={16} /></Campo>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Campo rotulo="Categoría"><input name="categoria" className={CAMPO} maxLength={40} /></Campo>
              <Campo rotulo="ART vigente hasta"><input name="art_vigente_hasta" type="date" className={CAMPO} /></Campo>
            </div>
            <label className="flex items-center gap-2 text-[12.5px] text-ink-soft">
              <input type="checkbox" name="alta_afip" /> Alta en AFIP presentada
            </label>
          </div>
        </FormAccion>
      </Plegable>
    </section>
  )
}

const iniciales = (nombre: string) =>
  nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]?.toUpperCase() ?? '').join('')

function Kpi({ rotulo, valor, falta }: { rotulo: string; valor: string | null; falta?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.05em] text-faint">{rotulo}</div>
      <div className={`text-[15px] font-semibold leading-tight ${valor ? 'text-ink' : 'text-faint'}`}>
        {valor ?? '—'}
      </div>
      {!valor && falta && <div className="text-[10.5px] leading-tight text-muted">{falta}</div>}
    </div>
  )
}

function Dato({ clave, valor, falta }: { clave: string; valor: string | null; falta?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#EFEEEA] py-1.5 last:border-0">
      <span className="shrink-0 text-[11.5px] text-muted">{clave}</span>
      <span className={`text-right text-[12.5px] ${valor ? 'text-ink' : 'text-faint'}`}>
        {valor ?? (falta ?? 'sin cargar')}
      </span>
    </div>
  )
}
