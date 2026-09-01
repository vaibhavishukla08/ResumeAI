import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import type { Role } from '@shared/types';
import { useAuth } from '@/context/AuthContext';
import { initials } from '@/lib/format';

const NAV = [
  { to: '/', label: 'Dashboard', icon: 'space_dashboard', end: true },
  { to: '/candidates', label: 'Candidates', icon: 'group' },
  { to: '/compare', label: 'Compare', icon: 'balance' },
  { to: '/roles', label: 'Job Roles', icon: 'work' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
];

function useTheme(): [boolean, (v: boolean) => void] {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('resumeai-theme', dark ? 'dark' : 'light');
  }, [dark]);
  return [dark, setDark];
}

function SideNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, logout } = useAuth();

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-40 md:hidden transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden="true"
      />

      <nav
        className={`fixed md:sticky top-0 left-0 h-screen w-sidebar-width bg-surface-container-low
                    border-r border-outline-variant flex flex-col p-md flex-shrink-0 z-50
                    transition-transform duration-300 ease-smooth md:translate-x-0
                    ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex items-center gap-sm px-sm py-md mb-md">
          <div className="w-10 h-10 rounded-xl gradient-surface grid place-items-center shadow-soft flex-shrink-0">
            <span className="material-symbols-outlined filled text-white" style={{ fontSize: 22 }}>
              readiness_score
            </span>
          </div>
          <div className="min-w-0">
            <p className="font-heading text-title text-on-surface leading-tight truncate">ResumeAI</p>
            <p className="font-body text-label-md uppercase text-on-surface-variant">
              {user?.company || 'Enterprise Scanner'}
            </p>
          </div>
        </div>

        <ul className="space-y-xs flex-1">
          {NAV.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                onClick={onClose}
                className={({ isActive }) =>
                  `group relative flex items-center gap-md px-md py-sm rounded-xl
                   transition-all duration-200 ease-smooth ${
                     isActive
                       ? 'text-primary font-semibold bg-primary/10'
                       : 'text-on-surface-variant font-medium hover:text-on-surface hover:bg-surface-container-high'
                   }`
                }
              >
                {({ isActive }) => (
                  <>
                    {/* Sliding active indicator on the left edge. */}
                    <span
                      className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full
                                  gradient-surface transition-all duration-300 ease-smooth
                                  ${isActive ? 'h-6 opacity-100' : 'h-0 opacity-0'}`}
                      aria-hidden="true"
                    />
                    <span
                      className={`material-symbols-outlined transition-transform duration-200
                                  group-hover:scale-110 ${isActive ? 'filled' : ''}`}
                      style={{ fontSize: 21 }}
                    >
                      {item.icon}
                    </span>
                    <span className="font-body text-body-md">{item.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="pt-md border-t border-outline-variant">
          <div className="flex items-center gap-sm px-sm py-sm rounded-xl hover:bg-surface-container-high transition-colors">
            <div className="w-9 h-9 rounded-full gradient-surface grid place-items-center flex-shrink-0">
              <span className="font-body text-body-sm font-bold text-white">
                {initials(user?.name)}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-body text-body-sm font-semibold text-on-surface truncate">
                {user?.name}
              </p>
              <p className="font-body text-label-md text-on-surface-variant capitalize">
                {user?.role}
              </p>
            </div>
            <button
              onClick={logout}
              className="text-on-surface-variant hover:text-error transition-colors p-xs rounded-lg"
              aria-label="Sign out"
              title="Sign out"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 19 }}>logout</span>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
}

interface TopBarProps {
  roles: Role[];
  roleId: string;
  onRoleChange: (id: string) => void;
  search: string;
  onSearch: (value: string) => void;
  onMenu: () => void;
}

function TopBar({ roles, roleId, onRoleChange, search, onSearch, onMenu }: TopBarProps) {
  const [dark, setDark] = useTheme();
  const searchRef = useRef<HTMLInputElement>(null);

  // Cmd/Ctrl-K focuses search, the convention users already expect.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header
      className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl border-b border-outline-variant
                 flex items-center gap-md px-lg py-sm"
    >
      <button
        className="md:hidden text-on-surface-variant hover:text-primary transition-colors"
        onClick={onMenu}
        aria-label="Open navigation"
      >
        <span className="material-symbols-outlined">menu</span>
      </button>

      {roles.length > 0 && (
        <div className="relative hidden sm:block flex-shrink-0">
          <select
            className="field appearance-none pr-xl cursor-pointer w-56 py-xs"
            value={roleId}
            onChange={(e) => onRoleChange(e.target.value)}
            aria-label="Active job role"
          >
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.title}</option>
            ))}
          </select>
          <span
            className="material-symbols-outlined absolute right-sm top-1/2 -translate-y-1/2
                       pointer-events-none text-on-surface-variant"
            style={{ fontSize: 19 }}
          >
            expand_more
          </span>
        </div>
      )}

      <div className="relative flex-1 max-w-lg hidden md:block">
        <span
          className="material-symbols-outlined absolute left-sm top-1/2 -translate-y-1/2 text-on-surface-variant"
          style={{ fontSize: 19 }}
        >
          search
        </span>
        <input
          ref={searchRef}
          className="field pl-[38px] pr-[52px] py-xs"
          placeholder="Search candidates, skills…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          aria-label="Search candidates"
        />
        <kbd
          className="absolute right-sm top-1/2 -translate-y-1/2 px-xs py-px rounded border
                     border-outline-variant font-mono text-label-md text-on-surface-variant
                     pointer-events-none hidden lg:block"
        >
          ⌘K
        </kbd>
      </div>

      <div className="flex items-center gap-xs ml-auto">
        <button
          onClick={() => setDark(!dark)}
          className="w-9 h-9 rounded-lg grid place-items-center text-on-surface-variant
                     hover:text-primary hover:bg-surface-container-high transition-all duration-200"
          aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
          title={dark ? 'Light theme' : 'Dark theme'}
        >
          <span
            className="material-symbols-outlined transition-transform duration-500"
            style={{ fontSize: 20, transform: dark ? 'rotate(0deg)' : 'rotate(180deg)' }}
          >
            {dark ? 'light_mode' : 'dark_mode'}
          </span>
        </button>
      </div>
    </header>
  );
}

interface ShellProps {
  children: ReactNode;
  roles: Role[];
  roleId: string;
  onRoleChange: (id: string) => void;
  search: string;
  onSearch: (value: string) => void;
}

export default function Shell({
  children,
  roles,
  roleId,
  onRoleChange,
  search,
  onSearch,
}: ShellProps) {
  const [navOpen, setNavOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="bg-background text-on-background min-h-screen flex">
      <SideNav open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          roles={roles}
          roleId={roleId}
          onRoleChange={onRoleChange}
          search={search}
          onSearch={onSearch}
          onMenu={() => setNavOpen(true)}
        />
        {/* Keying on pathname replays the entrance animation on every route change. */}
        <main key={location.pathname} className="flex-1 p-lg max-w-container-max w-full animate-slide-up">
          {children}
        </main>
      </div>
    </div>
  );
}
