const fs = require('fs');
const https = require('https');

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

// ── 전일자 날짜 계산 (KST 기준) ─────────────────────────
function getYesterdayRange() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const yesterday = new Date(kst);
  yesterday.setUTCDate(kst.getUTCDate() - 1);

  const y = yesterday.getUTCFullYear();
  const m = String(yesterday.getUTCMonth() + 1).padStart(2, '0');
  const d = String(yesterday.getUTCDate()).padStart(2, '0');

  return { dateStr: `${y}-${m}-${d}`, y, m, d };
}

// ── 네이버 뉴스 검색 ──────────────────────────────────
function fetchNews(keyword) {
  return new Promise((resolve, reject) => {
    const query = encodeURIComponent(keyword);
    const options = {
      hostname: 'openapi.naver.com',
      path: `/v1/search/news.json?query=${query}&display=100&sort=date`,
      headers: {
        'X-Naver-Client-Id': NAVER_CLIENT_ID,
        'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
      }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ── 전일자 기사만 필터 (날짜 문자열 비교) ───────────────
function filterYesterday(items, y, m, d) {
  // 네이버 pubDate 예시: "Mon, 31 Mar 2026 14:30:00 +0900"
  const months = {Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
  const targetY = parseInt(y), targetM = parseInt(m), targetD = parseInt(d);

  return items.filter(item => {
    if (!item.pubDate) return false;
    try {
      const parts = item.pubDate.split(' ');
      // "Mon, 31 Mar 2026 14:30:00 +0900" → parts[1]=31, parts[2]=Mar, parts[3]=2026
      const dy = parseInt(parts[3]);
      const dm = months[parts[2]];
      const dd = parseInt(parts[1]);
      return dy === targetY && dm === targetM && dd === targetD;
    } catch(e) {
      return false;
    }
  });
}

// ── 제목 기반 자동 요약 (무료) ───────────────────────
function autoSummarize(keyword, articles) {
  if (articles.length === 0) return `"${keyword}" 관련 뉴스를 찾을 수 없습니다.`;

  // 제목에서 자주 등장하는 핵심 단어 추출 (조사/불용어 제외)
  const stopWords = new Set(['관련','대한','위한','통해','따른','있는','하는','되는','이번','오늘','지난','올해','내년','지금','현재','이후','이전','최근','기존','새로운','이상','이하','해당','및','등','또','더','각','전','후','내','외','중','간','약','약간']);
  const wordCount = {};
  articles.forEach(a => {
    const words = a.title.replace(/[^가-힣a-zA-Z0-9\s]/g, ' ').split(/\s+/);
    words.forEach(w => {
      if (w.length >= 2 && !stopWords.has(w) && w !== keyword) {
        wordCount[w] = (wordCount[w] || 0) + 1;
      }
    });
  });

  // 빈도 높은 단어 상위 5개
  const topWords = Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([w]) => w);

  // 날짜 포맷 (전일자 KST 기준)
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const yesterday = new Date(kst);
  yesterday.setUTCDate(kst.getUTCDate() - 1);
  const dateStr = `${yesterday.getUTCMonth()+1}월 ${yesterday.getUTCDate()}일`;

  // 요약 문장 생성
  const count = articles.length;
  const sources = [...new Set(articles.map(a => a.source))].slice(0, 3).join(', ');
  const keyTopics = topWords.length > 0 ? topWords.slice(0, 3).join(', ') : '다양한 주제';

  return `${dateStr} 기준 "${keyword}" 관련 뉴스 ${count}건이 수집되었습니다. ` +
    `${sources} 등에서 보도되었으며, ` +
    `${keyTopics} 등의 내용이 주요 이슈로 다뤄지고 있습니다.`;
}

// ── HTML 태그 제거 ────────────────────────────────────
function stripHtml(str) {
  if (!str) return '';
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#039;/g, "'")
    .trim();
}

// ── 중복 제거 (URL + 제목 앞 15자 기준) ──────────────
function deduplicate(items) {
  const seenUrls = new Set();
  const seenTitles = new Set();

  return items.filter(item => {
    const url = item.originallink || item.link || '';
    const titleKey = stripHtml(item.title).slice(0, 15);

    if (seenUrls.has(url) || seenTitles.has(titleKey)) return false;

    seenUrls.add(url);
    seenTitles.add(titleKey);
    return true;
  });
}

// ── 메인 ─────────────────────────────────────────────
async function main() {
  const keywords = JSON.parse(fs.readFileSync('keywords.json', 'utf8'));
  const results = [];

  for (const keyword of keywords) {
    console.log(`\n[${keyword}] 검색 중...`);

    try {
      const { dateStr, y, m, d } = getYesterdayRange();
      console.log(`  전일자 범위: ${dateStr}`);

      const data = await fetchNews(keyword);
      const raw = data.items || [];

      // 전일자 필터 적용
      const dated = filterYesterday(raw, y, m, d);
      console.log(`  전체 ${raw.length}건 → 전일자(${dateStr}) ${dated.length}건`);

      const unique = deduplicate(dated);
      console.log(`  중복 제거 후 ${unique.length}건`);

      const articles = unique.slice(0, 5).map(item => ({
        title: stripHtml(item.title),
        source: (() => {
          try { return new URL(item.originallink).hostname.replace('www.', ''); }
          catch(e) { return '네이버뉴스'; }
        })(),
        url: item.originallink || item.link,
        description: stripHtml(item.description),
        pubDate: item.pubDate,
      }));

      const summary = autoSummarize(keyword, articles);

      results.push({ keyword, summary, articles });

    } catch(e) {
      console.error(`  오류: ${e.message}`);
      results.push({ keyword, summary: '수집 오류가 발생했습니다.', articles: [] });
    }
  }

  const output = {
    updatedAt: new Date().toISOString(),
    results,
  };

  fs.writeFileSync('data/news.json', JSON.stringify(output, null, 2), 'utf8');
  console.log('\n✅ data/news.json 저장 완료');
}

main();
