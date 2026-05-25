import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'motion/react'
import { ApiError, api } from '@/lib/api'
import { fadeUp, stagger, transition } from '@/lib/motion'

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

// Nigerian plate: up to 3 letters, 3 digits, 2 letters — but we accept
// any alphanumeric + hyphen up to 16 chars. Just reject obvious garbage
// like an email address or a sentence.
const PLATE_RE = /^[A-Z0-9][A-Z0-9\-]{1,14}[A-Z0-9]$/i
// Nigerian FRSC licence: 3 letters + 10–12 alphanumeric chars, but we
// accept any alphanumeric 6–40 chars to cover older formats.
const LICENCE_RE = /^[A-Z0-9]{6,40}$/i

function validatePlate(v: string): string | null {
  const t = v.trim()
  if (!t) return 'Required.'
  if (t.includes('@') || t.includes(' ') || t.includes('.')) return 'Looks like an email or sentence — enter the plate number only.'
  if (!PLATE_RE.test(t)) return 'Use letters, digits, and hyphens only (e.g. ABJ-432-KJA).'
  return null
}

function validateLicence(v: string): string | null {
  const t = v.trim()
  if (!t) return 'Required.'
  if (t.includes('@') || t.includes(' ') || t.includes('.com')) return 'Looks like an email — enter your FRSC licence number only.'
  if (!LICENCE_RE.test(t)) return 'Letters and digits only, at least 6 characters (e.g. ABC12345678901).'
  return null
}

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
  const [touched, setTouched] = useState({ plate: false, licence: false })
  const [showPreview, setShowPreview] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const plateErr = validatePlate(vehiclePlate)
  const licenceErr = validateLicence(licenseNumber)
  const canPreview = !plateErr && !licenceErr

  if (existing.isLoading) {
    return <p className="pt-12 text-sm text-[var(--color-stone)]">Loading…</p>
  }

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
          <button onClick={() => navigate('/drive')} className="btn-primary w-full mt-6 h-[52px]">
            Go to Drive
          </button>
        )}
      </div>
    )
  }

  async function onSubmit() {
    setError(null)
    setSubmitting(true)
    try {
      await api.post('/driver/apply', {
        vehicleType,
        vehiclePlate: vehiclePlate.trim().toUpperCase(),
        licenseNumber: licenseNumber.trim().toUpperCase(),
        note,
      })
      navigate('/drive', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit. Try again.')
      setSubmitting(false)
      setShowPreview(false)
    }
  }

  return (
    <motion.div
      variants={stagger(0.07, 0.04)}
      initial="hidden"
      animate="show"
      className="pt-4"
    >
      <motion.h2
        variants={fadeUp}
        transition={transition.default}
        className="text-[28px] font-medium tracking-tight text-[var(--color-indigo)] leading-tight"
      >
        Drive for the class.
      </motion.h2>
      <motion.p
        variants={fadeUp}
        transition={transition.default}
        className="mt-3 text-[13px] leading-relaxed text-[var(--color-stone)]"
      >
        Two stewards verify your details. No payment — this is in-kind giving. Your impact is tracked privately.
      </motion.p>

      {/* What stewards see callout */}
      <motion.div
        variants={fadeUp}
        transition={transition.default}
        className="mt-5 card-base p-4 border-l-4 border-l-[var(--color-clay)]"
        style={{ background: 'rgba(217,119,87,0.04)' }}
      >
        <div className="label-cap text-[var(--color-clay)] mb-1">What stewards see</div>
        <p className="text-[12px] text-[var(--color-stone)] leading-relaxed">
          Stewards review your <strong className="text-[var(--color-ink)]">vehicle plate</strong>, <strong className="text-[var(--color-ink)]">licence number</strong>, and <strong className="text-[var(--color-ink)]">vehicle type</strong> — nothing else about your identity. Make sure these match your physical documents exactly.
        </p>
      </motion.div>

      <motion.div variants={stagger(0.06, 0.15)} initial="hidden" animate="show" className="mt-6 space-y-4">
        {/* Vehicle type */}
        <motion.div variants={fadeUp} transition={transition.default}>
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
        </motion.div>

        {/* Vehicle plate */}
        <motion.div variants={fadeUp} transition={transition.default}>
          <label className="block">
            <div className="flex items-center justify-between mb-2">
              <div className="label-cap">Vehicle plate</div>
              <span className="text-[10px] text-[var(--color-stone)] normal-case tracking-normal">e.g. ABJ-432-KJA</span>
            </div>
            <div className={`card-base px-4 py-3.5 bg-[var(--color-cream)] transition-colors ${
              touched.plate && plateErr ? 'border-[var(--color-coral)]' : touched.plate && !plateErr ? 'border-[var(--color-moss)]' : ''
            }`}>
              <div className="flex items-center gap-2">
                <input
                  required
                  maxLength={16}
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value)}
                  onBlur={() => setTouched(t => ({ ...t, plate: true }))}
                  placeholder="ABJ-432-KJA"
                  className="flex-1 bg-transparent text-sm font-mono uppercase outline-none placeholder:text-[var(--color-stone-soft)] placeholder:normal-case"
                />
                {touched.plate && (
                  plateErr
                    ? <span className="text-[var(--color-coral)] shrink-0">✕</span>
                    : <span className="text-[var(--color-moss)] shrink-0">✓</span>
                )}
              </div>
            </div>
            <AnimatePresence>
              {touched.plate && plateErr && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-1.5 text-[11px] text-[var(--color-coral)]"
                >
                  {plateErr}
                </motion.p>
              )}
            </AnimatePresence>
          </label>
        </motion.div>

        {/* Licence number */}
        <motion.div variants={fadeUp} transition={transition.default}>
          <label className="block">
            <div className="flex items-center justify-between mb-2">
              <div className="label-cap">Driver's licence number</div>
              <span className="text-[10px] text-[var(--color-stone)] normal-case tracking-normal">FRSC-issued, e.g. ABC12345678901</span>
            </div>
            <div className={`card-base px-4 py-3.5 bg-[var(--color-cream)] transition-colors ${
              touched.licence && licenceErr ? 'border-[var(--color-coral)]' : touched.licence && !licenceErr ? 'border-[var(--color-moss)]' : ''
            }`}>
              <div className="flex items-center gap-2">
                <input
                  required
                  maxLength={40}
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  onBlur={() => setTouched(t => ({ ...t, licence: true }))}
                  placeholder="ABC12345678901"
                  className="flex-1 bg-transparent text-sm font-mono uppercase outline-none placeholder:text-[var(--color-stone-soft)] placeholder:normal-case"
                />
                {touched.licence && (
                  licenceErr
                    ? <span className="text-[var(--color-coral)] shrink-0">✕</span>
                    : <span className="text-[var(--color-moss)] shrink-0">✓</span>
                )}
              </div>
            </div>
            <AnimatePresence>
              {touched.licence && licenceErr && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-1.5 text-[11px] text-[var(--color-coral)]"
                >
                  {licenceErr}
                </motion.p>
              )}
            </AnimatePresence>
          </label>
        </motion.div>

        {/* Note */}
        <motion.div variants={fadeUp} transition={transition.default}>
          <label className="block">
            <div className="label-cap mb-2">
              Note <span className="text-[var(--color-stone-soft)] normal-case tracking-normal text-[10px]">· optional</span>
            </div>
            <div className="card-base px-4 py-3 bg-[var(--color-cream)]">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={600}
                rows={3}
                placeholder="Anything stewards should know about your route or availability."
                className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--color-stone-soft)] resize-none"
              />
            </div>
          </label>
        </motion.div>
      </motion.div>

      {/* Pre-submit steward preview */}
      <AnimatePresence>
        {showPreview && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={transition.default}
            className="mt-6 card-base p-5"
            style={{ background: 'rgba(27,42,78,0.03)', borderColor: 'var(--color-indigo)' }}
          >
            <div className="label-cap text-[var(--color-indigo)] mb-3">Steward preview — this is what they'll see</div>
            <div className="space-y-2 text-[13px]">
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-stone)] text-[11px] uppercase tracking-wider font-semibold">Plate</span>
                <span className="font-mono font-semibold text-[var(--color-indigo)]">{vehiclePlate.trim().toUpperCase()}</span>
              </div>
              <div className="h-px bg-[var(--color-hairline)]" />
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-stone)] text-[11px] uppercase tracking-wider font-semibold">Licence</span>
                <span className="font-mono font-semibold text-[var(--color-indigo)]">{licenseNumber.trim().toUpperCase()}</span>
              </div>
              <div className="h-px bg-[var(--color-hairline)]" />
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-stone)] text-[11px] uppercase tracking-wider font-semibold">Type</span>
                <span className="font-mono font-semibold text-[var(--color-indigo)] capitalize">{vehicleType}</span>
              </div>
              {note.trim() && (
                <>
                  <div className="h-px bg-[var(--color-hairline)]" />
                  <div>
                    <span className="text-[var(--color-stone)] text-[11px] uppercase tracking-wider font-semibold block mb-1">Note</span>
                    <p className="text-[12px] text-[var(--color-ink)] italic">"{note.trim()}"</p>
                  </div>
                </>
              )}
            </div>
            <p className="mt-4 text-[11px] text-[var(--color-stone)]">
              Does this look right? Two stewards will review this before you can publish trips.
            </p>
            {error && <p className="mt-2 text-[11px] text-[var(--color-coral)]">{error}</p>}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className="flex-1 h-10 rounded-[12px] border border-[var(--color-hairline)] text-xs"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                className="flex-1 h-10 rounded-[12px] bg-[var(--color-indigo)] text-[var(--color-paper)] text-xs font-medium disabled:opacity-40"
              >
                {submitting ? 'Sending…' : 'Confirm & submit'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {!showPreview && (
        <>
          {error && <p className="mt-4 text-[12px] text-[var(--color-coral)]" role="alert">{error}</p>}
          <button
            type="button"
            onClick={() => {
              setTouched({ plate: true, licence: true })
              if (canPreview) setShowPreview(true)
            }}
            disabled={!canPreview}
            className="btn-primary w-full mt-8 h-[52px] disabled:opacity-40"
          >
            Review before submitting
          </button>
          {!canPreview && (touched.plate || touched.licence) && (
            <p className="text-[11px] mt-2 text-center text-[var(--color-coral)]">
              Fix the errors above before continuing.
            </p>
          )}
          <p className="text-[11px] mt-3 text-center text-[var(--color-stone)]">
            Two stewards must verify. You'll be notified of the outcome.
          </p>
        </>
      )}
    </motion.div>
  )
}
