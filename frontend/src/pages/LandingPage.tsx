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

// ── Mock dashboard card ───────────────────────────────────────────────────────

function DashboardCard() {
  return (
    <div style={{
      background: 'rgba(16,16,16,0.97)',
      border: '1px solid rgba(0,229,160,0.18)',
      borderRadius: '18px',
      padding: '22px',
      width: '300px',
      boxShadow: '0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,229,160,0.06), inset 0 1px 0 rgba(255,255,255,0.04)',
      animation: 'lk-float 5s ease-in-out infinite',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Your Training
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00E5A0', animation: 'lk-blink 2s ease-in-out infinite' }} />
          <span style={{ fontSize: '10px', color: '#00E5A0', fontWeight: 700, letterSpacing: '0.06em' }}>ON TRACK</span>
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'white', letterSpacing: '-0.01em' }}>Jordan Mills</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>Marathon · Week 6 of 16</div>
      </div>

      <div style={{ marginBottom: '18px' }}>
        <div style={{ fontSize: '10px', color: '#00E5A0', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '5px' }}>Today's Plan</div>
        <div style={{ fontSize: '14px', fontWeight: 700, color: 'white', lineHeight: 1.3 }}>10mi Long Run</div>
        <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', marginTop: '2px' }}>Easy pace · 8:30–9:00/mi</div>
        <div style={{ marginTop: '8px', display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '3px 9px', background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.2)', borderRadius: '6px' }}>
          <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#00E5A0' }} />
          <span style={{ fontSize: '11px', color: '#00E5A0', fontWeight: 600 }}>Feeling good — go for it</span>
        </div>
      </div>

      <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', marginBottom: '14px' }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
        {[
          { label: 'This Week', value: '28mi', note: '+12%' },
          { label: 'Streak', value: '9d', note: 'Running' },
          { label: 'Goal Race', value: '74d', note: 'Away' },
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

// ── Navbar ────────────────────────────────────────────────────────────────────

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
        {[{ label: 'How It Works', href: '#how-it-works' }, { label: 'Features', href: '#features' }].map(l => (
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
        <Link to="/athlete/signup"
          style={{ fontSize: '14px', fontWeight: 600, color: '#000', background: '#00E5A0', padding: '7px 16px', borderRadius: '8px', transition: 'background 0.2s', textDecoration: 'none', display: 'inline-block' }}
          onMouseEnter={e => (e.currentTarget.style.background = '#00cc8f')}
          onMouseLeave={e => (e.currentTarget.style.background = '#00E5A0')}
        >Start Training Free</Link>
      </div>
    </nav>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', position: 'relative', overflow: 'hidden', paddingTop: '60px' }}>
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
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '5px 14px', borderRadius: '100px', background: 'rgba(0,229,160,0.07)', border: '1px solid rgba(0,229,160,0.22)', marginBottom: '30px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#00E5A0', animation: 'lk-blink 2s ease-in-out infinite' }} />
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#00E5A0', letterSpacing: '0.02em' }}>Free to start · No credit card required</span>
          </div>

          <h1 style={{ fontSize: 'clamp(38px, 5.2vw, 68px)', fontFamily: "'DM Sans', sans-serif", fontWeight: 700, lineHeight: 1.04, color: 'white', marginBottom: '22px', letterSpacing: '-0.03em' }}>
            A Coach In Your Pocket.<br />
            <span style={{ color: '#00E5A0' }}>Always.</span>
          </h1>

          <p style={{ fontSize: 'clamp(16px, 1.6vw, 20px)', color: 'rgba(255,255,255,0.52)', lineHeight: 1.68, marginBottom: '36px', maxWidth: '520px' }}>
            Personalized training plans, real-time adjustments, and race day strategy — built around you, not a template.
          </p>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
            <Link to="/athlete/signup"
              style={{ display: 'inline-block', padding: '13px 28px', background: '#00E5A0', color: '#000', fontWeight: 700, fontSize: '15px', borderRadius: '10px', textDecoration: 'none', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#00cc8f'; e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,229,160,0.3)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = '#00E5A0'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
            >Start Training Free</Link>
            <a href="#how-it-works"
              style={{ display: 'inline-block', padding: '13px 24px', background: 'transparent', color: 'rgba(255,255,255,0.75)', fontWeight: 600, fontSize: '15px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.16)', textDecoration: 'none', transition: 'all 0.2s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.36)'; e.currentTarget.style.color = 'white'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)'; e.currentTarget.style.color = 'rgba(255,255,255,0.75)'; }}
            >See How It Works</a>
          </div>

          <p style={{ marginTop: '18px', fontSize: '13px', color: 'rgba(255,255,255,0.28)' }}>Free to start · No credit card required</p>
        </div>

        {/* Right — floating card */}
        <div className="lk-hero-card-wrap" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <DashboardCard />
        </div>
      </div>
    </section>
  );
}

// ── How It Works ──────────────────────────────────────────────────────────────

const HOW_STEPS = [
  {
    n: 1,
    title: 'Tell us about yourself',
    desc: 'Answer a few questions about your goals, fitness, and schedule. Takes 3 minutes.',
  },
  {
    n: 2,
    title: 'Get your plan instantly',
    desc: 'A personalized training plan built around your PRs, your schedule, and your goal race.',
  },
  {
    n: 3,
    title: 'Train, chat, improve',
    desc: 'Your coach adapts your plan as you train. Ask anything, anytime.',
  },
];

function HowItWorksSection() {
  const fade = useFadeIn();
  return (
    <section id="how-it-works" style={{ padding: 'clamp(64px, 8vw, 110px) clamp(16px, 4vw, 40px)' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div ref={fade.ref} style={{ ...fade.style, textAlign: 'center', marginBottom: '72px' }}>
          <h2 style={{ fontSize: 'clamp(28px, 3.8vw, 52px)', fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: 'white', marginBottom: '14px', letterSpacing: '-0.025em', lineHeight: 1.1 }}>
            Training that actually fits your life.
          </h2>
          <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.38)' }}>Three steps to your best season yet.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '48px 40px' }}>
          {HOW_STEPS.map((s, i) => {
            const f = useFadeIn(i * 120); // eslint-disable-line react-hooks/rules-of-hooks
            return (
              <div key={s.n} ref={f.ref} style={{ ...f.style }}>
                <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 'clamp(56px, 7vw, 88px)', fontWeight: 700, color: 'rgba(0,229,160,0.13)', lineHeight: 1, marginBottom: '12px', letterSpacing: '-0.05em' }}>
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

// ── Pain Points ───────────────────────────────────────────────────────────────

const PAIN_POINTS = [
  {
    title: 'Generic plans don\'t work',
    desc: 'Following a plan that wasn\'t built for you leads to burnout, injury, and missed goals.',
  },
  {
    title: 'Your schedule is yours',
    desc: 'Life gets in the way. Your training plan should flex with you, not break you.',
  },
  {
    title: 'Race day shouldn\'t be a mystery',
    desc: 'Know exactly what pace to run, when to push, and what to eat before you toe the line.',
  },
];

function PainSection() {
  const fade = useFadeIn();
  return (
    <section style={{ padding: 'clamp(64px, 8vw, 110px) clamp(16px, 4vw, 40px)', background: 'rgba(255,255,255,0.018)' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div ref={fade.ref} style={{ ...fade.style, textAlign: 'center', marginBottom: '52px' }}>
          <h2 style={{ fontSize: 'clamp(28px, 3.8vw, 52px)', fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: 'white', marginBottom: '14px', letterSpacing: '-0.025em', lineHeight: 1.1 }}>
            Every runner deserves a great coach.
          </h2>
          <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.38)', maxWidth: '480px', margin: '0 auto' }}>Most people are training without one. That ends today.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
          {PAIN_POINTS.map((p, i) => {
            const f = useFadeIn(i * 110); // eslint-disable-line react-hooks/rules-of-hooks
            return (
              <div key={p.title} ref={f.ref} style={{ ...f.style, padding: '28px 24px 28px 22px', background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)', borderLeft: '3px solid rgba(0,229,160,0.45)', borderRadius: '12px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'white', marginBottom: '8px', letterSpacing: '-0.01em' }}>{p.title}</h3>
                <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, margin: 0 }}>{p.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Features ──────────────────────────────────────────────────────────────────

const FEATURES = [
  { title: 'Personalized Training Plans', desc: 'Built around your PRs, weekly mileage, goal race, and schedule. Adapts every week.' },
  { title: 'Race Day Gameplan', desc: 'Mile-by-mile pacing strategy, nutrition timing, and weather-adjusted advice for every race.' },
  { title: 'Always-On Coaching', desc: 'Ask anything about your training. Get answers based on YOUR data, not generic advice.' },
  { title: 'Progress Tracking', desc: 'See your fitness improving week over week. Pace trends, mileage streaks, and PR tracking.' },
  { title: 'Strava Connected', desc: 'Your runs sync automatically. Your plan adapts based on what you actually did.' },
  { title: 'Recovery Intelligence', desc: 'Know when to push and when to back off based on your training load.' },
];

function FeaturesSection() {
  const fade = useFadeIn();
  return (
    <section id="features" style={{ padding: 'clamp(64px, 8vw, 110px) clamp(16px, 4vw, 40px)' }}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
        <div ref={fade.ref} style={{ ...fade.style, textAlign: 'center', marginBottom: '56px' }}>
          <h2 style={{ fontSize: 'clamp(28px, 3.8vw, 52px)', fontFamily: "'DM Sans', sans-serif", fontWeight: 700, color: 'white', marginBottom: '16px', letterSpacing: '-0.025em', lineHeight: 1.1 }}>
            Everything you need to run your best.
          </h2>
          <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.4)', maxWidth: '500px', margin: '0 auto', lineHeight: 1.65 }}>
            One platform. Every tool a serious runner needs.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
          {FEATURES.map((f, i) => {
            const fade2 = useFadeIn(i * 80); // eslint-disable-line react-hooks/rules-of-hooks
            return (
              <div key={f.title} ref={fade2.ref} style={{ ...fade2.style, padding: '28px', background: 'rgba(0,229,160,0.03)', border: '1px solid rgba(0,229,160,0.1)', borderRadius: '16px', transition: `${fade2.style.transition}, border-color 0.25s` }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(0,229,160,0.3)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(0,229,160,0.1)')}
              >
                <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#00E5A0', marginBottom: '18px' }} />
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'white', marginBottom: '8px', letterSpacing: '-0.01em' }}>{f.title}</h3>
                <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.44)', lineHeight: 1.7, margin: 0 }}>{f.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Final CTA ─────────────────────────────────────────────────────────────────

function FinalCTA() {
  const fade = useFadeIn();
  return (
    <section style={{ padding: 'clamp(72px, 9vw, 120px) clamp(16px, 4vw, 40px)', background: '#00E5A0' }}>
      <div style={{ maxWidth: '680px', margin: '0 auto', textAlign: 'center' }}>
        <div ref={fade.ref} style={fade.style}>
          <h2 style={{ fontSize: 'clamp(30px, 4.5vw, 56px)', fontFamily: "'DM Sans', sans-serif", fontWeight: 800, color: '#000', marginBottom: '14px', letterSpacing: '-0.03em', lineHeight: 1.08 }}>
            Your best season starts today.
          </h2>
          <p style={{ fontSize: '18px', color: 'rgba(0,60,44,0.7)', marginBottom: '34px', lineHeight: 1.55 }}>
            Join thousands of runners training smarter.
          </p>
          <Link to="/athlete/signup"
            style={{ display: 'inline-block', padding: '15px 36px', background: '#000', color: '#00E5A0', fontWeight: 700, fontSize: '16px', borderRadius: '10px', cursor: 'pointer', transition: 'all 0.2s', textDecoration: 'none' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#111'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = '#000'; e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
          >Start Training Free</Link>
          <p style={{ marginTop: '16px', fontSize: '13px', color: 'rgba(0,60,44,0.5)' }}>Free to start · No credit card required</p>
        </div>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer style={{ padding: '28px clamp(16px, 4vw, 40px)', background: '#060606', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
        <span style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: '17px', color: '#00E5A0' }}>Laktic</span>
        <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
          <Link to="/privacy" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.32)', textDecoration: 'none', transition: 'color 0.2s' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.32)')}
          >Privacy Policy</Link>
        </div>
        <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.2)', margin: 0 }}>© 2026 Laktic. All rights reserved.</p>
      </div>
    </footer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function LandingPage() {
  useEffect(() => {
    document.title = 'Laktic — A Coach In Your Pocket. Always.';
    return () => { document.title = 'Laktic'; };
  }, []);

  return (
    <div style={{ background: '#0a0a0a', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif", color: 'white' }}>
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
          .lk-hero-card-wrap { display: none !important; }
          .lk-nav-links { display: none !important; }
        }
      `}</style>
      <Navbar />
      <Hero />
      <HowItWorksSection />
      <PainSection />
      <FeaturesSection />
      <FinalCTA />
      <Footer />
    </div>
  );
}
