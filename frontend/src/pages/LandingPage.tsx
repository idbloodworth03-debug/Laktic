import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Zap, X } from 'lucide-react';

// ── Scroll-triggered fade-in ──────────────────────────────────────────────────

function useFadeIn(delay = 0) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.12 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return {
    ref,
    style: {
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(28px)',
      transition: `opacity 0.65s ease ${delay}ms, transform 0.65s ease ${delay}ms`,
    } as React.CSSProperties,
  };
}

// ── Readiness ring ────────────────────────────────────────────────────────────

function ReadinessRing({ score = 85 }: { score?: number }) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <svg width="88" height="88" viewBox="0 0 88 88">
      <circle cx="44" cy="44" r={r} fill="none" stroke="rgba(0,229,160,0.15)" strokeWidth="5" />
      <circle cx="44" cy="44" r={r} fill="none" stroke="#00E5A0" strokeWidth="5"
        strokeDasharray={`${circ}`} strokeDashoffset={`${offset}`}
        strokeLinecap="round" transform="rotate(-90 44 44)" />
      <text x="44" y="50" textAnchor="middle" fill="white" fontSize="20" fontWeight="700"
        fontFamily="DM Sans, sans-serif">{score}</text>
    </svg>
  );
}

// ── Mock dashboard card ───────────────────────────────────────────────────────

