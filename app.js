const BOT_TOKEN = '8831127843:AAGdWSxTXzKuM5F3myYOEu1nGkwNfXXLq9g';
const CHANNEL_ID = '-1003324105214';
const CHANNEL_USERNAME = 'Sadaka_Ta';

const HIJRI_MONTHS = ['محرم','صفر','ربيع الأول','ربيع الآخر','جمادى الأولى','جمادى الآخرة','رجب','شعبان','رمضان','شوال','ذو القعدة','ذو الحجة'];
const DAY_NAMES = ['الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت','الأحد'];

function parseArabicNum(str) {
  const map = {'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'};
  return parseInt(str.replace(/[٠-٩]/g, c => map[c]), 10);
}

function getHijriDate(date) {
  let gy = date.getFullYear(), gm = date.getMonth() + 1, gd = date.getDate();
  if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
    try {
      const d = new Date(Date.UTC(gy, gm - 1, gd, 12, 0, 0));
      const f = new Intl.DateTimeFormat('en-u-ca-islamic', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' });
      const p = f.formatToParts(d);
      let hy, hm, hd;
      for (const part of p) {
        if (part.type === 'year') hy = parseArabicNum(part.value);
        if (part.type === 'month') hm = parseArabicNum(part.value);
        if (part.type === 'day') hd = parseArabicNum(part.value);
      }
      if (hy && hm && hd) {
        hd -= 1;
        if (hd < 1) { hm--; if (hm < 1) { hm = 12; hy--; } hd += (hm === 12 || hm === 1 || hm === 3 || hm === 5 || hm === 7 || hm === 9) ? 30 : 29; }
        return { year: hy, month: hm, day: hd };
      }
    } catch (e) {}
  }
  return { year: 1447, month: 12, day: 23 };
}

function formatHijri(now) {
  const h = getHijriDate(now);
  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
  return `${DAY_NAMES[now.getDay()]} ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()} م — ${h.day} ${HIJRI_MONTHS[h.month - 1]} ${h.year} هـ`;
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

let allPosts = [];
let displayedIds = new Set();
let lastUpdateId = 0;

async function fetchPosts() {
  const container = document.getElementById('posts-container');
  const status = document.getElementById('load-status');
  const btn = document.getElementById('refresh-btn');
  btn.textContent = 'جاري التحديث...';

  try {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?offset=${lastUpdateId}&timeout=5`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    const data = await resp.json();
    if (!data.ok) throw new Error(data.description);

    for (const u of data.result) {
      if (u.update_id > lastUpdateId) lastUpdateId = u.update_id;
      const p = u.channel_post;
      if (p && p.chat && p.chat.id.toString() === CHANNEL_ID && !displayedIds.has(p.message_id)) {
        displayedIds.add(p.message_id);
        allPosts.push(p);
      }
    }

    allPosts.sort((a, b) => b.message_id - a.message_id);

    if (allPosts.length === 0) {
      container.innerHTML = '<div class="loading">📭 لا توجد منشورات بعد</div>';
    } else {
      let html = '';
      for (const p of allPosts) {
        const caption = escapeHtml(p.caption || p.text || '');
        html += '<div class="post-card">';
        if (p.photo && p.photo.length > 0) {
          html += `<img class="post-image" src="" data-fid="${p.photo[p.photo.length - 1].file_id}" alt="صورة">`;
        }
        if (caption) {
          html += `<div class="post-caption">${caption}</div>`;
        }
        html += `<div class="post-date">${timeAgo(p.date)}</div></div>`;
      }
      container.innerHTML = html;

      document.querySelectorAll('.post-image[data-fid]').forEach(async (img) => {
        try {
          const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${img.dataset.fid}`);
          const d = await r.json();
          if (d.ok && d.result.file_path) {
            img.src = `https://api.telegram.org/file/bot${BOT_TOKEN}/${d.result.file_path}`;
          }
        } catch(e) { img.style.display = 'none'; }
      });
    }

    status.style.display = 'none';
    container.style.display = '';
    document.getElementById('last-update').textContent =
      `آخر تحديث: ${new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' })}`;

  } catch (e) {
    status.innerHTML = '🔴 ' + e.message;
    status.style.display = '';
  }

  btn.textContent = '🔄 تحديث';
}

function timeAgo(unixtime) {
  const diff = Math.floor(Date.now() / 1000) - unixtime;
  if (diff < 60) return 'الآن';
  if (diff < 3600) return `منذ ${Math.floor(diff / 60)} د`;
  if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`;
  const d = new Date(unixtime * 1000);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

document.getElementById('hijri-header').textContent = formatHijri(new Date());
setInterval(() => { document.getElementById('hijri-header').textContent = formatHijri(new Date()); }, 60000);
fetchPosts();
setInterval(fetchPosts, 60000);
