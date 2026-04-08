import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Component, ReactNode } from 'react';
import { useAuthStore } from './store/authStore';

// ── Global error boundary — catches unhandled render errors in any page ───────
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'sans-serif', color: 'white', textAlign: 'center', padding: '24px' }}>
          <div>
            <p style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px' }}>Something went wrong.</p>
            <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.5)', marginBottom: '24px' }}>Try refreshing the page. If the problem persists, contact support.</p>
            <button onClick={() => window.location.reload()} style={{ padding: '10px 24px', borderRadius: '8px', background: '#00E5A0', color: '#000', fontWeight: 600, border: 'none', cursor: 'pointer', fontSize: '14px' }}>
              Refresh
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

import { CoachRegister, AthleteRegister, CoachLogin, AthleteLogin, PasswordResetConfirm, UnifiedLogin } from './pages/AuthPages';
import { Onboarding, StravaConnectStep, MeetPaceSplash } from './pages/athlete/Onboarding';
import { LandingPage } from './pages/LandingPage';
import { ForgotPassword, ResetPassword } from './pages/PasswordReset';
import { AthleteDashboard } from './pages/AthleteDashboard';
import { CoachDashboard } from './pages/CoachDashboard';
import { CoachOnboarding } from './pages/CoachOnboarding';
import { BotSetupEdit } from './pages/BotSetupEdit';
import { KnowledgeDocuments } from './pages/KnowledgeDocuments';
// import { BrowseBots, BotDetail } from './pages/BotPages'; // hidden — athlete-first pivot
import { RaceCalendar } from './pages/RaceCalendar';
import { SeasonPlan } from './pages/SeasonPlan';
import { Chat } from './pages/Chat';
import { JoinTeam } from './pages/JoinTeam';
// import { AthleteOnboarding } from './pages/AthleteOnboarding'; // replaced by new Onboarding flow
import { AthleteSettings } from './pages/AthleteSettings';
import { Activities } from './pages/Activities';
import { RunTracker } from './pages/RunTracker';
import { AthleteProgress } from './pages/AthleteProgress';
import { CoachTeamProgress } from './pages/CoachTeamProgress';
import { CoachSettings } from './pages/CoachSettings';
import { TeamCalendar } from './pages/TeamCalendar';
import { AthleteCalendar } from './pages/AthleteCalendar';
import { NutritionPage } from './pages/NutritionPage';
import { MarketplacePage, MarketplaceCoachProfile, MarketplaceApply } from './pages/MarketplacePages';
import { TeamFeed } from './pages/TeamFeed';
import { TeamLeaderboard } from './pages/TeamLeaderboard';
import { Community } from './pages/Community';
import { TeamReadiness } from './pages/TeamReadiness';
import { TeamRecovery } from './pages/TeamRecovery';
import { GameplanViewer } from './pages/GameplanViewer';
import { AthleteGameplans } from './pages/AthleteGameplans';
import { RaceDebrief } from './pages/RaceDebrief';
import { AthletePublicProfile } from './pages/AthletePublicProfile';
import { CoachPublicProfile } from './pages/CoachPublicProfile';
import { ReferralsPage } from './pages/ReferralsPage';
import { PricingPage } from './pages/PricingPage';
import { TrainingPlansMarketplace, MyPlans, CoachPlanManage } from './pages/TrainingPlansMarketplace';
import { AnalyticsDashboard } from './pages/AnalyticsDashboard';
import { CertificationPage } from './pages/CertificationPage';
import { RecruitingSettings, RecruiterSignup, RecruiterDashboard } from './pages/RecruitingPages';
import { AdminDashboard } from './pages/AdminDashboard';
import { AthletePro } from './pages/AthletePro';
import { Privacy } from './pages/Privacy';
import { AuthCallback } from './pages/AuthCallback';
import { EmailConfirmationPending } from './pages/EmailConfirmationPending';

function RequireCoach({ children }: { children: React.ReactNode }) {
  const role = useAuthStore(s => s.role);
  const loc = useLocation();
  if (!role) return <Navigate to="/" state={{ from: loc }} replace />;
  if (role !== 'coach') return <Navigate to="/athlete/browse" replace />;
  return <>{children}</>;
}

