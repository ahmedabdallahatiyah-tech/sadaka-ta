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

function gregorianToHijri(gy, gm, gd) {
  let jd = Math.floor((1461 * (gy + 4800 + Math.floor((gm - 14) / 12))) / 4) +
            Math.floor((367 * (gm - 2 - 12 * Math.floor((gm - 14) / 12))) / 12) -
            Math.floor((3 * Math.floor((gy + 4900 + Math.floor((gm - 14) / 12)) / 100)) / 4) + gd - 32075;
  let l = jd - 1948440 + 10632;
  let n = Math.floor((l - 1) / 10631);
  l = l - 10631 * n + 354;
  let j = (Math.floor((10985 - Math.floor((5345 + 240 * Math.floor(l / 354)) / 1200)) / 30) * 30) + 5355 + 240 * Math.floor(l / 354);
  let m = Math.ceil((j - 1) / 29.5);
  m = Math.min(m, 12);
  let d = j - Math.floor(29.5 * (m - 1));
  return { year: Math.floor(30 * n + m - 1), month: m, day: d };
}

function formatHijri(now) {
  const h = gregorianToHijri(now.getFullYear(), now.getMonth() + 1, now.getDate());
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
