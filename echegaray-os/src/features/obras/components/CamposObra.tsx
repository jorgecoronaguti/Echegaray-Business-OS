// LOS CAMPOS DE UNA OBRA — los mismos para el alta y para la edición.
//
// Uno solo, y no dos copias, porque el alta y la edición escriben en las MISMAS columnas: si se
// separaran, un campo agregado en una quedaría faltando en la otra y la obra creada desde el cliente
// tendría menos datos que la editada desde su ficha, sin que nadie se entere.
//
// Los nombres de los `name` son contrato con `obraSchema` de `services/actions.ts`. Cambiar uno acá
// sin cambiarlo allá no rompe nada visible: el campo simplemente deja de guardarse.
//
// ═══ POR QUÉ LOS CAMPOS ESTÁN SUELTOS ADEMÁS DE JUNTOS (19/08/2026) ═══
//
// El alta en pasos de `/obras/nueva` muestra de a un puñado de campos por paso: nombre y cliente
// primero, el jefe de obra después, las fechas más tarde. Si esos pasos tipearan su propio `<input
// name="jefe_obra">`, existirían DOS definiciones del mismo campo —la del formulario largo y la del
// paso— y el aviso de arriba dejaría de ser cierto: bastaría con cambiar el `maxLength` en una para
// que las dos puertas validaran distinto. Por eso cada campo es un componente exportado y
// `CamposObra` es su composición: el alta en pasos usa LOS MISMOS, no unos parecidos.
//
// ═══ EL CONTROL ES EL DEL DESIGN SYSTEM (Design Handoff V2) ═══
//
// `CAMPO` y `Campo` salen de `@/shared/components/ds`: 34px de alto en escritorio y 48 en el
// teléfono, borde `line-strong` —el borde de campo editable, más presente que el de bloque, porque
// un campo tiene que verse tocable—, radio 6, texto 13. El `CTRL` viejo usaba `border-line` y no
// tenía altura declarada: en un teléfono el objetivo táctil quedaba en 30px, la mitad del mínimo de
// 44 que pide `LAYOUT_RESPONSIVE.md`.

import { CAMPO, Campo } from '@/shared/components/ds'
import { ETAPAS, ETAPA_LABEL, type ObraPanel } from '../types'

const ESTADOS = ['activa', 'pausada', 'cerrada'] as const

const v = (x: string | number | null | undefined) => (x == null ? '' : String(x))

export function CampoNombre({ valor }: { valor?: string | null }) {
  return (
    <Campo rotulo="Nombre de la obra" className="col-span-2">
      <input name="nombre" defaultValue={v(valor)} required minLength={2} maxLength={120} className={CAMPO} />
    </Campo>
  )
}

/* La ubicación NO llega en `obra_panel`: la columna se agregó a `obra_canonica` y la vista nunca se
   rehizo. Se lee aparte, de la tabla. Si se tomara del panel, el campo se guardaría bien y volvería
   vacío en la recarga — el peor de los defectos, porque parece que anduvo. */
export function CampoUbicacion({ valor }: { valor?: string | null }) {
  return (
    <Campo rotulo="Ubicación" className="col-span-2">
      <input name="ubicacion" defaultValue={v(valor)} maxLength={200} className={CAMPO} placeholder="dónde queda" />
    </Campo>
  )
}

export function CampoJefeObra({ valor }: { valor?: string | null }) {
  return (
    <Campo rotulo="Jefe de obra">
      <input name="jefe_obra" defaultValue={v(valor)} maxLength={120} className={CAMPO} />
    </Campo>
  )
}

export function CamposFechasPlan({ inicio, fin }: { inicio?: string | null; fin?: string | null }) {
  return (
    <>
      <Campo rotulo="Inicio de obra"><input type="date" name="fecha_inicio_plan" defaultValue={v(inicio)} className={CAMPO} /></Campo>
      <Campo rotulo="Fin de obra (plan)"><input type="date" name="fecha_fin_plan" defaultValue={v(fin)} className={CAMPO} /></Campo>
    </>
  )
}

export function CampoMontoContratado({ valor }: { valor?: number | null }) {
  return (
    <Campo rotulo="Monto contratado ($)" className="col-span-2" ayuda="Vacío = no cargado. No es lo mismo que un contrato de $0.">
      <input type="number" name="monto_contratado" min={0} step="0.01" defaultValue={v(valor)} className={CAMPO} />
    </Campo>
  )
}

export function CampoDrive({ valor }: { valor?: string | null }) {
  return (
    <Campo rotulo="Carpeta de Drive" className="col-span-2" ayuda="El id de la carpeta, no su nombre. Los archivos no se copian: se enlazan.">
      <input name="drive_carpeta_id" defaultValue={v(valor)} maxLength={80} className={CAMPO} />
    </Campo>
  )
}

/**
 * `veEconomia` NACE EN FALSE, y no es una preferencia de diseño (21/08/2026).
 *
 * Desde la 5000 `obra_canonica.monto_contratado` no es escribible por PostgREST: entra por
 * `fijar_monto_contratado()`, que exige `ve_economia()`. Dibujarle el campo a un jefe de obra sería
 * una pantalla más ancha que la base — tipea un monto, aprieta guardar y la base lo rechaza. El
 * default cierra: quien no declara que ve economía, no ve el campo.
 */
export function CamposObra({ obra, ubicacion, veEconomia = false }: {
  obra?: ObraPanel; ubicacion?: string | null; veEconomia?: boolean
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <CampoNombre valor={obra?.nombre} />
      <CampoUbicacion valor={ubicacion} />
      <CampoJefeObra valor={obra?.jefe_obra} />
      <Campo rotulo="Estado">
        <select name="estado" defaultValue={v(obra?.estado) || 'activa'} className={CAMPO}>
          {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
        </select>
      </Campo>
      <Campo rotulo="Etapa" className="col-span-2" ayuda="Sin declarar es una respuesta válida: no se elige una por defecto.">
        <select name="etapa" defaultValue={v(obra?.etapa)} className={CAMPO}>
          <option value="">sin declarar</option>
          {ETAPAS.map((e) => <option key={e} value={e}>{ETAPA_LABEL[e]}</option>)}
        </select>
      </Campo>
      <CamposFechasPlan inicio={obra?.fecha_inicio_plan} fin={obra?.fecha_fin_plan} />
      {obra && (
        <>
          <Campo rotulo="Inicio real"><input type="date" name="fecha_inicio_real" defaultValue={v(obra.fecha_inicio_real)} className={CAMPO} /></Campo>
          <Campo rotulo="Fin real"><input type="date" name="fecha_fin_real" defaultValue={v(obra.fecha_fin_real)} className={CAMPO} /></Campo>
        </>
      )}
      {veEconomia && <CampoMontoContratado valor={obra?.monto_contratado} />}
      <CampoDrive valor={obra?.drive_carpeta_id} />
    </div>
  )
}
