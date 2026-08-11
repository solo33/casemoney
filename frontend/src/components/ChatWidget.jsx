import { useState, useRef, useEffect } from 'react'
import './ChatWidget.css'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const SESSION_KEY = 'cm_chat_session_id'

function getSessionId() {
  let id = sessionStorage.getItem(SESSION_KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(SESSION_KEY, id)
  }
  return id
}

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([
    { role: 'bot', text: 'Привет! Я помогу разобраться с CaseMoney. Задайте любой вопрос 👋' }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  async function send() {
    const text = input.trim()
    if (!text || loading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', text }])
    setLoading(true)

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, session_id: getSessionId() }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'bot', text: data.reply }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'bot',
        text: 'Не удалось получить ответ. Попробуйте позже или напишите на support@casemoney.ru'
      }])
    } finally {
      setLoading(false)
    }
  }

  function onKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <>
      {open && (
        <div className="chat-panel">
          <div className="chat-header">
            <div className="chat-header-dot" />
            <div>
              <div className="chat-header-title">Поддержка CaseMoney</div>
              <div className="chat-header-sub">AI-ассистент · обычно отвечает мгновенно</div>
            </div>
            <button className="chat-close" onClick={() => setOpen(false)} aria-label="Закрыть">×</button>
          </div>

          <div className="chat-messages">
            {messages.map((m, i) => (
              <div key={i} className={`chat-bubble ${m.role}`}>{m.text}</div>
            ))}
            {loading && <div className="chat-bubble bot typing">Думаю…</div>}
            <div ref={bottomRef} />
          </div>

          <form className="chat-form" onSubmit={e => { e.preventDefault(); send() }}>
            <textarea
              ref={inputRef}
              className="chat-input"
              rows={1}
              placeholder="Напишите вопрос…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKey}
              disabled={loading}
            />
            <button className="chat-send" type="submit" disabled={!input.trim() || loading} aria-label="Отправить">
              ↑
            </button>
          </form>
        </div>
      )}

      <button
        className="chat-fab"
        onClick={() => setOpen(v => !v)}
        aria-label={open ? 'Закрыть чат' : 'Открыть чат'}
      >
        {open ? '×' : '💬'}
      </button>
    </>
  )
}
