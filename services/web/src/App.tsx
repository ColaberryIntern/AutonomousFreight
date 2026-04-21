import React, { Suspense, useEffect, useState } from 'react';
import { Carriers } from './components/Carriers';
import { Login } from './components/Login';
import { Queue } from './components/Queue';
import { Quotes } from './components/Quotes';
import { Shipments } from './components/Shipments';
import { ShipmentDrawer } from './components/ShipmentDrawer';
import { colors, styles } from './styles';
import type { User } from './types';

// Lazy-load heavy views to reduce initial bundle size
const OpsHome = React.lazy(() => import('./components/OpsHome').then(m => ({ default: m.OpsHome })));
const AgentsPage = React.lazy(() => import('./components/AgentsPage').then(m => ({ default: m.AgentsPage })));
const CompliancePage = React.lazy(() => import('./components/CompliancePage').then(m => ({ default: m.CompliancePage })));
const SecurityPage = React.lazy(() => import('./components/SecurityPage').then(m => ({ default: m.SecurityPage })));
const DeploymentPage = React.lazy(() => import('./components/DeploymentPage').then(m => ({ default: m.DeploymentPage })));
const ErrorsPage = React.lazy(() => import('./components/ErrorsPage').then(m => ({ default: m.ErrorsPage })));
const AuditPage = React.lazy(() => import('./components/AuditPage').then(m => ({ default: m.AuditPage })));
const AdminPage = React.lazy(() => import('./components/AdminPage').then(m => ({ default: m.AdminPage })));
const AutonomyConsole = React.lazy(() => import('./components/AutonomyConsole').then(m => ({ default: m.AutonomyConsole })));

type View =
  | 'ops'
  | 'quotes'
  | 'queue'
  | 'shipments'
  | 'carriers'
  | 'agents'
  | 'compliance'
  | 'errors'
  | 'deployment'
  | 'security'
  | 'audit'
  | 'admin'
  | 'autonomy';

interface NavItem {
  id: View;
  label: string;
  requiresRole?: string[];
}

interface NavGroup {
  title: string;
  items: NavItem[];
  collapsed?: boolean;
  requiresRole?: string[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: 'OPERATIONS',
    items: [
      { id: 'ops', label: 'Dashboard' },
      { id: 'quotes', label: 'Quotes' },
      { id: 'queue', label: 'Queue' },
      { id: 'shipments', label: 'Shipments' },
      { id: 'carriers', label: 'Carriers' },
    ],
  },
  {
    title: 'CONTROL TOWER',
    items: [
      { id: 'agents', label: 'Agents' },
      { id: 'compliance', label: 'Compliance', requiresRole: ['admin', 'auditor'] },
      { id: 'errors', label: 'Exceptions', requiresRole: ['admin'] },
    ],
  },
  {
    title: 'SYSTEM',
    collapsed: true,
    requiresRole: ['admin'],
    items: [
      { id: 'deployment', label: 'Deploy' },
      { id: 'security', label: 'Security' },
      { id: 'audit', label: 'Audit' },
      { id: 'admin', label: 'Users' },
      { id: 'autonomy', label: 'Autonomy' },
    ],
  },
];

function hasRole(user: User, allowed?: string[]): boolean {
  if (!allowed) return true;
  return user.roles.some((r) => allowed.includes(r));
}

const sectionHeader: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 1.2,
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,0.4)',
  padding: '16px 20px 4px',
  userSelect: 'none',
};

const collapseToggle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: 'rgba(255,255,255,0.4)',
  cursor: 'pointer',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: 1.2,
  textTransform: 'uppercase',
  padding: '16px 20px 4px',
  width: '100%',
  textAlign: 'left',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

function loadSession(): { token: string; user: User } | null {
  try {
    const t = localStorage.getItem('af_token');
    const u = localStorage.getItem('af_user');
    if (t && u) return { token: t, user: JSON.parse(u) as User };
  } catch {
    // corrupt storage — clear it
    localStorage.removeItem('af_token');
    localStorage.removeItem('af_user');
  }
  return null;
}

function saveSession(token: string, user: User): void {
  localStorage.setItem('af_token', token);
  localStorage.setItem('af_user', JSON.stringify(user));
}

function clearSession(): void {
  localStorage.removeItem('af_token');
  localStorage.removeItem('af_user');
}

const ALL_VIEWS: View[] = [
  'ops', 'quotes', 'queue', 'shipments', 'carriers', 'agents',
  'compliance', 'errors', 'deployment', 'security', 'audit', 'admin', 'autonomy',
];

function viewFromHash(): View {
  const h = window.location.hash.replace('#/', '').replace('#', '');
  if (ALL_VIEWS.includes(h as View)) return h as View;
  return 'ops';
}

function setHash(view: View): void {
  window.location.hash = `#/${view}`;
}

