package app.igseek.mobile.ui.state

import android.app.Application
import android.util.Base64
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.igseek.mobile.BuildConfig
import app.igseek.mobile.IGseekApplication
import app.igseek.mobile.data.api.FirebaseOperationNotAllowedException
import app.igseek.mobile.data.models.AccentPresetId
import app.igseek.mobile.data.models.AgentRoleId
import app.igseek.mobile.data.models.AiModelId
import app.igseek.mobile.data.models.AuthSession
import app.igseek.mobile.data.models.ChatAttachment
import app.igseek.mobile.data.models.ChatMessageItem
import app.igseek.mobile.data.models.ChatThread
import app.igseek.mobile.data.models.CloudSyncStatus
import app.igseek.mobile.data.models.EngineProjectItem
import app.igseek.mobile.data.models.FlowTaskState
import app.igseek.mobile.data.models.GeneratedImageItem
import app.igseek.mobile.data.models.IGseekTab
import app.igseek.mobile.data.models.LibraryFileItem
import app.igseek.mobile.data.models.MemoryEntryItem
import app.igseek.mobile.data.models.MobileLayoutPrefs
import app.igseek.mobile.data.models.OutboxQueuedMessage
import app.igseek.mobile.data.models.ProjectFolder
import app.igseek.mobile.data.models.SharedIncomingPayload
import app.igseek.mobile.data.models.SubscriptionInfo
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.format.DateTimeFormatter
import java.util.UUID

data class IGseekUiState(
    val session: AuthSession? = null,
    val isAuthLoading: Boolean = false,
    val isGoogleAuthLoading: Boolean = false,
    val authError: String? = null,
    val needsAccentOnboarding: Boolean = false,
    val showProSheet: Boolean = false,
    val isOnline: Boolean = true,
    val cloudSyncStatus: CloudSyncStatus = CloudSyncStatus.IDLE,
    val layoutPrefs: MobileLayoutPrefs = MobileLayoutPrefs(),
    val serverBaseUrl: String = "",
    val activeTab: IGseekTab = IGseekTab.CHAT,
    val projects: List<ProjectFolder> = emptyList(),
    val activeProjectId: String? = null,
    val chats: List<ChatThread> = emptyList(),
    val activeChatId: String = "",
    val messages: List<ChatMessageItem> = emptyList(),
    val bookmarkedMessages: List<ChatMessageItem> = emptyList(),
    val draftInput: String = "",
    val pendingAttachments: List<ChatAttachment> = emptyList(),
    val selectedModel: AiModelId = AiModelId.INSTINCT,
    val selectedAgent: AgentRoleId = AgentRoleId.UNIVERSAL,
    val webSearchEnabled: Boolean = false,
    val reasoningEnabled: Boolean = false,
    val imageModeEnabled: Boolean = false,
    val isStreaming: Boolean = false,
    val outboxCount: Int = 0,
    val flowTask: FlowTaskState = FlowTaskState(),
    val libraryFiles: List<LibraryFileItem> = emptyList(),
    val isLibraryLoading: Boolean = false,
    val memories: List<MemoryEntryItem> = emptyList(),
    val isMemoriesLoading: Boolean = false,
    val engineProjects: List<EngineProjectItem> = emptyList(),
    val activeEngineProjectId: String? = null,
    val isEngineGenerating: Boolean = false,
    val engineError: String? = null,
    val subscription: SubscriptionInfo = SubscriptionInfo(),
    val isRedeemingKey: Boolean = false,
    val keyRedeemError: String? = null,
    val toastMessage: String? = null
)

class IGseekViewModel(application: Application) : AndroidViewModel(application) {

    private val app = application as IGseekApplication
    private val store = app.localStore
    private val authApi = app.authApi
    private val firestore = app.firestoreSync
    private val api = app.apiClient
    private val network = app.networkMonitor

    private val _state = MutableStateFlow(IGseekUiState())
    val state: StateFlow<IGseekUiState> = _state.asStateFlow()

    private var activeStreamJob: Job? = null
    private var activeStreamingMessage: ChatMessageItem? = null

    init {
        bootstrap()
        observeNetwork()
    }

    private fun newSafeId(prefix: String): String =
        "${prefix}_${UUID.randomUUID().toString().replace("-", "").take(14)}"

    private fun nowIso(): String = DateTimeFormatter.ISO_INSTANT.format(Instant.now())

    private fun bootstrap() {
        val layout = store.loadLayoutPrefs()
        val session = store.loadSession()
        val projects = store.listProjects()
        var chats = store.listChats()
        if (chats.isEmpty()) {
            val initial = ChatThread(
                id = newSafeId("chat"),
                title = "Новый чат",
                updatedAtMs = System.currentTimeMillis()
            )
            store.upsertChat(initial)
            chats = listOf(initial)
        }
        val activeChatId = chats.first().id
        val messages = store.listMessages(activeChatId)
        val bookmarked = store.listBookmarkedMessages()
        val cachedLibrary = store.loadCachedLibraryFiles()
        val cachedMemories = store.loadCachedMemories()
        val engineProjects = store.listEngineProjects()
        val outbox = store.listOutbox()

        _state.update {
            it.copy(
                session = session,
                layoutPrefs = layout,
                serverBaseUrl = store.getServerBaseUrl(),
                isOnline = network.isOnline.value,
                cloudSyncStatus = when {
                    session == null -> CloudSyncStatus.IDLE
                    !session.isCloudSynced -> CloudSyncStatus.LOCAL_ONLY
                    !network.isOnline.value -> CloudSyncStatus.OFFLINE
                    else -> CloudSyncStatus.IDLE
                },
                projects = projects,
                chats = chats,
                activeChatId = activeChatId,
                messages = messages,
                bookmarkedMessages = bookmarked,
                libraryFiles = cachedLibrary,
                memories = cachedMemories,
                engineProjects = engineProjects,
                activeEngineProjectId = engineProjects.firstOrNull()?.id,
                outboxCount = outbox.size
            )
        }

        if (session != null && session.isCloudSynced && network.isOnline.value) {
            syncAllFromCloud()
        }
    }

    private fun observeNetwork() {
        viewModelScope.launch {
            network.isOnline.collect { online ->
                _state.update { st ->
                    st.copy(
                        isOnline = online,
                        cloudSyncStatus = if (!online && st.session != null && st.session.isCloudSynced) {
                            CloudSyncStatus.OFFLINE
                        } else st.cloudSyncStatus
                    )
                }
                if (online) {
                    flushOfflineOutbox()
                    val s = _state.value.session
                    if (s != null && s.isCloudSynced) syncAllFromCloud()
                }
            }
        }
    }