function DashboardCard() {
  return (
    <div className="lk-hero-card" style={{
      background: 'rgba(16,16,16,0.97)',
      border: '1px solid rgba(0,229,160,0.18)',
      borderRadius: '18px',
      padding: '22px',
      width: '300px',
      boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,229,160,0.06), inset 0 1px 0 rgba(255,255,255,0.04)',
      animation: 'lk-float 5s ease-in-out infinite',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Athlete Dashboard
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00E5A0', animation: 'lk-blink 2s ease-in-out infinite' }} />
          <span style={{ fontSize: '10px', color: '#00E5A0', fontWeight: 700, letterSpacing: '0.06em' }}>LIVE</span>
        </div>
      </div>

      {/* Athlete */}
      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'white', letterSpacing: '-0.01em' }}>Sarah Kim</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>5K Specialist · Westview XC</div>
      </div>

      {/* Readiness + today */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '18px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
          <ReadinessRing score={85} />
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Readiness</span>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '10px', color: '#00E5A0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>Today's Plan</div>
          <div style={{ fontSize: '14px', fontWeight: 700, color: 'white', lineHeight: 1.3 }}>8mi Easy Run</div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>Zone 2 · 7:45/mi</div>
          <div style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px', background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.2)', borderRadius: '6px' }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#00E5A0' }} />
            <span style={{ fontSize: '11px', color: '#00E5A0', fontWeight: 600 }}>Good to train</span>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', marginBottom: '14px' }} />

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
        {[
          { label: 'Recovery', value: '92%', note: 'Excellent' },
          { label: 'Week Miles', value: '31', note: 'On Track' },
          { label: 'Streak', value: '12d', note: 'Active' },
        ].map((s, i) => (
          <div key={s.label} style={{ borderRight: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none', paddingRight: i < 2 ? '10px' : '0', paddingLeft: i > 0 ? '10px' : '0' }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '3px' }}>{s.label}</div>
            <div style={{ fontSize: '16px', fontWeight: 700, color: 'white', fontFamily: "'DM Mono', monospace", letterSpacing: '-0.02em' }}>{s.value}</div>
            <div style={{ fontSize: '10px', color: '#00E5A0', marginTop: '1px' }}>{s.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Role selector modal ───────────────────────────────────────────────────────

function RoleSelectorModal({ onClose }: { onClose: () => void }) {
  // Close on Escape key
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
      onClick={onClose}
    >
      <div
        style={{ position: 'relative', background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '20px', padding: 'clamp(28px, 4vw, 48px)', maxWidth: '640px', width: '100%', boxShadow: '0 40px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.05)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{ position: 'absolute', top: '16px', right: '16px', width: '32px', height: '32px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'rgba(255,255,255,0.5)', transition: 'all 0.2s' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = 'white'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)'; }}
        >
          <X size={15} />
        </button>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h2 style={{ fontSize: 'clamp(22px, 3vw, 30px)', fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: 'white', letterSpacing: '-0.025em', marginBottom: '8px' }}>
            Who are you joining as?
          </h2>
          <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.44)', lineHeight: 1.5 }}>
            Choose your role to get started — you can always add the other later.
          </p>
        </div>

        {/* Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          {/* Coach card */}
          <Link
            to="/coach/signup"
            onClick={onClose}
            style={{ display: 'block', padding: '28px 24px', background: 'rgba(0,229,160,0.04)', border: '1px solid rgba(0,229,160,0.18)', borderRadius: '16px', textDecoration: 'none', transition: 'all 0.22s', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,229,160,0.09)'; e.currentTarget.style.borderColor = 'rgba(0,229,160,0.45)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(0,229,160,0.12)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,229,160,0.04)'; e.currentTarget.style.borderColor = 'rgba(0,229,160,0.18)'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
          >
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(0,229,160,0.12)', border: '1px solid rgba(0,229,160,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '18px' }}>
              <Users size={22} color="#00E5A0" />
            </div>
            <div style={{ fontSize: '19px', fontWeight: 700, color: 'white', letterSpacing: '-0.02em', marginBottom: '8px', fontFamily: "'DM Sans', sans-serif" }}>I'm a Coach</div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.48)', lineHeight: 1.6, margin: '0 0 20px' }}>
              Set up your team and coaching bot. Coach every athlete at scale.
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#00E5A0' }}>
              Get started <span style={{ fontSize: '16px' }}>→</span>
            </div>
          </Link>

          {/* Athlete card */}
          <Link
            to="/athlete/signup"
            onClick={onClose}
            style={{ display: 'block', padding: '28px 24px', background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.18)', borderRadius: '16px', textDecoration: 'none', transition: 'all 0.22s', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.09)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.45)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(139,92,246,0.12)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(139,92,246,0.04)'; e.currentTarget.style.borderColor = 'rgba(139,92,246,0.18)'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
          >
            <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '18px' }}>
              <Zap size={22} color="#a78bfa" />
            </div>
            <div style={{ fontSize: '19px', fontWeight: 700, color: 'white', letterSpacing: '-0.02em', marginBottom: '8px', fontFamily: "'DM Sans', sans-serif" }}>I'm an Athlete</div>
            <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.48)', lineHeight: 1.6, margin: '0 0 20px' }}>
              Join a team and get your personalized training plan.
            </p>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: '#a78bfa' }}>
              Get started <span style={{ fontSize: '16px' }}>→</span>
            </div>
          </Link>
        </div>

        <p style={{ textAlign: 'center', marginTop: '20px', fontSize: '13px', color: 'rgba(255,255,255,0.3)' }}>
          Already have an account?{' '}
          <Link to="/login" onClick={onClose} style={{ color: '#00E5A0', textDecoration: 'none', fontWeight: 500 }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}

// ── Navbar ────────────────────────────────────────────────────────────────────

function Navbar({ onOpenModal }: { onOpenModal: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 clamp(16px, 4vw, 40px)',
      background: scrolled ? 'rgba(10,10,10,0.88)' : 'transparent',
      backdropFilter: scrolled ? 'blur(20px)' : 'none',
      WebkitBackdropFilter: scrolled ? 'blur(20px)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(255,255,255,0.07)' : '1px solid transparent',
      transition: 'background 0.35s ease, border-color 0.35s ease',
    }}>
      <Link to="/" style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '18px', color: '#00E5A0', textDecoration: 'none', letterSpacing: '-0.02em', flexShrink: 0 }}>
        Laktic
      </Link>

      <div className="lk-nav-links" style={{ display: 'flex', gap: '36px', position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
        {[{ label: 'For Coaches', href: '#coaches' }, { label: 'For Athletes', href: '#athletes' }].map(l => (
          <a key={l.label} href={l.href}
            style={{ fontSize: '14px', color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'white')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}
          >{l.label}</a>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
        <Link to="/login"
          style={{ fontSize: '14px', color: 'rgba(255,255,255,0.6)', textDecoration: 'none', fontWeight: 500, padding: '7px 14px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.12)', transition: 'all 0.2s' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'white'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
        >Sign In</Link>
        <button onClick={onOpenModal}
          style={{ fontSize: '14px', fontWeight: 600, color: '#000', background: '#00E5A0', padding: '7px 16px', borderRadius: '8px', transition: 'background 0.2s', border: 'none', cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#00cc8f')}
          onMouseLeave={e => (e.currentTarget.style.background = '#00E5A0')}
        >Get Started Free</button>
      </div>
    </nav>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero({ onOpenModal }: { onOpenModal: () => void }) {
  return (
    <section id="coaches" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', position: 'relative', overflow: 'hidden', paddingTop: '60px' }}>
      {/* Grid bg */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(0,229,160,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,160,1) 1px, transparent 1px)',
        backgroundSize: '54px 54px', opacity: 0.035,
      }} />
      {/* Glow */}
      <div style={{ position: 'absolute', top: '-80px', right: '10%', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(0,229,160,0.09) 0%, transparent 68%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '10%', left: '-5%', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(0,229,160,0.05) 0%, transparent 68%)', pointerEvents: 'none' }} />

      <div className="lk-container lk-hero-grid" style={{ maxWidth: '1200px', margin: '0 auto', padding: '64px clamp(16px, 4vw, 40px)', width: '100%', display: 'grid', gridTemplateColumns: '1fr auto', gap: '64px', alignItems: 'center' }}>
        {/* Left */}
        <div>
          {/* Pill */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '5px 14px', borderRadius: '100px', background: 'rgba(0,229,160,0.07)', border: '1px solid rgba(0,229,160,0.22)', marginBottom: '30px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00E5A0', animation: 'lk-blink 2s ease-in-out infinite' }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#00E5A0', letterSpacing: '0.02em' }}>Now in early access</span>
          </div>

          <h1 style={{ fontSize: 'clamp(38px, 5.2vw, 64px)', fontFamily: "'DM Sans', sans-serif", fontWeight: 700, lineHeight: 1.06, color: 'white', marginBottom: '22px', letterSpacing: '-0.025em' }}>
            Your athletes deserve<br />
            <span style={{ color: '#00E5A0' }}>a coach that never sleeps</span>
          </h1>

          <p style={{ fontSize: 'clamp(16px, 1.6vw, 20px)', color: 'rgba(255,255,255,0.52)', lineHeight: 1.68, marginBottom: '36px', maxWidth: '560px' }}>
            Laktic gives every athlete on your roster a personalized training plan, real-time coaching, and performance insights — automatically. You set the philosophy. Laktic does the rest.
          </p>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button onClick={onOpenModal}
              style={{ display: 'inline-block', padding: '13px 28px', background: '#00E5A0', color: '#000', fontWeight: 700, fontSize: '15px', borderRadius: '10px', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#00cc8f'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,229,160,0.3)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#00E5A0'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
            >Get Started Free</button>
            <a href="#how-it-works"
              style={{ display: 'inline-block', padding: '13px 24px', background: 'transparent', color: 'rgba(255,255,255,0.75)', fontWeight: 600, fontSize: '15px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.16)', textDecoration: 'none', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.36)'; e.currentTarget.style.color = 'white'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; }}
            >See How It Works</a>
          </div>

          <p style={{ marginTop: '18px', fontSize: '13px', color: 'rgba(255,255,255,0.28)' }}>Free to start · No credit card required</p>
        </div>

        {/* Right — floating card */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <DashboardCard />
        </div>
      </div>
    </section>
  );
}

// ── Social proof bar ──────────────────────────────────────────────────────────

function SocialProof() {
  const fade = useFadeIn();
  const STATS = [
    { value: '2,400+', label: 'Athletes Coached' },
    { value: '94%', label: 'Plan Completion Rate' },
    { value: '3 min', label: 'Avg Plan Generation' },
    { value: '47+', label: 'Sports & Events' },
  ];
  return (
    <div ref={fade.ref} style={{ ...fade.style, borderTop: '1px solid rgba(255,255,255,0.07)', borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.025)' }}>
      <div className="lk-stats-grid" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 clamp(16px, 4vw, 40px)', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {STATS.map((s, i) => (
          <div key={s.label} style={{ padding: '36px 20px', textAlign: 'center', borderRight: i < 3 ? '1px solid rgba(255,255,255,0.07)' : 'none' }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 'clamp(26px, 3vw, 42px)', fontWeight: 700, color: '#00E5A0', letterSpacing: '-0.03em', marginBottom: '6px' }}>{s.value}</div>
            <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.38)', fontWeight: 500 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Pain section ──────────────────────────────────────────────────────────────

const PAIN_POINTS = [
  "You write the same generic plan for everyone because there's no time for 40 individual programs.",
  "Your best athletes plateau because they need more than you can give in a 2-hour practice.",
  "You lose sleep wondering if athlete #23 is overtraining or if athlete #7 is ready for Saturday's race.",
];

function PainSection() {
  const fade = useFadeIn();
  return (
    <section style={{ padding: 'clamp(64px, 8vw, 110px) clamp(16px, 4vw, 40px)' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div ref={fade.ref} style={{ ...fade.style, textAlign: 'center', marginBottom: '52px' }}>
          <h2 style={{ fontSize: 'clamp(28px, 3.8vw, 52px)', fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: 'white', marginBottom: '14px', letterSpacing: '-0.025em', lineHeight: 1.1 }}>
            One coach. Forty athletes.<br />Not enough hours.
          </h2>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.38)', maxWidth: '440px', margin: '0 auto' }}>The math doesn't work. It never has.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '44px' }}>
          {PAIN_POINTS.map((text, i) => {
            const f = useFadeIn(i * 110); // eslint-disable-line react-hooks/rules-of-hooks
            return (
              <div key={i} ref={f.ref} style={{ ...f.style, padding: '26px 24px 26px 22px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: '3px solid rgba(239,68,68,0.55)', borderRadius: '12px' }}>
                <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, margin: 0 }}>"{text}"</p>
              </div>
            );
          })}
        </div>

        <p style={{ textAlign: 'center', color: '#00E5A0', fontSize: '17px', fontWeight: 600 }}>
          Sound familiar? You're not failing your athletes. You're just one person.
        </p>
      </div>
    </section>
  );
}

// ── Solution section ──────────────────────────────────────────────────────────

const FEATURES = [
  { title: 'Your Philosophy, Scaled', desc: "Upload your training approach once. Laktic applies it to every athlete with the precision of a 1-on-1 session." },
  { title: 'Plans That Adapt', desc: "Training plans that adjust in real time based on each athlete's performance, recovery, and race calendar." },
  { title: 'Always On', desc: "Athletes get coaching responses, plan updates, and performance insights at 2am before a race. You sleep. Laktic works." },
];

function SolutionSection() {
  const fade = useFadeIn();
  return (
    <section style={{ padding: 'clamp(64px, 8vw, 110px) clamp(16px, 4vw, 40px)', background: 'rgba(255,255,255,0.018)' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div ref={fade.ref} style={{ ...fade.style, textAlign: 'center', marginBottom: '56px' }}>
          <h2 style={{ fontSize: 'clamp(28px, 3.8vw, 52px)', fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: 'white', marginBottom: '16px', letterSpacing: '-0.025em', lineHeight: 1.1 }}>
            What if every athlete<br />had their own coach?
          </h2>
          <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.45)', maxWidth: '560px', margin: '0 auto', lineHeight: 1.65 }}>
            Laktic learns your coaching philosophy and applies it to every athlete — individually, automatically, 24/7.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
          {FEATURES.map((f, i) => {
            const fade2 = useFadeIn(i * 110); // eslint-disable-line react-hooks/rules-of-hooks
            return (
              <div key={f.title} ref={fade2.ref} style={{ ...fade2.style, padding: '32px', background: 'rgba(0,229,160,0.04)', border: '1px solid rgba(0,229,160,0.12)', borderRadius: '16px', transition: `${fade2.style.transition}, border-color 0.25s` }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(0,229,160,0.32)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(0,229,160,0.12)')}
              >
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
                  <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: '#00E5A0', opacity: 0.85 }} />
                </div>
                <h3 style={{ fontSize: '18px', fontWeight: 700, color: 'white', marginBottom: '10px', letterSpacing: '-0.01em' }}>{f.title}</h3>
                <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.48)', lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── How it works ──────────────────────────────────────────────────────────────

const HOW_STEPS = [
  { n: 1, title: 'Build Your Bot', desc: 'Upload your training philosophy, workouts, and coaching style. Takes about 30 minutes.' },
  { n: 2, title: 'Invite Your Athletes', desc: 'Share your team invite link. Athletes connect their fitness data and get their personalized plan instantly.' },
  { n: 3, title: 'Coach at Scale', desc: 'Monitor your entire roster from one dashboard. Get alerts when athletes need attention. Let Laktic handle the rest.' },
];

function HowItWorksSection() {
  const fade = useFadeIn();
  return (
    <section id="how-it-works" style={{ padding: 'clamp(64px, 8vw, 110px) clamp(16px, 4vw, 40px)' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div ref={fade.ref} style={{ ...fade.style, textAlign: 'center', marginBottom: '64px' }}>
          <h2 style={{ fontSize: 'clamp(28px, 3.8vw, 52px)', fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: 'white', marginBottom: '12px', letterSpacing: '-0.025em', lineHeight: 1.1 }}>
            Set it up in an afternoon.<br />Coach better forever.
          </h2>
          <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.38)' }}>Three steps to give every athlete their best season.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '48px 40px' }}>
          {HOW_STEPS.map((s, i) => {
            const f = useFadeIn(i * 120); // eslint-disable-line react-hooks/rules-of-hooks
            return (
              <div key={s.n} ref={f.ref} style={{ ...f.style }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 'clamp(56px, 7vw, 88px)', fontWeight: 700, color: 'rgba(0,229,160,0.13)', lineHeight: 1, marginBottom: '10px', letterSpacing: '-0.05em' }}>
                  {String(s.n).padStart(2, '0')}
                </div>
                <h3 style={{ fontSize: '20px', fontWeight: 700, color: 'white', marginBottom: '10px', letterSpacing: '-0.01em' }}>{s.title}</h3>
                <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.48)', lineHeight: 1.7, margin: 0 }}>{s.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Athlete section ───────────────────────────────────────────────────────────

const ATHLETE_BENEFITS = [
  { title: 'A plan that knows your schedule', desc: 'Race calendar, recovery days, and peak timing all built in automatically.' },
  { title: 'Coaching available 24/7', desc: 'Ask your coach anything, anytime. Get answers in seconds, not days.' },
  { title: 'Know before you train', desc: 'Your daily readiness score tells you exactly how hard to push today based on your recovery data.' },
];

function AthleteSection() {
  const fade = useFadeIn();
  return (
    <section id="athletes" style={{ padding: 'clamp(64px, 8vw, 110px) clamp(16px, 4vw, 40px)', background: 'rgba(255,255,255,0.022)' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div ref={fade.ref} style={{ ...fade.style, textAlign: 'center', marginBottom: '52px' }}>
          <div style={{ display: 'inline-block', padding: '4px 14px', background: 'rgba(0,229,160,0.07)', border: '1px solid rgba(0,229,160,0.18)', borderRadius: '100px', marginBottom: '20px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#00E5A0', textTransform: 'uppercase', letterSpacing: '0.1em' }}>For Athletes</span>
          </div>
          <h2 style={{ fontSize: 'clamp(28px, 3.8vw, 52px)', fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: 'white', marginBottom: '16px', letterSpacing: '-0.025em', lineHeight: 1.1 }}>
            For athletes who want more<br />than a generic plan
          </h2>
          <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.42)', maxWidth: '560px', margin: '0 auto', lineHeight: 1.65 }}>
            Join a coached team or connect with an elite coach from our marketplace. Get a plan built for you — your pace, your races, your life.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '16px', marginBottom: '40px' }}>
          {ATHLETE_BENEFITS.map((b, i) => {
            const f = useFadeIn(i * 100); // eslint-disable-line react-hooks/rules-of-hooks
            return (
              <div key={b.title} ref={f.ref} style={{ ...f.style, padding: '28px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px', transition: `${f.style.transition}, border-color 0.2s` }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.18)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)')}
              >
                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#00E5A0', marginBottom: '18px' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'white', marginBottom: '8px', letterSpacing: '-0.01em' }}>{b.title}</h3>
                <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.44)', lineHeight: 1.7, margin: 0 }}>{b.desc}</p>
              </div>
            );
          })}
        </div>

        <div style={{ textAlign: 'center' }}>
          <Link to="/register/athlete"
            style={{ display: 'inline-block', padding: '12px 28px', background: 'transparent', color: '#00E5A0', fontWeight: 600, fontSize: '15px', borderRadius: '10px', border: '1px solid rgba(0,229,160,0.32)', textDecoration: 'none', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,229,160,0.08)'; e.currentTarget.style.borderColor = 'rgba(0,229,160,0.58)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(0,229,160,0.32)'; }}
          >Find Your Coach →</Link>
        </div>
      </div>
    </section>
  );
}

// ── Urgency section ───────────────────────────────────────────────────────────

function UrgencySection() {
  const fade = useFadeIn();
  return (
    <section style={{ padding: 'clamp(64px, 8vw, 110px) clamp(16px, 4vw, 40px)' }}>
      <div style={{ maxWidth: '780px', margin: '0 auto', textAlign: 'center' }}>
        <div ref={fade.ref} style={fade.style}>
          <div style={{ width: '48px', height: '2px', background: 'rgba(239,68,68,0.6)', margin: '0 auto 28px' }} />
          <h2 style={{ fontSize: 'clamp(26px, 3.5vw, 46px)', fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: 'white', marginBottom: '20px', letterSpacing: '-0.025em', lineHeight: 1.12 }}>
            The coaches who adopt this first<br />will be impossible to compete with
          </h2>
          <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.44)', lineHeight: 1.75, marginBottom: '36px', maxWidth: '620px', margin: '0 auto 36px' }}>
            When your rival program gives every athlete personalized attention at scale and you're still writing the same plan for everyone — you'll feel it in recruiting, in results, and in retention.
          </p>
          <Link to="/register/coach"
            style={{ display: 'inline-block', padding: '13px 30px', background: 'rgba(239,68,68,0.1)', color: 'rgba(252,165,165,1)', fontWeight: 600, fontSize: '15px', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.28)', textDecoration: 'none', transition: 'all 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.18)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')}
          >Don't get left behind — Start Free</Link>
        </div>
      </div>
    </section>
  );
}

// ── Final CTA ─────────────────────────────────────────────────────────────────

function FinalCTA({ onOpenModal }: { onOpenModal: () => void }) {
  const fade = useFadeIn();
  return (
    <section style={{ padding: 'clamp(72px, 9vw, 120px) clamp(16px, 4vw, 40px)', background: '#00E5A0' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto', textAlign: 'center' }}>
        <div ref={fade.ref} style={fade.style}>
          <h2 style={{ fontSize: 'clamp(30px, 4.5vw, 56px)', fontFamily: "'DM Sans', sans-serif", fontWeight: 800, color: '#000', marginBottom: '14px', letterSpacing: '-0.03em', lineHeight: 1.08 }}>
            Your athletes are waiting<br />for their best season.
          </h2>
          <p style={{ fontSize: '18px', color: 'rgba(0,60,44,0.75)', marginBottom: '34px', lineHeight: 1.55 }}>
            Start your free 14-day trial. No credit card required.
          </p>
          <button onClick={onOpenModal}
            style={{ display: 'inline-block', padding: '15px 36px', background: '#000', color: '#00E5A0', fontWeight: 700, fontSize: '16px', borderRadius: '10px', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#111'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#000'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
          >Get Started Free</button>
          <p style={{ marginTop: '16px', fontSize: '13px', color: 'rgba(0,60,44,0.55)' }}>Takes 30 minutes to set up. Cancel anytime.</p>
        </div>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

const FOOTER_LINKS = [
  { label: 'For Coaches', href: '#coaches', hash: true },
  { label: 'For Athletes', href: '#athletes', hash: true },
  { label: 'Marketplace', href: '/marketplace/plans', hash: false },
  { label: 'Sign In', href: '/login/coach', hash: false },
];

function Footer() {
  return (
    <footer style={{ padding: '28px clamp(16px, 4vw, 40px)', background: '#060606', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '17px', color: '#00E5A0' }}>Laktic</span>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
          {FOOTER_LINKS.map(l => (
            l.hash
              ? <a key={l.label} href={l.href} style={{ fontSize: '13px', color: 'rgba(255,255,255,0.32)', textDecoration: 'none', transition: 'color 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.32)')}
                >{l.label}</a>
              : <Link key={l.label} to={l.href} style={{ fontSize: '13px', color: 'rgba(255,255,255,0.32)', textDecoration: 'none', transition: 'color 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.32)')}
                >{l.label}</Link>
          ))}
        </div>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)', margin: 0 }}>© 2026 Laktic. Built for coaches who care.</p>
      </div>
    </footer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function LandingPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const openModal = () => setModalOpen(true);
  const closeModal = () => setModalOpen(false);

  useEffect(() => {
    document.title = "Laktic — Your athletes deserve a coach that never sleeps";
    return () => { document.title = "Laktic — Train Smarter"; };
  }, []);

  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif", color: 'white' }}>
      {modalOpen && <RoleSelectorModal onClose={closeModal} />}
      <style>{`
        @keyframes lk-float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          33% { transform: translateY(-9px) rotate(0.4deg); }
          66% { transform: translateY(-4px) rotate(-0.3deg); }
        }
        @keyframes lk-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        html { scroll-behavior: smooth; }
        * { box-sizing: border-box; }
        @media (max-width: 768px) {
          .lk-hero-grid { grid-template-columns: 1fr !important; gap: 40px !important; }
          .lk-hero-card { width: 100% !important; max-width: 300px !important; margin: 0 auto; animation: none !important; }
          .lk-nav-links { display: none !important; }
          .lk-stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .lk-stats-grid > div:nth-child(2) { border-right: none !important; }
          .lk-stats-grid > div:nth-child(3) { border-right: 1px solid rgba(255,255,255,0.07) !important; border-top: 1px solid rgba(255,255,255,0.07) !important; }
          .lk-stats-grid > div:nth-child(4) { border-top: 1px solid rgba(255,255,255,0.07) !important; }
        }
      `}</style>
      <Navbar onOpenModal={openModal} />
      <Hero onOpenModal={openModal} />
      <SocialProof />
      <PainSection />
      <SolutionSection />
      <HowItWorksSection />
      <AthleteSection />
      <UrgencySection />
      <FinalCTA onOpenModal={openModal} />
      <Footer />
    </div>
  );
}
