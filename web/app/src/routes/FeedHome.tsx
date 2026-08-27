import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type Post } from '@/lib/api'
import { ClapButton } from '@/components/ui/ClapButton'

const TABS = ['foryou', 'following', 'circle'] as const
type Tab = typeof TABS[number]

export function FeedHome() {
  const [tab, setTab] = useState<Tab>('foryou')
  const qc = useQueryClient()

  const feed = useQuery({
    queryKey: ['feed', tab],
    queryFn: () => api.posts.list(tab),
  })

  const clap = useMutation({
    mutationFn: ({ id, count }: { id: string; count: number }) => api.posts.clap(id, count),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feed'] }),
  })

  void clap

  return (
    <div className="pt-4">
      <div className="flex gap-3 mb-4 overflow-x-auto pb-1">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium capitalize transition-colors ${
              tab === t
                ? 'bg-[var(--color-indigo)] text-white'
                : 'bg-[var(--color-cream)] text-[var(--color-stone)]'
            }`}
          >
            {t === 'foryou' ? 'For you' : t}
          </button>
        ))}
      </div>

      {feed.isLoading ? (
        <p className="text-sm text-[var(--color-stone)]">Loading…</p>
      ) : (feed.data?.items ?? []).length === 0 ? (
        <div className="card-base p-8 text-center">
          <p className="text-sm text-[var(--color-stone)]">Nothing here yet. Be the first to post.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(feed.data?.items as Post[]).map(post => (
            <div key={post.id} className="card-base p-4">
              <p className="text-sm text-[var(--color-ink)]">{post.body}</p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] text-[var(--color-stone)]">
                  {new Date(post.createdAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })}
                </span>
                <ClapButton postId={post.id} initialCount={post.score} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
