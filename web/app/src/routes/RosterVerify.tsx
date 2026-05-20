import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'

type RosterStatus = { verified: boolean }

export function RosterVerify() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const status = useQuery<RosterStatus>({
    queryKey: ['roster', 'me'],
    queryFn: () => api.get<RosterStatus>('/roster/me'),
  })

  const [studentId, setStudentId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const verify = useMutation({
    mutationFn: () => api.post('/roster/verify', { studentId: studentId.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roster', 'me'] })
      navigate('/support/apply', { replace: true })
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        switch (err.code) {
          case 'student_id_already_used':
            setError('That student ID is already linked to another account. Each student can only register once.')
            break
          default:
            setError(err.message)
        }
      } else {
        setError('Could not verify. Try again.')
      }
    },
  })

  if (status.isLoading) {
    return <p className="pt-12 text-sm text-[var(--color-stone)]">Loading…</p>
  }

  // Already verified — go straight to apply
  if (status.data?.verified) {
    return (
      <div className="pt-4">
        <div className="card-base p-5">
          <div className="flex items-center gap-3">
            <span className="size-2.5 rounded-full bg-[var(--color-moss)]" />
            <div className="text-base font-medium text-[var(--color-indigo)]">Student ID verified</div>
          </div>
          <p className="mt-2 text-[12px] text-[var(--color-stone)]">
            Your student ID has been verified. You can apply for support.
          </p>
          <button
            onClick={() => navigate('/support/apply')}
            className="btn-primary mt-4 w-full h-[52px]"
          >
            Continue to application
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="pt-4">
      <h2 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight">
        Verify your student ID.
      </h2>
      <p className="mt-3 text-[13px] leading-relaxed text-[var(--color-stone)]">
        One-time check. Your ID is hashed immediately — the raw number is never stored. This ensures one application per student.
      </p>

      <div className="mt-6 space-y-4">
        <label className="block">
          <div className="label-cap mb-2">Student ID</div>
          <div className="card-base px-4 py-3.5 bg-[var(--color-cream)]">
            <input
              type="text"
              required
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              placeholder="e.g. 20/ENG/001"
              className="w-full bg-transparent text-sm font-mono outline-none placeholder:text-[var(--color-stone-soft)] placeholder:font-sans"
            />
          </div>
          <p className="mt-1 text-[10px] text-[var(--color-stone)]">
            Verified once against the class roster. Stewards never see this number.
          </p>
        </label>
      </div>

      {error && (
        <p className="mt-4 text-[12px] text-[var(--color-coral)]" role="alert">{error}</p>
      )}

      <button
        onClick={() => { setError(null); verify.mutate() }}
        disabled={verify.isPending || studentId.trim().length < 3}
        className="btn-primary w-full mt-8 h-[52px]"
      >
        {verify.isPending ? 'Verifying…' : 'Verify and continue'}
      </button>
      <p className="text-[11px] mt-3 text-center text-[var(--color-stone)]">
        This is a one-way hash. We cannot reverse it or share it.
      </p>
    </div>
  )
}
