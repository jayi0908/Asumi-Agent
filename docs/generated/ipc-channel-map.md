# Generated IPC / window.api map

Baseline: `9ea7e8502472ad24d5db831deea67bfbdcf10fe9`

Status defaults to `pending`. Update when porting; do not delete rows.

## IpcChannel enum

| Enum member | Channel string | Status | Tauri/bridge notes |
|---|---|---|---|
| `App_GetCacheSize` | `app:get-cache-size` | pending | |
| `App_ClearCache` | `app:clear-cache` | pending | |
| `App_SetLaunchOnBoot` | `app:set-launch-on-boot` | pending | |
| `App_SetEnableSpellCheck` | `app:set-enable-spell-check` | pending | |
| `App_SetSpellCheckLanguages` | `app:set-spell-check-languages` | pending | |
| `App_CheckForUpdate` | `app:check-for-update` | pending | |
| `App_QuitAndInstall` | `app:quit-and-install` | pending | |
| `Application_Quit` | `application:quit` | pending | |
| `App_Info` | `app:info` | pending | |
| `App_SetAutoUpdate` | `app:set-auto-update` | pending | |
| `App_SetTestPlan` | `app:set-test-plan` | pending | |
| `App_SetTestChannel` | `app:set-test-channel` | pending | |
| `App_HandleZoomFactor` | `app:handle-zoom-factor` | pending | |
| `App_Select` | `app:select` | pending | |
| `App_HasWritePermission` | `app:has-write-permission` | pending | |
| `App_ResolvePath` | `app:resolve-path` | pending | |
| `App_IsPathInside` | `app:is-path-inside` | pending | |
| `App_Copy` | `app:copy` | pending | |
| `Application_PreventQuit` | `application:prevent-quit` | pending | |
| `Application_AllowQuit` | `application:allow-quit` | pending | |
| `App_SetAppDataPath` | `app:set-app-data-path` | pending | |
| `App_GetDataPathFromArgs` | `app:get-data-path-from-args` | pending | |
| `App_FlushAppData` | `app:flush-app-data` | pending | |
| `App_IsNotEmptyDir` | `app:is-not-empty-dir` | pending | |
| `Application_Relaunch` | `application:relaunch` | pending | |
| `App_ResetData` | `app:reset-data` | pending | |
| `App_IsBinaryExist` | `app:is-binary-exist` | pending | |
| `App_GetBinaryPath` | `app:get-binary-path` | pending | |
| `App_InstallUvBinary` | `app:install-uv-binary` | pending | |
| `App_InstallBunBinary` | `app:install-bun-binary` | pending | |
| `App_InstallOvmsBinary` | `app:install-ovms-binary` | pending | |
| `App_LogToMain` | `app:log-to-main` | pending | |
| `App_GetSystemFonts` | `app:get-system-fonts` | pending | |
| `App_GetIpCountry` | `app:get-ip-country` | pending | |
| `App_MacIsProcessTrusted` | `app:mac-is-process-trusted` | pending | |
| `App_MacRequestProcessTrust` | `app:mac-request-process-trust` | pending | |
| `App_QuoteToMain` | `app:quote-to-main` | pending | |
| `StorageMonitor_GetHealth` | `storage-monitor:get-health` | pending | |
| `StorageMonitor_HealthChanged` | `storage-monitor:health-changed` | pending | |
| `Notification_Send` | `notification:send` | pending | |
| `Notification_OnClick` | `notification:on-click` | pending | |
| `Webview_SetOpenLinkExternal` | `webview:set-open-link-external` | pending | |
| `Webview_SetSpellCheckEnabled` | `webview:set-spell-check-enabled` | pending | |
| `Webview_SearchHotkey` | `webview:search-hotkey` | pending | |
| `Webview_PrintToPDF` | `webview:print-to-pdf` | pending | |
| `Webview_SaveAsHTML` | `webview:save-as-html` | pending | |
| `Open_Path` | `open:path` | pending | |
| `Open_Website` | `open:website` | pending | |
| `MiniApp` | `mini-app` | pending | |
| `Config_Set` | `config:set` | pending | |
| `Config_Get` | `config:get` | pending | |
| `QuickAssistant_Show` | `quick-assistant:show` | pending | |
| `QuickAssistant_Hide` | `quick-assistant:hide` | pending | |
| `QuickAssistant_Close` | `quick-assistant:close` | pending | |
| `QuickAssistant_Toggle` | `quick-assistant:toggle` | pending | |
| `QuickAssistant_SetPin` | `quick-assistant:set-pin` | pending | |
| `QuickAssistant_Shown` | `quick-assistant:shown` | pending | |
| `Mcp_AddServer` | `mcp:add-server` | pending | |
| `Mcp_RemoveServer` | `mcp:remove-server` | pending | |
| `Mcp_RestartServer` | `mcp:restart-server` | pending | |
| `Mcp_StopServer` | `mcp:stop-server` | pending | |
| `Mcp_RefreshTools` | `mcp:refresh-tools` | pending | |
| `Mcp_CallTool` | `mcp:call-tool` | pending | |
| `Mcp_ListPrompts` | `mcp:list-prompts` | pending | |
| `Mcp_GetPrompt` | `mcp:get-prompt` | pending | |
| `Mcp_ListResources` | `mcp:list-resources` | pending | |
| `Mcp_GetResource` | `mcp:get-resource` | pending | |
| `Mcp_GetInstallInfo` | `mcp:get-install-info` | pending | |
| `Mcp_ServersChanged` | `mcp:servers-changed` | pending | |
| `Mcp_ServersUpdated` | `mcp:servers-updated` | pending | |
| `Mcp_CheckConnectivity` | `mcp:check-connectivity` | pending | |
| `Mcp_UploadDxt` | `mcp:upload-dxt` | pending | |
| `Mcp_UploadMcpb` | `mcp:upload-mcpb` | pending | |
| `Mcp_AbortTool` | `mcp:abort-tool` | pending | |
| `Mcp_GetServerVersion` | `mcp:get-server-version` | pending | |
| `Mcp_Progress` | `mcp:progress` | pending | |
| `Mcp_GetServerLogs` | `mcp:get-server-logs` | pending | |
| `Mcp_ServerLog` | `mcp:server-log` | pending | |
| `Python_Execute` | `python:execute` | pending | |
| `Python_ExecutionRequest` | `python:execution-request` | pending | |
| `Python_ExecutionResponse` | `python:execution-response` | pending | |
| `WeChat_QrLogin` | `wechat:qr-login` | pending | |
| `WeChat_HasCredentials` | `wechat:has-credentials` | pending | |
| `Feishu_QrLogin` | `feishu:qr-login` | pending | |
| `Channel_StatusChange` | `channel:status-change` | pending | |
| `Channel_Log` | `channel:log` | pending | |
| `Channel_GetLogs` | `channel:get-logs` | pending | |
| `Channel_GetStatuses` | `channel:get-statuses` | pending | |
| `Copilot_GetAuthMessage` | `copilot:get-auth-message` | pending | |
| `Copilot_GetCopilotToken` | `copilot:get-copilot-token` | pending | |
| `Copilot_SaveCopilotToken` | `copilot:save-copilot-token` | pending | |
| `Copilot_GetToken` | `copilot:get-token` | pending | |
| `Copilot_Logout` | `copilot:logout` | pending | |
| `Copilot_GetUser` | `copilot:get-user` | pending | |
| `CherryIN_SaveToken` | `cherryin:save-token` | pending | |
| `CherryIN_HasToken` | `cherryin:has-token` | pending | |
| `CherryIN_GetBalance` | `cherryin:get-balance` | pending | |
| `CherryIN_Logout` | `cherryin:logout` | pending | |
| `CherryIN_StartOAuthFlow` | `cherryin:start-oauth-flow` | pending | |
| `CherryIN_OAuthResult` | `cherryin:oauth-result` | pending | |
| `Obsidian_GetVaults` | `obsidian:get-vaults` | pending | |
| `Obsidian_GetFiles` | `obsidian:get-files` | pending | |
| `Nutstore_GetSsoUrl` | `nutstore:get-sso-url` | pending | |
| `Nutstore_DecryptToken` | `nutstore:decrypt-token` | pending | |
| `Nutstore_GetDirectoryContents` | `nutstore:get-directory-contents` | pending | |
| `Aes_Encrypt` | `aes:encrypt` | pending | |
| `Aes_Decrypt` | `aes:decrypt` | pending | |
| `Gemini_UploadFile` | `gemini:upload-file` | pending | |
| `Gemini_Base64File` | `gemini:base64-file` | pending | |
| `Gemini_RetrieveFile` | `gemini:retrieve-file` | pending | |
| `Gemini_ListFiles` | `gemini:list-files` | pending | |
| `Gemini_DeleteFile` | `gemini:delete-file` | pending | |
| `VertexAI_GetAuthHeaders` | `vertexai:get-auth-headers` | pending | |
| `VertexAI_GetAccessToken` | `vertexai:get-access-token` | pending | |
| `VertexAI_ClearAuthCache` | `vertexai:clear-auth-cache` | pending | |
| `MainWindow_Reload` | `main-window:reload` | pending | |
| `MainWindow_CrashRenderProcess` | `main-window:crash-render-process` | pending | |
| `MainWindow_ResetMinimumSize` | `main-window:reset-minimum-size` | pending | |
| `MainWindow_SetMinimumSize` | `main-window:set-minimum-size` | pending | |
| `Shortcut_RegistrationConflict` | `shortcut:registration-conflict` | pending | |
| `NativeCommandPopupMenu_Show` | `native-command-popup-menu:show` | pending | |
| `Tab_Attach` | `tab:attach` | pending | |
| `Tab_Detach` | `tab:detach` | pending | |
| `Tab_MoveWindow` | `tab:move-window` | pending | |
| `Tab_TryAttach` | `tab:try-attach` | pending | |
| `Tab_DragEnd` | `tab:drag-end` | pending | |
| `Knowledge_CreateBase` | `knowledge:create-base` | pending | |
| `Knowledge_RestoreBase` | `knowledge:restore-base` | pending | |
| `Knowledge_DeleteBase` | `knowledge:delete-base` | pending | |
| `Knowledge_AddItems` | `knowledge:add-items` | pending | |
| `Knowledge_DeleteItems` | `knowledge:delete-items` | pending | |
| `Knowledge_ReindexItems` | `knowledge:reindex-items` | pending | |
| `Knowledge_Search` | `knowledge:search` | pending | |
| `Knowledge_ListItemChunks` | `knowledge:list-item-chunks` | pending | |
| `Knowledge_DeleteItemChunk` | `knowledge:delete-item-chunk` | pending | |
| `KnowledgeBase_Delete` | `knowledge-base:delete` | pending | |
| `FileProcessing_StartJob` | `file-processing:start-job` | pending | |
| `FileProcessing_ListAvailableProcessors` | `file-processing:list-available-processors` | pending | |
| `File_Open` | `file:open` | pending | |
| `File_OpenPath` | `file:openPath` | pending | |
| `File_Save` | `file:save` | pending | |
| `File_Select` | `file:select` | pending | |
| `File_Upload` | `file:upload` | pending | |
| `File_Clear` | `file:clear` | pending | |
| `File_Read` | `file:read` | pending | |
| `File_ReadExternal` | `file:readExternal` | pending | |
| `File_Delete` | `file:delete` | pending | |
| `File_DeleteDir` | `file:deleteDir` | pending | |
| `File_DeleteExternalFile` | `file:deleteExternalFile` | pending | |
| `File_DeleteExternalDir` | `file:deleteExternalDir` | pending | |
| `File_Move` | `file:move` | pending | |
| `File_MoveDir` | `file:moveDir` | pending | |
| `File_Rename` | `file:rename` | pending | |
| `File_RenameDir` | `file:renameDir` | pending | |
| `File_Get` | `file:get` | pending | |
| `File_SelectFolder` | `file:selectFolder` | pending | |
| `File_CreateTempFile` | `file:createTempFile` | pending | |
| `File_Mkdir` | `file:mkdir` | pending | |
| `File_Write` | `file:write` | pending | |
| `File_WriteWithId` | `file:writeWithId` | pending | |
| `File_SaveImage` | `file:saveImage` | pending | |
| `File_Base64Image` | `file:base64Image` | pending | |
| `File_SaveBase64Image` | `file:saveBase64Image` | pending | |
| `File_SavePastedImage` | `file:savePastedImage` | pending | |
| `File_Download` | `file:download` | pending | |
| `File_Copy` | `file:copy` | pending | |
| `File_BinaryImage` | `file:binaryImage` | pending | |
| `File_Base64File` | `file:base64File` | pending | |
| `File_GetPdfInfo` | `file:getPdfInfo` | pending | |
| `Fs_Read` | `fs:read` | pending | |
| `Fs_ReadText` | `fs:readText` | pending | |
| `File_OpenWithRelativePath` | `file:openWithRelativePath` | pending | |
| `File_IsTextFile` | `file:isTextFile` | pending | |
| `File_IsDirectory` | `file:isDirectory` | pending | |
| `File_GetMetadata` | `file:getMetadata` | pending | |
| `File_ListDirectory` | `file:listDirectory` | pending | |
| `File_CheckFileName` | `file:checkFileName` | pending | |
| `File_ValidateNotesDirectory` | `file:validateNotesDirectory` | pending | |
| `File_BatchUploadMarkdown` | `file:batchUploadMarkdown` | pending | |
| `File_ShowInFolder` | `file:showInFolder` | pending | |
| `File_GetDanglingState` | `file:getDanglingState` | pending | |
| `File_BatchGetDanglingStates` | `file:batchGetDanglingStates` | pending | |
| `File_CreateInternalEntry` | `file:createInternalEntry` | pending | |
| `File_EnsureExternalEntry` | `file:ensureExternalEntry` | pending | |
| `File_GetPhysicalPath` | `file:getPhysicalPath` | pending | |
| `File_PermanentDelete` | `file:permanentDelete` | pending | |
| `File_RunSweep` | `file:runSweep` | pending | |
| `File_TreeCreate` | `file:tree:create` | pending | |
| `File_TreeDispose` | `file:tree:dispose` | pending | |
| `File_TreeRename` | `file:tree:rename` | pending | |
| `File_TreeMutation` | `file:tree:mutation` | pending | |
| `Pdf_ExtractText` | `pdf:extractText` | pending | |
| `Export_Word` | `export:word` | pending | |
| `Backup_Backup` | `backup:backup` | pending | |
| `Backup_Restore` | `backup:restore` | pending | |
| `Backup_BackupToWebdav` | `backup:backupToWebdav` | pending | |
| `Backup_RestoreFromWebdav` | `backup:restoreFromWebdav` | pending | |
| `Backup_ListWebdavFiles` | `backup:listWebdavFiles` | pending | |
| `Backup_CheckConnection` | `backup:checkConnection` | pending | |
| `Backup_CreateDirectory` | `backup:createDirectory` | pending | |
| `Backup_DeleteWebdavFile` | `backup:deleteWebdavFile` | pending | |
| `Backup_BackupToLocalDir` | `backup:backupToLocalDir` | pending | |
| `Backup_RestoreFromLocalBackup` | `backup:restoreFromLocalBackup` | pending | |
| `Backup_ListLocalBackupFiles` | `backup:listLocalBackupFiles` | pending | |
| `Backup_DeleteLocalBackupFile` | `backup:deleteLocalBackupFile` | pending | |
| `Backup_BackupToS3` | `backup:backupToS3` | pending | |
| `Backup_RestoreFromS3` | `backup:restoreFromS3` | pending | |
| `Backup_ListS3Files` | `backup:listS3Files` | pending | |
| `Backup_DeleteS3File` | `backup:deleteS3File` | pending | |
| `Backup_CheckS3Connection` | `backup:checkS3Connection` | pending | |
| `Backup_CreateLanTransferBackup` | `backup:createLanTransferBackup` | pending | |
| `Backup_DeleteLanTransferBackup` | `backup:deleteLanTransferBackup` | pending | |
| `DataMigrate_CheckNeeded` | `data-migrate:check-needed` | pending | |
| `DataMigrate_GetProgress` | `data-migrate:get-progress` | pending | |
| `DataMigrate_Cancel` | `data-migrate:cancel` | pending | |
| `DataMigrate_RequireBackup` | `data-migrate:require-backup` | pending | |
| `DataMigrate_BackupCompleted` | `data-migrate:backup-completed` | pending | |
| `DataMigrate_ShowBackupDialog` | `data-migrate:show-backup-dialog` | pending | |
| `DataMigrate_StartFlow` | `data-migrate:start-flow` | pending | |
| `DataMigrate_ProceedToBackup` | `data-migrate:proceed-to-backup` | pending | |
| `DataMigrate_StartMigration` | `data-migrate:start-migration` | pending | |
| `DataMigrate_RetryMigration` | `data-migrate:retry-migration` | pending | |
| `DataMigrate_RestartApp` | `data-migrate:restart-app` | pending | |
| `DataMigrate_CloseWindow` | `data-migrate:close-window` | pending | |
| `Zip_Compress` | `zip:compress` | pending | |
| `Zip_Decompress` | `zip:decompress` | pending | |
| `System_GetDeviceType` | `system:getDeviceType` | pending | |
| `System_GetHostname` | `system:getHostname` | pending | |
| `System_GetCpuName` | `system:getCpuName` | pending | |
| `System_CheckGitBash` | `system:checkGitBash` | pending | |
| `System_GetGitBashPath` | `system:getGitBashPath` | pending | |
| `System_GetGitBashPathInfo` | `system:getGitBashPathInfo` | pending | |
| `System_SetGitBashPath` | `system:setGitBashPath` | pending | |
| `System_ToggleDevTools` | `system:toggleDevTools` | pending | |
| `BackupProgress` | `backup-progress` | pending | |
| `DataMigrateProgress` | `data-migrate-progress` | pending | |
| `NativeThemeUpdated` | `native-theme:updated` | pending | |
| `RestoreProgress` | `restore-progress` | pending | |
| `UpdateError` | `update-error` | pending | |
| `UpdateAvailable` | `update-available` | pending | |
| `UpdateNotAvailable` | `update-not-available` | pending | |
| `DownloadProgress` | `download-progress` | pending | |
| `UpdateDownloaded` | `update-downloaded` | pending | |
| `DownloadUpdate` | `download-update` | pending | |
| `DirectoryProcessingPercent` | `directory-processing-percent` | pending | |
| `SearchWindow_Open` | `search-window:open` | pending | |
| `SearchWindow_Close` | `search-window:close` | pending | |
| `SearchWindow_OpenUrl` | `search-window:open-url` | pending | |
| `Provider_AddKey` | `provider:add-key` | pending | |
| `WebSearch_SearchKeywords` | `web-search:search-keywords` | pending | |
| `WebSearch_FetchUrls` | `web-search:fetch-urls` | pending | |
| `WebSearch_CheckProvider` | `web-search:check-provider` | pending | |
| `Selection_TextSelected` | `selection:text-selected` | pending | |
| `Selection_ToolbarHide` | `selection:toolbar-hide` | pending | |
| `Selection_ToolbarVisibilityChange` | `selection:toolbar-visibility-change` | pending | |
| `Selection_ToolbarDetermineSize` | `selection:toolbar-determine-size` | pending | |
| `Selection_WriteToClipboard` | `selection:write-to-clipboard` | pending | |
| `Selection_ActionWindowPin` | `selection:action-window-pin` | pending | |
| `Selection_ProcessAction` | `selection:process-action` | pending | |
| `Selection_GetLinuxEnvInfo` | `selection:get-linux-env-info` | pending | |
| `Preference_Get` | `preference:get` | pending | |
| `Preference_Set` | `preference:set` | pending | |
| `Preference_GetMultipleRaw` | `preference:get-multiple-raw` | pending | |
| `Preference_SetMultiple` | `preference:set-multiple` | pending | |
| `Preference_GetAll` | `preference:get-all` | pending | |
| `Preference_Subscribe` | `preference:subscribe` | pending | |
| `Preference_Changed` | `preference:changed` | pending | |
| `Cache_Sync` | `cache:sync` | pending | |
| `Cache_SyncBatch` | `cache:sync-batch` | pending | |
| `Cache_GetAllShared` | `cache:get-all-shared` | pending | |
| `DataApi_Request` | `data-api:request` | pending | |
| `DataApi_Subscribe` | `data-api:subscribe` | pending | |
| `DataApi_Unsubscribe` | `data-api:unsubscribe` | pending | |
| `DataApi_Stream` | `data-api:stream` | pending | |
| `Topic_AutoRenamed` | `topic:auto-renamed` | pending | |
| `AgentSession_AutoRenamed` | `agent-session:auto-renamed` | pending | |
| `TRACE_GET_DATA` | `trace:getData` | pending | |
| `TRACE_CLEAN_LOCAL_DATA` | `trace:cleanLocalData` | pending | |
| `ApiGateway_Start` | `api-gateway:start` | pending | |
| `ApiGateway_Stop` | `api-gateway:stop` | pending | |
| `ApiGateway_Restart` | `api-gateway:restart` | pending | |
| `ExternalApps_DetectInstalled` | `external-apps:detect-installed` | pending | |
| `CodeCli_Run` | `code-cli:run` | pending | |
| `CodeCli_GetAvailableTerminals` | `code-cli:get-available-terminals` | pending | |
| `CodeCli_SetCustomTerminalPath` | `code-cli:set-custom-terminal-path` | pending | |
| `CodeCli_GetCustomTerminalPath` | `code-cli:get-custom-terminal-path` | pending | |
| `CodeCli_RemoveCustomTerminalPath` | `code-cli:remove-custom-terminal-path` | pending | |
| `OCR_ocr` | `ocr:ocr` | pending | |
| `OCR_ListProviders` | `ocr:list-providers` | pending | |
| `Ovms_IsSupported` | `ovms:is-supported` | pending | |
| `Ovms_AddModel` | `ovms:add-model` | pending | |
| `Ovms_StopAddModel` | `ovms:stop-addmodel` | pending | |
| `Ovms_GetModels` | `ovms:get-models` | pending | |
| `Ovms_IsRunning` | `ovms:is-running` | pending | |
| `Ovms_GetStatus` | `ovms:get-status` | pending | |
| `Ovms_RunOVMS` | `ovms:run-ovms` | pending | |
| `Ovms_StopOVMS` | `ovms:stop-ovms` | pending | |
| `Cherryai_GetSignature` | `cherryai:get-signature` | pending | |
| `Skill_List` | `skill:list` | pending | |
| `Skill_Install` | `skill:install` | pending | |
| `Skill_Uninstall` | `skill:uninstall` | pending | |
| `Skill_Toggle` | `skill:toggle` | pending | |
| `Skill_InstallFromZip` | `skill:install-from-zip` | pending | |
| `Skill_InstallFromDirectory` | `skill:install-from-directory` | pending | |
| `Skill_ReadFile` | `skill:read-file` | pending | |
| `Skill_ListFiles` | `skill:list-files` | pending | |
| `Skill_ListLocal` | `skill:list-local` | pending | |
| `LanTransfer_ListServices` | `lan-transfer:list` | pending | |
| `LanTransfer_StartScan` | `lan-transfer:start-scan` | pending | |
| `LanTransfer_StopScan` | `lan-transfer:stop-scan` | pending | |
| `LanTransfer_ServicesUpdated` | `lan-transfer:services-updated` | pending | |
| `LanTransfer_Connect` | `lan-transfer:connect` | pending | |
| `LanTransfer_Disconnect` | `lan-transfer:disconnect` | pending | |
| `LanTransfer_ClientEvent` | `lan-transfer:client-event` | pending | |
| `LanTransfer_SendFile` | `lan-transfer:send-file` | pending | |
| `LanTransfer_CancelTransfer` | `lan-transfer:cancel-transfer` | pending | |
| `OpenClaw_CheckInstalled` | `openclaw:check-installed` | pending | |
| `OpenClaw_Install` | `openclaw:install` | pending | |
| `OpenClaw_Uninstall` | `openclaw:uninstall` | pending | |
| `OpenClaw_InstallProgress` | `openclaw:install-progress` | pending | |
| `OpenClaw_StartGateway` | `openclaw:start-gateway` | pending | |
| `OpenClaw_StopGateway` | `openclaw:stop-gateway` | pending | |
| `OpenClaw_GetStatus` | `openclaw:get-status` | pending | |
| `OpenClaw_CheckHealth` | `openclaw:check-health` | pending | |
| `OpenClaw_GetDashboardUrl` | `openclaw:get-dashboard-url` | pending | |
| `OpenClaw_SyncConfig` | `openclaw:sync-config` | pending | |
| `OpenClaw_GetChannels` | `openclaw:get-channels` | pending | |
| `OpenClaw_CheckUpdate` | `openclaw:check-update` | pending | |
| `OpenClaw_PerformUpdate` | `openclaw:perform-update` | pending | |
| `Analytics_TrackTokenUsage` | `analytics:track-token-usage` | pending | |
| `Ai_StreamChunk` | `ai:stream-chunk` | pending | |
| `Ai_StreamDone` | `ai:stream-done` | pending | |
| `Ai_StreamError` | `ai:stream-error` | pending | |
| `Ai_Translate_Open` | `ai:translate:open` | pending | |
| `Ai_Stream_Open` | `ai:stream:open` | pending | |
| `Ai_Stream_Attach` | `ai:stream:attach` | pending | |
| `Ai_Stream_Detach` | `ai:stream:detach` | pending | |
| `Ai_Stream_Abort` | `ai:stream:abort` | pending | |
| `Ai_AgentSession_Prewarm` | `ai:agent-session:prewarm` | pending | |
| `Ai_AgentSession_CloseWarm` | `ai:agent-session:close-warm` | pending | |
| `Ai_ToolApproval_Respond` | `ai:tool-approval:respond` | pending | |
| `Ai_GenerateText` | `ai:generate-text` | pending | |
| `Ai_CheckModel` | `ai:check-model` | pending | |
| `Ai_EmbedMany` | `ai:embed-many` | pending | |
| `Ai_GenerateImage` | `ai:generate-image` | pending | |
| `Ai_AbortImage` | `ai:abort-image` | pending | |
| `Ai_ListModels` | `ai:list-models` | pending | |
| `Ai_Agent_RunTask` | `ai:agent:run-task` | pending | |
| `SettingsWindow_Open` | `settings-window:open` | pending | |
| `WindowManager_Open` | `window-manager:open` | pending | |
| `WindowManager_Close` | `window-manager:close` | pending | |
| `WindowManager_Minimize` | `window-manager:minimize` | pending | |
| `WindowManager_Maximize` | `window-manager:maximize` | pending | |
| `WindowManager_Unmaximize` | `window-manager:unmaximize` | pending | |
| `WindowManager_SetFullScreen` | `window-manager:set-full-screen` | pending | |
| `WindowManager_IsMaximized` | `window-manager:is-maximized` | pending | |
| `WindowManager_IsFullScreen` | `window-manager:is-full-screen` | pending | |
| `WindowManager_GetInitData` | `window-manager:get-init-data` | pending | |
| `WindowManager_MaximizedChanged` | `window-manager:maximized-changed` | pending | |
| `WindowManager_FullscreenChanged` | `window-manager:fullscreen-changed` | pending | |
| `WindowManager_Reused` | `window-manager:reused` | pending | |

