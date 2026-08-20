export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // El mismo canvas que el resto del OS (`bg-canvas`, el neutro cálido de la marca). Estaba en
  // `bg-gray-50` —un gris de Tailwind, no un token—, así que la primera pantalla que ve alguien era
  // la única del sistema con un color que no salía de la identidad.
  return <div className="min-h-screen bg-canvas">{children}</div>
}
