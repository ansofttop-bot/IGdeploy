package app.igseek.mobile.ui.state

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import app.igseek.mobile.IGseekApplication
import app.igseek.mobile.data.api.IGseekApiClient
import app.igseek.mobile.data.models.AccentPresetId
import app.igseek.mobile.data.models.AgentRoleId
import app.igseek.mobile.data.models.AiModelId
import app.igseek.mobile.data.models.AuthSession
import app.igseek.mobile.data.models.ChatAttachment
import app.igseek.mobile.data.models.ChatMessageItem
import app.igseek.mobile.data.models.ChatThread
import app.igseek.mobile.data.models.FlowTaskState
import app.igseek.mobile.data.models.IGseekTab
import app.igseek.mobile.data.models.LibraryFileItem
import app.igseek.mobile.data.models.MemoryEntryItem
import app.igseek.mobile.data.models.MobileLayoutPrefs
import app.igseek.mobile.data.models.OutboxQueuedMessage
import app.igseek.mobile.data.models.SharedIncomingPayload
import app.igseek.mobile.data.models.SubscriptionInfo
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID

data class IGseekUiState(
    val session: AuthSession? = null,
    val authLoading: Boolean = false,
    val authError: String? = null,
    val serverBaseUrl: String = "",
    val isOnline: Boolean = true,
    val activeTab: IGseekTab = IGseekTab.CHAT,
    val layoutPrefs: MobileLayoutPrefs = MobileLayoutPrefs(),
    val chats: List<ChatThread> = emptyList(),
    val activeChatId: String = "",
    val messages: List<ChatMessageItem> = emptyList(),
    val pendingAttachments: List<ChatAttachment> = emptyList(),
    val selectedModel: AiModelId = AiModelId.INSTINCT,
    val selectedAgent: AgentRoleId = AgentRoleId.UNIVERSAL,
    val webSearchEnabled: Boolean = false,
    val reasoningEnabled: Boolean = false,
    val isStreaming: Boolean = false,
    val streamStatus: String? = null,
    val outboxCount: Int = 0,
    val flowState: FlowTaskState = FlowTaskState(),
    val libraryItems: List<LibraryFileItem> = emptyList(),
    val libraryLoading: Boolean = false,
    val libraryError: String? = null,
    val memories: List<MemoryEntryItem> = emptyList(),
    val memoryLoading: Boolean = false,
    val memoryError: String? = null,
    val subscription: SubscriptionInfo = SubscriptionInfo(),
    val subscriptionLoading: Boolean = false,
    val checkoutUrlEvent: String? = null,
    val toastMessage: String? = null,
    val incomingShare: SharedIncomingPayload? = null
)

class IGseekViewModel(application: Application) : AndroidViewModel(application) {

    private val app = application as IGseekApplication
    private val store = app.localStore
    private val authApi = app.authApi
    private val api = app.apiClient

    private val _state = MutableStateFlow(
        IGseekUiState(
            session = store.loadSession(),
            serverBaseUrl = store.getServerBaseUrl(),
            isOnline = app.networkMonitor.isOnline.value,
            layoutPrefs = store.loadLayoutPrefs(),
            libraryItems = store.loadCachedLibraryFiles(),
            memories = store.loadCachedMemories(),
            outboxCount = store.listOutbox().size
        )
    )
    val state: StateFlow<IGseekUiState> = _state.asStateFlow()

    private var activeStreamJob: Job? = null

    init {
        initChats()
        viewModelScope.launch {
            app.networkMonitor.isOnline.collect { online ->
                _state.update { it.copy(isOnline = online) }
                if (online) flushOfflineOutbox()
            }
        }
        if (_state.value.session != null) refreshAccountData()
    }

    private fun initChats() {
        val existing = store.listChats()
        if (existing.isEmpty()) {
            val fresh = ChatThread("chat_${UUID.randomUUID().toString().take(8)}", "Новый чат", System.currentTimeMillis())
            store.upsertChat(fresh)
            _state.update { it.copy(chats = listOf(fresh), activeChatId = fresh.id, messages = emptyList()) }
        } else {
            val first = existing.first()
            _state.update { it.copy(chats = existing, activeChatId = first.id, messages = store.listMessages(first.id)) }
        }
    }

    fun selectTab(tab: IGseekTab) {
        _state.update { it.copy(activeTab = tab) }
        when (tab) {
            IGseekTab.LIBRARY -> refreshLibrary()
            IGseekTab.MEMORY -> refreshMemories()
            IGseekTab.SETTINGS -> refreshSubscription()
            else -> Unit
        }
    }

