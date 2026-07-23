/**
 * Widget Injector – TrueView AI Extension
 * Mounts the floating React monitoring widget inside a Shadow DOM container
 * using self-contained inline styles to bypass host website CSP restrictions.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { MonitoringWidget } from '../components/MonitoringWidget';
import { UnifiedAIState, SessionState } from '../types';

export class WidgetInjector {
  private containerEl: HTMLElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private rootReact: ReactDOM.Root | null = null;
  private currentAIState: UnifiedAIState | null = null;
  private currentSessionState: SessionState = 'NO_SESSION';

  inject(onOpenSidePanel: () => void, onStop: () => void): void {
    if (document.getElementById('trueview-shadow-host')) return;

    // Create host element
    this.containerEl = document.createElement('div');
    this.containerEl.id = 'trueview-shadow-host';
    this.containerEl.style.position = 'fixed';
    this.containerEl.style.top = '24px';
    this.containerEl.style.right = '24px';
    this.containerEl.style.zIndex = '2147483647';
    this.containerEl.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

    // Attach Shadow DOM
    this.shadowRoot = this.containerEl.attachShadow({ mode: 'open' });

    // Inject self-contained CSS rules inside Shadow DOM
    const styleEl = document.createElement('style');
    styleEl.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      .tv-w-container {
        background-color: rgba(9, 13, 22, 0.95);
        color: #f1f5f9;
        padding: 14px;
        border-radius: 16px;
        border: 1px solid rgba(59, 130, 246, 0.4);
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(16px);
        width: 280px;
        font-size: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .tv-w-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 8px;
      }
      .tv-w-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-weight: 700;
        letter-spacing: 0.05em;
        font-size: 11px;
        color: #38bdf8;
      }
      .tv-w-badge {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: #34d399;
        display: inline-block;
      }
      .tv-w-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 6px;
        background: rgba(15, 23, 42, 0.6);
        padding: 8px;
        border-radius: 10px;
        border: 1px solid rgba(255, 255, 255, 0.05);
        font-size: 11px;
      }
      .tv-btn-primary {
        background-color: rgba(37, 99, 235, 0.3);
        color: #bfdbfe;
        border: 1px solid rgba(59, 130, 246, 0.5);
        border-radius: 8px;
        padding: 6px 10px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        flex: 1;
        text-align: center;
      }
      .tv-btn-danger {
        background-color: rgba(220, 38, 38, 0.3);
        color: #fca5a5;
        border: 1px solid rgba(239, 68, 68, 0.5);
        border-radius: 8px;
        padding: 6px 10px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
      }
      .tv-risk-normal { background: rgba(16, 185, 129, 0.2); color: #6ee7b7; border: 1px solid rgba(16, 185, 129, 0.4); padding: 3px 8px; border-radius: 6px; font-weight: 700; }
      .tv-risk-high { background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4); padding: 3px 8px; border-radius: 6px; font-weight: 700; }
    `;
    this.shadowRoot.appendChild(styleEl);

    // Create mount point
    const mountPoint = document.createElement('div');
    this.shadowRoot.appendChild(mountPoint);

    document.body.appendChild(this.containerEl);

    // Render React root
    this.rootReact = ReactDOM.createRoot(mountPoint);
    this.render(onOpenSidePanel, onStop);
  }

  updateState(aiState: UnifiedAIState, sessionState: SessionState, onOpenSidePanel: () => void, onStop: () => void): void {
    this.currentAIState = aiState;
    this.currentSessionState = sessionState;
    this.render(onOpenSidePanel, onStop);
  }

  private render(onOpenSidePanel: () => void, onStop: () => void): void {
    if (this.rootReact) {
      this.rootReact.render(
        React.createElement(MonitoringWidget, {
          state: this.currentAIState,
          sessionState: this.currentSessionState,
          onOpenSidePanel,
          onStop,
        })
      );
    }
  }

  remove(): void {
    if (this.rootReact) {
      this.rootReact.unmount();
      this.rootReact = null;
    }
    if (this.containerEl) {
      this.containerEl.remove();
      this.containerEl = null;
    }
  }
}
