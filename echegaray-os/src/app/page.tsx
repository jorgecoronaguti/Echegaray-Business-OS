import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// La raíz nunca tuvo a dónde ir -- quedaba mostrando el placeholder original de la
// Fundación (Bloque 12-B: "no quiero tener que inferir dónde está la interfaz").
export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  redirect(user ? '/dashboard' : '/login')
}
