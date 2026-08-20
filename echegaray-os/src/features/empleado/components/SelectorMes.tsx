import Link from 'next/link'

// «ESTE MES / MES PASADO» — dos objetivos y no un desplegable de doce.
//
// El handoff da esas dos opciones y nada más. La ventana viaja en la URL para que volver a la
// pantalla devuelva al mes que se estaba mirando: con estado local, cada vuelta reinicia a «este
// mes» y quien está revisando julio lo pierde en cada toque.

export function SelectorMes({ base, actual }: { base: string; actual: 'mes' | 'mes-pasado' }) {
  const opciones: [typeof actual, string][] = [['mes', 'Este mes'], ['mes-pasado', 'Mes pasado']]
  return (
    <nav className="flex gap-1 border-b border-line" data-testid="selector-mes">
      {opciones.map(([v, l]) => (
        <Link
          key={v}
          href={`${base}?ver=${v}`}
          data-testid={`mes-${v}`}
          aria-current={actual === v ? 'page' : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-[13px] ${
            actual === v ? 'border-marca font-semibold text-ink' : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {l}
        </Link>
      ))}
    </nav>
  )
}
