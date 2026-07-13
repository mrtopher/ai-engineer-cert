import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

type Role = "user" | "assistant"

interface Message {
  role: Role
  content: string
}

type StreamEvent =
  | { type: "tool"; name: string; label: string }
  | { type: "reply"; reply: string }
  | { type: "error"; reply: string }

/**
 * Stream a chat turn over SSE. Invokes `onTool` for each live progress event
 * and resolves with the final reply text.
 */
async function streamChat(
  message: string,
  conversationId: string,
  onTool: (label: string) => void,
): Promise<string> {
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, conversation_id: conversationId }),
  })
  if (!res.ok || !res.body) {
    throw new Error(`Request failed: ${res.status}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let reply = "Sorry, something went wrong."

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // SSE frames are separated by a blank line.
    const frames = buffer.split("\n\n")
    buffer = frames.pop() ?? ""
    for (const frame of frames) {
      const line = frame.trim()
      if (!line.startsWith("data:")) continue
      const event = JSON.parse(line.slice(5).trim()) as StreamEvent
      if (event.type === "tool") onTool(event.label)
      else reply = event.reply
    }
  }
  return reply
}

function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState<string[]>([])
  const conversationId = useRef(crypto.randomUUID())
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, loading, progress])

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return

    setMessages((prev) => [...prev, { role: "user", content: text }])
    setInput("")
    setLoading(true)
    setProgress([])

    try {
      const reply = await streamChat(text, conversationId.current, (label) =>
        setProgress((prev) => [...prev, label]),
      )
      setMessages((prev) => [...prev, { role: "assistant", content: reply }])
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Sorry, something went wrong." },
      ])
    } finally {
      setLoading(false)
      setProgress([])
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Card className="flex h-[80vh] w-full max-w-2xl flex-col">
        <CardHeader>
          <CardTitle>Codebase Concierge</CardTitle>
        </CardHeader>

        <CardContent className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full px-6">
            <div className="flex flex-col gap-3 py-2">
              {messages.length === 0 && (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  Ask a question about the repository.
                </p>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex",
                    m.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground",
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-muted text-muted-foreground space-y-1 rounded-lg px-3 py-2 text-sm">
                    {progress.length === 0 ? (
                      <span className="animate-pulse">Thinking…</span>
                    ) : (
                      progress.map((p, i) => (
                        <div
                          key={i}
                          className={cn(
                            "flex items-center gap-2",
                            i === progress.length - 1
                              ? "animate-pulse"
                              : "opacity-60",
                          )}
                        >
                          <span>{i === progress.length - 1 ? "▸" : "✓"}</span>
                          <span>{p}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
              <div ref={endRef} />
            </div>
          </ScrollArea>
        </CardContent>

        <CardFooter className="gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about the repo…"
            disabled={loading}
          />
          <Button onClick={handleSend} disabled={loading || !input.trim()}>
            Send
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}

export default App
