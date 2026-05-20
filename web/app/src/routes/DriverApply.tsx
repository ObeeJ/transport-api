import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { ApiError, api } from '@/lib/api'

type DriverProfile = {
  id: string
  status: 'pending' | 'approved' | 'declined'
  vehicleType: string
  vehiclePlate: string
  licenseNumber: string
  note?: string
  createdAt: string
  decidedAt?: string
}

type VehicleType = 'car' | 'bus' | 'minivan'

export function DriverApply() {
  const navigate = useNavigate()
  const existing = useQuery<DriverProfile>({
    queryKey: ['driver', 'me'],
    queryFn: () => api.get<DriverProfile>('/driver/me'),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 1,
  })

  const [vehicleType, setVehicleType] = useState<VehicleType>('car')
  const [vehiclePlate, setVehiclePlate] = useState('')
  const [licenseNumber, setLicenseNumber] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (existing.isLoading) {
    return <p className="pt-12 text-sm text-[var(--color-stone)]">Loading…</p>
  }

  // Already applied — show status
  if (existing.data) {
    const d = existing.data
    const statusColor =
      d.status === 'approved' ? 'var(--color-moss)'
      : d.status === 'declined' ? 'var(--color-coral)'
      : 'var(--color-clay)'
    const statusLabel =
      d.status === 'approved' ? 'Approved — you can publish trips'
      : d.status === 'declined' ? 'Not approved this time'
      : 'With the stewards — two must agree'

    return (
      <div className="pt-4">
        <h2 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight">
          Driver application.
        </h2>
        <div className="mt-5 card-base p-5">
          <div className="flex items-center gap-3">
            <span className="size-2.5 rounded-full" style={{ background: statusColor }} />
            <div className="text-base font-medium text-[var(--color-indigo)]">{statusLabel}</div>
          </div>
          <div className="mt-4 space-y-2 text-[12px] text-[var(--color-stone)]">
            <div><span className="font-mono uppercase tracking-wider text-[10px]">Vehicle</span> · {d.vehicleType} · {d.vehiclePlate}</div>
            <div><span className="font-mono uppercase tracking-wider text-[10px]">Licence</span> · {d.licenseNumber}</div>
          </div>
        </div>
        {d.status === 'approved' && (
          <button
            onClick={() => navigate('/drive')}
            className="btn-primary w-full mt-6 h-[52px]"
          >
            Go to Drive
          </button>
        )}
      </div>
    )
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!vehiclePlate.trim() || !licenseNumber.trim()) {
      setError('Vehicle plate and licence number are required.')
      return
    }
    setSubmitting(true)
    try {
      await api.post('/driver/apply', { vehicleType, vehiclePlate: vehiclePlate.trim().toUpperCase(), licenseNumber: licenseNumber.trim(), note })
      navigate('/drive', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit. Try again.')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="pt-4">
      <h2 className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight">
        Drive for the class.
      </h2>
      <p className="mt-3 text-[13px] leading-relaxed text-[var(--color-stone)]">
        Two stewards verify your details. No payment — this is in-kind giving. Your impact is tracked privately.
      </p>

      <div className="mt-6 space-y-4">
        <div>
          <div className="label-cap mb-2">Vehicle type</div>
          <div className="card-base p-1.5 flex">
            {(['car', 'bus', 'minivan'] as VehicleType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setVehicleType(t)}
                className={`flex-1 text-xs py-2.5 rounded-[12px] font-medium capitalize ${
                  vehicleType === t ? 'bg-[var(--color-indigo)] text-[var(--color-paper)]' : 'text-[var(--color-stone)]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <div className="label-cap mb-2">Vehicle plate</div>
          <div className="card-base px-4 py-3.5 bg-[var(--color-cream)]">
            <input
              required
              value={vehiclePlate}
              onChange={(e) => setVehiclePlate(e.target.value)}
              placeholder="ABJ-432-KJA"
              className="w-full bg-transparent text-sm font-mono uppercase outline-none placeholder:text-[var(--color-stone-soft)] placeholder:normal-case"
            />
          </div>
        </label>

        <label className="block">
          <div className="label-cap mb-2">Driver's licence number</div>
          <div className="card-base px-4 py-3.5 bg-[var(--color-cream)]">
            <input
              required
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              placeholder="ABC12345678901"
              className="w-full bg-transparent text-sm font-mono uppercase outline-none placeholder:text-[var(--color-stone-soft)] placeholder:normal-case"
            />
          </div>
        </label>

        <label className="block">
          <div className="label-cap mb-2">Note <span className="text-[var(--color-stone-soft)] normal-case tracking-normal text-[10px]">· optional</span></div>
          <div className="card-base px-4 py-3 bg-[var(--color-cream)]">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Anything stewards should know about your route or availability."
              className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-stone-soft)] resize-none"
            />
          </div>
        </label>
      </div>

      {error && <p className="mt-4 text-[12px] text-[var(--color-coral)]" role="alert">{error}</p>}

      <button type="submit" disabled={submitting} className="btn-primary w-full mt-8 h-[52px]">
        {submitting ? 'Sending…' : 'Apply to drive'}
      </button>
      <p className="text-[11px] mt-3 text-center text-[var(--color-stone)]">
        Two stewards must verify. You'll be notified of the outcome.
      </p>
    </form>
  )
}
