import React, { useState } from 'react';
import { AdminPage } from './components/AdminPage';
import { AuditPage } from './components/AuditPage';
import { AutonomyConsole } from './components/AutonomyConsole';
import { Carriers } from './components/Carriers';
import { CompliancePage } from './components/CompliancePage';
import { DeploymentPage } from './components/DeploymentPage';
import { AgentsPage } from './components/AgentsPage';
import { ErrorsPage } from './components/ErrorsPage';
import { SecurityPage } from './components/SecurityPage';
import { Login } from './components/Login';
import { OpsHome } from './components/OpsHome';
import { Queue } from './components/Queue';
import { Quotes } from './components/Quotes';
import { Shipments } from './components/Shipments';
import { ShipmentDrawer } from './components/ShipmentDrawer';
import { colors, styles } from './styles';
import type { User } from './types';

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

export function App(): React.ReactElement {
  const saved = loadSession();
  const [token, setToken] = useState<string | null>(saved?.token ?? null);
  const [user, setUser] = useState<User | null>(saved?.user ?? null);
  const [view, setView] = useState<View>('ops');
  const [queueInspect, setQueueInspect] = useState<string | null>(null);
  const [systemExpanded, setSystemExpanded] = useState(false);

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
                      onClick={() => setView(n.id)}
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
          {view === 'security' && <SecurityPage _token={token} />}
          {view === 'audit' && <AuditPage token={token} />}
          {view === 'admin' && <AdminPage token={token} />}
          {view === 'autonomy' && <AutonomyConsole token={token} />}
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
