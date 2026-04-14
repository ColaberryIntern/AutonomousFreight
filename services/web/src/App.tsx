import React, { useState } from 'react';
import { AdminPage } from './components/AdminPage';
import { AuditPage } from './components/AuditPage';
import { AutonomyConsole } from './components/AutonomyConsole';
import { Carriers } from './components/Carriers';
import { CompliancePage } from './components/CompliancePage';
import { Login } from './components/Login';
import { OpsHome } from './components/OpsHome';
import { Queue } from './components/Queue';
import { Quotes } from './components/Quotes';
import { Shipments } from './components/Shipments';
import { ShipmentDrawer } from './components/ShipmentDrawer';
import { styles } from './styles';
import type { User } from './types';

type View =
  | 'ops'
  | 'quotes'
  | 'queue'
  | 'shipments'
  | 'carriers'
  | 'compliance'
  | 'audit'
  | 'admin'
  | 'autonomy';

interface NavItem {
  id: View;
  label: string;
  requiresRole?: string[];
}

const NAV: NavItem[] = [
  { id: 'ops', label: 'Operations' },
  { id: 'quotes', label: 'Quotes' },
  { id: 'queue', label: 'Queue' },
  { id: 'shipments', label: 'Shipments' },
  { id: 'carriers', label: 'Carriers' },
  { id: 'compliance', label: 'Compliance', requiresRole: ['admin', 'auditor'] },
  { id: 'audit', label: 'Audit', requiresRole: ['admin'] },
  { id: 'admin', label: 'Admin', requiresRole: ['admin'] },
  { id: 'autonomy', label: 'Autonomy' },
];

function hasRole(user: User, allowed?: string[]): boolean {
  if (!allowed) return true;
  return user.roles.some((r) => allowed.includes(r));
}

export function App(): React.ReactElement {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<View>('ops');
  const [queueInspect, setQueueInspect] = useState<string | null>(null);

  if (!token || !user) {
    return (
      <Login
        onLogin={(t, u) => {
          setToken(t);
          setUser(u);
        }}
      />
    );
  }

  const isAdmin = user.roles.includes('admin');
  const canApprove = user.roles.includes('admin') || user.roles.includes('broker');
  const canSeeCompliance = user.roles.some((r) => ['admin', 'broker', 'auditor'].includes(r));

  const visibleNav = NAV.filter((n) => hasRole(user, n.requiresRole));

  return (
    <div style={styles.shell}>
      <aside style={styles.sidebar}>
        <div style={styles.sidebarBrand}>Autonomous Freight</div>
        {visibleNav.map((n) => (
          <button
            key={n.id}
            style={{
              ...styles.sidebarLink,
              ...(view === n.id ? styles.sidebarLinkActive : {}),
            }}
            onClick={() => setView(n.id)}
          >
            {n.label}
          </button>
        ))}
      </aside>
      <div style={styles.main}>
        <div style={styles.topbar}>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 13, marginRight: 12 }}>{user.email}</span>
          <span style={{ fontSize: 12, opacity: 0.7, marginRight: 12 }}>
            ({user.roles.join(', ')})
          </span>
          <a href="/docs" target="_blank" style={{ fontSize: 13, marginRight: 12 }}>
            /docs
          </a>
          <button
            style={styles.btnGhost}
            onClick={() => {
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
          {view === 'compliance' && <CompliancePage token={token} />}
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
