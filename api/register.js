const BASE = 'https://api.webinarjam.com/webinarjam';

async function wj(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString()
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) {}
  return { ok: r.ok, status: r.status, json, text };
}

function findFirst(obj, key) {
  if (!obj || typeof obj !== 'object') return undefined;
  if (Array.isArray(obj)) {
    for (const it of obj) { const v = findFirst(it, key); if (v !== undefined) return v; }
    return undefined;
  }
  if (obj[key] !== undefined && typeof obj[key] !== 'object') return obj[key];
  for (const k of Object.keys(obj)) { const v = findFirst(obj[k], key); if (v !== undefined) return v; }
  return undefined;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ ok: false, error: 'method' }); return; }

  const apiKey = process.env.WEBINARJAM_API_KEY;
  if (!apiKey) { res.status(500).json({ ok: false, error: 'WEBINARJAM_API_KEY manquante dans Vercel' }); return; }

  let data = req.body;
  if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { data = {}; } }
  data = data || {};
  const first_name = String(data.first_name || '').trim().slice(0, 80);
  const email = String(data.email || '').trim().slice(0, 200);
  if (!first_name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    res.status(400).json({ ok: false, error: 'Prenom ou email invalide' }); return;
  }

  try {
    let webinarId = process.env.WEBINAR_ID;
    if (!webinarId) {
      const list = await wj('/webinars', { api_key: apiKey });
      const arr = (list.json && (list.json.webinars || (list.json.data && list.json.data.webinars))) || [];
      const mine = arr.find(w => /masterclass/i.test(w.name || w.title || '') && !/example/i.test(w.name || w.title || '')) || arr[0];
      webinarId = mine && (mine.webinar_id || mine.id);
      if (!webinarId) { res.status(502).json({ ok: false, error: 'Webinaire introuvable', detail: list.text.slice(0, 300) }); return; }
    }

    const info = await wj('/webinar', { api_key: apiKey, webinar_id: webinarId });
    let schedule = findFirst(info.json && (info.json.webinar || info.json), 'schedule');
    if (schedule === undefined) schedule = findFirst(info.json, 'schedule_id');
    if (schedule === undefined) { res.status(502).json({ ok: false, error: 'Session introuvable', detail: info.text.slice(0, 300) }); return; }

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const body = { api_key: apiKey, webinar_id: webinarId, first_name, email, schedule };
    if (ip) body.ip_address = ip;
    const reg = await wj('/register', body);

    const status = reg.json && reg.json.status;
    if (!reg.ok || (status && String(status).toLowerCase() !== 'success')) {
      res.status(502).json({ ok: false, error: 'WebinarJam a refuse', detail: reg.text.slice(0, 400) }); return;
    }
    res.status(200).json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'Erreur serveur', detail: String(e).slice(0, 200) });
  }
};
