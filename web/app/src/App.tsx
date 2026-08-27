import { Routes, Route } from 'react-router'
import { RoleShell, SharedRoleShell } from '@/components/layout/RoleShell'
import { RequireAuth } from '@/components/RequireAuth'
import { RequireAdmin } from '@/components/RequireAdmin'

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
import { RideSearching } from '@/routes/RideSearching'
import { EmergencyGrantScan } from '@/routes/EmergencyGrantScan'

// Driver rail
import { DriverHome } from '@/routes/DriverHome'
import { DriverApply } from '@/routes/DriverApply'
import { SponsorSetup } from '@/routes/SponsorSetup'

// Support / recipient
import { RecipientStatus } from '@/routes/RecipientStatus'
import { RecipientApply } from '@/routes/RecipientApply'
import { RecipientBank } from '@/routes/RecipientBank'

// Account (shared)
import { AccountPage } from '@/routes/AccountPage'
import { WalletPage } from '@/routes/WalletPage'
import { NotificationsPage } from '@/routes/NotificationsPage'
import { EmailVerify } from '@/routes/EmailVerify'
import { WingsPage } from '@/routes/WingsPage'
import { KYCFlow } from '@/routes/KYCFlow'
import { ProfilePage } from '@/routes/ProfilePage'

// Social feed
import { FeedHome } from '@/routes/FeedHome'
import { PostComposer } from '@/routes/PostComposer'

// Ambassador + Circle + Ads
import { AmbassadorDashboard } from '@/routes/AmbassadorDashboard'
import { CirclePurchase } from '@/routes/CirclePurchase'
import { CircleCreate } from '@/routes/CircleCreate'
import { CircleJoin } from '@/routes/CircleJoin'
import { AdvertiserPortal } from '@/routes/AdvertiserPortal'

import { PrivacyPromise } from '@/routes/PrivacyPromise'
import { NotFound } from '@/routes/NotFound'

// Admin console
import { AdminDashboard } from '@/routes/admin/AdminDashboard'
import { PricingSettings } from '@/routes/admin/PricingSettings'
import { DriverQueue } from '@/routes/admin/DriverQueue'
import { ReportQueue } from '@/routes/admin/ReportQueue'
import { AdminSignIn } from '@/routes/admin/AdminSignIn'

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/reset-password" element={<ResetRequest />} />
      <Route path="/reset-password/confirm" element={<ResetConfirm />} />
      <Route path="/account/reset-password" element={<ResetConfirm />} />
      <Route path="/account/forgot-password" element={<ResetRequest />} />
      <Route path="/admin/sign-in" element={<AdminSignIn />} />
      <Route path="/privacy" element={<PrivacyPromise />} />
      <Route path="/privacy-promise" element={<PrivacyPromise />} />

      <Route element={<RequireAuth />}>
        <Route path="/" element={<RoleHome />} />

        {/* ── Giver rail ── */}
        <Route element={<RoleShell role="giver" />}>
          <Route path="/give" element={<GiverHome />} />
          <Route path="/notes" element={<NotesFeed />} />
          <Route path="/transparency" element={<TransparencyReport />} />
        </Route>
        <Route path="/give/callback" element={<PaystackCallback />} />

        {/* ── Commuter rail ── */}
        <Route element={<RoleShell role="commuter" />}>
          <Route path="/ride" element={<RiderHome />} />
          <Route path="/trip/:tripId" element={<ActiveTrip />} />
          <Route path="/ride/searching/:rideId" element={<RideSearching />} />
          <Route path="/ride/emergency-scan/:rideId" element={<EmergencyGrantScan />} />
          <Route path="/wallet" element={<WalletPage />} />
        </Route>

        {/* ── Driver rail ── */}
        <Route element={<RoleShell role="driver" />}>
          <Route path="/drive" element={<DriverHome />} />
          <Route path="/drive/apply" element={<DriverApply />} />
        </Route>

        {/* ── Shared ── */}
        <Route element={<SharedRoleShell />}>
          <Route path="/account" element={<AccountPage />} />
          <Route path="/account/verify-email" element={<EmailVerify />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/support" element={<RecipientStatus />} />
          <Route path="/support/status" element={<RecipientStatus />} />
          <Route path="/support/apply" element={<RecipientApply />} />
          <Route path="/support/bank" element={<RecipientBank />} />
          <Route path="/wings" element={<WingsPage />} />
          <Route path="/kyc" element={<KYCFlow />} />
          <Route path="/feed" element={<FeedHome />} />
          <Route path="/feed/compose" element={<PostComposer />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/profile/:userId" element={<ProfilePage />} />
          <Route path="/ambassador" element={<AmbassadorDashboard />} />
          <Route path="/give/sponsor" element={<SponsorSetup />} />
          <Route path="/circle" element={<CirclePurchase />} />
          <Route path="/circles/create" element={<CircleCreate />} />
          <Route path="/circles/join/:token" element={<CircleJoin />} />
          <Route path="/ads" element={<AdvertiserPortal />} />
        </Route>

        {/* ── Admin console ── */}
        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/pricing" element={<PricingSettings />} />
          <Route path="/admin/drivers" element={<DriverQueue />} />
          <Route path="/admin/reports" element={<ReportQueue />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
