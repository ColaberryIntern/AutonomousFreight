import React from 'react';
import { styles } from '../styles';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function Drawer({ title, onClose, children }: Props): React.ReactElement {
  return (
    <>
      <div style={styles.backdrop} onClick={onClose} />
      <aside style={styles.drawer}>
        <div style={styles.drawerHeader}>
          <h2 style={styles.h2}>{title}</h2>
          <button style={styles.btnGhost} onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}
