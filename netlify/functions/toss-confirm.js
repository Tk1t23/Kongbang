// 토스페이먼츠 결제 확인 + 코인 주문서 발행 (Netlify 함수)
// 환경변수: TOSS_SECRET_KEY (시크릿 키), FIREBASE_SERVICE_ACCOUNT (서비스 계정 JSON 전체)
const admin = require('firebase-admin');

const PACKS = {   // 클라이언트(pp_pay.js)의 PAY_PACKS와 같아야 해요. 가격은 항상 이 표로만 확인해요. (10,000코인 = 5,000원)
  c1: { won: 5000, coins: 10000 },
  c2: { won: 10000, coins: 20000 },
  c3: { won: 20000, coins: 40000 },
  c4: { won: 30000, coins: 60000 },
  c5: { won: 50000, coins: 100000 },
};

function init() {
  if (admin.apps.length) return;
  admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
}
const reply = (code, body) => ({ statusCode: code, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

exports.handler = async event => {
  if (event.httpMethod !== 'POST') return reply(405, { message: 'POST only' });
  try {
    init();
    const m = /^Bearer (.+)$/.exec(event.headers.authorization || event.headers.Authorization || '');
    if (!m) return reply(401, { message: '로그인이 필요해요.' });
    const uid = (await admin.auth().verifyIdToken(m[1])).uid;
    const { paymentKey, orderId, amount } = JSON.parse(event.body || '{}');
    if (typeof paymentKey !== 'string' || typeof orderId !== 'string' || !/^[A-Za-z0-9_=-]{6,64}$/.test(orderId)) return reply(400, { message: '잘못된 요청이에요.' });
    const pack = PACKS[orderId.split('-')[0]];
    if (!pack || Number(amount) !== pack.won) return reply(400, { message: '금액이 맞지 않아요.' });

    const ref = admin.firestore().doc('purchases/' + uid + '/orders/' + orderId);
