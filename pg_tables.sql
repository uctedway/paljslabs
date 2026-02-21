SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[PJ_ANALYSIS_RESULT_STORE](
	[result_id] [nvarchar](64) NOT NULL,
	[payload_json] [nvarchar](max) NOT NULL,
	[summary_text] [nvarchar](1000) NULL,
	[created_at] [datetime2](3) NOT NULL,
	[updated_at] [datetime2](3) NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[result_id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
ALTER TABLE [dbo].[PJ_ANALYSIS_RESULT_STORE] ADD  DEFAULT (sysutcdatetime()) FOR [created_at]
GO
ALTER TABLE [dbo].[PJ_ANALYSIS_RESULT_STORE] ADD  DEFAULT (sysutcdatetime()) FOR [updated_at]
GO


SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[PJ_TB_API_REQUESTS](
	[req_id] [bigint] IDENTITY(1,1) NOT NULL,
	[login_id] [varchar](200) NOT NULL,
	[service_code] [varchar](20) NOT NULL,
	[api_call_id] [varchar](200) NULL,
	[status] [varchar](20) NOT NULL,
	[request_data] [nvarchar](max) NOT NULL,
	[response_data] [nvarchar](max) NULL,
	[error_message] [nvarchar](2000) NULL,
	[requested_at] [datetime2](0) NOT NULL,
	[responded_at] [datetime2](0) NULL,
	[duration_ms] [int] NULL,
	[relative_id] [bigint] NULL,
 CONSTRAINT [PK_PJ_TB_API_REQUESTS] PRIMARY KEY CLUSTERED 
(
	[req_id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
ALTER TABLE [dbo].[PJ_TB_API_REQUESTS] ADD  DEFAULT ('CLAUDE') FOR [service_code]
GO
ALTER TABLE [dbo].[PJ_TB_API_REQUESTS] ADD  DEFAULT ('REQUESTED') FOR [status]
GO
ALTER TABLE [dbo].[PJ_TB_API_REQUESTS] ADD  DEFAULT (sysdatetime()) FOR [requested_at]
GO
ALTER TABLE [dbo].[PJ_TB_API_REQUESTS]  WITH CHECK ADD  CONSTRAINT [CK_PJ_TB_API_REQUESTS_status] CHECK  (([status]='FAILED' OR [status]='SUCCESS' OR [status]='PROCESSING' OR [status]='REQUESTED'))
GO
ALTER TABLE [dbo].[PJ_TB_API_REQUESTS] CHECK CONSTRAINT [CK_PJ_TB_API_REQUESTS_status]
GO


SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[PJ_TB_RELATIVES](
	[relative_id] [bigint] IDENTITY(1,1) NOT NULL,
	[login_id] [varchar](200) NOT NULL,
	[relation] [varchar](20) NOT NULL,
	[relative_name] [nvarchar](50) NOT NULL,
	[relative_gender] [char](1) NULL,
	[relative_birth_date] [date] NULL,
	[relative_birth_time] [time](0) NULL,
	[birth_time_unknown] [bit] NOT NULL,
	[created_at] [datetime2](0) NOT NULL,
	[updated_at] [datetime2](0) NOT NULL,
	[saju_raw_data] [nvarchar](max) NULL,
	[token_balance] [int] NOT NULL,

 CONSTRAINT [PK_PJ_TB_RELATIVES] PRIMARY KEY CLUSTERED 
(
	[relative_id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
ALTER TABLE [dbo].[PJ_TB_RELATIVES] ADD  DEFAULT ((0)) FOR [birth_time_unknown]
GO
ALTER TABLE [dbo].[PJ_TB_RELATIVES] ADD  DEFAULT (sysdatetime()) FOR [created_at]
GO
ALTER TABLE [dbo].[PJ_TB_RELATIVES] ADD  DEFAULT (sysdatetime()) FOR [updated_at]
GO
ALTER TABLE [dbo].[PJ_TB_RELATIVES]  WITH CHECK ADD  CONSTRAINT [CK_PJ_TB_RELATIVES_birth] CHECK  (([relative_birth_date] IS NOT NULL OR [relative_birth_date] IS NULL AND [relative_birth_time] IS NULL))
GO
ALTER TABLE [dbo].[PJ_TB_RELATIVES] CHECK CONSTRAINT [CK_PJ_TB_RELATIVES_birth]
GO
ALTER TABLE [dbo].[PJ_TB_RELATIVES]  WITH CHECK ADD  CONSTRAINT [CK_PJ_TB_RELATIVES_relation] CHECK  (([relation]='OTHER' OR [relation]='FRIEND' OR [relation]='FAMILY' OR [relation]='SIBLING' OR [relation]='DAUGHTER' OR [relation]='SON' OR [relation]='GRANDPARENT' OR [relation]='PARENT' OR [relation]='SPOUSE'))
GO
ALTER TABLE [dbo].[PJ_TB_RELATIVES] CHECK CONSTRAINT [CK_PJ_TB_RELATIVES_relation]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[PJ_TB_USERS](
	[id] [bigint] IDENTITY(1,1) NOT NULL,
	[provider] [varchar](20) NOT NULL,
	[login_id] [varchar](200) NOT NULL,
	[email] [varchar](320) NOT NULL,
	[user_name] [nvarchar](50) NULL,
	[user_gender] [char](1) NULL,
	[user_birth_date] [date] NULL,
	[user_birth_time] [time](0) NULL,
	[birth_time_unknown] [bit] NULL,
	[created_at] [datetime2](0) NOT NULL,
	[updated_at] [datetime2](0) NOT NULL,
	[user_pass] [varchar](500) NULL,
	[terms_agreed] [bit] NOT NULL,
	[privacy_agreed] [bit] NOT NULL,
	[policy_agreed_at] [datetime2](0) NULL,
	[saju_raw_data] [nvarchar](max) NULL,
	[token_balance] [int] NOT NULL,
 CONSTRAINT [PK_PJ_TB_USERS] PRIMARY KEY CLUSTERED 
(
	[login_id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY],
 CONSTRAINT [UQ_PJ_TB_USERS_ID] UNIQUE NONCLUSTERED 
(
	[id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
ALTER TABLE [dbo].[PJ_TB_USERS] ADD  DEFAULT ((0)) FOR [token_balance]
GO
ALTER TABLE [dbo].[PJ_TB_USERS] ADD  DEFAULT ((0)) FOR [terms_agreed]
GO
ALTER TABLE [dbo].[PJ_TB_USERS] ADD  DEFAULT ((0)) FOR [privacy_agreed]
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[PJ_TB_REFERRALS](
	[referral_id] [bigint] IDENTITY(1,1) NOT NULL,
	[invite_code] [varchar](32) NOT NULL,
	[inviter_login_id] [varchar](200) NOT NULL,
	[invitee_login_id] [varchar](200) NULL,
	[status] [varchar](20) NOT NULL,
	[rewarded_tokens] [int] NOT NULL,
	[created_at] [datetime2](0) NOT NULL,
	[used_at] [datetime2](0) NULL,
 CONSTRAINT [PK_PJ_TB_REFERRALS] PRIMARY KEY CLUSTERED
(
	[referral_id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY],
 CONSTRAINT [UQ_PJ_TB_REFERRALS_INVITE_CODE] UNIQUE NONCLUSTERED
(
	[invite_code] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[PJ_TB_REFERRALS] ADD DEFAULT ('ISSUED') FOR [status]
GO
ALTER TABLE [dbo].[PJ_TB_REFERRALS] ADD DEFAULT ((0)) FOR [rewarded_tokens]
GO
ALTER TABLE [dbo].[PJ_TB_REFERRALS] ADD DEFAULT (sysdatetime()) FOR [created_at]
GO
ALTER TABLE [dbo].[PJ_TB_REFERRALS]  WITH CHECK ADD  CONSTRAINT [CK_PJ_TB_REFERRALS_STATUS] CHECK  (([status]='CANCELED' OR [status]='COMPLETED' OR [status]='ISSUED'))
GO
ALTER TABLE [dbo].[PJ_TB_REFERRALS] CHECK CONSTRAINT [CK_PJ_TB_REFERRALS_STATUS]
GO
ALTER TABLE [dbo].[PJ_TB_REFERRALS]  WITH CHECK ADD  CONSTRAINT [FK_PJ_TB_REFERRALS_INVITER] FOREIGN KEY([inviter_login_id])
REFERENCES [dbo].[PJ_TB_USERS] ([login_id])
GO
ALTER TABLE [dbo].[PJ_TB_REFERRALS]  WITH CHECK ADD  CONSTRAINT [FK_PJ_TB_REFERRALS_INVITEE] FOREIGN KEY([invitee_login_id])
REFERENCES [dbo].[PJ_TB_USERS] ([login_id])
GO
CREATE UNIQUE NONCLUSTERED INDEX [UX_PJ_TB_REFERRALS_INVITEE_NOT_NULL]
ON [dbo].[PJ_TB_REFERRALS] ([invitee_login_id])
WHERE [invitee_login_id] IS NOT NULL
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[PJ_TB_PAYMENTS](
	[payment_id] [bigint] IDENTITY(1,1) NOT NULL,
	[login_id] [varchar](200) NOT NULL,
	[provider] [varchar](20) NOT NULL,
	[status] [varchar](20) NOT NULL,
	[amount_krw] [int] NOT NULL,
	[token_amount] [int] NOT NULL,
	[provider_txn_id] [varchar](200) NULL,
	[request_payload] [nvarchar](max) NULL,
	[pending_payload] [nvarchar](max) NULL,
	[approved_payload] [nvarchar](max) NULL,
	[canceled_payload] [nvarchar](max) NULL,
	[failed_payload] [nvarchar](max) NULL,
	[error_message] [nvarchar](2000) NULL,
	[requested_at] [datetime2](0) NOT NULL,
	[approved_at] [datetime2](0) NULL,
	[canceled_at] [datetime2](0) NULL,
	[failed_at] [datetime2](0) NULL,
	[updated_at] [datetime2](0) NOT NULL,
 CONSTRAINT [PK_PJ_TB_PAYMENTS] PRIMARY KEY CLUSTERED 
(
	[payment_id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
ALTER TABLE [dbo].[PJ_TB_PAYMENTS] ADD  DEFAULT ('REQUESTED') FOR [status]
GO
ALTER TABLE [dbo].[PJ_TB_PAYMENTS] ADD  DEFAULT (sysdatetime()) FOR [requested_at]
GO
ALTER TABLE [dbo].[PJ_TB_PAYMENTS] ADD  DEFAULT (sysdatetime()) FOR [updated_at]
GO
ALTER TABLE [dbo].[PJ_TB_PAYMENTS]  WITH CHECK ADD  CONSTRAINT [CK_PJ_TB_PAYMENTS_PROVIDER] CHECK  (([provider]='PAYPAL' OR [provider]='NAVERPAY' OR [provider]='KAKAOPAY'))
GO
ALTER TABLE [dbo].[PJ_TB_PAYMENTS] CHECK CONSTRAINT [CK_PJ_TB_PAYMENTS_PROVIDER]
GO
ALTER TABLE [dbo].[PJ_TB_PAYMENTS]  WITH CHECK ADD  CONSTRAINT [CK_PJ_TB_PAYMENTS_STATUS] CHECK  (([status]='CANCELED' OR [status]='FAILED' OR [status]='SUCCESS' OR [status]='PENDING' OR [status]='REQUESTED'))
GO
ALTER TABLE [dbo].[PJ_TB_PAYMENTS] CHECK CONSTRAINT [CK_PJ_TB_PAYMENTS_STATUS]
GO
ALTER TABLE [dbo].[PJ_TB_PAYMENTS]  WITH CHECK ADD  CONSTRAINT [FK_PJ_TB_PAYMENTS_USERS] FOREIGN KEY([login_id])
REFERENCES [dbo].[PJ_TB_USERS] ([login_id])
GO

SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[PJ_TB_TOKEN_LEDGER](
	[ledger_id] [bigint] IDENTITY(1,1) NOT NULL,
	[login_id] [varchar](200) NOT NULL,
	[entry_type] [varchar](20) NOT NULL,
	[change_tokens] [int] NOT NULL,
	[balance_after] [int] NOT NULL,
	[payment_id] [bigint] NULL,
	[usage_code] [varchar](50) NULL,
	[reference_type] [varchar](50) NULL,
	[reference_id] [varchar](100) NULL,
	[event_code] [varchar](100) NULL,
	[memo] [nvarchar](500) NULL,
	[created_at] [datetime2](0) NOT NULL,
 CONSTRAINT [PK_PJ_TB_TOKEN_LEDGER] PRIMARY KEY CLUSTERED 
(
	[ledger_id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
) ON [PRIMARY]
GO
ALTER TABLE [dbo].[PJ_TB_TOKEN_LEDGER] ADD  DEFAULT (sysdatetime()) FOR [created_at]
GO
ALTER TABLE [dbo].[PJ_TB_TOKEN_LEDGER]  WITH CHECK ADD  CONSTRAINT [CK_PJ_TB_TOKEN_LEDGER_ENTRY] CHECK  (([entry_type]='REFUND' OR [entry_type]='ADJUSTMENT' OR [entry_type]='EVENT' OR [entry_type]='USAGE' OR [entry_type]='PAYMENT'))
GO
ALTER TABLE [dbo].[PJ_TB_TOKEN_LEDGER] CHECK CONSTRAINT [CK_PJ_TB_TOKEN_LEDGER_ENTRY]
GO
ALTER TABLE [dbo].[PJ_TB_TOKEN_LEDGER]  WITH CHECK ADD  CONSTRAINT [CK_PJ_TB_TOKEN_LEDGER_NONZERO] CHECK  (([change_tokens]<>(0)))
GO
ALTER TABLE [dbo].[PJ_TB_TOKEN_LEDGER] CHECK CONSTRAINT [CK_PJ_TB_TOKEN_LEDGER_NONZERO]
GO
ALTER TABLE [dbo].[PJ_TB_TOKEN_LEDGER]  WITH CHECK ADD  CONSTRAINT [FK_PJ_TB_TOKEN_LEDGER_USERS] FOREIGN KEY([login_id])
REFERENCES [dbo].[PJ_TB_USERS] ([login_id])
GO
ALTER TABLE [dbo].[PJ_TB_TOKEN_LEDGER]  WITH CHECK ADD  CONSTRAINT [FK_PJ_TB_TOKEN_LEDGER_PAYMENTS] FOREIGN KEY([payment_id])
REFERENCES [dbo].[PJ_TB_PAYMENTS] ([payment_id])
GO

IF COL_LENGTH('dbo.PJ_ANALYSIS_RESULT_STORE', 'payload_login_id') IS NULL
BEGIN
	ALTER TABLE dbo.PJ_ANALYSIS_RESULT_STORE
	ADD payload_login_id AS CONVERT(VARCHAR(200), JSON_VALUE(payload_json, '$.loginId')) PERSISTED;
END
GO

IF COL_LENGTH('dbo.PJ_ANALYSIS_RESULT_STORE', 'payload_share_token') IS NULL
BEGIN
	ALTER TABLE dbo.PJ_ANALYSIS_RESULT_STORE
	ADD payload_share_token AS CONVERT(VARCHAR(128), JSON_VALUE(payload_json, '$.share.token')) PERSISTED;
END
GO

IF COL_LENGTH('dbo.PJ_ANALYSIS_RESULT_STORE', 'payload_share_enabled') IS NULL
BEGIN
	ALTER TABLE dbo.PJ_ANALYSIS_RESULT_STORE
	ADD payload_share_enabled AS CONVERT(VARCHAR(10), JSON_VALUE(payload_json, '$.share.enabled')) PERSISTED;
END
GO

IF NOT EXISTS (
	SELECT 1
	FROM sys.indexes
	WHERE object_id = OBJECT_ID('dbo.PJ_ANALYSIS_RESULT_STORE')
	  AND name = 'IX_PJ_ANALYSIS_RESULT_STORE_LOGIN_ID_CREATED_AT'
)
BEGIN
	CREATE NONCLUSTERED INDEX [IX_PJ_ANALYSIS_RESULT_STORE_LOGIN_ID_CREATED_AT]
	ON [dbo].[PJ_ANALYSIS_RESULT_STORE] ([payload_login_id] ASC, [created_at] DESC)
	INCLUDE ([result_id], [updated_at], [summary_text]);
END
GO

IF NOT EXISTS (
	SELECT 1
	FROM sys.indexes
	WHERE object_id = OBJECT_ID('dbo.PJ_ANALYSIS_RESULT_STORE')
	  AND name = 'IX_PJ_ANALYSIS_RESULT_STORE_SHARE_TOKEN'
)
BEGIN
	CREATE NONCLUSTERED INDEX [IX_PJ_ANALYSIS_RESULT_STORE_SHARE_TOKEN]
	ON [dbo].[PJ_ANALYSIS_RESULT_STORE] ([payload_share_token] ASC, [payload_share_enabled] ASC)
	INCLUDE ([result_id], [created_at], [updated_at], [summary_text]);
END
GO

IF NOT EXISTS (
	SELECT 1
	FROM sys.indexes
	WHERE object_id = OBJECT_ID('dbo.PJ_TB_PAYMENTS')
	  AND name = 'IX_PJ_TB_PAYMENTS_LOGIN_ID_PAYMENT_ID'
)
BEGIN
	CREATE NONCLUSTERED INDEX [IX_PJ_TB_PAYMENTS_LOGIN_ID_PAYMENT_ID]
	ON [dbo].[PJ_TB_PAYMENTS] ([login_id] ASC, [payment_id] DESC)
	INCLUDE (
		[provider],
		[status],
		[amount_krw],
		[token_amount],
		[provider_txn_id],
		[requested_at],
		[approved_at],
		[canceled_at],
		[failed_at],
		[error_message]
	);
END
GO

IF NOT EXISTS (
	SELECT 1
	FROM sys.indexes
	WHERE object_id = OBJECT_ID('dbo.PJ_TB_TOKEN_LEDGER')
	  AND name = 'IX_PJ_TB_TOKEN_LEDGER_LOGIN_ID_LEDGER_ID'
)
BEGIN
	CREATE NONCLUSTERED INDEX [IX_PJ_TB_TOKEN_LEDGER_LOGIN_ID_LEDGER_ID]
	ON [dbo].[PJ_TB_TOKEN_LEDGER] ([login_id] ASC, [ledger_id] DESC)
	INCLUDE (
		[entry_type],
		[change_tokens],
		[balance_after],
		[usage_code],
		[reference_type],
		[reference_id],
		[event_code],
		[memo],
		[created_at]
	);
END
GO

IF OBJECT_ID('dbo.PJ_TB_MANAGE_ADMINS', 'U') IS NULL
BEGIN
	CREATE TABLE [dbo].[PJ_TB_MANAGE_ADMINS](
		[admin_no] [bigint] IDENTITY(1,1) NOT NULL,
		[admin_id] [varchar](100) NOT NULL,
		[admin_name] [nvarchar](100) NOT NULL,
		[password_hash] [varchar](128) NOT NULL,
		[is_active] [bit] NOT NULL CONSTRAINT [DF_PJ_TB_MANAGE_ADMINS_ACTIVE] DEFAULT ((1)),
		[last_login_at] [datetime2](0) NULL,
		[created_at] [datetime2](0) NOT NULL CONSTRAINT [DF_PJ_TB_MANAGE_ADMINS_CREATED] DEFAULT (sysdatetime()),
		[updated_at] [datetime2](0) NOT NULL CONSTRAINT [DF_PJ_TB_MANAGE_ADMINS_UPDATED] DEFAULT (sysdatetime()),
	 CONSTRAINT [PK_PJ_TB_MANAGE_ADMINS] PRIMARY KEY CLUSTERED ([admin_no] ASC),
	 CONSTRAINT [UQ_PJ_TB_MANAGE_ADMINS_ADMIN_ID] UNIQUE NONCLUSTERED ([admin_id] ASC)
	);
END
GO

IF NOT EXISTS (
	SELECT 1
	FROM sys.indexes
	WHERE object_id = OBJECT_ID('dbo.PJ_TB_MANAGE_ADMINS')
	  AND name = 'IX_PJ_TB_MANAGE_ADMINS_ACTIVE'
)
BEGIN
	CREATE NONCLUSTERED INDEX [IX_PJ_TB_MANAGE_ADMINS_ACTIVE]
	ON [dbo].[PJ_TB_MANAGE_ADMINS] ([is_active] ASC, [admin_id] ASC)
	INCLUDE ([admin_name], [updated_at], [last_login_at]);
END
GO

IF OBJECT_ID('dbo.PJ_TB_MANAGE_ACTION_LOGS', 'U') IS NULL
BEGIN
	CREATE TABLE [dbo].[PJ_TB_MANAGE_ACTION_LOGS](
		[log_id] [bigint] IDENTITY(1,1) NOT NULL,
		[admin_id] [varchar](100) NOT NULL,
		[admin_name] [nvarchar](100) NULL,
		[action_code] [varchar](60) NOT NULL,
		[target_type] [varchar](60) NULL,
		[target_id] [varchar](200) NULL,
		[result_status] [varchar](20) NOT NULL CONSTRAINT [DF_PJ_TB_MANAGE_ACTION_LOGS_RESULT] DEFAULT ('SUCCESS'),
		[request_data] [nvarchar](max) NULL,
		[response_data] [nvarchar](max) NULL,
		[ip_address] [varchar](100) NULL,
		[user_agent] [nvarchar](500) NULL,
		[created_at] [datetime2](0) NOT NULL CONSTRAINT [DF_PJ_TB_MANAGE_ACTION_LOGS_CREATED] DEFAULT (sysdatetime()),
	 CONSTRAINT [PK_PJ_TB_MANAGE_ACTION_LOGS] PRIMARY KEY CLUSTERED ([log_id] ASC)
	);
END
GO

IF NOT EXISTS (
	SELECT 1
	FROM sys.indexes
	WHERE object_id = OBJECT_ID('dbo.PJ_TB_MANAGE_ACTION_LOGS')
	  AND name = 'IX_PJ_TB_MANAGE_ACTION_LOGS_CREATED_AT'
)
BEGIN
	CREATE NONCLUSTERED INDEX [IX_PJ_TB_MANAGE_ACTION_LOGS_CREATED_AT]
	ON [dbo].[PJ_TB_MANAGE_ACTION_LOGS] ([created_at] DESC)
	INCLUDE ([admin_id], [action_code], [target_type], [target_id], [result_status]);
END
GO

IF NOT EXISTS (
	SELECT 1
	FROM sys.indexes
	WHERE object_id = OBJECT_ID('dbo.PJ_TB_MANAGE_ACTION_LOGS')
	  AND name = 'IX_PJ_TB_MANAGE_ACTION_LOGS_ADMIN_ACTION'
)
BEGIN
	CREATE NONCLUSTERED INDEX [IX_PJ_TB_MANAGE_ACTION_LOGS_ADMIN_ACTION]
	ON [dbo].[PJ_TB_MANAGE_ACTION_LOGS] ([admin_id] ASC, [action_code] ASC, [created_at] DESC)
	INCLUDE ([target_type], [target_id], [result_status]);
END
GO

IF OBJECT_ID('dbo.PJ_TB_PROMPT_TEMPLATES', 'U') IS NULL
BEGIN
	CREATE TABLE [dbo].[PJ_TB_PROMPT_TEMPLATES](
		[prompt_no] [bigint] IDENTITY(1,1) NOT NULL,
		[service_code] [varchar](20) NOT NULL,
		[feature_key] [varchar](40) NULL,
		[tone_key] [varchar](40) NULL,
		[system_prompt] [nvarchar](max) NOT NULL,
		[user_prompt_guide] [nvarchar](max) NULL,
		[is_active] [bit] NOT NULL CONSTRAINT [DF_PJ_TB_PROMPT_TEMPLATES_ACTIVE] DEFAULT ((1)),
		[updated_by] [varchar](100) NULL,
		[created_at] [datetime2](0) NOT NULL CONSTRAINT [DF_PJ_TB_PROMPT_TEMPLATES_CREATED] DEFAULT (sysdatetime()),
		[updated_at] [datetime2](0) NOT NULL CONSTRAINT [DF_PJ_TB_PROMPT_TEMPLATES_UPDATED] DEFAULT (sysdatetime()),
	 CONSTRAINT [PK_PJ_TB_PROMPT_TEMPLATES] PRIMARY KEY CLUSTERED ([prompt_no] ASC)
	);
END
GO

IF NOT EXISTS (
	SELECT 1
	FROM sys.indexes
	WHERE object_id = OBJECT_ID('dbo.PJ_TB_PROMPT_TEMPLATES')
	  AND name = 'UX_PJ_TB_PROMPT_TEMPLATES_SCOPE'
)
BEGIN
	CREATE UNIQUE NONCLUSTERED INDEX [UX_PJ_TB_PROMPT_TEMPLATES_SCOPE]
	ON [dbo].[PJ_TB_PROMPT_TEMPLATES] (
		[service_code] ASC,
		[feature_key] ASC,
		[tone_key] ASC
	);
END
GO

IF NOT EXISTS (
	SELECT 1
	FROM sys.indexes
	WHERE object_id = OBJECT_ID('dbo.PJ_TB_PROMPT_TEMPLATES')
	  AND name = 'IX_PJ_TB_PROMPT_TEMPLATES_UPDATED'
)
BEGIN
	CREATE NONCLUSTERED INDEX [IX_PJ_TB_PROMPT_TEMPLATES_UPDATED]
	ON [dbo].[PJ_TB_PROMPT_TEMPLATES] ([updated_at] DESC)
	INCLUDE ([service_code], [feature_key], [tone_key], [is_active], [updated_by]);
END
GO
