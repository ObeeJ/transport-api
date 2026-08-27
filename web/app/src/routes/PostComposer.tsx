import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router'
import { api } from '@/lib/api'
import { useToast } from '@/lib/toast'

export function PostComposer() {
  const [params] = useSearchParams()
  const kind = params.get('kind') ?? 'general'
  const defaultBody = kind === 'thank_you' ? 'Thank you for the support — it means more than you know.' : ''
  const [body, setBody] = useState(defaultBody)
  const qc = useQueryClient()
  const nav = useNavigate()
  const toast = useToast()

  const submit = useMutation({
    mutationFn: () => api.posts.create({ kind, body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['feed'] })
      qc.invalidateQueries({ queryKey: ['wings'] })
      qc.invalidateQueries({ queryKey: ['transparency'] })
      toast.show('Posted!', 'success')
      nav('/feed')
    },
    onError: (e: Error) => toast.show(e.message, 'error'),
  })

  return (
    <div className="pt-4 max-w-sm mx-auto">
      <h2 className="text-2xl font-medium tracking-tight text-[var(--color-indigo)]">
        {kind === 'thank_you' ? 'Say thank you' : 'New post'}
      </h2>
      {kind === 'thank_you' && (
        <p className="mt-1 text-[11px] text-[var(--color-stone)]">
          This will unlock your ride credits.
        </p>
      )}
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={5}
        maxLength={600}
        placeholder="What's on your mind?"
        className="mt-4 w-full border border-[var(--color-hairline)] rounded-lg px-4 py-3 text-sm resize-none"
      />
      <div className="mt-1 text-right text-[10px] text-[var(--color-stone)]">{body.length}/600</div>
      <button
        onClick={() => submit.mutate()}
        disabled={body.trim().length < 3 || submit.isPending}
        className="mt-4 w-full bg-[var(--color-indigo)] text-white rounded-lg py-3 text-sm font-medium disabled:opacity-40"
      >
        {submit.isPending ? 'Posting…' : 'Post'}
      </button>
    </div>
  )
}
