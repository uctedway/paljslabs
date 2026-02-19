SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
CREATE TABLE [dbo].[PJ_SAJU_RESULT_STORE](
	[result_id] [nvarchar](64) NOT NULL,
	[payload_json] [nvarchar](max) NOT NULL,
	[created_at] [datetime2](3) NOT NULL,
	[updated_at] [datetime2](3) NOT NULL,
PRIMARY KEY CLUSTERED 
(
	[result_id] ASC
)WITH (PAD_INDEX = OFF, STATISTICS_NORECOMPUTE = OFF, IGNORE_DUP_KEY = OFF, ALLOW_ROW_LOCKS = ON, ALLOW_PAGE_LOCKS = ON) ON [PRIMARY]
) ON [PRIMARY] TEXTIMAGE_ON [PRIMARY]
GO
ALTER TABLE [dbo].[PJ_SAJU_RESULT_STORE] ADD  DEFAULT (sysutcdatetime()) FOR [created_at]
GO
ALTER TABLE [dbo].[PJ_SAJU_RESULT_STORE] ADD  DEFAULT (sysutcdatetime()) FOR [updated_at]
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
