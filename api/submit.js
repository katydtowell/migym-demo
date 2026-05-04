const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);
const RECIPIENT = process.env.RECIPIENT_EMAIL || 'ktowell@ezfacility.com';

// ── Allowed origin for CORS (set in Vercel env, e.g. https://your-app.vercel.app) ──
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

// ── Simple in-memory rate limiter (per serverless instance) ──
const rateMap = new Map();
const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_MAX = 5;               // max 5 submissions per minute per IP

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateMap.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count++;
  if (entry.count > RATE_MAX) return true;
  return false;
}

// ── Validation helpers ──
function isString(val) { return typeof val === 'string'; }
function truncate(str, max) { return isString(str) ? str.slice(0, max) : ''; }
function isValidHex(val) { return isString(val) && /^#?[0-9A-Fa-f]{3,8}$/.test(val); }
function isValidUrl(val) {
  if (!isString(val) || !val) return false;
  try {
    const u = new URL(val);
    return u.protocol === 'https:';
  } catch { return false; }
}
function sanitizeFilename(str) {
  // Strip anything that isn't alphanumeric, space, hyphen, or underscore
  return truncate(str, 100).replace(/[^a-zA-Z0-9 _-]/g, '');
}

// ── Max payload sizes ──
const MAX_TEXT_FIELD = 5000;       // characters per text field
const MAX_PREVIEW_B64 = 4 * 1024 * 1024; // ~3 MB image as base64
const MAX_TILE_ROWS = 20;
const MAX_TILES_PER_ROW = 4;

// ── Known tile IDs (whitelist) ──
const VALID_TILE_IDS = new Set([
  'schedule', 'favorites', 'announcements', 'contact',
  'location', 'account', 'membercard',
  'notifications', 'social-checkin', 'feedback', 'tell-a-friend', 'services', 'myschedule-plus', 'free-trial', 'articles',
  'social-youtube', 'social-facebook', 'social-x', 'social-instagram',
  'gallery', 'image',
]);
// Web-link tiles are dynamic (weblink-<slot>), so allow them via a regex check.
const WEB_LINK_TILE_RE = /^weblink-\d{1,5}$/;
function isValidTileId(id) {
  return typeof id === 'string' && (VALID_TILE_IDS.has(id) || WEB_LINK_TILE_RE.test(id));
}
const MAX_WEB_LINKS = 20;
const MAX_TILE_IMAGES = 50;
// Safe zip paths for tile-image metadata (prevents path traversal when quoted in email)
const TILE_IMAGE_PATH_RE = /^tile-images\/[A-Za-z0-9][A-Za-z0-9_\-.]{0,99}$/;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limiting
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many submissions. Please wait a minute and try again.' });
  }

  try {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    // ── Extract and validate all fields ──
    const contactName    = truncate(body.contactName, MAX_TEXT_FIELD);
    const contactEmail   = truncate(body.contactEmail, 320); // max email length
    const appStoreName   = truncate(body.appStoreName, 200);
    const phoneName      = truncate(body.phoneName, 200);
    const appDescription = truncate(body.appDescription, MAX_TEXT_FIELD);
    const promoText      = truncate(body.promoText, MAX_TEXT_FIELD);
    const keywords       = truncate(body.keywords, MAX_TEXT_FIELD);

    // My Account portal URL
    const accountUrl = isValidUrl(body.accountUrl) ? body.accountUrl : truncate(body.accountUrl, 500);

    // Social Check-in
    const socialCheckinText = truncate(body.socialCheckinText, 500);
    const socialCheckinUrl  = isValidUrl(body.socialCheckinUrl) ? body.socialCheckinUrl : truncate(body.socialCheckinUrl, 500);

    // Social media
    const socialYoutube   = truncate(body.socialYoutube, 500);
    const socialFacebook  = truncate(body.socialFacebook, 500);
    const socialX         = truncate(body.socialX, 500);
    const socialInstagram = truncate(body.socialInstagram, 500);

    // Colors: validate hex format, fallback to black
    const primaryColor       = isValidHex(body.primaryColor) ? body.primaryColor : '#000000';
    const secondaryColor     = isValidHex(body.secondaryColor) ? body.secondaryColor : '#000000';
    const backgroundColor    = isValidHex(body.backgroundColor) ? body.backgroundColor : '#000000';
    const altBackgroundColor = isValidHex(body.altBackgroundColor) ? body.altBackgroundColor : '#000000';

    // Tile layout: whitelist IDs, cap rows
    let tileLayout = [];
    if (Array.isArray(body.tileLayout)) {
      tileLayout = body.tileLayout.slice(0, MAX_TILE_ROWS).map(row => {
        if (!Array.isArray(row)) return [];
        return row.slice(0, MAX_TILES_PER_ROW).filter(isValidTileId);
      }).filter(row => row.length > 0);
    }

    // Tile layout spans: parallel array of per-row widths in sixths.
    // Allowed patterns: [6] (full), [3,3] (½+½), [4,2] (⅔+⅓), [2,4] (⅓+⅔),
    // [2,2,2] (thirds). Anything else falls back to equal-share widths.
    let tileLayoutSpans = [];
    if (Array.isArray(body.tileLayoutSpans)) {
      tileLayoutSpans = body.tileLayoutSpans.slice(0, MAX_TILE_ROWS).map(row => {
        if (!Array.isArray(row)) return null;
        const ints = row.slice(0, MAX_TILES_PER_ROW).map(n => {
          return typeof n === 'number' && Number.isFinite(n) ? Math.max(1, Math.min(6, Math.floor(n))) : null;
        });
        if (ints.some(n => n == null)) return null;
        const sum = ints.reduce((a, b) => a + b, 0);
        if (sum !== 6) return null;
        // Only allow the specific valid patterns
        const key = ints.join(',');
        const allowed = ['6', '3,3', '4,2', '2,4', '2,2,2'];
        if (allowed.indexOf(key) === -1) return null;
        return ints;
      });
    }
    // Pad/trim spans to match tileLayout, filling with defaults where missing.
    tileLayoutSpans = tileLayout.map((row, i) => {
      const candidate = tileLayoutSpans[i];
      if (Array.isArray(candidate) && candidate.length === row.length) return candidate;
      if (row.length === 1) return [6];
      if (row.length === 2) return [3, 3];
      if (row.length === 3) return [2, 2, 2];
      return row.map(() => Math.round(6 / row.length));
    });

    // Web Links: array of { slot, tileId, name, url } — validate shape and URL
    let webLinks = [];
    if (Array.isArray(body.webLinks)) {
      webLinks = body.webLinks.slice(0, MAX_WEB_LINKS)
        .map(w => {
          if (!w || typeof w !== 'object') return null;
          const tileId = isString(w.tileId) && WEB_LINK_TILE_RE.test(w.tileId) ? w.tileId : '';
          const url = isValidUrl(w.url) ? w.url : '';
          if (!tileId || !url) return null;
          return {
            tileId,
            name: truncate(w.name, 100),
            url: truncate(url, 500),
          };
        })
        .filter(Boolean);
    }

    // Tile Images: metadata describing which zip filename belongs to which tile.
    // Shape: { tileId, role, slideOrder, originalFilename, zipFilename }
    let tileImages = [];
    if (Array.isArray(body.tileImages)) {
      tileImages = body.tileImages.slice(0, MAX_TILE_IMAGES)
        .map(t => {
          if (!t || typeof t !== 'object') return null;
          const tileId = isString(t.tileId) && (t.tileId === 'gallery' || t.tileId === 'image') ? t.tileId : '';
          if (!tileId) return null;
          const zipFilename = isString(t.zipFilename) && TILE_IMAGE_PATH_RE.test(t.zipFilename) ? t.zipFilename : '';
          if (!zipFilename) return null;
          const role = t.role === 'gallery-slide' || t.role === 'single-image' ? t.role : '';
          const slideOrder = typeof t.slideOrder === 'number' && Number.isFinite(t.slideOrder)
            ? Math.max(1, Math.min(999, Math.floor(t.slideOrder)))
            : null;
          const isIsoDate = (s) => isString(s) && /^\d{4}-\d{2}-\d{2}$/.test(s);
          return {
            tileId,
            role,
            slideOrder,
            originalFilename: truncate(t.originalFilename, 200),
            zipFilename,
            shareAcrossLocations: !!t.shareAcrossLocations,
            availableFrom: isIsoDate(t.availableFrom) ? t.availableFrom : '',
            availableTo: isIsoDate(t.availableTo) ? t.availableTo : '',
          };
        })
        .filter(Boolean);
    }

    // URLs: must be valid HTTPS
    const assetsDownloadUrl       = isValidUrl(body.assetsDownloadUrl) ? body.assetsDownloadUrl : '';
    const uploadedFilesDownloadUrl = isValidUrl(body.uploadedFilesDownloadUrl) ? body.uploadedFilesDownloadUrl : '';

    // Preview image: validate base64 and cap size
    let previewImage = '';
    if (isString(body.previewImage) && body.previewImage.length <= MAX_PREVIEW_B64) {
      // Ensure it looks like valid base64 (only base64 chars)
      if (/^[A-Za-z0-9+/=]+$/.test(body.previewImage)) {
        previewImage = body.previewImage;
      }
    }

    // ── Build email ──
    const htmlBody = buildEmailHtml({
      contactName, contactEmail,
      appStoreName, phoneName, appDescription, promoText, keywords,
      tileLayout, tileLayoutSpans, webLinks, tileImages,
      primaryColor, secondaryColor, backgroundColor, altBackgroundColor,
      accountUrl,
      socialCheckinText, socialCheckinUrl,
      socialYoutube, socialFacebook, socialX, socialInstagram,
      assetsDownloadUrl, uploadedFilesDownloadUrl,
    });

    const attachments = [];
    const safeName = sanitizeFilename(appStoreName) || 'App';

    if (previewImage) {
      attachments.push({ filename: `${safeName} Design Preview.png`, content: previewImage, encoding: 'base64' });
    }

    const { data, error } = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
      to: [RECIPIENT],
      subject: `New Branded App Enrollment: ${safeName}`,
      html: htmlBody,
      attachments,
    });

    if (error) {
      console.error('Resend error:', error);
      return res.status(500).json({ error: 'Email delivery failed. Please try again.' });
    }

    return res.status(200).json({ success: true, emailId: data.id });
  } catch (err) {
    console.error('Server error:', err);
    return res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
  }
};

