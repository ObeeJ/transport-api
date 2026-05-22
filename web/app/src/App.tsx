import { Routes, Route } from 'react-router'
import { RoleShell, SharedRoleShell } from '@/components/layout/RoleShell'
import { RequireAuth } from '@/components/RequireAuth'
import { RequireSteward } from '@/components/RequireSteward'
import { StewardShell } from '@/components/layout/StewardShell'

// Public
import { Onboarding } from '@/routes/Onboarding'
import { ResetRequest } from '@/routes/ResetRequest'
import { ResetConfirm } from '@/routes/ResetConfirm'

// Role home
import { RoleHome } from '@/routes/RoleHome'

// Giver rail
import { GiverHome } from '@/routes/GiverHome'
import { NotesFeed } from '@/routes/NotesFeed'
import { TransparencyReport } from '@/routes/TransparencyReport'
import { PaystackCallback } from '@/routes/PaystackCallback'

// Commuter rail
import { RiderHome } from '@/routes/RiderHome'
import { ActiveTrip } from '@/routes/ActiveTrip'

// Driver rail
import { DriverHome } from '@/routes/DriverHome'
import { DriverApply } from '@/routes/DriverApply'

// Support / recipient rail
import { RecipientStatus } from '@/routes/RecipientStatus'
import { RecipientApply } from '@/routes/RecipientApply'
import { RecipientBank } from '@/routes/RecipientBank'
import { RosterVerify } from '@/routes/RosterVerify'

// Account (shared)
import { AccountPage } from '@/routes/AccountPage'
import { WalletPage } from '@/routes/WalletPage'
import { NotificationsPage } from '@/routes/NotificationsPage'
import { EmailVerify } from '@/routes/EmailVerify'

// Steward console
import { StewardQueue } from '@/routes/steward/StewardQueue'
import { StewardApplication } from '@/routes/steward/StewardApplication'
import { StewardAudit } from '@/routes/steward/StewardAudit'
import { StewardPayouts } from '@/routes/steward/StewardPayouts'
import { StewardAttendance } from '@/routes/steward/StewardAttendance'
import { StewardRoster } from '@/routes/steward/StewardRoster'
import { StewardSOS } from '@/routes/steward/StewardSOS'
import { StewardAppeals } from '@/routes/steward/StewardAppeals'
import { StewardDrivers } from '@/routes/steward/StewardDrivers'
import { StewardSignIn } from '@/routes/steward/StewardSignIn'
import { PrivacyPromise } from '@/routes/PrivacyPromise'
import { NotFound } from '@/routes/NotFound'

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/reset-password" element={<ResetRequest />} />
      <Route path="/reset-password/confirm" element={<ResetConfirm />} />
      <Route path="/account/reset-password" element={<ResetConfirm />} />
      <Route path="/account/forgot-password" element={<ResetRequest />} />
      <Route path="/steward/sign-in" element={<StewardSignIn />} />
      <Route path="/privacy" element={<PrivacyPromise />} />
      <Route path="/privacy-promise" element={<PrivacyPromise />} />

      <Route element={<RequireAuth />}>
        {/* Role home — picks the right shell */}
        <Route path="/" element={<RoleHome />} />

        {/* ── Giver rail ── */}
        <Route element={<RoleShell role="giver" />}>
          <Route path="/give" element={<GiverHome />} />
          <Route path="/notes" element={<NotesFeed />} />
          <Route path="/transparency" element={<TransparencyReport />} />
        </Route>
        {/* Paystack callback — full-screen, outside shell */}
        <Route path="/give/callback" element={<PaystackCallback />} />

        {/* ── Commuter rail ── */}
        <Route element={<RoleShell role="commuter" />}>
          <Route path="/ride" element={<RiderHome />} />
          <Route path="/trip/:tripId" element={<ActiveTrip />} />
          <Route path="/support" element={<RecipientStatus />} />
          <Route path="/support/status" element={<RecipientStatus />} />
          <Route path="/support/verify" element={<RosterVerify />} />
          <Route path="/support/apply" element={<RecipientApply />} />
          <Route path="/support/bank" element={<RecipientBank />} />
          <Route path="/wallet" element={<WalletPage />} />
        </Route>

        {/* ── Driver rail ── */}
        <Route element={<RoleShell role="driver" />}>
          <Route path="/drive" element={<DriverHome />} />
          <Route path="/drive/apply" element={<DriverApply />} />
        </Route>

        {/* ── Shared (preserves the rail the user came from) ── */}
        <Route element={<SharedRoleShell />}>
          <Route path="/account" element={<AccountPage />} />
          <Route path="/account/verify-email" element={<EmailVerify />} />
          <Route path="/notifications" element={<NotificationsPage />} />
        </Route>

        {/* ── Steward console ── */}
        <Route element={<RequireSteward />}>
          <Route element={<StewardShell />}>
            <Route path="/steward" element={<StewardQueue />} />
            <Route path="/steward/applications/:id" element={<StewardApplication />} />
            <Route path="/steward/payouts" element={<StewardPayouts />} />
            <Route path="/steward/drivers" element={<StewardDrivers />} />
            <Route path="/steward/sos" element={<StewardSOS />} />
            <Route path="/steward/appeals" element={<StewardAppeals />} />
            <Route path="/steward/attendance" element={<StewardAttendance />} />
            <Route path="/steward/roster" element={<StewardRoster />} />
            <Route path="/steward/audit" element={<StewardAudit />} />
          </Route>
        </Route>
      </Route>

      {/* Fallback */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
