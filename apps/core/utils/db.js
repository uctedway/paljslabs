// /apps/common/services/db.js
const sql = require('mssql');
const dayjs = require('dayjs');

require('dotenv').config(); // .env 읽기

// 연결 설정
const dbConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  server: process.env.DB_SERVER,
  port: parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_NAME,
  options: {
	encrypt: process.env.DB_ENCRYPT === 'true',
	trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
  },
  pool: {
	max: 10,
	min: 0,
	idleTimeoutMillis: 30000
  }
};


// ✅ [추가] 세션 전용 전역 풀 (앱 로드시 1회 연결)
const sessionPool = new sql.ConnectionPool(dbConfig);
const sessionPoolConnect = sessionPool.connect()
  .then(() => console.log('[DB] session pool connected'))
  .catch(err => console.error('[DB] session pool connect error:', err));



// 키값을 소문자로 변환하는 헬퍼 함수
function keysToLowerCase(data) {
  if (!data) return data;
  
  if (Array.isArray(data)) {
	return data.map(item => {
	  return Object.keys(item).reduce((acc, key) => {
		acc[key.toLowerCase()] = item[key];
		return acc;
	  }, {});
	});
  }
  
  // 단일 객체인 경우
  return Object.keys(data).reduce((acc, key) => {
	acc[key.toLowerCase()] = data[key];
	return acc;
  }, {});
}

// 공용 DB 메서드 (연결 + 쿼리 실행)
async function query(sqlText, params = {}) {
  let pool;
  try {
	pool = await sql.connect(dbConfig);
	const request = pool.request();
	
	// 파라미터 바인딩 (예: { id: 1, name: 'test' })
	for (const [key, value] of Object.entries(params)) {
	  request.input(key, value);
	}
	
	const result = await request.query(sqlText);
	
	// 🔥 여기서 키값을 소문자로 변환!
	return keysToLowerCase(result.recordset);
	
  } catch (err) {
	console.error('❌ DB Query Error:', err.message);
	throw err;
  } finally {
	if (pool) await pool.close();
  }
}

// 여러 레코드셋 조회 (프로시저/쿼리 공용)
async function queryMulti(sqlText, params = {}) {
  let pool;
  try {
	pool = await sql.connect(dbConfig);
	const request = pool.request();
	request.multiple = true; // ✅ 다중 recordset 허용

	// 파라미터 바인딩
	for (const [key, value] of Object.entries(params)) {
	  request.input(key, value);
	}

	const result = await request.query(sqlText);
	const sets = result.recordsets || []; // [ [rows...], [rows...] ]

	// 각 레코드셋의 키를 소문자로 변환
	return sets.map(set => keysToLowerCase(set));
  } catch (err) {
	console.error('❌ DB QueryMulti Error:', err.message);
	throw err;
  } finally {
	if (pool) await pool.close();
  }
}

// 공용 에러 응답 함수
exports.errorResponse = function (resp_message = '') {
  try {
	return {
	  resp: 'ERROR',
	  resp_type: 'alert',
	  resp_message: resp_message || '서버 처리 중 오류가 발생했습니다.',
	};
  } catch (err) {
	console.error('errorResponse fail:', err.message);
	return {
	  resp: 'ERROR',
	  resp_type: 'alert',
	  resp_message: '에러 응답 생성 중 오류가 발생했습니다.',
	};
  }
};

//문자열변환
function convertQ(v) {
  return v == null ? '' : String(v).replace(/'/g, "''");
}
//sql타임변환
function sqlTime(t) {
  if (!t) return null;
  try {
	// ★ UTC 변환 금지. 그대로 파싱 후 포맷만 변경.
	return dayjs(t).format('YYYY-MM-DD HH:mm:ss');
  } catch (e) {
	return null;
  }
}

module.exports = {
  query,
  queryMulti,
  sql,
  sessionPool,           // ✅ [추가] 세션 스토어가 사용할 풀
  sessionPoolConnect ,    // ✅ [선택] 필요 시 app에서 연결 보장 로그용,
  convertQ,
  sqlTime

};
