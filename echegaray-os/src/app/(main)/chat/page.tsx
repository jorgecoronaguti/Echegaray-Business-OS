import { ChatInterno } from '@/features/chat-interno/components/ChatInterno'

// CHAT INTERNO 0-API (F7). La página sólo monta la UI cliente; el backend (route handler
// /api/chat-interno) rutea con el ruteador determinístico del OS y lee las tablas ya materializadas.
// No hay llamada a ninguna API de Anthropic: es interno y 0-API.
export const metadata = { title: 'Chat del OS' }

export default function ChatPage() {
  return <ChatInterno />
}
