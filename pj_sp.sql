SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
ALTER   PROCEDURE [dbo].[PJ_USP_CHECK_USER]
(
	@provider   VARCHAR(20)   = '',
	@login_id   VARCHAR(200)  = ''
)
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @resp VARCHAR(10) = 'ERROR';
	DECLARE @resp_message NVARCHAR(200) = N'';

	/* 1) 필수값 검증 */
	IF (ISNULL(@provider, '') = '' OR ISNULL(@login_id, '') = '')
	BEGIN
		SET @resp_message = N'PROVIDER AND LOGIN_ID REQUIRED';
		GOTO return_label;
	END

	/* 2) 회원 존재 여부 확인 */
	IF NOT EXISTS (
		SELECT 1
		FROM dbo.PJ_TB_USERS WITH (NOLOCK)
		WHERE provider = @provider
		  AND login_id = @login_id
	)
	BEGIN
		SET @resp_message = N'USER NOT FOUND';
		GOTO return_label;
	END

	/* 3) 성공 */
	SET @resp = 'OK';
	SET @resp_message = N'USER VERIFIED';

return_label:
	SELECT
		@resp AS resp,
		@resp_message AS resp_message;
END
GO


SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO


/* 새 프로시저 생성/갱신 */
ALTER   PROCEDURE [dbo].[PJ_USP_CREATE_RELATIVE]
(
	@relative_id         BIGINT       = 0,     -- 0이면 INSERT, 0보다 크면 UPDATE
	@login_id            VARCHAR(200)  = '',
	@relation            VARCHAR(20)   = '',
	@relative_name       NVARCHAR(50)  = N'',
	@relative_gender     CHAR(1)       = '',
	@relative_birth_date DATE          = NULL,
	@relative_birth_time TIME(0)       = NULL,
	@birth_time_unknown  BIT           = 0
)
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @resp VARCHAR(10) = 'ERROR';
	DECLARE @resp_message NVARCHAR(200) = N'';
	DECLARE @out_relative_id BIGINT = 0;

	/* =========================
	   1) 필수값 검증 (INSERT/UPDATE 공통)
	========================= */
	IF (ISNULL(@login_id, '') = ''
		OR ISNULL(@relation, '') = ''
		OR ISNULL(@relative_gender, '') = ''
		OR ISNULL(@relative_name, N'') = N''
		OR @relative_birth_date IS NULL)
	BEGIN
		SET @resp_message = N'REQUIRED VALUES MISSING';
		GOTO return_label;
	END

	/* =========================
	   2) 회원 존재 검증
	========================= */
	IF NOT EXISTS (SELECT 1 FROM dbo.PJ_TB_USERS WITH (NOLOCK) WHERE login_id = @login_id)
	BEGIN
		SET @resp_message = N'USER NOT FOUND';
		GOTO return_label;
	END

	/* =========================
	   3) 관계 / 성별 값 검증
	========================= */
	IF (@relation NOT IN ('SPOUSE','PARENT','GRANDPARENT','SON','DAUGHTER','SIBLING','FAMILY','FRIEND','OTHER'))
	BEGIN
		SET @resp_message = N'INVALID RELATION';
		GOTO return_label;
	END

	IF (@relative_gender NOT IN ('M','F'))
	BEGIN
		SET @resp_message = N'INVALID GENDER';
		GOTO return_label;
	END

	/* =========================
	   4) 생년월일/시 검증
	   - birth_time_unknown = 1  => time은 NULL 이어야 함
	   - birth_time_unknown = 0  => time은 필수
	========================= */
	IF (ISNULL(@birth_time_unknown, 0) = 1)
	BEGIN
		IF (@relative_birth_time IS NOT NULL)
		BEGIN
			SET @resp_message = N'BIRTH TIME MUST BE NULL WHEN UNKNOWN';
			GOTO return_label;
		END
	END
	ELSE
	BEGIN
		IF (@relative_birth_time IS NULL)
		BEGIN
			SET @resp_message = N'BIRTH TIME REQUIRED';
			GOTO return_label;
		END
	END

	/* =========================
	   5) 분기
	========================= */
	IF (ISNULL(@relative_id, 0) > 0)
		GOTO modify_label;

	GOTO create_label;

create_label:
	/* =========================
	   INSERT
	========================= */

	-- 중복 방지: 동일인 중복 등록 차단
	IF EXISTS (
		SELECT 1
		FROM dbo.PJ_TB_RELATIVES WITH (NOLOCK)
		WHERE login_id = @login_id
		  AND relation = @relation
		  AND relative_name = @relative_name
		  AND relative_birth_date = @relative_birth_date
		  AND (
				(ISNULL(@birth_time_unknown,0) = 1 AND birth_time_unknown = 1)
				OR
				(ISNULL(@birth_time_unknown,0) = 0 AND birth_time_unknown = 0 AND relative_birth_time = @relative_birth_time)
			  )
	)
	BEGIN
		SET @resp_message = N'RELATIVE ALREADY EXISTS';
		GOTO return_label;
	END

	BEGIN TRY
		INSERT INTO dbo.PJ_TB_RELATIVES
		(
			login_id,
			relation,
			relative_name,
			relative_gender,
			relative_birth_date,
			relative_birth_time,
			birth_time_unknown,
			created_at,
			updated_at
		)
		VALUES
		(
			@login_id,
			@relation,
			@relative_name,
			@relative_gender,
			@relative_birth_date,
			@relative_birth_time,
			@birth_time_unknown,
			SYSDATETIME(),
			SYSDATETIME()
		);

		SET @out_relative_id = SCOPE_IDENTITY();
		SET @resp = 'OK';
		SET @resp_message = N'RELATIVE CREATED';
		GOTO return_label;
	END TRY
	BEGIN CATCH
		SET @resp = 'ERROR';
		SET @resp_message = ERROR_MESSAGE();
		GOTO return_label;
	END CATCH


modify_label:
	/* =========================
	   UPDATE
	   - relative_id로 대상 찾고,
	   - 보안상 login_id도 일치해야 수정 가능
	========================= */

	IF NOT EXISTS (
		SELECT 1
		FROM dbo.PJ_TB_RELATIVES WITH (NOLOCK)
		WHERE relative_id = @relative_id
		  AND login_id = @login_id
	)
	BEGIN
		SET @resp_message = N'RELATIVE NOT FOUND';
		GOTO return_label;
	END

	-- 중복 방지: 자기 자신 제외하고 동일인 중복 상태가 되지 않도록
	IF EXISTS (
		SELECT 1
		FROM dbo.PJ_TB_RELATIVES WITH (NOLOCK)
		WHERE login_id = @login_id
		  AND relative_id <> @relative_id
		  AND relation = @relation
		  AND relative_name = @relative_name
		  AND relative_birth_date = @relative_birth_date
		  AND (
				(ISNULL(@birth_time_unknown,0) = 1 AND birth_time_unknown = 1)
				OR
				(ISNULL(@birth_time_unknown,0) = 0 AND birth_time_unknown = 0 AND relative_birth_time = @relative_birth_time)
			  )
	)
	BEGIN
		SET @resp_message = N'RELATIVE ALREADY EXISTS';
		GOTO return_label;
	END

	BEGIN TRY
		UPDATE dbo.PJ_TB_RELATIVES
		SET
			relation = @relation,
			relative_name = @relative_name,
			relative_gender = @relative_gender,
			relative_birth_date = @relative_birth_date,
			relative_birth_time = @relative_birth_time,
			birth_time_unknown = @birth_time_unknown,
			updated_at = SYSDATETIME()
		WHERE relative_id = @relative_id
		  AND login_id = @login_id;

		SET @out_relative_id = @relative_id;
		SET @resp = 'OK';
		SET @resp_message = N'RELATIVE UPDATED';
		GOTO return_label;
	END TRY
	BEGIN CATCH
		SET @resp = 'ERROR';
		SET @resp_message = ERROR_MESSAGE();
		GOTO return_label;
	END CATCH


return_label:
	SELECT
		@resp AS resp,
		@resp_message AS resp_message,
		@out_relative_id AS relative_id;
END
GO


SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

