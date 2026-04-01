const fs = require('fs');
const https = require('https');

const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID;
const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

// ── 네이버 뉴스 검색 ──────────────────────────────────
function fetchNews(keyword) {
  return new Promise((resolve, reject) => {
    const query = encodeURIComponent(keyword);
    const options = {
      hostname: 'openapi.naver.com',
      path: `/v1/search/news.json?query=${query}&display=50&sort=date`,
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

// ── 제목 기반 자동 요약 ───────────────────────────────
function autoSummarize(keyword, articles) {
  if (articles.length === 0) return `"${keyword}" 관련 뉴스를 찾을 수 없습니다.`;

  const stopWords = new Set(['관련','대한','위한','통해','따른','있는','하는','되는','이번','오늘','지난','올해','내년','지금','현재','이후','이전','최근','기존','새로운','이상','이하','해당','및','등','또','더','각','전','후','내','외','중','간','약','약간']);
  const wordCount = {};
  articles.forEach(a => {
    const words = a.title.replace(/[^가-힣a-zA-Z0-9 ]/g, ' ').split(/\s+/);
    words.forEach(w => {
      if (w.length >= 2 && !stopWords.has(w) && w !== keyword) {
        wordCount[w] = (wordCount[w] || 0) + 1;
      }
    });
  });

  const topWords = Object.entries(wordCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([w]) => w);

  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dateStr = `${kst.getUTCMonth()+1}월 ${kst.getUTCDate()}일`;

  const sources = [...new Set(articles.map(a => a.source))].slice(0, 3).join(', ');
  const keyTopics = topWords.length > 0 ? topWords.join(', ') : '다양한 주제';

  return `${dateStr} 기준 "${keyword}" 관련 뉴스 ${articles.length}건이 수집되었습니다. ` +
    `${sources} 등에서 보도되었으며, ${keyTopics} 등의 내용이 주요 이슈로 다뤄지고 있습니다.`;
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

// ── 중복 제거 ─────────────────────────────────────────
// usedUrls: 이미 다른 키워드에서 사용된 URL Set (키워드 간 중복 방지)
function deduplicate(items, usedUrls) {
  const seenUrls = new Set();
  const seenTitles = new Set();

  return items.filter(item => {
    const url = item.originallink || item.link || '';
    const titleKey = stripHtml(item.title).slice(0, 15);

    // 같은 키워드 내 중복 OR 다른 키워드에서 이미 사용된 URL 제외
    if (seenUrls.has(url) || seenTitles.has(titleKey) || usedUrls.has(url)) return false;

    seenUrls.add(url);
    seenTitles.add(titleKey);
    return true;
  });
}

// ── 메인 ─────────────────────────────────────────────
async function main() {
  const keywords = JSON.parse(fs.readFileSync('keywords.json', 'utf8'));
  const results = [];
  const globalUsedUrls = new Set(); // 키워드 간 중복 방지용

  for (const keyword of keywords) {
    console.log(`\n[${keyword}] 검색 중...`);

    try {
      const data = await fetchNews(keyword);
      const raw = data.items || [];
      console.log(`  수집 ${raw.length}건`);

      const unique = deduplicate(raw, globalUsedUrls);
      console.log(`  중복 제거 후 ${unique.length}건`);

      const articles = unique.slice(0, 5).map(item => {
        const url = item.originallink || item.link;
        globalUsedUrls.add(url); // 전역 사용 URL에 등록
        return {
          title: stripHtml(item.title),
          source: (() => {
            try { return new URL(item.originallink).hostname.replace('www.', ''); }
            catch(e) { return '네이버뉴스'; }
          })(),
          url,
          description: stripHtml(item.description),
          pubDate: item.pubDate,
        };
      });

      const summary = autoSummarize(keyword, articles);
      results.push({ keyword, summary, articles });
      console.log(`  최종 ${articles.length}건 저장`);

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