export function App(): React.ReactElement {
  const saved = loadSession();
  const [token, setToken] = useState<string | null>(saved?.token ?? null);
  const [user, setUser] = useState<User | null>(saved?.user ?? null);
  const [view, setView] = useState<View>(viewFromHash);
  const [queueInspect, setQueueInspect] = useState<string | null>(null);
  const [systemExpanded, setSystemExpanded] = useState(false);

  // Sync hash → state on back/forward
  useEffect(() => {
    function onHashChange(): void {
      setView(viewFromHash());
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (!token || !user) {
    return (
      <Login
        onLogin={(t, u) => {
          saveSession(t, u);
          setToken(t);
          setUser(u);
        }}
      />
    );
  }

  const isAdmin = user.roles.includes('admin');
  const canApprove = user.roles.includes('admin') || user.roles.includes('broker');
  const canSeeCompliance = user.roles.some((r) => ['admin', 'broker', 'auditor'].includes(r));

  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.sidebarBrand}>Autonomous Freight</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', padding: '0 20px 12px' }}>
          Operating System
        </div>

        {NAV_GROUPS.map((group) => {
          if (!hasRole(user, group.requiresRole)) return null;
          const visibleItems = group.items.filter((n) => hasRole(user, n.requiresRole));
          if (visibleItems.length === 0) return null;

          const isCollapsible = group.collapsed === true;
          const isExpanded = isCollapsible ? systemExpanded : true;

          return (
            <div key={group.title}>
              {isCollapsible ? (
                <button style={collapseToggle} onClick={() => setSystemExpanded((e) => !e)}>
                  <span>{group.title}</span>
                  <span style={{ fontSize: 14 }}>{isExpanded ? '▾' : '▸'}</span>
                </button>
              ) : (
                <div style={sectionHeader}>{group.title}</div>
              )}

              {isExpanded &&
                visibleItems.map((n) => {
                  const isActive = view === n.id;
                  const isMuted = group.title === 'SYSTEM';
                  return (
                    <button
                      key={n.id}
                      style={{
                        ...styles.sidebarLink,
                        ...(isActive ? styles.sidebarLinkActive : {}),
                        ...(isMuted && !isActive
                          ? { color: 'rgba(255,255,255,0.55)', fontSize: 13 }
                          : {}),
                      }}
                      onClick={() => { setHash(n.id); setView(n.id); }}
                    >
                      {n.label}
                      {n.id === 'errors' && (
                        <span
                          style={{
                            marginLeft: 6,
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            background: colors.warn,
                          }}
                        />
                      )}
                      {n.id === 'compliance' && (
                        <span
                          style={{
                            marginLeft: 6,
                            display: 'inline-block',
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            background: colors.warn,
                          }}
                        />
                      )}
                    </button>
                  );
                })}
            </div>
          );
        })}

        <div style={{ flex: 1 }} />
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            fontSize: 11,
            color: 'rgba(255,255,255,0.35)',
          }}
        >
          {user.email}
          <br />
          <span style={{ fontSize: 10 }}>{user.roles.join(' · ')}</span>
        </div>
      </aside>

      <div style={styles.main}>
        <div style={styles.topbar}>
          <div style={{ flex: 1 }} />
          <a href="/docs" target="_blank" style={{ fontSize: 13, marginRight: 12 }}>
            API docs
          </a>
          <button
            style={styles.btnGhost}
            onClick={() => {
              clearSession();
              setToken(null);
              setUser(null);
            }}
          >
            Log out
          </button>
        </div>
        <div style={styles.content}>
          <Suspense fallback={<div style={{ padding: 24, color: colors.textMuted, fontSize: 13 }}>Loading...</div>}>
            {view === 'ops' && <OpsHome token={token} isAdmin={isAdmin} />}
            {view === 'quotes' && <Quotes token={token} canApprove={canApprove} />}
            {view === 'queue' && (
              <Queue token={token} canApprove={canApprove} onDetail={(id) => setQueueInspect(id)} />
            )}
            {view === 'shipments' && <Shipments token={token} canApprove={canApprove} />}
            {view === 'carriers' && <Carriers token={token} canSeeCompliance={canSeeCompliance} />}
            {view === 'agents' && <AgentsPage token={token} />}
            {view === 'compliance' && <CompliancePage token={token} />}
            {view === 'errors' && <ErrorsPage token={token} />}
            {view === 'deployment' && <DeploymentPage token={token} />}
            {view === 'security' && <SecurityPage token={token} />}
            {view === 'audit' && <AuditPage token={token} />}
            {view === 'admin' && <AdminPage token={token} />}
            {view === 'autonomy' && <AutonomyConsole token={token} />}
          </Suspense>
        </div>
      </div>
      {queueInspect && (
        <ShipmentDrawer
          token={token}
          shipmentId={queueInspect}
          canApprove={canApprove}
          onClose={() => setQueueInspect(null)}
          onAssigned={() => setQueueInspect(null)}
        />
      )}
    </div>
  );
}