## window.api top-level keys (preload)

| Key | Status | Notes |
|---|---|---|
| `aes` | pending | |
| `agentSession` | pending | |
| `ai` | pending | |
| `analytics` | pending | |
| `apiGateway` | pending | |
| `application` | pending | |
| `backup` | pending | |
| `cache` | pending | |
| `channel` | pending | |
| `checkForUpdate` | pending | |
| `cherryai` | pending | |
| `cherryin` | pending | |
| `clearCache` | pending | |
| `codeCli` | pending | |
| `command` | pending | |
| `config` | pending | |
| `copilot` | pending | |
| `copy` | pending | |
| `dataApi` | pending | |
| `devTools` | pending | |
| `export` | pending | |
| `externalApps` | pending | |
| `feishu` | pending | |
| `file` | pending | |
| `fileProcessing` | pending | |
| `flushAppData` | pending | |
| `fs` | pending | |
| `getAppInfo` | pending | |
| `getBinaryPath` | pending | |
| `getCacheSize` | pending | |
| `getDataPathFromArgs` | pending | |
| `getIpCountry` | pending | |
| `getSystemFonts` | pending | |
| `handleZoomFactor` | pending | |
| `hasWritePermission` | pending | |
| `installBunBinary` | pending | |
| `installOvmsBinary` | pending | |
| `installUVBinary` | pending | |
| `isBinaryExist` | pending | |
| `isNotEmptyDir` | pending | |
| `isPathInside` | pending | |
| `knowledge` | pending | |
| `knowledgeBase` | pending | |
| `lanTransfer` | pending | |
| `logToMain` | pending | |
| `mac` | pending | |
| `mcp` | pending | |
| `mockCrashRenderProcess` | pending | |
| `notification` | pending | |
| `nutstore` | pending | |
| `obsidian` | pending | |
| `ocr` | pending | |
| `openPath` | pending | |
| `openWebsite` | pending | |
| `openclaw` | pending | |
| `ovms` | pending | |
| `pdf` | pending | |
| `preference` | pending | |
| `protocol` | pending | |
| `python` | pending | |
| `quickAssistant` | pending | |
| `quitAndInstall` | pending | |
| `quoteToMainWindow` | pending | |
| `reload` | pending | |
| `resetData` | pending | |
| `resolvePath` | pending | |
| `searchService` | pending | |
| `select` | pending | |
| `selection` | pending | |
| `selectionMenu` | pending | |
| `setAppDataPath` | pending | |
| `setAutoUpdate` | pending | |
| `setEnableSpellCheck` | pending | |
| `setLaunchOnBoot` | pending | |
| `setSpellCheckLanguages` | pending | |
| `setTestChannel` | pending | |
| `setTestPlan` | pending | |
| `shell` | pending | |
| `shortcut` | pending | |
| `skill` | pending | |
| `storageMonitor` | pending | |
| `system` | pending | |
| `topic` | pending | |
| `trace` | pending | |
| `translate` | pending | |
| `tree` | pending | |
| `vertexAI` | pending | |
| `webSearch` | pending | |
| `webview` | pending | |
| `wechat` | pending | |
| `window` | pending | |
| `windowManager` | pending | |
| `zip` | pending | |

Total channels: 361
Total api keys (approx top-level): 93