    fun selectTabByKey(key: String?) {
        val match = IGseekTab.entries.firstOrNull { it.key == key } ?: return
        selectTab(match)
    }

    fun consumeToast() = _state.update { it.copy(toastMessage = null) }
    fun consumeCheckoutUrl() = _state.update { it.copy(checkoutUrlEvent = null) }
    fun onIncomingShare(payload: SharedIncomingPayload) = _state.update { it.copy(incomingShare = payload) }
    fun dismissIncomingShare() = _state.update { it.copy(incomingShare = null) }

    fun applyIncomingShareToChat(payload: SharedIncomingPayload) {
        _state.update {
            it.copy(
                incomingShare = null,
                activeTab = IGseekTab.CHAT,
                pendingAttachments = if (payload.attachment != null) it.pendingAttachments + payload.attachment else it.pendingAttachments
            )
        }
        if (!payload.text.isNullOrBlank()) sendMessage(payload.text)
        else _state.update { it.copy(toastMessage = "Вложение добавлено в чат") }
    }

    fun saveIncomingShareToLibrary(payload: SharedIncomingPayload) {
        _state.update { it.copy(incomingShare = null, activeTab = IGseekTab.LIBRARY) }
        val att = payload.attachment
        if (att != null) {
            val rawB64 = att.dataUrl.substringAfter("base64,", "")
            val bytes = runCatching { android.util.Base64.decode(rawB64, android.util.Base64.DEFAULT) }
                .getOrElse { att.dataUrl.toByteArray() }
            uploadToLibrary(att.name, att.mimeType, bytes, att.dataUrl)
        } else if (!payload.text.isNullOrBlank()) {
            uploadToLibrary("shared_note_${System.currentTimeMillis()}.txt", "text/plain", payload.text.toByteArray(Charsets.UTF_8), "")
        }
    }

    fun signIn(email: String, password: String) {
        viewModelScope.launch {
            _state.update { it.copy(authLoading = true, authError = null) }
            try {
                val session = authApi.signInWithEmail(email, password)
                store.saveSession(session)
                _state.update { it.copy(session = session, authLoading = false) }
                refreshAccountData()
            } catch (err: Throwable) {
                _state.update { it.copy(authLoading = false, authError = err.message ?: "Ошибка входа") }
            }
        }
    }

    fun signUp(email: String, password: String, displayName: String) {
        viewModelScope.launch {
            _state.update { it.copy(authLoading = true, authError = null) }
            try {
                val session = authApi.signUpWithEmail(email, password, displayName)
                store.saveSession(session)
                _state.update { it.copy(session = session, authLoading = false) }
                refreshAccountData()
            } catch (err: Throwable) {
                _state.update { it.copy(authLoading = false, authError = err.message ?: "Ошибка регистрации") }
            }
        }
    }

    fun continueAsGuest() {
        val guest = AuthSession(
            uid = "local_${UUID.randomUUID().toString().replace("-", "").take(20)}",
            email = "",
            displayName = "Гость",
            idToken = "",
            refreshToken = "",
            expiresAtMs = Long.MAX_VALUE,
            isGuest = true
        )
        store.saveSession(guest)
        _state.update { it.copy(session = guest, authError = null) }
    }

    fun sendPasswordReset(email: String) {
        viewModelScope.launch {
            try {
                authApi.sendPasswordReset(email)
                _state.update { it.copy(toastMessage = "Ссылка для сброса пароля отправлена на $email") }
            } catch (err: Throwable) {
                _state.update { it.copy(authError = err.message ?: "Не удалось отправить письмо") }
            }
        }
    }

    fun signOut() {
        activeStreamJob?.cancel()
        store.clearSession()
        _state.update {
            it.copy(
                session = null,
                subscription = SubscriptionInfo(),
                libraryItems = emptyList(),
                memories = emptyList(),
                toastMessage = "Вы вышли из аккаунта"
            )
        }
    }

    private suspend fun freshToken(): String? {
        val cur = _state.value.session ?: return null
        if (cur.isGuest) return null
        val updated = runCatching { authApi.refreshSession(cur) }.getOrDefault(cur)
        if (updated.idToken != cur.idToken) {
            store.saveSession(updated)
            _state.update { it.copy(session = updated) }
        }
        return updated.idToken.takeIf { it.isNotBlank() }
    }

