import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy · Roster Loom',
  description: 'How Roster Loom collects, uses, and protects your data.',
};

const LAST_UPDATED = 'May 19, 2026';

export default function PrivacyPolicyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12 text-base leading-7">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated {LAST_UPDATED}</p>

      <p className="mt-6">
        Roster Loom (the &ldquo;Service&rdquo;) is a fantasy football scoreboard
        that aggregates teams you connect from Sleeper, Yahoo Fantasy, and
        Ottoneu. This policy explains what data we collect, how we use it, and
        the choices you have. It applies to both the web app at
        rosterloom.com and the Roster Loom mobile app.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">What we collect</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li>
          <strong>Account info:</strong> the email address and password you
          use to sign up. Passwords are stored hashed (bcrypt) by our auth
          provider Supabase; we never see them in plain text.
        </li>
        <li>
          <strong>Connected fantasy integrations:</strong> for each provider
          you link, we store the provider name, the account identifier the
          provider returns, and any access/refresh tokens needed to fetch
          your teams on your behalf. We only request the scopes required to
          read your leagues and matchups.
        </li>
        <li>
          <strong>League and team metadata:</strong> league names, team
          rosters, scores, and matchup information returned by the providers
          you&rsquo;ve connected. This is cached so we can render scoreboards
          quickly.
        </li>
        <li>
          <strong>Usage logs:</strong> standard server logs (HTTP request
          paths, response codes, timing) for debugging and reliability. We
          do not run third-party analytics or advertising trackers.
        </li>
      </ul>

      <h2 className="mt-10 text-2xl font-semibold">How we use it</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li>To render your aggregated scoreboard inside the Service.</li>
        <li>
          To refresh data with the connected fantasy providers when you open
          the app or request a refresh.
        </li>
        <li>
          To send you transactional emails related to your account (for
          example, password resets). We do not send marketing email.
        </li>
      </ul>

      <h2 className="mt-10 text-2xl font-semibold">How it&rsquo;s stored</h2>
      <p className="mt-3">
        All data lives in a Postgres database managed by Supabase. Connections
        between your devices, our servers, and Supabase are encrypted with TLS.
        We do not store payment information &mdash; the Service is currently
        free.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">Sharing</h2>
      <p className="mt-3">
        We do not sell or share your personal data with advertisers or data
        brokers. Your data flows only between:
      </p>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li>Your device and Roster Loom servers.</li>
        <li>Roster Loom servers and Supabase (database/auth).</li>
        <li>
          Roster Loom servers and the fantasy providers you&rsquo;ve connected
          (Sleeper, Yahoo, Ottoneu), in order to fetch your own data.
        </li>
      </ul>

      <h2 className="mt-10 text-2xl font-semibold">Your choices</h2>
      <ul className="mt-3 list-disc space-y-2 pl-6">
        <li>
          <strong>Disconnect a provider:</strong> remove any integration from
          the Integrations page; we delete the corresponding tokens.
        </li>
        <li>
          <strong>Delete your account:</strong> email the address below and
          we&rsquo;ll delete your account and all associated data within 30
          days.
        </li>
        <li>
          <strong>Access a copy of your data:</strong> email the address below
          and we&rsquo;ll provide an export.
        </li>
      </ul>

      <h2 className="mt-10 text-2xl font-semibold">Children</h2>
      <p className="mt-3">
        Roster Loom is not directed at children under 13 and we do not
        knowingly collect data from them. If you believe we have collected
        such data, contact us and we will delete it.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">Changes to this policy</h2>
      <p className="mt-3">
        We may update this policy as the Service evolves. Material changes
        will be reflected in the &ldquo;Last updated&rdquo; date at the top.
      </p>

      <h2 className="mt-10 text-2xl font-semibold">Contact</h2>
      <p className="mt-3">
        Questions, deletion requests, or data-export requests:{' '}
        <a
          href="mailto:support@rosterloom.com"
          className="text-primary underline">
          support@rosterloom.com
        </a>
        .
      </p>
    </main>
  );
}
