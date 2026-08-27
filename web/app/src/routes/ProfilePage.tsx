import { useParams } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { api, type Streak, type BadgeLevel } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { VerifiedTick } from '@/components/ui/VerifiedTick'
import { StreakChip } from '@/components/ui/StreakChip'
import { fadeUp, stagger, transition } from '@/lib/motion'

type Profile = {
  id: string
  pseudonymousId: string
  badge: BadgeLevel
  streaks: Streak[]
  followersCount: number
  followingCount: number
  isFollowing: boolean
  isMe: boolean
}

export function ProfilePage() {
  const { userId } = useParams()
  const { user } = useAuth()
  const qc = useQueryClient()
  const targetId = userId ?? user?.id

  const profile = useQuery<Profile>({
    queryKey: ['profile', targetId],
    queryFn: () => api.get(`/users/${targetId}/profile`),
    enabled: !!targetId,
  })

  const streaks = useQuery<{ items: Streak[] }>({
    queryKey: ['streaks', targetId],
    queryFn: () => api.streaks.me(),
    enabled: !!targetId && profile.data?.isMe,
  })

  const follow = useMutation({
    mutationFn: () => api.follows.toggle(targetId!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['profile', targetId] }),
  })

  const p = profile.data

  return (
    <motion.div variants={stagger(0.07, 0.03)} initial="hidden" animate="show" className="space-y-5">
      {profile.isLoading ? (
        <div className="space-y-3">
          <div className="card-base h-24 animate-pulse" />
          <div className="card-base h-16 animate-pulse" />
        </div>
      ) : !p ? (
        <div className="pt-12 text-center text-[var(--color-stone)] text-sm">Profile not found.</div>
      ) : (
        <>
          {/* Header */}
          <motion.div variants={fadeUp} transition={transition.default} className="card-base p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[15px] font-medium text-[var(--color-indigo)]">
                    {p.pseudonymousId}
                  </span>
                  <VerifiedTick level={p.badge} />
                </div>
                <div className="mt-2 flex gap-4 text-[11px] text-[var(--color-stone)]">
                  <span><span className="font-medium text-[var(--color-ink)]">{p.followersCount}</span> followers</span>
                  <span><span className="font-medium text-[var(--color-ink)]">{p.followingCount}</span> following</span>
                </div>
              </div>
              {!p.isMe && (
                <button
                  onClick={() => follow.mutate()}
                  disabled={follow.isPending}
                  className={`h-8 px-4 rounded-[10px] text-xs font-medium transition-all ${
                    p.isFollowing
                      ? 'border border-[var(--color-hairline)] text-[var(--color-stone)] hover:border-[var(--color-coral)] hover:text-[var(--color-coral)]'
                      : 'bg-[var(--color-indigo)] text-white hover:opacity-90'
                  }`}
                >
                  {p.isFollowing ? 'Following' : 'Follow'}
                </button>
              )}
            </div>
          </motion.div>

          {/* Streaks */}
          {(p.isMe ? streaks.data?.items : p.streaks)?.length ? (
            <motion.div variants={fadeUp} transition={transition.default} className="card-base p-5">
              <div className="label-cap mb-3">Streaks</div>
              <div className="flex flex-wrap gap-2">
                {(p.isMe ? streaks.data?.items : p.streaks)!.map((s) => (
                  <StreakChip key={s.kind} streak={s} />
                ))}
              </div>
            </motion.div>
          ) : null}
        </>
      )}
    </motion.div>
  )
}