function buildEmailHtml({
  contactName, contactEmail,
  appStoreName, phoneName, appDescription, promoText, keywords,
  tileLayout, tileLayoutSpans, webLinks, tileImages,
  primaryColor, secondaryColor, backgroundColor, altBackgroundColor,
  accountUrl,
  socialCheckinText, socialCheckinUrl,
  socialYoutube, socialFacebook, socialX, socialInstagram,
  assetsDownloadUrl, uploadedFilesDownloadUrl,
}) {
  // Escape HTML in user-provided text
  const esc = (str) => (str || '\u2014')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  // Build a map of weblink tileId -> display label, so the layout table shows
  // a meaningful label (site name, or the URL if the name is blank) instead of
  // the raw "weblink-3" identifier.
  const webLinkLabelMap = {};
  if (Array.isArray(webLinks)) {
    webLinks.forEach(w => {
      if (!w || !w.tileId) return;
      webLinkLabelMap[w.tileId] = (w.name && w.name.trim()) || w.url || 'Web Link';
    });
  }
  const displayTileId = (id) => {
    if (webLinkLabelMap[id]) return 'web: ' + webLinkLabelMap[id];
    return id;
  };

  // Build tile-images sub-section: tells the recipient which file in the
  // uploads zip belongs to which tile (and for gallery, the slide order).
  let tileImagesHtml = '';
  if (Array.isArray(tileImages) && tileImages.length > 0) {
    const gallerySlides = tileImages
      .filter(t => t.tileId === 'gallery')
      .sort((a, b) => (a.slideOrder || 0) - (b.slideOrder || 0));
    const singleImage = tileImages.find(t => t.tileId === 'image');

    const parts = [];
    if (gallerySlides.length > 0) {
      const rows = gallerySlides.map(t => {
        const tags = [];
        if (t.shareAcrossLocations) {
          tags.push('<span style="background:#FFEDDD;color:#8A3F00;font-size:11px;font-weight:600;padding:2px 6px;border-radius:3px;margin-left:6px">Share across locations</span>');
        }
        if (t.availableFrom || t.availableTo) {
          const from = t.availableFrom ? esc(t.availableFrom) : '—';
          const to = t.availableTo ? esc(t.availableTo) : '—';
          tags.push(`<span style="background:#EEF2FF;color:#1e3a8a;font-size:11px;font-weight:600;padding:2px 6px;border-radius:3px;margin-left:6px">Available ${from} → ${to}</span>`);
        }
        const tagsHtml = tags.join('');
        return `<tr><td style="color:#666;padding-right:16px;white-space:nowrap;vertical-align:top">Slide ${esc(String(t.slideOrder || '?'))}</td><td><code style="background:#eee;padding:2px 6px;border-radius:3px">${esc(t.zipFilename)}</code>${t.originalFilename ? ` <span style="color:#888;font-size:12px">(originally: ${esc(t.originalFilename)})</span>` : ''}${tagsHtml}</td></tr>`;
      }).join('');
      parts.push(`
        <h3 style="font-size:14px;color:#1a1a2e;margin:20px 0 8px">Gallery Tile Slides</h3>
        <p style="font-size:13px;color:#666;margin:0 0 8px">The gallery tile shows the following images as a carousel, in the order listed. Files are in the uploads zip under <code>tile-images/</code>.</p>
        <table style="font-size:14px;line-height:1.8">${rows}</table>
      `);
    }
    if (singleImage) {
      parts.push(`
        <h3 style="font-size:14px;color:#1a1a2e;margin:20px 0 8px">Image Tile</h3>
        <p style="font-size:13px;color:#666;margin:0 0 8px">The single Image tile uses this file from the uploads zip:</p>
        <table style="font-size:14px;line-height:1.8">
          <tr><td style="color:#666;padding-right:16px;white-space:nowrap;vertical-align:top">File</td><td><code style="background:#eee;padding:2px 6px;border-radius:3px">${esc(singleImage.zipFilename)}</code>${singleImage.originalFilename ? ` <span style="color:#888;font-size:12px">(originally: ${esc(singleImage.originalFilename)})</span>` : ''}</td></tr>
        </table>
      `);
    }
    tileImagesHtml = parts.join('');
  }

  // Tile layout table — IDs are already whitelisted, but escape anyway for defense in depth.
  // Each tile's width fraction is shown inline next to its name, so a separate
  // "size" column is redundant and has been removed.
  const fractionFor = (n) => {
    // Tile widths are now stored in thirds (full = 3, ⅔ = 2, ⅓ = 1).
    if (n === 3) return 'Full';
    if (n === 2) return '⅔';
    if (n === 1) return '⅓';
    return n + '/3';
  };
  let tileHtml = '<em>None provided</em>';
  if (tileLayout && Array.isArray(tileLayout) && tileLayout.length > 0) {
    const rows = tileLayout.map((row, rowIdx) => {
      const spans = Array.isArray(tileLayoutSpans) ? tileLayoutSpans[rowIdx] : null;
      const tiles = row.map((id, ti) => {
        const span = Array.isArray(spans) ? spans[ti] : null;
        const widthBadge = span ? ` <span style="color:#999;font-size:11px">(${fractionFor(span)})</span>` : '';
        return `<code style="background:#eee;padding:2px 6px;border-radius:3px">${esc(displayTileId(id))}</code>${widthBadge}`;
      }).join(', ');
      return `<tr><td style="padding:4px 12px 4px 0;color:#666;vertical-align:top">Row ${rowIdx + 1}</td><td style="padding:4px 8px">${tiles}</td></tr>`;
    });
    tileHtml = `<table style="border-collapse:collapse;font-size:14px">${rows.join('')}</table>`;
  }

  // (Web Links section intentionally omitted — rows in the builder only carry
  // placeholder values like "Website 1" / "https://www.example.com", so
  // surfacing them in the email adds noise without any real info.)

  // Section header helper
  const sectionHeader = (title) =>
    `<h2 style="font-size:16px;color:#1a1a2e;margin:24px 0 12px;border-bottom:2px solid #e5e5e5;padding-bottom:8px">${title}</h2>`;

  // Color swatch — validate hex before inserting into attributes
  const colorSwatch = (hex) => {
    const clean = (hex || '#000000').replace('#', '').replace(/[^0-9A-Fa-f]/g, '').slice(0, 8);
    return `<img src="https://dummyimage.com/16x16/${clean}/${clean}.png" width="16" height="16" alt="#${esc(clean)}" style="vertical-align:middle;border-radius:3px;border:1px solid #cccccc;margin-right:6px" /> #${esc(clean)}`;
  };

  // Download button — URLs are already validated as HTTPS above
  const downloadButton = (url, label) => {
    if (!url) return '';
    return `
      <a href="${esc(url)}" style="display:inline-block;padding:10px 20px;background:#1a1a2e;color:#ffffff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;margin:6px 8px 6px 0">${label}</a>
    `;
  };

  // Build download buttons
  let downloadsHtml = '';
  if (assetsDownloadUrl || uploadedFilesDownloadUrl) {
    const buttons = [];
    if (uploadedFilesDownloadUrl) buttons.push(downloadButton(uploadedFilesDownloadUrl, 'Download Logo Files'));
    if (assetsDownloadUrl) buttons.push(downloadButton(assetsDownloadUrl, 'Download App Store Assets'));
    downloadsHtml = `
      ${sectionHeader('Downloads')}
      <p style="font-size:14px;color:#666;margin-bottom:16px">Click to download the uploaded files and generated app store assets.</p>
      <div style="margin:8px 0">${buttons.join('')}</div>
    `;
  }

  // Sanitize email for mailto link
  const safeEmail = esc(contactEmail).replace(/[^a-zA-Z0-9@._+\-]/g, '');

  return `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;color:#333">
      <div style="background:#1a1a2e;padding:24px 32px;border-radius:8px 8px 0 0">
        <h1 style="color:#fff;margin:0;font-size:22px">New Branded App Enrollment</h1>
        <p style="color:#aaa;margin:8px 0 0;font-size:14px">${esc(appStoreName)}</p>
      </div>

      <div style="padding:24px 32px;background:#f9f9fb;border:1px solid #e5e5e5;border-top:none">

        ${sectionHeader('Customer Information')}
        <table style="font-size:14px;line-height:1.8">
          <tr><td style="color:#666;padding-right:16px;white-space:nowrap">Primary Contact Name</td><td><strong>${esc(contactName)}</strong></td></tr>
          <tr><td style="color:#666;padding-right:16px;white-space:nowrap">Primary Contact Email</td><td><a href="mailto:${safeEmail}">${esc(contactEmail)}</a></td></tr>
        </table>

        ${sectionHeader('App Information')}
        <table style="font-size:14px;line-height:1.8">
          <tr><td style="color:#666;padding-right:16px;white-space:nowrap;vertical-align:top">App Store Name</td><td><strong>${esc(appStoreName)}</strong></td></tr>
          <tr><td style="color:#666;padding-right:16px;white-space:nowrap;vertical-align:top">App Name on Phone</td><td>${esc(phoneName)}</td></tr>
          <tr><td style="color:#666;padding-right:16px;white-space:nowrap;vertical-align:top">App Description</td><td style="white-space:pre-wrap">${esc(appDescription)}</td></tr>
          <tr><td style="color:#666;padding-right:16px;white-space:nowrap;vertical-align:top">Promotional Text</td><td>${esc(promoText)}</td></tr>
          <tr><td style="color:#666;padding-right:16px;white-space:nowrap;vertical-align:top">Keywords</td><td>${esc(keywords)}</td></tr>
        </table>

        ${sectionHeader('Home Screen Layout')}
        ${tileHtml}
        ${accountUrl ? `
        <h3 style="font-size:14px;color:#1a1a2e;margin:20px 0 8px">My Account Portal</h3>
        <p style="font-size:13px;color:#666;margin:0 0 4px">The My Account tile links to:</p>
        <p style="font-size:14px;margin:0"><a href="${esc(accountUrl)}">${esc(accountUrl)}</a></p>
        ` : ''}
        ${(socialCheckinText || socialCheckinUrl) ? `
        <h3 style="font-size:14px;color:#1a1a2e;margin:20px 0 8px">Social Check-in</h3>
        ${socialCheckinText ? `<p style="font-size:13px;color:#666;margin:0 0 4px"><strong>Share text:</strong> ${esc(socialCheckinText)}</p>` : ''}
        ${socialCheckinUrl ? `<p style="font-size:13px;color:#666;margin:0 0 4px"><strong>Share URL:</strong> <a href="${esc(socialCheckinUrl)}">${esc(socialCheckinUrl)}</a></p>` : ''}
        ` : ''}
        ${tileImagesHtml}
        ${buildSocialHtml({ socialYoutube, socialFacebook, socialX, socialInstagram }, esc)}

        ${sectionHeader('Branding &amp; Design Information')}
        <table style="font-size:14px;line-height:1.8">
          <tr><td style="color:#666;padding-right:16px;white-space:nowrap">Primary Color</td><td>${colorSwatch(primaryColor)}</td></tr>
          <tr><td style="color:#666;padding-right:16px;white-space:nowrap">Secondary Color</td><td>${colorSwatch(secondaryColor)}</td></tr>
          <tr><td style="color:#666;padding-right:16px;white-space:nowrap">Home Screen Background</td><td>${colorSwatch(altBackgroundColor)}</td></tr>
          <tr><td style="color:#666;padding-right:16px;white-space:nowrap">Alt Background Color</td><td>${colorSwatch(backgroundColor)}</td></tr>
        </table>

        ${downloadsHtml}

        ${sectionHeader('Attachments')}
        <p style="font-size:14px;color:#666">The design preview image is attached to this email.</p>
      </div>

      <div style="background:#1a1a2e;padding:16px 32px;border-radius:0 0 8px 8px;text-align:center">
        <p style="color:#666;margin:0;font-size:12px">Generated by MiGym App Builder</p>
      </div>
    </div>
  `;
}

function buildSocialHtml({ socialYoutube, socialFacebook, socialX, socialInstagram }, esc) {
  const socials = [
    { label: 'YouTube', value: socialYoutube },
    { label: 'Facebook', value: socialFacebook },
    { label: 'X (Twitter)', value: socialX },
    { label: 'Instagram', value: socialInstagram },
  ].filter(s => s.value && s.value.trim());

  if (socials.length === 0) return '';

  const rows = socials.map(s =>
    `<tr><td style="color:#666;padding-right:16px;white-space:nowrap">${s.label}</td><td>${esc(s.value)}</td></tr>`
  ).join('');

  return `
    <h3 style="font-size:14px;color:#1a1a2e;margin:20px 0 8px">Social Media</h3>
    <table style="font-size:14px;line-height:1.8">${rows}</table>
  `;
}