    fun refreshAccountData() {
        refreshSubscription()
        refreshLibrary()
        refreshMemories()
    }

    fun createNewChat() {
        val fresh = ChatThread("chat_${UUID.randomUUID().toString().take(8)}", "Новый чат", System.currentTimeMillis())
        store.upsertChat(fresh)
        _state.update {
            it.copy(chats = store.listChats(), activeChatId = fresh.id, messages = emptyList(), pendingAttachments = emptyList())
        }
    }

    fun openChat(chatId: String) {
        activeStreamJob?.cancel()
        _state.update {
            it.copy(activeChatId = chatId, messages = store.listMessages(chatId), isStreaming = false, streamStatus = null)
        }
    }

    fun deleteChat(chatId: String) {
        store.deleteChat(chatId)
        val remaining = store.listChats()
        if (remaining.isEmpty()) createNewChat()
        else {
            val nextId = if (_state.value.activeChatId == chatId) remaining.first().id else _state.value.activeChatId
            _state.update {
                it.copy(chats = remaining, activeChatId = nextId, messages = store.listMessages(nextId), outboxCount = store.listOutbox().size)
            }
        }
    }

    fun setModel(model: AiModelId) = _state.update { it.copy(selectedModel = model) }
    fun setAgent(agent: AgentRoleId) = _state.update { it.copy(selectedAgent = agent) }
    fun toggleWebSearch() = _state.update { it.copy(webSearchEnabled = !it.webSearchEnabled) }
    fun toggleReasoning() = _state.update { it.copy(reasoningEnabled = !it.reasoningEnabled) }
    fun addAttachment(attachment: ChatAttachment) = _state.update { it.copy(pendingAttachments = (it.pendingAttachments + attachment).take(4)) }
    fun removeAttachment(index: Int) = _state.update { it.copy(pendingAttachments = it.pendingAttachments.filterIndexed { i, _ -> i != index }) }

    fun stopStreaming() {
        activeStreamJob?.cancel()
        activeStreamJob = null
        _state.update { it.copy(isStreaming = false, streamStatus = null) }
    }

    fun sendMessage(rawText: String) {
        val text = rawText.trim()
        val attachments = _state.value.pendingAttachments
        if (text.isEmpty() && attachments.isEmpty()) return

        val chatId = _state.value.activeChatId.ifBlank {
            createNewChat()
            _state.value.activeChatId
        }
        val now = System.currentTimeMillis()
        val userMsgId = "m_u_${UUID.randomUUID().toString().take(8)}"
        val displayContent = text.ifBlank { "Проанализируй прикреплённые файлы" }
        val isOnline = _state.value.isOnline

        store.upsertMessage(
            ChatMessageItem(
                id = userMsgId,
                chatId = chatId,
                role = "user",
                content = displayContent,
                attachmentNames = attachments.map { it.name },
                createdAtMs = now,
                isQueuedOffline = !isOnline
            )
        )

        val currentThread = _state.value.chats.firstOrNull { it.id == chatId }
        val nextTitle = if (currentThread == null || currentThread.title == "Новый чат") displayContent.take(48) else currentThread.title
        store.upsertChat(ChatThread(chatId, nextTitle, now))

        val updatedMessages = store.listMessages(chatId)
        _state.update { it.copy(chats = store.listChats(), messages = updatedMessages, pendingAttachments = emptyList()) }

        val idemKey = "mob_${UUID.randomUUID().toString().replace("-", "").take(16)}"

        if (!isOnline) {
            store.enqueueOutbox(
                OutboxQueuedMessage(
                    id = "out_${UUID.randomUUID().toString().take(8)}",
                    chatId = chatId,
                    messageId = userMsgId,
                    text = displayContent,
                    modelId = _state.value.selectedModel.apiId,
                    agentId = _state.value.selectedAgent.apiId,
                    webSearch = _state.value.webSearchEnabled,
                    reasoning = _state.value.reasoningEnabled,
                    idempotencyKey = idemKey,
                    createdAtMs = now
                )
            )
            _state.update {
                it.copy(outboxCount = store.listOutbox().size, toastMessage = "Нет сети — сообщение добавлено в офлайн-очередь")
            }
            return
        }

        launchStreamForChat(
            chatId = chatId,
            history = updatedMessages,
            modelId = _state.value.selectedModel.apiId,
            agentId = _state.value.selectedAgent.apiId,
            webSearch = _state.value.webSearchEnabled,
            reasoning = _state.value.reasoningEnabled,
            attachments = attachments,
            idempotencyKey = idemKey
        )
    }

