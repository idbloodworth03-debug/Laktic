import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/authStore';

import { Landing, CoachRegister, AthleteRegister, CoachLogin, AthleteLogin } from './pages/AuthPages';
import { ForgotPassword, ResetPassword } from './pages/PasswordReset';
import { CoachDashboard } from './pages/CoachDashboard';
import { CoachOnboarding } from './pages/CoachOnboarding';
import { BotSetupEdit } from './pages/BotSetupEdit';
import { KnowledgeDocuments } from './pages/KnowledgeDocuments';
import { BrowseBots, BotDetail } from './pages/BotPages';
import { RaceCalendar } from './pages/RaceCalendar';
import { SeasonPlan } from './pages/SeasonPlan';
import { Chat } from './pages/Chat';
import { JoinTeam } from './pages/JoinTeam';
import { AthleteOnboarding } from './pages/AthleteOnboarding';
import { AthleteSettings } from './pages/AthleteSettings';
import { Activities } from './pages/Activities';
import { AthleteProgress } from './pages/AthleteProgress';
import { CoachTeamProgress } from './pages/CoachTeamProgress';
import { CoachSettings } from './pages/CoachSettings';
import { TeamCalendar } from './pages/TeamCalendar';
import { AthleteCalendar } from './pages/AthleteCalendar';
import { NutritionPage } from './pages/NutritionPage';
import { MarketplacePage, MarketplaceCoachProfile, MarketplaceApply } from './pages/MarketplacePages';
import { TeamFeed } from './pages/TeamFeed';
import { TeamLeaderboard } from './pages/TeamLeaderboard';

function RequireCoach({ children }: { children: React.ReactNode }) {
  const role = useAuthStore(s => s.role);
  const loc = useLocation();
  if (!role) return <Navigate to="/" state={{ from: loc }} replace />;
  if (role !== 'coach') return <Navigate to="/athlete/browse" replace />;
  return <>{children}</>;
}

function RequireAthlete({ children }: { children: React.ReactNode }) {
  const role = useAuthStore(s => s.role);
  const loc = useLocation();
  if (!role) return <Navigate to="/" state={{ from: loc }} replace />;
  if (role !== 'athlete') return <Navigate to="/coach/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/register/coach" element={<CoachRegister />} />
        <Route path="/register/athlete" element={<AthleteRegister />} />
        <Route path="/login/coach" element={<CoachLogin />} />
        <Route path="/login/athlete" element={<AthleteLogin />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

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
        <Route path="/athlete/onboarding" element={<RequireAthlete><AthleteOnboarding /></RequireAthlete>} />
        <Route path="/athlete/browse" element={<RequireAthlete><BrowseBots /></RequireAthlete>} />
        <Route path="/athlete/bots/:botId" element={<RequireAthlete><BotDetail /></RequireAthlete>} />
        <Route path="/athlete/plan" element={<RequireAthlete><SeasonPlan /></RequireAthlete>} />
        <Route path="/athlete/races" element={<RequireAthlete><RaceCalendar /></RequireAthlete>} />
        <Route path="/athlete/join" element={<RequireAthlete><JoinTeam /></RequireAthlete>} />
        <Route path="/athlete/chat" element={<RequireAthlete><Chat /></RequireAthlete>} />
        <Route path="/athlete/settings" element={<RequireAthlete><AthleteSettings /></RequireAthlete>} />
        <Route path="/athlete/activities" element={<RequireAthlete><Activities /></RequireAthlete>} />
        <Route path="/athlete/progress" element={<RequireAthlete><AthleteProgress /></RequireAthlete>} />
        <Route path="/athlete/calendar" element={<RequireAthlete><AthleteCalendar /></RequireAthlete>} />
        <Route path="/athlete/nutrition" element={<RequireAthlete><NutritionPage /></RequireAthlete>} />
        <Route path="/athlete/feed" element={<RequireAthlete><TeamFeed /></RequireAthlete>} />
        <Route path="/athlete/leaderboard" element={<RequireAthlete><TeamLeaderboard /></RequireAthlete>} />

        {/* Marketplace — public browse, athlete profile view */}
        <Route path="/marketplace" element={<RequireAthlete><MarketplacePage /></RequireAthlete>} />
        <Route path="/marketplace/:coachId" element={<RequireAthlete><MarketplaceCoachProfile /></RequireAthlete>} />

        {/* Coach — marketplace application */}
        <Route path="/coach/marketplace/apply" element={<RequireCoach><MarketplaceApply /></RequireCoach>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
