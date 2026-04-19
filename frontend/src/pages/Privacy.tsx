import { Link } from 'react-router-dom';

export function Privacy() {
  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)] text-[var(--color-text-primary)]">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-8">
          <Link to="/" className="text-sm text-[var(--color-accent)] hover:underline">← Back to Laktic</Link>
        </div>

        <h1 className="font-display text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-[var(--color-text-tertiary)] mb-10">Last updated: March 30, 2026</p>

        <div className="space-y-10 text-[var(--color-text-secondary)] leading-relaxed">

          <section>
            <h2 className="font-display text-xl font-bold text-[var(--color-text-primary)] mb-3">1. Overview</h2>
            <p>
              Laktic ("we", "us") is an AI-powered coaching platform for endurance athletes. This Privacy Policy
              explains what data we collect, how we use it, and your rights. By using Laktic you agree to these terms.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-[var(--color-text-primary)] mb-3">2. Data We Collect</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong className="text-[var(--color-text-primary)]">Account data:</strong> Name, email address, role (athlete or coach).</li>
              <li><strong className="text-[var(--color-text-primary)]">Athlete profile:</strong> Sport, fitness level, goal race, training preferences.</li>
              <li><strong className="text-[var(--color-text-primary)]">Training data:</strong> Season plan, weekly summaries, race results, and milestones.</li>
              <li><strong className="text-[var(--color-text-primary)]">Strava activity data</strong> (if you connect Strava — see Section 4).</li>
              <li><strong className="text-[var(--color-text-primary)]">Chat messages:</strong> Your conversations with your AI coach bot.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-[var(--color-text-primary)] mb-3">3. How We Use Your Data</h2>
            <p>We use your data solely to provide and improve the Laktic coaching service:</p>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>To generate personalised training plans and coaching recommendations.</li>
              <li>To power your AI coach conversations.</li>
              <li>To display your progress and statistics to you and your coach.</li>
              <li>To send transactional emails (plan ready, race reminders).</li>
            </ul>
            <p className="mt-3">
              We do <strong className="text-[var(--color-text-primary)]">not</strong> sell your data to third parties.
              We do <strong className="text-[var(--color-text-primary)]">not</strong> use your personal data or activity
              data to train AI models.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-[var(--color-text-primary)] mb-4">
              4. Strava Integration
            </h2>

            <div className="border border-[var(--color-border)] rounded-xl p-5 space-y-4 bg-[var(--color-bg-secondary)]">
              <div className="flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  <path d="M12 3l-4 7h3L7 17l8-9h-4L12 3z" fill="#FC5200" />
                </svg>
                <span className="font-semibold text-[var(--color-text-primary)]">Powered by Strava</span>
              </div>

              <div>
                <h3 className="font-semibold text-[var(--color-text-primary)] mb-1">What we collect from Strava</h3>
                <p>When you connect your Strava account, we import the following data for each activity:</p>
                <ul className="list-disc pl-5 space-y-1 mt-2 text-sm">
                  <li>Activity name, type (run, ride, etc.), and date</li>
                  <li>Distance and duration</li>
                  <li>Average and max pace / speed</li>
                  <li>Average and max heart rate</li>
                  <li>Total elevation gain</li>
                  <li>Average cadence and perceived exertion (where available)</li>
                </ul>
                <p className="mt-2 text-sm">
                  We do <strong className="text-[var(--color-text-primary)]">not</strong> collect GPS route data,
                  photos, or any other personal content from Strava.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-[var(--color-text-primary)] mb-1">How we use Strava data</h3>
                <p className="text-sm">
                  Strava activity data is used <strong className="text-[var(--color-text-primary)]">exclusively</strong> to
                  provide coaching recommendations — e.g., adjusting your training load, identifying recovery needs,
                  and improving your season plan. It is <strong className="text-[var(--color-text-primary)]">never</strong> used
                  to train AI models, never sold, and never shared with third parties.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-[var(--color-text-primary)] mb-1">Data retention</h3>
                <p className="text-sm">
                  Strava activity data is automatically and permanently deleted from Laktic's database after
                  7 days. A nightly automated job enforces this limit — no activity data is cached for longer
                  than 7 days. When you disconnect Strava, all remaining synced activity data is deleted immediately.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-[var(--color-text-primary)] mb-1">Revoking access</h3>
                <p className="text-sm">
                  You can disconnect Strava at any time from{' '}
                  <Link to="/athlete/settings" className="text-[var(--color-accent)] hover:underline">
                    Settings → Strava Integration → Disconnect
                  </Link>
                  . You can also revoke access directly in your{' '}
                  <a
                    href="https://www.strava.com/settings/apps"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-accent)] hover:underline"
                  >
                    Strava account settings
                  </a>
                  .
                </p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-[var(--color-text-primary)] mb-3">5. Data Storage & Security</h2>
            <p>
              Your data is stored in Supabase (PostgreSQL), hosted on AWS infrastructure in the United States.
              All data is encrypted in transit (TLS) and at rest. Access is protected by Row Level Security (RLS)
              policies — you can only read your own data.
            </p>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-[var(--color-text-primary)] mb-3">6. Your Rights</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong className="text-[var(--color-text-primary)]">Access:</strong> Download a copy of all your data from Settings → Data &amp; Privacy → Download my data.</li>
              <li><strong className="text-[var(--color-text-primary)]">Deletion:</strong> Delete your account and all associated data from Settings → Data &amp; Privacy → Delete account.</li>
              <li><strong className="text-[var(--color-text-primary)]">Strava data:</strong> Disconnect Strava at any time to immediately delete all Strava activity data.</li>
              <li><strong className="text-[var(--color-text-primary)]">Correction:</strong> Update your profile information from Settings at any time.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-display text-xl font-bold text-[var(--color-text-primary)] mb-3">7. Contact</h2>
            <p>
              Questions about this policy or your data? Email us at{' '}
              <a href="mailto:privacy@laktic.com" className="text-[var(--color-accent)] hover:underline">
                privacy@laktic.com
              </a>
              .
            </p>
          </section>

        </div>
      </div>
    </div>
  );
}
