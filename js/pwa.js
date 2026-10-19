// PWA : enregistrement du service worker et bouton d'installation.
import { toast } from './util.js';

let deferredPrompt = null;

export function initPWA() {
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('[SYNAPSE] Service worker refusé', err));
    });
  }

  const btn = document.getElementById('install-btn');
  if (!btn) return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btn.hidden = false;
  });

  btn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    btn.hidden = true;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    if (outcome === 'accepted') toast('SYNAPSE installée. Bienvenue dans le Réseau, choom.', 'ok');
  });

  window.addEventListener('appinstalled', () => {
    btn.hidden = true;
    deferredPrompt = null;
  });

  window.addEventListener('offline', () => toast('Signal perdu : mode hors ligne, seuls les films déjà vus sont dispo.', 'warn'));
  window.addEventListener('online', () => toast('Signal rétabli.', 'ok'));
}
