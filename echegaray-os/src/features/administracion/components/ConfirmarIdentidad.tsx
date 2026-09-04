'use client'

// CONFIRMAR QUIÉN ES EL PROVEEDOR DE ESTA FILA. TRES BOTONES, NINGÚN NÚMERO.
//
// ═══ CUÁNDO APARECE, Y POR QUÉ NO SIEMPRE ═══
//
// Sólo cuando la capa de identidad NO pudo decidir sola: sugerido o ambiguo. Un proveedor resuelto
// por CUIT no necesita que nadie lo confirme —el CUIT ya lo dijo— y pedir confirmación de algo que
// ya es un hecho enseña a confirmar sin mirar, que es la forma más rápida de arruinar el ground
// truth que estas confirmaciones producen.
//
// ═══ POR QUÉ NO SE MUESTRA EL SCORE ═══
//
// Porque no cambia la decisión de quien mira. La pregunta que tiene que contestar es «¿este gasto es
// de este proveedor?», y para eso alcanza con los dos nombres. Un 0,741 al lado no la ayuda: la
// invita a delegar en el número una decisión que sólo ella puede tomar.
//
// ═══ QUÉ PASA DESPUÉS DE CONFIRMAR ═══
//
// Ese texto queda como alias verificado y no vuelve a preguntarse nunca: la próxima compra de
// «DUPEC» se resuelve sola, al instante y sin modelo. Una confirmación se paga una vez.

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { C } from '@/shared/components/canon'
import { corregirIdentidad } from '../services/proveedoresActions'
import type { IdentidadResuelta } from '../services/identidadProveedorService'

const BOTON: React.CSSProperties = {
  fontSize: 12, padding: '5px 10px', borderRadius: 4, border: `1px solid ${C.linea}`,
  background: 'transparent', color: C.tinta, cursor: 'pointer', lineHeight: 1.2,
}

export function ConfirmarIdentidad({ identidad }: { identidad: IdentidadResuelta }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [enCurso, empezar] = useTransition()

  if (identidad.estado !== 'sugerido' && identidad.estado !== 'ambiguo') return null

  function decidir(decision: 'confirmar' | 'sin_resolver') {
    const form = new FormData()
    form.set('resolucionId', String(identidad.resolucionId))
    form.set('decision', decision)
    if (decision === 'confirmar' && identidad.proveedorId) form.set('proveedorId', identidad.proveedorId)
    empezar(async () => {
      const r = await corregirIdentidad(form)
      // Un error del servidor se muestra y NO se saca nada de la vista: una identidad que
      // desaparece sin haberse escrito vuelve mañana y nadie sabe por qué.
      if (!r.ok) { setError(r.error); return }
      setError(null)
      router.refresh()
    })
  }

  return (
    <div data-testid="confirmar-identidad" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {identidad.proveedorNombre && (
        <div style={{ fontSize: 12, color: C.apagado }}>
          ¿Es <span style={{ color: C.tinta }}>{identidad.proveedorNombre}</span>?
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {identidad.proveedorId && (
          <button type="button" style={BOTON} disabled={enCurso} onClick={() => decidir('confirmar')}>
            Confirmar
          </button>
        )}
        <Link href="/administracion/proveedores" style={{ ...BOTON, textDecoration: 'none', display: 'inline-block' }}>
          Elegir otro
        </Link>
        <button type="button" style={BOTON} disabled={enCurso} onClick={() => decidir('sin_resolver')}>
          Dejar sin resolver
        </button>
      </div>
      {error && <div style={{ fontSize: 12, color: '#B54708' }}>{error}</div>}
    </div>
  )
}
