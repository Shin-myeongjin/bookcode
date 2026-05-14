// Vercel Serverless Function — 카카오 책 검색 API 프록시
// 환경변수 KAKAO_REST_API_KEY 필요

module.exports = async function handler(req, res) {
  // CORS 헤더 (같은 도메인이지만 안전하게)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const query = req.query.q;
  if (!query || !query.trim()) {
    return res.status(400).json({ error: '검색어(q)를 입력해주세요.' });
  }

  const API_KEY = process.env.KAKAO_REST_API_KEY;
  if (!API_KEY) {
    console.error('KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다.');
    return res.status(500).json({ error: '서버 설정 오류: API 키가 없습니다.' });
  }

  try {
    const url = `https://dapi.kakao.com/v3/search/book?query=${encodeURIComponent(query.trim())}&size=10`;

    const response = await fetch(url, {
      headers: {
        Authorization: `KakaoAK ${API_KEY}`,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`카카오 API 오류: ${response.status}`, errorText);
      return res.status(response.status).json({
        error: `카카오 API 호출 실패 (${response.status})`,
        detail: errorText,
      });
    }

    const data = await response.json();

    // 카카오 응답을 클라이언트가 쓰기 좋은 형태로 가공
    const CATEGORY_COLORS = [
      '#BA7517', '#534AB7', '#1D9E75', '#D85A30', '#185FA5',
      '#993556', '#D4537E', '#5DCAA5', '#A32D2D', '#0C447C',
      '#854F0B', '#412402', '#97C459', '#3B6D11', '#5F5E5A',
      '#EF9F27', '#085041', '#2C2C2A',
    ];

    const books = (data.documents || []).map((doc, index) => {
      // ISBN을 고유 ID로 사용 (없으면 해시 생성)
      const isbn = doc.isbn ? doc.isbn.split(' ').pop() : '';
      const id = isbn || `kakao_${hashCode(doc.title + (doc.authors || []).join(''))}`;

      // 색상: ISBN 기반으로 결정적 색상 배정 (같은 책이면 같은 색)
      const colorIndex = id
        ? Math.abs(hashCode(id)) % CATEGORY_COLORS.length
        : index % CATEGORY_COLORS.length;

      return {
        id,
        title: stripHtml(doc.title || '제목 없음'),
        author: (doc.authors || []).join(', ') || '저자 미상',
        color: CATEGORY_COLORS[colorIndex],
        pages: estimatePages(doc),
        thumbnail: doc.thumbnail || '',
        publisher: doc.publisher || '',
      };
    });

    return res.status(200).json({ books });
  } catch (err) {
    console.error('서버 오류:', err);
    return res.status(500).json({ error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.' });
  }
};

// ───── 유틸 함수 ─────

// HTML 태그 제거 (카카오 응답에 <b> 등이 포함될 수 있음)
function stripHtml(str) {
  return str.replace(/<[^>]*>/g, '');
}

// 간단한 해시 함수 (문자열 → 정수)
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // 32bit 정수로 변환
  }
  return hash;
}

// 페이지 수 추정 (카카오 API에 pages 필드 없음)
function estimatePages(doc) {
  // 가격 기반 대략적 추정: 1만원 전후 → 250~350p
  if (doc.price && doc.price > 0) {
    const estimated = Math.round(doc.price / 45); // 약 45원/페이지
    return Math.max(100, Math.min(800, estimated));
  }
  return 250; // 기본값
}
