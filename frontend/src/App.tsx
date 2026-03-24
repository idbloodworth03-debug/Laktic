import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/authStore';

import { Landing, CoachRegister, AthleteRegister, CoachLogin, AthleteLogin } from './pages/AuthPages';
import { CoachDashboard } from './pages/CoachDashboard';
import { BotSetupEdit } from './pages/BotSetupEdit';
import { KnowledgeDocuments } from './pages/KnowledgeDocuments';
import { BrowseBots, BotDetail } from './pages/BotPages';
import { RaceCalendar } from './pages/RaceCalendar';
import { SeasonPlan } from './pages/SeasonPlan';
import { Chat } from './pages/Chat';
import { JoinTeam } from './pages/JoinTeam';
import { AthleteSettings } from './pages/AthleteSettings';
import { Activities } from './pages/Activities';

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

        {/* Coach protected */}
        <Route path="/coach/dashboard" element={<RequireCoach><CoachDashboard /></RequireCoach>} />
        <Route path="/coach/bot/setup" element={<RequireCoach><BotSetupEdit /></RequireCoach>} />
        <Route path="/coach/bot/edit" element={<RequireCoach><BotSetupEdit /></RequireCoach>} />
        <Route path="/coach/knowledge" element={<RequireCoach><KnowledgeDocuments /></RequireCoach>} />

        {/* Athlete protected */}
        <Route path="/athlete/browse" element={<RequireAthlete><BrowseBots /></RequireAthlete>} />
        <Route path="/athlete/bots/:botId" element={<RequireAthlete><BotDetail /></RequireAthlete>} />
        <Route path="/athlete/plan" element={<RequireAthlete><SeasonPlan /></RequireAthlete>} />
        <Route path="/athlete/races" element={<RequireAthlete><RaceCalendar /></RequireAthlete>} />
        <Route path="/athlete/join" element={<RequireAthlete><JoinTeam /></RequireAthlete>} />
        <Route path="/athlete/chat" element={<RequireAthlete><Chat /></RequireAthlete>} />
        <Route path="/athlete/settings" element={<RequireAthlete><AthleteSettings /></RequireAthlete>} />
        <Route path="/athlete/activities" element={<RequireAthlete><Activities /></RequireAthlete>} />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