    private fun launchStreamForChat(
        chatId: String,
        history: List<ChatMessageItem>,
        modelId: String,
        agentId: String,
        webSearch: Boolean,
        reasoning: Boolean,
        attachments: List<ChatAttachment>,
        idempotencyKey: String
    ) {
        activeStreamJob?.cancel()
        val assistantId = "m_a_${UUID.randomUUID().toString().take(8)}"
        var assistantMsg = ChatMessageItem(id = assistantId, chatId = chatId, role = "assistant", content = "", createdAtMs = System.currentTimeMillis())
        store.upsertMessage(assistantMsg)
        _state.update { it.copy(messages = store.listMessages(chatId), isStreaming = true, streamStatus = "Подключение...") }

        activeStreamJob = viewModelScope.launch {
            try {
                val token = freshToken()
                api.streamChat(
                    token = token,
                    history = history,
                    modelApiId = modelId,
                    agentApiId = agentId,
                    webSearch = webSearch,
                    reasoning = reasoning,
                    attachments = attachments,
                    idempotencyKey = idempotencyKey,
                    callbacks = IGseekApiClient.StreamCallbacks(
                        onTextDelta = { chunk ->
                            assistantMsg = assistantMsg.copy(content = assistantMsg.content + chunk)
                            store.upsertMessage(assistantMsg)
                            if (_state.value.activeChatId == chatId) {
                                _state.update { st -> st.copy(messages = st.messages.map { if (it.id == assistantId) assistantMsg else it }, streamStatus = null) }
                            }
                        },
                        onReasoningDelta = { chunk ->
                            assistantMsg = assistantMsg.copy(reasoning = assistantMsg.reasoning + chunk)
                            store.upsertMessage(assistantMsg)
                            if (_state.value.activeChatId == chatId) {
                                _state.update { st -> st.copy(messages = st.messages.map { if (it.id == assistantId) assistantMsg else it }, streamStatus = "Размышляю...") }
                            }
                        },
                        onImageGenerated = { img ->
                            assistantMsg = assistantMsg.copy(images = assistantMsg.images + img)
                            store.upsertMessage(assistantMsg)
                            if (_state.value.activeChatId == chatId) {
                                _state.update { st -> st.copy(messages = st.messages.map { if (it.id == assistantId) assistantMsg else it }) }
                            }
                        },
                        onStatus = { status -> _state.update { it.copy(streamStatus = status) } }
                    )
                )
                if (assistantMsg.content.isBlank() && assistantMsg.images.isEmpty()) {
                    assistantMsg = assistantMsg.copy(content = "Ответ получен без текста.")
                    store.upsertMessage(assistantMsg)
                }
            } catch (err: Throwable) {
                val errText = err.message ?: "Не удалось связаться с сервером IGseek"
                assistantMsg = assistantMsg.copy(
                    content = if (assistantMsg.content.isBlank()) "Ошибка сети: $errText" else assistantMsg.content + "\n\n[Ошибка: $errText]",
                    isError = true
                )
                store.upsertMessage(assistantMsg)
            } finally {
                _state.update { it.copy(messages = store.listMessages(_state.value.activeChatId), isStreaming = false, streamStatus = null) }
            }
        }
    }

    private fun flushOfflineOutbox() {
        val pending = store.listOutbox()
        if (pending.isEmpty()) return
        viewModelScope.launch {
            val item = pending.first()
            val targetMsg = store.listMessages(item.chatId).firstOrNull { it.id == item.messageId }
            if (targetMsg != null) store.upsertMessage(targetMsg.copy(isQueuedOffline = false))
            store.removeOutbox(item.id)
            _state.update { it.copy(outboxCount = store.listOutbox().size) }
            launchStreamForChat(
                chatId = item.chatId,
                history = store.listMessages(item.chatId),
                modelId = item.modelId,
                agentId = item.agentId,
                webSearch = item.webSearch,
                reasoning = item.reasoning,
                attachments = emptyList(),
                idempotencyKey = item.idempotencyKey
            )
        }
    }

    fun transcribeVoiceBase64(base64Audio: String, onResult: (String) -> Unit) {
        viewModelScope.launch {
            try {
                val text = api.transcribeAudio(base64Audio)
                if (text.isNotBlank()) onResult(text)
                else _state.update { it.copy(toastMessage = "Речь не распознана") }
            } catch (err: Throwable) {
                _state.update { it.copy(toastMessage = err.message ?: "Ошибка распознавания речи") }
            }
        }
    }

