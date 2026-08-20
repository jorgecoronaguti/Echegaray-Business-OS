'use client'

// LA CREDENCIAL QUE SE MUESTRA UNA SOLA VEZ.
//
// Vive en su propio archivo porque la usan DOS caminos —el alta de una cuenta y la regeneración de
// la contraseña de una cuenta existente— y son el mismo hecho: se acaba de generar una clave que no
// está guardada en ningún lado y que alguien tiene que pasarle a una persona. Duplicar el bloque
// habría dejado dos textos que se van separando: uno diría «no se vuelve a mostrar» y el otro no.
//
// ═══ POR QUÉ LA CLAVE SE MUESTRA EN PANTALLA, Y NO SE MANDA ═══
//
// `inviteUserByEmail` y el «recuperar contraseña» de Supabase necesitan SMTP configurado, y este
// proyecto no lo tiene. Un mail que se manda y no llega es peor que ninguno: nadie se entera de que
// falló, y la persona queda esperando algo que no existe. Mientras no haya SMTP, el canal es una
// persona pasándole el texto a otra, y la pantalla lo dice así de explícito.
//
// La clave NO se registra en ningún log ni se guarda en ninguna tabla: viaja del servidor a esta
// pantalla y muere ahí.

import { useState } from 'react'
import { siteUrl } from '@/lib/site-url'

export function Credencial({
  email, clave, titulo, testid = 'credencial-nueva', aviso,
}: {
  email: string
  clave: string
  titulo: string
  /** El alta y el reseteo se distinguen en el test por acá; el bloque es el mismo. */
  testid?: string
  /** Lo que hay que saber ADEMÁS de la clave. Hoy: que una cuenta sin acceso no entra igual. */
  aviso?: string | null
}) {
  const [copiado, setCopiado] = useState(false)
  const texto = `Echegaray OS\n${siteUrl()}/login\nUsuario: ${email}\nClave: ${clave}`
  return (
    <div className="rounded-control border border-pos/30 bg-pos-soft p-2.5" data-testid={testid}>
      <p className="text-[12px] font-medium text-pos">{titulo}</p>
      <pre className="mt-1.5 whitespace-pre-wrap rounded bg-surface p-2 text-[11px] text-ink">{texto}</pre>
      <button
        type="button"
        onClick={() => { navigator.clipboard?.writeText(texto); setCopiado(true) }}
        className="mt-1.5 rounded-control border border-line bg-surface px-2 py-1 text-[11px] text-muted hover:bg-surface-sunken"
      >
        {copiado ? 'Copiado' : 'Copiar'}
      </button>
      <p className="mt-1.5 text-[11px] text-muted">La clave no se vuelve a mostrar.</p>
      {/* UN AVISO QUE CONTRADICE A LA CREDENCIAL VA PEGADO A ELLA. Entregar una clave nueva de una
          cuenta bloqueada y no decirlo manda a la persona a probar tres veces y a llamar por
          teléfono: la clave anda, lo que no anda es la cuenta. */}
      {aviso && <p className="mt-1.5 text-[11px] font-medium text-warn" data-testid={`${testid}-aviso`}>{aviso}</p>}
    </div>
  )
}
