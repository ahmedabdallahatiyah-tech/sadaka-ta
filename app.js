const BOT_TOKEN = '8831127843:AAGdWSxTXzKuM5F3myYOEu1nGkwNfXXLq9g';
const CHANNEL_ID = '-1003324105214';

const HIJRI_MONTHS = [
  'محرم','صفر','ربيع الأول','ربيع الآخر',
  'جمادى الأولى','جمادى الآخرة','رجب','شعبان',
  'رمضان','شوال','ذو القعدة','ذو الحجة'
];

const DAY_NAMES = ['الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت','الأحد'];

let allPosts = [];
let displayedIds = new Set();
let seenUpdates = new Set();

function parseArabicNum(str) {
  const map = {'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'};
  return parseInt(str.replace(/[٠-٩]/g, c => map[c]), 10);
}

const SISTANI_ADJUST = {
  // 1447H month adjustments: positive = Intl is ahead, 0 = same, negative = Sistani ahead
  // Dhul-Hijjah 1447: Sistani 1st = May 18, Intl 1st = May 17 → Intl +1
  // Muharram 1448: Sistani 1st = June 17, Intl 1st = June 16 → Intl +1
  // Default adjustment is -1 day from Intl for the current era
};

function getHijriDate(date) {
  let gy = date.getFullYear(), gm = date.getMonth() + 1, gd = date.getDate();

  if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
    try {
      const d = new Date(Date.UTC(gy, gm - 1, gd, 12, 0, 0));
      const f = new Intl.DateTimeFormat('en-u-ca-islamic', {
        day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC'
      });
      const p = f.formatToParts(d);
      let hy, hm, hd;
      for (const part of p) {
        if (part.type === 'year') hy = parseArabicNum(part.value);
        if (part.type === 'month') hm = parseArabicNum(part.value);
        if (part.type === 'day') hd = parseArabicNum(part.value);
      }
      if (hy && hm && hd) {
        // Adjust for Sistani (default: -1 day for current era 1447-1448)
        const adjKey = hy + '_' + hm;
        const adj = SISTANI_ADJUST[adjKey] !== undefined ? SISTANI_ADJUST[adjKey] : -1;
        hd += adj;
        if (hd < 1) { hm--; if (hm < 1) { hm = 12; hy--; } hd += (hm === 12 || hm === 1 || hm === 3 || hm === 5 || hm === 7 || hm === 9) ? 30 : 29; }
        if (hd > 29) { const maxD = (hm === 12 || hm === 1 || hm === 3 || hm === 5 || hm === 7 || hm === 9) ? 30 : 29; if (hd > maxD) { hd -= maxD; hm++; if (hm > 12) { hm = 1; hy++; } } }
        return { year: hy, month: hm, day: hd };
      }
    } catch (e) {}
  }

  // Fallback algorithm
  const jd = Math.floor((1461 * (gy + 4800 + Math.floor((gm - 14) / 12))) / 4) +
              Math.floor((367 * (gm - 2 - 12 * Math.floor((gm - 14) / 12))) / 12) -
              Math.floor((3 * Math.floor((gy + 4900 + Math.floor((gm - 14) / 12)) / 100)) / 4) + gd - 32075;
  const l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  let ly = l - 10631 * n + 354;
  let j = (Math.floor((10985 - Math.floor((5345 + 240 * Math.floor(ly / 354)) / 1200)) / 30) * 30) + 5355 + 240 * Math.floor(ly / 354);
  let m = Math.ceil((j - 1) / 29.5);
  m = Math.min(m, 12);
  let d = j - Math.floor(29.5 * (m - 1));
  let hy = Math.floor(30 * n + m - 1);
  d--; if (d < 1) { m--; if (m < 1) { m = 12; hy--; } d = (m === 12 || m === 1 || m === 3 || m === 5 || m === 7 || m === 9) ? 30 : 29; }
  return { year: hy, month: m, day: d };
}

function formatHijri(now) {
  const h = getHijriDate(now);
  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  return `${DAY_NAMES[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()} م — ${h.day} ${HIJRI_MONTHS[h.month - 1]} ${h.year} هـ`;
}

function timeAgo(unixtime) {
  const diff = Math.floor(Date.now() / 1000) - unixtime;
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`;
  const d = new Date(unixtime * 1000);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

async function resolveFileUrl(fileId) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${fileId}`);
    const d = await r.json();
    if (d.ok && d.result.file_path) {
      return `https://api.telegram.org/file/bot${BOT_TOKEN}/${d.result.file_path}`;
    }
  } catch (e) {}
  return '';
}

async function fetchPosts() {
  const container = document.getElementById('posts-container');
  const btn = document.getElementById('refresh-btn');
  btn.textContent = 'جاري التحديث...';

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=0&timeout=10`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (!data.ok) throw new Error(data.description);

    let newPosts = 0;
    for (const u of data.result) {
      if (seenUpdates.has(u.update_id)) continue;
      seenUpdates.add(u.update_id);
      const p = u.channel_post || u.message;
      if (p && p.chat && p.chat.id.toString() === CHANNEL_ID && !displayedIds.has(p.message_id)) {
        displayedIds.add(p.message_id);
        allPosts.unshift(p);
        newPosts++;
      }
    }

    allPosts.sort((a, b) => b.message_id - a.message_id);

    const htmlParts = [];
    for (const p of allPosts) {
      const caption = escapeHtml(p.caption || p.text || '');
      const date = timeAgo(p.date);
      let part = '<div class="post-card">';
      if (p.photo && p.photo.length > 0) {
        const fileId = p.photo[p.photo.length - 1].file_id;
        const fileUrl = await resolveFileUrl(fileId);
        if (fileUrl) {
          part += `<img class="post-image" src="${fileUrl}" alt="صورة" loading="lazy">`;
        }
      }
      if (caption) {
        part += `<div class="post-caption">${caption}</div>`;
      }
      part += `<div class="post-date">${date}</div></div>`;
      htmlParts.push(part);
    }

    if (htmlParts.length === 0) {
      container.innerHTML = '<div class="loading">📭 لا توجد منشورات بعد<br><small>انشر أول منشور في قناتك وسيظهر هنا</small></div>';
    } else {
      container.innerHTML = htmlParts.join('');
    }

    document.getElementById('last-update').textContent =
      `آخر تحديث: ${new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}`;

  } catch (e) {
    if (allPosts.length === 0) {
      container.innerHTML = `<div class="loading">🔴 تعذر الاتصال: ${e.message}</div>`;
    }
  }

  btn.textContent = '🔄 تحديث';
}

document.getElementById('hijri-header').textContent = formatHijri(new Date());
setInterval(() => { document.getElementById('hijri-header').textContent = formatHijri(new Date()); }, 60000);
document.getElementById('load-status').style.display = 'none';
fetchPosts();
setInterval(fetchPosts, 60000);
