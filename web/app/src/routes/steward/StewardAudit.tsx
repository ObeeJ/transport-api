import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { StewardSubnav } from '@/components/StewardSubnav'

type AuditEntry = {
  id: string
  actor: string
  action: string
  subject: string
  metadata?: string | Record<string, unknown> | null
  createdAt: string
}

export function StewardAudit() {
  const q = useQuery<{ items: AuditEntry[] }>({
    queryKey: ['steward', 'audit'],
    queryFn: () => api.get('/steward/audit?limit=100'),
  })

  return (
    <div>
      <StewardSubnav />
      <h1 className="text-3xl font-medium tracking-tight text-[var(--color-indigo)]">Audit log</h1>
      <p className="mt-1 text-sm text-[var(--color-stone)]">
        Append-only. Most recent 100 entries. Database hooks block UPDATE and DELETE on this table — even by an admin.
      </p>

      <div className="mt-6 card-base overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[var(--color-cream)] text-left text-[10px] uppercase tracking-wider text-[var(--color-stone)]">
            <tr>
              <th className="px-4 py-3 font-medium">When</th>
              <th className="px-4 py-3 font-medium">Actor</th>
              <th className="px-4 py-3 font-medium">Action</th>
              <th className="px-4 py-3 font-medium">Subject</th>
              <th className="px-4 py-3 font-medium">Metadata</th>
            </tr>
          </thead>
          <tbody className="font-mono text-xs">
            {q.isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-stone)]">
                  Loading…
                </td>
              </tr>
            ) : (
              q.data?.items.map((e) => (
                <tr key={e.id} className="border-t border-[var(--color-hairline)]">
                  <td className="px-4 py-2 text-[var(--color-stone)]">
                    {new Date(e.createdAt).toLocaleString('en-NG', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="px-4 py-2">{shortenId(e.actor)}</td>
                  <td className="px-4 py-2 text-[var(--color-indigo)]">{e.action}</td>
                  <td className="px-4 py-2">{shortenId(e.subject)}</td>
                  <td className="px-4 py-2 text-[var(--color-stone)] max-w-[400px] truncate">{formatMeta(e.metadata)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function shortenId(s: string): string {
  if (s === 'system') return s
  if (s.length > 13) return s.slice(0, 8) + '…' + s.slice(-4)
  return s
}

function formatMeta(meta: AuditEntry['metadata']): string {
  if (meta == null || meta === '') return '—'
  if (typeof meta === 'string') return meta
  try {
    return JSON.stringify(meta)
  } catch {
    return '—'
  }
}
