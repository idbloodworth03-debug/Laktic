import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { Button, Input, Alert } from '../components/ui';

type PlanKey = 'individual' | 'team' | 'enterprise';

const PLANS = [
  {
    key: 'individual' as PlanKey,
    name: 'Individual Coach',
    price: '$49',
    period: '/month',
    annual: '$490/year',
    description: 'Perfect for coaches training up to 20 athletes individually.',
    features: [
      'Up to 20 athletes',
      'AI coaching bot (GPT-4o)',
      'Season plan generation',
      'Injury risk monitoring',
      'Race gameplans',
      'Coach weekly digest',
      'Marketplace listing',
    ],
    cta: 'Start Free Trial',
    ctaLink: '/register/coach',
    highlight: false,
  },
  {
    key: 'team' as PlanKey,
    name: 'Team License',
    price: '$99',
    period: '/month',
    annual: '$999/year',
    description: 'For school programs, running clubs, and competitive teams — unlimited athletes.',
    features: [
      'Unlimited athletes',
      'Everything in Individual',
      'Team analytics dashboard',
      'No seat limit',
      'School/Club Coach badge',
      'Priority support',
      'Bulk athlete onboarding',
    ],
    cta: 'Get Team License',
    ctaLink: '/register/coach?plan=team',
    highlight: true,
    badge: 'Most Popular for Schools',
  },
  {
    key: 'enterprise' as PlanKey,
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    annual: 'Volume pricing',
    description: 'For athletic departments, multi-team organizations, and federations.',
    features: [
      'Multiple coaches & teams',
      'Everything in Team',
      'Custom integrations',
      'SLA & dedicated support',
      'Custom AI training',
      'White-label options',
      'Annual contract',
    ],
    cta: 'Contact Sales',
    ctaLink: '#contact-sales',
    highlight: false,
  },
] as const;

function ContactSalesForm() {
  const [form, setForm] = useState({
    name: '', email: '', organization: '',
    team_count: '', athlete_count: '', message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const submit = async () => {
    if (!form.name || !form.email || !form.organization) {
      setAlert({ type: 'error', message: 'Name, email, and organization are required.' });
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch('/api/contact-sales', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          organization: form.organization,
          team_count: form.team_count ? parseInt(form.team_count) : undefined,
          athlete_count: form.athlete_count ? parseInt(form.athlete_count) : undefined,
          message: form.message || undefined,
        }),
      });
      setAlert({ type: 'success', message: "Thanks! We'll be in touch within 1 business day." });
      setForm({ name: '', email: '', organization: '', team_count: '', athlete_count: '', message: '' });
    } catch (e: any) {
      setAlert({ type: 'error', message: e.message || 'Failed to submit' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div id="contact-sales" className="max-w-lg mx-auto">
      <h2 className="font-display text-2xl font-bold text-center mb-2">Contact Sales</h2>
      <p className="text-sm text-[var(--muted)] text-center mb-6">
        For 10+ team organizations, athletics departments, and national federations.
      </p>

      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Your Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jane Smith" />
          <Input label="Email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="jane@university.edu" />
        </div>
        <Input label="Organization" value={form.organization} onChange={e => setForm(f => ({ ...f, organization: e.target.value }))} placeholder="State University Athletics" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Number of Teams" type="number" value={form.team_count} onChange={e => setForm(f => ({ ...f, team_count: e.target.value }))} placeholder="e.g. 12" />
          <Input label="Total Athletes" type="number" value={form.athlete_count} onChange={e => setForm(f => ({ ...f, athlete_count: e.target.value }))} placeholder="e.g. 240" />
        </div>
        <div>
          <label className="text-sm font-medium text-[var(--muted)] block mb-1.5">Message (optional)</label>
          <textarea
            value={form.message}
            onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
            placeholder="Tell us about your program..."
            rows={3}
            className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm outline-none focus:border-brand-500 resize-none transition-colors"
          />
        </div>
        <Button variant="primary" size="lg" onClick={submit} loading={submitting} className="w-full">
          Send Inquiry
        </Button>
      </div>
    </div>
  );
}

export function PricingPage() {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* Navbar */}
      <nav className="border-b border-[var(--border)] px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <Link to="/" className="font-display font-black text-xl text-brand-400 tracking-tighter">LAKTIC</Link>
        <div className="flex items-center gap-3">
          <Link to="/login/coach" className="text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors">Sign In</Link>
          <Link to="/register/coach" className="text-sm bg-brand-600 hover:bg-brand-500 text-white px-4 py-1.5 rounded-lg transition-colors font-medium">Start Free Trial</Link>
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="text-center mb-14 fade-up">
          <h1 className="font-display text-4xl font-black mb-3">Simple, transparent pricing</h1>
          <p className="text-[var(--muted)] text-lg">Start free for 14 days. No credit card required.</p>
        </div>

        {/* Plan cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-20 fade-up-1">
          {PLANS.map(plan => (
            <div
              key={plan.key}
              className={[
                'rounded-2xl border p-6 flex flex-col',
                plan.highlight
                  ? 'bg-brand-950/30 border-brand-700/50 shadow-glow-sm relative'
                  : 'bg-[var(--surface)] border-[var(--border)]',
              ].join(' ')}
            >
              {plan.highlight && 'badge' in plan && plan.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 bg-brand-600 text-white text-xs font-bold rounded-full whitespace-nowrap">
                  {plan.badge}
                </div>
              )}

              <div className="mb-5">
                <h3 className="font-display font-bold text-lg mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-3xl font-black font-display text-[var(--text)]">{plan.price}</span>
                  {plan.period && <span className="text-[var(--muted)] text-sm">{plan.period}</span>}
                </div>
                <p className="text-xs text-[var(--muted)]">{plan.annual}</p>
                <p className="text-sm text-[var(--muted)] mt-3 leading-relaxed">{plan.description}</p>
              </div>

              <ul className="flex flex-col gap-2 mb-6 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <span className="text-brand-500 font-bold mt-0.5 shrink-0">+</span>
                    <span className="text-[var(--text2)]">{f}</span>
                  </li>
                ))}
              </ul>

              {plan.ctaLink.startsWith('#') ? (
                <a
                  href={plan.ctaLink}
                  className={[
                    'block text-center py-2.5 rounded-xl font-semibold text-sm transition-colors',
                    plan.highlight
                      ? 'bg-brand-600 hover:bg-brand-500 text-white'
                      : 'bg-[var(--surface2)] hover:bg-[var(--border)] text-[var(--text)]',
                  ].join(' ')}
                >
                  {plan.cta}
                </a>
              ) : (
                <Link
                  to={plan.ctaLink}
                  className={[
                    'block text-center py-2.5 rounded-xl font-semibold text-sm transition-colors',
                    plan.highlight
                      ? 'bg-brand-600 hover:bg-brand-500 text-white'
                      : 'bg-[var(--surface2)] hover:bg-[var(--border)] text-[var(--text)]',
                  ].join(' ')}
                >
                  {plan.cta}
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* Athlete pricing note */}
        <div className="text-center mb-16 py-6 border border-[var(--border)] rounded-2xl bg-[var(--surface)]">
          <h3 className="font-display font-bold text-lg mb-1">Athletes are always free</h3>
          <p className="text-sm text-[var(--muted)]">Athletes get a free account. They're invited by their coach or join through the marketplace.</p>
        </div>

        {/* Contact Sales section */}
        <ContactSalesForm />
      </div>
    </div>
  );
}
