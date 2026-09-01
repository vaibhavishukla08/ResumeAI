import { useCallback, useEffect, useMemo, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import type { CandidateStatus, CandidateSummary, HealthResponse, Role, Skill } from '@shared/types';

import Shell from '@/components/Shell';
import Auth from '@/pages/Auth';
import Landing from '@/pages/Landing';
import Dashboard from '@/pages/Dashboard';
import Candidates from '@/pages/Candidates';
import CandidateAnalysis from '@/pages/CandidateAnalysis';
import Compare from '@/pages/Compare';
import Roles from '@/pages/Roles';
import Settings from '@/pages/Settings';

import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { api } from '@/lib/api';

/** State every page shares, threaded down as props. */
export interface Workspace {
  roles: Role[];
  role: Role | null;
  roleId: string;
  candidates: CandidateSummary[];
  skills: Skill[];
  health: HealthResponse | null;
  search: string;
  setStatus: (id: string, status: CandidateStatus) => Promise<void>;
  refreshCandidates: (roleId?: string) => Promise<void>;
  refreshRoles: () => Promise<Role[]>;
}

function BootScreen({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-background grid place-items-center gradient-mesh">
      <div className="flex flex-col items-center gap-md animate-scale-in">
        <div className="w-14 h-14 rounded-2xl gradient-surface grid place-items-center shadow-glow animate-float">
          <span className="material-symbols-outlined filled text-white" style={{ fontSize: 28 }}>
            readiness_score
          </span>
        </div>
        <p className="font-body text-body-sm text-on-surface-variant">{message}</p>
      </div>
    </div>
  );
}

export default function App() {
  const { user, booting } = useAuth();
  const { push } = useToast();

  const [roles, setRoles] = useState<Role[]>([]);
  const [roleId, setRoleId] = useState(() => localStorage.getItem('resumeai-role') ?? '');
  const [candidates, setCandidates] = useState<CandidateSummary[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const role = useMemo(() => roles.find((r) => r.id === roleId) ?? null, [roles, roleId]);

  const refreshRoles = useCallback(async () => {
    const { roles: list } = await api.roles();
    setRoles(list);
    setRoleId((current) =>
      current && list.some((r) => r.id === current) ? current : list[0]?.id ?? '',
    );
    return list;
  }, []);

  const refreshCandidates = useCallback(
    async (id?: string) => {
      const target = id ?? roleId;
      if (!target) {
        setCandidates([]);
        return;
      }
      try {
        const { candidates: list } = await api.candidates(target);
        setCandidates(list);
      } catch (err) {
        push((err as Error).message, 'error');
      }
    },
    [roleId, push],
  );

  // Load the workspace once a user is present; reset it when they sign out.
  useEffect(() => {
    if (!user) {
      setRoles([]);
      setCandidates([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [, skillsRes, healthRes] = await Promise.all([
          refreshRoles(),
          api.skills(),
          api.health().catch(() => null),
        ]);
        if (cancelled) return;
        setSkills(skillsRes.skills);
        setHealth(healthRes);
      } catch (err) {
        if (!cancelled) push(`Could not reach the API: ${(err as Error).message}`, 'error', 8000);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, refreshRoles, push]);

  useEffect(() => {
    if (!user) return;
    if (roleId) localStorage.setItem('resumeai-role', roleId);
    void refreshCandidates(roleId);
  }, [user, roleId, refreshCandidates]);

  const setStatus = useCallback(
    async (id: string, status: CandidateStatus) => {
      // Optimistic: the row reacts instantly, and we resync if the write fails.
      setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
      try {
        await api.patchCandidate(id, { status });
      } catch (err) {
        push((err as Error).message, 'error');
        void refreshCandidates();
      }
    },
    [push, refreshCandidates],
  );

  if (booting) return <BootScreen message="Restoring your session…" />;

  // Signed out: the marketing page is the front door, /signin is the gate.
  if (!user) {
    return (
      <Routes>
        <Route path="/signin" element={<Auth />} />
        <Route path="/" element={<Landing />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (loading) return <BootScreen message="Loading your workspace…" />;

  const workspace: Workspace = {
    roles, role, roleId, candidates, skills, health, search,
    setStatus, refreshCandidates, refreshRoles,
  };

  return (
    <Shell
      roles={roles}
      roleId={roleId}
      onRoleChange={setRoleId}
      search={search}
      onSearch={setSearch}
    >
      <Routes>
        <Route path="/" element={<Dashboard {...workspace} />} />
        <Route path="/candidates" element={<Candidates {...workspace} />} />
        <Route path="/candidate/:id" element={<CandidateAnalysis {...workspace} />} />
        <Route path="/compare" element={<Compare {...workspace} />} />
        <Route path="/roles" element={<Roles {...workspace} />} />
        <Route path="/settings" element={<Settings {...workspace} />} />
        {/* A signed-in user landing on /signin belongs in the app. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Shell>
  );
}