    private suspend fun getFreshSession(): AuthSession? {
        val current = _state.value.session ?: return null
        if (!current.isCloudSynced) return current
        val refreshed = runCatching { authApi.refreshSession(current) }.getOrDefault(current)
        if (refreshed != current) {
            store.saveSession(refreshed)
            _state.update { it.copy(session = refreshed) }
        }
        return refreshed
    }

    // ==================== CLOUD FIRESTORE SYNC ====================

    fun syncAllFromCloud() {
        viewModelScope.launch {
            val session = getFreshSession() ?: return@launch
            if (!session.isCloudSynced) {
                _state.update { it.copy(cloudSyncStatus = CloudSyncStatus.LOCAL_ONLY) }
                return@launch
            }
            if (!_state.value.isOnline) {
                _state.update { it.copy(cloudSyncStatus = CloudSyncStatus.OFFLINE) }
                return@launch
            }
            _state.update { it.copy(cloudSyncStatus = CloudSyncStatus.SYNCING) }

            runCatching {
                val profileDef = async { firestore.fetchProfile(session) }
                val projectsDef = async { firestore.fetchProjects(session) }
                val chatsDef = async { firestore.fetchChats(session) }
                val memoriesDef = async { firestore.fetchMemories(session) }
                val libraryDef = async { firestore.fetchLibraryFiles(session) }
                val engineDef = async { firestore.fetchEngineProjects(session) }

                val remoteProfile = profileDef.await()
                val remoteProjects = projectsDef.await()
                val remoteChats = chatsDef.await()
                val remoteMemories = memoriesDef.await()
                val remoteLibrary = libraryDef.await()
                val remoteEngine = engineDef.await()

                // Merge Projects
                remoteProjects.forEach { store.upsertProject(it) }
                val mergedProjects = store.listProjects()

                // Merge Chats
                remoteChats.forEach { store.upsertChat(it) }
                var mergedChats = store.listChats()
                if (mergedChats.isEmpty()) {
                    val fresh = ChatThread(newSafeId("chat"), "Новый чат", System.currentTimeMillis())
                    store.upsertChat(fresh)
                    mergedChats = listOf(fresh)
                }

                // Merge Memories
                val mergedMemories = (remoteMemories + _state.value.memories)
                    .distinctBy { it.id }
                    .sortedByDescending { it.createdAt }
                store.cacheMemories(mergedMemories)

                // Merge Library
                val mergedLibrary = (remoteLibrary + _state.value.libraryFiles)
                    .distinctBy { it.id }
                    .sortedByDescending { it.updatedAt }
                store.cacheLibraryFiles(mergedLibrary)

                // Merge Engine Projects
                remoteEngine.forEach { store.upsertEngineProject(it) }
                val mergedEngine = store.listEngineProjects()

                // Optional gateway subscription fallback if configured
                val sub = if (remoteProfile != null) {
                    remoteProfile.subscription
                } else {
                    runCatching { api.getSubscription(session) }.getOrDefault(_state.value.subscription)
                }

                // Sync accent/theme/lang from cloud profile if present & local hasn't diverged
                var updatedLayout = _state.value.layoutPrefs
                if (remoteProfile != null) {
                    val remoteAccent = remoteProfile.accent?.let { AccentPresetId.fromId(it) }
                    val remoteDark = remoteProfile.theme?.let { it != "light" }
                    val remoteLang = remoteProfile.lang?.takeIf { it == "ru" || it == "en" }
                    updatedLayout = updatedLayout.copy(
                        accent = remoteAccent ?: updatedLayout.accent,
                        darkTheme = remoteDark ?: updatedLayout.darkTheme,
                        language = remoteLang ?: updatedLayout.language
                    )
                    store.saveLayoutPrefs(updatedLayout)
                }

                val activeId = _state.value.activeChatId.takeIf { id -> mergedChats.any { it.id == id } }
                    ?: mergedChats.first().id
                var activeMessages = store.listMessages(activeId)
                if (activeMessages.isEmpty()) {
                    val remoteMsgs = firestore.fetchMessagesForChat(session, activeId)
                    remoteMsgs.forEach { store.upsertMessage(it) }
                    activeMessages = store.listMessages(activeId)
                }

                _state.update { st ->
                    st.copy(
                        cloudSyncStatus = CloudSyncStatus.SYNCED,
                        layoutPrefs = updatedLayout,
                        projects = mergedProjects,
                        chats = mergedChats,
                        activeChatId = activeId,
                        messages = activeMessages,
                        memories = mergedMemories,
                        libraryFiles = mergedLibrary,
                        engineProjects = mergedEngine,
                        activeEngineProjectId = st.activeEngineProjectId ?: mergedEngine.firstOrNull()?.id,
                        subscription = sub
                    )
                }
            }.onFailure {
                _state.update { it.copy(cloudSyncStatus = CloudSyncStatus.ERROR) }
            }
        }
    }

    // ==================== AUTH ====================

    fun clearAuthError() {
        if (_state.value.authError != null) {
            _state.update { it.copy(authError = null) }
        }
    }

    fun getAuthBridgeBaseUrl(): String {
        val configured = store.getServerBaseUrl().trim().trimEnd('/')
        if (configured.startsWith("https://") || configured.startsWith("http://")) {
            return configured
        }
        return BuildConfig.DEFAULT_AUTH_BRIDGE_URL.trim().trimEnd('/')
    }

    fun createAndStoreOAuthState(): String {
        val state = UUID.randomUUID().toString().replace("-", "")
        store.savePendingOAuthState(state)
        return state
    }

    fun verifyAndConsumeOAuthState(incoming: String?): Boolean {
        val expected = store.consumePendingOAuthState()
        if (expected.isNullOrBlank()) return true
        return !incoming.isNullOrBlank() && expected == incoming
    }

    private fun isValidEmail(raw: String): Boolean {
        val clean = raw.trim()
        val at = clean.indexOf('@')
        val dot = clean.lastIndexOf('.')
        return clean.length >= 5 && at > 0 && dot > at + 1 && dot < clean.length - 1 && !clean.contains(' ')
    }