function RequireAthlete({ children }: { children: React.ReactNode }) {
  const role = useAuthStore(s => s.role);
  const session = useAuthStore(s => s.session);
  const loc = useLocation();
  if (!role) return <Navigate to="/" state={{ from: loc }} replace />;
  // Coach role users are redirected to athlete dashboard in athlete-first mode
  if (role !== 'athlete') return <Navigate to="/athlete/dashboard" replace />;
  // Block access until email confirmation step is fully complete.
  // 'laktic_awaiting_confirmation' is set at signUp and cleared only on MeetPaceSplash.
  if (localStorage.getItem('laktic_awaiting_confirmation')) return <Navigate to="/signup/confirm" replace />;
  // Also block if session exists but email is not confirmed
  if (session && !session.user?.email_confirmed_at) return <Navigate to="/signup/confirm" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/register/coach" element={<CoachRegister />} />
        <Route path="/register/athlete" element={<Onboarding />} />
        <Route path="/coach/signup" element={<CoachRegister />} />
        <Route path="/athlete/signup" element={<Onboarding />} />
        <Route path="/login" element={<UnifiedLogin />} />
        <Route path="/login/coach" element={<CoachLogin />} />
        <Route path="/login/athlete" element={<AthleteLogin />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/reset-password/new" element={<PasswordResetConfirm />} />

        {/* Coach protected */}
        <Route path="/coach/onboarding" element={<RequireCoach><CoachOnboarding /></RequireCoach>} />
        <Route path="/coach/dashboard" element={<RequireCoach><CoachDashboard /></RequireCoach>} />
        <Route path="/coach/bot/setup" element={<RequireCoach><BotSetupEdit /></RequireCoach>} />
        <Route path="/coach/bot/edit" element={<RequireCoach><BotSetupEdit /></RequireCoach>} />
        <Route path="/coach/knowledge" element={<RequireCoach><KnowledgeDocuments /></RequireCoach>} />
        <Route path="/coach/progress" element={<RequireCoach><CoachTeamProgress /></RequireCoach>} />
        <Route path="/coach/settings" element={<RequireCoach><CoachSettings /></RequireCoach>} />
        <Route path="/coach/calendar" element={<RequireCoach><TeamCalendar /></RequireCoach>} />

        {/* Athlete protected */}
        <Route path="/athlete/dashboard" element={<RequireAthlete><AthleteDashboard /></RequireAthlete>} />
        {/* Old onboarding removed — redirect to new signup flow */}
        <Route path="/athlete/onboarding" element={<Navigate to="/athlete/signup" replace />} />
        {/* <Route path="/athlete/browse" element={<RequireAthlete><BrowseBots /></RequireAthlete>} /> */}
        {/* <Route path="/athlete/bots/:botId" element={<RequireAthlete><BotDetail /></RequireAthlete>} /> */}
        <Route path="/athlete/plan" element={<RequireAthlete><SeasonPlan /></RequireAthlete>} />
        <Route path="/athlete/races" element={<RequireAthlete><RaceCalendar /></RequireAthlete>} />
        <Route path="/athlete/join" element={<RequireAthlete><JoinTeam /></RequireAthlete>} />
        <Route path="/athlete/chat" element={<RequireAthlete><Chat /></RequireAthlete>} />
        <Route path="/athlete/settings" element={<RequireAthlete><AthleteSettings /></RequireAthlete>} />
        <Route path="/athlete/activities" element={<RequireAthlete><Activities /></RequireAthlete>} />
        <Route path="/athlete/track" element={<RequireAthlete><RunTracker /></RequireAthlete>} />
        <Route path="/athlete/progress" element={<RequireAthlete><AthleteProgress /></RequireAthlete>} />
        <Route path="/athlete/calendar" element={<RequireAthlete><AthleteCalendar /></RequireAthlete>} />
        <Route path="/athlete/nutrition" element={<RequireAthlete><NutritionPage /></RequireAthlete>} />
        <Route path="/athlete/feed" element={<RequireAthlete><TeamFeed /></RequireAthlete>} />
        <Route path="/athlete/leaderboard" element={<RequireAthlete><TeamLeaderboard /></RequireAthlete>} />

        {/* Marketplace — hidden for athlete-first pivot */}
        {/* <Route path="/marketplace" element={<RequireAthlete><MarketplacePage /></RequireAthlete>} /> */}
        {/* <Route path="/marketplace/:coachId" element={<RequireAthlete><MarketplaceCoachProfile /></RequireAthlete>} /> */}

        {/* Coach — marketplace application — hidden */}
        {/* <Route path="/coach/marketplace/apply" element={<RequireCoach><MarketplaceApply /></RequireCoach>} /> */}

        {/* Community — athletes and coaches */}
        <Route path="/community" element={<Community />} />

        {/* Auth flow */}
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/signup/confirm" element={<EmailConfirmationPending />} />
        <Route path="/signup/strava" element={<StravaConnectStep />} />
        <Route path="/signup/meet-pace" element={<MeetPaceSplash />} />

        {/* Public routes — no auth */}
        <Route path="/athlete/:username" element={<AthletePublicProfile />} />
        <Route path="/coach/:username" element={<CoachPublicProfile />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/privacy" element={<Privacy />} />

        {/* Sprint 2 — AI Features */}
        {/* <Route path="/coach/readiness" element={<RequireCoach><TeamReadiness /></RequireCoach>} /> */}
        {/* <Route path="/coach/recovery" element={<RequireCoach><TeamRecovery /></RequireCoach>} /> */}
        {/* <Route path="/coach/gameplans" element={<RequireCoach><GameplanViewer /></RequireCoach>} /> */}
        <Route path="/athlete/gameplans" element={<RequireAthlete><AthleteGameplans /></RequireAthlete>} />
        <Route path="/athlete/gameplan/:id" element={<RequireAthlete><GameplanViewer /></RequireAthlete>} />
        <Route path="/athlete/debrief/:id" element={<RequireAthlete><RaceDebrief /></RequireAthlete>} />

        {/* Sprint 4 — Revenue Expansion */}
        <Route path="/marketplace/plans" element={<TrainingPlansMarketplace />} />
        {/* <Route path="/coach/plans" element={<RequireCoach><CoachPlanManage /></RequireCoach>} /> */}
        <Route path="/athlete/analytics" element={<RequireAthlete><AnalyticsDashboard /></RequireAthlete>} />
        {/* <Route path="/coach/certification" element={<RequireCoach><CertificationPage /></RequireCoach>} /> */}
        <Route path="/athlete/recruiting" element={<RequireAthlete><RecruitingSettings /></RequireAthlete>} />
        <Route path="/recruiting/signup" element={<RecruiterSignup />} />
        <Route path="/recruiting" element={<RecruiterDashboard />} />
        <Route path="/admin" element={<AdminDashboard />} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
    </ErrorBoundary>
  );
}
