import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

type Notification = {
  id: string
  channel: string
  event: string
  title: string
  body: string
  readAt?: string
  createdAt: string
}

export function NotificationsPage() {
  const qc = useQueryClient()
  const q = useQuery<{ items: Notification[]; unreadCount: number }>({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications'),
    refetchInterval: 30_000,
  })

  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markOne = useMutation({
    mutationFn: (id: string) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const items = q.data?.items ?? []
  const unread = q.data?.unreadCount ?? 0

  return (
    <div className="pt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight">
          Notifications
          {unread > 0 && (
            <span className="ml-2 text-[16px] font-mono text-[var(--color-clay)]">
              {unread}
            </span>
          )}
        </h2>
        {unread > 0 && (
          <button
            onClick={() => markAll.mutate()}
            className="label-cap text-[var(--color-stone)] hover:text-[var(--color-ink)]"
          >
            Mark all read
          </button>
        )}
      </div>

      <div className="mt-5">
        {q.isLoading ? (
          <p className="text-sm text-[var(--color-stone)]">Loading…</p>
        ) : items.length === 0 ? (
          <div className="card-base p-5 text-center">
            <p className="text-sm text-[var(--color-stone)]">Nothing here yet.</p>
          </div>
        ) : (
          <div className="card-base divide-y divide-[var(--color-hairline)]">
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => !n.readAt && markOne.mutate(n.id)}
                className="w-full text-left px-4 py-4 flex items-start gap-3"
              >
                {!n.readAt && (
                  <span className="mt-1.5 size-2 rounded-full bg-[var(--color-clay)] shrink-0" />
                )}
                <div className={!n.readAt ? '' : 'pl-5'}>
                  <div className="text-sm font-medium text-[var(--color-ink)]">{n.title}</div>
                  <div className="mt-0.5 text-[12px] text-[var(--color-stone)] leading-relaxed">{n.body}</div>
                  <div className="mt-1 font-mono text-[10px] text-[var(--color-stone)]">
                    {new Date(n.createdAt).toLocaleString('en-NG', {
                      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                    })}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