    fun signIn(email: String, password: String) {
        val cleanEmail = email.trim()
        if (!isValidEmail(cleanEmail)) {
            _state.update { it.copy(authError = "Введите корректный адрес email") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isAuthLoading = true, authError = null) }
            runCatching {
                try {
                    authApi.signInWithEmail(cleanEmail, password)
                } catch (err: Throwable) {
                    val localMatch = store.authenticateLocalEmailAccount(cleanEmail, password)
                    if (localMatch != null) {
                        localMatch
                    } else if (err is FirebaseOperationNotAllowedException) {
                        throw IllegalStateException("Аккаунт с этим email не найден. Перейдите на вкладку «Регистрация» или войдите через Google.")
                    } else {
                        throw err
                    }
                }
            }.onSuccess { session ->
                store.saveSession(session)
                _state.update {
                    it.copy(
                        session = session,
                        isAuthLoading = false,
                        authError = null,
                        needsAccentOnboarding = false,
                        cloudSyncStatus = if (session.isCloudSynced) it.cloudSyncStatus else CloudSyncStatus.LOCAL_ONLY
                    )
                }
                if (session.isCloudSynced) {
                    syncAllFromCloud()
                }
            }.onFailure { err ->
                _state.update { it.copy(isAuthLoading = false, authError = err.message ?: "Ошибка входа") }
            }
        }
    }

    fun signUp(email: String, password: String, displayName: String) {
        val cleanEmail = email.trim()
        val cleanName = displayName.trim()
        if (!isValidEmail(cleanEmail)) {
            _state.update { it.copy(authError = "Введите корректный адрес email") }
            return
        }
        if (password.length < 6) {
            _state.update { it.copy(authError = "Пароль должен содержать минимум 6 символов") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(isAuthLoading = true, authError = null) }
            runCatching {
                try {
                    authApi.signUpWithEmail(cleanEmail, password, cleanName)
                } catch (_: FirebaseOperationNotAllowedException) {
                    // Matches web firebase-service.ts fallback when Firebase Email/Password provider is disabled
                    store.registerLocalEmailAccount(cleanEmail, password, cleanName)
                }
            }.onSuccess { session ->
                store.saveSession(session)
                _state.update {
                    it.copy(
                        session = session,
                        isAuthLoading = false,
                        authError = null,
                        needsAccentOnboarding = true,
                        cloudSyncStatus = if (session.isCloudSynced) it.cloudSyncStatus else CloudSyncStatus.LOCAL_ONLY
                    )
                }
                if (session.isCloudSynced) {
                    val lp = _state.value.layoutPrefs
                    viewModelScope.launch {
                        firestore.saveProfilePrefs(session, if (lp.darkTheme) "dark" else "light", lp.accent.id, lp.language)
                    }
                    syncAllFromCloud()
                }
            }.onFailure { err ->
                _state.update { it.copy(isAuthLoading = false, authError = err.message ?: "Ошибка регистрации") }
            }
        }
    }

    fun completeAccentOnboarding(accent: AccentPresetId) {
        updateLayoutPrefs { it.copy(accent = accent) }
        _state.update { it.copy(needsAccentOnboarding = false) }
    }

    fun setGoogleAuthLoading(loading: Boolean) {
        _state.update { it.copy(isGoogleAuthLoading = loading, authError = if (loading) null else it.authError) }
    }

    fun onGoogleAuthError(message: String) {
        _state.update { it.copy(isGoogleAuthLoading = false, isAuthLoading = false, authError = message) }
    }

    fun signInWithFirebaseBridge(
        uid: String,
        email: String,
        displayName: String,
        idToken: String,
        refreshToken: String
    ) {
        if (uid.isBlank() || idToken.isBlank()) {
            onGoogleAuthError("Не удалось завершить вход через Google. Попробуйте ещё раз.")
            return
        }
        val session = AuthSession(
            uid = uid,
            email = email,
            displayName = displayName.ifBlank { email.substringBefore("@").ifBlank { "User" } },
            idToken = idToken,
            refreshToken = refreshToken,
            expiresAtMs = System.currentTimeMillis() + 3500_000L,
            isGuest = false
        )
        completeGoogleSession(session)
    }

    fun signInWithGoogleIdToken(googleIdToken: String) {
        viewModelScope.launch {
            _state.update { it.copy(isGoogleAuthLoading = true, authError = null) }
            runCatching {
                authApi.signInWithGoogleIdToken(googleIdToken)
            }.onSuccess { session ->
                completeGoogleSession(session)
            }.onFailure { err ->
                _state.update {
                    it.copy(
                        isGoogleAuthLoading = false,
                        authError = err.message ?: "Не удалось войти через Google"
                    )
                }
            }
        }
    }

    fun signInWithGoogleAccessToken(accessToken: String) {
        viewModelScope.launch {
            _state.update { it.copy(isGoogleAuthLoading = true, authError = null) }
            runCatching {
                authApi.signInWithGoogleAccessToken(accessToken)
            }.onSuccess { session ->
                completeGoogleSession(session)
            }.onFailure { err ->
                _state.update {
                    it.copy(
                        isGoogleAuthLoading = false,
                        authError = err.message ?: "Не удалось войти через Google"
                    )
                }
            }
        }
    }

    fun signInWithDeviceGoogleAccount(email: String, displayName: String = "") {
        val cleanEmail = email.trim()
        if (cleanEmail.isBlank()) {
            onGoogleAuthError("Не удалось получить email выбранного аккаунта Google")
            return
        }
        val isFirstTime = !store.hasRegisteredAccount(cleanEmail)
        val session = store.authenticateOrCreateGoogleDeviceAccount(cleanEmail, displayName)
        store.saveSession(session)
        _state.update {
            it.copy(
                session = session,
                isGoogleAuthLoading = false,
                isAuthLoading = false,
                authError = null,
                needsAccentOnboarding = isFirstTime,
                cloudSyncStatus = if (session.isCloudSynced) it.cloudSyncStatus else CloudSyncStatus.LOCAL_ONLY
            )
        }
    }

    private fun completeGoogleSession(session: AuthSession) {
        store.saveSession(session)
        _state.update {
            it.copy(
                session = session,
                isGoogleAuthLoading = false,
                isAuthLoading = false,
                authError = null,
                needsAccentOnboarding = false
            )
        }
        if (session.isCloudSynced) {
            val lp = _state.value.layoutPrefs
            viewModelScope.launch {
                firestore.saveProfilePrefs(session, if (lp.darkTheme) "dark" else "light", lp.accent.id, lp.language)
            }
            syncAllFromCloud()
        }
    }

    fun continueAsGuest() {
        val guest = AuthSession(
            uid = "local_guest",
            email = "guest@igseek.local",
            displayName = "Гость",
            idToken = "",
            refreshToken = "",
            expiresAtMs = Long.MAX_VALUE,
            isGuest = true
        )
        store.saveSession(guest)
        _state.update {
            it.copy(
                session = guest,
                authError = null,
                needsAccentOnboarding = false,
                cloudSyncStatus = CloudSyncStatus.LOCAL_ONLY
            )
        }
    }

    fun sendPasswordReset(email: String) {
        viewModelScope.launch {
            runCatching { authApi.sendPasswordReset(email.trim()) }
                .onSuccess { showToast("Письмо для сброса пароля отправлено на $email") }
                .onFailure { err -> showToast(err.message ?: "Ошибка отправки письма") }
        }
    }

    fun signOut() {
        store.clearSession()
        _state.update {
            it.copy(
                session = null,
                needsAccentOnboarding = false,
                cloudSyncStatus = CloudSyncStatus.IDLE,
                subscription = SubscriptionInfo()
            )
        }
    }

    // ==================== NAVIGATION & LAYOUT ====================

    fun selectTab(tab: IGseekTab) {
        _state.update { it.copy(activeTab = tab) }
        if (tab == IGseekTab.LIBRARY && _state.value.libraryFiles.isEmpty()) refreshLibrary()
        if (tab == IGseekTab.MEMORY && _state.value.memories.isEmpty()) refreshMemories()
    }

    fun selectTabByKey(key: String) {
        val tab = IGseekTab.entries.firstOrNull { it.key == key } ?: IGseekTab.CHAT
        selectTab(tab)
    }

    fun updateLayoutPrefs(transform: (MobileLayoutPrefs) -> MobileLayoutPrefs) {
        val next = transform(_state.value.layoutPrefs)
        store.saveLayoutPrefs(next)
        _state.update { it.copy(layoutPrefs = next) }
        viewModelScope.launch {
            val s = getFreshSession()
            if (s != null && !s.isGuest && _state.value.isOnline) {
                firestore.saveProfilePrefs(s, if (next.darkTheme) "dark" else "light", next.accent.id, next.language)
            }
        }
    }

    fun updateServerBaseUrl(url: String) {
        val clean = url.trim().trimEnd('/')
        store.setServerBaseUrl(clean)
        _state.update { it.copy(serverBaseUrl = clean) }
        showToast(if (clean.isBlank()) "Включён прямой режим API" else "Шлюз API сохранён")
    }

    fun showToast(message: String) {
        _state.update { it.copy(toastMessage = message) }
    }

    fun consumeToast() {
        _state.update { it.copy(toastMessage = null) }
    }

    fun clearKeyRedeemError() {
        _state.update { it.copy(keyRedeemError = null) }
    }

    // ==================== PROJECTS ====================

    fun createProject(name: String) {
        val clean = name.trim().take(80)
        if (clean.isBlank()) return
        val proj = ProjectFolder(newSafeId("proj"), clean, System.currentTimeMillis())
        store.upsertProject(proj)
        _state.update { it.copy(projects = store.listProjects(), activeProjectId = proj.id) }
        viewModelScope.launch {
            getFreshSession()?.let { firestore.syncProject(it, proj) }
        }
    }

    fun selectProject(projectId: String?) {
        _state.update { it.copy(activeProjectId = projectId) }
    }

    fun deleteProject(projectId: String) {
        store.deleteProject(projectId)
        _state.update {
            it.copy(
                projects = store.listProjects(),
                chats = store.listChats(),
                activeProjectId = if (it.activeProjectId == projectId) null else it.activeProjectId
            )
        }
        viewModelScope.launch {
            getFreshSession()?.let { firestore.deleteProject(it, projectId) }
        }
    }

    // ==================== SHARE SHEET & VOICE ====================

    fun onIncomingShare(payload: SharedIncomingPayload) {
        _state.update { st ->
            val combinedDraft = listOfNotNull(
                st.draftInput.takeIf { it.isNotBlank() },
                payload.text?.takeIf { it.isNotBlank() }
            ).joinToString("\n\n")
            val nextAttachments = if (payload.attachment != null) {
                st.pendingAttachments + payload.attachment
            } else st.pendingAttachments
            st.copy(
                activeTab = IGseekTab.CHAT,
                draftInput = combinedDraft,
                pendingAttachments = nextAttachments
            )
        }
        showToast("Данные добавлены в чат IGseek")
    }

    fun appendVoiceTranscript(transcript: String) {
        val clean = transcript.trim()
        if (clean.isBlank()) return
        _state.update { st ->
            val next = if (st.draftInput.isBlank()) clean else "${st.draftInput.trimEnd()} $clean"
            st.copy(draftInput = next)
        }
    }

    // ==================== CHAT ====================

    fun updateDraft(text: String) {
        _state.update { it.copy(draftInput = text) }
    }

    fun setModel(model: AiModelId) {
        _state.update { it.copy(selectedModel = model) }
    }

    fun setAgent(agent: AgentRoleId) {
        _state.update { it.copy(selectedAgent = agent) }
    }

    fun toggleWebSearch() {
        _state.update { it.copy(webSearchEnabled = !it.webSearchEnabled) }
    }

    fun toggleReasoning() {
        _state.update { it.copy(reasoningEnabled = !it.reasoningEnabled) }
    }

    fun toggleImageMode() {
        _state.update { it.copy(imageModeEnabled = !it.imageModeEnabled) }
    }

    fun addAttachment(attachment: ChatAttachment) {
        _state.update { it.copy(pendingAttachments = (it.pendingAttachments + attachment).take(4)) }
    }

    fun removeAttachment(name: String) {
        _state.update { it.copy(pendingAttachments = it.pendingAttachments.filterNot { a -> a.name == name }) }
    }

    fun createNewChat() {
        val projectId = _state.value.activeProjectId
        val chat = ChatThread(
            id = newSafeId("chat"),
            title = "Новый чат",
            updatedAtMs = System.currentTimeMillis(),
            projectId = projectId
        )
        store.upsertChat(chat)
        _state.update {
            it.copy(
                chats = store.listChats(),
                activeChatId = chat.id,
                messages = emptyList(),
                activeTab = IGseekTab.CHAT
            )
        }
        viewModelScope.launch {
            getFreshSession()?.let { firestore.syncChat(it, chat) }
        }
    }

    fun selectChat(chatId: String) {
        val localMsgs = store.listMessages(chatId)
        _state.update {
            it.copy(
                activeChatId = chatId,
                messages = localMsgs,
                activeTab = IGseekTab.CHAT
            )
        }
        if (localMsgs.isEmpty() && _state.value.isOnline) {
            viewModelScope.launch {
                val session = getFreshSession() ?: return@launch
                if (session.isGuest) return@launch
                val remoteMsgs = firestore.fetchMessagesForChat(session, chatId)
                if (remoteMsgs.isNotEmpty()) {
                    remoteMsgs.forEach { store.upsertMessage(it) }
                    if (_state.value.activeChatId == chatId) {
                        _state.update { it.copy(messages = store.listMessages(chatId)) }
                    }
                }
            }
        }
    }

    fun toggleSaveChat(chatId: String) {
        val chat = _state.value.chats.firstOrNull { it.id == chatId } ?: return
        val updated = chat.copy(isSaved = !chat.isSaved, updatedAtMs = System.currentTimeMillis())
        store.upsertChat(updated)
        _state.update { it.copy(chats = store.listChats()) }
        showToast(if (updated.isSaved) "Чат добавлен в Сохранённое" else "Убрано из Сохранённого")
        viewModelScope.launch {
            getFreshSession()?.let { firestore.syncChat(it, updated) }
        }
    }

    fun toggleBookmarkMessage(messageId: String) {
        val current = _state.value.messages.firstOrNull { it.id == messageId }
            ?: _state.value.bookmarkedMessages.firstOrNull { it.id == messageId }
            ?: return
        val updated = current.copy(isBookmarked = !current.isBookmarked)
        store.upsertMessage(updated)
        _state.update { st ->
            st.copy(
                messages = if (st.activeChatId == updated.chatId) store.listMessages(st.activeChatId) else st.messages,
                bookmarkedMessages = store.listBookmarkedMessages()
            )
        }
        showToast(if (updated.isBookmarked) "Сообщение сохранено" else "Удалено из сохранённых")
    }

    fun deleteChat(chatId: String) {
        store.deleteChat(chatId)
        var chats = store.listChats()
        if (chats.isEmpty()) {
            val fresh = ChatThread(newSafeId("chat"), "Новый чат", System.currentTimeMillis())
            store.upsertChat(fresh)
            chats = listOf(fresh)
        }
        val nextActive = if (_state.value.activeChatId == chatId) chats.first().id else _state.value.activeChatId
        _state.update {
            it.copy(
                chats = chats,
                activeChatId = nextActive,
                messages = store.listMessages(nextActive),
                bookmarkedMessages = store.listBookmarkedMessages()
            )
        }
        viewModelScope.launch {
            getFreshSession()?.let { firestore.deleteChat(it, chatId) }
        }
    }

    fun startPromptInChat(prompt: String) {
        _state.update { it.copy(activeTab = IGseekTab.CHAT, draftInput = prompt) }
        sendMessage(prompt)
    }

    fun regenerateLastReply() {
        val st = _state.value
        if (st.isStreaming) return
        val lastUser = st.messages.lastOrNull { it.role == "user" } ?: return
        val lastMsg = st.messages.lastOrNull()
        if (lastMsg != null && lastMsg.role == "assistant") {
            store.deleteMessage(lastMsg.id)
        }
        val updatedHistory = store.listMessages(st.activeChatId)
        _state.update { it.copy(messages = updatedHistory) }
        executeChatStream(
            chatId = st.activeChatId,
            history = updatedHistory,
            model = st.selectedModel,
            agent = st.selectedAgent,
            webSearch = st.webSearchEnabled,
            reasoning = st.reasoningEnabled,
            imageMode = st.imageModeEnabled,
            attachments = emptyList(),
            idempotencyKey = UUID.randomUUID().toString()
        )
    }

    fun sendMessage(overrideText: String? = null) {
        val st = _state.value
        val text = (overrideText ?: st.draftInput).trim()
        val attachments = st.pendingAttachments
        if ((text.isBlank() && attachments.isEmpty()) || st.isStreaming) return

        val chatId = st.activeChatId.ifBlank { newSafeId("chat") }
        val userMsgId = newSafeId("msg")
        val now = System.currentTimeMillis()

        val userMsg = ChatMessageItem(
            id = userMsgId,
            chatId = chatId,
            role = "user",
            content = text.ifBlank { "Проанализируй прикреплённые файлы" },
            attachmentNames = attachments.map { it.name },
            createdAtMs = now,
            isQueuedOffline = !st.isOnline
        )
        store.upsertMessage(userMsg)

        val currentChat = st.chats.firstOrNull { it.id == chatId }
        val newTitle = if (currentChat == null || currentChat.title == "Новый чат") {
            userMsg.content.replace("\n", " ").take(44).ifBlank { "Новый чат" }
        } else currentChat.title
        val updatedChat = ChatThread(
            id = chatId,
            title = newTitle,
            updatedAtMs = now,
            isSaved = currentChat?.isSaved ?: false,
            projectId = currentChat?.projectId ?: st.activeProjectId
        )
        store.upsertChat(updatedChat)

        val history = store.listMessages(chatId)
        _state.update {
            it.copy(
                draftInput = "",
                pendingAttachments = emptyList(),
                chats = store.listChats(),
                activeChatId = chatId,
                messages = history
            )
        }

        // Sync chat + user message to Firestore in background
        viewModelScope.launch {
            getFreshSession()?.let { s ->
                firestore.syncChat(s, updatedChat)
                firestore.syncMessage(s, userMsg, history.size)
            }
        }

        if (!st.isOnline) {
            val queued = OutboxQueuedMessage(
                id = newSafeId("out"),
                chatId = chatId,
                messageId = userMsgId,
                text = userMsg.content,
                modelId = st.selectedModel.apiId,
                agentId = st.selectedAgent.apiId,
                webSearch = st.webSearchEnabled,
                reasoning = st.reasoningEnabled,
                imageMode = st.imageModeEnabled,
                idempotencyKey = UUID.randomUUID().toString(),
                createdAtMs = now
            )
            store.enqueueOutbox(queued)
            _state.update { it.copy(outboxCount = store.listOutbox().size) }
            showToast("Оффлайн: сообщение в очереди, отправится при появлении сети")
            return
        }

        executeChatStream(
            chatId = chatId,
            history = history,
            model = st.selectedModel,
            agent = st.selectedAgent,
            webSearch = st.webSearchEnabled,
            reasoning = st.reasoningEnabled,
            imageMode = st.imageModeEnabled,
            attachments = attachments,
            idempotencyKey = UUID.randomUUID().toString()
        )
    }

    fun stopStreaming() {
        api.cancelActiveStream()
        activeStreamJob?.cancel()
        activeStreamJob = null
        val partial = activeStreamingMessage
        activeStreamingMessage = null
        if (partial != null) {
            if (partial.content.isBlank() && partial.images.isEmpty() && partial.reasoning.isBlank()) {
                store.deleteMessage(partial.id)
            } else {
                store.upsertMessage(partial.copy(isError = false))
            }
        }
        val activeId = _state.value.activeChatId
        _state.update {
            it.copy(
                isStreaming = false,
                imageModeEnabled = false,
                messages = if (activeId.isNotBlank()) store.listMessages(activeId) else it.messages
            )
        }
    }

    private fun executeChatStream(
        chatId: String,
        history: List<ChatMessageItem>,
        model: AiModelId,
        agent: AgentRoleId,
        webSearch: Boolean,
        reasoning: Boolean,
        imageMode: Boolean,
        attachments: List<ChatAttachment>,
        idempotencyKey: String
    ) {
        api.cancelActiveStream()
        activeStreamJob?.cancel()
        var launchedJob: kotlinx.coroutines.Job? = null
        launchedJob = viewModelScope.launch {
            val assistantId = newSafeId("msg")
            var assistantMsg = ChatMessageItem(
                id = assistantId,
                chatId = chatId,
                role = "assistant",
                content = "",
                createdAtMs = System.currentTimeMillis() + 1L
            )
            activeStreamingMessage = assistantMsg
            store.upsertMessage(assistantMsg)
            _state.update {
                it.copy(
                    isStreaming = true,
                    messages = if (it.activeChatId == chatId) store.listMessages(chatId) else it.messages
                )
            }

            val session = kotlinx.coroutines.withTimeoutOrNull(1200L) { getFreshSession() } ?: _state.value.session
            val memories = _state.value.memories
            val language = _state.value.layoutPrefs.language

            runCatching {
                api.streamChat(
                    session = session,
                    history = history,
                    model = model,
                    agent = agent,
                    webSearch = webSearch,
                    reasoning = reasoning,
                    imageMode = imageMode,
                    memories = memories,
                    language = language,
                    attachments = attachments,
                    idempotencyKey = idempotencyKey,
                    onDelta = { fullText ->
                        assistantMsg = assistantMsg.copy(content = fullText)
                        activeStreamingMessage = assistantMsg
                        updateStreamingMessageInUi(assistantMsg)
                    },
                    onReasoning = { fullReasoning ->
                        assistantMsg = assistantMsg.copy(reasoning = fullReasoning)
                        activeStreamingMessage = assistantMsg
                        updateStreamingMessageInUi(assistantMsg)
                    },
                    onImage = { img ->
                        assistantMsg = assistantMsg.copy(images = assistantMsg.images + img)
                        activeStreamingMessage = assistantMsg
                        updateStreamingMessageInUi(assistantMsg)
                    },
                    onSources = { sources ->
                        assistantMsg = assistantMsg.copy(webSources = sources)
                        activeStreamingMessage = assistantMsg
                        updateStreamingMessageInUi(assistantMsg)
                    }
                )
            }.onSuccess { result ->
                activeStreamingMessage = null
                assistantMsg = assistantMsg.copy(
                    content = result.content.ifBlank { assistantMsg.content.ifBlank { "Готово." } },
                    reasoning = result.reasoning.ifBlank { assistantMsg.reasoning },
                    images = result.images.ifEmpty { assistantMsg.images },
                    webSources = result.webSources.ifEmpty { assistantMsg.webSources },
                    isError = false
                )
                store.upsertMessage(assistantMsg)
                assistantMsg.images.forEach { img ->
                    saveGeneratedImageToLibrary(img, silent = true)
                }
                val finalMsgs = store.listMessages(chatId)
                _state.update {
                    it.copy(
                        isStreaming = false,
                        imageModeEnabled = false,
                        messages = if (it.activeChatId == chatId) finalMsgs else it.messages
                    )
                }
                if (session != null && !session.isGuest) {
                    firestore.syncMessage(session, assistantMsg, finalMsgs.size)
                }
            }.onFailure { err ->
                activeStreamingMessage = null
                val isCanceled = err is CancellationException ||
                    err.message?.contains("Canceled", ignoreCase = true) == true ||
                    err.message?.contains("Socket closed", ignoreCase = true) == true
                if (isCanceled) {
                    if (assistantMsg.content.isBlank() && assistantMsg.images.isEmpty() && assistantMsg.reasoning.isBlank()) {
                        store.deleteMessage(assistantMsg.id)
                    } else {
                        store.upsertMessage(assistantMsg.copy(isError = false))
                    }
                    _state.update {
                        it.copy(
                            isStreaming = false,
                            imageModeEnabled = false,
                            messages = if (it.activeChatId == chatId) store.listMessages(chatId) else it.messages
                        )
                    }
                    return@onFailure
                }
                assistantMsg = assistantMsg.copy(
                    content = "Ошибка запроса: ${err.message ?: "проверьте подключение к интернету"}",
                    isError = true
                )
                store.upsertMessage(assistantMsg)
                _state.update {
                    it.copy(
                        isStreaming = false,
                        messages = if (it.activeChatId == chatId) store.listMessages(chatId) else it.messages
                    )
                }
            }
            if (activeStreamJob === launchedJob) {
                activeStreamJob = null
            }
        }
        activeStreamJob = launchedJob
    }

    private fun updateStreamingMessageInUi(msg: ChatMessageItem) {
        _state.update { st ->
            if (st.activeChatId != msg.chatId) return@update st
            val updated = st.messages.map { if (it.id == msg.id) msg else it }
            st.copy(messages = if (updated.any { it.id == msg.id }) updated else updated + msg)
        }
    }

    fun saveGeneratedImageToLibrary(img: GeneratedImageItem, silent: Boolean = false) {
        val item = LibraryFileItem(
            id = "lib_${img.id}",
            name = "${img.title.take(40).ifBlank { "IGseek Image" }}.jpg",
            type = "image",
            mimeType = "image/jpeg",
            sizeBytes = img.dataUrl.length.toLong(),
            source = "chat",
            chatTitle = "IGseek Image",
            updatedAt = nowIso(),
            dataUrl = img.dataUrl
        )
        val merged = (listOf(item) + _state.value.libraryFiles).distinctBy { it.id }
        store.cacheLibraryFiles(merged)
        _state.update { it.copy(libraryFiles = merged) }
        if (!silent) showToast("Изображение сохранено в Library")
        viewModelScope.launch {
            getFreshSession()?.let { firestore.syncLibraryFile(it, item) }
        }
    }

    private fun flushOfflineOutbox() {
        viewModelScope.launch {
            val queued = store.listOutbox()
            if (queued.isEmpty()) return@launch
            for (item in queued) {
                if (!_state.value.isOnline) break
                val msgs = store.listMessages(item.chatId)
                msgs.firstOrNull { it.id == item.messageId }?.let { orig ->
                    store.upsertMessage(orig.copy(isQueuedOffline = false))
                }
                val model = AiModelId.entries.firstOrNull { it.apiId == item.modelId } ?: AiModelId.INSTINCT
                val agent = AgentRoleId.entries.firstOrNull { it.apiId == item.agentId } ?: AgentRoleId.UNIVERSAL
                store.removeOutbox(item.id)
                _state.update { it.copy(outboxCount = store.listOutbox().size) }
                executeChatStream(
                    chatId = item.chatId,
                    history = store.listMessages(item.chatId),
                    model = model,
                    agent = agent,
                    webSearch = item.webSearch,
                    reasoning = item.reasoning,
                    imageMode = item.imageMode,
                    attachments = emptyList(),
                    idempotencyKey = item.idempotencyKey
                )
            }
        }
    }

    // ==================== FLOW ====================

    fun planFlow(goal: String) {
        val clean = goal.trim()
        if (clean.isBlank()) return
        viewModelScope.launch {
            _state.update { it.copy(flowTask = FlowTaskState(goal = clean, isPlanning = true)) }
            val session = getFreshSession()
            runCatching {
                api.planFlow(session, clean, _state.value.layoutPrefs.language)
            }.onSuccess { plan ->
                _state.update {
                    it.copy(
                        flowTask = FlowTaskState(
                            title = plan.title,
                            goal = clean,
                            steps = plan.steps,
                            isPlanning = false
                        )
                    )
                }
            }.onFailure { err ->
                _state.update {
                    it.copy(flowTask = it.flowTask.copy(isPlanning = false, error = err.message ?: "Ошибка планирования"))
                }
            }
        }
    }

    fun runFlow() {
        val current = _state.value.flowTask
        if (current.steps.isEmpty() || current.isRunning) return
        viewModelScope.launch {
            _state.update { it.copy(flowTask = it.flowTask.copy(isRunning = true, error = null)) }
            val session = getFreshSession()
            val outputs = mutableListOf<Pair<String, String>>()
            val lang = _state.value.layoutPrefs.language

            for (index in current.steps.indices) {
                val step = _state.value.flowTask.steps[index]
                updateFlowStep(index) { it.copy(status = "running") }
                val res = runCatching {
                    api.executeFlowStep(session, current.goal, step, outputs, lang)
                }
                if (res.isSuccess) {
                    val out = res.getOrDefault("")
                    outputs.add(step.title to out)
                    updateFlowStep(index) { it.copy(status = "done", output = out) }
                } else {
                    updateFlowStep(index) {
                        it.copy(status = "error", output = res.exceptionOrNull()?.message ?: "Ошибка шага")
                    }
                    _state.update { it.copy(flowTask = it.flowTask.copy(isRunning = false)) }
                    return@launch
                }
            }
            _state.update { it.copy(flowTask = it.flowTask.copy(isRunning = false)) }
            showToast("Flow выполнен!")
        }
    }

    fun saveFlowResultToLibrary() {
        val task = _state.value.flowTask
        if (task.steps.isEmpty()) return
        val md = buildString {
            append("# ${task.title.ifBlank { "IGseek Flow" }}\n\n")
            append("**Цель:** ${task.goal}\n\n")
            task.steps.forEachIndexed { idx, s ->
                append("## ${idx + 1}. ${s.title}\n")
                if (s.output.isNotBlank()) append("${s.output}\n\n") else append("${s.description}\n\n")
            }
        }
        val item = LibraryFileItem(
            id = newSafeId("lib"),
            name = "${task.title.take(40).ifBlank { "flow_result" }}.md",
            type = "markdown",
            mimeType = "text/markdown",
            sizeBytes = md.toByteArray().size.toLong(),
            source = "flow",
            chatTitle = task.title.ifBlank { "Flow" },
            updatedAt = nowIso(),
            content = md
        )
        val merged = listOf(item) + _state.value.libraryFiles
        store.cacheLibraryFiles(merged)
        _state.update { it.copy(libraryFiles = merged) }
        showToast("Отчёт Flow сохранён в Library")
        viewModelScope.launch {
            getFreshSession()?.let { firestore.syncLibraryFile(it, item) }
        }
    }

    fun resetFlow() {
        _state.update { it.copy(flowTask = FlowTaskState()) }
    }

    private fun updateFlowStep(index: Int, transform: (app.igseek.mobile.data.models.FlowStepItem) -> app.igseek.mobile.data.models.FlowStepItem) {
        _state.update { st ->
            val updated = st.flowTask.steps.mapIndexed { idx, s -> if (idx == index) transform(s) else s }
            st.copy(flowTask = st.flowTask.copy(steps = updated))
        }
    }

    // ==================== ENGINE ====================

    fun generateEngineProject(prompt: String) {
        val clean = prompt.trim()
        if (clean.isBlank() || _state.value.isEngineGenerating) return
        viewModelScope.launch {
            _state.update { it.copy(isEngineGenerating = true, engineError = null) }
            runCatching {
                api.generateEngineProject(clean, _state.value.layoutPrefs.language)
            }.onSuccess { project ->
                store.upsertEngineProject(project)
                val all = store.listEngineProjects()
                _state.update {
                    it.copy(
                        engineProjects = all,
                        activeEngineProjectId = project.id,
                        isEngineGenerating = false
                    )
                }
                showToast("Проект «${project.title}» создан в Engine")
                getFreshSession()?.let { firestore.syncEngineProject(it, project) }
            }.onFailure { err ->
                _state.update {
                    it.copy(isEngineGenerating = false, engineError = err.message ?: "Ошибка генерации проекта")
                }
            }
        }
    }

    fun selectEngineProject(id: String) {
        _state.update { it.copy(activeEngineProjectId = id) }
    }

    fun selectEngineFile(path: String) {
        val activeId = _state.value.activeEngineProjectId ?: return
        val proj = _state.value.engineProjects.firstOrNull { it.id == activeId } ?: return
        val updated = proj.copy(activeFile = path)
        store.upsertEngineProject(updated)
        _state.update { it.copy(engineProjects = store.listEngineProjects()) }
    }

    fun deleteEngineProject(id: String) {
        store.deleteEngineProject(id)
        val remaining = store.listEngineProjects()
        _state.update {
            it.copy(
                engineProjects = remaining,
                activeEngineProjectId = if (it.activeEngineProjectId == id) remaining.firstOrNull()?.id else it.activeEngineProjectId
            )
        }
        viewModelScope.launch {
            getFreshSession()?.let { firestore.deleteEngineProject(it, id) }
        }
    }

    fun saveEngineProjectToLibrary(project: EngineProjectItem) {
        val bundle = buildString {
            append("# ${project.title}\n\n")
            project.files.forEach { f ->
                append("## ${f.path}\n```\n${f.content}\n```\n\n")
            }
        }
        val item = LibraryFileItem(
            id = newSafeId("lib"),
            name = "${project.title.take(36)}.md",
            type = "code",
            mimeType = "text/markdown",
            sizeBytes = bundle.toByteArray().size.toLong(),
            source = "engine",
            chatTitle = project.title,
            updatedAt = nowIso(),
            content = bundle
        )
        val merged = listOf(item) + _state.value.libraryFiles
        store.cacheLibraryFiles(merged)
        _state.update { it.copy(libraryFiles = merged) }
        showToast("Код проекта сохранён в Library")
        viewModelScope.launch {
            getFreshSession()?.let { firestore.syncLibraryFile(it, item) }
        }
    }

    // ==================== LIBRARY ====================

    fun refreshLibrary() {
        viewModelScope.launch {
            val session = getFreshSession() ?: return@launch
            if (session.isGuest || !_state.value.isOnline) return@launch
            _state.update { it.copy(isLibraryLoading = true) }
            runCatching { firestore.fetchLibraryFiles(session) }
                .onSuccess { remote ->
                    val merged = (remote + _state.value.libraryFiles).distinctBy { it.id }
                    store.cacheLibraryFiles(merged)
                    _state.update { it.copy(libraryFiles = merged, isLibraryLoading = false) }
                }
                .onFailure {
                    _state.update { it.copy(isLibraryLoading = false) }
                }
        }
    }

    fun uploadToLibrary(attachment: ChatAttachment) {
        val isImage = attachment.mimeType.startsWith("image/")
        val decodedText = if (!isImage && attachment.dataUrl.contains("base64,")) {
            runCatching {
                val b64 = attachment.dataUrl.substringAfter("base64,")
                String(Base64.decode(b64, Base64.DEFAULT)).take(80_000)
            }.getOrNull()
        } else null

        val item = LibraryFileItem(
            id = newSafeId("lib"),
            name = attachment.name,
            type = if (isImage) "image" else "doc",
            mimeType = attachment.mimeType,
            sizeBytes = attachment.sizeBytes,
            source = "upload",
            chatTitle = "Загрузка",
            updatedAt = nowIso(),
            content = decodedText,
            dataUrl = if (isImage) attachment.dataUrl else null
        )
        val merged = listOf(item) + _state.value.libraryFiles
        store.cacheLibraryFiles(merged)
        _state.update { it.copy(libraryFiles = merged) }
        showToast("Файл «${attachment.name}» добавлен в Library")

        viewModelScope.launch {
            getFreshSession()?.let { firestore.syncLibraryFile(it, item) }
        }
    }

    fun attachLibraryFileToChat(item: LibraryFileItem) {
        val dataUrl = item.dataUrl ?: run {
            val bytes = (item.content ?: item.name).toByteArray()
            "data:${item.mimeType};base64,${Base64.encodeToString(bytes, Base64.NO_WRAP)}"
        }
        addAttachment(
            ChatAttachment(
                name = item.name,
                mimeType = item.mimeType,
                dataUrl = dataUrl,
                sizeBytes = item.sizeBytes
            )
        )
        selectTab(IGseekTab.CHAT)
        showToast("«${item.name}» прикреплён к чату")
    }

    fun deleteLibraryFile(id: String) {
        val next = _state.value.libraryFiles.filterNot { it.id == id }
        store.cacheLibraryFiles(next)
        _state.update { it.copy(libraryFiles = next) }
        viewModelScope.launch {
            getFreshSession()?.let { firestore.deleteLibraryFile(it, id) }
        }
    }

    // ==================== MEMORY ====================

    fun refreshMemories() {
        viewModelScope.launch {
            val session = getFreshSession() ?: return@launch
            if (session.isGuest || !_state.value.isOnline) return@launch
            _state.update { it.copy(isMemoriesLoading = true) }
            runCatching { firestore.fetchMemories(session) }
                .onSuccess { remote ->
                    val merged = (remote + _state.value.memories).distinctBy { it.id }
                    store.cacheMemories(merged)
                    _state.update { it.copy(memories = merged, isMemoriesLoading = false) }
                }
                .onFailure {
                    _state.update { it.copy(isMemoriesLoading = false) }
                }
        }
    }

    fun addMemory(content: String, kind: String) {
        val clean = content.trim()
        if (clean.isBlank()) return
        val entry = MemoryEntryItem(
            id = newSafeId("mem"),
            content = clean,
            kind = kind.ifBlank { "other" },
            createdAt = nowIso()
        )
        val merged = listOf(entry) + _state.value.memories
        store.cacheMemories(merged)
        _state.update { it.copy(memories = merged) }
        showToast("Факт сохранён в память")

        viewModelScope.launch {
            getFreshSession()?.let { firestore.syncMemory(it, entry) }
        }
    }

    fun deleteMemory(id: String) {
        val next = _state.value.memories.filterNot { it.id == id }
        store.cacheMemories(next)
        _state.update { it.copy(memories = next) }
        viewModelScope.launch {
            getFreshSession()?.let { firestore.deleteMemory(it, id) }
        }
    }

    // ==================== SUBSCRIPTION ====================

    fun openProSheet() {
        _state.update { it.copy(showProSheet = true, keyRedeemError = null) }
        refreshSubscription()
    }

    fun closeProSheet() {
        _state.update { it.copy(showProSheet = false, keyRedeemError = null) }
    }

    fun refreshSubscription() {
        viewModelScope.launch {
            val session = getFreshSession() ?: return@launch
            if (session.isGuest) return@launch
            val fromFirestore = firestore.fetchProfile(session)?.subscription
            if (fromFirestore != null) {
                _state.update { it.copy(subscription = fromFirestore) }
            }
            runCatching { api.getSubscription(session) }
                .onSuccess { sub ->
                    _state.update { st ->
                        if (sub.isPro || !st.subscription.isPro) st.copy(subscription = sub) else st
                    }
                }
        }
    }

    fun redeemLicenseKey(rawKey: String, onSuccess: () -> Unit = {}) {
        val clean = rawKey.trim()
        if (clean.isBlank()) {
            _state.update { it.copy(keyRedeemError = "Введите ключ формата IGSK-XXXX-XXXX-XXXX.") }
            return
        }
        if (_state.value.isRedeemingKey) return
        viewModelScope.launch {
            val session = getFreshSession()
            if (session == null || session.isGuest || session.idToken.isBlank()) {
                val msg = "Войдите в аккаунт IGseek (через Google), чтобы активировать ключ Pro."
                _state.update { it.copy(keyRedeemError = msg) }
                showToast(msg)
                return@launch
            }
            _state.update { it.copy(isRedeemingKey = true, keyRedeemError = null) }
            runCatching { api.redeemLicenseKey(session, clean) }
                .onSuccess { sub ->
                    _state.update {
                        it.copy(
                            isRedeemingKey = false,
                            keyRedeemError = null,
                            subscription = sub,
                            showProSheet = false
                        )
                    }
                    showToast("Ключ активирован — IGseek Pro подключён на 30 дней!")
                    onSuccess()
                }
                .onFailure { err ->
                    val msg = err.message ?: "Не удалось активировать ключ"
                    _state.update { it.copy(isRedeemingKey = false, keyRedeemError = msg) }
                    showToast(msg)
                }
        }
    }
}