    fun planFlowGoal(goal: String) {
        val clean = goal.trim()
        if (clean.length < 3) return
        viewModelScope.launch {
            _state.update { it.copy(flowState = FlowTaskState(goal = clean, isPlanning = true)) }
            try {
                val (title, steps) = api.planFlow(freshToken(), clean, _state.value.selectedModel.apiId, _state.value.selectedAgent.apiId)
                _state.update { it.copy(flowState = FlowTaskState(title = title, goal = clean, steps = steps)) }
            } catch (err: Throwable) {
                _state.update { it.copy(flowState = FlowTaskState(goal = clean, error = err.message ?: "Ошибка Flow")) }
            }
        }
    }

    fun runAllFlowSteps() {
        val current = _state.value.flowState
        if (current.steps.isEmpty() || current.isRunning) return
        viewModelScope.launch {
            _state.update { it.copy(flowState = it.flowState.copy(isRunning = true, error = null)) }
            val token = freshToken()
            val steps = current.steps.toMutableList()
            for (i in steps.indices) {
                if (steps[i].status == "done") continue
                steps[i] = steps[i].copy(status = "running")
                _state.update { it.copy(flowState = it.flowState.copy(steps = steps.toList())) }
                try {
                    val out = api.runFlowStep(token, current.goal, steps[i], steps.take(i), _state.value.selectedModel.apiId, _state.value.selectedAgent.apiId)
                    steps[i] = steps[i].copy(status = "done", output = out)
                } catch (err: Throwable) {
                    steps[i] = steps[i].copy(status = "error", output = err.message ?: "Ошибка шага")
                    _state.update { it.copy(flowState = it.flowState.copy(steps = steps.toList(), isRunning = false)) }
                    return@launch
                }
                _state.update { it.copy(flowState = it.flowState.copy(steps = steps.toList())) }
            }
            _state.update { it.copy(flowState = it.flowState.copy(isRunning = false), toastMessage = "Задача Flow завершена") }
        }
    }

    fun refreshLibrary() {
        viewModelScope.launch {
            val token = freshToken() ?: return@launch
            _state.update { it.copy(libraryLoading = true, libraryError = null) }
            try {
                val items = api.listLibrary(token)
                store.cacheLibraryFiles(items)
                _state.update { it.copy(libraryItems = items, libraryLoading = false) }
            } catch (err: Throwable) {
                _state.update { it.copy(libraryLoading = false, libraryError = err.message ?: "Ошибка синхронизации Library") }
            }
        }
    }

    fun uploadToLibrary(name: String, mimeType: String, bytes: ByteArray, dataUrl: String) {
        viewModelScope.launch {
            val token = freshToken()
            if (token == null) {
                _state.update { it.copy(toastMessage = "Войдите в аккаунт для сохранения файлов в облако") }
                return@launch
            }
            _state.update { it.copy(libraryLoading = true) }
            try {
                api.uploadLibraryFile(token, name, mimeType, bytes, dataUrl)
                refreshLibrary()
                _state.update { it.copy(toastMessage = "Файл «$name» сохранён в Library") }
            } catch (err: Throwable) {
                _state.update { it.copy(libraryLoading = false, toastMessage = err.message ?: "Ошибка загрузки файла") }
            }
        }
    }

    fun deleteFromLibrary(id: String) {
        viewModelScope.launch {
            val token = freshToken() ?: return@launch
            try {
                api.deleteLibraryFile(token, id)
                val updated = _state.value.libraryItems.filterNot { it.id == id }
                store.cacheLibraryFiles(updated)
                _state.update { it.copy(libraryItems = updated, toastMessage = "Файл удалён") }
            } catch (err: Throwable) {
                _state.update { it.copy(toastMessage = err.message ?: "Не удалось удалить файл") }
            }
        }
    }

    fun refreshMemories() {
        viewModelScope.launch {
            val token = freshToken() ?: return@launch
            _state.update { it.copy(memoryLoading = true, memoryError = null) }
            try {
                val items = api.listMemories(token)
                store.cacheMemories(items)
                _state.update { it.copy(memories = items, memoryLoading = false) }
            } catch (err: Throwable) {
                _state.update { it.copy(memoryLoading = false, memoryError = err.message ?: "Ошибка загрузки памяти") }
            }
        }
    }

