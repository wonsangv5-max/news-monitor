import os
import requests
import json
from datetime import datetime

# GitHub Secrets에서 API 키를 가져옵니다.
CLIENT_ID = os.environ.get('NAVER_CLIENT_ID')
CLIENT_SECRET = os.environ.get('NAVER_CLIENT_SECRET')

def get_news(keyword):
    # 네이버 뉴스 검색 API (유사도순 sort=sim / 5개 추출)
    url = f"https://openapi.naver.com/v1/search/news.json?query={keyword}&display=5&sort=sim"
    headers = {
        "X-Naver-Client-Id": CLIENT_ID,
        "X-Naver-Client-Secret": CLIENT_SECRET
    }
    
    try:
        res = requests.get(url, headers=headers)
        if res.status_code == 200:
            items = res.json().get('items', [])
            return [{
                "title": item['title'].replace('<b>', '').replace('</b>', '').replace('&quot;', '"').replace('&apos;', "'"),
                "url": item['link'],
                "source": "Naver News",
                "description": item['description'].replace('<b>', '').replace('</b>', '')[:100] + "..."
            } for item in items]
    except Exception as e:
        print(f"Error fetching {keyword}: {e}")
    return []

def main():
    # 1. keywords.json 파일에서 키워드 목록 읽기
    if not os.path.exists('keywords.json'):
        print("keywords.json 파일이 없습니다.")
        return

    with open('keywords.json', 'r', encoding='utf-8') as f:
        keywords = json.load(f)

    # 2. 각 키워드별 뉴스 수집
    results = []
    for kw in keywords:
        print(f"Fetching news for: {kw}")
        articles = get_news(kw)
        results.append({"keyword": kw, "articles": articles})

    # 3. 결과 데이터 생성 및 저장
    output = {
        "updatedAt": datetime.now().isoformat(),
        "results": results
    }
    
    os.makedirs('data', exist_ok=True)
    with open('data/news.json', 'w', encoding='utf-8') as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print("Successfully updated news.json")

if __name__ == "__main__":
    main()