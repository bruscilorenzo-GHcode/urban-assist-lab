// Netlify function mirroring the Vite dev-server Groq proxy (vite.config.ts).
// Modern Netlify Functions (Web API): default export (Request) => Response.
// The browser POSTs raw audio to /api/groq/transcribe, which netlify.toml
// rewrites here with the method and body preserved.

const GROQ_URL = 'https://api.groq.com/openai/v1/audio/transcriptions'
const MAX_BYTES = 12 * 1024 * 1024

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export default async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' })
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return json(503, { error: 'Groq STT is not configured. Set GROQ_API_KEY in the Netlify site environment.' })
  }
  try {
    const buffer = await request.arrayBuffer()
    if (buffer.byteLength === 0) return json(400, { error: 'No audio was received.' })
    if (buffer.byteLength > MAX_BYTES) return json(413, { error: 'Audio clip exceeds the 12 MB demo limit.' })

    const mimeType = (request.headers.get('content-type') ?? 'audio/webm').split(';')[0] ?? 'audio/webm'
    const langHeader = (request.headers.get('x-audio-language') ?? 'en').toLowerCase()
    const language = langHeader.startsWith('it') ? 'it' : 'en'
    const extension = mimeType.includes('wav') ? 'wav' : mimeType.includes('mp4') ? 'm4a' : 'webm'

    const form = new FormData()
    form.append('file', new Blob([buffer], { type: mimeType }), `voice-command.${extension}`)
    form.append('model', 'whisper-large-v3-turbo')
    form.append('language', language)
    form.append('response_format', 'json')

    const groqResponse = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    })
    const body = await groqResponse.text()
    if (!groqResponse.ok) {
      // Do not echo upstream headers or the API key to the browser/log.
      return json(groqResponse.status, { error: `Groq transcription failed (${groqResponse.status}).`, detail: body.slice(0, 500) })
    }
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return json(502, { error: error instanceof Error ? error.message : 'Transcription function failed.' })
  }
}
