// EL FORMULARIO DE «Vincular documento» / «Vincular carpeta» — el 14 dibuja los dos textos en la
// cabecera y no dibuja el formulario. Diseñado con `diseno-ui-ux-producto-os`: un bloque de borde 10
// arriba del índice, abierto por `?vincular=archivo|carpeta`, sin navegar y sin modal. Son DOS
// entradas y no una porque un id de Drive pelado no dice si es archivo o carpeta, y abrir un id de
// carpeta como archivo da 404 (`driveUrl.ts`). Escribe por la acción existente `vincularDocumento`.
//
// Sin `'use client'`: `FormAccion` ya es cliente.

import { FormAccion, type AccionFormulario } from '@/shared/components/ui'
import { C } from '../canon/tokens'
import type { TipoDrive } from '../../types'
import { CATEGORIAS_CANONICAS } from '../../services/documentosCategoria'

const CAMPO: React.CSSProperties = {
  height: '30px', border: `1px solid ${C.bordeFuerte}`, borderRadius: '6px', padding: '0 8px', fontSize: '13px',
  color: C.tinta, background: C.superficie, fontFamily: 'inherit', width: '100%',
}
const ROTULO: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px', color: C.tintaSuave }

export function FormVincular({ tipo, accion }: { tipo: TipoDrive; accion: AccionFormulario }) {
  const esCarpeta = tipo === 'carpeta'
  return (
    <div data-testid={`vincular-${tipo}-form`} style={{ border: `1px solid ${C.borde}`, borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ fontSize: '14px', fontWeight: 600 }}>Vincular {esCarpeta ? 'carpeta' : 'documento'}</div>
      <FormAccion accion={accion} testid={`form-vincular-${tipo}`} enviar="Vincular" limpiarAlOk mensajeOk="Vinculado.">
        {/* El tipo viaja en el formulario y el `obra_id` NO: uno es una preferencia de quien carga,
            el otro decide sobre qué obra se escribe. */}
        <input type="hidden" name="tipo" value={tipo} />
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="md:col-span-3" style={ROTULO}>
            {esCarpeta ? 'Enlace de la carpeta' : 'Enlace del archivo'}
            <input name="enlace" required maxLength={500} style={CAMPO}
              placeholder={esCarpeta ? 'https://drive.google.com/drive/folders/…' : 'https://drive.google.com/file/d/…'} />
          </label>
          <label className="md:col-span-2" style={ROTULO}>
            Nombre <span style={{ color: C.tenue }}>· sólo si el archivo no está en el índice de Drive</span>
            <input name="nombre" maxLength={300} style={CAMPO} />
          </label>
          <label style={ROTULO}>
            Para qué sirve <span style={{ color: C.tenue }}>· se puede clasificar después</span>
            <input name="rol" maxLength={120} list="categorias-documento-obra" style={CAMPO} />
            <datalist id="categorias-documento-obra">
              {CATEGORIAS_CANONICAS.map((c) => <option key={c} value={c} />)}
            </datalist>
          </label>
        </div>
      </FormAccion>
    </div>
  )
}