ALTER PROCEDURE [dbo].[PJ_USP_CREATE_USERS]
(
	@provider            VARCHAR(20)   = '',
	@login_id            VARCHAR(200)  = '',
	@email               VARCHAR(320)  = '',

	@user_pass           VARCHAR(500)  = NULL,

	@user_name           NVARCHAR(50)  = NULL,
	@user_gender         CHAR(1)       = NULL,

	@user_birth_date     DATE          = NULL,
	@user_birth_time     TIME(0)       = NULL,
	@birth_time_unknown  BIT           = 0,
	@referral_code       VARCHAR(32)   = ''
)
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @resp VARCHAR(10) = 'ERROR';
	DECLARE @resp_message NVARCHAR(200) = N'';
	DECLARE @new_id BIGINT = 0;
	DECLARE @inviter_login_id VARCHAR(200) = '';
	DECLARE @inviter_current_tokens INT = 0;
	DECLARE @inviter_next_tokens INT = 0;
	DECLARE @normalized_referral_code VARCHAR(32) = UPPER(LTRIM(RTRIM(ISNULL(@referral_code, ''))));
	DECLARE @referral_applied BIT = 0;

	/* =========================================
	   1) 필수 파라미터 검증
	========================================= */
	IF (ISNULL(@provider, '') = ''
		OR ISNULL(@login_id, '') = ''
		OR ISNULL(@email, '') = '')
	BEGIN
		SET @resp_message = N'REQUIRED VALUES MISSING';
		GOTO return_label;
	END

	/* =========================================
	   1-1) provider별 패스워드 정책
	   - EMAIL  : user_pass 필수
	   - OTHER  : user_pass 있으면 에러
	========================================= */
	IF (@provider = 'EMAIL')
	BEGIN
		IF (ISNULL(@user_pass, '') = '')
		BEGIN
			SET @resp_message = N'PASSWORD REQUIRED FOR EMAIL';
			GOTO return_label;
		END
	END
	ELSE
	BEGIN
		IF (ISNULL(@user_pass, '') <> '')
		BEGIN
			SET @resp_message = N'PASSWORD NOT ALLOWED FOR SOCIAL LOGIN';
			GOTO return_label;
		END
	END

	/* =========================================
	   2) 중복 검증
	========================================= */
	IF EXISTS (
		SELECT 1
		FROM dbo.PJ_TB_USERS WITH (NOLOCK)
		WHERE login_id = @login_id
	)
	BEGIN
		SET @resp_message = N'LOGIN_ID ALREADY EXISTS';
		GOTO return_label;
	END

	IF EXISTS (
		SELECT 1
		FROM dbo.PJ_TB_USERS WITH (NOLOCK)
		WHERE email = @email
	)
	BEGIN
		SET @resp_message = N'EMAIL ALREADY EXISTS';
		GOTO return_label;
	END

	/* =========================================
	   3) 사주 정보 선택 검증
	========================================= */
	IF (@user_birth_date IS NULL)
	BEGIN
		SET @user_birth_time = NULL;
		SET @birth_time_unknown = 0;
	END
	ELSE
	BEGIN
		IF (ISNULL(@birth_time_unknown, 0) = 1)
			SET @user_birth_time = NULL;
	END

	/* =========================================
	   4) 저장
	========================================= */
	BEGIN TRY
		BEGIN TRAN;

		INSERT INTO dbo.PJ_TB_USERS
		(
			provider,
			login_id,
			email,
			user_pass,
			user_name,
			user_gender,
			user_birth_date,
			user_birth_time,
			birth_time_unknown,
			created_at,
			updated_at
		)
		VALUES
		(
			@provider,
			@login_id,
			@email,
			@user_pass,
			@user_name,
			@user_gender,
			@user_birth_date,
			@user_birth_time,
			@birth_time_unknown,
			SYSDATETIME(),
			SYSDATETIME()
		);

		SET @new_id = SCOPE_IDENTITY();

		/* =========================================
		   4-1) 추천인 보상 처리
		   - 코드가 유효하고 미사용일 때만 1회 적립
		========================================= */
		IF (@normalized_referral_code <> '')
		BEGIN
			SELECT TOP 1
				@inviter_login_id = r.inviter_login_id
			FROM dbo.PJ_TB_REFERRALS r WITH (UPDLOCK, HOLDLOCK)
			WHERE r.invite_code = @normalized_referral_code
			  AND ISNULL(r.invitee_login_id, '') = ''
			  AND r.status = 'ISSUED';

			IF (ISNULL(@inviter_login_id, '') <> '' AND @inviter_login_id <> @login_id)
			BEGIN
				SELECT @inviter_current_tokens = ISNULL(token_balance, 0)
				FROM dbo.PJ_TB_USERS WITH (UPDLOCK, HOLDLOCK)
				WHERE login_id = @inviter_login_id;

				IF (@@ROWCOUNT > 0)
				BEGIN
					SET @inviter_next_tokens = @inviter_current_tokens + 3;

					UPDATE dbo.PJ_TB_USERS
					SET
						token_balance = @inviter_next_tokens,
						updated_at = SYSDATETIME()
					WHERE login_id = @inviter_login_id;

					INSERT INTO dbo.PJ_TB_TOKEN_LEDGER
					(
						login_id,
						entry_type,
						change_tokens,
						balance_after,
						event_code,
						reference_type,
						reference_id,
						memo,
						created_at
					)
					VALUES
					(
						@inviter_login_id,
						'EVENT',
						3,
						@inviter_next_tokens,
						'REFERRAL_INVITE',
						'REFERRAL',
						@normalized_referral_code,
						N'추천인 보상: 신규 가입',
						SYSDATETIME()
					);

					UPDATE dbo.PJ_TB_REFERRALS
					SET
						invitee_login_id = @login_id,
						status = 'COMPLETED',
						rewarded_tokens = 3,
						used_at = SYSDATETIME()
					WHERE invite_code = @normalized_referral_code
					  AND ISNULL(invitee_login_id, '') = ''
					  AND status = 'ISSUED';

					IF (@@ROWCOUNT > 0)
						SET @referral_applied = 1;
				END
			END
		END

		COMMIT TRAN;
		SET @resp = 'OK';
		SET @resp_message = N'USER CREATED';
	END TRY
	BEGIN CATCH
		IF (@@TRANCOUNT > 0) ROLLBACK TRAN;
		SET @resp = 'ERROR';
		SET @resp_message = ERROR_MESSAGE();
		GOTO return_label;
	END CATCH

return_label:

	/* =========================================
	   5) 반환
	   - OK: 생성된 회원 기본정보 반환
	   - ERROR: resp/resp_message/id + 나머지 NULL
	========================================= */
	IF (@resp = 'OK' AND @new_id > 0)
	BEGIN
		SELECT
			@resp AS resp,
			@resp_message AS resp_message,
			u.id AS id,

			u.provider,
			u.login_id,
			u.email,
			u.user_name,
			u.user_gender,
			u.user_birth_date,
			u.user_birth_time,
			u.birth_time_unknown,
			u.created_at,
			u.updated_at,
			@referral_applied AS referral_applied
		FROM dbo.PJ_TB_USERS u WITH (NOLOCK)
		WHERE u.id = @new_id;
	END
	ELSE
	BEGIN
		SELECT
			@resp AS resp,
			@resp_message AS resp_message,
			@new_id AS id,

			CAST(NULL AS VARCHAR(20))  AS provider,
			CAST(NULL AS VARCHAR(200)) AS login_id,
			CAST(NULL AS VARCHAR(320)) AS email,
			CAST(NULL AS NVARCHAR(50)) AS user_name,
			CAST(NULL AS CHAR(1))      AS user_gender,
			CAST(NULL AS DATE)         AS user_birth_date,
			CAST(NULL AS TIME(0))      AS user_birth_time,
			CAST(NULL AS BIT)          AS birth_time_unknown,
			CAST(NULL AS DATETIME2)    AS created_at,
			CAST(NULL AS DATETIME2)    AS updated_at,
			CAST(0 AS BIT)             AS referral_applied;
	END

END
GO


SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[PJ_USP_GET_OR_CREATE_REFERRAL_CODE]
(
	@login_id VARCHAR(200) = ''
)
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @resp VARCHAR(10) = 'ERROR';
	DECLARE @resp_message NVARCHAR(200) = N'';
	DECLARE @invite_code VARCHAR(32) = '';
	DECLARE @base_code VARCHAR(32) = '';

	IF (ISNULL(@login_id, '') = '')
	BEGIN
		SET @resp_message = N'LOGIN_ID REQUIRED';
		GOTO return_label;
	END

	IF NOT EXISTS (SELECT 1 FROM dbo.PJ_TB_USERS WITH (NOLOCK) WHERE login_id = @login_id)
	BEGIN
		SET @resp_message = N'USER NOT FOUND';
		GOTO return_label;
	END

	BEGIN TRY
		BEGIN TRAN;

		SELECT TOP 1 @invite_code = r.invite_code
		FROM dbo.PJ_TB_REFERRALS r WITH (UPDLOCK, HOLDLOCK)
		WHERE r.inviter_login_id = @login_id
		  AND ISNULL(r.invitee_login_id, '') = ''
		  AND r.status = 'ISSUED'
		ORDER BY r.referral_id DESC;

		IF (ISNULL(@invite_code, '') = '')
		BEGIN
			SET @base_code = UPPER(REPLACE(CONVERT(VARCHAR(36), NEWID()), '-', ''));
			SET @invite_code = LEFT(@base_code, 12);

			WHILE EXISTS (SELECT 1 FROM dbo.PJ_TB_REFERRALS WITH (NOLOCK) WHERE invite_code = @invite_code)
			BEGIN
				SET @base_code = UPPER(REPLACE(CONVERT(VARCHAR(36), NEWID()), '-', ''));
				SET @invite_code = LEFT(@base_code, 12);
			END

			INSERT INTO dbo.PJ_TB_REFERRALS
			(
				invite_code,
				inviter_login_id,
				invitee_login_id,
				status,
				rewarded_tokens,
				created_at,
				used_at
			)
			VALUES
			(
				@invite_code,
				@login_id,
				NULL,
				'ISSUED',
				0,
				SYSDATETIME(),
				NULL
			);
		END

		COMMIT TRAN;
		SET @resp = 'OK';
		SET @resp_message = N'REFERRAL CODE READY';
	END TRY
	BEGIN CATCH
		IF (@@TRANCOUNT > 0) ROLLBACK TRAN;
		SET @resp = 'ERROR';
		SET @resp_message = ERROR_MESSAGE();
	END CATCH

return_label:
	SELECT
		@resp AS resp,
		@resp_message AS resp_message,
		@login_id AS login_id,
		@invite_code AS invite_code;
END
GO


SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
ALTER   PROCEDURE [dbo].[PJ_USP_FINISH_API_REQUEST]
(
	@req_id         BIGINT         = 0,
	@login_id       VARCHAR(200)   = '',

	-- 응답 전문
	@response_data  NVARCHAR(MAX)  = N'',

	-- 성공/실패 상태 (SUCCESS / FAILED)
	@status         VARCHAR(20)    = 'SUCCESS',

	-- 실패 시 메시지(성공이면 비워도 됨)
	@error_message  NVARCHAR(2000) = N'',

	-- 소요 시간(ms). 서버에서 계산해서 넘기는 방식
	@duration_ms    INT            = 0
)
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @resp         VARCHAR(10)   = 'ERROR';
	DECLARE @resp_message NVARCHAR(200) = N'';
	DECLARE @updated      INT           = 0;

	/* =========================================================
	   1) 필수값 검증
	   ========================================================= */
	IF (ISNULL(@req_id, 0) <= 0)
	BEGIN
		SET @resp_message = N'REQ_ID REQUIRED';
		GOTO return_label;
	END

	IF (ISNULL(@login_id, '') = '')
	BEGIN
		SET @resp_message = N'LOGIN_ID REQUIRED';
		GOTO return_label;
	END

	IF (ISNULL(@status, '') = '')
	BEGIN
		SET @resp_message = N'STATUS REQUIRED';
		GOTO return_label;
	END

	IF (@status NOT IN ('SUCCESS', 'FAILED'))
	BEGIN
		SET @resp_message = N'INVALID STATUS';
		GOTO return_label;
	END

	-- 성공이면 response_data 필수, 실패이면 error_message 또는 response_data 둘 중 하나는 있어야 함(최소)
	IF (@status = 'SUCCESS' AND ISNULL(@response_data, N'') = N'')
	BEGIN
		SET @resp_message = N'RESPONSE_DATA REQUIRED';
		GOTO return_label;
	END

	IF (@status = 'FAILED' AND ISNULL(@response_data, N'') = N'' AND ISNULL(@error_message, N'') = N'')
	BEGIN
		SET @resp_message = N'RESPONSE_DATA OR ERROR_MESSAGE REQUIRED';
		GOTO return_label;
	END

	/* =========================================================
	   2) req_id + login_id 존재/소유 검증
	   ========================================================= */
	IF NOT EXISTS (
		SELECT 1
		FROM dbo.PJ_TB_API_REQUESTS WITH (NOLOCK)
		WHERE req_id = @req_id
		  AND login_id = @login_id
	)
	BEGIN
		SET @resp_message = N'REQUEST NOT FOUND';
		GOTO return_label;
	END

	/* =========================================================
	   3) 저장 (응답 전문 + 종료 시각 + 상태)
	   ========================================================= */
	BEGIN TRY
		UPDATE dbo.PJ_TB_API_REQUESTS
		SET
			status = @status,
			response_data = CASE WHEN ISNULL(@response_data, N'') <> N'' THEN @response_data ELSE response_data END,
			error_message = CASE WHEN ISNULL(@error_message, N'') <> N'' THEN @error_message ELSE NULL END,
			responded_at = SYSDATETIME(),
			duration_ms = CASE WHEN ISNULL(@duration_ms, 0) > 0 THEN @duration_ms ELSE duration_ms END
		WHERE req_id = @req_id
		  AND login_id = @login_id;

		SET @updated = @@ROWCOUNT;

		IF (@updated = 0)
		BEGIN
			SET @resp_message = N'NOT UPDATED';
			GOTO return_label;
		END

		SET @resp = 'OK';
		SET @resp_message = N'REQUEST FINISHED';
	END TRY
	BEGIN CATCH
		SET @resp = 'ERROR';
		SET @resp_message = ERROR_MESSAGE();
	END CATCH

return_label:
	SELECT
		@resp AS resp,
		@resp_message AS resp_message,
		@req_id AS req_id,
		@login_id AS login_id,
		@status AS status;
END
GO


SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

ALTER   PROCEDURE [dbo].[PJ_USP_GET_USER_SESSION]
(
	@provider   VARCHAR(20)   = '',
	@login_id   VARCHAR(200)  = ''
)
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @resp         VARCHAR(10)    = 'ERROR';
	DECLARE @resp_message NVARCHAR(200)  = N'';

	/* =========================================
	   1) 필수값 검증
	========================================= */
	IF (ISNULL(@provider, '') = '' OR ISNULL(@login_id, '') = '')
	BEGIN
		SET @resp_message = N'REQUIRED VALUES MISSING';
		GOTO return_label;
	END

	/* =========================================
	   2) 존재 확인
	   - login_id가 PK라서 빠르게 찾힘
	   - provider도 같이 검증 (소셜 구분용)
	========================================= */
	IF NOT EXISTS (
		SELECT 1
		FROM dbo.PJ_TB_USERS WITH (NOLOCK)
		WHERE provider = @provider
		  AND login_id = @login_id
	)
	BEGIN
		SET @resp_message = N'USER NOT FOUND';
		GOTO return_label;
	END

	SET @resp = 'OK';
	SET @resp_message = N'OK';

