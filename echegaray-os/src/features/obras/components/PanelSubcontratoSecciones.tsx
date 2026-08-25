// LAS TRES SECCIONES DE CARGA DEL PANEL DE UN PAQUETE — aportes, papeles y su gente.
//
// Salieron de `PanelSubcontrato.tsx` cuando el panel se rehízo con la densidad del Design canónico:
// son tres formularios largos, y mezclados con la cabecera dejaban un archivo que ya nadie leía de
// punta a punta. Lo que decide —el bloqueo, el avance, la plata— quedó allá; acá está lo que se
// carga.
//
// ═══ SU GENTE NO ES NUESTRA GENTE (§23) ═══
//
// El personal del subcontratista se lista con su ART y su alta, y con la regla escrita al pie: no
// entra en la nómina ni en la capacidad de obra. Está en `persona_externa`, que es una tabla
// distinta de `personas` a propósito — mezclarlas contaminaría HH propias, cargas sociales y
// capacidad, que son tres cuentas del plantel propio.

import { Ayuda, CAMPO, Campo, Estado, Plegable, TituloPanel } from '@/shared/components/ds'
import { FormAccion, type AccionFormulario } from '@/shared/components/ui'
import { plata } from './formato'
import type { AportePaquete, Paquete } from '../services/subcontratosService'
import type { EstadoDocumento } from '../services/subcontratosReglas'

const TONO_DOC: Record<EstadoDocumento, 'pos' | 'neg' | 'warn' | 'pendiente'> = {
  ok: 'pos', vencido: 'neg', por_vencer: 'warn', falta: 'neg',
}

export const TIPO_APORTE: Record<string, string> = {
  material: 'material de pañol',
  equipo: 'equipo',
  hh_propia: 'HH propias',
  transporte: 'logística',
  comida: 'indirecto',
  epp: 'indirecto',
  otro: 'otro',
}

/**
 * LOS APORTES DE ECHEGARAY — la mitad del costo que hasta hoy se perdía en el costo general.
 *
 * Sin permiso económico el aporte se muestra igual y su monto dice «cargado»: saber QUÉ le estamos
 * poniendo al subcontratista es operativo —lo decide el jefe de obra— y esconder la línea entera
 * dejaría al que la carga sin ver lo que cargó.
 */
export function Aportes({ paquete, economia, accion }: {
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
          Sin aportes declarados: mientras esté vacío, el costo real es el precio del contrato.
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
      {p.hh_apoyo > 0 && (
        <p className="mt-1 text-[11px] text-muted" data-testid="hh-apoyo">
          {p.hh_apoyo} HH propias de ayuda de gremio: las únicas horas nuestras del paquete.
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

export function Documentacion({ paquete, accion }: { paquete: Paquete; accion: AccionFormulario }) {
  const p = paquete
  return (
    <section data-testid="documentacion-paquete">
      <TituloPanel>Documentación</TituloPanel>
      {p.revision.filas.length === 0 && (
        /* NO PUDE LEER ≠ NO HAY. Un control que no pudo mirar no dice «no está»: decirlo al revés
           dibujaría como faltante un papel que puede estar cargado hace un mes. */
        <p className="text-[12px] text-muted">
          No se pudo revisar la documentación. Eso NO quiere decir que falte: quiere decir que no se
          pudo leer.
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

export function PersonalExterno({ paquete, accion, hoyISO }: {
  paquete: Paquete
  accion: AccionFormulario
  /** Entra por parámetro para que «sin ART» se pueda probar en cualquier fecha. */
  hoyISO: string
}) {
  const p = paquete
  return (
    <section data-testid="personal-externo">
      <TituloPanel>Personal del subcontratista</TituloPanel>
      {p.personas.length === 0 && (
        <p className="text-[12px] text-muted">Nadie de su gente registrado en este paquete.</p>
      )}
      <ul>
        {p.personas.filter((x) => x.activo).map((g) => {
          const sinArt = !g.art_vigente_hasta || g.art_vigente_hasta < hoyISO
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
