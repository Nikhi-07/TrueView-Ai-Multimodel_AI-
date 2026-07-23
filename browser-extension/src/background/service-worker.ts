/**
 * Manifest V3 Service Worker – TrueView AI Monitor Extension
 * Manages extension lifecycle, side panel opening, and IPC message routing.
 */

import { ExtensionMessage } from '../types';

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open Onboarding Page on first installation
    chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') });
  }
});

// Enable side panel behavior
if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
}

// Message listener
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (message.type === 'OPEN_SIDE_PANEL') {
    if (sender.tab && sender.tab.id && chrome.sidePanel && chrome.sidePanel.open) {
      chrome.sidePanel.open({ tabId: sender.tab.id }).catch(() => {});
      sendResponse({ success: true });
    }
    return true;
  }
});