return_label:

	/* =========================================
	   3) 응답 + 세션용 데이터
	   - OK면 사용자 정보 포함
	   - ERROR면 빈 row 반환(필드 구조 유지)
	========================================= */
	IF (@resp = 'OK')
	BEGIN
		SELECT
			@resp AS resp,
			@resp_message AS resp_message,

			id,
			provider,
			login_id,
			email,
			user_name,

			user_gender,
			user_birth_date,
			user_birth_time,
			birth_time_unknown,

			created_at,
			updated_at
		FROM dbo.PJ_TB_USERS WITH (NOLOCK)
		WHERE provider = @provider
		  AND login_id = @login_id;
	END
	ELSE
	BEGIN
		SELECT
			@resp AS resp,
			@resp_message AS resp_message,

			CAST(0 AS BIGINT)           AS id,
			CAST('' AS VARCHAR(20))     AS provider,
			CAST('' AS VARCHAR(200))    AS login_id,
			CAST('' AS VARCHAR(320))    AS email,
			CAST(NULL AS NVARCHAR(50))  AS user_name,

			CAST(NULL AS CHAR(1))       AS user_gender,
			CAST(NULL AS DATE)          AS user_birth_date,
			CAST(NULL AS TIME(0))       AS user_birth_time,
			CAST(NULL AS BIT)           AS birth_time_unknown,

			CAST(NULL AS DATETIME2(0))  AS created_at,
			CAST(NULL AS DATETIME2(0))  AS updated_at;
	END
END
GO


SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
ALTER   PROCEDURE [dbo].[PJ_USP_MODIFY_USER]
(
	@login_id            VARCHAR(200) = '',

	@user_gender         CHAR(1)      = NULL,
	@user_birth_date     DATE         = NULL,
	@user_birth_time     TIME(0)      = NULL,
	@birth_time_unknown  BIT          = NULL
)
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @resp VARCHAR(10) = 'ERROR';
	DECLARE @resp_message NVARCHAR(200) = N'';
	DECLARE @updated INT = 0;

	/* =========================================
	   1) 필수 파라미터 검증
	========================================= */
	IF (ISNULL(@login_id, '') = '')
	BEGIN
		SET @resp_message = N'LOGIN_ID REQUIRED';
		GOTO return_label;
	END

	/* =========================================
	   2) 대상 사용자 존재 확인
	========================================= */
	IF NOT EXISTS (SELECT 1 FROM dbo.PJ_TB_USERS WITH (NOLOCK) WHERE login_id = @login_id)
	BEGIN
		SET @resp_message = N'USER NOT FOUND';
		GOTO return_label;
	END

	/* =========================================
	   3) 입력값 검증
	   - gender: 'M'/'F' (원하시면 범위 확장 가능)
	   - birth_time_unknown 규칙
	========================================= */
	IF (@user_gender IS NOT NULL AND @user_gender NOT IN ('M', 'F'))
	BEGIN
		SET @resp_message = N'INVALID GENDER';
		GOTO return_label;
	END

	-- 날짜 없이 시간만 들어오면 거부
	IF (@user_birth_date IS NULL AND @user_birth_time IS NOT NULL)
	BEGIN
		SET @resp_message = N'BIRTH DATE REQUIRED WHEN TIME PROVIDED';
		GOTO return_label;
	END

	-- unknown 플래그가 1이면 time은 NULL 이어야 함
	IF (@birth_time_unknown = 1 AND @user_birth_time IS NOT NULL)
	BEGIN
		SET @resp_message = N'BIRTH TIME MUST BE NULL WHEN UNKNOWN';
		GOTO return_label;
	END

	/* =========================================
	   4) 수정
	   - 전달된 값만 반영(미전달(NULL)은 기존값 유지)
	   - birth_date가 NULL로 들어오면(미전달) 기존 유지
	   - birth_date를 명시적으로 NULL로 "삭제"하는 기능은 제공하지 않음
	========================================= */
	BEGIN TRY
		UPDATE dbo.PJ_TB_USERS
		SET
			user_gender = COALESCE(@user_gender, user_gender),

			user_birth_date = COALESCE(@user_birth_date, user_birth_date),

			user_birth_time =
				CASE
					WHEN @user_birth_date IS NULL AND @user_birth_time IS NULL AND @birth_time_unknown IS NULL
						THEN user_birth_time
					WHEN @birth_time_unknown = 1
						THEN NULL
					WHEN @user_birth_date IS NOT NULL AND @user_birth_time IS NOT NULL
						THEN @user_birth_time
					ELSE user_birth_time
				END,

			birth_time_unknown =
				CASE
					WHEN @user_birth_date IS NULL AND @user_birth_time IS NULL AND @birth_time_unknown IS NULL
						THEN birth_time_unknown
					WHEN @user_birth_date IS NULL
						THEN birth_time_unknown
					WHEN @birth_time_unknown IS NULL
						THEN birth_time_unknown
					ELSE @birth_time_unknown
				END,

			updated_at = SYSDATETIME()
		WHERE login_id = @login_id;

		SET @updated = @@ROWCOUNT;

		IF (@updated = 0)
		BEGIN
			SET @resp_message = N'NOT UPDATED';
			GOTO return_label;
		END

		SET @resp = 'OK';
		SET @resp_message = N'USER UPDATED';
	END TRY
	BEGIN CATCH
		SET @resp = 'ERROR';
		SET @resp_message = ERROR_MESSAGE();
		GOTO return_label;
	END CATCH

return_label:
	SELECT
		@resp AS resp,
		@resp_message AS resp_message;
END
GO


SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
ALTER   PROCEDURE [dbo].[PJ_USP_SAVE_SAJU_RAW_DATA]
(
	@login_id       VARCHAR(200)   = '',
	@relative_id    BIGINT         = 0,
	@saju_raw_data  NVARCHAR(MAX)  = N''
)
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @resp VARCHAR(10) = 'ERROR';
	DECLARE @resp_message NVARCHAR(200) = N'';
	DECLARE @target VARCHAR(20) = '';
	DECLARE @updated INT = 0;

	/* =========================
	   1) 필수값 검증
	========================= */
	IF (ISNULL(@saju_raw_data, N'') = N'')
	BEGIN
		SET @resp_message = N'SAJU RAW DATA REQUIRED';
		GOTO return_label;
	END

	/* =========================
	   2) 키 검증 (둘 중 하나만 허용)
	========================= */
	IF (ISNULL(@login_id, '') = '' AND ISNULL(@relative_id, 0) <= 0)
	BEGIN
		SET @resp_message = N'LOGIN_ID OR RELATIVE_ID REQUIRED';
		GOTO return_label;
	END

	IF (ISNULL(@login_id, '') <> '' AND ISNULL(@relative_id, 0) > 0)
	BEGIN
		SET @resp_message = N'ONLY ONE KEY ALLOWED';
		GOTO return_label;
	END

	/* =========================
	   3) 분기
	========================= */
	IF (ISNULL(@login_id, '') <> '')
		GOTO user_label;

	GOTO relative_label;


user_label:
	/* =========================
	   4-A) 회원 테이블 저장
	========================= */
	IF NOT EXISTS (SELECT 1 FROM dbo.PJ_TB_USERS WITH (NOLOCK) WHERE login_id = @login_id)
	BEGIN
		SET @resp_message = N'USER NOT FOUND';
		GOTO return_label;
	END

	BEGIN TRY
		UPDATE dbo.PJ_TB_USERS
		SET
			saju_raw_data = @saju_raw_data,
			updated_at = SYSDATETIME()
		WHERE login_id = @login_id;

		SET @updated = @@ROWCOUNT;
		IF (@updated = 0)
		BEGIN
			SET @resp_message = N'NOT UPDATED';
			GOTO return_label;
		END

		SET @target = 'USER';
		SET @resp = 'OK';
		SET @resp_message = N'SAJU RAW DATA SAVED';
		GOTO return_label;
	END TRY
	BEGIN CATCH
		SET @resp = 'ERROR';
		SET @resp_message = ERROR_MESSAGE();
		GOTO return_label;
	END CATCH


relative_label:
	/* =========================
	   4-B) 지인 테이블 저장
	========================= */
	IF NOT EXISTS (SELECT 1 FROM dbo.PJ_TB_RELATIVES WITH (NOLOCK) WHERE relative_id = @relative_id)
	BEGIN
		SET @resp_message = N'RELATIVE NOT FOUND';
		GOTO return_label;
	END

	BEGIN TRY
		UPDATE dbo.PJ_TB_RELATIVES
		SET
			saju_raw_data = @saju_raw_data,
			updated_at = SYSDATETIME()
		WHERE relative_id = @relative_id;

		SET @updated = @@ROWCOUNT;
		IF (@updated = 0)
		BEGIN
			SET @resp_message = N'NOT UPDATED';
			GOTO return_label;
		END

		SET @target = 'RELATIVE';
		SET @resp = 'OK';
		SET @resp_message = N'SAJU RAW DATA SAVED';
		GOTO return_label;
	END TRY
	BEGIN CATCH
		SET @resp = 'ERROR';
		SET @resp_message = ERROR_MESSAGE();
		GOTO return_label;
	END CATCH


