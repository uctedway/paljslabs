// api/controller/core.js
const db = require('../../core/utils/db');

/* =========================================================
   공용: 세션에서 login_id 가져오기
   - setUserSession() 구조 기준: req.session.user.login_id
   - 없으면 '' 반환
========================================================= */
function getSessionLoginId(req) {
  try {
	return (req && req.session && req.session.user && req.session.user.login_id)
	  ? String(req.session.user.login_id)
	  : '';
  } catch (e) {
	return '';
  }
}

/* =========================================================
   공용: API 요청 시작 저장 (세션 기반)
   - 세션(login_id) 없으면 아무것도 안 함: null 리턴
   - dbo.PJ_USP_BEGIN_API_REQUEST
========================================================= */
async function beginApiRequest(req, service_code, request_data, relative_id = 0) {
  const login_id = getSessionLoginId(req);
  if (!login_id) {
	console.warn(`[API LOG] BEGIN skip: login_id 없음 (service_code=${service_code || ''})`);
	return null;
  }

  const q_login_id = db.convertQ(login_id);
  const q_service_code = db.convertQ(service_code || '');
  const q_request_data = db.convertQ(request_data || '');
  const q_relative_id = Number(relative_id || 0);

  // request_data는 NVARCHAR(MAX)이므로 N''로 넣습니다.
  const query = `
		EXEC dbo.PJ_USP_BEGIN_API_REQUEST
		  @login_id     = '${q_login_id}',
		  @relative_id  = ${q_relative_id},
		  @service_code = '${q_service_code}',
		  @request_data = N'${q_request_data}'
  `;
  console.log(`[API LOG] BEGIN query\n${query}`);

  const rs = await db.query(query);
  const row = rs && rs[0] ? rs[0] : {};
  console.log('[API LOG] BEGIN result:', row);
  return row; // { resp, resp_message, req_id, ... }
}

/* =========================================================
   공용: API 응답 저장(종료) (세션 기반)
   - 세션(login_id) 없으면 아무것도 안 함: null 리턴
   - dbo.PJ_USP_FINISH_API_REQUEST
   - req_id + login_id로 검증
========================================================= */
async function finishApiRequest(
  req,
  req_id,
  status,
  response_data,
  error_message = '',
  duration_ms = 0
) {
  const login_id = getSessionLoginId(req);
  if (!login_id) {
	console.warn(`[API LOG] FINISH skip: login_id 없음 (req_id=${Number(req_id || 0)})`);
	return null;
  }

  const q_req_id = Number(req_id || 0);
  if (q_req_id <= 0) {
	console.warn(`[API LOG] FINISH skip: 유효하지 않은 req_id (${q_req_id})`);
	return null;
  }

  const q_login_id = db.convertQ(login_id);
  const q_status = db.convertQ(status || '');
  const q_response_data = db.convertQ(response_data || '');
  const q_error_message = db.convertQ(error_message || '');
  const q_duration_ms = Number(duration_ms || 0);

  const query = `
		EXEC dbo.PJ_USP_FINISH_API_REQUEST
		  @req_id        = ${q_req_id},
		  @login_id      = '${q_login_id}',
		  @response_data = N'${q_response_data}',
		  @status        = '${q_status}',
		  @error_message = N'${q_error_message}',
		  @duration_ms   = ${q_duration_ms}
  `;
  console.log(`[API LOG] FINISH query\n${query}`);

  const rs = await db.query(query);
  const row = rs && rs[0] ? rs[0] : {};
  console.log('[API LOG] FINISH result:', row);
  return row; // { resp, resp_message, req_id, status, ... }
}

module.exports = {
  beginApiRequest,
  finishApiRequest,
};