    fun addMemory(content: String, kind: String) {
        if (content.isBlank()) return
        viewModelScope.launch {
            val token = freshToken()
            if (token == null) {
                _state.update { it.copy(toastMessage = "Войдите в аккаунт для облачной памяти") }
                return@launch
            }
            try {
                val items = api.saveMemory(token, content, kind)
                store.cacheMemories(items)
                _state.update { it.copy(memories = items, toastMessage = "Запись добавлена в память") }
            } catch (err: Throwable) {
                _state.update { it.copy(toastMessage = err.message ?: "Ошибка сохранения") }
            }
        }
    }

    fun deleteMemory(id: String) {
        viewModelScope.launch {
            val token = freshToken() ?: return@launch
            try {
                api.deleteMemory(token, id)
                val next = _state.value.memories.filterNot { it.id == id }
                store.cacheMemories(next)
                _state.update { it.copy(memories = next) }
            } catch (err: Throwable) {
                _state.update { it.copy(toastMessage = err.message ?: "Ошибка удаления") }
            }
        }
    }

    fun refreshSubscription() {
        viewModelScope.launch {
            _state.update { it.copy(subscriptionLoading = true) }
            val info = runCatching { api.fetchSubscription(freshToken()) }.getOrDefault(SubscriptionInfo())
            _state.update { it.copy(subscription = info, subscriptionLoading = false) }
        }
    }

    fun startProCheckout(paymentMethod: Int) {
        viewModelScope.launch {
            val session = _state.value.session
            val token = freshToken()
            if (session == null || token == null) {
                _state.update { it.copy(toastMessage = "Войдите в аккаунт для оформления Pro") }
                return@launch
            }
            _state.update { it.copy(subscriptionLoading = true) }
            try {
                val bucket = System.currentTimeMillis() / (5 * 60_000L)
                val idemKey = "and_${session.uid.take(12)}_m${paymentMethod}_b$bucket"
                val (txnId, url) = api.createSubscriptionCheckout(token, session.email, paymentMethod, idemKey)
                _state.update {
                    it.copy(
                        subscriptionLoading = false,
                        subscription = it.subscription.copy(pendingTxnId = txnId, status = "pending"),
                        checkoutUrlEvent = url
                    )
                }
            } catch (err: Throwable) {
                _state.update { it.copy(subscriptionLoading = false, toastMessage = err.message ?: "Ошибка оплаты") }
            }
        }
    }

    fun verifyPendingSubscription() {
        viewModelScope.launch {
            val token = freshToken() ?: return@launch
            _state.update { it.copy(subscriptionLoading = true) }
            try {
                val updated = api.verifySubscriptionPayment(token, _state.value.subscription.pendingTxnId)
                _state.update {
                    it.copy(
                        subscription = updated,
                        subscriptionLoading = false,
                        toastMessage = if (updated.isPro) "Подписка IGseek Pro активна!" else "Оплата пока не подтверждена"
                    )
                }
            } catch (err: Throwable) {
                _state.update { it.copy(subscriptionLoading = false, toastMessage = err.message ?: "Ошибка проверки") }
            }
        }
    }

    fun updateLayoutPrefs(transform: (MobileLayoutPrefs) -> MobileLayoutPrefs) {
        val next = transform(_state.value.layoutPrefs)
        store.saveLayoutPrefs(next)
        _state.update { it.copy(layoutPrefs = next) }
    }

    fun setAccent(accent: AccentPresetId) = updateLayoutPrefs { it.copy(accent = accent) }

    fun moveTabOrder(fromIndex: Int, toIndex: Int) {
        val cur = _state.value.layoutPrefs.tabOrder.toMutableList()
        if (fromIndex !in cur.indices || toIndex !in cur.indices) return
        val item = cur.removeAt(fromIndex)
        cur.add(toIndex, item)
        updateLayoutPrefs { it.copy(tabOrder = cur) }
    }

    fun updateServerBaseUrl(url: String) {
        val cleaned = url.trim().trimEnd('/')
        if (!cleaned.startsWith("https://") && !cleaned.startsWith("http://")) {
            _state.update { it.copy(toastMessage = "URL должен начинаться с https://") }
            return
        }
        store.setServerBaseUrl(cleaned)
        _state.update { it.copy(serverBaseUrl = cleaned, toastMessage = "Сервер API обновлён") }
        refreshAccountData()
    }
}