return_label:
	SELECT
		@resp AS resp,
		@resp_message AS resp_message,
		@target AS target;
END
GO


SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

ALTER PROCEDURE [dbo].[PJ_USP_SELECT_RELATIVES]
(
	@login_id   VARCHAR(200) = ''
)
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @resp VARCHAR(10) = 'ERROR';
	DECLARE @resp_message NVARCHAR(200) = N'';

	/* =========================
	   1) 필수값 검증
	========================= */
	IF (ISNULL(@login_id, '') = '')
	BEGIN
		SET @resp_message = N'LOGIN_ID REQUIRED';
		GOTO return_label;
	END

	/* =========================
	   2) 회원 존재 확인
	========================= */
	IF NOT EXISTS (SELECT 1 FROM dbo.PJ_TB_USERS WITH (NOLOCK) WHERE login_id = @login_id)
	BEGIN
		SET @resp_message = N'USER NOT FOUND';
		GOTO return_label;
	END

	/* =========================
	   3) 목록 조회
	========================= */
	SET @resp = 'OK';
	SET @resp_message = N'RELATIVES SELECTED';

	SELECT
		@resp AS resp,
		@resp_message AS resp_message,
		r.relative_id,
		r.login_id,
		r.relation,
		r.relative_name,
		r.relative_gender,
		r.relative_birth_date,
		r.relative_birth_time,
		r.birth_time_unknown,
		r.created_at,
		r.updated_at,
		r.saju_raw_data
	FROM dbo.PJ_TB_RELATIVES r WITH (NOLOCK)
	WHERE r.login_id = @login_id
	ORDER BY r.relative_id DESC;

	RETURN;

return_label:
	SELECT
		@resp AS resp,
		@resp_message AS resp_message;
END
GO


SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

ALTER PROCEDURE [dbo].[PJ_USP_SELECT_SAJU_RAW_DATA]
(
	@login_id       VARCHAR(200) = '',
	@relative_id    BIGINT       = 0
)
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @resp VARCHAR(10) = 'ERROR';
	DECLARE @resp_message NVARCHAR(200) = N'';
	DECLARE @target VARCHAR(20) = '';

	/* =========================
	   1) 키 검증 (둘 중 하나만 허용)
	========================= */
	IF (ISNULL(@login_id, '') = '' AND ISNULL(@relative_id, 0) <= 0)
	BEGIN
		SET @resp_message = N'LOGIN_ID OR RELATIVE_ID REQUIRED';
		GOTO return_label;
	END

	IF (ISNULL(@login_id, '') <> '' AND ISNULL(@relative_id, 0) > 0)
	BEGIN
		SET @resp_message = N'ONLY ONE KEY ALLOWED';
		GOTO return_label;
	END

	/* =========================
	   2) 분기
	========================= */
	IF (ISNULL(@login_id, '') <> '')
		GOTO user_label;

	GOTO relative_label;


user_label:
	/* =========================
	   3-A) 회원 saju_raw_data 조회
	========================= */
	IF NOT EXISTS (SELECT 1 FROM dbo.PJ_TB_USERS WITH (NOLOCK) WHERE login_id = @login_id)
	BEGIN
		SET @resp_message = N'USER NOT FOUND';
		GOTO return_label;
	END

	SET @resp = 'OK';
	SET @resp_message = N'SAJU RAW DATA SELECTED';
	SET @target = 'USER';

	SELECT
		@resp AS resp,
		@resp_message AS resp_message,
		@target AS target,
		u.login_id,
		CAST(NULL AS BIGINT) AS relative_id,
		u.saju_raw_data,
		u.updated_at
	FROM dbo.PJ_TB_USERS u WITH (NOLOCK)
	WHERE u.login_id = @login_id;

	RETURN;


relative_label:
	/* =========================
	   3-B) 지인 saju_raw_data 조회
	========================= */
	IF NOT EXISTS (SELECT 1 FROM dbo.PJ_TB_RELATIVES WITH (NOLOCK) WHERE relative_id = @relative_id)
	BEGIN
		SET @resp_message = N'RELATIVE NOT FOUND';
		GOTO return_label;
	END

	SET @resp = 'OK';
	SET @resp_message = N'SAJU RAW DATA SELECTED';
	SET @target = 'RELATIVE';

	SELECT
		@resp AS resp,
		@resp_message AS resp_message,
		@target AS target,
		r.login_id,
		r.relative_id,
		r.saju_raw_data,
		r.updated_at
	FROM dbo.PJ_TB_RELATIVES r WITH (NOLOCK)
	WHERE r.relative_id = @relative_id;

	RETURN;


return_label:
	SELECT
		@resp AS resp,
		@resp_message AS resp_message,
		@target AS target;
END
GO


SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[PJ_USP_BEGIN_API_REQUEST]
(
	@login_id       VARCHAR(200)   = '',
	@relative_id    BIGINT         = 0,
	@service_code   VARCHAR(20)    = '',
	@request_data   NVARCHAR(MAX)  = N''
)
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @resp VARCHAR(10) = 'ERROR';
	DECLARE @resp_message NVARCHAR(200) = N'';
	DECLARE @req_id BIGINT = 0;

	IF (ISNULL(@login_id, '') = '')
	BEGIN
		SET @resp_message = N'LOGIN_ID REQUIRED';
		GOTO return_label;
	END

	IF (ISNULL(@service_code, '') = '')
	BEGIN
		SET @resp_message = N'SERVICE_CODE REQUIRED';
		GOTO return_label;
	END

	IF NOT EXISTS (SELECT 1 FROM dbo.PJ_TB_USERS WITH (NOLOCK) WHERE login_id = @login_id)
	BEGIN
		SET @resp_message = N'USER NOT FOUND';
		GOTO return_label;
	END

	BEGIN TRY
		INSERT INTO dbo.PJ_TB_API_REQUESTS
		(
			login_id,
			relative_id,
			service_code,
			status,
			request_data,
			requested_at
		)
		VALUES
		(
			@login_id,
			CASE WHEN ISNULL(@relative_id, 0) > 0 THEN @relative_id ELSE NULL END,
			@service_code,
			'REQUESTED',
			@request_data,
			SYSDATETIME()
		);

		SET @req_id = SCOPE_IDENTITY();
		SET @resp = 'OK';
		SET @resp_message = N'API REQUEST CREATED';
	END TRY
	BEGIN CATCH
		SET @resp = 'ERROR';
		SET @resp_message = ERROR_MESSAGE();
	END CATCH

return_label:
	SELECT
		@resp AS resp,
		@resp_message AS resp_message,
		@req_id AS req_id,
		@login_id AS login_id,
		@service_code AS service_code;
END
GO


SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[PJ_USP_GET_TOKEN_SUMMARY]
(
	@login_id VARCHAR(200) = ''
)
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @resp VARCHAR(10) = 'ERROR';
	DECLARE @resp_message NVARCHAR(200) = N'';
	DECLARE @current_tokens INT = 0;
	DECLARE @ledger_net_tokens INT = 0;
	DECLARE @sync_ok BIT = 0;

	IF (ISNULL(@login_id, '') = '')
	BEGIN
		SET @resp_message = N'LOGIN_ID REQUIRED';
		GOTO return_label;
	END

	IF NOT EXISTS (SELECT 1 FROM dbo.PJ_TB_USERS WITH (NOLOCK) WHERE login_id = @login_id)
	BEGIN
		SET @resp_message = N'USER NOT FOUND';
		GOTO return_label;
	END

	SELECT @current_tokens = ISNULL(token_balance, 0)
	FROM dbo.PJ_TB_USERS WITH (NOLOCK)
	WHERE login_id = @login_id;

	SELECT @ledger_net_tokens = ISNULL(SUM(change_tokens), 0)
	FROM dbo.PJ_TB_TOKEN_LEDGER WITH (NOLOCK)
	WHERE login_id = @login_id;

	SET @sync_ok = CASE WHEN @current_tokens = @ledger_net_tokens THEN 1 ELSE 0 END;
	SET @resp = 'OK';
	SET @resp_message = N'TOKEN SUMMARY READY';

