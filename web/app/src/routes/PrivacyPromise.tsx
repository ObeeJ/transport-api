import { Link } from 'react-router'
import { motion } from 'motion/react'

// Bump this and the backend's service.PrivacyVersion together when the
// policy text changes materially. The version stored on each User lets us
// detect stale consent and prompt re-acceptance.
const VERSION = '2026-05-22'
const SUPPORT_EMAIL = 'ajayiobanijesu2000@gmail.com'

export function PrivacyPromise() {
  return (
    <div
      className="min-h-dvh"
      style={{
        background:
          'radial-gradient(at 15% 10%, rgba(27,42,78,0.06) 0, transparent 50%), radial-gradient(at 90% 90%, rgba(217,119,87,0.06) 0, transparent 50%), var(--color-paper)',
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="mx-auto max-w-[680px] px-6 py-12 sm:py-16"
      >
        <Link to="/" className="text-[20px] font-medium tracking-tight text-[var(--color-indigo)]">
          akin<span className="text-[var(--color-clay)]">.</span>
        </Link>

        <div className="mt-10">
          <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-[var(--color-clay)]">
            Privacy promise
          </div>
          <h1 className="mt-2 text-[36px] leading-[1.05] font-medium tracking-tight text-[var(--color-indigo)]">
            What we hold, and what<br/>we’ll never do with it.
          </h1>
          <p className="mt-4 text-[13px] text-[var(--color-stone)]">
            Plain language. No tracking pixels. No data sales. Version <span className="font-mono">{VERSION}</span>.
          </p>
        </div>

        <div className="mt-12 space-y-10 text-[14px] leading-[1.7] text-[var(--color-ink)]">

          <Section title="The short version">
            <p>
              Akin is a class-only transport fund and ride network. We collect the
              minimum needed to run it, store it in databases we operate, and
              never sell or rent your information to anyone. Your name and
              identity stay <em>inside the class</em> — recipients of help are
              represented to givers by an anonymous pseudonym only.
            </p>
          </Section>

          <Section title="What we collect">
            <List items={[
              <><strong>Account basics</strong> — first name, last name, email, Nigerian phone number. The phone is used only for SOS and account recovery; we don’t use it for marketing.</>,
              <><strong>Authentication</strong> — a hashed password (we never see the plain text) or, for stewards, a 6-digit code emailed to you. We store a signed session cookie in your browser.</>,
              <><strong>Activity</strong> — your deposits, rides booked, trips published as a driver, and ratings you give. This is what makes the dashboards work.</>,
              <><strong>Payments</strong> — when you donate, Paystack processes the card transaction. We see only what they tell us: amount, reference, success/failure. We never see your card number.</>,
              <><strong>Bank accounts</strong> — recipients’ payout bank details, encrypted at rest. Used only to send approved disbursements via Paystack’s Transfer API.</>,
              <><strong>Location</strong> — only when a driver actively shares GPS during an in-progress trip, to let riders see ETA. Discarded shortly after the trip ends.</>,
              <><strong>Logs</strong> — IP address and request ID on each API call, kept briefly for abuse prevention and debugging. Not used for behavioural profiling.</>,
            ]} />
          </Section>

          <Section title="Why we collect it">
            <p>Each piece of data above maps to a specific function:</p>
            <List items={[
              <>Email → sign-in, password resets, important account notices.</>,
              <>Phone → SOS escalation if you press the emergency button during a ride.</>,
              <>Deposits & ratings → so givers can see real impact, not painted numbers.</>,
              <>Bank → so approved recipients actually receive money.</>,
              <>Logs → catch abuse, investigate bugs, comply with payment processor rules.</>,
            ]} />
            <p>If we ever want to collect data for a <em>new</em> purpose, we’ll bump the policy version, re-prompt you, and require a fresh agreement.</p>
          </Section>

          <Section title="Who we share data with">
            <p>We use a small number of third parties. Each gets only the data they need for their job:</p>
            <List items={[
              <><strong>Paystack</strong> (payments) — sees card or transfer details. <a href="https://paystack.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[var(--color-indigo)] underline underline-offset-[3px]">Their policy</a>.</>,
              <><strong>Gmail SMTP</strong> (email delivery) — sees your email address and the email body we send.</>,
              <><strong>Railway, Neon, Vercel</strong> (hosting) — store our app, database, and frontend. They don’t use your data for anything else.</>,
            ]} />
            <p className="mt-4 text-[13px] text-[var(--color-stone)]">
              We do <strong>not</strong> use analytics SDKs, advertising trackers, session replay tools, or social-media pixels.
            </p>
          </Section>

          <Section title="What recipients see, what givers see">
            <p>
              When you apply to receive help, only stewards see your real identity
              while they review your case. Once approved, you become a
              pseudonymous ID to every other user. Givers see aggregate
              impact (total disbursed, anonymised stories) — never a real name.
              This is the “anonymous either way” we promise on the home page,
              and it’s a hard product rule.
            </p>
          </Section>

          <Section title="How long we keep it">
            <List items={[
              <>Account record → as long as your account exists; deleted within 30 days of you closing it.</>,
              <>Sessions → expire after 30 days of inactivity or on logout, whichever comes first.</>,
              <>Audit logs → 1 year, then purged. We keep these so we can investigate disputes.</>,
              <>GPS points → cleared a few hours after a trip ends.</>,
            ]} />
          </Section>

          <Section title="Your rights">
            <List items={[
              <><strong>See</strong> — every screen in the app is a view onto your own data. You can also email us for a full export.</>,
              <><strong>Correct</strong> — change your name, phone, or password from the Account page.</>,
              <><strong>Delete</strong> — email us. We’ll remove your record and disconnect old contributions from your identity, while keeping the financial total intact for transparency.</>,
              <><strong>Withdraw consent</strong> — if you no longer want us to hold your data, deleting your account is the right path.</>,
            ]} />
          </Section>

          <Section title="Security">
            <p>
              Passwords are stored hashed with bcrypt. Steward sign-in codes are
              short-lived (10 min) and stored as SHA-256 hashes. Sessions are
              opaque tokens, also hashed at rest. All traffic is HTTPS. We use
              SameSite cookies with the Partitioned (CHIPS) attribute to defend
              against cross-site abuse, and CSRF tokens on every state-changing
              request.
            </p>
            <p>
              If we ever suffer a breach affecting your data, we’ll tell you
              and the class admin within 72 hours of confirming it.
            </p>
          </Section>

          <Section title="Changes to this promise">
            <p>
              If we change anything that affects how we collect, use, or share
              your data, we’ll bump the version, show you the diff, and ask you
              to agree before continuing. We won’t silently expand what we do
              with what we already have.
            </p>
          </Section>

          <Section title="Contact">
            <p>
              For anything privacy-related — exports, deletion, questions, complaints — write to{' '}
              <a href={`mailto:${SUPPORT_EMAIL}?subject=Akin%20privacy%20question`} className="text-[var(--color-indigo)] underline underline-offset-[3px]">
                {SUPPORT_EMAIL}
              </a>.
            </p>
          </Section>
        </div>

        <div className="mt-16 pt-6 border-t border-[var(--color-hairline)] text-[11px] text-[var(--color-stone)]">
          <Link to="/" className="underline underline-offset-[3px]">← Back to akin</Link>
        </div>
      </motion.div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-[18px] font-medium tracking-tight text-[var(--color-indigo)] mb-3">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span aria-hidden className="text-[var(--color-clay)] mt-[2px] shrink-0">·</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}
