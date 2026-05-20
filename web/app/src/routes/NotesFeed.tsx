import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'

type NoteView = { id: string; body: string; createdAt: string }

export function NotesFeed() {
  const qc = useQueryClient()
  const feed = useQuery<{ items: NoteView[] }>({
    queryKey: ['notes'],
    queryFn: () => api.get('/notes'),
  })

  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = useMutation({
    mutationFn: () => api.post('/notes', { body }),
    onSuccess: () => {
      setBody('')
      setError(null)
      qc.invalidateQueries({ queryKey: ['notes'] })
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Could not send.')
    },
  })

  return (
    <div className="pt-4">
      <h2 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight">
        Leave a note.
      </h2>
      <p className="mt-3 text-[13px] leading-relaxed text-[var(--color-stone)]">
        Anonymous. Recipients see these as a shared feed — no name, no attribution. Up to 280 characters.
      </p>

      <div className="mt-5 card-base p-4 bg-[var(--color-cream)]">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={280}
          rows={3}
          placeholder="Something kind. It'll reach them."
          className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-stone-soft)] resize-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-[10px] text-[var(--color-stone)]">{body.length}/280</span>
          <button
            onClick={() => submit.mutate()}
            disabled={submit.isPending || body.trim().length === 0}
            className="btn-primary h-9 px-4 text-xs"
          >
            {submit.isPending ? 'Sending…' : 'Send anonymously'}
          </button>
        </div>
        {error && <p className="mt-2 text-[11px] text-[var(--color-coral)]">{error}</p>}
      </div>

      <div className="mt-6">
        <div className="label-cap mb-3">From the class</div>
        {feed.isLoading ? (
          <p className="text-sm text-[var(--color-stone)]">Loading…</p>
        ) : (feed.data?.items ?? []).length === 0 ? (
          <div className="card-base p-5 text-center">
            <p className="text-sm text-[var(--color-stone)]">No notes yet. Be the first.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {feed.data?.items.map((n) => (
              <div key={n.id} className="card-base p-4">
                <p className="text-sm text-[var(--color-ink)] leading-relaxed">"{n.body}"</p>
                <p className="mt-2 font-mono text-[10px] text-[var(--color-stone)]">
                  {new Date(n.createdAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