return_label:
	SELECT
		@resp AS resp,
		@resp_message AS resp_message,
		@login_id AS login_id,
		@current_tokens AS current_tokens,
		@ledger_net_tokens AS ledger_net_tokens,
		@sync_ok AS sync_ok;
END
GO


SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[PJ_USP_CONSUME_TOKEN]
(
	@login_id        VARCHAR(200)  = '',
	@amount          INT           = 10,
	@usage_code      VARCHAR(50)   = 'SAJU_VIEW',
	@reference_type  VARCHAR(50)   = '',
	@reference_id    VARCHAR(100)  = '',
	@memo            NVARCHAR(500) = N''
)
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @resp VARCHAR(10) = 'ERROR';
	DECLARE @resp_message NVARCHAR(200) = N'';
	DECLARE @current_tokens INT = 0;
	DECLARE @next_tokens INT = 0;

	IF (ISNULL(@login_id, '') = '')
	BEGIN
		SET @resp_message = N'LOGIN_ID REQUIRED';
		GOTO return_label;
	END

	IF (ISNULL(@amount, 0) <= 0)
	BEGIN
		SET @resp_message = N'INVALID AMOUNT';
		GOTO return_label;
	END

	BEGIN TRY
		BEGIN TRAN;

		SELECT @current_tokens = ISNULL(token_balance, 0)
		FROM dbo.PJ_TB_USERS WITH (UPDLOCK, HOLDLOCK)
		WHERE login_id = @login_id;

		IF (@@ROWCOUNT = 0)
		BEGIN
			SET @resp_message = N'USER NOT FOUND';
			ROLLBACK TRAN;
			GOTO return_label;
		END

		IF (@current_tokens < @amount)
		BEGIN
			SET @resp_message = N'INSUFFICIENT_TOKENS';
			ROLLBACK TRAN;
			GOTO return_label;
		END

		SET @next_tokens = @current_tokens - @amount;

		UPDATE dbo.PJ_TB_USERS
		SET
			token_balance = @next_tokens,
			updated_at = SYSDATETIME()
		WHERE login_id = @login_id;

		INSERT INTO dbo.PJ_TB_TOKEN_LEDGER
		(
			login_id,
			entry_type,
			change_tokens,
			balance_after,
			usage_code,
			reference_type,
			reference_id,
			memo,
			created_at
		)
		VALUES
		(
			@login_id,
			'USAGE',
			(@amount * -1),
			@next_tokens,
			@usage_code,
			NULLIF(@reference_type, ''),
			NULLIF(@reference_id, ''),
			NULLIF(@memo, N''),
			SYSDATETIME()
		);

		COMMIT TRAN;
		SET @resp = 'OK';
		SET @resp_message = N'TOKEN CONSUMED';
		SET @current_tokens = @next_tokens;
	END TRY
	BEGIN CATCH
		IF (@@TRANCOUNT > 0) ROLLBACK TRAN;
		SET @resp = 'ERROR';
		SET @resp_message = ERROR_MESSAGE();
	END CATCH

return_label:
	SELECT
		@resp AS resp,
		@resp_message AS resp_message,
		@login_id AS login_id,
		ISNULL(@current_tokens, 0) AS current_tokens,
		CASE WHEN @amount > 0 THEN @amount ELSE 0 END AS consumed_tokens;
END
GO


SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[PJ_USP_REFUND_TOKEN]
(
	@login_id        VARCHAR(200)  = '',
	@amount          INT           = 10,
	@reference_type  VARCHAR(50)   = '',
	@reference_id    VARCHAR(100)  = '',
	@memo            NVARCHAR(500) = N''
)
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @resp VARCHAR(10) = 'ERROR';
	DECLARE @resp_message NVARCHAR(200) = N'';
	DECLARE @current_tokens INT = 0;
	DECLARE @next_tokens INT = 0;
	DECLARE @has_usage INT = 0;

	IF (ISNULL(@login_id, '') = '')
	BEGIN
		SET @resp_message = N'LOGIN_ID REQUIRED';
		GOTO return_label;
	END

	IF (ISNULL(@amount, 0) <= 0)
	BEGIN
		SET @resp_message = N'INVALID AMOUNT';
		GOTO return_label;
	END

	IF (ISNULL(@reference_type, '') = '' OR ISNULL(@reference_id, '') = '')
	BEGIN
		SET @resp_message = N'REFERENCE_TYPE AND REFERENCE_ID REQUIRED';
		GOTO return_label;
	END

	BEGIN TRY
		BEGIN TRAN;

		SELECT @current_tokens = ISNULL(token_balance, 0)
		FROM dbo.PJ_TB_USERS WITH (UPDLOCK, HOLDLOCK)
		WHERE login_id = @login_id;

		IF (@@ROWCOUNT = 0)
		BEGIN
			SET @resp_message = N'USER NOT FOUND';
			ROLLBACK TRAN;
			GOTO return_label;
		END

		SELECT @has_usage = COUNT(1)
		FROM dbo.PJ_TB_TOKEN_LEDGER WITH (NOLOCK)
		WHERE login_id = @login_id
		  AND entry_type = 'USAGE'
		  AND reference_type = @reference_type
		  AND reference_id = @reference_id;

		IF (@has_usage = 0)
		BEGIN
			SET @resp_message = N'USAGE REFERENCE NOT FOUND';
			ROLLBACK TRAN;
			GOTO return_label;
		END

		IF EXISTS (
			SELECT 1
			FROM dbo.PJ_TB_TOKEN_LEDGER WITH (NOLOCK)
			WHERE login_id = @login_id
			  AND entry_type = 'REFUND'
			  AND reference_type = @reference_type
			  AND reference_id = @reference_id
		)
		BEGIN
			COMMIT TRAN;
			SET @resp = 'OK';
			SET @resp_message = N'REFUND ALREADY APPLIED';
			GOTO return_label;
		END

		SET @next_tokens = @current_tokens + @amount;

		UPDATE dbo.PJ_TB_USERS
		SET
			token_balance = @next_tokens,
			updated_at = SYSDATETIME()
		WHERE login_id = @login_id;

		INSERT INTO dbo.PJ_TB_TOKEN_LEDGER
		(
			login_id,
			entry_type,
			change_tokens,
			balance_after,
			reference_type,
			reference_id,
			memo,
			created_at
		)
		VALUES
		(
			@login_id,
			'REFUND',
			@amount,
			@next_tokens,
			@reference_type,
			@reference_id,
			NULLIF(@memo, N''),
			SYSDATETIME()
		);

		COMMIT TRAN;
		SET @resp = 'OK';
		SET @resp_message = N'TOKEN REFUNDED';
		SET @current_tokens = @next_tokens;
	END TRY
	BEGIN CATCH
		IF (@@TRANCOUNT > 0) ROLLBACK TRAN;
		SET @resp = 'ERROR';
		SET @resp_message = ERROR_MESSAGE();
	END CATCH

return_label:
	SELECT
		@resp AS resp,
		@resp_message AS resp_message,
		@login_id AS login_id,
		ISNULL(@current_tokens, 0) AS current_tokens,
		CASE WHEN @amount > 0 THEN @amount ELSE 0 END AS refunded_tokens;
END
GO


SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[PJ_USP_GRANT_EVENT_TOKEN]
(
	@login_id    VARCHAR(200)  = '',
	@amount      INT           = 0,
	@event_code  VARCHAR(100)  = 'MANUAL_EVENT',
	@memo        NVARCHAR(500) = N''
)
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @resp VARCHAR(10) = 'ERROR';
	DECLARE @resp_message NVARCHAR(200) = N'';
	DECLARE @current_tokens INT = 0;
	DECLARE @next_tokens INT = 0;

	IF (ISNULL(@login_id, '') = '')
	BEGIN
		SET @resp_message = N'LOGIN_ID REQUIRED';
		GOTO return_label;
	END

	IF (ISNULL(@amount, 0) <= 0)
	BEGIN
		SET @resp_message = N'INVALID AMOUNT';
		GOTO return_label;
	END

	BEGIN TRY
		BEGIN TRAN;

		SELECT @current_tokens = ISNULL(token_balance, 0)
		FROM dbo.PJ_TB_USERS WITH (UPDLOCK, HOLDLOCK)
		WHERE login_id = @login_id;

		IF (@@ROWCOUNT = 0)
		BEGIN
			SET @resp_message = N'USER NOT FOUND';
			ROLLBACK TRAN;
			GOTO return_label;
		END

		SET @next_tokens = @current_tokens + @amount;

		UPDATE dbo.PJ_TB_USERS
		SET
			token_balance = @next_tokens,
			updated_at = SYSDATETIME()
		WHERE login_id = @login_id;

		INSERT INTO dbo.PJ_TB_TOKEN_LEDGER
		(
			login_id,
			entry_type,
			change_tokens,
			balance_after,
			event_code,
			memo,
			created_at
		)
		VALUES
		(
			@login_id,
			'EVENT',
			@amount,
			@next_tokens,
			NULLIF(@event_code, ''),
			NULLIF(@memo, N''),
			SYSDATETIME()
		);

		COMMIT TRAN;
		SET @resp = 'OK';
		SET @resp_message = N'EVENT TOKEN GRANTED';
		SET @current_tokens = @next_tokens;
	END TRY
	BEGIN CATCH
		IF (@@TRANCOUNT > 0) ROLLBACK TRAN;
		SET @resp = 'ERROR';
		SET @resp_message = ERROR_MESSAGE();
	END CATCH

return_label:
	SELECT
		@resp AS resp,
		@resp_message AS resp_message,
		@login_id AS login_id,
		ISNULL(@current_tokens, 0) AS current_tokens,
		CASE WHEN @amount > 0 THEN @amount ELSE 0 END AS granted_tokens;
END
GO


SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[PJ_USP_CREATE_PAYMENT_REQUEST]
(
	@login_id         VARCHAR(200)   = '',
	@provider         VARCHAR(20)    = '',
	@amount_krw       INT            = 0,
	@token_amount     INT            = 0,
	@request_payload  NVARCHAR(MAX)  = N''
)
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @resp VARCHAR(10) = 'ERROR';
	DECLARE @resp_message NVARCHAR(200) = N'';
	DECLARE @payment_id BIGINT = 0;

	IF (ISNULL(@login_id, '') = '')
	BEGIN
		SET @resp_message = N'LOGIN_ID REQUIRED';
		GOTO return_label;
	END

	IF (@provider NOT IN ('KAKAOPAY', 'NAVERPAY', 'PAYPAL'))
	BEGIN
		SET @resp_message = N'INVALID PROVIDER';
		GOTO return_label;
	END

	IF (ISNULL(@amount_krw, 0) <= 0 OR ISNULL(@token_amount, 0) <= 0)
	BEGIN
		SET @resp_message = N'INVALID PAYMENT AMOUNT';
		GOTO return_label;
	END

	IF NOT EXISTS (SELECT 1 FROM dbo.PJ_TB_USERS WITH (NOLOCK) WHERE login_id = @login_id)
	BEGIN
		SET @resp_message = N'USER NOT FOUND';
		GOTO return_label;
	END

	BEGIN TRY
		INSERT INTO dbo.PJ_TB_PAYMENTS
		(
			login_id,
			provider,
			status,
			amount_krw,
			token_amount,
			request_payload,
			requested_at,
			updated_at
		)
		VALUES
		(
			@login_id,
			@provider,
			'REQUESTED',
			@amount_krw,
			@token_amount,
			NULLIF(@request_payload, N''),
			SYSDATETIME(),
			SYSDATETIME()
		);

		SET @payment_id = SCOPE_IDENTITY();
		SET @resp = 'OK';
		SET @resp_message = N'PAYMENT REQUEST CREATED';
	END TRY
	BEGIN CATCH
		SET @resp = 'ERROR';
		SET @resp_message = ERROR_MESSAGE();
	END CATCH

return_label:
	SELECT
		@resp AS resp,
		@resp_message AS resp_message,
		@payment_id AS payment_id,
		@login_id AS login_id,
		@provider AS provider,
		@amount_krw AS amount_krw,
		@token_amount AS token_amount;
END
GO


SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[PJ_USP_CONFIRM_PAYMENT_SUCCESS]
(
	@payment_id        BIGINT         = 0,
	@provider_txn_id   VARCHAR(200)   = '',
	@approved_payload  NVARCHAR(MAX)  = N''
)
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @resp VARCHAR(10) = 'ERROR';
	DECLARE @resp_message NVARCHAR(200) = N'';
	DECLARE @login_id VARCHAR(200) = '';
	DECLARE @token_amount INT = 0;
	DECLARE @current_tokens INT = 0;
	DECLARE @next_tokens INT = 0;
	DECLARE @status VARCHAR(20) = '';

	IF (ISNULL(@payment_id, 0) <= 0)
	BEGIN
		SET @resp_message = N'PAYMENT_ID REQUIRED';
		GOTO return_label;
	END

	IF (ISNULL(@provider_txn_id, '') = '')
	BEGIN
		SET @resp_message = N'PROVIDER_TXN_ID REQUIRED';
		GOTO return_label;
	END

	BEGIN TRY
		BEGIN TRAN;

		SELECT
			@login_id = p.login_id,
			@token_amount = p.token_amount,
			@status = p.status
		FROM dbo.PJ_TB_PAYMENTS p WITH (UPDLOCK, HOLDLOCK)
		WHERE p.payment_id = @payment_id;

		IF (@@ROWCOUNT = 0)
		BEGIN
			SET @resp_message = N'PAYMENT NOT FOUND';
			ROLLBACK TRAN;
			GOTO return_label;
		END

		IF (@status = 'SUCCESS')
		BEGIN
			SELECT @current_tokens = ISNULL(token_balance, 0)
			FROM dbo.PJ_TB_USERS WITH (NOLOCK)
			WHERE login_id = @login_id;

			COMMIT TRAN;
			SET @resp = 'OK';
			SET @resp_message = N'PAYMENT ALREADY CONFIRMED';
			SET @token_amount = 0;
			GOTO return_label;
		END

		IF (@status IN ('FAILED', 'CANCELED'))
		BEGIN
			SET @resp_message = N'PAYMENT STATUS NOT ALLOW SUCCESS';
			ROLLBACK TRAN;
			GOTO return_label;
		END

		SELECT @current_tokens = ISNULL(token_balance, 0)
		FROM dbo.PJ_TB_USERS WITH (UPDLOCK, HOLDLOCK)
		WHERE login_id = @login_id;

		SET @next_tokens = @current_tokens + @token_amount;

		UPDATE dbo.PJ_TB_USERS
		SET
			token_balance = @next_tokens,
			updated_at = SYSDATETIME()
		WHERE login_id = @login_id;

		UPDATE dbo.PJ_TB_PAYMENTS
		SET
			status = 'SUCCESS',
			provider_txn_id = @provider_txn_id,
			approved_payload = NULLIF(@approved_payload, N''),
			approved_at = SYSDATETIME(),
			updated_at = SYSDATETIME(),
			error_message = NULL
		WHERE payment_id = @payment_id;

		INSERT INTO dbo.PJ_TB_TOKEN_LEDGER
		(
			login_id,
			entry_type,
			change_tokens,
			balance_after,
			payment_id,
			memo,
			created_at
		)
		VALUES
		(
			@login_id,
			'PAYMENT',
			@token_amount,
			@next_tokens,
			@payment_id,
			N'결제 성공 토큰 충전',
			SYSDATETIME()
		);

		COMMIT TRAN;
		SET @resp = 'OK';
		SET @resp_message = N'PAYMENT CONFIRMED';
		SET @current_tokens = @next_tokens;
	END TRY
	BEGIN CATCH
		IF (@@TRANCOUNT > 0) ROLLBACK TRAN;
		SET @resp = 'ERROR';
		SET @resp_message = ERROR_MESSAGE();
	END CATCH

return_label:
	SELECT
		@resp AS resp,
		@resp_message AS resp_message,
		@payment_id AS payment_id,
		@login_id AS login_id,
		ISNULL(@current_tokens, 0) AS current_tokens,
		CASE WHEN @token_amount > 0 THEN @token_amount ELSE 0 END AS granted_tokens;
END
GO


SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[PJ_USP_MARK_PAYMENT_FAILED]
(
	@payment_id        BIGINT         = 0,
	@provider_txn_id   VARCHAR(200)   = '',
	@error_message     NVARCHAR(2000) = N'',
	@failed_payload    NVARCHAR(MAX)  = N''
)
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @resp VARCHAR(10) = 'ERROR';
	DECLARE @resp_message NVARCHAR(200) = N'';
	DECLARE @status VARCHAR(20) = '';
	DECLARE @login_id VARCHAR(200) = '';

	IF (ISNULL(@payment_id, 0) <= 0)
	BEGIN
		SET @resp_message = N'PAYMENT_ID REQUIRED';
		GOTO return_label;
	END

	BEGIN TRY
		SELECT
			@status = p.status,
			@login_id = p.login_id
		FROM dbo.PJ_TB_PAYMENTS p WITH (UPDLOCK, HOLDLOCK)
		WHERE p.payment_id = @payment_id;

		IF (@@ROWCOUNT = 0)
		BEGIN
			SET @resp_message = N'PAYMENT NOT FOUND';
			GOTO return_label;
		END

		IF (@status = 'SUCCESS')
		BEGIN
			SET @resp_message = N'SUCCESS PAYMENT CANNOT FAIL';
			GOTO return_label;
		END

		UPDATE dbo.PJ_TB_PAYMENTS
		SET
			status = 'FAILED',
			provider_txn_id = CASE WHEN ISNULL(@provider_txn_id, '') <> '' THEN @provider_txn_id ELSE provider_txn_id END,
			failed_payload = NULLIF(@failed_payload, N''),
			error_message = NULLIF(@error_message, N''),
			failed_at = SYSDATETIME(),
			updated_at = SYSDATETIME()
		WHERE payment_id = @payment_id;

		SET @resp = 'OK';
		SET @resp_message = N'PAYMENT MARKED FAILED';
	END TRY
	BEGIN CATCH
		SET @resp = 'ERROR';
		SET @resp_message = ERROR_MESSAGE();
	END CATCH

return_label:
	SELECT
		@resp AS resp,
		@resp_message AS resp_message,
		@payment_id AS payment_id,
		@login_id AS login_id;
END
GO
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[PJ_USP_GET_PAYMENT]
(
	@payment_id BIGINT = 0
)
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @resp VARCHAR(10) = 'ERROR';
	DECLARE @resp_message NVARCHAR(200) = N'';

	IF (ISNULL(@payment_id, 0) <= 0)
	BEGIN
		SET @resp_message = N'PAYMENT_ID REQUIRED';
		GOTO return_label;
	END

	IF NOT EXISTS (SELECT 1 FROM dbo.PJ_TB_PAYMENTS WITH (NOLOCK) WHERE payment_id = @payment_id)
	BEGIN
		SET @resp_message = N'PAYMENT NOT FOUND';
		GOTO return_label;
	END

	SET @resp = 'OK';
	SET @resp_message = N'PAYMENT FOUND';

	SELECT
		@resp AS resp,
		@resp_message AS resp_message,
		p.payment_id,
		p.login_id,
		p.provider,
		p.status,
		p.amount_krw,
		p.token_amount,
		p.provider_txn_id,
		p.request_payload,
		p.pending_payload,
		p.approved_payload,
		p.canceled_payload,
		p.failed_payload,
		p.error_message,
		p.requested_at,
		p.approved_at,
		p.canceled_at,
		p.failed_at,
		p.updated_at
	FROM dbo.PJ_TB_PAYMENTS p WITH (NOLOCK)
	WHERE p.payment_id = @payment_id;

	RETURN;

return_label:
	SELECT
		@resp AS resp,
		@resp_message AS resp_message,
		@payment_id AS payment_id;
END
GO


SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[PJ_USP_UPDATE_PAYMENT_PENDING]
(
	@payment_id       BIGINT         = 0,
	@provider_txn_id  VARCHAR(200)   = '',
	@pending_payload  NVARCHAR(MAX)  = N''
)
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @resp VARCHAR(10) = 'ERROR';
	DECLARE @resp_message NVARCHAR(200) = N'';
	DECLARE @status VARCHAR(20) = '';
	DECLARE @login_id VARCHAR(200) = '';

	IF (ISNULL(@payment_id, 0) <= 0)
	BEGIN
		SET @resp_message = N'PAYMENT_ID REQUIRED';
		GOTO return_label;
	END

	IF (ISNULL(@provider_txn_id, '') = '')
	BEGIN
		SET @resp_message = N'PROVIDER_TXN_ID REQUIRED';
		GOTO return_label;
	END

	SELECT
		@status = p.status,
		@login_id = p.login_id
	FROM dbo.PJ_TB_PAYMENTS p WITH (UPDLOCK, HOLDLOCK)
	WHERE p.payment_id = @payment_id;

	IF (@@ROWCOUNT = 0)
	BEGIN
		SET @resp_message = N'PAYMENT NOT FOUND';
		GOTO return_label;
	END

	IF (@status NOT IN ('REQUESTED', 'PENDING'))
	BEGIN
		SET @resp_message = N'PAYMENT STATUS NOT ALLOW PENDING';
		GOTO return_label;
	END

	BEGIN TRY
		UPDATE dbo.PJ_TB_PAYMENTS
		SET
			status = 'PENDING',
			provider_txn_id = @provider_txn_id,
			pending_payload = NULLIF(@pending_payload, N''),
			updated_at = SYSDATETIME()
		WHERE payment_id = @payment_id;

		SET @resp = 'OK';
		SET @resp_message = N'PAYMENT PENDING UPDATED';
	END TRY
	BEGIN CATCH
		SET @resp = 'ERROR';
		SET @resp_message = ERROR_MESSAGE();
	END CATCH

return_label:
	SELECT
		@resp AS resp,
		@resp_message AS resp_message,
		@payment_id AS payment_id,
		@login_id AS login_id;
END
GO


SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE OR ALTER PROCEDURE [dbo].[PJ_USP_MARK_PAYMENT_CANCELED]
(
	@payment_id        BIGINT         = 0,
	@provider_txn_id   VARCHAR(200)   = '',
	@memo              NVARCHAR(500)  = N'',
	@canceled_payload  NVARCHAR(MAX)  = N''
)
AS
BEGIN
	SET NOCOUNT ON;

	DECLARE @resp VARCHAR(10) = 'ERROR';
	DECLARE @resp_message NVARCHAR(200) = N'';
	DECLARE @status VARCHAR(20) = '';
	DECLARE @login_id VARCHAR(200) = '';

	IF (ISNULL(@payment_id, 0) <= 0)
	BEGIN
		SET @resp_message = N'PAYMENT_ID REQUIRED';
		GOTO return_label;
	END

	SELECT
		@status = p.status,
		@login_id = p.login_id
	FROM dbo.PJ_TB_PAYMENTS p WITH (UPDLOCK, HOLDLOCK)
	WHERE p.payment_id = @payment_id;

	IF (@@ROWCOUNT = 0)
	BEGIN
		SET @resp_message = N'PAYMENT NOT FOUND';
		GOTO return_label;
	END

	IF (@status = 'SUCCESS')
	BEGIN
		SET @resp_message = N'SUCCESS PAYMENT CANNOT CANCELED';
		GOTO return_label;
	END

	BEGIN TRY
		UPDATE dbo.PJ_TB_PAYMENTS
		SET
			status = 'CANCELED',
			provider_txn_id = CASE WHEN ISNULL(@provider_txn_id, '') <> '' THEN @provider_txn_id ELSE provider_txn_id END,
			canceled_payload = NULLIF(@canceled_payload, N''),
			error_message = CASE WHEN ISNULL(@memo, N'') <> N'' THEN @memo ELSE error_message END,
			canceled_at = SYSDATETIME(),
			updated_at = SYSDATETIME()
		WHERE payment_id = @payment_id;

		SET @resp = 'OK';
		SET @resp_message = N'PAYMENT MARKED CANCELED';
	END TRY
	BEGIN CATCH
		SET @resp = 'ERROR';
		SET @resp_message = ERROR_MESSAGE();
	END CATCH

return_label:
	SELECT
		@resp AS resp,
		@resp_message AS resp_message,
		@payment_id AS payment_id,
		@login_id AS login_id;
END
GO
