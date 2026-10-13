// 토스페이먼츠 결제 확인 + 코인 주문서 발행 (Netlify 함수)
// 환경변수: TOSS_SECRET_KEY (시크릿 키), FIREBASE_SERVICE_ACCOUNT (서비스 계정 JSON 전체)
const admin = require('firebase-admin');

const PACKS = {   // 클라이언트(pp_pay.js)의 PAY_PACKS와 같아야 해요. 가격은 항상 이 표로만 확인해요.
  c1: { won: 1000, coins: 1000 },
  c2: { won: 5000, coins: 5500 },
  c3: { won: 10000, coins: 11500 },
  c4: { won: 30000, coins: 36000 },
  c5: { won: 50000, coins: 65000 },
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
    if ((await ref.get()).exists) return reply(200, { ok: true, dup: true });   // 이미 처리한 주문

    const r = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
      method: 'POST',
      headers: { Authorization: 'Basic ' + Buffer.from(process.env.TOSS_SECRET_KEY + ':').toString('base64'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentKey, orderId, amount: pack.won }),
    });
    const p = await r.json();
    if (!r.ok || p.status !== 'DONE' || p.totalAmount !== pack.won) return reply(400, { message: p.message || '결제 승인에 실패했어요.' });

    await ref.create({ coins: pack.coins, won: pack.won, paymentKey, claimed: false, at: admin.firestore.FieldValue.serverTimestamp() });
    return reply(200, { ok: true });
  } catch (e) {
    return reply(500, { message: '서버 오류가 났어요.' });
  }
};
{ "name": "kongbang-functions", "version": "1.0.0", "private": true, "dependencies": { "firebase-admin": "^12.0.0" } }
