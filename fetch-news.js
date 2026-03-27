const fs = require('fs');
const https = require('https');

const CLIENT_ID = process.env.NAVER_CLIENT_ID;
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;

function fetchNews(keyword) {
  return new Promise((resolve, reject) => {
    const query = encodeURIComponent(keyword);
    const options = {
      hostname: 'openapi.naver.com',
      path: `/v1/search/news.json?query=${query}&display=7&sort=date`,
      headers: {
        'X-Naver-Client-Id': CLIENT_ID,
        'X-Naver-Client-Secret': CLIENT_SECRET,
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function stripHtml(str) {
  if (!str) return '';
  return str
    .replace(/<[^>]*>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#039;/g, "'");
}

async function main() {
  const keywords = JSON.parse(fs.readFileSync('keywords.json', 'utf8'));
  const results = [];

  for (const keyword of keywords) {
    console.log(`검색 중: ${keyword}`);
    try {
      const data = await fetchNews(keyword);
      const items = (data.items || []).map(item => ({
        title: stripHtml(item.title),
        source: (() => {
          try { return new URL(item.originallink).hostname.replace('www.', ''); }
          catch(e) { return '네이버뉴스'; }
        })(),
        url: item.originallink || item.link,
        description: stripHtml(item.description),
        pubDate: item.pubDate,
      }));

      results.push({ keyword, articles: items });
      console.log(`  → ${items.length}건 수집 완료`);
    } catch(e) {
      console.error(`  → 오류: ${e.message}`);
      results.push({ keyword, articles: [] });
    }
  }

  const output = {
    updatedAt: new Date().toISOString(),
    results,
  };

  fs.writeFileSync('data/news.json', JSON.stringify(output, null, 2), 'utf8');
  console.log('data/news.json 저장 완료');
}

main();
