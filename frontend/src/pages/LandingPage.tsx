import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

// ── Scroll-triggered fade-in ──────────────────────────────────────────────────
function useFadeIn(delay = 0) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return {
    ref,
    style: {
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(22px)',
      transition: `opacity 0.65s ease ${delay}ms, transform 0.65s ease ${delay}ms`,
    } as React.CSSProperties,
  };
}

// ── Floating dashboard card ────────────────────────────────────────────────────
function DashboardCard() {
  return (
    <div style={{
      width: 296,
      background: 'rgba(14,14,14,0.97)',
      border: '1px solid rgba(0,229,160,0.15)',
      borderRadius: 20,
      padding: 22,
      boxShadow: '0 48px 96px rgba(0,0,0,0.75), 0 0 0 1px rgba(0,229,160,0.04)',
      animation: 'lk-float 6s ease-in-out infinite',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Today's Training
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00E5A0', animation: 'lk-blink 2s ease-in-out infinite' }} />
          <span style={{ fontSize: 9, color: '#00E5A0', fontWeight: 700, letterSpacing: '0.06em' }}>ON TRACK</span>
        </div>
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: '#fff', marginBottom: 2 }}>Jordan Mills</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Marathon · Week 6 of 16</div>
      </div>

      <div style={{ background: 'rgba(0,229,160,0.07)', border: '1px solid rgba(0,229,160,0.14)', borderRadius: 12, padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ fontSize: 9, color: '#00E5A0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Today</div>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>10mi Long Run</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Easy · 8:30–9:00/mi</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
        {[
          { l: 'Weekly', v: '28mi', n: '+12%' },
          { l: 'Streak', v: '9d',   n: 'days' },
          { l: 'Race',   v: '74d',  n: 'away' },
        ].map((s, i) => (
          <div key={s.l} style={{ borderRight: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none', paddingRight: i < 2 ? 10 : 0, paddingLeft: i > 0 ? 10 : 0 }}>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.22)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{s.l}</div>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 19, fontWeight: 600, color: '#fff', lineHeight: 1 }}>{s.v}</div>
            <div style={{ fontSize: 9, color: '#00E5A0', marginTop: 2 }}>{s.n}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Floating readiness card ────────────────────────────────────────────────────
function ReadinessCard() {
  const r = 20, circ = 2 * Math.PI * r;
  const offset = circ * (1 - 0.84);
  return (
    <div style={{
      width: 176,
      background: 'rgba(14,14,14,0.93)',
      border: '1px solid rgba(255,255,255,0.09)',
      borderRadius: 16,
      padding: '14px 16px',
      boxShadow: '0 24px 48px rgba(0,0,0,0.6)',
      animation: 'lk-float2 5s ease-in-out infinite',
      backdropFilter: 'blur(20px)',
    }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.28)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 10 }}>Readiness</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative', width: 48, height: 48, flexShrink: 0 }}>
          <svg width={48} height={48} viewBox="0 0 48 48">
            <circle cx={24} cy={24} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={5} />
            <circle cx={24} cy={24} r={r} fill="none" stroke="#00E5A0" strokeWidth={5}
              strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
              transform="rotate(-90 24 24)" />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, fontWeight: 600, color: '#00E5A0' }}>84</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#00E5A0', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Optimal</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>Good to push</div>
        </div>
      </div>
    </div>
  );
}

// ── Navbar ─────────────────────────────────────────────────────────────────────
function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 clamp(24px, 5vw, 64px)',
      background: scrolled ? 'rgba(8,8,8,0.9)' : 'transparent',
      backdropFilter: scrolled ? 'blur(24px)' : 'none',
      WebkitBackdropFilter: scrolled ? 'blur(24px)' : 'none',
      borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
      transition: 'all 0.3s ease',
    }}>
      <Link to="/" style={{ fontWeight: 800, fontSize: 17, color: '#00E5A0', textDecoration: 'none', letterSpacing: '-0.03em' }}>
        LAKTIC
      </Link>

      <div className="lk-nav-links" style={{ display: 'flex', gap: 36, position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
        {[{ label: 'How It Works', href: '#how-it-works' }, { label: 'Features', href: '#features' }].map(l => (
          <a key={l.label} href={l.href}
            style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontWeight: 500, transition: 'color 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
          >{l.label}</a>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Link to="/login/athlete" style={{
          fontSize: 14, color: 'rgba(255,255,255,0.6)', textDecoration: 'none',
          fontWeight: 500, padding: '7px 16px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)',
          transition: 'all 0.2s',
        }}
          onMouseEnter={e => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.28)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)'; }}
        >Sign In</Link>
        <Link to="/athlete/signup" style={{
          fontSize: 14, fontWeight: 700, color: '#000', background: '#00E5A0',
          padding: '8px 18px', borderRadius: 9, transition: 'all 0.2s', textDecoration: 'none',
        }}
          onMouseEnter={e => { e.currentTarget.style.background = '#00cc8f'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,229,160,0.28)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = '#00E5A0'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
        >Start Free</Link>
      </div>
    </nav>
  );
}

// ── Hero ───────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', position: 'relative', overflow: 'hidden', paddingTop: 64 }}>
      {/* Grid background */}
      <div className="landing-grid" style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(0,229,160,0.9) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,160,0.9) 1px, transparent 1px)',
        backgroundSize: '62px 62px', opacity: 0.022,
      }} />
      {/* Glow orbs */}
      <div style={{ position: 'absolute', top: '-15%', right: '0%', width: 800, height: 800, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(0,229,160,0.09) 0%, transparent 65%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '5%', left: '-5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(0,229,160,0.05) 0%, transparent 65%)', pointerEvents: 'none' }} />

      <div className="lk-hero-grid" style={{ maxWidth: 1240, margin: '0 auto', padding: '60px clamp(24px, 5vw, 64px)', width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 80, alignItems: 'center' }}>
        {/* Left */}
        <div className="lk-hero-left" style={{ animation: 'fadeUp 0.7s ease both' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '5px 14px', borderRadius: 100, background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.2)', marginBottom: 32 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00E5A0', animation: 'lk-blink 2s ease-in-out infinite' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#00E5A0' }}>Free to start · No credit card</span>
          </div>

          <h1 style={{ fontSize: 'clamp(52px, 6.5vw, 92px)', fontWeight: 800, lineHeight: 1.0, letterSpacing: '-0.04em', marginBottom: 24, color: '#fff' }}>
            A coach in<br />
            your pocket.<br />
            <span style={{ color: '#00E5A0' }}>Always.</span>
          </h1>

          <p style={{ fontSize: 'clamp(16px, 1.5vw, 18px)', color: 'rgba(255,255,255,0.48)', lineHeight: 1.72, maxWidth: 480, marginBottom: 42 }}>
            Personalized training plans, real-time adjustments, and race-day strategy — built around you, not a template.
          </p>

          <div className="lk-hero-btns" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link to="/athlete/signup" style={{
              display: 'inline-block', padding: '14px 32px', background: '#00E5A0', color: '#000',
              fontWeight: 700, fontSize: 15, borderRadius: 12, textDecoration: 'none', transition: 'all 0.2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = '#00cc8f'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 10px 28px rgba(0,229,160,0.28)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#00E5A0'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
            >Start Training Free</Link>
            <a href="#how-it-works" style={{
              display: 'inline-block', padding: '14px 28px', background: 'transparent',
              color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontSize: 15, borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.15)', textDecoration: 'none', transition: 'all 0.2s',
            }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.32)'; e.currentTarget.style.color = '#fff'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}
            >See How It Works</a>
          </div>
          <p style={{ marginTop: 16, fontSize: 12, color: 'rgba(255,255,255,0.22)' }}>Free · No credit card · Cancel anytime</p>
        </div>

        {/* Right — floating cards */}
        <div className="lk-hero-card-wrap" style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-end', animation: 'fadeUp 0.7s 0.15s ease both' }}>
          <DashboardCard />
          <ReadinessCard />
        </div>
      </div>
    </section>
  );
}

// ── Social proof strip ─────────────────────────────────────────────────────────
function StripSection() {
  return (
    <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '20px clamp(24px, 5vw, 64px)' }}>
      <div className="lk-stats-strip" style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', alignItems: 'center', gap: '16px 24px' }}>
        {[['GPT-4o', 'Powered by AI'], ['14 days', 'Adaptive window'], ['100%', 'Personalized plans'], ['Strava', 'Connected']].map(([val, lbl]) => (
          <div key={val} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 20, fontWeight: 600, color: '#00E5A0', letterSpacing: '-0.02em' }}>{val}</span>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>{lbl}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── How It Works ───────────────────────────────────────────────────────────────
const HOW_STEPS = [
  { n: '01', title: 'Tell us about yourself', desc: 'Answer a few questions about your goals, fitness, and schedule. Takes 3 minutes.' },
  { n: '02', title: 'Get your plan instantly', desc: 'A personalized training plan built around your PRs, schedule, and goal race.' },
  { n: '03', title: 'Train, chat, improve', desc: 'Your coach adapts your plan as you train. Ask anything, anytime.' },
];

function HowItWorksSection() {
  const fade = useFadeIn();
  return (
    <section id="how-it-works" style={{ padding: 'clamp(80px, 9vw, 120px) clamp(24px, 5vw, 64px)', background: 'rgba(255,255,255,0.016)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div ref={fade.ref} style={{ ...fade.style, textAlign: 'center', marginBottom: 72 }}>
          <h2 style={{ fontSize: 'clamp(34px, 4vw, 58px)', fontWeight: 800, letterSpacing: '-0.038em', marginBottom: 14, lineHeight: 1.06 }}>
            Up and running in minutes.
          </h2>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.35)' }}>Three steps to your best season yet.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '48px 60px' }}>
          {HOW_STEPS.map((s, i) => {
            const f = useFadeIn(i * 120); // eslint-disable-line react-hooks/rules-of-hooks
            return (
              <div key={s.n} ref={f.ref} style={f.style}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 'clamp(56px, 7vw, 88px)', fontWeight: 700, color: 'rgba(0,229,160,0.1)', lineHeight: 1, marginBottom: 14, letterSpacing: '-0.04em' }}>{s.n}</div>
                <h3 style={{ fontSize: 19, fontWeight: 700, marginBottom: 10, letterSpacing: '-0.015em' }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.44)', lineHeight: 1.72 }}>{s.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Features ───────────────────────────────────────────────────────────────────
const FEATURES = [
  { title: 'Personalized Plans',      desc: 'Built around your PRs, race calendar, and schedule. Adapts every week as you train.' },
  { title: 'Race Day Gameplan',        desc: 'Mile-by-mile pacing, nutrition timing, and weather-adjusted strategy.' },
  { title: '14-Day Coaching',          desc: 'Chat anytime. Your coach adapts your next two weeks without touching the rest of your season.' },
  { title: 'Progress Tracking',        desc: 'Pace trends, mileage streaks, and PR tracking — week over week.' },
  { title: 'Strava Connected',         desc: 'Your runs sync automatically. Your plan adapts based on what you actually did.' },
  { title: 'Recovery Intelligence',    desc: 'Know when to push and when to back off based on your training load.' },
];

function FeaturesSection() {
  const fade = useFadeIn();
  return (
    <section id="features" style={{ padding: 'clamp(80px, 9vw, 120px) clamp(24px, 5vw, 64px)' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div ref={fade.ref} style={{ ...fade.style, textAlign: 'center', marginBottom: 72 }}>
          <h2 style={{ fontSize: 'clamp(34px, 4vw, 58px)', fontWeight: 800, letterSpacing: '-0.038em', marginBottom: 14, lineHeight: 1.06 }}>
            Everything you need.<br /><span style={{ color: '#00E5A0' }}>Nothing you don't.</span>
          </h2>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.35)', maxWidth: 440, margin: '0 auto', lineHeight: 1.65 }}>
            One platform. Every tool a serious runner needs.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {FEATURES.map((f, i) => {
            const fade2 = useFadeIn(i * 70); // eslint-disable-line react-hooks/rules-of-hooks
            return (
              <div key={f.title} ref={fade2.ref} style={{
                ...fade2.style,
                padding: '22px 20px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 18,
                transition: `${fade2.style.transition}, border-color 0.2s, transform 0.2s, box-shadow 0.2s`,
              }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,229,160,0.04)'; e.currentTarget.style.borderColor = 'rgba(0,229,160,0.22)'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(0,0,0,0.3)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#00E5A0', marginBottom: 14, boxShadow: '0 0 12px rgba(0,229,160,0.5)' }} />
                <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, letterSpacing: '-0.01em' }}>{f.title}</h3>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.42)', lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Final CTA ──────────────────────────────────────────────────────────────────
function FinalCTA() {
  const fade = useFadeIn();
  return (
    <section style={{ padding: 'clamp(80px, 9vw, 120px) clamp(24px, 5vw, 64px)', background: '#00E5A0' }}>
      <div style={{ maxWidth: 600, margin: '0 auto', textAlign: 'center' }}>
        <div ref={fade.ref} style={fade.style}>
          <h2 style={{ fontSize: 'clamp(38px, 5vw, 64px)', fontWeight: 800, color: '#000', letterSpacing: '-0.04em', marginBottom: 14, lineHeight: 1.05 }}>
            Your best season<br />starts today.
          </h2>
          <p style={{ fontSize: 18, color: 'rgba(0,0,0,0.52)', marginBottom: 36, lineHeight: 1.55 }}>
            Join runners training smarter with Laktic.
          </p>
          <Link to="/athlete/signup" style={{
            display: 'inline-block', padding: '16px 44px', background: '#000', color: '#00E5A0',
            fontWeight: 700, fontSize: 16, borderRadius: 14, textDecoration: 'none', transition: 'all 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 14px 36px rgba(0,0,0,0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
          >Start Training Free</Link>
          <p style={{ marginTop: 14, fontSize: 12, color: 'rgba(0,0,0,0.38)' }}>Free · No credit card required</p>
        </div>
      </div>
    </section>
  );
}

// ── Footer ─────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ padding: '24px clamp(24px, 5vw, 64px)', background: '#060606', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
      <span style={{ fontWeight: 800, fontSize: 15, color: '#00E5A0', letterSpacing: '-0.02em' }}>LAKTIC</span>
      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        <Link to="/privacy" style={{ fontSize: 13, color: 'rgba(255,255,255,0.28)', textDecoration: 'none', transition: 'color 0.2s' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.28)')}
        >Privacy Policy</Link>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.18)' }}>© 2026 Laktic. All rights reserved.</span>
      </div>
    </footer>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export function LandingPage() {
  useEffect(() => {
    document.title = 'Laktic — A Coach In Your Pocket. Always.';
    return () => { document.title = 'Laktic'; };
  }, []);

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff' }}>
      <style>{`
        @keyframes lk-float  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes lk-float2 { 0%,100%{transform:translateY(0)} 50%{transform:translateY(8px)} }
        @keyframes lk-blink  { 0%,100%{opacity:1} 50%{opacity:.3} }
        @media (max-width: 768px) {
          .lk-hero-card-wrap { display: none !important; }
          .lk-nav-links { display: none !important; }
          .lk-hero-grid { grid-template-columns: 1fr !important; }
          .lk-hero-left { text-align: center; align-items: center; display: flex; flex-direction: column; }
          .lk-hero-left h1 { text-align: center; }
          .lk-hero-left p { text-align: center; margin-left: auto; margin-right: auto; }
          .lk-hero-left > div:first-child { align-self: center; }
          .lk-hero-btns { justify-content: center !important; }
          .lk-stats-strip { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
      <Navbar />
      <Hero />
      <StripSection />
      <HowItWorksSection />
      <FeaturesSection />
      <FinalCTA />
      <Footer />
    </div>
  );
}
